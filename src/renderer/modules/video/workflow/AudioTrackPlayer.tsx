import { useState } from 'react'
import type { AudioTrack } from '@shared/video-workflow'
import { mediaUrl, workflowCall } from './useWorkflow'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

export function AudioTrackPlayer({
  projectId,
  track,
  title,
  index,
  onRegenerate,
  regenerateDisabledReason,
}: {
  projectId: string
  track: AudioTrack
  title: string
  index: number
  onRegenerate: () => void
  regenerateDisabledReason?: string
}) {
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [locationError, setLocationError] = useState('')
  return (
    <div className="workflow-audio-row" data-playing={playing}>
      <div className="workflow-toolbar">
        <strong className="workflow-audio-title text-body-sm">
          {String(index + 1).padStart(2, '0')} · {title}
        </strong>
        <div className="workflow-actions">
          <span className="workflow-muted">{track.duration.toFixed(1)} 秒</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                data-audio-track-menu
                aria-label={`第 ${index + 1} 段更多操作`}
                title="更多操作"
              >
                更多操作
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setLocationError('')
                  void workflowCall('showFile', projectId, track.file).catch((failure) =>
                    setLocationError((failure as Error).message),
                  )
                }}
              >
                打开所在文件夹
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={Boolean(regenerateDisabledReason)}
                title={regenerateDisabledReason}
                className="data-[highlighted]:bg-surface-container-low data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
                onSelect={onRegenerate}
              >
                重新生成此段配音
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <p className="text-body-sm leading-relaxed">{track.text}</p>
      {regenerateDisabledReason && <p className="workflow-muted">{regenerateDisabledReason}</p>}
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
      {locationError && (
        <p className="workflow-error" role="alert">
          {locationError}
        </p>
      )}
    </div>
  )
}
