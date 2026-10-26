import { useCallback, useEffect, useRef, useState } from 'react'
import { UserGroupIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import type {
  BilibiliAccount,
  BilibiliAccountsState,
  BilibiliConnection,
} from '@shared/bilibili-publishing'
import { WorkflowDialog } from './WorkflowDialog'
import { workflowCall } from './useWorkflow'
import type { VideoPlatform } from '@shared/video-workflow'
import { PUBLISHING_PLATFORMS } from '@shared/platform-publishing'

export function PlatformAccountsDialog({
  platform = 'bilibili',
  connection,
  disabled,
  onChanged,
}: {
  platform?: VideoPlatform
  connection: BilibiliConnection
  disabled: boolean
  onChanged: () => Promise<void>
}) {
  const { label, app, identity } = PUBLISHING_PLATFORMS[platform]
  const call = useCallback(
    <Result,>(action: string, ...args: unknown[]) =>
      workflowCall<Result>(`${platform}${action}`, ...args),
    [platform],
  )
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<BilibiliAccountsState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<BilibiliAccount | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const lock = useRef(false)
  const alive = useRef(true)
  const sequence = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++sequence.current
    const value = await call<BilibiliAccountsState>('Accounts')
    if (alive.current && request === sequence.current) setState(value)
  }, [call])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (!open) return
    void refresh().catch((failure) => {
      if (alive.current) setError(failure.message)
    })
  }, [open, connection.state, connection.uid, disabled, refresh])
  const perform = async (action: () => Promise<unknown>) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await action()
      await onChanged()
      await refresh()
    } catch (failure) {
      if (alive.current) setError((failure as Error).message)
    } finally {
      lock.current = false
      if (alive.current) setBusy(false)
    }
  }
  const connecting = connection.state === 'connecting'
  const locked = busy || disabled || connecting || Boolean(state?.busy)
  return (
    <>
      <Button
        ref={trigger}
        type="button"
        size="sm"
        variant="secondary"
        aria-label={`管理 ${label}账号`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setError('')
          setRemoving(null)
          setOpen(true)
        }}
      >
        <UserGroupIcon aria-hidden="true" className="size-5" />
        管理账号
      </Button>
      <WorkflowDialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value)
          if (!value) setRemoving(null)
        }}
        title={`${label}账号管理`}
        description="绑定多个账号，选择本次投稿使用的账号。每个账号独立保存登录，历史投稿保留原账号。"
        returnFocus={trigger}
      >
        <div
          className="workflow-section"
          data-bilibili-accounts={platform === 'bilibili' ? '' : undefined}
          data-platform-accounts={platform}
          aria-busy={busy}
        >
          {!state ? (
            <p className="workflow-muted" role="status">
              正在读取已绑定账号…
            </p>
          ) : state.accounts.length === 0 ? (
            <p className="workflow-muted">还没有绑定账号，添加并扫码绑定第一个 {label}账号。</p>
          ) : (
            <div role="group" aria-label={`已绑定 ${label}账号`}>
              {state.accounts.map((account) => (
                <div
                  key={account.id}
                  className="workflow-history-row"
                  data-bilibili-account={account.uid}
                >
                  <div className="workflow-toolbar">
                    <div className="min-w-0 break-words">
                      <strong className="text-body-sm">{account.name}</strong>
                      <p className="workflow-muted">
                        {identity} {account.uid}
                        {state.selectedId === account.id ? ' · 当前投稿账号' : ''}
                      </p>
                    </div>
                    <div className="workflow-actions">
                      <Button
                        size="sm"
                        variant={state.selectedId === account.id ? 'ghost' : 'secondary'}
                        disabled={locked || state.selectedId === account.id}
                        aria-label={`使用账号 ${account.name}（${identity} ${account.uid}）`}
                        onClick={() => void perform(() => call('SelectAccount', account.id))}
                      >
                        {state.selectedId === account.id ? '已选择' : '使用此账号'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={locked}
                        aria-label={`重新登录账号 ${account.uid}`}
                        onClick={() => void perform(() => call('Connect', account.id))}
                      >
                        重新登录
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={locked}
                        aria-label={`解除绑定账号 ${account.uid}`}
                        onClick={() => setRemoving(account)}
                      >
                        解除绑定
                      </Button>
                    </div>
                  </div>
                  {removing?.id === account.id && (
                    <div
                      className="workflow-section"
                      role="group"
                      aria-label={`确认解除绑定 ${account.uid}`}
                    >
                      <p className="workflow-muted">
                        解除“{account.name}
                        ”的本机登录绑定？历史投稿记录保留；之后核查该账号作品需要重新绑定。
                      </p>
                      <div className="workflow-actions">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => setRemoving(null)}
                        >
                          保留绑定
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={locked}
                          onClick={() =>
                            void perform(async () => {
                              await call('RemoveAccount', account.id)
                              if (alive.current) setRemoving(null)
                            })
                          }
                        >
                          确认解除绑定
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="workflow-actions">
            <Button
              size="sm"
              variant="secondary"
              disabled={locked}
              onClick={() => void perform(() => call('Connect'))}
            >
              添加 {label}账号
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={locked}
              onClick={() => void perform(() => call('Connection', true))}
            >
              重新检测连接
            </Button>
          </div>
          {connecting && (
            <div className="workflow-section" aria-live="polite">
              <p className="workflow-muted">
                请使用{app} App 扫码，并在手机上确认。关闭弹窗后仍可继续扫码。
              </p>
              {connection.qrCode ? (
                <img
                  className="mx-auto"
                  src={connection.qrCode}
                  width={200}
                  height={200}
                  alt={`使用${app} App 扫码绑定 ${label}账号`}
                />
              ) : (
                <p className="workflow-muted" role="status">
                  正在准备二维码…
                </p>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void perform(() => call('CancelLogin'))}
              >
                取消扫码
              </Button>
            </div>
          )}
          {!connecting && connection.state === 'connected' && (
            <p className="workflow-muted" role="status">
              已连接：{connection.name} · {identity} {connection.uid}
            </p>
          )}
          {disabled && (
            <p className="workflow-muted">投稿任务执行期间不能更改账号，请等待任务结束。</p>
          )}
          {(error || connection.error) && (
            <p className="workflow-error" role="alert">
              {error || connection.error}
            </p>
          )}
        </div>
      </WorkflowDialog>
    </>
  )
}

export { PlatformAccountsDialog as BilibiliAccountsDialog }
