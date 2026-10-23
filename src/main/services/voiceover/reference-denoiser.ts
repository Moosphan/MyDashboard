import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { VoiceRuntime } from '../../../shared/voiceover'
import { runCommand } from './process'

export interface ReferenceDenoising {
  model: string
  sha256: string
  sampleRate: number
}

interface ReferenceInput {
  enabled: boolean
  referencePath: string
  referenceSha256: string
  outputPath: string
  workerPath: string
  runtime: VoiceRuntime
}

export async function prepareVoiceReference(input: ReferenceInput, signal: AbortSignal, phase: (message: string) => void, execute = runCommand): Promise<{ path: string; sha256: string; denoising?: ReferenceDenoising }> {
  if (signal.aborted) throw new Error('任务已取消')
  if (!input.enabled) return { path: input.referencePath, sha256: input.referenceSha256 }
  if (!input.runtime.denoising?.ready) throw new Error(input.runtime.denoising?.reason ?? '降噪环境未就绪，请在本地模型中检测环境')
  phase('正在对参考录音自动降噪')
  const result = JSON.parse(await execute(input.runtime.config.denoiserPythonPath, [
    '-B', '-u', join(dirname(input.workerPath), 'denoise.py'),
    '--model', input.runtime.config.denoiserModelPath,
    '--audio', input.referencePath, '--sha256', input.referenceSha256, '--output', input.outputPath,
  ], signal, 300000))
  if (signal.aborted) throw new Error('任务已取消')
  if (result.sampleRate !== 16000 || !Number.isFinite(result.duration) || result.duration < 3 || result.duration > 30.05) throw new Error('DENOISE_FAILED: 降噪结果无效')
  const sha256 = createHash('sha256').update(readFileSync(input.outputPath)).digest('hex')
  return { path: input.outputPath, sha256, denoising: { model: 'iic/speech_zipenhancer_ans_multiloss_16k_base', sha256, sampleRate: result.sampleRate } }
}
