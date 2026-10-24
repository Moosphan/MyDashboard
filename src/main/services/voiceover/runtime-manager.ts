import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  realpathSync,
  statSync,
  rmSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { VoiceRuntime, VoiceRuntimeConfig } from '../../../shared/voiceover'
import { VOICE_MODELS } from '../../../shared/voiceover'
import { runCommand } from './process'
import { createHash } from 'node:crypto'

function binary(name: string): string {
  return (
    ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']
      .map((folder) => join(folder, name))
      .find(existsSync) ?? name
  )
}

export class VoiceRuntimeManager {
  private state: VoiceRuntime
  private pending: Promise<VoiceRuntime> | null = null
  private configFile: string
  private statusFile: string
  private checkedFingerprint?: string

  constructor(
    root: string,
    private platform = process.platform,
    private architecture = process.arch,
    private execute: typeof runCommand = runCommand,
  ) {
    this.configFile = join(root, 'config', 'voice-runtime.json')
    this.statusFile = join(root, 'config', 'voice-runtime-status.json')
    const snapshot = (engine: keyof typeof VOICE_MODELS) =>
      join(
        homedir(),
        '.cache',
        'huggingface',
        'hub',
        `models--${VOICE_MODELS[engine].id.replace('/', '--')}`,
        'snapshots',
        VOICE_MODELS[engine].revision,
      )
    const defaults: VoiceRuntimeConfig = {
      pythonPath: join(homedir(), '.cache', 'mydashboard-qwen3-tts', 'venv', 'bin', 'python'),
      ffmpegPath: binary('ffmpeg'),
      ffprobePath: binary('ffprobe'),
      voxcpmModelPath: snapshot('voxcpm2'),
      qwenModelPath: snapshot('qwen3-tts'),
      asrModelPath: join(
        homedir(),
        '.cache',
        'huggingface',
        'hub',
        'models--mlx-community--whisper-small-mlx',
        'snapshots',
        '45f3915923c7a79a5a5b5a7d909d39aeb0e5630e',
      ),
      denoiserPythonPath: join(
        homedir(),
        '.cache',
        'mydashboard-voice-denoiser',
        'venv',
        'bin',
        'python',
      ),
      denoiserModelPath: join(homedir(), '.cache', 'mydashboard-voice-denoiser', 'model'),
    }
    let saved: Partial<VoiceRuntimeConfig> = {}
    try {
      saved = JSON.parse(readFileSync(this.configFile, 'utf8'))
    } catch {
      saved = {}
    }
    const config = { ...defaults }
    for (const key of Object.keys(defaults) as (keyof VoiceRuntimeConfig)[])
      if (typeof saved[key] === 'string') config[key] = saved[key]!
    this.state = {
      config,
      supported: platform === 'darwin' && architecture === 'arm64',
      checking: false,
      denoising: { ready: false, reason: '请检测降噪环境' },
      engines: {
        voxcpm2: { ready: false, reason: '请检测本地环境' },
        'qwen3-tts': { ready: false, reason: '请检测本地环境' },
      },
      versions: {},
    }
    try {
      const cached = JSON.parse(readFileSync(this.statusFile, 'utf8'))
      if (
        this.state.supported &&
        cached.fingerprint === this.fingerprint() &&
        cached.state?.engines?.voxcpm2 &&
        cached.state?.engines?.['qwen3-tts']
      ) {
        this.state = { ...cached.state, config, supported: true, checking: false }
        this.checkedFingerprint = cached.fingerprint
      }
    } catch {
      this.checkedFingerprint = undefined
    }
  }

  get(): VoiceRuntime {
    return structuredClone(this.state)
  }

  private fingerprint(): string {
    const files: unknown[] = []
    const inspect = (path: string) => {
      try {
        const stat = statSync(path)
        files.push([path, realpathSync(path), stat.size, stat.mtimeMs, stat.ctimeMs])
      } catch {
        files.push([path, 'missing'])
      }
    }
    for (const [key, path] of Object.entries(this.state.config)) {
      inspect(path)
      if (key.endsWith('ModelPath')) {
        for (const directory of [path, join(path, 'speech_tokenizer')]) {
          inspect(directory)
          try {
            for (const entry of readdirSync(directory)
              .sort()
              .filter((name) => /\.(json|safetensors|npz|bin|model|txt)$/.test(name)))
              inspect(join(directory, entry))
          } catch {
            files.push([directory, 'unreadable'])
          }
        }
      }
    }
    for (const python of [this.state.config.pythonPath, this.state.config.denoiserPythonPath]) {
      const lib = join(dirname(dirname(python)), 'lib')
      inspect(lib)
      try {
        for (const version of readdirSync(lib)
          .sort()
          .filter((name) => name.startsWith('python'))) {
          const packages = join(lib, version, 'site-packages')
          inspect(packages)
          for (const entry of readdirSync(packages).sort()) {
            inspect(join(packages, entry))
            if (entry.endsWith('.dist-info'))
              for (const metadata of ['METADATA', 'RECORD'])
                inspect(join(packages, entry, metadata))
          }
        }
      } catch {
        files.push([lib, 'packages-unreadable'])
      }
    }
    return createHash('sha256')
      .update(
        JSON.stringify({
          policy: 1,
          platform: this.platform,
          architecture: this.architecture,
          config: this.state.config,
          files,
        }),
      )
      .digest('hex')
  }

  async ensureChecked(): Promise<VoiceRuntime> {
    if (this.pending) return this.pending
    if (this.checkedFingerprint === this.fingerprint()) return this.get()
    return this.check()
  }

  configure(input: unknown) {
    if (!input || typeof input !== 'object') throw new Error('无效环境配置')
    if (this.pending) throw new Error('环境检测中，请稍后修改')
    const config = { ...this.state.config }
    for (const key of Object.keys(config) as (keyof VoiceRuntimeConfig)[]) {
      const value = (input as Record<string, unknown>)[key]
      if (typeof value !== 'string' || !value.trim() || value.includes('\0'))
        throw new Error(`无效路径：${key}`)
      config[key] = value.trim()
    }
    mkdirSync(dirname(this.configFile), { recursive: true })
    writeFileSync(`${this.configFile}.tmp`, JSON.stringify(config, null, 2))
    renameSync(`${this.configFile}.tmp`, this.configFile)
    if (JSON.stringify(this.state.config) === JSON.stringify(config)) return this.get()
    this.checkedFingerprint = undefined
    this.state.config = config
    this.state.transcription = { ready: false, reason: '配置已修改，请重新检测' }
    this.state.denoising = { ready: false, reason: '配置已修改，请重新检测降噪环境' }
    this.state.engines = {
      voxcpm2: { ready: false, reason: '配置已修改，请重新检测' },
      'qwen3-tts': { ready: false, reason: '配置已修改，请重新检测' },
    }
    return this.get()
  }

  async check(): Promise<VoiceRuntime> {
    if (this.pending) return this.pending
    const before = this.fingerprint()
    this.checkedFingerprint = undefined
    try {
      rmSync(this.statusFile, { force: true })
    } catch (error) {
      console.warn('[VoiceRuntime] Unable to invalidate environment cache', error)
    }
    this.pending = this.performCheck()
      .then((state) => {
        const fingerprint = this.fingerprint()
        if (
          before === fingerprint &&
          (Object.values(state.engines).some((engine) => engine.ready) ||
            state.transcription?.ready ||
            state.denoising?.ready)
        ) {
          this.checkedFingerprint = fingerprint
          try {
            mkdirSync(dirname(this.statusFile), { recursive: true })
            writeFileSync(`${this.statusFile}.tmp`, JSON.stringify({ fingerprint, state }))
            renameSync(`${this.statusFile}.tmp`, this.statusFile)
          } catch {
            return state
          }
        }
        return state
      })
      .finally(() => {
        this.pending = null
      })
    return this.pending
  }

  private async performCheck(): Promise<VoiceRuntime> {
    this.state.checking = true
    try {
      if (!this.state.supported)
        throw new Error('UNSUPPORTED_PLATFORM: 本地克隆目前仅支持 Apple Silicon macOS')
      const { config } = this.state
      const script =
        'import json,platform,importlib.metadata as m; import mlx.core,mlx_audio,numpy,soundfile,transformers; print(json.dumps({"python":platform.python_version(),**{n:m.version(n) for n in ["mlx-audio","mlx","soundfile","transformers","numpy"]}}))'
      this.state.versions = JSON.parse(await this.execute(config.pythonPath, ['-c', script]))
      const expected: Record<string, string> = {
        python: '3.12.',
        'mlx-audio': '0.6.1',
        mlx: '0.32.4',
        soundfile: '0.14.0',
        transformers: '5.20.2',
        numpy: '2.5.4',
      }
      for (const [name, version] of Object.entries(expected)) {
        if (
          name === 'python'
            ? !this.state.versions[name]?.startsWith(version)
            : this.state.versions[name] !== version
        )
          throw new Error(
            `RUNTIME_INCOMPATIBLE: ${name} 需要 ${version}，当前 ${this.state.versions[name] ?? '未知'}`,
          )
      }
      await Promise.all([
        this.execute(config.ffmpegPath, ['-version']),
        this.execute(config.ffprobePath, ['-version']),
      ])
      try {
        await this.execute(config.pythonPath, [
          '-B',
          '-c',
          'import mlx_whisper; import importlib.metadata as m; assert m.version("mlx-whisper") == "0.4.3", "mlx-whisper requires 0.4.3"',
        ])
        const model = JSON.parse(readFileSync(join(config.asrModelPath, 'config.json'), 'utf8'))
        if (model.n_mels !== 80 || model.n_vocab !== 51865 || model.n_audio_state !== 768)
          throw new Error('请选择多语言 Whisper Small 模型')
        if (
          !existsSync(join(config.asrModelPath, 'weights.npz')) &&
          !existsSync(join(config.asrModelPath, 'weights.safetensors'))
        )
          throw new Error('自动识别模型缺少权重')
        this.state.transcription = { ready: true, reason: 'Whisper Small · 自动识别已就绪' }
      } catch (error) {
        this.state.transcription = { ready: false, reason: (error as Error).message }
      }
      for (const engine of ['voxcpm2', 'qwen3-tts'] as const) {
        try {
          const path = engine === 'voxcpm2' ? config.voxcpmModelPath : config.qwenModelPath
          for (const file of ['config.json', 'model.safetensors', 'tokenizer_config.json'])
            if (!existsSync(join(path, file))) throw new Error(`MODEL_MISSING: 缺少 ${file}`)
          const modelConfig = JSON.parse(readFileSync(join(path, 'config.json'), 'utf8'))
          const modelType = String(modelConfig.model_type ?? '')
          if (engine === 'voxcpm2' ? modelType !== 'voxcpm2' : !modelType.includes('qwen3_tts'))
            throw new Error('MODEL_CORRUPT: 模型类型与引擎不一致')
          if (modelConfig.quantization?.bits !== 8)
            throw new Error('RUNTIME_INCOMPATIBLE: 需要 8-bit 模型权重')
          if (
            engine === 'qwen3-tts' &&
            (modelConfig.tts_model_type !== 'base' || modelConfig.tts_model_size !== '1b7')
          )
            throw new Error('RUNTIME_INCOMPATIBLE: 声音克隆需要 Qwen3-TTS 1.7B Base 模型')
          if (engine === 'qwen3-tts' && !existsSync(join(path, 'speech_tokenizer', 'config.json')))
            throw new Error('MODEL_MISSING: 缺少 speech_tokenizer')
          this.state.engines[engine] = { ready: true, reason: '已就绪 · 本地 MLX 8-bit' }
        } catch (error) {
          this.state.engines[engine] = { ready: false, reason: (error as Error).message }
        }
      }
      try {
        for (const [filename, sha256] of Object.entries({
          'configuration.json': '877861f930f597b479887685556b33724a9c1c87e4a135207253f9bdc8e717a7',
          'pytorch_model.bin': 'b18896915e27a821585584221d0c0820f35e12145315ae3f1e73ccd5a68d195f',
        })) {
          const path = join(config.denoiserModelPath, filename)
          if (!existsSync(path)) throw new Error(`降噪模型缺少 ${filename}`)
          if (createHash('sha256').update(readFileSync(path)).digest('hex') !== sha256)
            throw new Error(`降噪模型校验失败：${filename}`)
        }
        const script =
          'import json,importlib.metadata as m; import torch,torchaudio; from modelscope.pipelines import pipeline; print(json.dumps({n:m.version(n) for n in ["modelscope","torch","torchaudio","torchcodec"]}))'
        const versions = JSON.parse(
          await this.execute(config.denoiserPythonPath, ['-B', '-c', script], undefined, 90000),
        )
        for (const [name, version] of Object.entries({
          modelscope: '1.34.0',
          torch: '2.11.0',
          torchaudio: '2.11.0',
          torchcodec: '0.11.0',
        })) {
          if (versions[name] !== version)
            throw new Error(`降噪环境 ${name} 需要 ${version}，当前 ${versions[name] ?? '未知'}`)
        }
        this.state.denoising = { ready: true, reason: 'ZipEnhancer · 自动降噪已就绪' }
      } catch (error) {
        this.state.denoising = {
          ready: false,
          reason: `降噪不可用：${(error as Error).message}。请配置降噪环境，或在高级参数中关闭自动降噪。`,
        }
      }
    } catch (error) {
      const reason = (error as Error).message
      this.state.engines = {
        voxcpm2: { ready: false, reason },
        'qwen3-tts': { ready: false, reason },
      }
      this.state.transcription = { ready: false, reason }
      this.state.denoising = { ready: false, reason }
    } finally {
      this.state.checking = false
    }
    return this.get()
  }
}
