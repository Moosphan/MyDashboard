import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { VoiceInput } from '../components/voiceover/VoiceControls'
import type { WorkflowRuntime } from '@shared/video-workflow'
import { workflowCall } from './useWorkflow'

export function WorkflowSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [runtime, setRuntime] = useState<WorkflowRuntime | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [checks, setChecks] = useState<{ key: string; ok: boolean; detail: string }[]>([])
  useEffect(() => {
    if (open) {
      setError('')
      void workflowCall<WorkflowRuntime>('runtime')
        .then(setRuntime)
        .catch((failure) => setError(failure.message))
    }
  }, [open])
  const save = async (check: boolean) => {
    setBusy(true)
    setError('')
    try {
      await workflowCall('configure', runtime)
      if (check) setChecks(await workflowCall('checkRuntime'))
      else onClose()
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const labels: Record<keyof WorkflowRuntime, string> = {
    nodePath: 'Node.js（Catbus 需 22.22.2+ / 24.15+ / 26+）',
    catbusPath: 'Catbus CLI 0.2.1（可执行文件或 dist/cli/main.js）',
    codexPath: 'Codex CLI',
    claudePath: 'Claude Code CLI',
    hyperframesPath: 'HyperFrames 0.8.181（可执行文件或 bin/hyperframes.mjs）',
    ffmpegPath: 'FFmpeg',
    ffprobePath: 'FFprobe',
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="workflow-dialog voiceover-dialog"
          aria-busy={busy}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            document.querySelector<HTMLButtonElement>('[data-workflow-settings]')?.focus()
          }}
        >
          <div className="workflow-dialog-header">
            <div>
              <Dialog.Title className="font-headline-sm">工作流执行环境</Dialog.Title>
              <Dialog.Description className="text-body-sm text-on-surface-variant mt-2">
                填写本机绝对路径。CLI 使用已有登录；配音模型与音色在 AI 配音中管理。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="关闭执行环境">
                <span className="material-symbols-outlined">close</span>
              </Button>
            </Dialog.Close>
          </div>
          <div className="workflow-dialog-body">
            {runtime &&
              Object.entries(labels).map(([key, label]) => (
                <VoiceInput
                  key={key}
                  label={label}
                  value={runtime[key as keyof WorkflowRuntime] ?? ''}
                  onChange={(event) => setRuntime({ ...runtime, [key]: event.target.value })}
                  placeholder="/absolute/path/to/executable"
                />
              ))}
            {error && (
              <p role="alert" className="workflow-error">
                {error}
              </p>
            )}
            {checks.length > 0 && (
              <ul className="space-y-3" aria-live="polite">
                {checks.map((check) => (
                  <li key={check.key} className="text-body-sm break-words">
                    <strong className={check.ok ? 'text-primary' : 'text-error'}>
                      {check.ok ? '可用' : '未就绪'} · {check.key}
                    </strong>
                    <p className="text-on-surface-variant">{check.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="workflow-dialog-footer">
            <Button variant="secondary" disabled={busy || !runtime} onClick={() => void save(true)}>
              {busy ? '正在检测…' : '保存并检测'}
            </Button>
            <Button disabled={busy || !runtime} onClick={() => void save(false)}>
              保存配置
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
