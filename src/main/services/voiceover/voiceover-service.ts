import type Database from 'better-sqlite3'
import type { VoiceJob } from '../../../shared/voiceover'
import { resolveVoiceRequest } from '../../../shared/voiceover'
import { VoiceRepository } from '../../database/repositories/voice-repository'
import { VoiceJobManager } from './job-manager'
import { VoiceRuntimeManager } from './runtime-manager'
import { VoiceProfileStore } from './profile-store'
import { VoiceAssetStore } from './asset-writer'
import { createPythonAdapter } from './python-adapter'
import { createEdgeAdapter } from './edge-adapter'
import { runCommand } from './process'
import { LocalVoiceQueue } from './local-voice-queue'
import { createReferenceTranscriber } from './reference-transcriber'
import { VoiceDesignStore } from './design-store'
import { VOICE_DESIGN_PRESETS } from '../../../shared/voice-design'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { managedPath } from './media'

export class VoiceoverService {
  readonly repository: VoiceRepository
  readonly runtime: VoiceRuntimeManager
  readonly profiles: VoiceProfileStore
  readonly assets: VoiceAssetStore
  readonly jobs: VoiceJobManager
  readonly designs: VoiceDesignStore
  private localQueue = new LocalVoiceQueue()

  constructor(
    readonly root: string,
    db: Database.Database,
    worker: string,
    onJob: (job: VoiceJob) => void = () => {},
    onAssets: () => void = () => {},
  ) {
    this.repository = new VoiceRepository(db)
    this.runtime = new VoiceRuntimeManager(root)
    this.profiles = new VoiceProfileStore(
      root,
      this.repository,
      this.runtime,
      createReferenceTranscriber(worker, this.runtime, this.localQueue),
    )
    this.assets = new VoiceAssetStore(root, this.repository)
    this.designs = new VoiceDesignStore(root)
    const local = createPythonAdapter(root, worker, this.runtime, this.repository)
    const edge = createEdgeAdapter(root, this.runtime)
    this.jobs = new VoiceJobManager(
      this.repository,
      root,
      (job, signal, phase) =>
        job.request.engine === 'edge'
          ? edge(job, signal, phase)
          : this.localQueue.run(() => local(job, signal, phase), signal),
      onJob,
      onAssets,
    )
  }

  async dispose() {
    await Promise.all([this.jobs.dispose(), this.profiles.dispose()])
    await this.localQueue.drain()
  }

  async create(input: unknown) {
    const request = resolveVoiceRequest(input)
    const previous = this.repository.byRequest(request.clientRequestId)
    if (previous) return previous
    if (request.engine !== 'edge') {
      const runtime = await this.runtime.ensureChecked()
      if (!runtime.engines[request.engine].ready)
        throw new Error(runtime.engines[request.engine].reason)
      if (request.options.denoise && !runtime.denoising?.ready)
        throw new Error(runtime.denoising?.reason ?? '请先检测降噪环境')
    } else {
      const config = this.runtime.get().config
      await Promise.all([
        runCommand(config.ffmpegPath, ['-version']),
        runCommand(config.ffprobePath, ['-version']),
      ])
    }
    return this.jobs.create(request)
  }

  async compare(inputs: unknown[]) {
    const runtime = await this.runtime.ensureChecked()
    for (const engine of ['voxcpm2', 'qwen3-tts'] as const)
      if (!runtime.engines[engine].ready)
        throw new Error(`${engine}: ${runtime.engines[engine].reason}`)
    if (
      inputs.map(resolveVoiceRequest).some((request) => request.options.denoise) &&
      !runtime.denoising?.ready
    )
      throw new Error(runtime.denoising?.reason ?? '请先检测降噪环境')
    return this.jobs.compare(inputs)
  }

  async saveDesignedProfile(jobId: string, name: string) {
    const job = this.jobs.get(jobId)
    if (!job || job.state !== 'succeeded' || !job.assetId || !job.request.voiceDesign)
      throw new Error('请先完成文字造声任务并试听')
    if (typeof name !== 'string' || !name.trim() || name.length > 60)
      throw new Error('音色名称须为 1–60 字符')
    const asset = this.assets.asset(job.assetId)
    if (JSON.parse(asset.metadata).trashedAt) throw new Error('请先恢复音频')
    if (!asset.duration_seconds || asset.duration_seconds < 3 || asset.duration_seconds > 30)
      throw new Error('请用 3–30 秒的完整短句生成声音样本后保存音色')
    const { managedPath } = await import('./media')
    const draft = await this.profiles.importReference(managedPath(this.root, asset.file_path))
    return this.profiles.save({
      draftId: draft.id,
      name: name.trim(),
      start: 0,
      end: draft.duration,
      transcript: job.request.text,
    })
  }

  async useVoiceDesignPreset(id: string, samplesDirectory: string) {
    const preset = VOICE_DESIGN_PRESETS.find((item) => item.id === id)
    if (!preset) throw new Error('请选择内置声音')
    const path = managedPath(samplesDirectory, `${preset.id}.wav`)
    const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
    const existing = this.repository
      .profiles()
      .find((profile) => profile.revisions.some((revision) => revision.originalSha256 === sha256))
    if (existing) return existing
    const draft = await this.profiles.importReference(path)
    return this.profiles.save({
      draftId: draft.id,
      name: preset.name,
      transcript: preset.sampleText!,
      start: 0,
      end: draft.duration,
    })
  }
}
