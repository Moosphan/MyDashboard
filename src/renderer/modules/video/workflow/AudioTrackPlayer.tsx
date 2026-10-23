import { useState } from 'react'
import type { AudioTrack } from '@shared/video-workflow'
import { mediaUrl } from './useWorkflow'

export function AudioTrackPlayer({
  projectId,
  track,
  title,
  index,
}: {
  projectId: string
  track: AudioTrack
  title: string
  index: number
}) {
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="workflow-audio-row" data-playing={playing}>
      <div className="workflow-toolbar">
        <strong className="workflow-audio-title text-body-sm">
          {String(index + 1).padStart(2, '0')} · {title}
        </strong>
        <span className="workflow-muted">{track.duration.toFixed(1)} 秒</span>
      </div>
      <p className="text-body-sm leading-relaxed">{track.text}</p>
      <audio
        controls
        preload="metadata"
        src={mediaUrl(projectId, track.file)}
        className="workflow-audio-player w-full"
        data-playing={playing}
        aria-label={`第 ${index + 1} 段试听`}
        onPlay={() => {
          setPlaying(true)
          setError('')
        }}
        onPlaying={() => setLoading(false)}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onPause={() => {
          setPlaying(false)
          setLoading(false)
        }}
        onEnded={() => {
          setPlaying(false)
          setLoading(false)
        }}
        onError={() => {
          setPlaying(false)
          setLoading(false)
          setError('音频加载失败，请重新打开项目或重试。')
        }}
      />
      {loading && (
        <span className="workflow-muted" role="status">
          正在加载音频…
        </span>
      )}
      {error && (
        <p className="workflow-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
