import { BrowserWindow, powerMonitor } from 'electron'
import { getResetRadarSnapshot, refreshChatGPTAccountUsage } from './reset-radar-service'
import { CHATGPT_USAGE_REFRESH_INTERVAL_MS } from './chatgpt-usage-refresh'
import { CHATGPT_SESSION_PARTITION } from './account-session'

let scheduler: NodeJS.Timeout | null = null
let usageWindow: BrowserWindow | null = null
let lastFailureMessage: string | null = null
let refreshInFlight: Promise<void> | null = null
let activeRefreshController: AbortController | null = null
let resumeTimer: NodeJS.Timeout | null = null

const USAGE_REFRESH_TIMEOUT_MS = 25_000
const RESUME_REFRESH_DELAY_MS = 1_500

function notifyUsageUpdated(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('ai:codexUsageUpdated')
  }
}

function notifyRadarUpdated(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('reset-radar:updated')
  }
}

function destroyUsageWindow(): void {
  if (usageWindow && !usageWindow.isDestroyed()) usageWindow.destroy()
  usageWindow = null
}

function runWithTimeout(operation: (signal: AbortSignal) => Promise<void>): Promise<void> {
  const controller = new AbortController()
  activeRefreshController = controller

  return new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (complete: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      controller.signal.removeEventListener('abort', onAborted)
      complete()
    }
    const onAborted = () => finish(() => reject(new Error('ChatGPT usage refresh timed out')))
    const timeout = setTimeout(() => {
      controller.abort()
      destroyUsageWindow()
    }, USAGE_REFRESH_TIMEOUT_MS)

    controller.signal.addEventListener('abort', onAborted, { once: true })
    void operation(controller.signal).then(
      () => finish(resolve),
      (error) => finish(() => reject(error)),
    )
  }).finally(() => {
    if (activeRefreshController === controller) activeRefreshController = null
  })
}

async function runAccountUsageRefresh(rebuildSession: boolean): Promise<void> {
  if (rebuildSession) destroyUsageWindow()

  await runWithTimeout(async (signal) => {
    await ensureUsagePage(signal)
    const accessToken = await readAccessToken(signal)
    await refreshChatGPTAccountUsage(accessToken, signal)
  })
}

export function refreshChatGPTUsageNow(options: { rebuildSession?: boolean } = {}): Promise<void> {
  if (refreshInFlight) {
    if (options.rebuildSession) activeRefreshController?.abort()
    return refreshInFlight.then(
      () => options.rebuildSession ? refreshChatGPTUsageNow(options) : undefined,
      (error) => options.rebuildSession ? refreshChatGPTUsageNow(options) : Promise.reject(error),
    )
  }

  const refresh = runAccountUsageRefresh(options.rebuildSession === true)
  refreshInFlight = refresh
  void refresh.finally(() => {
    if (refreshInFlight === refresh) refreshInFlight = null
  }).catch(() => {})
  return refresh
}

async function refreshUsage(rebuildSession = false): Promise<void> {
  try {
    await refreshChatGPTUsageNow({ rebuildSession })
    lastFailureMessage = null
    notifyUsageUpdated()
  } catch (error) {
    // A signed-out or expired session is expected; keep the last successful snapshot intact.
    const message = error instanceof Error ? error.message : String(error)
    if (message !== lastFailureMessage) {
      console.info('[Codex Usage] Background refresh skipped:', message)
      lastFailureMessage = message
    }
  }

  try {
    await getResetRadarSnapshot(true)
    notifyRadarUpdated()
  } catch (error) {
    console.info('[Reset Radar] Background refresh skipped:', error instanceof Error ? error.message : String(error))
  }
}

function getUsageWindow(): BrowserWindow {
  if (usageWindow && !usageWindow.isDestroyed()) return usageWindow

  usageWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: CHATGPT_SESSION_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  usageWindow.on('closed', () => { usageWindow = null })
  usageWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  return usageWindow
}

async function ensureUsagePage(signal: AbortSignal): Promise<void> {
  const window = getUsageWindow()
  const contents = window.webContents
  if (/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(contents.getURL())) return

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('ChatGPT session page timed out')), 20_000)
    const cleanup = () => {
      clearTimeout(timeout)
      contents.removeListener('did-finish-load', onLoaded)
      contents.removeListener('did-fail-load', onFailed)
      signal.removeEventListener('abort', onAborted)
    }
    const finish = (error?: Error) => {
      cleanup()
      if (error) reject(error)
      else resolve()
    }
    const onLoaded = () => finish()
    const onFailed = (_event: Electron.Event, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame: boolean) => {
      if (isMainFrame) finish(new Error(`ChatGPT session page failed: ${errorCode} ${errorDescription} (${validatedURL})`))
    }
    const onAborted = () => {
      if (!contents.isDestroyed()) contents.stop()
      finish(new Error('ChatGPT usage refresh timed out'))
    }

    if (signal.aborted) return onAborted()
    contents.once('did-finish-load', onLoaded)
    contents.on('did-fail-load', onFailed)
    signal.addEventListener('abort', onAborted, { once: true })
    void contents.loadURL('https://chatgpt.com').catch((error: Error) => finish(error))
  })
}

async function readAccessToken(signal: AbortSignal): Promise<string | undefined> {
  if (signal.aborted) throw new Error('ChatGPT usage refresh timed out')
  const result = await getUsageWindow().webContents.executeJavaScript(`(() => {
    try {
      const bootstrap = document.getElementById('client-bootstrap')
      const data = bootstrap?.textContent ? JSON.parse(bootstrap.textContent) : null
      const token = data?.session?.accessToken || data?.session?.access_token
      return typeof token === 'string' && token ? token : null
    } catch {
      return null
    }
  })()`) as unknown
  if (signal.aborted) throw new Error('ChatGPT usage refresh timed out')
  return typeof result === 'string' && result ? result : undefined
}

export function startChatGPTUsageRefreshScheduler(): void {
  if (scheduler) return
  void refreshUsage()
  scheduler = setInterval(() => { void refreshUsage() }, CHATGPT_USAGE_REFRESH_INTERVAL_MS)
  powerMonitor.on('suspend', handleSystemSuspend)
  powerMonitor.on('resume', handleSystemResume)
}

export function stopChatGPTUsageRefreshScheduler(): void {
  if (!scheduler) return
  clearInterval(scheduler)
  scheduler = null
  if (resumeTimer) clearTimeout(resumeTimer)
  resumeTimer = null
  powerMonitor.removeListener('suspend', handleSystemSuspend)
  powerMonitor.removeListener('resume', handleSystemResume)
  activeRefreshController?.abort()
  destroyUsageWindow()
}

function handleSystemSuspend(): void {
  activeRefreshController?.abort()
  destroyUsageWindow()
}

function handleSystemResume(): void {
  if (resumeTimer) clearTimeout(resumeTimer)
  resumeTimer = setTimeout(() => {
    resumeTimer = null
    void refreshUsage(true)
  }, RESUME_REFRESH_DELAY_MS)
}
