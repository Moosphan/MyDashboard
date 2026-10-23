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
  if (job.executor === 'codex') return 'Codex CLI'
  if (job.executor === 'claude') return 'Claude Code CLI'
  if (job.executor === 'manual-audio') return '音频导入'
  if (job.executor !== 'template') return job.executor || '—'
  if (job.stage === 'audio') return '配音引擎'
  if (job.stage === 'roughcut' || job.stage === 'render') return 'HyperFrames'
  return '视觉模板'
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
                <strong>
                  {job.kind === 'motion-plan' ? '生成元素动效修改计划' : taskNames[job.stage]}
                </strong>
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
                    aria-label={`${job.kind === 'motion-plan' ? '生成动效计划' : taskNames[job.stage]}执行中，进度未提供`}
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
                  <div>
                    <dt>{job.state === 'running' ? '更新于' : '结束于'}</dt>
                    <dd>
                      <time dateTime={job.updatedAt} title={job.updatedAt}>
                        {timestamp(job.updatedAt)}
                      </time>
                    </dd>
                  </div>
                </dl>
                {job.error && (
                  <pre tabIndex={0} aria-label="完整错误信息">
                    {job.error}
                  </pre>
                )}
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
