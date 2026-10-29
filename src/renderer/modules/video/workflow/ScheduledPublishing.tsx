import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { VoiceInput } from '../components/voiceover/VoiceControls'
import { WorkflowDialog } from './WorkflowDialog'

function localTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function ScheduledPublishing({
  label,
  accountUid,
  title,
  renderVersion,
  publishVersion,
  disabled,
  busy,
  hasPlan,
  error,
  onSchedule,
}: {
  label: string
  accountUid: string | null
  title: string
  renderVersion?: number
  publishVersion?: number
  disabled: boolean
  busy: boolean
  hasPlan: boolean
  error: string
  onSchedule: (scheduleAt: string) => Promise<boolean>
}) {
  const [time, setTime] = useState('')
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const timeMs = new Date(time).getTime()
  const valid =
    Number.isFinite(timeMs) && timeMs >= Date.now() + 60000 && timeMs <= Date.now() + 30 * 86400000
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return (
    <details className="workflow-divider" data-scheduled-publishing>
      <summary className="workflow-muted cursor-pointer">自动定时发布</summary>
      <div className="workflow-section mt-3">
        <p className="workflow-muted">
          在指定时间自动开始上传并投稿到{label}
          ，公开时间取决于上传及平台审核。电脑需开机联网，应用需保持运行。
        </p>
        <VoiceInput
          id="scheduled-publish-time"
          type="datetime-local"
          label={`开始投稿时间（${timezone}）`}
          value={time}
          min={localTime(new Date(Date.now() + 60000))}
          max={localTime(new Date(Date.now() + 30 * 86400000))}
          disabled={disabled || busy || hasPlan}
          onChange={(event) => setTime(event.target.value)}
        />
        <p className="workflow-muted">
          可安排未来 1 分钟至 30 天。关闭应用或休眠期间错过的计划不会补发；任务排队延迟超过 5
          分钟也标记为已错过，需重新安排。执行前核对冻结的账号、成片及已审核资料，失败或结果不明时不自动重试。
        </p>
        {hasPlan ? (
          <p role="status" className="workflow-muted">
            已有定时计划；如需修改时间或立即发布，请先在下方取消该计划。
          </p>
        ) : disabled ? (
          <p className="workflow-muted">请先保存并审核发布资料，连接账号并核对投稿设置。</p>
        ) : null}
        {time && !valid && (
          <p role="alert" className="workflow-error">
            请选择未来 1 分钟至 30 天内的有效时间。
          </p>
        )}
        <Button
          ref={button}
          size="sm"
          variant="secondary"
          disabled={disabled || busy || hasPlan || !valid}
          onClick={() => setConfirmation(new Date(timeMs).toISOString())}
        >
          设置定时发布
        </Button>
      </div>
      <WorkflowDialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null)
        }}
        title="确认定时发布"
        description="确认后将保存计划，到点自动投稿，无需再次点击发布。"
        returnFocus={button}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmation(null)}>
              取消
            </Button>
            <Button
              disabled={disabled || busy || hasPlan || !confirmation}
              onClick={async () => {
                if (confirmation && (await onSchedule(confirmation))) setConfirmation(null)
              }}
            >
              {busy ? '正在保存…' : '确认定时发布'}
            </Button>
          </>
        }
      >
        <p className="workflow-muted">
          平台：{label} · 账号：{accountUid}
        </p>
        <p className="workflow-muted">
          标题：{title} · 成片 v{renderVersion} · 发布资料 v{publishVersion}
        </p>
        <p className="workflow-muted">
          开始投稿：{confirmation ? new Date(confirmation).toLocaleString() : ''}（{timezone}）
        </p>
        <p className="workflow-muted">
          计划绑定上述已审核版本及账号。修改资料、归档、文件丢失或账号失效时将停止。切换当前账号不会更换计划的投稿账号；解除原账号绑定后无法执行。
        </p>
        {error && (
          <p className="workflow-error" role="alert">
            {error}
          </p>
        )}
      </WorkflowDialog>
    </details>
  )
}
