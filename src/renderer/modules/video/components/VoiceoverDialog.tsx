import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VOICE_TERMINAL, type VoiceJob, type VoiceRequest } from '@shared/voiceover'
import { useVoiceover, voiceCall } from '../hooks/useVoiceover'
import { VoiceSelect, VoiceNumber } from './voiceover/VoiceEngineFields'
import { VoiceRuntimePanel } from './voiceover/VoiceRuntimePanel'
import { VoiceProfilePanel } from './voiceover/VoiceProfilePanel'
import { VoiceJobList } from './voiceover/VoiceJobList'
import { VoiceButton, VoiceInput, VoiceRadioGroup, VoiceSlider, VoiceTextArea } from './voiceover/VoiceControls'
import { VoiceAudioPlayer } from './voiceover/VoiceAudioPlayer'
import { Toggle } from '@/components/ui/toggle'
import './voiceover/voiceover.css'

interface EdgeVoice { shortName: string; friendlyName: string; locale: string; gender: string }

export function VoiceoverDialog({ open, onClose, onActiveJobsChange }: { open: boolean; onClose: () => void; onActiveJobsChange?: (count: number) => void }) {
  const state = useVoiceover(open)
  const [tab, setTab] = useState('compose')
  const [mode, setMode] = useState('preset')
  const [engine, setEngine] = useState<'voxcpm2' | 'qwen3-tts'>('voxcpm2')
  const [profileId, setProfileId] = useState('')
  const [text, setText] = useState('')
  const [voices, setVoices] = useState<EdgeVoice[]>([])
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const [locale, setLocale] = useState('zh')
  const [voiceId, setVoiceId] = useState('')
  const [rate, setRate] = useState(0)
  const [pitchHz, setPitchHz] = useState(0)
  const [volume, setVolume] = useState(0)
  const [steps, setSteps] = useState<10 | 20>(20)
  const [cfg, setCfg] = useState(2)
  const [promptPauseMs, setPromptPauseMs] = useState(320)
  const [temperature, setTemperature] = useState(0.7)
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [seed, setSeed] = useState('')
  const [gainDb, setGainDb] = useState(0)
  const [denoise, setDenoise] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioSource, setAudioSource] = useState<{ channel: string; id: unknown } | null>(null)
  const player = useRef<HTMLAudioElement>(null)
  const playSequence = useRef(0)
  const draftAudioActive = useRef(false)
  const active = state.jobs.filter(job => !VOICE_TERMINAL.includes(job.state)).length
  const profile = state.profiles.find(item => item.id === profileId)
  const selectedVoices = voices.filter(voice => voice.locale.startsWith(locale))

  useEffect(() => { onActiveJobsChange?.(active) }, [active, onActiveJobsChange])
  const fetchVoices = useCallback(async () => {
    setVoiceLoading(true); setVoiceError(null)
    try { setVoices(await voiceCall<EdgeVoice[]>('tts:getVoices')) }
    catch (error) { setVoiceError((error as Error).message) }
    finally { setVoiceLoading(false) }
  }, [])
  useEffect(() => { if (open && mode === 'preset' && !voices.length) void fetchVoices() }, [open, mode, voices.length, fetchVoices])
  useEffect(() => {
    if (voices.length && !voices.some(voice => voice.locale.startsWith(locale) && voice.shortName === voiceId)) {
      setVoiceId(voices.find(voice => voice.locale.startsWith(locale))?.shortName ?? '')
    }
  }, [voices, locale, voiceId])
  useEffect(() => {
    if (!open) { playSequence.current++; player.current?.pause(); setAudioUrl(null); setAudioSource(null) }
  }, [open])
  useEffect(() => {
    const pause = (event: Event) => { if ((event as CustomEvent).detail !== 'voiceover') player.current?.pause() }
    window.addEventListener('video:audioPlaying', pause)
    return () => window.removeEventListener('video:audioPlaying', pause)
  }, [])
  const play = async (channel: string, ...args: unknown[]) => {
    const sequence = ++playSequence.current
    draftAudioActive.current = channel === 'tts:getDraftAudio'
    player.current?.pause()
    try {
      const audio = await voiceCall<{ dataUrl: string }>(channel, ...args)
      if (sequence === playSequence.current) {
        setAudioSource({ channel, id: args[0] })
        if (audio.dataUrl === audioUrl && player.current) { player.current.currentTime = 0; await player.current.play() }
        else setAudioUrl(audio.dataUrl)
      }
    } catch (error) { state.setError((error as Error).message) }
  }
  const stopDraftAudio = useCallback(() => {
    if (!draftAudioActive.current) return
    draftAudioActive.current = false
    playSequence.current++
    player.current?.pause()
    setAudioUrl(null); setAudioSource(null)
  }, [])
  const request = (target: VoiceRequest['engine']): VoiceRequest => ({
    clientRequestId: crypto.randomUUID(), engine: target, text,
    ...(target === 'edge' ? { voiceId, options: { rate, pitchHz, volume } } : {
      profileId, profileRevision: profile?.currentRevision,
      options: { ...(seed.trim() ? { seed: Number(seed) } : {}), gainDb, denoise, ...(target === 'voxcpm2' ? { steps, cfg, promptPauseMs } : { temperature, language }) },
    }),
  })
  const submit = async (compare = false) => {
    setSubmitting(true); state.setError(null)
    try {
      if (compare) await voiceCall('tts:compare', [request('voxcpm2'), request('qwen3-tts')])
      else await voiceCall('tts:createJob', request(mode === 'preset' ? 'edge' : engine))
      await state.refresh()
    } catch (error) { state.setError((error as Error).message) }
    finally { setSubmitting(false) }
  }
  const retry = async (job: VoiceJob) => {
    try { await voiceCall('tts:createJob', { ...job.request, clientRequestId: crypto.randomUUID(), retryOfJobId: job.id }); await state.refresh() }
    catch (error) { state.setError((error as Error).message) }
  }
  const localReady = Boolean(state.runtime?.engines[engine].ready)
  const denoisingReady = !denoise || Boolean(state.runtime?.denoising?.ready)
  const canGenerate = !submitting && text.trim().length > 0 && Array.from(text.trim()).length <= 300 && (mode === 'preset' ? Boolean(voiceId) : Boolean(profile && localReady && denoisingReady))
  const selectProfile = (id: string) => { setProfileId(id); setMode('clone'); setTab('compose') }

  const sliders = [
    { label: '语速', value: rate, change: setRate, min: -50, max: 100, unit: '%' },
    { label: '音调', value: pitchHz, change: setPitchHz, min: -50, max: 50, unit: 'Hz' },
    { label: '音量', value: volume, change: setVolume, min: -50, max: 50, unit: '%' },
  ]
  const playingAsset = state.assets.find(asset => audioSource?.channel === 'video:getAudioDataById' && asset.id === audioSource.id)
  const playingProfile = state.profiles.find(item => audioSource?.channel === 'tts:getProfileAudio' && item.id === audioSource.id)
  const audioTitle = playingAsset?.title ?? playingProfile?.name ?? (audioSource?.channel === 'tts:getDraftAudio' ? '参考录音试听' : '选择一段音频开始试听')

  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose() }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
    <Dialog.Content className="voiceover-dialog fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1040px,96vw)] h-[min(720px,92vh)] flex flex-col bg-surface-container-lowest text-on-surface rounded-[24px] shadow-xl border border-outline-variant/40 overflow-hidden">
      <header className="px-6 py-4 flex shrink-0 items-center justify-between border-b border-outline-variant/40">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary rounded-[12px] bg-primary/10 p-2.5 text-[22px]" aria-hidden="true">graphic_eq</span>
          <div><Dialog.Title className="text-[18px] font-medium leading-6">AI Voiceover</Dialog.Title><Dialog.Description className="text-[12px] text-on-surface-variant mt-0.5">用熟悉的声音，讲出新的灵感</Dialog.Description></div>
        </div>
        <div className="flex items-center gap-3"><span className="text-[12px] text-on-surface-variant">{active ? `${active} 个任务生成中` : '自动保存到素材库'}</span><Dialog.Close asChild><VoiceButton variant="ghost" className="voiceover-action-icon" aria-label="关闭配音面板"><span className="material-symbols-outlined text-[20px]" aria-hidden="true">close</span></VoiceButton></Dialog.Close></div>
      </header>
      {state.error && <div role="alert" className="mx-6 mt-3 px-3 py-2 rounded-[8px] bg-error/10 text-error text-[12px] flex items-start justify-between gap-2 shrink-0 max-h-24 overflow-y-auto"><span className="break-words min-w-0">{state.error}</span><VoiceButton variant="ghost" className="voiceover-action-compact shrink-0" onClick={() => state.setError(null)}>关闭</VoiceButton></div>}
      <div className="grid grid-cols-[minmax(0,1fr)_304px] min-h-0 flex-1">
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col min-w-0 min-h-0">
          <div className="shrink-0 border-b border-outline-variant/40 px-6">
            <TabsList className="voiceover-tabs w-full" aria-label="配音工作区">
              {[['compose', '配音', 'mic'], ['profiles', '我的音色', 'record_voice_over'], ['runtime', '本地模型', 'tune']].map(([value, label, icon]) => <TabsTrigger key={value} value={value} className="voiceover-tab"><span className="material-symbols-outlined text-[18px]" aria-hidden="true">{icon}</span>{label}</TabsTrigger>)}
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" data-testid="voiceover-editor">
            <TabsContent value="compose" className="space-y-4">
              <div className="flex items-center gap-4 border-b border-outline-variant/30 pb-3">
                <span className="text-[12px] text-on-surface-variant shrink-0">配音方式</span>
                <VoiceRadioGroup label="配音方式" value={mode} onChange={setMode} options={[{ value: 'preset', label: '预设音色' }, { value: 'clone', label: '声音克隆' }]} />
              </div>
              {mode === 'preset' ? <div className="space-y-4">
                <div className="grid grid-cols-[136px_minmax(0,1fr)] gap-4">
                  <VoiceSelect label="语言" value={locale} onChange={setLocale} options={[['zh', '中文'], ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['pt', 'Português']].map(([value, label]) => ({ value, label }))} />
                  {voiceLoading ? <div className="voiceover-field-group"><span className="voiceover-field-label">预设音色</span><div role="status" className="voiceover-field text-on-surface-variant">正在获取在线音色…</div></div> : voiceError ? <div className="min-w-0 text-[12px] text-error flex items-center gap-2"><span className="flex-1">{voiceError}</span><VoiceButton variant="ghost" onClick={fetchVoices}>重试</VoiceButton></div> : <VoiceSelect label="预设音色" value={voiceId} onChange={setVoiceId} options={selectedVoices.map(voice => ({ value: voice.shortName, label: `${voice.shortName} · ${voice.gender === 'Female' ? '女声' : '男声'}` }))} />}
                </div>
                <div className="grid grid-cols-3 gap-6">{sliders.map(slider => <VoiceSlider key={slider.label} label={slider.label} value={slider.value} onChange={slider.change} min={slider.min} max={slider.max} unit={slider.unit} />)}</div>
              </div> : <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <VoiceSelect label="克隆引擎" value={engine} onChange={value => setEngine(value as typeof engine)} options={[{ value: 'voxcpm2', label: 'VoxCPM2' }, { value: 'qwen3-tts', label: 'Qwen3-TTS' }]} />
                  <VoiceSelect label="我的音色" value={profile ? profileId : ''} onChange={setProfileId} options={state.profiles.map(item => ({ value: item.id, label: item.name }))} placeholder="选择参考音色" action={<button type="button" onClick={() => setTab('profiles')} className="text-[12px] font-normal text-primary rounded-[4px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">管理音色</button>} />
                </div>
                {!localReady && <div className="rounded-[8px] px-3 py-2 bg-surface-container-low text-[12px] text-on-surface-variant flex items-center justify-between gap-2"><span>{state.runtime?.engines[engine].reason ?? '请先检测本地环境'}</span><VoiceButton variant="ghost" className="voiceover-action-compact shrink-0" onClick={() => setTab('runtime')}>配置模型</VoiceButton></div>}
                <div className="flex items-center justify-between gap-3 min-h-10">
                  {engine === 'voxcpm2' ? <div className="flex items-center gap-3"><span className="text-[12px] text-on-surface-variant">生成质量</span><VoiceRadioGroup compact label="生成质量" value={String(steps)} onChange={value => setSteps(Number(value) as 10 | 20)} options={[{ value: '20', label: '精细 · 20 步' }, { value: '10', label: '快速 · 10 步' }]} /></div> : <div className="w-[160px]"><VoiceSelect label="生成语言" value={language} onChange={value => setLanguage(value as 'zh' | 'en')} options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]} /></div>}
                  {profile && <VoiceButton variant="ghost" className="voiceover-action-compact shrink-0" onClick={() => play('tts:getProfileAudio', profile.id)}><span className="material-symbols-outlined text-[18px]" aria-hidden="true">play_circle</span>试听音色</VoiceButton>}
                </div>
                <details className="voiceover-disclosure border-b border-outline-variant/30 pb-2"><summary>高级参数</summary><div className="grid grid-cols-3 gap-3 mt-2 pb-2">
                  {engine === 'voxcpm2' ? <VoiceNumber label="引导强度 CFG" value={cfg} min={1} max={3} step={0.1} onChange={setCfg} /> : <VoiceNumber label="Temperature" value={temperature} min={0.1} max={1} step={0.05} onChange={setTemperature} />}
                  <VoiceInput label="随机种子" type="number" placeholder="随机" min={0} max={4294967295} value={seed} onChange={event => setSeed(event.target.value)} />
                  <VoiceNumber label="增益（dB）" value={gainDb} min={-12} max={6} onChange={setGainDb} />
                  {engine === 'voxcpm2' && <div className="col-span-3"><VoiceNumber label="参考尾部停顿（毫秒）" value={promptPauseMs} min={0} max={1000} step={10} onChange={setPromptPauseMs} /><p className="text-[12px] text-on-surface-variant mt-1">默认 320 毫秒，减少句首额外发声；0 为关闭。仅调整临时参考，不截掉生成的人声。</p></div>}
                </div><div className="py-2 space-y-1.5">
                  <Toggle label="自动降噪" pressed={denoise} onPressedChange={setDenoise} role="switch" aria-checked={denoise} aria-label="自动降噪" aria-describedby="voiceover-denoise-description" />
                  <p id="voiceover-denoise-description" className="text-[12px] leading-5 text-on-surface-variant">生成前清理参考录音的背景噪声，保留原录音。VoxCPM2 与 Qwen3-TTS 均可使用。</p>
                </div></details>
                {!denoisingReady && <div role="status" className="rounded-[8px] px-3 py-2 bg-surface-container-low text-[12px] text-on-surface-variant flex items-center justify-between gap-2"><span>{state.runtime?.denoising?.reason ?? '请先检测降噪环境，也可在高级参数中关闭自动降噪。'}</span><VoiceButton variant="ghost" className="voiceover-action-compact shrink-0" onClick={() => setTab('runtime')}>配置降噪</VoiceButton></div>}
              </div>}
              <VoiceTextArea label="配音文案" trailing={<span className={`voiceover-value ${Array.from(text.trim()).length > 300 ? 'text-error' : ''}`}>{Array.from(text.trim()).length} / 300</span>} rows={4} maxLength={600} value={text} onChange={event => setText(event.target.value)} aria-invalid={Array.from(text.trim()).length > 300} placeholder="输入要生成的配音文案，建议按句分段。" />
              <div className="space-y-2.5">
                <div className="flex items-center gap-2"><VoiceButton disabled={!canGenerate} onClick={() => submit()}><span className="material-symbols-outlined text-[18px]" aria-hidden="true">auto_awesome</span>{submitting ? '提交中…' : '生成配音'}</VoiceButton>{mode === 'clone' && <VoiceButton variant="secondary" disabled={!canGenerate || !state.runtime?.engines['qwen3-tts'].ready || !state.runtime?.engines.voxcpm2.ready} onClick={() => submit(true)}>两引擎对比生成</VoiceButton>}</div>
                <p className="text-[12px] leading-5 text-on-surface-variant">{mode === 'clone' ? '本地生成，关闭面板后继续运行。对比使用同一音色与文案。' : '在线生成，完成后自动保存。关闭面板后继续运行。'}</p>
              </div>
            </TabsContent>
            <TabsContent value="profiles" forceMount className="data-[state=inactive]:hidden"><VoiceProfilePanel profiles={state.profiles} refresh={state.refreshProfiles} onPlay={play} onStopDraftAudio={stopDraftAudio} onError={state.setError} onSelect={selectProfile} /></TabsContent>
            <TabsContent value="runtime"><VoiceRuntimePanel runtime={state.runtime} onChange={state.setRuntime} onError={state.setError} busy={active > 0} /></TabsContent>
          </div>
        </Tabs>
        <aside className="border-l border-outline-variant/40 bg-surface-container-low/40 min-h-0 flex flex-col" aria-label="试听与生成历史">
          <div className="p-5 border-b border-outline-variant/40 shrink-0" data-testid="voiceover-player">
            <div className="flex items-center justify-between mb-3"><h3 className="text-[13px] font-medium flex items-center gap-2"><span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">headphones</span>音频试听</h3>{audioUrl && <span className="text-[11px] text-primary">已载入</span>}</div>
            <p className="text-[12px] text-on-surface-variant truncate mb-3" title={audioTitle}>{audioTitle}</p>
            <VoiceAudioPlayer player={player} url={audioUrl} onError={state.setError} />
          </div>
          <div className="min-h-0 overflow-y-auto flex-1 px-4 py-3"><VoiceJobList jobs={state.jobs} assets={state.assets} trash={state.trash} onPlay={play} onRefresh={state.refreshAssets} onError={state.setError} onRetry={retry} /></div>
        </aside>
      </div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
