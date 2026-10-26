import { forwardRef } from 'react'
import { PlayIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'

export const VideoPreviewButton = forwardRef<
  HTMLButtonElement,
  { open: boolean; onClick: () => void }
>(({ open, onClick }, ref) => (
  <div className="workflow-video-preview-overlay">
    <Button
      ref={ref}
      type="button"
      size="icon"
      variant="ghost"
      className="workflow-video-preview-trigger"
      aria-label="播放成片预览"
      title="播放成片预览"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onClick}
    >
      <PlayIcon aria-hidden="true" className="size-6 fill-current" />
    </Button>
  </div>
))
VideoPreviewButton.displayName = 'VideoPreviewButton'
