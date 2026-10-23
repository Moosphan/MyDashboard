import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { VoiceAdapter } from './job-manager'
import type { VoiceRuntimeManager } from './runtime-manager'
import { probeAudio } from './profile-store'
import { runCommand } from './process'

export function createEdgeAdapter(root: string, runtime: VoiceRuntimeManager, createTts: () => Pick<MsEdgeTTS, 'setMetadata' | 'toStream' | 'close'> = () => new MsEdgeTTS()): VoiceAdapter {
  return async (job, signal, phase) => {
    const tts = createTts()
    let rejectConnection: ((error: Error) => void) | undefined
    const connectionStopped = new Promise<never>((_resolve, reject) => { rejectConnection = reject })
    const abort = () => { tts.close(); rejectConnection?.(new Error('任务已取消')) }
    const connectionTimeout = setTimeout(() => { tts.close(); rejectConnection?.(new Error('EDGE_UNAVAILABLE: 连接超时')) }, 30000)
    signal.addEventListener('abort', abort, { once: true })
    try {
      if (signal.aborted) throw new Error('任务已取消')
      await Promise.race([tts.setMetadata(job.request.voiceId!, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {}).finally(() => { if (signal.aborted) tts.close() }), connectionStopped])
      clearTimeout(connectionTimeout)
      rejectConnection = undefined
      if (signal.aborted) throw new Error('任务已取消')
      phase('正在生成预设配音（在线）')
      const { rate = 0, pitchHz = 0, volume = 0 } = job.request.options
      const signed = (value: number, suffix: string) => `${value >= 0 ? '+' : ''}${value}${suffix}`
      const { audioStream } = tts.toStream(job.request.text, { rate: signed(rate, '%'), pitch: signed(pitchHz, 'Hz'), volume: signed(volume, '%') })
      const path = join(root, 'cache', 'voice-jobs', job.id, 'raw.mp3')
      await pipeline(audioStream, createWriteStream(path), { signal })
      const config = runtime.get().config
      const info = await probeAudio(config.ffprobePath, path)
      await runCommand(config.ffmpegPath, ['-v', 'error', '-i', path, '-f', 'null', '-'], signal)
      return { path, ...info }
    } catch (error) {
      if (!signal.aborted && error instanceof Error && /Unexpected server response: 429/.test(error.message)) {
        throw new Error('EDGE_RATE_LIMITED: Edge 在线配音服务限流（HTTP 429），请稍后重试。', { cause: error })
      }
      throw error
    } finally { clearTimeout(connectionTimeout); signal.removeEventListener('abort', abort); tts.close() }
  }
}
