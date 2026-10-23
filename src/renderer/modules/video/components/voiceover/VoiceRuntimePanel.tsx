import { useEffect, useState } from 'react'
import type { VoiceRuntime, VoiceRuntimeConfig } from '@shared/voiceover'
import { voiceCall } from '../../hooks/useVoiceover'
import { VoiceButton, VoiceInput } from './VoiceControls'

export function VoiceRuntimePanel({ runtime, onChange, onError, busy }: { runtime: VoiceRuntime | null; onChange: (runtime: VoiceRuntime) => void; onError: (message: string | null) => void; busy: boolean }) {
  const [config, setConfig] = useState<VoiceRuntimeConfig | null>(null)
  const [checking, setChecking] = useState(false)
  useEffect(() => { if (runtime) setConfig(runtime.config) }, [runtime])
  const labels: Record<keyof VoiceRuntimeConfig, string> = { pythonPath: 'Python 3.12 可执行文件', ffmpegPath: 'FFmpeg', ffprobePath: 'ffprobe', voxcpmModelPath: 'VoxCPM2 8-bit 模型目录', qwenModelPath: 'Qwen3-TTS 1.7B Base 8-bit 模型目录', asrModelPath: 'Whisper Small 自动识别模型目录', denoiserPythonPath: '降噪 Python（独立环境）', denoiserModelPath: 'ZipEnhancer 降噪模型目录' }
  const check = async () => {
    if (!config) return
    setChecking(true); onError(null)
    try {
      await voiceCall('tts:configureRuntime', config)
      onChange(await voiceCall<VoiceRuntime>('tts:checkRuntime'))
    } catch (error) { onError((error as Error).message) }
    finally { setChecking(false) }
  }
  const browse = async (key: keyof VoiceRuntimeConfig) => {
    try {
      const path = await voiceCall<string | null>('tts:selectRuntimePath', key)
      if (path) setConfig(current => current ? { ...current, [key]: path } : current)
    } catch (error) { onError((error as Error).message) }
  }
  if (!runtime || !config) return <p className="text-on-surface-variant">正在读取本地环境…</p>
  return <div className="space-y-4">
    <div className="rounded-[12px] bg-surface-container-low p-4">
      <h4 className="text-[13px] font-semibold text-on-surface">本地模型 · 录音保留在本机</h4>
      <p className="text-[12px] leading-relaxed text-on-surface-variant mt-1">支持 Apple Silicon macOS，使用已安装的 Python 环境与模型缓存。</p>
    </div>
    <div className="grid grid-cols-2 gap-2">{Object.entries(runtime.engines).map(([engine, status]) => <div key={engine} className="flex items-start gap-1.5 text-[11px]"><span className={`material-symbols-outlined text-[16px] ${status.ready ? 'text-primary' : 'text-on-surface-variant'}`}>{status.ready ? 'check_circle' : 'info'}</span><div><strong>{engine}</strong><p className="text-on-surface-variant break-all">{status.reason}</p></div></div>)}</div>
    <div className="space-y-3">{(Object.keys(labels) as (keyof VoiceRuntimeConfig)[]).map(key => <div className="flex items-end gap-2" key={key}><div className="min-w-0 flex-1"><VoiceInput label={labels[key]} value={config[key]} title={config[key]} disabled={checking || busy} onChange={event => setConfig({ ...config, [key]: event.target.value })} /></div><VoiceButton className="mb-0.5" variant="secondary" disabled={checking || busy} aria-label={`选择 ${labels[key]}`} onClick={() => browse(key)}>选择</VoiceButton></div>)}</div>
    <VoiceButton onClick={check} disabled={checking || busy}>{checking ? '正在检测…' : '保存并检测环境'}</VoiceButton>
    {runtime.transcription && <p className={`text-[11px] ${runtime.transcription.ready ? 'text-primary' : 'text-error'}`}>{runtime.transcription.reason}</p>}
    {runtime.denoising && <p className={`text-[11px] ${runtime.denoising.ready ? 'text-primary' : 'text-on-surface-variant'}`}>{runtime.denoising.reason}</p>}
    {busy && <p className="text-body-sm text-on-surface-variant">请等待当前任务结束后再修改运行环境。</p>}
    {Object.keys(runtime.versions).length > 0 && <p className="text-[12px] text-on-surface-variant break-all">已检测：{Object.entries(runtime.versions).map(([key, value]) => `${key} ${value}`).join(' · ')}</p>}
  </div>
}
