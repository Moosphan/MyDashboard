import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { type VideoStage, type WorkflowJob } from '@shared/video-workflow'

const taskNames: Record<VideoStage, string> = {
  brief: '整理创作简报',
  copy: '生成内容文案',
  storyboard: '生成 HTML 分镜',
  narration: '生成逐镜口播',
  audio: '制作逐镜配音',
  roughcut: '合成动态粗剪',
  render: '渲染正式成片',
  publish: '生成发布资料',
}

const resultLabels: Record<WorkflowJob['state'], string> = {
  running: '执行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
  stale: '已过期',
}

function executorName(job: WorkflowJob) {
  if (job.operation?.action === 'reuse-roughcut') return '沿用已生成视频'
  if (job.operation?.action === 'reuse-audio') return '沿用已保存配音'
  if (job.operation?.action === 'reuse-narration') return '沿用已保存口播'
  if (job.executor === 'manual-edit') return '人工编辑'
  if (job.executor === 'codex') return 'Codex CLI'
  if (job.executor === 'claude') return 'Claude Code CLI'
  if (job.executor === 'manual-audio') return '音频导入'
  if (job.executor !== 'template') return job.executor || '—'
  if (job.stage === 'audio') return '配音引擎'
  if (job.stage === 'roughcut' || job.stage === 'render') return 'HyperFrames'
  return '视觉模板'
}

const changeNames: Record<string, string> = {
  title: '画面标题',
  body: '屏幕文字',
  layout: '布局',
  html: 'HTML 画面',
  requirements: '创作要求',
  motion: 'MG 动效计划',
  materialFallback: '原创示意图降级确认',
  text: '口播正文',
  pronunciation: '读音与停顿',
  scene: '分镜内容',
  order: '分镜顺序',
}

function taskName(job: WorkflowJob) {
  if (job.operation?.action === 'accept-illustration') return '接受原创示意图降级'
  if (job.operation?.action === 'reuse-roughcut') return '取消修改计划并沿用粗剪'
  if (job.operation?.action === 'reuse-audio') return '沿用并审核分段配音'
  if (job.kind === 'motion-plan') return '生成元素动效修改计划'
  if (job.operation?.action === 'reuse-narration') return '沿用现有口播稿'
  if (job.operation?.action === 'scene-edit') return '保存分镜修改'
  if (job.operation?.sceneId)
    return job.stage === 'narration' ? '重新生成单镜口播' : 'AI 修改单个分镜'
  return taskNames[job.stage]
}

function timestamp(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : '—'
}

function elapsed(job: WorkflowJob, now: number) {
  const start = Date.parse(job.createdAt)
  const end = job.state === 'running' ? now : Date.parse(job.updatedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—'
  const seconds = Math.floor((end - start) / 1000)
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
  return `${Math.floor(seconds / 3600)} 时 ${Math.floor((seconds % 3600) / 60)} 分`
}

function JobError({ error }: { error: string }) {
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    setState('copying')
    try {
      await navigator.clipboard.writeText(error)
      setState('copied')
    } catch {
      setState('failed')
    }
  }
  return (
    <>
      <div className="workflow-toolbar">
        <Button size="sm" variant="ghost" disabled={state === 'copying'} onClick={copy}>
          复制错误信息
        </Button>
        <span role="status">
          {state === 'copied' ? '已复制' : state === 'failed' ? '复制失败，请选中文字复制' : ''}
        </span>
      </div>
      <pre tabIndex={0} aria-label="完整错误信息">
        {error}
      </pre>
    </>
  )
}

export function ExecutionLog({
  jobs,
  busy,
  onCancel,
}: {
  jobs: WorkflowJob[]
  busy: boolean
  onCancel: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [now, setNow] = useState(Date.now)
  const running = jobs.some((job) => job.state === 'running')
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  const ordered = [...jobs].sort(
    (first, second) =>
      Number(second.state === 'running') - Number(first.state === 'running') ||
      (Date.parse(second.createdAt) || 0) - (Date.parse(first.createdAt) || 0),
  )
  const visible = expanded ? ordered : ordered.slice(0, 3)
  return (
    <section className="workflow-execution-log" aria-label="当前阶段执行记录">
      <div className="workflow-toolbar">
        <h4 className="workflow-log-heading">执行记录</h4>
        <span className="workflow-muted">{jobs.length} 条</span>
      </div>
      {!jobs.length ? (
        <p className="workflow-log-empty">暂无执行记录，启动任务后将在这里显示进度与结果。</p>
      ) : (
        <ol className="workflow-job-log" aria-label="任务记录，执行中的任务优先">
          {visible.map((job) => (
            <li key={job.id} className="workflow-job-entry" data-job-state={job.state}>
              <div className="workflow-job-title">
                <strong>{taskName(job)}</strong>
                <span className="workflow-job-result">
                  {job.state === 'running' && (
                    <span className="workflow-job-spinner" aria-hidden="true" />
                  )}
                  {job.kind === 'motion-plan' && job.state === 'succeeded'
                    ? '计划已生成'
                    : resultLabels[job.state]}
                </span>
              </div>
              <p className="workflow-job-start">
                开始{' '}
                <time dateTime={job.createdAt} title={job.createdAt}>
                  {timestamp(job.createdAt)}
                </time>
              </p>
              {job.operation && (
                <div className="workflow-job-phase" data-workflow-operation>
                  <p>
                    {job.operation.sceneId
                      ? `目标：${job.operation.sceneNumber ? `第 ${job.operation.sceneNumber} 镜 · ` : ''}${job.operation.sceneTitle ?? '指定分镜'}`
                      : job.operation.action === 'reuse-narration'
                        ? '保留全部口播正文和读音提示，关联当前已审核分镜。'
                        : job.operation.action === 'reuse-audio'
                          ? '口播内容一致，保留原配音文件、音色和字幕，关联当前口播版本。'
                          : job.operation.action === 'reuse-roughcut'
                            ? '保留原粗剪画面、配音、字幕和时长，未重新合成；等待审核后继续正式成片。'
                            : '修改范围见任务详情。'}
                  </p>
                  {job.operation.feedback && <p>修改意见：{job.operation.feedback}</p>}
                  {job.operation.sourceVersion !== undefined && (
                    <p>
                      来源 v{job.operation.sourceVersion}
                      {job.operation.resultVersion !== undefined
                        ? ` → 结果 v${job.operation.resultVersion}`
                        : ''}
                    </p>
                  )}
                  {Boolean(job.operation.changes?.length) && (
                    <p>
                      已修改：
                      {[
                        ...new Set(
                          job.operation.changes!.map(
                            (change) => changeNames[change.field] ?? change.field,
                          ),
                        ),
                      ].join('、')}
                    </p>
                  )}
                </div>
              )}
              <div className="workflow-job-meta">
                <span>{executorName(job)}</span>
                <span>
                  {job.state === 'running' ? '已运行' : '耗时'} {elapsed(job, now)}
                </span>
              </div>
              <p
                className="workflow-job-phase"
                role={job.state === 'running' ? 'status' : undefined}
                aria-live={job.state === 'running' ? 'polite' : undefined}
              >
                {job.phase || '未记录处理阶段'}
              </p>
              {job.state === 'running' && (
                <>
                  <div
                    className="workflow-job-progress"
                    role="progressbar"
                    aria-label={`${taskName(job)}执行中，进度未提供`}
                  >
                    <span />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => onCancel(job.id)}
                  >
                    取消任务
                  </Button>
                </>
              )}
              <details className="workflow-job-details">
                <summary>{job.error ? '查看错误详情' : '查看任务详情'}</summary>
                <dl>
                  <div>
                    <dt>任务 ID</dt>
                    <dd className="workflow-job-id">{job.id}</dd>
                  </div>
                  {job.operation?.sceneId && (
                    <div>
                      <dt>分镜 ID</dt>
                      <dd className="workflow-job-id">{job.operation.sceneId}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{job.state === 'running' ? '更新于' : '结束于'}</dt>
                    <dd>
                      <time dateTime={job.updatedAt} title={job.updatedAt}>
                        {timestamp(job.updatedAt)}
                      </time>
                    </dd>
                  </div>
                </dl>
                {job.operation?.changes?.map((change, index) => (
                  <details
                    key={`${change.sceneId}:${change.field}:${index}`}
                    className="workflow-job-details workflow-job-change"
                  >
                    <summary>
                      {change.title} · {changeNames[change.field] ?? change.field} · 修改前后
                    </summary>
                    <p>修改前</p>
                    <pre
                      tabIndex={0}
                      aria-label={`${changeNames[change.field] ?? change.field}修改前`}
                    >
                      {change.before || '（空）'}
                    </pre>
                    <p>修改后</p>
                    <pre
                      tabIndex={0}
                      aria-label={`${changeNames[change.field] ?? change.field}修改后`}
                    >
                      {change.after || '（空）'}
                    </pre>
                  </details>
                ))}
                {job.error && <JobError key={job.error} error={job.error} />}
              </details>
            </li>
          ))}
        </ol>
      )}
      {jobs.length > 3 && (
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收起较早记录' : `查看全部 ${jobs.length} 条记录`}
        </Button>
      )}
      <p className="workflow-log-footnote">关闭页面继续执行 · 退出应用会中断</p>
    </section>
  )
}
