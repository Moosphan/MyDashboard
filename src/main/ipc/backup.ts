import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { getDatabase, closeDatabase } from '../database/connection'
import { getUserDataPath } from '../services/file-service'
import { createBackup, restoreBackup, validateBackup } from '../services/backup-service'
import { stopVoiceover } from '../services/tts-service'
import { stopVideoWorkflow } from './video-workflow'

function getFocusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

function checkpointDatabase(): void {
  const db = getDatabase()
  db.pragma('wal_checkpoint(TRUNCATE)')
}

export function registerBackupIpcHandlers(): void {
  ipcMain.handle('backup:create', async () => {
    const win = getFocusedWindow()
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose backup folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return { success: false, error: 'Canceled' }

    try {
      checkpointDatabase()
      const backup = createBackup(getUserDataPath(), result.filePaths[0])
      return { success: true, data: { path: backup.backupPath, manifest: backup.manifest } }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('backup:restore', async () => {
    const win = getFocusedWindow()
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose MyDashboard backup',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return { success: false, error: 'Canceled' }

    try {
      const backupPath = result.filePaths[0]
      validateBackup(backupPath)
      await stopVideoWorkflow()
      await stopVoiceover()
      checkpointDatabase()
      const safetyBackup = createBackup(getUserDataPath(), join(getUserDataPath(), 'backups'))
      closeDatabase()
      try {
        restoreBackup(backupPath, getUserDataPath())
      } catch (restoreError) {
        restoreBackup(safetyBackup.backupPath, getUserDataPath())
        getDatabase()
        throw restoreError
      }
      return { success: true, data: { requiresRestart: true } }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('backup:restart', async () => {
    await stopVideoWorkflow()
    await stopVoiceover()
    app.relaunch()
    app.quit()
    return { success: true }
  })
}
