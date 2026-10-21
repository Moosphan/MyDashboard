import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ToolDescriptor, ToolPreference, ToolSnapshot, ToolboxAction, ToolboxState } from '@shared/toolbox'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toolRegistry } from './registry'
import { ToolIcon } from './ToolIcon'

interface Props {
  descriptor: ToolDescriptor
  preference: ToolPreference
  snapshot: ToolSnapshot
  state: ToolboxState
  busy: boolean
  update: (action: ToolboxAction) => void
  move: (id: string, direction: number) => void
  refresh: (id: string) => void
  configure: () => void
}

export function ToolCard({ descriptor, preference, snapshot, state, busy, update, move, refresh, configure }: Props) {
  const sortable = useSortable({ id: descriptor.id, disabled: busy })
  const definition = toolRegistry[descriptor.id]
  const Content = definition?.Content
  const needsConfiguration = definition?.needsConfiguration?.(snapshot, state) ?? false
  return <Card ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, zIndex: sortable.isDragging ? 10 : undefined }} className={`h-[320px] min-w-0 flex flex-col gap-3 rounded-2xl p-5 ${sortable.isDragging ? 'opacity-70 shadow-floating' : ''}`}>
    <header className="flex shrink-0 items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-primary-fixed-dim"><ToolIcon name={descriptor.icon} /></span>
      <div className="min-w-0 flex-1"><h2 title={descriptor.title} className="truncate text-body-lg font-semibold text-on-surface leading-tight">{descriptor.title}</h2><span title={snapshot.error?.message ?? (snapshot.stale ? '超过 30 分钟未更新，当前显示上次获取的数据。' : snapshot.fromCache ? '显示本机加密缓存，联网成功后更新。' : undefined)}><Badge className="mt-2 px-2 py-1 text-[11px] font-medium" variant={snapshot.error ? 'error' : snapshot.stale ? 'urgent' : needsConfiguration ? 'archived' : 'low'}>{snapshot.refreshing ? '正在获取' : snapshot.error ? snapshot.data ? '更新失败 · 缓存' : '获取失败' : snapshot.stale ? '数据陈旧' : needsConfiguration ? '待配置' : snapshot.fromCache ? '本机缓存' : snapshot.lastSuccessAt ? '已获取' : '待获取'}</Badge></span></div>
      <div className="flex shrink-0 items-center gap-0.5">
      <Button ref={sortable.setActivatorNodeRef} variant="ghost" size="icon" className="h-7 w-6 shrink-0 touch-none cursor-grab rounded-md text-on-surface-variant/50 hover:bg-surface-container-low active:cursor-grabbing" title="拖拽排序；Alt + 上下键调整同组顺序" aria-label={`移动${descriptor.title}`} {...sortable.attributes} {...sortable.listeners} onKeyDown={event => {
        if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          event.preventDefault()
          move(descriptor.id, event.key === 'ArrowUp' ? -1 : 1)
        }
      }}><span aria-hidden="true" className="material-symbols-outlined text-[16px]">drag_indicator</span></Button>
      <Button variant="ghost" size="icon" className="h-7 w-6 rounded-md text-on-surface-variant/60 hover:bg-surface-container-low" disabled={busy} aria-label={preference.pinned ? '取消置顶' : '置顶'} title={preference.pinned ? '取消置顶' : '置顶'} onClick={() => update({ type: 'pin', toolId: descriptor.id, value: !preference.pinned })}><span aria-hidden="true" className={`material-symbols-outlined text-[16px] ${preference.pinned ? 'text-primary fill' : ''}`}>push_pin</span></Button>
      <Button variant="ghost" size="icon" className="h-7 w-6 rounded-md text-on-surface-variant/60 hover:bg-surface-container-low" disabled={busy} aria-label={`隐藏${descriptor.title}`} title="隐藏；可在管理工具恢复" onClick={() => update({ type: 'visible', toolId: descriptor.id, value: false })}><span aria-hidden="true" className="material-symbols-outlined text-[16px]">visibility_off</span></Button>
      </div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto break-words text-body-sm text-on-surface-variant">
      {snapshot.error && <p role="status" className={snapshot.data ? 'sr-only' : 'mb-3 rounded-lg bg-error-container/40 p-3 text-[12px] leading-relaxed text-error'}>{snapshot.error.message}</p>}
      {Content ? <Content snapshot={snapshot} state={state} configure={configure} /> : <p>当前版本尚未提供此工具的内容。</p>}
    </div>
    <footer className="shrink-0 flex items-center justify-between gap-2 border-t border-outline-variant/25 pt-3">
      <span title={snapshot.lastSuccessAt !== null ? `成功获取于 ${new Date(snapshot.lastSuccessAt).toLocaleString()}` : undefined} className="min-w-0 text-[12px] text-on-surface-variant/75">{snapshot.lastSuccessAt !== null ? `获取于 ${new Date(snapshot.lastSuccessAt).toLocaleTimeString()}` : '尚未同步'}</span>
      <div className="flex shrink-0 items-center gap-1">{definition?.officialUrl && <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" asChild><a href={definition.officialUrl} target="_blank" rel="noreferrer" aria-label={`打开${descriptor.title}官网`} title="打开官网"><span className="material-symbols-outlined text-[16px]" aria-hidden="true">open_in_new</span></a></Button>}{definition?.Configuration && <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] font-medium" onClick={configure}>配置</Button>}{descriptor.refreshable && <Button variant="secondary" size="sm" className="h-7 px-3 text-[12px] font-medium" disabled={snapshot.refreshing || definition?.canRefresh?.(snapshot, state) === false} onClick={() => refresh(descriptor.id)}>{snapshot.refreshing ? '获取中' : snapshot.error ? '重试' : '刷新'}</Button>}</div>
    </footer>
  </Card>
}
