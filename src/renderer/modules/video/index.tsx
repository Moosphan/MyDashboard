import { useState } from 'react'
import { VideoCoverGrid } from './components/VideoCoverGrid'
import { AudioAssetList } from './components/AudioAssetList'
import { PresentationList } from './components/PresentationList'
import { VoiceoverDialog } from './components/VoiceoverDialog'
import { Button } from '@/components/ui/button'
import { WorkflowStudio } from './workflow/WorkflowStudio'
import { WorkflowSettings } from './workflow/WorkflowSettings'
import './workflow/workflow.css'

export default function Video() {
  const [showVoiceover, setShowVoiceover] = useState(false)
  const [activeJobs, setActiveJobs] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [view, setView] = useState<'workflow' | 'assets'>('workflow')

  return (
    <div className="workflow-page voiceover-dialog p-lg space-y-md max-w-[1280px] mx-auto w-full">
      {view === 'workflow' ? (
        <WorkflowStudio
          onVoiceover={() => setShowVoiceover(true)}
          onSettings={() => setShowSettings(true)}
          onAssets={() => setView('assets')}
          activeJobs={activeJobs}
        />
      ) : (
        <div className="workflow-section">
          <div className="workflow-toolbar">
            <div>
              <h1 className="workflow-page-title">视频素材库</h1>
              <p className="workflow-muted mt-2">封面、音频与演示文稿</p>
            </div>
            <div className="workflow-actions">
              <Button size="sm" variant="ghost" onClick={() => setView('workflow')}>
                所有视频项目
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowVoiceover(true)}>
                AI 配音{activeJobs > 0 ? ` · ${activeJobs}` : ''}
              </Button>
            </div>
          </div>
          <VideoCoverGrid />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg items-start">
            <AudioAssetList />
            <PresentationList />
          </div>
        </div>
      )}
      <WorkflowSettings open={showSettings} onClose={() => setShowSettings(false)} />

      {/* Voiceover Dialog */}
      <VoiceoverDialog
        open={showVoiceover}
        onClose={() => setShowVoiceover(false)}
        onActiveJobsChange={setActiveJobs}
      />
    </div>
  )
}
