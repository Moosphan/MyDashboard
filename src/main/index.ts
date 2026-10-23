import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { appendFileSync, mkdirSync } from 'fs'
import { registerAllIpcHandlers } from './ipc'
import { initFileStorage, registerFileIpcHandlers } from './services/file-service'
import { registerSettingsIpcHandlers } from './services/settings-service'
import { registerTaskIpcHandlers } from './ipc/tasks'
import { registerProjectIpcHandlers } from './ipc/projects'
import { registerArticleIpcHandlers } from './ipc/articles'
import { registerAiIpcHandlers } from './ipc/ai'
import { registerVideoAssetIpcHandlers } from './ipc/video-assets'
import { registerRssIpcHandlers } from './ipc/rss'
import { registerWeatherIpcHandlers } from './services/weather-service'
import { registerSearchIpcHandlers } from './ipc/search'
import { registerNotificationIpcHandlers, startTaskReminderScheduler, stopTaskReminderScheduler } from './services/notification-service'
import { registerRssFetcherHandlers } from './services/rss-fetcher'
import { registerSocialIpcHandlers } from './ipc/social'
import { registerSocialFetcherHandlers } from './services/social-fetcher'
import { registerIdeaIpcHandlers } from './ipc/ideas'
import { registerHighlightIpcHandlers } from './ipc/highlights'
import { registerAiSummaryHandlers } from './services/ai-summary'
import { registerAiUsageHandlers } from './services/ai-usage-tracker'
import { registerProfileIpcHandlers } from './ipc/profile'
import { registerMoodboardIpcHandlers } from './ipc/moodboard'
import { registerCalendarIpcHandlers } from './ipc/calendar'
import { registerPortfolioIpcHandlers } from './ipc/portfolio'
import { registerMilestoneIpcHandlers } from './ipc/milestones'
import { registerActivityIpcHandlers } from './ipc/activity'
import { registerDashboardIpcHandlers } from './ipc/dashboard'
import { registerTrendingIpcHandlers, startTrendingRefreshScheduler, stopTrendingRefreshScheduler } from './ipc/trending'
import { registerTtsHandlers, stopVoiceover } from './services/tts-service'
import { registerVideoWorkflowHandlers, registerVideoWorkflowProtocol, stopVideoWorkflow } from './ipc/video-workflow'
import { registerResetRadarIpcHandlers } from './ipc/reset-radar'
import { registerToolboxIpcHandlers, stopToolbox } from './ipc/toolbox'
import { registerBackupIpcHandlers } from './ipc/backup'
import { registerResearchMaterialIpcHandlers } from './ipc/research-materials'
import { registerResearchAssistantIpcHandlers } from './ipc/research-assistant'
import { registerContentVariantIpcHandlers } from './ipc/content-variants'
import { registerFocusSessionIpcHandlers } from './ipc/focus-sessions'
import { registerAIActionIpcHandlers } from './ipc/ai-actions'
import { startChatGPTUsageRefreshScheduler, stopChatGPTUsageRefreshScheduler } from './services/reset-radar/usage-refresh-scheduler'
import { loadPlugins, getLoadedPlugins, unloadPlugin } from './services/plugin-loader'
import { getDatabase, closeDatabase } from './database/connection'
import { runMigrations } from './database/migrations'
import { AISubscriptionRepository } from './database/repositories/ai-repository'
import { seedSocialData } from './database/seeds/social-seeds'

const isDev = !app.isPackaged
if (process.env.MYDASHBOARD_USER_DATA) {
  const isolatedData = resolve(process.env.MYDASHBOARD_USER_DATA)
  mkdirSync(isolatedData, { recursive: true })
  app.setPath('userData', isolatedData)
}
registerVideoWorkflowProtocol()
let mainWindow: BrowserWindow | null = null

function logLifecycle(event: string, details: Record<string, unknown> = {}): void {
  const line = `[Lifecycle] ${new Date().toISOString()} ${event} ${JSON.stringify(details)}`
  console.log(line)

  try {
    if (!app.isReady()) return
    const logDir = join(app.getPath('userData'), 'logs')
    mkdirSync(logDir, { recursive: true })
    appendFileSync(join(logDir, 'lifecycle.log'), `${line}\n`)
  } catch {
    // Lifecycle logging must never affect the app itself.
  }
}

// Suppress EPIPE errors in dev mode (harmless stdout disconnect)
process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE') return
  logLifecycle('process:uncaughtException', {
    message: err.message,
    stack: err.stack,
  })
  console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (reason) => {
  logLifecycle('process:unhandledRejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  })
})

process.on('beforeExit', (code) => {
  logLifecycle('process:beforeExit', { code })
})

process.on('exit', (code) => {
  logLifecycle('process:exit', { code })
})

process.once('SIGTERM', () => {
  logLifecycle('process:SIGTERM')
  app.quit()
  setTimeout(() => process.exit(0), 1000).unref()
})

process.once('SIGINT', () => {
  logLifecycle('process:SIGINT')
  app.quit()
  setTimeout(() => process.exit(0), 1000).unref()
})

process.on('SIGHUP', () => {
  logLifecycle('process:SIGHUP', {
    ignored: isDev,
    reason: isDev ? 'Keep Electron alive when the launching terminal/PTY is detached.' : 'Quit packaged app on hangup.',
  })
  if (!isDev) app.quit()
})

function createWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return
  }

  logLifecycle('window:create')
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      webviewTag: true,
      nodeIntegration: false,
    },
  })
  mainWindow = window

  window.on('ready-to-show', () => {
    logLifecycle('window:ready-to-show')
    window.show()
    if (isDev && process.platform === 'darwin') {
      app.focus({ steal: true })
      window.focus()
    }
  })

  window.on('close', () => {
    logLifecycle('window:close')
  })

  window.on('closed', () => {
    logLifecycle('window:closed')
    if (mainWindow === window) mainWindow = null
  })

  window.on('unresponsive', () => {
    logLifecycle('window:unresponsive')
  })

  window.on('responsive', () => {
    logLifecycle('window:responsive')
  })

  window.webContents.on('render-process-gone', (_event, details) => {
    logLifecycle('renderer:gone', details)
    if (window.isDestroyed()) return
    if (details.reason !== 'clean-exit') {
      window.reload()
    }
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logLifecycle('renderer:did-fail-load', { errorCode, errorDescription, validatedURL })
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  logLifecycle('app:ready', {
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  })

  // Initialize file storage directories
  initFileStorage()

  // Initialize database and run migrations
  const db = getDatabase()
  runMigrations(db)

  // Encrypt any legacy plaintext API keys at rest (safeStorage)
  const migratedKeys = new AISubscriptionRepository(db).encryptLegacyApiKeys()
  if (migratedKeys > 0) {
    console.log(`[Security] Encrypted ${migratedKeys} legacy API key(s) with safeStorage`)
  }

  // Register all IPC handlers
  registerAllIpcHandlers()
  registerFileIpcHandlers()
  registerSettingsIpcHandlers()
  registerTaskIpcHandlers()
  registerProjectIpcHandlers()
  registerArticleIpcHandlers()
  registerAiIpcHandlers()
  registerVideoAssetIpcHandlers()
  registerRssIpcHandlers()
  registerWeatherIpcHandlers()
  registerSearchIpcHandlers()
  registerNotificationIpcHandlers()
  registerRssFetcherHandlers()
  registerSocialIpcHandlers()
  registerSocialFetcherHandlers()
  registerIdeaIpcHandlers()
  registerHighlightIpcHandlers()
  registerAiSummaryHandlers()
  registerAiUsageHandlers()
  registerProfileIpcHandlers()
  registerMoodboardIpcHandlers()
  registerCalendarIpcHandlers()
  registerPortfolioIpcHandlers()
  registerMilestoneIpcHandlers()
  registerActivityIpcHandlers()
  registerDashboardIpcHandlers()
  registerTrendingIpcHandlers()
  registerTtsHandlers(() => mainWindow)
  registerVideoWorkflowHandlers(() => mainWindow)
  registerResetRadarIpcHandlers()
  registerToolboxIpcHandlers(() => mainWindow)
  registerResearchMaterialIpcHandlers()
  registerResearchAssistantIpcHandlers()
  registerContentVariantIpcHandlers()
  registerFocusSessionIpcHandlers()
  registerAIActionIpcHandlers()
  registerBackupIpcHandlers()

  // Load plugins
  const loadedPluginInfos = loadPlugins()
  console.log(`[App] Loaded ${loadedPluginInfos.length} plugins`)

  // Plugin management IPC
  ipcMain.handle('plugins:list', () => {
    return { success: true, data: getLoadedPlugins() }
  })

  ipcMain.handle('plugins:unload', async (_event, pluginId: string) => {
    const result = await unloadPlugin(pluginId)
    return { success: result }
  })

  // Seed initial data
  seedSocialData(db)
  startTaskReminderScheduler(db)
  startTrendingRefreshScheduler()
  startChatGPTUsageRefreshScheduler()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  logLifecycle('app:window-all-closed', { platform: process.platform })
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let voiceoverStopped = false
let voiceoverStopping = false
app.on('before-quit', (event) => {
  if (!voiceoverStopped) {
    event.preventDefault()
    if (!voiceoverStopping) {
      voiceoverStopping = true
      void stopVideoWorkflow().then(() => stopVoiceover()).catch(error => console.error('Video shutdown failed:', error)).finally(() => { voiceoverStopped = true; app.quit() })
    }
    return
  }
  logLifecycle('app:before-quit')
  stopTrendingRefreshScheduler()
  stopTaskReminderScheduler()
  stopChatGPTUsageRefreshScheduler()
  stopToolbox()
  closeDatabase()
})

app.on('will-quit', () => {
  logLifecycle('app:will-quit')
})

app.on('quit', (_event, exitCode) => {
  logLifecycle('app:quit', { exitCode })
})

app.on('browser-window-created', () => {
  logLifecycle('app:browser-window-created')
})

app.on('child-process-gone', (_event, details) => {
  logLifecycle('app:child-process-gone', details)
})
