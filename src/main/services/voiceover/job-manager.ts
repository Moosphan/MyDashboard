import { randomUUID } from 'node:crypto'
import { mkdirSync, renameSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import type { VoiceJob, VoiceRequest } from '../../../shared/voiceover'
import { resolveVoiceRequest, VOICE_TERMINAL, VOICE_MODELS } from '../../../shared/voiceover'
import { VoiceRepository } from '../../database/repositories/voice-repository'
import { VideoAssetRepository } from '../../database/repositories/video-asset-repository'
import { managedPath } from './media'
import type { ReferenceDenoising } from './reference-denoiser'

export interface VoiceOutput {
  path: string
  rawPath?: string
  duration: number
  sampleRate: number
  generationSeconds?: number
  loadSeconds?: number
  peakMemoryBytes?: number
  referenceDenoising?: ReferenceDenoising
  model?: { id: string; revision: string | null; configSha256: string; runtimeVersion: string }
}
export type VoiceAdapter = (
  job: VoiceJob,
  signal: AbortSignal,
  phase: (message: string) => void,
) => Promise<VoiceOutput>

export class VoiceJobManager {
  private running = new Map<string, { controller: AbortController; promise: Promise<void> }>()
  private disposed = false

  constructor(
    readonly repository: VoiceRepository,
    private root: string,
    private adapter: VoiceAdapter,
    private changed: (job: VoiceJob) => void = () => {},
    private assetsChanged: () => void = () => {},
  ) {
    repository.recover()
    const cache = join(root, 'cache', 'voice-jobs')
    rmSync(cache, { recursive: true, force: true })
    mkdirSync(cache, { recursive: true })
    const outputs = join(root, 'media', 'audio', 'voiceover')
    mkdirSync(outputs, { recursive: true })
    for (const entry of readdirSync(outputs, { withFileTypes: true })) {
      if (entry.isDirectory() && !repository.job(entry.name)?.assetId)
        rmSync(join(outputs, entry.name), { recursive: true, force: true })
    }
  }

  get(id: string) {
    return this.repository.job(id)
  }
  list() {
    return this.repository.listJobs()
  }

  delete(id: string) {
    this.repository.deleteJob(id)
  }

  create(input: unknown): VoiceJob {
    if (this.disposed) throw new Error('配音模块正在退出')
    const request = resolveVoiceRequest(input)
    const existing = this.repository.byRequest(request.clientRequestId)
    if (existing) return existing
    this.validateProfile(request)
    if (this.repository.listJobs(10000).filter((job) => job.state === 'queued').length >= 20)
      throw new Error('QUEUE_FULL: 等待队列已满')
    const job = this.repository.createJob(request)
    this.changed(job)
    queueMicrotask(() => this.drain())
    return job
  }

  compare(inputs: unknown[]): VoiceJob[] {
    if (this.disposed) throw new Error('配音模块正在退出')
    if (!Array.isArray(inputs) || inputs.length !== 2) throw new Error('对比需要两个引擎')
    const requests = inputs.map(resolveVoiceRequest)
    if (requests[0].clientRequestId === requests[1].clientRequestId)
      throw new Error('两个任务需要不同的请求 ID')
    if (
      new Set(requests.map((item) => item.engine)).size !== 2 ||
      requests.some((item) => item.engine === 'edge') ||
      requests[0].text !== requests[1].text ||
      requests[0].profileId !== requests[1].profileId ||
      requests[0].profileRevision !== requests[1].profileRevision ||
      requests[0].options.denoise !== requests[1].options.denoise
    )
      throw new Error('对比必须使用同一音色、版本、文案和降噪设置')
    const existing = requests.map((request) => this.repository.byRequest(request.clientRequestId))
    if (existing.some(Boolean)) {
      if (
        existing.every(Boolean) &&
        existing[0]!.request.comparisonGroupId &&
        existing[0]!.request.comparisonGroupId === existing[1]!.request.comparisonGroupId
      )
        return existing as VoiceJob[]
      throw new Error('请求 ID 已用于其他任务')
    }
    for (const request of requests) this.validateProfile(request)
    if (this.repository.listJobs(10000).filter((job) => job.state === 'queued').length > 18)
      throw new Error('QUEUE_FULL: 等待队列已满')
    const group = randomUUID()
    const jobs = this.repository.db.transaction(() =>
      requests.map((request) =>
        this.repository.createJob({ ...request, comparisonGroupId: group }),
      ),
    )()
    for (const job of jobs) this.changed(job)
    queueMicrotask(() => this.drain())
    return jobs
  }

  cancel(id: string): VoiceJob {
    const job = this.get(id)
    if (!job) throw new Error('任务不存在')
    if (VOICE_TERMINAL.includes(job.state)) return job
    const active = this.running.get(id)
    const result = this.update(id, {
      state: active ? 'cancelling' : 'cancelled',
      phase: active ? '正在停止生成' : '已取消',
    })
    active?.controller.abort()
    return result
  }

  async dispose(): Promise<void> {
    this.disposed = true
    for (const job of this.repository.listJobs(10000)) {
      if (!VOICE_TERMINAL.includes(job.state))
        this.update(job.id, { state: 'interrupted', phase: '应用退出，任务已中断' })
    }
    for (const item of this.running.values()) item.controller.abort()
    await Promise.allSettled([...this.running.values()].map((item) => item.promise))
  }

  private validateProfile(request: VoiceRequest) {
    if (request.engine === 'edge' || request.voiceDesign) return
    const profile = this.repository.profile(request.profileId!)
    if (
      !profile ||
      profile.deletedAt ||
      !profile.revisions.some(
        (item) => item.revision === request.profileRevision && item.transcript.trim(),
      )
    )
      throw new Error('REFERENCE_INVALID: 音色或确认转写不存在')
  }

  private update(id: string, changes: Parameters<VoiceRepository['updateJob']>[1]) {
    const job = this.repository.updateJob(id, changes)
    this.changed(job)
    return job
  }

  private drain() {
    if (this.disposed) return
    const waiting = this.repository
      .listJobs(10000)
      .reverse()
      .filter((job) => job.state === 'queued')
    for (const job of waiting) {
      const lane = job.request.engine === 'edge' ? 'edge' : 'local'
      if (
        [...this.running.keys()].some(
          (id) => (this.get(id)?.request.engine === 'edge' ? 'edge' : 'local') === lane,
        )
      )
        continue
      const controller = new AbortController()
      const promise = Promise.resolve().then(() => this.execute(job, controller))
      this.running.set(job.id, { controller, promise })
      void promise
        .catch((error) => console.error('Voiceover task failed:', error))
        .finally(() => {
          this.running.delete(job.id)
          this.drain()
        })
    }
  }

  private async execute(job: VoiceJob, controller: AbortController) {
    const started = Date.now()
    const temporary = join(this.root, 'cache', 'voice-jobs', job.id)
    mkdirSync(temporary, { recursive: true })
    const timeout = setTimeout(() => controller.abort(new Error('JOB_TIMEOUT: 生成超时')), 600000)
    try {
      if (this.disposed) return
      if (controller.signal.aborted) throw controller.signal.reason ?? new Error('已取消')
      this.update(job.id, { state: 'loading', phase: '准备引擎' })
      const output = await this.adapter(job, controller.signal, (message) => {
        if (!controller.signal.aborted && !this.disposed)
          this.update(job.id, { state: 'generating', phase: message })
      })
      if (controller.signal.aborted || this.disposed)
        throw controller.signal.reason ?? new Error('已取消')
      this.update(job.id, { state: 'postprocessing', phase: '校验音频' })
      const source = managedPath(temporary, relative(temporary, output.path))
      if (
        !(output.duration > 0 && output.duration <= 120) ||
        !Number.isFinite(output.sampleRate) ||
        !['.wav', '.mp3'].includes(extname(source))
      )
        throw new Error('OUTPUT_INVALID: 输出音频无效')
      this.update(job.id, { state: 'registering', phase: '保存至 Audio Assets' })
      const destination = join(this.root, 'media', 'audio', 'voiceover', job.id)
      mkdirSync(destination, { recursive: true })
      try {
        const path = join(destination, `${output.rawPath ? 'output' : 'raw'}${extname(source)}`)
        renameSync(source, path)
        let rawPath = path
        if (output.rawPath) {
          const raw = managedPath(temporary, relative(temporary, output.rawPath))
          rawPath = join(destination, `raw${extname(raw)}`)
          renameSync(raw, rawPath)
        }
        const profile = job.request.profileId
          ? this.repository.profile(job.request.profileId)
          : undefined
        const reference = profile?.revisions.find(
          (item) => item.revision === job.request.profileRevision,
        )
        const metadata = {
          schemaVersion: 1,
          source: 'voiceover',
          mode: job.request.voiceDesign
            ? 'design'
            : job.request.engine === 'edge'
              ? 'preset'
              : 'clone',
          voiceDesign: job.request.voiceDesign,
          jobId: job.id,
          engine: job.request.engine,
          backend: job.request.engine === 'edge' ? 'edge-online' : 'mlx-local',
          model:
            job.request.engine === 'edge'
              ? null
              : (output.model ?? { id: VOICE_MODELS[job.request.engine].id, revision: null }),
          profileId: profile?.id,
          profileNameSnapshot: profile?.name,
          profileRevision: reference?.revision,
          referenceSha256: reference?.sha256,
          referenceDenoising: output.referenceDenoising,
          text: job.request.text,
          options: job.request.options,
          sampleRate: output.sampleRate,
          duration: output.duration,
          generationSeconds: output.generationSeconds,
          loadSeconds: output.loadSeconds,
          peakMemoryBytes: output.peakMemoryBytes,
          rawPath: relative(this.root, rawPath),
        }
        writeFileSync(join(destination, 'generation.json'), JSON.stringify(metadata, null, 2))
        this.repository.db.transaction(() => {
          const assetId = new VideoAssetRepository(this.repository.db).create({
            title: `${profile?.name ?? (job.request.voiceDesign ? `设计声音 · ${job.request.voiceDesign.slice(0, 18)}` : job.request.voiceId)} · ${job.request.text.slice(0, 24)}`,
            type: 'audio',
            file_path: relative(this.root, path),
            file_format: extname(path).slice(1).toUpperCase(),
            file_size: statSync(path).size,
            duration_seconds: output.duration,
            tags: ['voiceover'],
            metadata,
          })
          this.repository.updateJob(job.id, {
            state: 'succeeded',
            phase: '已保存至 Audio Assets',
            assetId,
            elapsedSeconds: (Date.now() - started) / 1000,
          })
        })()
      } catch (error) {
        rmSync(destination, { recursive: true, force: true })
        throw error
      }
      this.changed(this.get(job.id)!)
      this.assetsChanged()
    } catch (error) {
      if (!this.disposed)
        this.update(job.id, {
          state:
            controller.signal.aborted &&
            !(
              controller.signal.reason instanceof Error &&
              controller.signal.reason.message.includes('JOB_TIMEOUT')
            )
              ? 'cancelled'
              : 'failed',
          phase:
            controller.signal.aborted &&
            controller.signal.reason instanceof Error &&
            controller.signal.reason.message.includes('JOB_TIMEOUT')
              ? '生成超时'
              : controller.signal.aborted
                ? '已停止'
                : '生成失败',
          error: String(
            controller.signal.aborted &&
              controller.signal.reason instanceof Error &&
              controller.signal.reason.message.includes('JOB_TIMEOUT')
              ? controller.signal.reason.message
              : error instanceof Error
                ? error.message
                : error,
          ),
          elapsedSeconds: (Date.now() - started) / 1000,
        })
    } finally {
      clearTimeout(timeout)
      rmSync(temporary, { recursive: true, force: true })
    }
  }
}
