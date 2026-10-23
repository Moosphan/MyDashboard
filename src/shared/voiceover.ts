export type VoiceEngine = 'edge' | 'voxcpm2' | 'qwen3-tts'
export type VoiceJobState = 'queued' | 'loading' | 'generating' | 'postprocessing' | 'registering' | 'succeeded' | 'cancelling' | 'cancelled' | 'failed' | 'interrupted'
export const VOICE_TERMINAL: VoiceJobState[] = ['succeeded', 'cancelled', 'failed', 'interrupted']
export const VOICE_MODELS = {
  voxcpm2: { id: 'mlx-community/VoxCPM2-8bit', revision: 'd52725898a0675703f7f9ddc5a4d1a3cdbb99032' },
  'qwen3-tts': { id: 'mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit', revision: 'e7dd0585652209fa0d7783659aad4e8a324de11c' },
} as const

export interface VoiceOptions {
  rate?: number
  pitchHz?: number
  volume?: number
  steps?: 10 | 20
  cfg?: number
  temperature?: number
  language?: 'zh' | 'en'
  seed?: number
  gainDb?: number
  denoise?: boolean
}

export interface VoiceRequest {
  clientRequestId: string
  engine: VoiceEngine
  text: string
  voiceId?: string
  profileId?: string
  profileRevision?: number
  comparisonGroupId?: string
  retryOfJobId?: string
  options: VoiceOptions
}

export interface VoiceJob {
  id: string
  request: VoiceRequest
  state: VoiceJobState
  phase: string
  revision: number
  attemptId: string
  assetId: number | null
  error: string | null
  createdAt: string
  updatedAt: string
  elapsedSeconds?: number
}

export interface VoiceProfileRevision {
  revision: number
  transcript: string
  referencePath: string
  originalPath: string
  sha256: string
  duration: number
  originalSha256?: string
  segment?: { start: number; end: number }
  preprocessingVersion?: number
}

export interface VoiceProfile {
  id: string
  name: string
  currentRevision: number
  revisions: VoiceProfileRevision[]
  deletedAt: string | null
}

export interface VoiceRuntimeConfig {
  pythonPath: string
  ffmpegPath: string
  ffprobePath: string
  voxcpmModelPath: string
  qwenModelPath: string
  asrModelPath: string
  denoiserPythonPath: string
  denoiserModelPath: string
}

export interface VoiceRuntime {
  config: VoiceRuntimeConfig
  supported: boolean
  checking: boolean
  transcription?: { ready: boolean; reason: string }
  denoising?: { ready: boolean; reason: string }
  engines: Record<'voxcpm2' | 'qwen3-tts', { ready: boolean; reason: string }>
  versions: Record<string, string>
}

export interface ReferenceDraft {
  id: string
  name: string
  duration: number
  waveform?: number[]
}

export function mergeVoiceJobs(current: VoiceJob[], incoming: VoiceJob[]): VoiceJob[] {
  const jobs = new Map(current.map(job => [job.id, job]))
  for (const job of incoming) {
    const existing = jobs.get(job.id)
    if (!existing || job.revision >= existing.revision) jobs.set(job.id, job)
  }
  return [...jobs.values()].sort((first, second) => second.createdAt.localeCompare(first.createdAt)).slice(0, 100)
}

export function resolveVoiceRequest(value: unknown): VoiceRequest {
  if (!value || typeof value !== 'object') throw new Error('INVALID_OPTIONS: 无效请求')
  const input = value as Record<string, unknown>
  if (!['edge', 'voxcpm2', 'qwen3-tts'].includes(String(input.engine))) throw new Error('INVALID_OPTIONS: 未知引擎')
  if (typeof input.clientRequestId !== 'string' || !input.clientRequestId || input.clientRequestId.length > 100) throw new Error('INVALID_OPTIONS: 缺少请求 ID')
  if (typeof input.text !== 'string' || !input.text.trim()) throw new Error('INVALID_OPTIONS: 请输入文案')
  if (Array.from(input.text.trim()).length > 300) throw new Error('INVALID_OPTIONS: 文案最多 300 字符，请拆段生成')
  const options = input.options ?? {}
  if (typeof options !== 'object' || Array.isArray(options)) throw new Error('INVALID_OPTIONS: 无效参数')
  const raw = options as Record<string, unknown>
  const allowed = input.engine === 'edge' ? ['rate', 'pitchHz', 'volume'] : input.engine === 'voxcpm2' ? ['steps', 'cfg', 'seed', 'gainDb', 'denoise'] : ['temperature', 'language', 'seed', 'gainDb', 'denoise']
  if (Object.keys(raw).some(key => !allowed.includes(key))) throw new Error('INVALID_OPTIONS: 引擎不支持这些参数')
  const number = (key: string, fallback: number, minimum: number, maximum: number) => {
    const result = raw[key] ?? fallback
    if (typeof result !== 'number' || !Number.isFinite(result) || result < minimum || result > maximum) throw new Error(`INVALID_OPTIONS: 参数 ${key} 越界`)
    return result
  }
  const request: VoiceRequest = { clientRequestId: input.clientRequestId, engine: input.engine as VoiceEngine, text: input.text.trim(), options: {} }
  if (input.engine === 'edge') {
    if (typeof input.voiceId !== 'string' || !/^[a-z]{2,3}-[A-Za-z0-9-]+$/.test(input.voiceId)) throw new Error('INVALID_OPTIONS: 请选择预设音色')
    request.voiceId = input.voiceId
    request.options = { rate: number('rate', 0, -50, 100), pitchHz: number('pitchHz', 0, -50, 50), volume: number('volume', 0, -50, 50) }
  } else {
    if (typeof input.profileId !== 'string' || !input.profileId || !Number.isInteger(input.profileRevision) || Number(input.profileRevision) < 1) throw new Error('REFERENCE_INVALID: 请选择参考音色')
    request.profileId = input.profileId
    request.profileRevision = Number(input.profileRevision)
    const seed = number('seed', Math.floor(Math.random() * 0x100000000), 0, 0xffffffff)
    if (!Number.isInteger(seed)) throw new Error('INVALID_OPTIONS: seed 必须为整数')
    if (raw.denoise !== undefined && typeof raw.denoise !== 'boolean') throw new Error('INVALID_OPTIONS: 自动降噪必须为布尔值')
    request.options = { seed, gainDb: number('gainDb', 0, -12, 6), denoise: raw.denoise ?? false }
    if (input.engine === 'voxcpm2') {
      const steps = number('steps', 20, 10, 20)
      if (steps !== 10 && steps !== 20) throw new Error('INVALID_OPTIONS: 扩散步数仅支持 10 / 20')
      request.options = { ...request.options, steps, cfg: number('cfg', 2, 1, 3) }
    } else {
      if (raw.language !== undefined && raw.language !== 'zh' && raw.language !== 'en') throw new Error('INVALID_OPTIONS: 不支持该语言')
      request.options = { ...request.options, language: raw.language === 'en' ? 'en' : 'zh', temperature: number('temperature', 0.7, 0.1, 1) }
    }
  }
  for (const key of ['comparisonGroupId', 'retryOfJobId'] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string' || input[key].length > 100) throw new Error('INVALID_OPTIONS: 无效关联 ID')
      request[key] = input[key]
    }
  }
  return request
}
