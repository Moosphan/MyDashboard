import { app, type BrowserWindow } from 'electron'
import { featureConfig } from '../../../../feature.config'
import { EXAMPLE_TOOL, VPN_TOOL, VPN_TOOL_ID, type ToolboxAction, type ToolboxPreferences, type ToolboxState, type ToolDescriptor } from '../../../shared/toolbox'
import { applyToolboxAction, normalizePreferences } from '../../../shared/toolbox-preferences'
import { getStoredSetting, setStoredSetting } from '../settings-service'
import { ToolCoordinator } from './coordinator'
import { ShadowsocksPortal } from './portal'

interface RuntimeTool {
  descriptor: ToolDescriptor
  coordinator: ToolCoordinator
  configured: () => boolean
}

export class ToolboxService {
  private readonly portal: ShadowsocksPortal
  private readonly runtimes: RuntimeTool[]
  private preferences: ToolboxPreferences
  private pageActive = false
  private window: BrowserWindow | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private readonly listeners: Array<() => void> = []
  private disposed = false
  private revision = 0

  constructor() {
    this.portal = new ShadowsocksPortal(configurationChanged => {
      if (configurationChanged) {
        this.runtimes.find(tool => tool.descriptor.id === VPN_TOOL_ID)?.coordinator.invalidate()
      }
      this.syncActivity()
      this.emit()
    })
    this.runtimes = [{
      descriptor: VPN_TOOL,
      coordinator: new ToolCoordinator(signal => this.portal.read(signal), () => this.emit(), { initialSnapshot: this.portal.getCachedSnapshot() }),
      configured: () => this.portal.getStatus().configured,
    }]
    if (!app.isPackaged && process.env.TOOLBOX_DEV_TOOLS === '1') {
      let count = 0
      this.runtimes.push({
        descriptor: EXAMPLE_TOOL,
        coordinator: new ToolCoordinator(async () => ({ text: `已通过统一协调器获取 ${++count} 次` }), () => this.emit()),
        configured: () => true,
      })
    }
    this.preferences = normalizePreferences(getStoredSetting('toolbox'), this.runtimes.map(tool => tool.descriptor))
  }

  attach(window: BrowserWindow): void {
    if (this.window === window) return
    this.detach()
    this.window = window
    const sync = () => { this.syncActivity(); this.emit() }
    const leave = () => { this.pageActive = false; sync() }
    window.on('show', sync)
    window.on('hide', sync)
    window.on('minimize', sync)
    window.on('restore', sync)
    this.listeners.push(() => {
      if (window.isDestroyed()) return
      window.removeListener('show', sync)
      window.removeListener('hide', sync)
      window.removeListener('minimize', sync)
      window.removeListener('restore', sync)
    })
    const navigate = (_event: Electron.Event, _url: string, isInPlace: boolean, isMainFrame: boolean) => { if (isMainFrame && !isInPlace) leave() }
    window.webContents.on('did-start-navigation', navigate)
    window.webContents.on('render-process-gone', leave)
    window.webContents.once('destroyed', leave)
    this.listeners.push(() => {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.removeListener('did-start-navigation', navigate)
        window.webContents.removeListener('render-process-gone', leave)
        window.webContents.removeListener('destroyed', leave)
      }
    })
    this.heartbeat = setInterval(() => { if (this.isActive()) this.emit() }, 15_000)
  }

  getState(): ToolboxState {
    return {
      revision: this.revision,
      preferences: this.preferences,
      tools: this.runtimes.map(tool => tool.descriptor),
      snapshots: Object.fromEntries(this.runtimes.map(tool => [tool.descriptor.id, tool.coordinator.getSnapshot()])),
      vpn: this.portal.getStatus(),
      active: this.isActive(),
    }
  }

  update(action: ToolboxAction): void {
    const descriptors = this.runtimes.map(tool => tool.descriptor)
    const latest = normalizePreferences(getStoredSetting('toolbox'), descriptors)
    const next = applyToolboxAction(latest, action, descriptors.map(tool => tool.id))
    setStoredSetting('toolbox', next)
    this.preferences = next
    this.syncActivity()
    this.emit()
  }

  setActive(active: boolean): void {
    if (typeof active !== 'boolean') throw new Error('工具箱活动状态无效')
    this.pageActive = active
    this.syncActivity()
    this.emit()
  }

  async refresh(toolId: string): Promise<void> {
    const tool = this.runtimes.find(item => item.descriptor.id === toolId)
    if (!tool || !this.isToolActive(toolId)) throw new Error('该工具当前不可刷新')
    await tool.coordinator.refresh()
  }

  async login(): Promise<void> {
    if (!this.preferences.tools.find(tool => tool.id === VPN_TOOL_ID)?.enabled) throw new Error('请先启用 VPN 工具')
    await this.portal.openLogin()
  }

  async logout(): Promise<void> {
    this.runtimes.find(tool => tool.descriptor.id === VPN_TOOL_ID)?.coordinator.invalidate()
    await this.portal.clear()
    this.syncActivity()
    this.emit()
  }

  dispose(): void {
    this.disposed = true
    this.detach()
    for (const tool of this.runtimes) tool.coordinator.dispose()
    this.portal.dispose()
  }

  private detach(): void {
    this.pageActive = false
    this.syncActivity()
    for (const remove of this.listeners) remove()
    this.listeners.length = 0
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    this.window = null
  }

  private isActive(): boolean {
    return !this.disposed && featureConfig.modules.toolbox?.enabled !== false && this.pageActive && !!this.window && !this.window.isDestroyed() && this.window.isVisible() && !this.window.isMinimized()
  }

  private isToolActive(toolId: string): boolean {
    const preference = this.preferences.tools.find(tool => tool.id === toolId)
    return this.isActive() && !!preference?.enabled && preference.visible && !!this.runtimes.find(tool => tool.descriptor.id === toolId)?.configured() && (toolId !== VPN_TOOL_ID || !this.portal.getStatus().loginOpen)
  }

  private syncActivity(): void {
    for (const tool of this.runtimes) tool.coordinator.setActive(this.isToolActive(tool.descriptor.id))
  }

  private emit(): void {
    this.revision += 1
    if (!this.disposed && this.window && !this.window.isDestroyed() && !this.window.webContents.isDestroyed()) this.window.webContents.send('toolbox:updated', this.getState())
  }
}
