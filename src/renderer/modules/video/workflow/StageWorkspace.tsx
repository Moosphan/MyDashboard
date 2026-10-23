import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { VoiceInput, VoiceTextArea } from '../components/voiceover/VoiceControls'
import { VoiceSelect } from '../components/voiceover/VoiceEngineFields'
import {
  VIDEO_STAGES,
  VIDEO_STAGE_LABELS,
  stageUnlocked,
  stageValue,
  type StagePayloads,
  type VideoProject,
  type VideoStage,
  type WorkflowJob,
  type WorkflowVoice,
  type VideoPlatform,
} from '@shared/video-workflow'
import { workflowCall, useWorkflowDraft } from './useWorkflow'
import { revisionStatus } from './StepView'
import { StoryboardEditor } from './StoryboardEditor'
import { AudioPanel, PublishingPanel, RenderPanel } from './MediaPanels'
import { WorkflowDialog } from './WorkflowDialog'
import { ExecutionLog } from './ExecutionLog'

const stageDescriptions: Record<VideoStage, string> = {
  brief: '定义主题、目标观众、核心观点与目标时长。',
  copy: '围绕已确认简报组织内容，审核事实、结构与信息密度。',
  storyboard: '先看清每一镜，再确认统一视觉与叙事节奏。',
  narration: '结合已审核文案与分镜生成逐镜口播，编辑确认后再进入配音。',
  audio: '逐镜生成或导入配音，试听并确认字幕与真实时长。',
  roughcut: '组合已审核的画面、声音与字幕，检查整体观感。',
  render: '使用冻结粗剪工程输出最终横版视频。',
  publish: '分别确认平台信息，导出发布包并记录发布结果。',
}
export function StageWorkspace({
  project,
  stage,
  onProject,
  onNext,
  refresh,
  onVoiceover,
  restoredPayload,
}: {
  project: VideoProject
  stage: VideoStage
  onProject: (project: VideoProject) => void
  onNext: () => void
  refresh: () => Promise<void>
  onVoiceover: () => void
  restoredPayload?: StagePayloads[VideoStage]
}) {
  const draft = useWorkflowDraft(project, stage, restoredPayload)
  const { payload: pendingPayload, reset: resetDraft } = draft
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [review, setReview] = useState(false),
    [note, setNote] = useState(''),
    [impact, setImpact] = useState(false),
    [activeScene, setActiveScene] = useState(0)
  const [executor, setExecutor] = useState('codex')
  const [publishPlatform, setPublishPlatform] = useState<VideoPlatform>('bilibili')
  const [publishFeedback, setPublishFeedback] = useState({ bilibili: '', douyin: '' })
  const [voice, setVoice] = useState<WorkflowVoice>(
    () =>
      stageValue(project, 'audio')?.voice ?? {
        engine: 'edge',
        voiceId: 'zh-CN-XiaoxiaoNeural',
        options: {},
      },
  )
  const [pending, setPending] = useState<{ id: string; payload: StagePayloads[VideoStage] } | null>(
    null,
  )
  const approveButton = useRef<HTMLButtonElement>(null)
  const saveButton = useRef<HTMLButtonElement>(null)
  const revision = project.stages[stage],
    unlocked = stageUnlocked(project, stage),
    running = project.jobs.find((job) => job.state === 'running')
  const editable = ['brief', 'copy', 'storyboard', 'narration', 'publish'].includes(stage)
  useEffect(() => {
    const job = pending && project.jobs.find((item) => item.id === pending.id)
    if (job?.state === 'succeeded' && pendingPayload === pending?.payload) {
      resetDraft(project)
      setPending(null)
    } else if (job && job.state !== 'running') setPending(null)
  }, [project, pending, pendingPayload, resetDraft])
  useEffect(() => {
    const pauseOthers = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLMediaElement)) return
      document.querySelectorAll<HTMLMediaElement>('audio,video').forEach((media) => {
        if (media !== target) media.pause()
      })
    }
    document.addEventListener('play', pauseOthers, true)
    return () => document.removeEventListener('play', pauseOthers, true)
  }, [])
  const run = async (action: () => Promise<unknown>, success = '') => {
    if (busy) return false
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await action()
      if (result !== null && success) setMessage(success)
      await refresh()
      return true
    } catch (failure) {
      setError((failure as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }
  const save = () =>
    run(async () => {
      const result = await workflowCall<VideoProject>(
        'save',
        project.id,
        stage,
        draft.payload,
        draft.expected,
        crypto.randomUUID(),
      )
      draft.reset(result)
      onProject(result)
      setImpact(false)
    }, '草稿已保存，等待人工审核')
  const generationInput = (sceneId?: string, settings?: StagePayloads['storyboard']) => ({
    projectId: project.id,
    stage,
    expectedRevision: project.revision,
    requestId: crypto.randomUUID(),
    executor:
      (stage === 'storyboard' &&
        (settings ?? (draft.payload as StagePayloads['storyboard'])).mode === 'template') ||
      ['audio', 'roughcut', 'render'].includes(stage)
        ? 'template'
        : executor,
    settings: stage === 'storyboard' ? (settings ?? draft.payload) : undefined,
    sceneId,
    voice,
    publication:
      stage === 'publish'
        ? { platform: publishPlatform, feedback: publishFeedback[publishPlatform] }
        : undefined,
  })
  const generate = (sceneId?: string, settings?: StagePayloads['storyboard']) => {
    if (stage === 'publish' && draft.dirty) {
      setError('请先保存或放弃当前发布资料的修改，再生成新版本。')
      return Promise.resolve(false)
    }
    if (sceneId && draft.dirty) {
      setError('单镜重绘基于已保存分镜，请先保存当前修改。')
      return Promise.resolve(false)
    }
    return run(async () => {
      const job = await workflowCall<WorkflowJob>('generate', generationInput(sceneId, settings))
      setPending({ id: job.id, payload: draft.payload })
    })
  }
  const importStage = () =>
    run(async () => {
      const result = await workflowCall<VideoProject | null>(
        'import',
        project.id,
        stage,
        project.revision,
      )
      if (result) {
        draft.reset(result)
        onProject(result)
      }
      return result
    }, '结果已导入，等待人工审核')
  const approve = () =>
    run(async () => {
      const result = await workflowCall<VideoProject>(
        'approve',
        project.id,
        stage,
        revision!.id,
        project.revision,
        crypto.randomUUID(),
        note,
      )
      draft.reset(result)
      onProject(result)
      setReview(false)
    }, '当前版本已审核通过，可继续下一步')
  const canApprove =
    unlocked &&
    revision &&
    revision.status !== 'approved' &&
    revision.status !== 'stale' &&
    !draft.dirty &&
    !running &&
    !busy
  const status = revision ? revisionStatus[revision.status] : '待开始'
  const previousStage = VIDEO_STAGES[VIDEO_STAGES.indexOf(stage) - 1]
  const storyboard = stageValue(project, 'storyboard')
  const narrationScene = (draft.payload as StagePayloads['narration']).scenes?.[activeScene]
  const checks = {
    brief: '目标、受众与资料',
    copy: '事实、结构与表达',
    storyboard: '文字、布局与镜头顺序',
    narration: '术语、停顿与画面对应',
    audio: '每段发音与衔接',
    roughcut: '字幕、音画与整体节奏',
    render: '完整观看与文件规格',
    publish: '标题、封面与发布链接',
  }
  const generationControls = (
    <div className="workflow-section">
      <VoiceSelect
        label="本地执行器"
        value={executor}
        onChange={setExecutor}
        options={[
          { value: 'codex', label: 'Codex CLI' },
          { value: 'claude', label: 'Claude Code CLI' },
        ]}
      />
      <div className="workflow-actions">
        <Button
          size="sm"
          variant="ghost"
          disabled={!unlocked || busy || Boolean(running) || (stage === 'publish' && draft.dirty)}
          onClick={() =>
            void run(
              () => workflowCall('exportTask', generationInput()),
              '任务已导出，可在本地 CLI 执行后导入 result.json',
            )
          }
        >
          导出创作任务
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!unlocked || busy || Boolean(running) || draft.dirty}
          onClick={() => void importStage()}
        >
          导入结果
        </Button>
      </div>
      {!['narration', 'publish'].includes(stage) && (
        <Button
          size="sm"
          variant="secondary"
          disabled={!unlocked || busy || Boolean(running) || draft.conflict}
          onClick={() => generate()}
        >
          {stage === 'storyboard' &&
          (draft.payload as StagePayloads['storyboard']).mode === 'template'
            ? '生成模板分镜'
            : revision
              ? '重新生成'
              : '交给 Agent 生成'}
        </Button>
      )}
    </div>
  )
  return (
    <div className="workflow-stage-shell" aria-busy={busy} data-workflow-stage={stage}>
      {!unlocked && (
        <p className="workflow-notice">
          {project.archived
            ? '项目已归档，可返回项目列表恢复。'
            : '请先在前置步骤中审核通过当前版本。这里保留已有内容供查看。'}
        </p>
      )}
      {draft.conflict && (
        <div className="workflow-notice">
          项目已有新版本，当前未保存内容仍被保留。请核对新的前置内容后继续。
          <div className="flex flex-wrap gap-2 mt-2">
            <Button size="sm" variant="secondary" onClick={draft.rebase}>
              保留草稿，使用最新依赖
            </Button>
            <Button size="sm" variant="ghost" onClick={() => draft.reset()}>
              载入最新版本并放弃本地草稿
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="workflow-error">
          {error}
        </p>
      )}
      {draft.storageError && (
        <p role="alert" className="workflow-error">
          本地草稿存储不可用。当前输入仍在页面中，请及时保存草稿。
        </p>
      )}
      {message && (
        <p role="status" className="workflow-notice">
          {message}
        </p>
      )}
      <div className="workflow-body">
        <div className="workflow-content">
          <Card className="workflow-artifact-card">
            <div className="workflow-section">
              {stage !== 'storyboard' && (
                <div className="workflow-stage-heading">
                  <div>
                    <h3 className="workflow-section-title">
                      {stage === 'brief'
                        ? '把想法说清楚'
                        : stage === 'narration'
                          ? '逐镜口播稿'
                          : stage === 'audio'
                            ? '逐段配音，逐段确认'
                            : stage === 'roughcut'
                              ? '音画合成预览'
                              : stage === 'render'
                                ? '横版正式成片'
                                : stage === 'publish'
                                  ? '一份成片，分别发布'
                                  : VIDEO_STAGE_LABELS[stage]}
                    </h3>
                    <p className="workflow-muted mt-2">{stageDescriptions[stage]}</p>
                  </div>
                  {stage === 'narration' && (
                    <Button
                      size="sm"
                      data-narration-generate
                      disabled={
                        !unlocked || busy || Boolean(running) || draft.dirty || draft.conflict
                      }
                      onClick={() => generate()}
                    >
                      {project.jobs.some(
                        (job) => job.stage === 'narration' && job.state === 'running',
                      )
                        ? 'AI 正在生成口播…'
                        : revision
                          ? 'AI 重新生成口播稿'
                          : 'AI 生成口播稿'}
                    </Button>
                  )}
                </div>
              )}
              <fieldset
                disabled={
                  busy ||
                  (!unlocked &&
                    !['storyboard', 'narration', 'roughcut', 'render', 'publish'].includes(stage))
                }
                className="min-w-0 workflow-section"
              >
                {stage === 'brief' && (
                  <>
                    <VoiceInput label="视频标题" value={project.title} readOnly />
                    <VoiceTextArea
                      label="想法与创作简报"
                      rows={5}
                      value={(draft.payload as StagePayloads['brief']).text}
                      onChange={(event) =>
                        draft.update({
                          ...(draft.payload as StagePayloads['brief']),
                          text: event.target.value,
                        })
                      }
                      placeholder="你想讲什么？给谁看？观众看完应理解什么？"
                    />
                    <div className="workflow-fields">
                      <VoiceInput
                        label="目标受众"
                        value={(draft.payload as StagePayloads['brief']).audience ?? ''}
                        maxLength={500}
                        onChange={(event) =>
                          draft.update({
                            ...(draft.payload as StagePayloads['brief']),
                            audience: event.target.value,
                          })
                        }
                      />
                      <VoiceInput
                        label="目标时长（秒，最多 300 秒）"
                        type="number"
                        min={10}
                        max={300}
                        value={(draft.payload as StagePayloads['brief']).duration}
                        onChange={(event) =>
                          draft.update({
                            ...(draft.payload as StagePayloads['brief']),
                            duration: Number(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="workflow-facts">
                      <span>横版成片</span>
                      <span>Bilibili · 抖音</span>
                      <span>逐步人工审核</span>
                    </div>
                    <VoiceTextArea
                      label="参考资料"
                      rows={3}
                      maxLength={15000}
                      value={(draft.payload as StagePayloads['brief']).references ?? ''}
                      onChange={(event) =>
                        draft.update({
                          ...(draft.payload as StagePayloads['brief']),
                          references: event.target.value,
                        })
                      }
                      placeholder="可填写资料链接、来源和必须覆盖的事实。"
                    />
                  </>
                )}
                {stage === 'copy' && (
                  <>
                    <VoiceTextArea
                      label="视频内容文案"
                      rows={15}
                      value={(draft.payload as StagePayloads['copy']).text}
                      onChange={(event) => draft.update({ text: event.target.value })}
                      placeholder="可直接撰写、导入 Markdown，或交给 Agent 生成。"
                    />
                    <p className="workflow-muted">
                      审核检查：核心观点明确 · 事实有出处 · 适合 5 分钟以内表达。
                    </p>
                  </>
                )}
                {stage === 'storyboard' && (
                  <StoryboardEditor
                    projectId={project.id}
                    value={draft.payload as StagePayloads['storyboard']}
                    onChange={draft.update}
                    disabled={!unlocked || busy}
                    onRegenerate={generate}
                    onCreate={(settings, sceneId) => generate(sceneId, settings)}
                    narration={stageValue(project, 'narration')}
                  />
                )}
                {stage === 'narration' && (
                  <div className="workflow-section">
                    <div className="workflow-muted" data-narration-sources>
                      <p>
                        生成依据：内容文案 v{project.stages.copy?.version ?? '—'} ＋ HTML 分镜 v
                        {project.stages.storyboard?.version ?? '—'}
                        {' · '}
                        {storyboard?.scenes.length ?? 0} 镜{' · '}目标{' '}
                        {stageValue(project, 'brief')?.duration ?? '—'} 秒
                      </p>
                      <p>
                        {unlocked
                          ? '沿用右侧本地执行器，生成后逐镜人工审核。'
                          : '请先审核通过文案与分镜，再生成口播。'}
                      </p>
                      {draft.dirty && <p>有未保存的口播修改，请先保存或放弃修改，再重新生成。</p>}
                    </div>
                    {storyboard && (
                      <VoiceSelect
                        label="当前分镜"
                        value={String(activeScene)}
                        onChange={(value) => setActiveScene(Number(value))}
                        options={storyboard.scenes.map((scene, index) => ({
                          value: String(index),
                          label: String(index + 1).padStart(2, '0') + ' · ' + scene.title,
                        }))}
                      />
                    )}
                    {narrationScene &&
                      [narrationScene].map((scene) => (
                        <div key={scene.id}>
                          <VoiceTextArea
                            disabled={!unlocked || busy || Boolean(running)}
                            label={`${String(activeScene + 1).padStart(2, '0')} · ${stageValue(project, 'storyboard')?.scenes.find((item) => item.id === scene.id)?.title ?? '分镜'} 的口播`}
                            rows={8}
                            value={scene.text}
                            onChange={(event) =>
                              draft.update({
                                scenes: (draft.payload as StagePayloads['narration']).scenes.map(
                                  (item) =>
                                    item.id === scene.id
                                      ? { ...item, text: event.target.value }
                                      : item,
                                ),
                              })
                            }
                          />
                          <div className="mt-4">
                            <VoiceInput
                              label="读音与停顿"
                              value={scene.pronunciation ?? ''}
                              maxLength={2000}
                              disabled={!unlocked || busy || Boolean(running)}
                              onChange={(event) =>
                                draft.update({
                                  scenes: (draft.payload as StagePayloads['narration']).scenes.map(
                                    (item) =>
                                      item.id === scene.id
                                        ? { ...item, pronunciation: event.target.value }
                                        : item,
                                  ),
                                })
                              }
                              placeholder="仅用于人工校对，不作为朗读文本"
                            />
                          </div>
                          <p className="workflow-muted mt-2">
                            {Array.from(scene.text).length} 字符 · 约{' '}
                            {Math.ceil(Array.from(scene.text).length / 3.5)} 秒（以配音实测为准）
                          </p>
                        </div>
                      ))}
                    {!(draft.payload as StagePayloads['narration']).scenes.length && (
                      <p className="workflow-notice">先审核分镜，再生成逐镜口播。</p>
                    )}
                  </div>
                )}
                {stage === 'audio' && (
                  <>
                    <AudioPanel
                      project={project}
                      voice={voice}
                      onVoice={setVoice}
                      onConfigure={onVoiceover}
                      disabled={busy}
                    />
                  </>
                )}
                {(stage === 'roughcut' || stage === 'render') && (
                  <>
                    <RenderPanel
                      project={project}
                      final={stage === 'render'}
                      disabled={busy || !unlocked}
                      run={run}
                    />
                  </>
                )}
                {stage === 'publish' && (
                  <PublishingPanel
                    disabled={!unlocked || busy || Boolean(running)}
                    project={project}
                    platform={publishPlatform}
                    onPlatform={setPublishPlatform}
                    feedback={publishFeedback[publishPlatform]}
                    onFeedback={(value) =>
                      setPublishFeedback((current) => ({ ...current, [publishPlatform]: value }))
                    }
                    canGenerate={unlocked && !busy && !running && !draft.dirty && !draft.conflict}
                    generating={running?.stage === 'publish'}
                    dirty={draft.dirty}
                    onGenerate={() => void generate()}
                    value={draft.payload as StagePayloads['publish']}
                    onChange={draft.update}
                    approved={revision?.status === 'approved' && !draft.dirty && !busy && !running}
                    run={(action, success) => {
                      void run(action, success)
                    }}
                  />
                )}
              </fieldset>
            </div>
          </Card>
        </div>
        <aside className="workflow-aside" aria-label="人工审核与任务">
          <Card>
            <div className="workflow-section workflow-review-info">
              <div>
                <div className="workflow-toolbar">
                  <h3 className="workflow-section-title">当前审核</h3>
                  <Badge variant={revision?.status === 'stale' ? 'urgent' : 'low'}>{status}</Badge>
                </div>
                <p className="workflow-muted">
                  {VIDEO_STAGE_LABELS[stage]} · {revision ? `v${revision.version}` : '未保存'}
                </p>
              </div>
              <div className="workflow-inspector-item">
                <span>采用的输入</span>
                <strong>
                  {previousStage
                    ? `${VIDEO_STAGE_LABELS[previousStage]} v${project.stages[previousStage]?.version ?? '—'}`
                    : '用户想法与参考资料'}
                </strong>
              </div>
              <div className="workflow-inspector-item">
                <span>生成方式</span>
                <strong>
                  {['roughcut', 'render'].includes(stage)
                    ? 'HyperFrames'
                    : stage === 'audio'
                      ? '配音引擎 / 音频导入'
                      : stage === 'brief'
                        ? '人工编辑'
                        : stage === 'storyboard' &&
                            (draft.payload as StagePayloads['storyboard']).mode === 'template'
                          ? '视觉模板'
                          : executor === 'codex'
                            ? 'Codex CLI / 人工导入'
                            : 'Claude Code CLI / 人工导入'}
                </strong>
              </div>
              <div className="workflow-inspector-item">
                <span>审核关注</span>
                <p>{checks[stage]}</p>
              </div>
              {revision?.approvedAt && (
                <p className="workflow-muted">
                  通过于 {new Date(revision.approvedAt).toLocaleString()}
                </p>
              )}
              <Button
                ref={approveButton}
                size="sm"
                disabled={!canApprove}
                onClick={() => setReview(true)}
              >
                审核通过此版本
              </Button>
              {draft.dirty && <p className="workflow-muted">请先保存修改，再审核当前版本。</p>}
            </div>
          </Card>
          <section className="workflow-task-section" aria-label="执行任务">
            <div className="workflow-section">
              <div>
                <h3 className="workflow-section-title">任务与执行</h3>
                <p className="workflow-muted">{VIDEO_STAGE_LABELS[stage]} · 仅执行已获准阶段</p>
              </div>
              <ExecutionLog
                key={`${project.id}:${stage}`}
                jobs={project.jobs.filter((job) => job.stage === stage)}
                busy={busy}
                onCancel={(id) => void run(() => workflowCall('cancel', id))}
              />
              {['copy', 'storyboard', 'narration', 'publish'].includes(stage) && generationControls}
              {stage === 'audio' && (
                <fieldset disabled={!unlocked || busy} className="workflow-section">
                  {' '}
                  <div className="flex gap-3 flex-wrap">
                    <Button size="sm" disabled={Boolean(running)} onClick={() => generate()}>
                      生成逐镜配音
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={Boolean(running)}
                      onClick={() => void run(() => workflowCall('importAudio', generationInput()))}
                    >
                      导入逐镜音频
                    </Button>
                  </div>
                </fieldset>
              )}
              {(stage === 'roughcut' || stage === 'render') && (
                <fieldset disabled={!unlocked || busy} className="workflow-section">
                  {' '}
                  <Button
                    size="sm"
                    className="justify-self-start"
                    disabled={Boolean(running)}
                    onClick={() => generate()}
                  >
                    {stage === 'render' ? '渲染最终成片' : '合成 HyperFrames 粗剪'}
                  </Button>
                </fieldset>
              )}
            </div>
          </section>
        </aside>
      </div>
      <div className="workflow-bottom">
        <div>
          <p className="text-body-sm font-semibold">
            {revision?.status === 'approved' && !draft.dirty
              ? '当前版本已通过，可进入下一步'
              : '每一步，都由你确认'}
          </p>
          <p className="workflow-muted">
            {draft.dirty
              ? '有未保存修改 · 本地草稿已保留'
              : '生成完成后停在待审核，不自动连续执行。'}
          </p>
        </div>
        <div className="workflow-actions">
          {editable && draft.dirty && (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => draft.reset()}>
                放弃未保存修改
              </Button>
              <Button
                ref={saveButton}
                size="sm"
                variant="secondary"
                disabled={!unlocked || busy || draft.conflict || Boolean(running)}
                onClick={() => setImpact(true)}
              >
                保存草稿
              </Button>
            </>
          )}
          {stage !== 'publish' && (
            <Button
              size="sm"
              aria-label="继续下一步"
              disabled={revision?.status !== 'approved' || draft.dirty || Boolean(running) || busy}
              onClick={onNext}
            >
              下一步：{VIDEO_STAGE_LABELS[VIDEO_STAGES[VIDEO_STAGES.indexOf(stage) + 1]]}
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                chevron_right
              </span>
            </Button>
          )}
        </div>
      </div>
      <WorkflowDialog
        open={impact}
        onOpenChange={setImpact}
        title="保存新版本与影响确认"
        description="确认保存当前编辑；取消会保留本地草稿，不改变已保存版本。"
        returnFocus={saveButton}
        footer={
          <>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setImpact(false)}>
              取消
            </Button>
            <Button
              size="sm"
              disabled={busy || draft.conflict || Boolean(running)}
              onClick={() => void save()}
            >
              {busy ? '正在保存…' : '确认保存新版本'}
            </Button>
          </>
        }
      >
        <p className="text-body-sm">{VIDEO_STAGE_LABELS[stage]}将创建新版本，需要重新审核。</p>
        <div className="workflow-section">
          {VIDEO_STAGES.slice(VIDEO_STAGES.indexOf(stage) + 1).map((item) => (
            <div key={item} className="workflow-toolbar text-body-sm">
              <span>{VIDEO_STAGE_LABELS[item]}</span>
              <span className="workflow-muted">
                {project.stages[item] ? '已有结果将标为需更新' : '尚未生成'}
              </span>
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="workflow-error">
            {error}
          </p>
        )}
      </WorkflowDialog>
      <Dialog.Root open={review} onOpenChange={setReview}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
          <Dialog.Content
            className="workflow-dialog voiceover-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              approveButton.current?.focus()
            }}
          >
            <div className="workflow-dialog-header">
              <div>
                <Dialog.Title className="font-headline-sm">
                  确认通过「{VIDEO_STAGE_LABELS[stage]}」v{revision?.version}
                </Dialog.Title>
                <Dialog.Description className="workflow-muted mt-2">
                  请确认当前已保存内容准确且可以进入下一步。后续修改会使依赖此版本的步骤失效。
                </Dialog.Description>
              </div>
            </div>
            <div className="workflow-dialog-body">
              <VoiceTextArea
                label="审核备注（可选）"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              {error && (
                <p role="alert" className="workflow-error">
                  {error}
                </p>
              )}
            </div>
            <div className="workflow-dialog-footer">
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={busy}>
                  返回检查
                </Button>
              </Dialog.Close>
              <Button disabled={!canApprove} onClick={() => void approve()}>
                {busy ? '正在保存…' : '确认审核通过'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
