import { app, BrowserWindow, powerMonitor } from 'electron'
import { getResetRadarSnapshot, refreshChatGPTAccountUsage } from './reset-radar-service'
import { CHATGPT_USAGE_REFRESH_INTERVAL_MS } from './chatgpt-usage-refresh'
import { CHATGPT_SESSION_PARTITION } from './account-session'
import { UsageRefreshControl } from './usage-refresh-control'
import { withUsageSession } from './usage-session'

let started = false
let lastFailure = false

function notify(channel: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel)
  }
}

const usageRefresh = new UsageRefreshControl({
  run: async signal => {
    let accountFailure: unknown
    await withUsageSession(
      () => new BrowserWindow({
        show: false,
        webPreferences: {
          partition: CHATGPT_SESSION_PARTITION,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      }),
      signal,
      async token => { await refreshChatGPTAccountUsage(token, signal) },
    ).catch(error => { accountFailure = error })
    if (signal.aborted) return
    await getResetRadarSnapshot(false, signal)
    if (signal.aborted) return
    notify('reset-radar:updated')
    if (accountFailure) throw accountFailure
  },
  visible: () => BrowserWindow.getAllWindows().some(window => !window.isDestroyed() && window.isVisible() && !window.isMinimized()),
  updated: () => {
    lastFailure = false
    notify('ai:codexUsageUpdated')
  },
  failed: () => {
    const category = 'unavailable'
    if (!lastFailure) console.info('[Codex Usage] Background refresh skipped:', category)
    lastFailure = true
  },
}, { intervalMs: CHATGPT_USAGE_REFRESH_INTERVAL_MS, timeoutMs: 25_000 })

export function refreshChatGPTUsageNow(options: { rebuildSession?: boolean } = {}): Promise<void> {
  return usageRefresh.refresh(options.rebuildSession === true)
}

const suspend = () => usageRefresh.suspend()
const resume = () => usageRefresh.resume()
const activate = () => usageRefresh.activate()

export function startChatGPTUsageRefreshScheduler(): void {
  if (started) return
  started = true
  usageRefresh.start()
  powerMonitor.on('suspend', suspend)
  powerMonitor.on('resume', resume)
  app.on('browser-window-focus', activate)
  app.on('activate', activate)
}

export function stopChatGPTUsageRefreshScheduler(): void {
  usageRefresh.stop()
  if (!started) return
  started = false
  powerMonitor.removeListener('suspend', suspend)
  powerMonitor.removeListener('resume', resume)
  app.removeListener('browser-window-focus', activate)
  app.removeListener('activate', activate)
}
