import { BrowserWindow, ipcMain } from 'electron'
import { getDatabase } from '../database/connection'
import { AISubscriptionRepository, AIToolRepository } from '../database/repositories/ai-repository'
import { getCodexUsageDashboard } from '../services/codex-usage-service'
import { getResetRadarSnapshot } from '../services/reset-radar/reset-radar-service'
import { refreshChatGPTUsageNow } from '../services/reset-radar/usage-refresh-scheduler'

const AI_CHANNELS = {
  GET_SUBSCRIPTIONS: 'ai:getSubscriptions',
  GET_ALL_SUBSCRIPTIONS: 'ai:getAllSubscriptions',
  CREATE_SUBSCRIPTION: 'ai:createSubscription',
  UPDATE_SUBSCRIPTION: 'ai:updateSubscription',
  UPDATE_TOKENS: 'ai:updateTokens',
  RESET_TOKENS: 'ai:resetTokens',
  DELETE_SUBSCRIPTION: 'ai:deleteSubscription',
  GET_TOOLS: 'ai:getTools',
  CREATE_TOOL: 'ai:createTool',
} as const

function getSubRepo(): AISubscriptionRepository {
  return new AISubscriptionRepository(getDatabase())
}

function getToolRepo(): AIToolRepository {
  return new AIToolRepository(getDatabase())
}

export function registerAiIpcHandlers(): void {
  ipcMain.handle('ai:getCodexUsageDashboard', async (_event, options?: unknown) => {
    try {
      const forceRefresh = Boolean(options && typeof options === 'object' && (options as { forceRefresh?: unknown }).forceRefresh === true)
      return { success: true, data: await getCodexUsageDashboard(forceRefresh) }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('ai:refreshCodexUsageDashboard', async () => {
    try {
      await refreshChatGPTUsageNow({ rebuildSession: true })
      await getResetRadarSnapshot(true)
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send('reset-radar:updated')
      }
      return { success: true, data: await getCodexUsageDashboard(true) }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(AI_CHANNELS.GET_SUBSCRIPTIONS, () => {
    try {
      return { success: true, data: getSubRepo().findActive() }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(AI_CHANNELS.GET_ALL_SUBSCRIPTIONS, () => {
    try {
      return { success: true, data: getSubRepo().findAll() }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(AI_CHANNELS.CREATE_SUBSCRIPTION, (_event, data) => {
    try {
      return { success: true, data: getSubRepo().create(data) }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(AI_CHANNELS.UPDATE_SUBSCRIPTION, (_event, id: number, data: Record<string, unknown>) => {
    try {
      return { success: true, data: getSubRepo().update(id, data) }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(AI_CHANNELS.UPDATE_TOKENS, (_event, id: number, tokens: number) => {
    try {
      return { success: true, data: getSubRepo().updateTokensUsed(id, tokens) }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(AI_CHANNELS.RESET_TOKENS, (_event, id: number) => {
    try {
      return { success: true, data: getSubRepo().resetTokens(id) }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(AI_CHANNELS.DELETE_SUBSCRIPTION, (_event, id: number) => {
    try {
      return { success: true, data: getSubRepo().deleteById(id) }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(AI_CHANNELS.GET_TOOLS, (_event, category?: string) => {
    try {
      const repo = getToolRepo()
      const tools = category ? repo.findByCategory(category) : repo.findAll()
      return { success: true, data: tools }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(AI_CHANNELS.CREATE_TOOL, (_event, data) => {
    try {
      return { success: true, data: getToolRepo().create(data) }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
