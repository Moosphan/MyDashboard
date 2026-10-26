import type Database from 'better-sqlite3'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  VideoWorkflowRepository,
  fingerprint,
} from '../../database/repositories/video-workflow-repository'
import {
  VIDEO_STAGES,
  stageValue,
  renderSourceProject,
  stageUnlocked,
  validatePayload,
  type VideoStage,
  type StoryboardPayload,
  type WorkflowJob,
  type WorkflowVoice,
  type VideoPlatform,
  type WorkflowFile,
  validateMotionPlan,
  type PublicationGeneration,
  audioSourceRevisions,
  canReuseAudio,
  storyboardMotionReadiness,
  sceneMotionEnabled,
  isMaterialBlocker,
  retainMaterialFallback,
  type WorkflowRevision,
} from '../../../shared/video-workflow'
import type { VoiceoverService } from '../voiceover/voiceover-service'
import { WorkflowFiles } from './files'
import { WorkflowRuntimeManager, runAgent } from './cli'
import {
  agentPrompt,
  safeStoryboardDocument,
  sceneHtml,
  templateStoryboard,
  styleTemplateReference,
} from './storyboard'
import { snapshotReference } from './references'
import { createWorkflowAudio } from './audio'
import { renderWorkflow } from './render'
import {
  motionPrompt,
  motionScenes,
  prepareMotionScene,
  shouldGenerateInitialMotion,
  hasExplicitMotionRequirements,
  storyboardMotionPlan,
  verifyStoryboardMotion,
} from './motion'
import { publicationBase, publicationOptions, publicationPrompt } from './publish'
import { copyFeedback, copyPrompt } from './copy'
import { PlatformPublishingService } from './bilibili'
import type { BilibiliCategory } from '../../../shared/bilibili-publishing'

export interface WorkflowGeneration {
  projectId: string
  stage: VideoStage
  expectedRevision: number
  requestId: string
  executor: 'codex' | 'claude' | 'template'
  settings?: Partial<StoryboardPayload>
  sceneId?: string
  voice?: WorkflowVoice
  modification?: { feedback: string; at: number; sceneId?: string }
  storyboardModification?: { feedback: string; sceneId: string }
  motionPlanJobId?: string
  publication?: PublicationGeneration
  copyFeedback?: string
  audioTrackId?: string
  reuseNarration?: boolean
}
function retainedRequirements(previous: string | undefined, feedback: string | undefined) {
  if (
    !feedback?.trim() ||
    previous === feedback.trim() ||
    previous?.endsWith('\n' + feedback.trim())
  )
    return previous
  return [previous, feedback.trim()].filter(Boolean).join('\n')
}
export class VideoWorkflowService {
  readonly repository: VideoWorkflowRepository
  readonly files: WorkflowFiles
  readonly runtime: WorkflowRuntimeManager
  readonly publishing: PlatformPublishingService
  readonly douyinPublishing: PlatformPublishingService
  private running = new Map<string, { controller: AbortController; promise: Promise<void> }>()
  private stopped = false
  constructor(
    readonly root: string,
    db: Database.Database,
    private voiceover: () => VoiceoverService,
    private changed: (projectId: string) => void = () => {},
  ) {
    this.repository = new VideoWorkflowRepository(db)
    this.repository.recover()
    this.files = new WorkflowFiles(root, this.repository)
    this.runtime = new WorkflowRuntimeManager(root)
    this.publishing = new PlatformPublishingService(
      root,
      db,
      this.repository,
      this.files,
      () => this.runtime.get(),
      changed,
    )
    this.douyinPublishing = new PlatformPublishingService(
      root,
      db,
      this.repository,
      this.files,
      () => this.runtime.get(),
      changed,
      'douyin',
    )
  }
  private notify(id: string) {
    this.changed(id)
    return this.repository.get(id)
  }
  private async verifyInputs(
    projectId: string,
    stage: VideoStage,
    includeCurrent = false,
    project = this.repository.get(projectId),
  ) {
    const index = VIDEO_STAGES.indexOf(stage)
    if (index < 0) throw new Error('未知工作流阶段')
    if (stage === 'render') {
      if (project.stages.roughcut)
        await this.files.verifyPayload(projectId, project.stages.roughcut.payload)
      if (includeCurrent && project.stages.render)
        await this.files.verifyPayload(projectId, project.stages.render.payload)
      return
    }
    for (const dependency of VIDEO_STAGES.slice(0, index + (includeCurrent ? 1 : 0)))
      if (project.stages[dependency])
        await this.files.verifyPayload(projectId, project.stages[dependency]!.payload)
  }
  async save(
    projectId: string,
    stage: VideoStage,
    payload: unknown,
    expected: number,
    requestId: string,
  ) {
    if (!['brief', 'copy', 'storyboard', 'narration', 'publish'].includes(stage))
      throw new Error('媒体步骤需通过生成或导入创建')
    let validated = validatePayload(stage, payload)
    if (stage === 'storyboard')
      validated = retainMaterialFallback(
        stageValue(this.repository.get(projectId), 'storyboard'),
        validated as StoryboardPayload,
      )
    if (stage === 'storyboard')
      await verifyStoryboardMotion(validated as StoryboardPayload, new AbortController().signal)
    await this.files.verifyPayload(projectId, validated)
    await this.verifyInputs(projectId, stage)
    this.repository.save(projectId, stage, validated, expected, requestId)
    return this.notify(projectId)
  }
  async acceptIllustration(projectId: string, expected: number, requestId: string) {
    const project = this.repository.get(projectId)
    const requestKey = `illustration:${requestId}`
    const previous = this.repository.db
      .prepare('SELECT project_id,fingerprint FROM video_workflow_requests WHERE request_id=?')
      .get(requestKey) as { project_id: string; fingerprint: string } | undefined
    if (previous) {
      const revision = project.history.find(
        (item) =>
          item.stage === 'storyboard' &&
          previous.fingerprint === fingerprint(['save', 'storyboard', item.payload]),
      )
      if (
        previous.project_id !== projectId ||
        !revision ||
        !project.jobs.some(
          (job) =>
            job.requestId === `edit:${requestKey}` &&
            job.expectedRevision === expected &&
            job.operation?.action === 'accept-illustration',
        )
      )
        throw new Error('请求 ID 已用于不同操作')
      return this.notify(projectId)
    }
    if (project.revision !== expected) throw new Error('项目已更新，请刷新后重试')
    if (project.archived) throw new Error('项目已归档，请先恢复')
    if (project.jobs.some((job) => job.state === 'running'))
      throw new Error('请等待当前任务结束再接受素材降级')
    const storyboard = stageValue(project, 'storyboard')
    if (!storyboard) throw new Error('尚未生成分镜')
    const gaps = storyboardMotionReadiness(storyboard).blockers.filter((issue) =>
      isMaterialBlocker(issue.message),
    )
    if (!gaps.length) throw new Error('当前没有可接受的素材缺口')
    const sceneIds = new Set(gaps.map((issue) => issue.sceneId))
    for (const scene of storyboard.scenes.filter((item) => sceneIds.has(item.id))) {
      if (sceneMotionEnabled(storyboard, scene.id) && !scene.motion?.effects.length)
        throw new Error(`请先补齐「${scene.title}」动效计划，素材降级不能替代 MG 动画`)
      const prepared = await prepareMotionScene(
        sceneHtml(scene, storyboard.template),
        'illustration-check',
        [],
        new AbortController().signal,
      )
      if (!prepared.illustrationLabel)
        throw new Error(`「${scene.title}」缺少可见的原创示意图或原创意象图标注，请先补上标注`)
    }
    const acceptedAt = new Date().toISOString()
    const payload = {
      ...storyboard,
      scenes: storyboard.scenes.map((item) =>
        sceneIds.has(item.id)
          ? {
              ...item,
              materialFallback: {
                acceptedAt,
                blockers: item.motion!.blockers.filter(isMaterialBlocker),
              },
            }
          : item,
      ),
    }
    await verifyStoryboardMotion(payload, new AbortController().signal)
    await this.files.verifyPayload(projectId, payload)
    await this.verifyInputs(projectId, 'storyboard')
    this.repository.save(
      projectId,
      'storyboard',
      payload,
      expected,
      requestKey,
      '用户明确接受当前所有素材缺口降级为已标注的原创示意图；保留现有画面、MG 动画及原素材缺口供追溯',
    )
    return this.notify(projectId)
  }
  async approve(
    projectId: string,
    stage: VideoStage,
    revisionId: string,
    expected: number,
    requestId: string,
    note: string,
  ) {
    const project = this.repository.get(projectId)
    if (stage === 'storyboard' && project.stages.storyboard) {
      const readiness = storyboardMotionReadiness(stageValue(project, 'storyboard')!)
      if (stageValue(project, 'storyboard')!.motionPolicy?.enabled && readiness.unplanned.length)
        throw new Error(
          `以下分镜未生成 MG 计划，请在创作设置中生成候选后审核：${readiness.unplanned.join('、')}`,
        )
      if (readiness.blockers.length)
        throw new Error(
          `请先补齐分镜动效或素材，再审核：${readiness.blockers.map((issue) => `${issue.sceneId}：${issue.message}`).join('；')}`,
        )
      await verifyStoryboardMotion(stageValue(project, 'storyboard')!, new AbortController().signal)
    }
    const reuseRequest = `audio-reuse:${requestId}`
    const previousReuse =
      stage === 'audio' &&
      this.repository.db
        .prepare('SELECT id FROM video_workflow_jobs WHERE request_id=?')
        .get(reuseRequest)
    if (previousReuse) {
      this.repository.startJob(
        projectId,
        'audio',
        expected,
        reuseRequest,
        'reuse-audio',
        fingerprint([revisionId, expected]),
      )
      return this.notify(projectId)
    }
    await this.verifyInputs(projectId, stage, true)
    if (stage === 'audio' && project.stages.audio?.status === 'stale') {
      if (project.revision !== expected || project.stages.audio.id !== revisionId)
        throw new Error('审核版本已发生变化，请刷新后重试')
      this.assertReusableAudio(project, project.stages.audio)
      this.repository.db.transaction(() => {
        const job = this.repository.startJob(
          projectId,
          'audio',
          expected,
          reuseRequest,
          'reuse-audio',
          fingerprint([revisionId, expected]),
          { action: 'reuse-audio', sourceVersion: project.stages.audio!.version },
        )
        const rebound = this.repository.finishJob(job.id, project.stages.audio!.payload)
        this.repository.approve(
          projectId,
          'audio',
          rebound.stages.audio!.id,
          rebound.revision,
          requestId,
          typeof note === 'string' ? note : '',
        )
      })()
      return this.notify(projectId)
    }
    this.repository.approve(
      projectId,
      stage,
      revisionId,
      expected,
      requestId,
      typeof note === 'string' ? note : '',
    )
    return this.notify(projectId)
  }
  async generate(input: WorkflowGeneration, imports?: string[]): Promise<WorkflowJob> {
    if (this.stopped) throw new Error('工作流正在退出')
    if (
      !input ||
      !['copy', 'storyboard', 'narration', 'audio', 'roughcut', 'render', 'publish'].includes(
        input.stage,
      ) ||
      !['codex', 'claude', 'template'].includes(input.executor)
    )
      throw new Error('未知生成任务')
    if (
      input.executor === 'template' &&
      !(input.stage === 'narration' && input.reuseNarration === true) &&
      !['storyboard', 'audio', 'roughcut', 'render'].includes(input.stage)
    )
      throw new Error('该步骤需要 CLI 或人工导入')
    const project = this.repository.get(input.projectId)
    const motionProject =
      input.modification || input.motionPlanJobId ? renderSourceProject(project) : project
    const existingNarration = stageValue(project, 'narration')
    const storyboard = stageValue(project, 'storyboard')
    const motionStoryboard = stageValue(motionProject, 'storyboard')
    if (
      input.stage === 'storyboard' &&
      input.executor === 'template' &&
      (input.settings ?? storyboard)?.motionPolicy?.enabled
    ) {
      const runtime = this.runtime.get()
      if (!runtime.codexPath && !runtime.claudePath)
        throw new Error('自动 MG 需要配置 Codex CLI 或 Claude Code，再生成分镜候选')
      input = { ...input, executor: runtime.codexPath ? 'codex' : 'claude' }
    }
    if (
      input.reuseNarration !== undefined &&
      (input.reuseNarration !== true || input.stage !== 'narration' || input.sceneId || imports)
    )
      throw new Error('沿用口播仅用于完整口播稿')
    if (
      input.sceneId !== undefined &&
      (!['storyboard', 'narration'].includes(input.stage) ||
        typeof input.sceneId !== 'string' ||
        !storyboard?.scenes.some((scene) => scene.id === input.sceneId))
    )
      throw new Error('请选择有效的目标分镜')
    if (input.stage === 'narration' && (input.sceneId || input.reuseNarration)) {
      if (
        !existingNarration ||
        existingNarration.scenes.map((scene) => scene.id).join() !==
          storyboard?.scenes.map((scene) => scene.id).join()
      )
        throw new Error('分镜数量或顺序已变化，请先生成完整口播稿再进行单镜修改或沿用')
    }
    const previousAudio = stageValue(project, 'audio')
    if (
      input.audioTrackId !== undefined &&
      (input.stage !== 'audio' ||
        imports ||
        typeof input.audioTrackId !== 'string' ||
        project.stages.audio?.status === 'stale' ||
        !previousAudio?.tracks.some((track) => track.file.id === input.audioTrackId))
    )
      throw new Error('请选择当前完整配音中的有效片段，单段重生成仅用于配音阶段')
    if (project.revision !== input.expectedRevision) throw new Error('项目已更新，请刷新后重试')
    if (!stageUnlocked(project, input.stage)) throw new Error('请先审核通过所有前置步骤')
    if (
      input.stage === 'roughcut' &&
      !input.motionPlanJobId &&
      project.jobs.some(
        (job) =>
          job.stage === 'roughcut' &&
          job.kind === 'motion-plan' &&
          job.state === 'succeeded' &&
          job.expectedRevision === input.expectedRevision &&
          Boolean(job.motionPlan),
      )
    )
      throw new Error('存在待确认的动效计划，请点击确认计划，生成粗剪')
    const publication =
      input.stage === 'publish' ? publicationOptions(input.publication) : undefined
    const feedback = input.stage === 'copy' ? copyFeedback(input.copyFeedback) : undefined
    await this.verifyInputs(project.id, input.stage, Boolean(input.audioTrackId), motionProject)
    if ((input.modification || input.motionPlanJobId) && input.stage !== 'roughcut')
      throw new Error('修改计划仅用于粗剪')
    if (input.modification && input.motionPlanJobId) throw new Error('请先生成计划，再确认应用')
    if (input.storyboardModification && input.stage !== 'storyboard')
      throw new Error('分镜修改意见仅用于分镜阶段')
    if (input.storyboardModification && input.modification)
      throw new Error('请分别提交分镜修改意见和动效修改计划')
    if (
      input.storyboardModification &&
      (!['codex', 'claude'].includes(input.executor) ||
        input.sceneId !== input.storyboardModification.sceneId ||
        typeof input.storyboardModification.feedback !== 'string' ||
        !input.storyboardModification.feedback.trim() ||
        input.storyboardModification.feedback.length > 5000 ||
        !stageValue(project, 'storyboard')?.scenes.some(
          (scene) => scene.id === input.storyboardModification!.sceneId,
        ))
    )
      throw new Error('请检查分镜修改意见和目标分镜')
    if (
      input.modification &&
      (!stageValue(project, 'roughcut') || !['codex', 'claude'].includes(input.executor))
    )
      throw new Error('请先生成粗剪，并选择本地 Agent')
    if (
      input.modification &&
      (typeof input.modification.feedback !== 'string' ||
        !input.modification.feedback.trim() ||
        input.modification.feedback.length > 5000 ||
        !Number.isFinite(input.modification.at) ||
        input.modification.at < 0 ||
        input.modification.at > 300 ||
        (input.modification.sceneId &&
          !motionScenes(motionProject).some((scene) => scene.id === input.modification!.sceneId)))
    )
      throw new Error('请检查修改意见、分镜和定位时间')
    const motion = input.motionPlanJobId
      ? this.repository.motionPlan(project.id, input.motionPlanJobId, input.expectedRevision)
      : undefined
    if (
      input.modification &&
      motionStoryboard?.motionPolicy &&
      (!motionStoryboard.scenes.some((scene) => sceneMotionEnabled(motionStoryboard, scene.id)) ||
        (input.modification.sceneId &&
          !sceneMotionEnabled(motionStoryboard, input.modification.sceneId)))
    )
      throw new Error('MG 已关闭或目标分镜已排除，请先调整分镜创作设置再修改动效')
    const needsInitialMotion =
      input.stage === 'roughcut' &&
      !motion &&
      !input.modification &&
      shouldGenerateInitialMotion(project)
    const preparedMotion = needsInitialMotion ? storyboardMotionPlan(project) : undefined
    const initialMotion = needsInitialMotion && !preparedMotion
    if (initialMotion) {
      const runtime = this.runtime.get()
      if (!runtime.codexPath && !runtime.claudePath)
        throw new Error(
          '已要求 MG 动效，请先在执行环境配置 Codex CLI 或 Claude Code；不会使用默认动效替代创作要求',
        )
    }
    const job = this.repository.startJob(
      project.id,
      input.stage,
      input.expectedRevision,
      input.requestId,
      imports ? 'manual-audio' : input.executor,
      fingerprint({ ...input, imports }),
      input.reuseNarration
        ? { action: 'reuse-narration', sourceVersion: project.stages.narration?.version }
        : input.sceneId
          ? {
              action: 'scene-generate',
              sceneId: input.sceneId,
              sceneTitle: storyboard?.scenes.find((scene) => scene.id === input.sceneId)?.title,
              sceneNumber: storyboard!.scenes.findIndex((scene) => scene.id === input.sceneId) + 1,
              feedback: input.storyboardModification?.feedback,
              sourceVersion: project.stages[input.stage]?.version,
            }
          : undefined,
    )
    if (job.state !== 'running' || this.running.has(job.id)) return job
    if (input.modification) this.repository.markMotionJob(job.id)
    const controller = new AbortController()
    const promise = Promise.resolve().then(async () => {
      const cwd = join(this.root, 'cache', 'video-workflow', job.id)
      mkdirSync(cwd, { recursive: true })
      const phase = (message: string) => {
        if (!controller.signal.aborted && !this.stopped) {
          this.repository.updateJob(job.id, { phase: message })
          this.changed(project.id)
        }
      }
      try {
        let payload: unknown
        const runtime = this.runtime.get()
        if (input.reuseNarration) {
          phase('沿用现有逐镜口播，关联当前已审核分镜，不调用 AI 或配音')
          payload = existingNarration
        } else if (input.modification) {
          phase('分析修改意见，规划逐镜元素动效')
          const raw = (await runAgent(
            input.executor as 'codex' | 'claude',
            runtime,
            cwd,
            motionPrompt(
              motionProject,
              input.modification.feedback,
              input.modification.at,
              input.modification.sceneId,
            ),
            controller.signal,
          )) as Record<string, unknown>
          if (raw.requiresUpstream)
            throw new Error(
              `需要回到前置阶段修改：${String(raw.reason ?? '请检查文案、口播或镜头时长')}`,
            )
          const plan = validateMotionPlan(
            { ...raw, ...input.modification },
            motionScenes(motionProject),
          )
          const scenes = stageValue(motionProject, 'storyboard')!
          if (plan.scenes.some((scene) => !sceneMotionEnabled(scenes, scene.sceneId)))
            throw new Error('修改计划包含已排除的分镜，请重新生成计划')
          if (
            !input.modification.sceneId &&
            plan.scenes.length !==
              scenes.scenes.filter((scene) => sceneMotionEnabled(scenes, scene.id)).length
          )
            throw new Error('整片修改计划必须逐镜覆盖所有未排除分镜，请重新生成')
          for (const scene of plan.scenes) {
            phase('校验动效目标与分镜时长')
            const source = scenes.scenes.find((item) => item.id === scene.sceneId)!
            const prepared = await prepareMotionScene(
              sceneHtml(source, scenes.template),
              'check-scene',
              scene.effects.map((effect) => effect.selector),
              controller.signal,
            ).catch((error: Error) => {
              throw new Error(`分镜「${source.title}」：${error.message}`)
            })
            if (prepared.counts.some((count) => count === 0))
              throw new Error(`分镜「${source.title}」存在找不到的动效元素，请调整意见后重试`)
          }
          controller.signal.throwIfAborted()
          this.repository.finishMotionPlan(job.id, plan)
          return
        } else if (publication) {
          let categories: BilibiliCategory[] = []
          if (publication.platform === 'bilibili') {
            phase('读取 B 站投稿分区；不可用时保留分区建议供人工核对')
            categories = await this.publishing.categories().catch(() => [])
            controller.signal.throwIfAborted()
          }
          phase(
            `等待 ${input.executor === 'codex' ? 'Codex' : 'Claude Code'} 生成${publication.platform === 'bilibili' ? ' Bilibili ' : '抖音'}发布资料与投稿设置`,
          )
          const metadata = await runAgent(
            input.executor as 'codex' | 'claude',
            runtime,
            cwd,
            publicationPrompt(project, publication, categories),
            controller.signal,
          )
          phase('校验发布资料与投稿设置，保存待审核版本')
          const publicationPayload = validatePayload('publish', {
            platforms: { ...publicationBase(project).platforms, [publication.platform]: metadata },
          })
          payload = publicationPayload
          const settings = publicationPayload.platforms[publication.platform].submission
          if (!settings || !settings.categoryName || !settings.visibility)
            throw new Error('AI 未完整生成投稿分区、可见性与类型设置，请重新生成')
          if (!settings.copyright && !settings.source)
            throw new Error('AI 未说明稿件类型或待核实的来源，请重新生成')
          if (
            settings?.category &&
            !categories.some((category) => category.id === settings.category && category.parentId)
          )
            throw new Error('AI 返回的投稿分区未经核验，请重新生成或连接平台后选择实际子分区')
          const selectedCategory = categories.find((category) => category.id === settings.category)
          if (selectedCategory)
            settings.categoryName = `${categories.find((parent) => parent.id === selectedCategory.parentId)?.name ?? '分区'} / ${selectedCategory.name}`
        } else if (input.stage === 'audio') {
          if (input.audioTrackId && previousAudio) {
            this.repository.updateAudioProgress(job.id, {
              tracks: previousAudio.tracks,
              total: previousAudio.tracks.length,
              regeneratingTrackId: input.audioTrackId,
            })
            this.changed(project.id)
          }
          payload = await createWorkflowAudio({
            project,
            job,
            voice: input.voice ?? { engine: 'edge', voiceId: 'zh-CN-XiaoxiaoNeural', options: {} },
            service: this.voiceover(),
            files: this.files,
            runtime,
            cwd,
            signal: controller.signal,
            phase,
            imports,
            audioTrackId: input.audioTrackId,
            progress: (progress) => {
              controller.signal.throwIfAborted()
              if (this.stopped) throw new Error('任务已停止')
              this.repository.updateAudioProgress(
                job.id,
                input.audioTrackId && previousAudio
                  ? {
                      tracks: [
                        ...progress.tracks,
                        ...previousAudio.tracks.slice(progress.tracks.length),
                      ],
                      total: previousAudio.tracks.length,
                      regeneratingTrackId: input.audioTrackId,
                    }
                  : progress,
              )
              this.changed(project.id)
            },
          })
        } else if (input.stage === 'roughcut' || input.stage === 'render') {
          let renderMotion = motion ?? preparedMotion
          if (preparedMotion) phase('复用已审核分镜动效，按实测配音时长编译')
          const templateId = stageValue(project, 'storyboard')?.styleTemplateId
          if (
            !renderMotion &&
            !stageValue(project, 'storyboard')?.motionPolicy &&
            input.stage === 'roughcut' &&
            (initialMotion || (!stageValue(project, 'roughcut') && templateId))
          ) {
            const templateMotion = templateId
              ? this.repository.template(templateId).motion
              : undefined
            if (initialMotion || templateMotion) {
              phase(
                initialMotion
                  ? '按创作要求与逐镜 MG 说明编排元素动效'
                  : '将模板动效风格适配到当前分镜元素',
              )
              const requirements = initialMotion
                ? '执行创作简报、文案和最新分镜中的 MG 动效要求'
                : '复用已选择模板的动效风格'
              const raw = (await runAgent(
                runtime.codexPath ? 'codex' : 'claude',
                runtime,
                cwd,
                motionPrompt(
                  project,
                  `${requirements}。${templateMotion ? `复用模板的动效节奏与语言，选择当前分镜中真实存在的元素，按当前配音时长适配。模板样本：${JSON.stringify(templateMotion)}` : ''}`,
                  0,
                  undefined,
                  { initial: true },
                ),
                controller.signal,
              )) as Record<string, unknown>
              if (raw.requiresUpstream)
                throw new Error(
                  `需要回到前置阶段修改：${String(raw.reason ?? '请检查分镜元素与动效要求')}`,
                )
              renderMotion = validateMotionPlan(
                { ...raw, feedback: requirements, at: 0 },
                motionScenes(project),
              )
              if (renderMotion.scenes.length !== motionScenes(project).length)
                throw new Error('初始动效计划必须覆盖所有分镜，不能用默认动效补齐，请重新生成')
            }
          }
          payload = await renderWorkflow({
            project: input.motionPlanJobId ? motionProject : project,
            final: input.stage === 'render',
            files: this.files,
            runtime,
            cwd,
            signal: controller.signal,
            phase,
            motion: renderMotion,
          })
        } else {
          const rawSettings =
            input.stage === 'storyboard'
              ? (input.settings ?? stageValue(project, 'storyboard') ?? {})
              : {}
          const settings: Partial<StoryboardPayload> =
            input.stage === 'storyboard'
              ? validatePayload('storyboard', {
                  mode: 'agent',
                  template: 'technical',
                  ...rawSettings,
                  scenes: [
                    { id: 'settings', title: '设置校验', body: '设置校验', layout: 'title' },
                  ],
                })
              : {}
          delete settings.scenes
          if (input.stage === 'storyboard' && input.executor === 'template')
            payload = templateStoryboard(project, settings)
          else {
            const snapshots: WorkflowFile[] = []
            let references = ''
            if (settings.styleTemplateId) {
              const template = this.repository.template(settings.styleTemplateId)
              references += styleTemplateReference(template)
            }
            if (settings.referenceFile) {
              await this.files.verify(project.id, settings.referenceFile)
              references += this.files.text(settings.referenceFile)
            }
            for (const url of settings.references ?? []) {
              phase('冻结参考网页快照')
              const html = await snapshotReference(url, controller.signal)
              snapshots.push(await this.files.write(project.id, html, '.html'))
              references += `\n来源：${url}\n${html}`
            }
            phase(
              `等待 ${input.executor === 'codex' ? 'Codex' : 'Claude Code'} 生成；生成后需人工审核`,
            )
            payload = await runAgent(
              input.executor as 'codex' | 'claude',
              runtime,
              cwd,
              input.stage === 'copy'
                ? copyPrompt(project, feedback)
                : agentPrompt(
                    project,
                    input.stage as 'storyboard' | 'narration',
                    settings,
                    references,
                    input.sceneId,
                    input.storyboardModification?.feedback,
                  ),
              controller.signal,
            )
            if (input.stage === 'storyboard') {
              const generated = retainMaterialFallback(
                undefined,
                validatePayload('storyboard', payload),
              )
              if (input.sceneId) {
                const existing = stageValue(project, 'storyboard')
                if (
                  !existing ||
                  generated.scenes.length !== 1 ||
                  generated.scenes[0].id !== input.sceneId ||
                  !existing.scenes.some((scene) => scene.id === input.sceneId)
                )
                  throw new Error('单镜重绘必须仅返回指定的分镜 ID')
                const original = existing.scenes.find((scene) => scene.id === input.sceneId)!
                const unchanged = (['title', 'body', 'layout', 'html'] as const).every(
                  (key) => original[key] === generated.scenes[0][key],
                )
                if (input.storyboardModification && unchanged)
                  throw new Error('AI 没有对所选分镜作出实际修改，原版本已保留，请细化意见后重试')
                generated.scenes = existing.scenes.map((scene) =>
                  scene.id === input.sceneId
                    ? {
                        ...generated.scenes[0],
                        requirements: retainedRequirements(
                          scene.requirements,
                          input.storyboardModification?.feedback,
                        ),
                      }
                    : scene,
                )
              }
              payload = {
                ...generated,
                ...settings,
                scenes: generated.scenes,
                mode: 'agent',
                referenceSnapshots: snapshots,
              }
            } else if (input.stage === 'narration' && input.sceneId) {
              const generated = validatePayload('narration', payload)
              if (generated.scenes.length !== 1 || generated.scenes[0].id !== input.sceneId)
                throw new Error('单镜口播必须仅返回指定的分镜 ID')
              payload = {
                scenes: existingNarration!.scenes.map((scene) =>
                  scene.id === input.sceneId ? generated.scenes[0] : scene,
                ),
              }
            } else if (input.stage === 'copy') {
              payload = {
                ...validatePayload('copy', payload),
                requirements: retainedRequirements(
                  stageValue(project, 'copy')?.requirements,
                  feedback,
                ),
              }
            }
          }
        }
        controller.signal.throwIfAborted()
        if (this.stopped) throw new Error('应用正在退出')
        if (input.stage === 'storyboard' && input.executor !== 'template') {
          const candidate = validatePayload('storyboard', payload)
          const target = input.sceneId
            ? {
                ...candidate,
                scenes: candidate.scenes.filter((scene) => scene.id === input.sceneId),
              }
            : candidate
          if (
            hasExplicitMotionRequirements({
              ...project,
              stages: {
                ...project.stages,
                storyboard: { ...project.stages.storyboard!, payload: candidate },
              },
            }) &&
            storyboardMotionReadiness(target).unplanned.length
          )
            throw new Error(
              '分镜未提供可校验的逐元素 MG 计划，不能仅凭注释标记完成；请在创作设置中重新生成分镜候选',
            )
          phase('校验分镜动效目标与素材缺口')
          await verifyStoryboardMotion(target, controller.signal)
          payload = candidate
        }
        await this.files.verifyPayload(project.id, payload)
        this.repository.finishJob(job.id, payload)
      } catch (error) {
        const previous = this.repository.job(job.id)
        if (previous?.state === 'running')
          this.repository.updateJob(job.id, {
            state: controller.signal.aborted ? 'cancelled' : 'failed',
            phase: controller.signal.aborted
              ? '已取消'
              : input.modification
                ? '动效计划生成失败，请查看错误详情后重试'
                : '生成失败，可重试或人工导入',
            error: (error as Error).message,
          })
      } finally {
        rmSync(cwd, { recursive: true, force: true })
        this.running.delete(job.id)
        this.changed(project.id)
      }
    })
    this.running.set(job.id, { controller, promise })
    this.changed(project.id)
    return this.repository.job(job.id)!
  }
  async cancel(id: string) {
    const job = this.repository.job(id)
    if (!job) throw new Error('任务不存在')
    const active = this.running.get(id)
    if (job.state === 'running')
      this.repository.updateJob(id, { state: 'cancelled', phase: '已取消，正在清理进程' })
    active?.controller.abort()
    await active?.promise
    return this.notify(job.projectId)
  }
  async discardMotionPlans(projectId: string, expected: number) {
    const project = this.repository.get(projectId)
    if (project.revision !== expected) throw new Error('项目已更新，请刷新后重试')
    if (project.jobs.some((job) => job.state === 'running' && job.kind !== 'motion-plan'))
      throw new Error('请先等待或取消正在执行的任务')
    for (const job of project.jobs.filter(
      (job) => job.state === 'running' && job.kind === 'motion-plan',
    ))
      await this.cancel(job.id)
    if (project.stages.roughcut?.status === 'stale' && stageUnlocked(project, 'roughcut')) {
      const roughcut = stageValue(project, 'roughcut')!
      await this.files.verifyPayload(projectId, roughcut)
      if (
        fingerprint(
          roughcut.compositionFiles.map((file, index) => [
            roughcut.compositionNames[index],
            file.sha256,
          ]),
        ) !== roughcut.manifestHash
      )
        throw new Error('原粗剪的冻结工程指纹不一致，无法恢复审核')
    }
    this.repository.discardMotionPlans(projectId, expected)
    return this.notify(projectId)
  }
  async dispose() {
    this.stopped = true
    await Promise.all([this.publishing.dispose(), this.douyinPublishing.dispose()])
    for (const item of this.running.values()) item.controller.abort()
    await Promise.allSettled([...this.running.values()].map((item) => item.promise))
    this.repository.recover()
  }
  async importStage(projectId: string, stage: VideoStage, expected: number, path: string) {
    const project = this.repository.get(projectId)
    const stat = (await import('node:fs')).statSync(path)
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error('仅支持 4 MB 以内的文本文件')
    const content = readFileSync(path, 'utf8')
    let payload: unknown
    if (stage === 'copy') payload = path.endsWith('.json') ? JSON.parse(content) : { text: content }
    else if (stage === 'storyboard' && /\.html?$/i.test(path))
      payload = {
        mode: 'agent',
        template: stageValue(project, 'storyboard')?.template ?? 'technical',
        scenes: [
          {
            id: randomUUID(),
            title: basename(path),
            body: '从 HTML 文件导入；静态安全预览',
            layout: 'title',
            html: content,
          },
        ],
      }
    else payload = JSON.parse(content)
    return this.save(projectId, stage, payload, expected, randomUUID())
  }
  async preview(projectId: string, storyboard: unknown, sceneId: string) {
    const payload = validatePayload('storyboard', storyboard)
    await this.files.verifyPayload(projectId, payload)
    const scene = payload.scenes.find((item) => item.id === sceneId)
    if (!scene) throw new Error('分镜不存在')
    return safeStoryboardDocument(sceneHtml(scene, payload.template))
  }
  async restoreAudioVersion(
    projectId: string,
    revisionId: string,
    expected: number,
    requestId: string,
  ) {
    const project = this.repository.get(projectId)
    const revision = project.history.find((item) => item.id === revisionId)
    if (!revision || revision.stage !== 'audio') throw new Error('分段配音版本不存在')
    if (project.stages.audio?.id === revisionId && revision.status !== 'stale') return project
    if (project.jobs.some((job) => job.state === 'running'))
      throw new Error('请先等待或取消当前配音任务')
    this.assertReusableAudio(project, revision)
    const payload = validatePayload('audio', revision.payload)
    await this.verifyInputs(projectId, 'audio')
    await this.files.verifyPayload(projectId, payload)
    this.repository.save(
      projectId,
      'audio',
      payload,
      expected,
      requestId,
      `从分段配音 v${revision.version} 切换`,
    )
    return this.notify(projectId)
  }
  private assertReusableAudio(
    project: ReturnType<VideoWorkflowRepository['get']>,
    revision: WorkflowRevision,
  ) {
    const source = audioSourceRevisions(project, revision)
    if (
      !canReuseAudio(project, revision) ||
      !source ||
      fingerprint(source.map((item) => item.id)) !== revision.dependencies
    )
      throw new Error(
        '该版本来源无法核实或口播内容已变化（正文、读音或分镜顺序不一致），请重新生成对应配音',
      )
  }
  async saveTemplate(projectId: string, expected: number, name: string, description: string) {
    await this.verifyInputs(projectId, 'render', true)
    return this.repository.saveTemplate(projectId, expected, name, description)
  }
  async exportComposition(projectId: string, stage: 'roughcut' | 'render', destination: string) {
    if (!['roughcut', 'render'].includes(stage)) throw new Error('请选择视频工程')
    const project = this.repository.get(projectId)
    const render = stageValue(project, stage)
    if (!render) throw new Error('请先生成视频')
    await this.files.verifyPayload(projectId, render)
    const directory = join(
      destination,
      `video-project-${project.stages[stage]!.version}-${randomUUID().slice(0, 8)}`,
    )
    mkdirSync(directory, { recursive: true })
    try {
      const safe = validatePayload(stage, render)
      for (const [index, file] of safe.compositionFiles.entries())
        copyFileSync(
          await this.files.verify(projectId, file),
          join(directory, safe.compositionNames[index]),
        )
      writeFileSync(
        join(directory, 'hyperframes.json'),
        JSON.stringify({ name: basename(directory) }, null, 2),
      )
      writeFileSync(
        join(directory, 'README.txt'),
        '该目录是可编辑工程副本，不会修改 MyDashboard 已审核版本。使用已配置的 HyperFrames 0.8.181 运行 preview --background 打开 Studio；编辑后可在 Studio 导出或通过 render 导出。工程修改需要重新审核，当前不自动回导。',
      )
      return directory
    } catch (error) {
      rmSync(directory, { recursive: true, force: true })
      throw error
    }
  }
  async exportTask(input: WorkflowGeneration, destination: string) {
    if (!['copy', 'storyboard', 'narration', 'publish'].includes(input.stage))
      throw new Error('该步骤不支持导出 CLI 任务')
    const project = this.repository.get(input.projectId)
    if (!stageUnlocked(project, input.stage) || project.revision !== input.expectedRevision)
      throw new Error('请先审核前置步骤并刷新项目')
    await this.verifyInputs(project.id, input.stage)
    const publication =
      input.stage === 'publish' ? publicationOptions(input.publication) : undefined
    const feedback = input.stage === 'copy' ? copyFeedback(input.copyFeedback) : undefined
    const directory = join(destination, `video-task-${input.stage}-${randomUUID().slice(0, 8)}`)
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      join(directory, 'task.md'),
      (publication
        ? publicationPrompt(project, publication) +
          '\n将输出放入 result.example.json 对应平台的资料中，保留另一平台，保存完整结构到 result.json。'
        : input.stage === 'copy'
          ? copyPrompt(project, feedback)
          : agentPrompt(
              project,
              input.stage as 'storyboard' | 'narration',
              input.settings ?? {},
              '',
              input.sceneId,
            )) + '\n保存为 result.json，然后回到 MyDashboard 导入结果。',
    )
    if (publication)
      writeFileSync(
        join(directory, 'result.example.json'),
        JSON.stringify(publicationBase(project), null, 2),
      )
    writeFileSync(
      join(directory, 'approved-inputs.json'),
      JSON.stringify(
        { projectId: project.id, revision: project.revision, stages: project.stages },
        null,
        2,
      ),
    )
    if (input.settings?.referenceFile)
      copyFileSync(
        await this.files.verify(project.id, input.settings.referenceFile),
        join(directory, 'reference.html'),
      )
    return directory
  }
  async exportPublication(projectId: string, platform: VideoPlatform, destination: string) {
    if (!['bilibili', 'douyin'].includes(platform)) throw new Error('未知发布平台')
    const project = this.repository.get(projectId)
    if (project.stages.publish?.status !== 'approved' || !stageUnlocked(project, 'publish'))
      throw new Error('请先审核最终成片与发布信息')
    await this.verifyInputs(projectId, 'publish', true)
    const render = stageValue(project, 'render')!,
      audio = stageValue(project, 'audio')!,
      metadata = stageValue(project, 'publish')!.platforms[platform]
    const directory = join(destination, `${platform}-${randomUUID().slice(0, 8)}`)
    mkdirSync(directory, { recursive: true })
    try {
      for (const [name, file] of [
        ['video.mp4', render.file],
        ['cover.png', render.cover],
        ['subtitles.srt', audio.subtitles],
      ] as const)
        copyFileSync(await this.files.verify(projectId, file), join(directory, name))
      writeFileSync(join(directory, 'metadata.json'), JSON.stringify(metadata, null, 2))
      writeFileSync(
        join(directory, 'manifest.json'),
        JSON.stringify(
          {
            schemaVersion: 1,
            projectId,
            revisionId: project.stages.publish.id,
            videoSha256: render.file.sha256,
            platform,
            createdAt: new Date().toISOString(),
            metadata,
          },
          null,
          2,
        ),
      )
      writeFileSync(
        join(directory, 'README.txt'),
        '请手动上传 video.mp4，并使用 cover.png、metadata.json 和 subtitles.srt。上传成功后，将发布链接回填到 MyDashboard。导出发布包不代表平台发布成功。',
      )
      this.repository.publication(
        projectId,
        platform,
        project.stages.publish.id,
        metadata,
        directory,
      )
      this.changed(projectId)
      return directory
    } catch (error) {
      rmSync(directory, { recursive: true, force: true })
      throw error
    }
  }
}
