import type { ToolboxAction, ToolboxState } from '@shared/toolbox'
import { Toggle } from '@/components/ui/toggle'
import { ToolboxDialog } from './ToolboxDialog'
import { ToolIcon } from './ToolIcon'

interface ToolManagerProps {
  open: boolean
  onClose: () => void
  state: ToolboxState | null
  busy: boolean
  error: string | null
  update: (action: ToolboxAction) => void
}

export function ToolManager({ open, onClose, state, busy, error, update }: ToolManagerProps) {
  return <ToolboxDialog open={open} onClose={onClose} title="管理工具" description="选择需要的工具，打造适合自己的工作空间。" footerNote={busy ? '正在保存…' : error ? '更改未保存，请重试' : '更改自动保存'}>
    {error && <p role="alert" className="mb-4 rounded-lg bg-error-container/50 p-3 text-body-sm text-error">{error}</p>}
    <div className="mb-4 flex items-center justify-between text-[12px] text-on-surface-variant"><span>可用工具</span><span>{state?.preferences.tools.filter(tool => tool.enabled && state.tools.some(item => item.id === tool.id)).length ?? 0} 个已启用 · 共 {state?.tools.length ?? 0} 个</span></div>
    <div className="space-y-4">{state?.tools.map(tool => {
      const preference = state.preferences.tools.find(item => item.id === tool.id)
      if (!preference) return null
      return <section key={tool.id} className="overflow-hidden rounded-xl border border-outline-variant/40">
        <div className="flex items-center gap-3 bg-surface-container-low/50 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:text-primary-fixed-dim"><ToolIcon name={tool.icon} /></span>
          <div className="min-w-0"><h3 className="text-body-md font-semibold text-on-surface">{tool.title}</h3><p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">{tool.description}</p></div>
        </div>
        <div className="divide-y divide-outline-variant/20 px-4">
          <div className="flex items-center justify-between gap-4 py-4"><div><p className="text-body-sm font-medium text-on-surface">启用工具</p><p className="mt-1 text-[12px] text-on-surface-variant">关闭后暂停此工具的所有任务</p></div><Toggle aria-label={`启用${tool.title}`} pressed={preference.enabled} disabled={busy} className="shrink-0 disabled:cursor-not-allowed disabled:opacity-40" onPressedChange={value => update({ type: 'enabled', toolId: tool.id, value })} /></div>
          <div className="flex items-center justify-between gap-4 py-4"><div><p className="text-body-sm font-medium text-on-surface">显示面板</p><p className="mt-1 text-[12px] text-on-surface-variant">{preference.enabled ? '隐藏后保留配置与排序，可随时恢复' : '启用工具后可调整显示偏好'}</p></div><Toggle aria-label={`显示${tool.title}`} pressed={preference.visible} disabled={busy || !preference.enabled} className="shrink-0 disabled:cursor-not-allowed disabled:opacity-40" onPressedChange={value => update({ type: 'visible', toolId: tool.id, value })} /></div>
        </div>
      </section>
    })}</div>
  </ToolboxDialog>
}
