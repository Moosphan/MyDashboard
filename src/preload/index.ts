import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/constants'
import type { ToolboxAPI, ToolboxState } from '@shared/toolbox'
import type { VoiceJob } from '@shared/voiceover'

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
const electronAPI = {
  // System
  getPlatform: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_PLATFORM),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, url),
  showItemInFolder: (path: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_SHOW_ITEM_IN_FOLDER, path),

  // Generic IPC invoke
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  onVoiceoverJobUpdated: (callback: (job: VoiceJob) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, job: VoiceJob) => callback(job)
    ipcRenderer.on('tts:jobUpdated', listener)
    return () => { ipcRenderer.removeListener('tts:jobUpdated', listener) }
  },
  onVideoWorkflowUpdated: (callback: (projectId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, projectId: string) => callback(projectId)
    ipcRenderer.on('workflow:updated', listener)
    return () => { ipcRenderer.removeListener('workflow:updated', listener) }
  },
  onVideoAssetsChanged: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('video:assetsChanged', listener)
    return () => { ipcRenderer.removeListener('video:assetsChanged', listener) }
  },
  onNotificationNavigate: (callback: (payload: { route: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { route: string }) => callback(payload)
    ipcRenderer.on('notification:navigate', listener)
    return () => ipcRenderer.removeListener('notification:navigate', listener)
  },
  onNotificationCenterEvent: (channel: 'notification:center:new' | 'notification:center:read' | 'notification:center:allRead', callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  onCodexUsageUpdated: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('ai:codexUsageUpdated', listener)
    return () => ipcRenderer.removeListener('ai:codexUsageUpdated', listener)
  },
  onResetRadarUpdated: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('reset-radar:updated', listener)
    return () => ipcRenderer.removeListener('reset-radar:updated', listener)
  },

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
  getSetting: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
  setSetting: (key: string, value: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),

  // File system
  readFile: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_READ_FILE, path),
  writeFile: (path: string, content: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FS_WRITE_FILE, path, content),
  deleteFile: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_DELETE_FILE, path),
  fileExists: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_EXISTS, path),
  getUserDataPath: () => ipcRenderer.invoke(IPC_CHANNELS.FS_GET_USER_DATA_PATH),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

const toolboxAPI: ToolboxAPI = {
  get: () => ipcRenderer.invoke('toolbox:get'),
  update: action => ipcRenderer.invoke('toolbox:update', action),
  setActive: active => ipcRenderer.invoke('toolbox:active', active),
  refresh: toolId => ipcRenderer.invoke('toolbox:refresh', toolId),
  login: () => ipcRenderer.invoke('toolbox:login'),
  logout: () => ipcRenderer.invoke('toolbox:logout'),
  onUpdated: callback => {
    const listener = (_event: Electron.IpcRendererEvent, state: ToolboxState) => callback(state)
    ipcRenderer.on('toolbox:updated', listener)
    return () => ipcRenderer.removeListener('toolbox:updated', listener)
  },
}

contextBridge.exposeInMainWorld('toolboxAPI', toolboxAPI)

export type ElectronAPI = typeof electronAPI
