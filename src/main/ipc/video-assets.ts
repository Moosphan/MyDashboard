import { ipcMain, dialog, BrowserWindow } from 'electron'
import { getDatabase } from '../database/connection'
import { VideoAssetRepository } from '../database/repositories/video-asset-repository'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { join, basename, extname } from 'path'
import { app } from 'electron'
import { getVoiceoverService } from '../services/tts-service'
import { managedPath } from '../services/voiceover/media'

const VIDEO_CHANNELS = {
  GET_BY_TYPE: 'video:getByType',
  GET_ALL: 'video:getAll',
  CREATE: 'video:create',
  UPDATE: 'video:update',
  DELETE: 'video:delete',
  IMPORT_FILE: 'video:importFile',
  GET_AUDIO_DATA: 'video:getAudioData',
} as const

function getRepo(): VideoAssetRepository {
  return new VideoAssetRepository(getDatabase())
}

function getMediaDir(type: string): string {
  const dir = join(app.getPath('userData'), `media/${type}`)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getFileFormat(filePath: string): string {
  return extname(filePath).replace('.', '').toUpperCase()
}

export function registerVideoAssetIpcHandlers(): void {
  ipcMain.handle(VIDEO_CHANNELS.GET_BY_TYPE, (_event, type: string) => {
    try {
      return { success: true, data: getRepo().findByType(type as 'cover' | 'audio' | 'presentation' | 'other') }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(VIDEO_CHANNELS.GET_ALL, (_event, limit?: number) => {
    try {
      return { success: true, data: getRepo().findAll(limit) }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(VIDEO_CHANNELS.CREATE, (_event, data) => {
    try {
      return { success: true, data: getRepo().create(data) }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(VIDEO_CHANNELS.UPDATE, (_event, id: number, data) => {
    try {
      return { success: true, data: getRepo().update(id, data) }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(VIDEO_CHANNELS.DELETE, (_event, id: number) => {
    try {
      const asset = getRepo().findById(id)
      if (asset && ['voiceover', 'legacy-voiceover'].includes(JSON.parse(asset.metadata).source)) {
        getVoiceoverService().assets.trash(id)
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed() && window.webContents === _event.sender) window.webContents.send('video:assetsChanged', { type: 'audio' })
        }
        return { success: true, data: true }
      }
      return { success: true, data: getRepo().deleteById(id) }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(VIDEO_CHANNELS.IMPORT_FILE, async (_event, assetType: 'cover' | 'audio' | 'presentation') => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { success: false, error: 'No focused window' }

      const filters: Record<string, Electron.FileFilter[]> = {
        cover: [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'webm', 'mkv'] }],
        audio: [{ name: 'Audio', extensions: ['wav', 'mp3', 'm4a', 'flac', 'ogg'] }],
        presentation: [{ name: 'HTML', extensions: ['html', 'htm'] }],
      }

      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile', 'multiSelections'],
        filters: filters[assetType] || [{ name: 'All Files', extensions: ['*'] }],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Canceled' }
      }

      const imported = []
      const mediaDir = getMediaDir(assetType)

      for (const filePath of result.filePaths) {
        const fileName = basename(filePath)
        const destPath = join(mediaDir, fileName)
        copyFileSync(filePath, destPath)

        const id = getRepo().create({
          title: fileName,
          type: assetType,
          file_path: destPath,
          file_format: getFileFormat(filePath),
        })

        imported.push({ id, title: fileName })
      }

      return { success: true, data: imported }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(VIDEO_CHANNELS.GET_AUDIO_DATA, (_event, filePath: string) => {
    try {
      filePath = managedPath(app.getPath('userData'), filePath)
      if (!existsSync(filePath)) {
        return { success: false, error: 'File not found' }
      }

      const stats = statSync(filePath)
      const ext = extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.flac': 'audio/flac',
        '.ogg': 'audio/ogg',
      }
      const mimeType = mimeTypes[ext] || 'audio/mpeg'

      const buffer = readFileSync(filePath)
      const base64 = buffer.toString('base64')
      const dataUrl = `data:${mimeType};base64,${base64}`

      return {
        success: true,
        data: {
          dataUrl,
          size: stats.size,
          mimeType,
        },
      }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
