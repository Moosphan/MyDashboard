import { spawn } from 'node:child_process'
import { basename, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { VOICE_MODELS } from '../../../shared/voiceover'
import type { VoiceRuntimeManager } from './runtime-manager'
import type { VoiceRepository } from '../../database/repositories/voice-repository'
import type { VoiceAdapter, VoiceOutput } from './job-manager'
import { managedPath } from './media'
import { prepareVoiceReference } from './reference-denoiser'

export function runVoiceWorker(python: string, script: string, request: Record<string, unknown>, signal: AbortSignal, phase: (message: string) => void = () => {}): Promise<VoiceOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script], { shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, HF_HUB_OFFLINE: '1', TOKENIZERS_PARALLELISM: 'false', PYTHONDONTWRITEBYTECODE: '1' } })
    let buffer = ''
    let errors = ''
    let output: VoiceOutput | undefined
    let failure: Error | undefined
    let force: ReturnType<typeof setTimeout> | undefined
    let loading = true
    const stop = (error: Error) => {
      failure ??= error
      child.kill('SIGTERM')
      force ??= setTimeout(() => child.kill('SIGKILL'), 3000)
    }
    const abort = () => stop(new Error('任务已取消'))
    const timer = setTimeout(() => stop(new Error('WORKER_EXITED: 生成超时')), 600000)
    const loadingTimer = setTimeout(() => { if (loading) stop(new Error('WORKER_EXITED: 模型加载超时')) }, 120000)
    const heartbeat = setInterval(() => { if (child.stdin.writable) child.stdin.write('{"type":"heartbeat"}\n') }, 5000)
    child.stdout.on('data', data => {
      buffer += data.toString()
      if (buffer.length > 1024 * 1024) { stop(new Error('Worker 协议输出超出限制')); return }
      const lines = buffer.split('\n')
      buffer = lines.pop()!
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          if (event.protocolVersion !== 1 || event.jobId !== request.jobId || event.attemptId !== request.attemptId) throw new Error('Worker 协议身份不匹配')
          if (event.type === 'phase' && typeof event.message === 'string') { loading = false; phase(event.message) }
          else if (event.type === 'result' && !output && typeof event.path === 'string' && Number.isFinite(event.duration) && Number.isFinite(event.sampleRate)) output = event
          else if (event.type === 'error') stop(new Error(String(event.message)))
          else throw new Error('Worker 协议消息无效')
        } catch (error) { stop(new Error(`Worker 协议错误：${(error as Error).message}`)) }
      }
    })
    child.stderr.on('data', data => { errors = (errors + data.toString()).slice(-4000) })
    child.stdin.on('error', () => {})
    child.on('error', error => { failure = error })
    child.on('close', code => {
      clearTimeout(timer); clearTimeout(loadingTimer); clearTimeout(force); clearInterval(heartbeat)
      signal.removeEventListener('abort', abort)
      if (failure) reject(failure)
      else if (code !== 0 || !output || buffer.trim()) reject(new Error(`WORKER_EXITED: ${errors || '未返回完整结果'}`))
      else resolve(output)
    })
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    else child.stdin.write(`${JSON.stringify({ ...request, protocolVersion: 1 })}\n`)
  })
}

export function createPythonAdapter(root: string, workerPath: string, runtime: VoiceRuntimeManager, repository: VoiceRepository): VoiceAdapter {
  return async (job, signal, phase) => {
    if (job.request.engine === 'edge') throw new Error('无效本地引擎')
    const state = runtime.get()
    if (!state.engines[job.request.engine].ready) throw new Error(state.engines[job.request.engine].reason)
    const profile = repository.profile(job.request.profileId!)
    const reference = profile?.revisions.find(item => item.revision === job.request.profileRevision)
    if (!reference || profile?.deletedAt) throw new Error('REFERENCE_INVALID: 参考声音不可用')
    const directory = join(root, 'cache', 'voice-jobs', job.id)
    const prepared = await prepareVoiceReference({
      enabled: job.request.options.denoise === true,
      referencePath: managedPath(root, reference.referencePath), referenceSha256: reference.sha256,
      outputPath: join(directory, 'reference-denoised.wav'), workerPath, runtime: state,
    }, signal, phase)
    phase('正在加载配音模型')
    const output = await runVoiceWorker(state.config.pythonPath, workerPath, {
      jobId: job.id, attemptId: job.attemptId, engine: job.request.engine, text: job.request.text,
      options: job.request.options, referencePath: prepared.path, referenceSha256: prepared.sha256,
      referenceText: reference.transcript, modelPath: job.request.engine === 'voxcpm2' ? state.config.voxcpmModelPath : state.config.qwenModelPath,
      outputPath: join(directory, 'raw.wav'),
    }, signal, phase)
    output.referenceDenoising = prepared.denoising
    output.path = managedPath(directory, output.path)
    if (output.rawPath !== undefined) output.rawPath = managedPath(directory, output.rawPath)
    const model = VOICE_MODELS[job.request.engine]
    const modelPath = job.request.engine === 'voxcpm2' ? state.config.voxcpmModelPath : state.config.qwenModelPath
    output.model = { id: model.id, revision: basename(modelPath) === model.revision ? model.revision : null, configSha256: createHash('sha256').update(readFileSync(join(modelPath, 'config.json'))).digest('hex'), runtimeVersion: state.versions['mlx-audio'] }
    return output
  }
}
