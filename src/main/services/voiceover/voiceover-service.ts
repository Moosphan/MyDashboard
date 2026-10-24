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

export class VoiceoverService {
  readonly repository: VoiceRepository
  readonly runtime: VoiceRuntimeManager
  readonly profiles: VoiceProfileStore
  readonly assets: VoiceAssetStore
  readonly jobs: VoiceJobManager
  private localQueue = new LocalVoiceQueue()

  constructor(readonly root: string, db: Database.Database, worker: string, onJob: (job: VoiceJob) => void = () => {}, onAssets: () => void = () => {}) {
    this.repository = new VoiceRepository(db)
    this.runtime = new VoiceRuntimeManager(root)
    this.profiles = new VoiceProfileStore(root, this.repository, this.runtime, createReferenceTranscriber(worker, this.runtime, this.localQueue))
    this.assets = new VoiceAssetStore(root, this.repository)
    const local = createPythonAdapter(root, worker, this.runtime, this.repository)
    const edge = createEdgeAdapter(root, this.runtime)
    this.jobs = new VoiceJobManager(this.repository, root, (job, signal, phase) => job.request.engine === 'edge' ? edge(job, signal, phase) : this.localQueue.run(() => local(job, signal, phase), signal), onJob, onAssets)
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
      if (!runtime.engines[request.engine].ready) throw new Error(runtime.engines[request.engine].reason)
      if (request.options.denoise && !runtime.denoising?.ready) throw new Error(runtime.denoising?.reason ?? '请先检测降噪环境')
    } else {
      const config = this.runtime.get().config
      await Promise.all([runCommand(config.ffmpegPath, ['-version']), runCommand(config.ffprobePath, ['-version'])])
    }
    return this.jobs.create(request)
  }

  async compare(inputs: unknown[]) {
    const runtime = await this.runtime.ensureChecked()
    for (const engine of ['voxcpm2', 'qwen3-tts'] as const) if (!runtime.engines[engine].ready) throw new Error(`${engine}: ${runtime.engines[engine].reason}`)
    if (inputs.map(resolveVoiceRequest).some(request => request.options.denoise) && !runtime.denoising?.ready) throw new Error(runtime.denoising?.reason ?? '请先检测降噪环境')
    return this.jobs.compare(inputs)
  }
}
