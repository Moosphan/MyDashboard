import { useEffect, useState, type CSSProperties, type RefObject } from 'react'
import { VoiceButton } from './VoiceControls'

function timestamp(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

export function VoiceAudioPlayer({ player, url, onError }: { player: RefObject<HTMLAudioElement>; url: string | null; onError: (message: string) => void }) {
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)

  useEffect(() => { setPosition(0); setDuration(0); setPlaying(false) }, [url])

  const toggle = async () => {
    if (!player.current || !url) return
    if (player.current.paused) {
      try { await player.current.play() } catch { onError('音频播放失败，请重试。') }
    } else player.current.pause()
  }

  return <div className="space-y-2">
    <audio ref={player} src={url ?? undefined} autoPlay={Boolean(url)} preload="metadata" hidden
      onPlay={() => { setPlaying(true); window.dispatchEvent(new CustomEvent('video:audioPlaying', { detail: 'voiceover' })) }}
      onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
      onDurationChange={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      onError={() => { if (url) onError('音频播放失败，请重试或导出后播放。') }} />
    <div className="flex items-center gap-3">
      <VoiceButton className="voiceover-action-icon shrink-0" aria-label={playing ? '暂停试听' : '播放试听'} disabled={!url} onClick={toggle}><span className="material-symbols-outlined text-[22px]" aria-hidden="true">{playing ? 'pause' : 'play_arrow'}</span></VoiceButton>
      <div className="min-w-0 flex-1"><input type="range" aria-label="试听进度" aria-valuetext={`${timestamp(position)} / ${timestamp(duration)}`} min={0} max={duration || 1} step={0.01} value={position} disabled={!url || !duration}
        onChange={event => { const value = Number(event.target.value); if (player.current) player.current.currentTime = value; setPosition(value) }}
        className="voiceover-slider voiceover-player-slider" style={{ '--voiceover-progress': `${duration ? position / duration * 100 : 0}%` } as CSSProperties} /></div>
      <VoiceButton variant="ghost" className="voiceover-action-icon shrink-0" aria-label={muted ? '取消静音' : '静音试听'} disabled={!url} onClick={() => { if (player.current) { player.current.muted = !muted; setMuted(!muted) } }}><span className="material-symbols-outlined text-[20px]" aria-hidden="true">{muted ? 'volume_off' : 'volume_up'}</span></VoiceButton>
    </div>
    <div className="flex justify-between text-[11px] text-on-surface-variant tabular-nums"><span>{url ? playing ? '正在播放' : '可随时试听' : '从音色或生成历史选择音频'}</span><span>{timestamp(position)} / {timestamp(duration)}</span></div>
  </div>
}
