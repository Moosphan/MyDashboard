import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import type { ReferenceDraft } from '../../../shared/voiceover'
import { VoiceRepository } from '../../database/repositories/voice-repository'
import { VoiceRuntimeManager } from './runtime-manager'
import { managedPath, readAudioData } from './media'
import { runCommand } from './process'
import type { ReferenceTranscriber } from './reference-transcriber'
import { referenceSelectionError } from '../../../shared/voice-reference'
import { referenceWaveform } from './reference-waveform'

export async function probeAudio(ffprobe: string, path: string): Promise<{ duration: number; sampleRate: number }> {
  const data = JSON.parse(await runCommand(ffprobe, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate:format=duration', '-of', 'json', path]))
  const duration = Number(data.format?.duration)
  const sampleRate = Number(data.streams?.[0]?.sample_rate)
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('OUTPUT_INVALID: 无法读取有效音频')
  return { duration, sampleRate }
}

export class VoiceProfileStore {
  private pending = new Map<string, { range: string; controller: AbortController; promise: Promise<{ transcript: string; start: number; end: number }> }>()

  constructor(private root: string, private repository: VoiceRepository, private runtime: VoiceRuntimeManager, private recognize?: ReferenceTranscriber) {}

  get busy() { return this.pending.size > 0 }

  private selection(draftId: string, start?: number, end?: number) {
    if (!/^[\w-]+$/.test(draftId)) throw new Error('无效参考 ID')
    const directory = managedPath(this.root, `cache/voice-references/${draftId}`)
    const draft = JSON.parse(readFileSync(join(directory, 'draft.json'), 'utf8'))
    const from = start ?? 0
    const to = end ?? Math.min(draft.duration, 15)
    const error = referenceSelectionError(draft.duration, from, to)
    if (error) throw new Error(error)
    return { directory, draft, start: from, end: Math.min(to, draft.duration) }
  }

  async transcribe(draftId: string, start?: number, end?: number) {
    const selection = this.selection(draftId, start, end)
    const range = `${selection.start}-${selection.end}`
    const active = this.pending.get(draftId)
    if (active?.range === range) return active.promise
    active?.controller.abort()
    const cache = join(selection.directory, `transcript-${range}.json`)
    if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8')) as { transcript: string; start: number; end: number }
    const controller = new AbortController()
    const promise = (async () => {
      if (!this.recognize) throw new Error('自动识别未配置，请检查本地模型或手动校对参考文字')
      const audio = join(selection.directory, `asr-${range}.wav`)
      await runCommand(this.runtime.get().config.ffmpegPath, ['-y', '-v', 'error', '-ss', String(selection.start), '-i', managedPath(this.root, selection.draft.original), '-t', String(selection.end - selection.start), '-ac', '1', '-ar', '16000', audio], controller.signal)
      const transcript = (await this.recognize(audio, controller.signal)).trim()
      if (controller.signal.aborted) throw new Error('识别已取消')
      if (!transcript || transcript.length > 3000) throw new Error('未识别到有效讲话，请重试或手动校对')
      const result = { transcript, start: selection.start, end: selection.end }
      writeFileSync(cache, JSON.stringify(result))
      return result
    })().finally(() => { if (this.pending.get(draftId)?.controller === controller) this.pending.delete(draftId) })
    this.pending.set(draftId, { range, controller, promise })
    return promise
  }

  async dispose() {
    const pending = [...this.pending.values()]
    pending.forEach(item => item.controller.abort())
    await Promise.allSettled(pending.map(item => item.promise))
  }

  async importReference(path: string): Promise<ReferenceDraft> {
    if (!['.wav', '.mp3', '.m4a', '.flac', '.ogg'].includes(extname(path).toLowerCase()) || statSync(path).size > 50 * 1024 * 1024) throw new Error('参考文件需为音频且不超过 50 MB')
    const draftId = randomUUID()
    const directory = managedPath(this.root, `cache/voice-references/${draftId}`)
    mkdirSync(directory, { recursive: true })
    try {
      const original = join(directory, `original${extname(path).toLowerCase()}`)
      copyFileSync(path, original)
      const config = this.runtime.get().config
      const info = await probeAudio(config.ffprobePath, original)
      if (info.duration < 3) throw new Error('参考录音至少需要 3 秒')
      await runCommand(config.ffmpegPath, ['-y', '-v', 'error', '-i', original, '-t', '30', '-ac', '1', '-ar', '24000', join(directory, 'preview.wav')])
      const waveform = await referenceWaveform(config.ffmpegPath, original, info.duration)
      const draft = { id: draftId, name: basename(path, extname(path)), duration: info.duration, original: relative(this.root, original) }
      writeFileSync(join(directory, 'draft.json'), JSON.stringify(draft))
      return { id: draft.id, name: draft.name, duration: draft.duration, waveform }
    } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error }
  }

  async preview(draftId: string, start?: number, end?: number) {
    if (!/^[\w-]+$/.test(draftId)) throw new Error('无效参考 ID')
    if (start !== undefined || end !== undefined) {
      const selection = this.selection(draftId, start, end)
      const filename = `preview-${randomUUID()}.wav`
      const output = join(selection.directory, filename)
      try {
        await runCommand(this.runtime.get().config.ffmpegPath, ['-y', '-v', 'error', '-ss', String(selection.start), '-i', managedPath(this.root, selection.draft.original), '-t', String(selection.end - selection.start), '-ac', '1', '-ar', '24000', output])
        return readAudioData(this.root, `cache/voice-references/${draftId}/${filename}`)
      } finally { rmSync(output, { force: true }) }
    }
    return readAudioData(this.root, `cache/voice-references/${draftId}/preview.wav`)
  }

  async save(input: { draftId?: string; profileId?: string; name: string; transcript?: string; confirmed?: boolean; start?: number; end?: number }) {
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) throw new Error('请填写音色名称（最多 80 字符）')
    if (input.transcript !== undefined && (typeof input.transcript !== 'string' || input.transcript.length > 3000)) throw new Error('参考文字最多 3000 字符')
    const previous = input.profileId ? this.repository.profile(input.profileId) : undefined
    if (input.profileId && (!previous || previous.deletedAt)) throw new Error('音色不存在')
    if (!input.draftId) {
      const reference = previous?.revisions.find(item => item.revision === previous.currentRevision)
      if (!reference) throw new Error('请先导入参考录音')
      return this.repository.saveProfile({ ...reference, id: previous!.id, name: input.name.trim(), transcript: input.transcript?.trim() || reference.transcript })
    }
    const { directory: draftFolder, draft, start, end } = this.selection(input.draftId, input.start, input.end)
    const directory = managedPath(this.root, `media/voice-profiles/${randomUUID()}`)
    mkdirSync(directory, { recursive: true })
    try {
      const original = join(directory, `original${extname(draft.original)}`)
      copyFileSync(managedPath(this.root, draft.original), original)
      const reference = join(directory, 'reference.wav')
      const config = this.runtime.get().config
      await runCommand(config.ffmpegPath, ['-y', '-v', 'error', '-ss', String(start), '-i', original, '-t', String(end - start), '-ac', '1', '-ar', '24000', '-af', 'alimiter=limit=0.891:level=false', reference])
      const info = await probeAudio(config.ffprobePath, reference)
      await runCommand(config.ffmpegPath, ['-v', 'error', '-i', reference, '-f', 'null', '-'])
      const pcm = readFileSync(reference)
      const chunk = pcm.indexOf(Buffer.from('data'), 12)
      if (chunk < 0) throw new Error('REFERENCE_INVALID: 参考音频格式无效')
      const length = Math.min(pcm.readUInt32LE(chunk + 4), pcm.length - chunk - 8)
      let squareSum = 0
      for (let offset = chunk + 8; offset + 1 < chunk + 8 + length; offset += 2) squareSum += (pcm.readInt16LE(offset) / 32768) ** 2
      if (!length || Math.sqrt(squareSum / (length / 2)) < 0.0001) throw new Error('REFERENCE_INVALID: 参考片段为静音或音量过低')
      const transcript = input.transcript?.trim() || (await this.transcribe(input.draftId, start, end)).transcript
      const profile = this.repository.saveProfile({ id: previous?.id, name: input.name.trim(), transcript, referencePath: relative(this.root, reference), originalPath: relative(this.root, original), sha256: createHash('sha256').update(readFileSync(reference)).digest('hex'), originalSha256: createHash('sha256').update(readFileSync(original)).digest('hex'), segment: { start, end }, preprocessingVersion: 1, duration: info.duration })
      rmSync(draftFolder, { recursive: true, force: true })
      return profile
    } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error }
  }

  audio(id: string, revision?: number) {
    const profile = this.repository.profile(id)
    if (!profile || profile.deletedAt) throw new Error('音色已删除或不存在')
    const reference = profile.revisions.find(item => item.revision === (revision ?? profile.currentRevision))
    if (!reference) throw new Error('音色版本不存在')
    return readAudioData(this.root, reference.referencePath)
  }

  delete(id: string) { this.repository.deleteProfile(id) }

  purge(id: string) {
    const profile = this.repository.profile(id)
    if (!profile?.deletedAt) throw new Error('请先移除音色')
    for (const revision of profile.revisions) {
      for (const file of [revision.referencePath, revision.originalPath]) {
        const path = managedPath(this.root, file)
        if (existsSync(path)) rmSync(path)
      }
    }
    this.repository.db.prepare('DELETE FROM voice_profiles WHERE id = ?').run(id)
  }
}
