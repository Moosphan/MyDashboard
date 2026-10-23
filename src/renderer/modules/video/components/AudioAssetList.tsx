import { useState, useEffect, useCallback } from 'react'
import { useIpcData, useIpcMutation } from '@/hooks/useIpc'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { Waveform } from './Waveform'
import { cn } from '@/lib/utils'

interface AudioAsset {
  id: number
  title: string
  file_path: string
  file_format: string | null
  duration_seconds: number | null
  file_size: number | null
  metadata: string
}

export function AudioAssetList() {
  const { data: audios, loading, refetch } = useIpcData<AudioAsset[]>('video:getByType', 'audio')
  const { mutate: deleteAsset } = useIpcMutation<boolean>('video:delete')
  const { mutate: importFile } = useIpcMutation('video:importFile')
  const [filter, setFilter] = useState(false)

  const {
    isPlaying,
    currentTime,
    duration,
    isLoading: audioLoading,
    play,
    pause,
    stop,
    seek,
    getWaveformData,
  } = useAudioPlayer()

  const [playingId, setPlayingId] = useState<number | null>(null)
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null)
  const [waveformData, setWaveformData] = useState<Record<number, number[]>>({})
  useEffect(() => window.electronAPI.onVideoAssetsChanged(() => refetch()), [refetch])
  useEffect(() => {
    const pauseOther = (event: Event) => { if ((event as CustomEvent).detail !== 'assets') pause() }
    window.addEventListener('video:audioPlaying', pauseOther)
    return () => window.removeEventListener('video:audioPlaying', pauseOther)
  }, [pause])

  const formatDuration = (sec: number | null) => {
    if (!sec) return '--:--'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const formatSize = (bytes: number | null) => {
    if (!bytes) return ''
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const handleImport = async () => {
    await importFile('audio')
    refetch()
  }

  const handleDelete = async (id: number) => {
    window.dispatchEvent(new CustomEvent('video:audioPlaying', { detail: 'none' }))
    if (playingId === id) {
      stop()
      setPlayingId(null)
      setAudioDataUrl(null)
    }
    await deleteAsset(id)
    refetch()
  }

  const [audioDurations, setAudioDurations] = useState<Record<number, number>>({})

  const loadAudioData = useCallback(async (audio: AudioAsset) => {
    try {
      const res = await window.electronAPI.invoke('video:getAudioDataById', audio.id)
      if (res?.success && res.data?.dataUrl) {
        setAudioDataUrl(res.data.dataUrl)

        // Load waveform data if not cached
        if (!waveformData[audio.id]) {
          const data = await getWaveformData(res.data.dataUrl)
          setWaveformData(prev => ({ ...prev, [audio.id]: data }))
        }

        // Get actual duration from audio data if not in DB
        if (!audio.duration_seconds && !audioDurations[audio.id]) {
          try {
            const ctx = new AudioContext()
            const response = await fetch(res.data.dataUrl)
            const arrayBuffer = await response.arrayBuffer()
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
            setAudioDurations(prev => ({ ...prev, [audio.id]: audioBuffer.duration }))
            ctx.close()
          } catch { /* ignore */ }
        }

        return res.data.dataUrl
      }
    } catch (err) {
      console.error('Failed to load audio:', err)
    }
    return null
  }, [getWaveformData, waveformData, audioDurations])

  const handlePlay = async (audio: AudioAsset) => {
    window.dispatchEvent(new CustomEvent('video:audioPlaying', { detail: 'assets' }))
    if (playingId === audio.id && isPlaying) {
      pause()
      return
    }

    if (playingId === audio.id && audioDataUrl) {
      await play(audioDataUrl)
      return
    }

    // Load new audio
    setPlayingId(audio.id)
    const dataUrl = await loadAudioData(audio)
    if (dataUrl) {
      await play(dataUrl)
    }
  }

  const handleSeek = (audioId: number, position: number) => {
    if (playingId === audioId && duration > 0) {
      seek(position * duration)
    }
  }

  const getProgress = (audioId: number) => {
    if (playingId === audioId && duration > 0) {
      return currentTime / duration
    }
    return 0
  }

  // Preload audio durations for items without duration_seconds
  useEffect(() => {
    if (!audios) return
    const loadDurations = async () => {
      for (const audio of audios) {
        if (!audio.duration_seconds && !audioDurations[audio.id]) {
          try {
            const res = await window.electronAPI.invoke('video:getAudioDataById', audio.id)
            if (res?.success && res.data?.dataUrl) {
              const ctx = new AudioContext()
              const response = await fetch(res.data.dataUrl)
              const arrayBuffer = await response.arrayBuffer()
              const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
              setAudioDurations(prev => ({ ...prev, [audio.id]: audioBuffer.duration }))
              ctx.close()
            }
          } catch { /* ignore */ }
        }
      }
    }
    loadDurations()
  }, [audios]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = filter ? audios?.filter(audio => { const metadata = JSON.parse(audio.metadata || '{}'); return metadata.source === 'voiceover' || metadata.source === 'legacy-voiceover' }) : audios

  return (
    <div className="lg:col-span-2">
      <div className="flex items-center justify-between mb-md h-10">
        <div className="flex items-center gap-sm">
          <span className="material-symbols-outlined text-primary">audiotrack</span>
          <h3 className="font-headline-sm text-headline-sm">Audio Assets</h3>
          <button
            onClick={handleImport}
            className="w-8 h-8 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-on-primary transition-all flex items-center justify-center ml-sm"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
        </div>
        <button
          onClick={() => setFilter(!filter)}
          className={cn(
            'p-2 rounded-full transition-colors',
            filter ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container',
          )}
        >
          <span className="material-symbols-outlined">filter_list</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-base">
          {[1, 2].map((i) => (
            <div key={i} className="p-md bg-surface-container-lowest rounded-xl border border-outline-variant/30 animate-pulse h-16" />
          ))}
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <div className="p-xl bg-surface-container-lowest rounded-xl border border-outline-variant/30 text-center">
          <span className="material-symbols-outlined text-[48px] text-on-surface-variant/30 mb-sm block">audiotrack</span>
          <p className="text-body-md text-on-surface-variant">{filter ? 'No matching audio files' : 'No audio assets yet'}</p>
          <button
            onClick={handleImport}
            className="mt-md px-5 py-2 bg-primary text-on-primary rounded-full font-label-md hover:brightness-110 active:scale-95 transition-all"
          >
            Import Audio
          </button>
        </div>
      ) : (
        <div className="space-y-base">
          {filtered.map((audio) => {
            const isActive = playingId === audio.id
            const progress = getProgress(audio.id)

            return (
              <div
                key={audio.id}
                className={cn(
                  'flex items-center gap-md p-md bg-surface-container-lowest rounded-xl border transition-all cursor-pointer group',
                  isActive ? 'border-primary/50 bg-primary-fixed/10' : 'border-outline-variant/50 hover:bg-primary-fixed/10',
                )}
                onClick={() => handlePlay(audio)}
              >
                {/* Play/Pause button */}
                <div className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center transition-colors shrink-0',
                  isActive ? 'bg-primary text-on-primary' : 'bg-primary-fixed text-primary group-hover:bg-primary group-hover:text-on-primary',
                )}>
                  {audioLoading && isActive ? (
                    <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
                  ) : isPlaying && isActive ? (
                    <span className="material-symbols-outlined fill text-[20px]">pause</span>
                  ) : (
                    <span className="material-symbols-outlined fill text-[20px]">play_arrow</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-label-md text-label-md text-on-surface truncate">{audio.title}</h4>
                  <div className="flex items-center gap-sm text-body-sm text-on-surface-variant">
                    <span>{audio.file_format?.toUpperCase() || 'Audio'}</span>
                    {JSON.parse(audio.metadata || '{}').engine && <span>{JSON.parse(audio.metadata).engine}</span>}
                    <span>•</span>
                    <span>{formatDuration(audio.duration_seconds || audioDurations[audio.id])}</span>
                    {audio.file_size && (
                      <>
                        <span>•</span>
                        <span>{formatSize(audio.file_size)}</span>
                      </>
                    )}
                    {isActive && (
                      <>
                        <span>•</span>
                        <span className="text-primary font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Waveform */}
                <div className="hidden md:block flex-1 max-w-xs h-8">
                  {waveformData[audio.id] ? (
                    <Waveform
                      data={waveformData[audio.id]}
                      progress={progress}
                      height={32}
                      onClick={(pos) => handleSeek(audio.id, pos)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-full h-full text-outline-variant/30" viewBox="0 0 100 20">
                        <path d="M0 10 Q 5 0, 10 10 T 20 10 T 30 10 T 40 10 T 50 10 T 60 10 T 70 10 T 80 10 T 90 10 T 100 10" fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(audio.id)
                  }}
                  className="p-2 text-on-surface-variant hover:text-error transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
