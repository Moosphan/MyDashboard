import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { copyFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { VoiceoverService } from './voiceover/voiceover-service'
import { getDatabase } from '../database/connection'
import { managedPath } from './voiceover/media'
import { runCommand } from './voiceover/process'
import { VOICE_TERMINAL } from '../../shared/voiceover'
import type { VoiceJob } from '../../shared/voiceover'

interface EdgeVoice { name: string; shortName: string; gender: string; locale: string; friendlyName: string }
let service: VoiceoverService | null = null
let mainWindow: (() => BrowserWindow | null) | undefined
let cachedVoices: EdgeVoice[] | null = null

function broadcast(channel: string, payload?: unknown) {
  const window = mainWindow?.()
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
}

export function getVoiceoverService(): VoiceoverService {
  if (!service) {
    const worker = app.isPackaged ? join(process.resourcesPath, 'voice-runtime', 'worker.py') : join(app.getAppPath(), 'resources', 'voice-runtime', 'worker.py')
    service = new VoiceoverService(app.getPath('userData'), getDatabase(), worker, job => broadcast('tts:jobUpdated', job), () => broadcast('video:assetsChanged', { type: 'audio' }))
  }
  return service
}

export async function stopVoiceover(): Promise<void> {
  await service?.dispose()
  service = null
}

async function voices(): Promise<EdgeVoice[]> {
  if (cachedVoices?.length) return cachedVoices
  const response = await fetch('https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4', { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`EDGE_UNAVAILABLE: 音色列表请求失败（${response.status}）`)
  const data = await response.json() as Array<{ Name: string; ShortName: string; Gender: string; Locale: string; FriendlyName: string }>
  if (!Array.isArray(data)) throw new Error('EDGE_UNAVAILABLE: 无效音色列表')
  cachedVoices = data.map(voice => ({ name: voice.Name, shortName: voice.ShortName, gender: voice.Gender, locale: voice.Locale, friendlyName: voice.FriendlyName }))
  return cachedVoices
}

export function registerTtsHandlers(getMainWindow: () => BrowserWindow | null): void {
  mainWindow = getMainWindow
  const handle = <Arguments extends unknown[]>(channel: string, action: (...args: Arguments) => unknown) => {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const window = getMainWindow()
      if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return { success: false, error: '配音仅可在应用主窗口操作' }
      try { return { success: true, data: await action(...args as Arguments) } }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message, errorCode: message.split(':')[0] }
      }
    })
  }
  handle('tts:getVoices', voices)
  handle('tts:getVoicesByLocale', async (locale: string) => (await voices()).filter(voice => voice.locale.startsWith(locale)))
  handle('tts:getCapabilities', () => ({ runtime: getVoiceoverService().runtime.get(), maxTextLength: 300, modes: ['preset', 'clone'] }))
  handle('tts:getRuntime', () => getVoiceoverService().runtime.get())
  handle('tts:configureRuntime', (config: unknown) => {
    const instance = getVoiceoverService()
    if (instance.profiles.busy || instance.jobs.list().some(job => !VOICE_TERMINAL.includes(job.state))) throw new Error('生成或识别任务进行中，暂不能修改环境')
    return instance.runtime.configure(config)
  })
  handle('tts:checkRuntime', () => getVoiceoverService().runtime.check())
  handle('tts:selectRuntimePath', async (kind: string) => {
    if (!['pythonPath', 'ffmpegPath', 'ffprobePath', 'voxcpmModelPath', 'qwenModelPath', 'asrModelPath', 'denoiserPythonPath', 'denoiserModelPath'].includes(kind)) throw new Error('无效路径类型')
    const selection = await dialog.showOpenDialog(getMainWindow()!, { properties: [kind.includes('Model') ? 'openDirectory' : 'openFile'] })
    return selection.canceled ? null : selection.filePaths[0]
  })
  handle('tts:listProfiles', () => getVoiceoverService().repository.profiles())
  handle('tts:getProfile', (id: string) => getVoiceoverService().repository.profile(id))
  handle('tts:importReference', async () => {
    const selection = await dialog.showOpenDialog(getMainWindow()!, { properties: ['openFile'], filters: [{ name: '参考音频', extensions: ['wav', 'mp3', 'm4a', 'flac', 'ogg'] }] })
    return selection.canceled ? null : getVoiceoverService().profiles.importReference(selection.filePaths[0])
  })
  handle('tts:getDraftAudio', (id: string, start?: number, end?: number) => getVoiceoverService().profiles.preview(id, start, end))
  handle('tts:transcribeReference', (id: string, start?: number, end?: number) => getVoiceoverService().profiles.transcribe(id, start, end))
  handle('tts:saveProfile', (input: Parameters<VoiceoverService['profiles']['save']>[0]) => getVoiceoverService().profiles.save(input))
  handle('tts:getProfileAudio', (id: string, revision?: number) => getVoiceoverService().profiles.audio(id, revision))
  handle('tts:deleteProfile', (id: string) => getVoiceoverService().profiles.delete(id))
  handle('tts:purgeProfile', (id: string) => getVoiceoverService().profiles.purge(id))
  handle('tts:createJob', (input: unknown) => getVoiceoverService().create(input))
  handle('tts:compare', (inputs: unknown[]) => getVoiceoverService().compare(inputs))
  handle('tts:listJobs', () => getVoiceoverService().jobs.list())
  handle('tts:getJob', (id: string) => getVoiceoverService().jobs.get(id))
  handle('tts:cancelJob', (id: string) => getVoiceoverService().jobs.cancel(id))
  handle('tts:listAssets', async (trashed: boolean = false) => {
    const instance = getVoiceoverService()
    await instance.assets.migrateLegacy(instance.runtime.get().config.ffprobePath)
    return instance.assets.list(trashed)
  })
  handle('tts:restoreAsset', (id: number) => { getVoiceoverService().assets.restore(id); broadcast('video:assetsChanged', { type: 'audio' }) })
  handle('video:getAudioDataById', (id: number) => getVoiceoverService().assets.audio(id))
  handle('tts:getAssetPath', (id: number) => {
    const instance = getVoiceoverService()
    return managedPath(instance.root, instance.assets.asset(id).file_path)
  })
  handle('video:exportAudio', async (id: number) => {
    const instance = getVoiceoverService()
    const asset = instance.assets.asset(id)
    if (JSON.parse(asset.metadata).trashedAt) throw new Error('请先恢复音频')
    const source = managedPath(instance.root, asset.file_path)
    const result = await dialog.showSaveDialog(getMainWindow()!, { defaultPath: `${asset.title.replace(/[<>:"/\\|?*]/g, '_')}.${extname(source).slice(1)}`, filters: [{ name: 'WAV', extensions: ['wav'] }, { name: 'MP3', extensions: ['mp3'] }] })
    if (result.canceled || !result.filePath) return null
    const destination = resolve(result.filePath)
    const inUserData = !resolve(destination).startsWith(`${resolve(instance.root)}/`) ? false : true
    if (destination === source || inUserData) throw new Error('请选择应用素材目录之外的导出位置')
    if (!['.wav', '.mp3'].includes(extname(destination).toLowerCase())) throw new Error('导出格式仅支持 WAV / MP3')
    if (extname(source).toLowerCase() === extname(destination).toLowerCase()) copyFileSync(source, destination)
    else await runCommand(instance.runtime.get().config.ffmpegPath, ['-y', '-v', 'error', '-i', source, destination], undefined, 120000)
    return destination
  })
  handle('tts:getAudioData', (path: string) => {
    const instance = getVoiceoverService()
    const asset = instance.assets.list().find(item => managedPath(instance.root, item.file_path) === resolve(path))
    if (!asset) throw new Error('音频不属于已登记的生成素材')
    return instance.assets.audio(asset.id)
  })
  handle('tts:listFiles', async () => {
    const instance = getVoiceoverService()
    await instance.assets.migrateLegacy(instance.runtime.get().config.ffprobePath)
    return instance.assets.list().map(asset => ({ name: asset.title, path: managedPath(instance.root, asset.file_path) }))
  })
  handle('tts:deleteFile', (path: string) => {
    const instance = getVoiceoverService()
    const asset = instance.assets.list().find(item => managedPath(instance.root, item.file_path) === resolve(path))
    if (!asset) throw new Error('音频不属于已登记的生成素材')
    instance.assets.trash(asset.id)
    broadcast('video:assetsChanged', { type: 'audio' })
  })
  handle('tts:synthesize', async (text: string, voiceId: string, options: Record<string, string> = {}) => {
    const instance = getVoiceoverService()
    let job = await instance.create({ clientRequestId: randomUUID(), engine: 'edge', text, voiceId, options: { rate: Number.parseFloat(options.rate ?? '0'), pitchHz: Number.parseFloat(options.pitch ?? '0'), volume: Number.parseFloat(options.volume ?? '0') } })
    while (!VOICE_TERMINAL.includes(job.state)) {
      await new Promise(resolve => setTimeout(resolve, 250))
      job = instance.jobs.get(job.id) as VoiceJob
    }
    if (job.state !== 'succeeded' || !job.assetId) throw new Error(job.error ?? job.phase)
    const asset = instance.assets.asset(job.assetId)
    const filePath = managedPath(instance.root, asset.file_path)
    return { filePath, fileName: basename(filePath) }
  })
}
