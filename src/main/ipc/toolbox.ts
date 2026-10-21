import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { featureConfig } from '../../../feature.config'
import { type ToolboxAction, type ToolboxResponse } from '../../shared/toolbox'
import { ToolboxService } from '../services/toolbox/toolbox-service'

let service: ToolboxService | null = null

export function registerToolboxIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  const handle = (channel: string, action: (instance: ToolboxService, value: unknown) => unknown) => {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, value: unknown): Promise<ToolboxResponse> => {
      const window = getMainWindow()
      if (featureConfig.modules.toolbox?.enabled === false || !window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
        return { success: false, error: '工具箱当前不可用' }
      }
      try {
        service ??= new ToolboxService()
        service.attach(window)
        await action(service, value)
        return { success: true, data: service.getState() }
      } catch {
        return { success: false, error: channel === 'toolbox:update' ? '布局未保存，请重试或检查本地配置。' : '工具操作未完成，请重试或检查本地配置。' }
      }
    })
  }
  handle('toolbox:get', () => {})
  handle('toolbox:update', (instance, value) => instance.update(value as ToolboxAction))
  handle('toolbox:active', (instance, value) => instance.setActive(value as boolean))
  handle('toolbox:refresh', (instance, value) => instance.refresh(typeof value === 'string' ? value : ''))
  handle('toolbox:login', instance => instance.login())
  handle('toolbox:logout', instance => instance.logout())
}

export function stopToolbox(): void {
  service?.dispose()
  service = null
}
