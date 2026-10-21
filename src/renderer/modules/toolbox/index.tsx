import { useCallback, useEffect, useRef, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import type { ToolboxAction, ToolboxResponse, ToolboxState } from '@shared/toolbox'
import { Button } from '@/components/ui/button'
import { toolboxAPI } from './api'
import { ToolCard } from './ToolCard'
import { toolRegistry } from './registry'
import { ToolboxDialog } from './ToolboxDialog'
import { ToolManager } from './ToolManager'

const emptySnapshot = { data: null, lastSuccessAt: null, refreshing: false, error: null, stale: false }

export default function Toolbox() {
  const [state, setState] = useState<ToolboxState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [managerOpen, setManagerOpen] = useState(false)
  const [configurationId, setConfigurationId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const updating = useRef(false)
  const latestRevision = useRef(-1)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const acceptState = useCallback((next: ToolboxState) => {
    if (!alive.current || next.revision < latestRevision.current) return
    latestRevision.current = next.revision
    setState(next)
  }, [])
  const receive = useCallback((response: ToolboxResponse) => {
    if (!alive.current) return
    if (!response.success) setError(response.error ?? '操作失败，请重试')
    else if (response.data) acceptState(response.data)
  }, [acceptState])
  const run = useCallback(async (operation: () => Promise<ToolboxResponse>) => {
    try { receive(await operation()) } catch { if (alive.current) setError('工具箱连接失败，请重试') }
  }, [receive])
  useEffect(() => {
    alive.current = true
    if (!toolboxAPI) { setError('工具箱服务不可用，请在应用中打开'); return }
    const unsubscribe = toolboxAPI.onUpdated(acceptState)
    const active = () => { void run(() => toolboxAPI.setActive(document.visibilityState === 'visible')) }
    active()
    void run(() => toolboxAPI.get())
    document.addEventListener('visibilitychange', active)
    return () => {
      alive.current = false
      unsubscribe()
      document.removeEventListener('visibilitychange', active)
      void toolboxAPI.setActive(false).catch(() => {})
    }
  }, [run, acceptState])
  const update = async (action: ToolboxAction) => {
    if (updating.current) return
    updating.current = true
    setBusy(true)
    setError(null)
    await run(() => toolboxAPI.update(action))
    updating.current = false
    if (alive.current) setBusy(false)
  }
  const visible = state?.preferences.tools.filter(preference => preference.enabled && preference.visible && state.tools.some(tool => tool.id === preference.id)) ?? []
  const configurationTool = state?.tools.find(tool => tool.id === configurationId)
  const Configuration = configurationTool ? toolRegistry[configurationTool.id]?.Configuration : undefined
  const move = (id: string, direction: number) => {
    const current = visible.find(tool => tool.id === id)
    const group = visible.filter(tool => tool.pinned === current?.pinned)
    const target = group[group.findIndex(tool => tool.id === id) + direction]
    if (target) void update({ type: 'move', toolId: id, targetId: target.id })
  }
  const dragEnd = ({ active, over }: DragEndEvent) => {
    const source = visible.find(tool => tool.id === active.id)
    const target = visible.find(tool => tool.id === over?.id)
    if (source && target && source.id !== target.id && source.pinned === target.pinned) void update({ type: 'move', toolId: source.id, targetId: target.id })
  }
  return <div className="p-md md:p-lg space-y-lg animate-fade-in max-w-[1280px] mx-auto w-full min-w-0">
    <header className="flex flex-wrap justify-between items-center gap-md"><div><h1 className="font-headline-xl text-headline-xl text-on-surface">Toolbox</h1><p className="mt-2 text-body-lg text-on-surface-variant">集中管理常用工具，随时掌握订阅与服务状态。</p></div><Button disabled={!state} className="h-10 px-5" onClick={() => setManagerOpen(true)}><span className="material-symbols-outlined text-[18px]" aria-hidden="true">tune</span>管理工具</Button></header>
    {error && <div role="alert" className="text-body-sm text-error flex items-center gap-sm flex-wrap"><span>{error}</span><Button variant="ghost" size="sm" onClick={() => setError(null)}>关闭提示</Button>{!state && toolboxAPI && <Button size="sm" onClick={() => void run(() => toolboxAPI.get())}>重试</Button>}</div>}
    {!state && !error && <p role="status" className="text-body-sm text-on-surface-variant">正在加载工具箱…</p>}
    {state && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>{[true, false].map(pinned => {
      const group = visible.filter(tool => tool.pinned === pinned)
      if (!group.length) return null
      return <section key={String(pinned)} className="space-y-4" aria-label={pinned ? '置顶工具' : '常用工具'}><div className="flex items-center justify-between"><h2 className="text-body-md font-semibold text-on-surface">{pinned ? '置顶工具' : '常用工具'}</h2><span className="text-[12px] text-on-surface-variant">{group.length} 个工具</span></div><SortableContext items={group.map(tool => tool.id)} strategy={rectSortingStrategy}><div className="grid gap-gutter" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))' }}>{group.map(preference => <ToolCard key={preference.id} descriptor={state.tools.find(tool => tool.id === preference.id)!} preference={preference} snapshot={state.snapshots[preference.id] ?? emptySnapshot} state={state} busy={busy} update={action => void update(action)} move={move} refresh={id => void run(() => toolboxAPI.refresh(id))} configure={() => setConfigurationId(preference.id)} />)}</div></SortableContext></section>
    })}</DndContext>}
    {state && !visible.length && <p className="text-body-sm text-on-surface-variant">暂无显示的工具，请在“管理工具”中启用或恢复。</p>}
    <ToolManager open={managerOpen} onClose={() => setManagerOpen(false)} state={state} busy={busy} error={error} update={action => void update(action)} />
    <ToolboxDialog open={Boolean(configurationTool && Configuration)} onClose={() => setConfigurationId(null)} title={`${configurationTool?.title ?? '工具'}配置`} description="连接服务账号，管理此工具的专用登录状态。">
      {state && Configuration && <Configuration key={configurationId} state={state} onState={acceptState} />}
    </ToolboxDialog>
  </div>
}
