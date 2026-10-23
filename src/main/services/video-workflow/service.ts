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
  stageUnlocked,
  validatePayload,
  type VideoStage,
  type StoryboardPayload,
  type WorkflowJob,
  type WorkflowVoice,
  type VideoPlatform,
  type WorkflowFile,
  validateMotionPlan,
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
import { motionPrompt, motionScenes, prepareMotionScene } from './motion'

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
  motionPlanJobId?: string
}
export class VideoWorkflowService {
  readonly repository: VideoWorkflowRepository
  readonly files: WorkflowFiles
  readonly runtime: WorkflowRuntimeManager
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
  }
  private notify(id: string) {
    this.changed(id)
    return this.repository.get(id)
  }
  private async verifyInputs(projectId: string, stage: VideoStage, includeCurrent = false) {
    const project = this.repository.get(projectId)
    const index = VIDEO_STAGES.indexOf(stage)
    if (index < 0) throw new Error('未知工作流阶段')
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
    const validated = validatePayload(stage, payload)
    await this.files.verifyPayload(projectId, validated)
    await this.verifyInputs(projectId, stage)
    this.repository.save(projectId, stage, validated, expected, requestId)
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
    await this.verifyInputs(projectId, stage, true)
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
      !['copy', 'storyboard', 'narration', 'audio', 'roughcut', 'render'].includes(input.stage) ||
      !['codex', 'claude', 'template'].includes(input.executor)
    )
      throw new Error('未知生成任务')
    if (
      input.executor === 'template' &&
      !['storyboard', 'audio', 'roughcut', 'render'].includes(input.stage)
    )
      throw new Error('该步骤需要 CLI 或人工导入')
    const project = this.repository.get(input.projectId)
    if (project.revision !== input.expectedRevision) throw new Error('项目已更新，请刷新后重试')
    if (!stageUnlocked(project, input.stage)) throw new Error('请先审核通过所有前置步骤')
    await this.verifyInputs(project.id, input.stage)
    if ((input.modification || input.motionPlanJobId) && input.stage !== 'roughcut')
      throw new Error('修改计划仅用于粗剪')
    if (input.modification && input.motionPlanJobId) throw new Error('请先生成计划，再确认应用')
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
          !motionScenes(project).some((scene) => scene.id === input.modification!.sceneId)))
    )
      throw new Error('请检查修改意见、分镜和定位时间')
    const motion = input.motionPlanJobId
      ? this.repository.motionPlan(project.id, input.motionPlanJobId, input.expectedRevision)
      : undefined
    const job = this.repository.startJob(
      project.id,
      input.stage,
      input.expectedRevision,
      input.requestId,
      imports ? 'manual-audio' : input.executor,
      fingerprint({ ...input, imports }),
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
        if (input.modification) {
          phase('分析修改意见，规划逐镜元素动效')
          const raw = (await runAgent(
            input.executor as 'codex' | 'claude',
            runtime,
            cwd,
            motionPrompt(
              project,
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
          const plan = validateMotionPlan({ ...raw, ...input.modification }, motionScenes(project))
          if (!input.modification.sceneId && plan.scenes.length !== motionScenes(project).length)
            throw new Error('整片修改计划必须逐镜覆盖所有分镜，请重新生成')
          const scenes = stageValue(project, 'storyboard')!
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
        } else if (input.stage === 'audio') {
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
            progress: (progress) => {
              controller.signal.throwIfAborted()
              if (this.stopped) throw new Error('任务已停止')
              this.repository.updateAudioProgress(job.id, progress)
              this.changed(project.id)
            },
          })
        } else if (input.stage === 'roughcut' || input.stage === 'render') {
          let renderMotion = motion
          const templateId = stageValue(project, 'storyboard')?.styleTemplateId
          if (
            !renderMotion &&
            input.stage === 'roughcut' &&
            !stageValue(project, 'roughcut') &&
            templateId
          ) {
            const template = this.repository.template(templateId)
            if (template.motion) {
              phase('将模板动效风格适配到当前分镜元素')
              const raw = (await runAgent(
                runtime.codexPath ? 'codex' : 'claude',
                runtime,
                cwd,
                motionPrompt(
                  project,
                  `复用模板的动效节奏与语言，选择当前分镜中真实存在的元素，按当前配音时长适配。模板样本：${JSON.stringify(template.motion)}`,
                  0,
                ),
                controller.signal,
              )) as Record<string, unknown>
              renderMotion = validateMotionPlan(
                { ...raw, feedback: '复用已选择模板的动效风格', at: 0 },
                motionScenes(project),
              )
            }
          }
          payload = await renderWorkflow({
            project,
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
              agentPrompt(
                project,
                input.stage as 'copy' | 'storyboard' | 'narration',
                settings,
                references,
                input.sceneId,
              ),
              controller.signal,
            )
            if (input.stage === 'storyboard') {
              const generated = validatePayload('storyboard', payload)
              if (input.sceneId) {
                const existing = stageValue(project, 'storyboard')
                if (
                  !existing ||
                  generated.scenes.length !== 1 ||
                  generated.scenes[0].id !== input.sceneId ||
                  !existing.scenes.some((scene) => scene.id === input.sceneId)
                )
                  throw new Error('单镜重绘必须仅返回指定的分镜 ID')
                generated.scenes = existing.scenes.map((scene) =>
                  scene.id === input.sceneId ? generated.scenes[0] : scene,
                )
              }
              payload = {
                ...generated,
                ...settings,
                scenes: generated.scenes,
                mode: 'agent',
                referenceSnapshots: snapshots,
              }
            }
          }
        }
        controller.signal.throwIfAborted()
        if (this.stopped) throw new Error('应用正在退出')
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
  async dispose() {
    this.stopped = true
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
    if (!['copy', 'storyboard', 'narration'].includes(input.stage))
      throw new Error('该步骤不支持导出 CLI 任务')
    const project = this.repository.get(input.projectId)
    if (!stageUnlocked(project, input.stage) || project.revision !== input.expectedRevision)
      throw new Error('请先审核前置步骤并刷新项目')
    await this.verifyInputs(project.id, input.stage)
    const directory = join(destination, `video-task-${input.stage}-${randomUUID().slice(0, 8)}`)
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      join(directory, 'task.md'),
      agentPrompt(
        project,
        input.stage as 'copy' | 'storyboard' | 'narration',
        input.settings ?? {},
        '',
        input.sceneId,
      ) + '\n保存为 result.json，然后回到 MyDashboard 导入结果。',
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
