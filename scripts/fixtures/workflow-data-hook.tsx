import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  useWorkflowProjects,
  useWorkflowDraft,
} from '../../src/renderer/modules/video/workflow/useWorkflow'
import {
  useWorkflowHistory,
  useWorkflowHistoryRestore,
  useRenderContext,
} from '../../src/renderer/modules/video/workflow/useWorkflowHistory'
import type { VideoProject } from '../../src/shared/video-workflow'

const harness = window as unknown as Record<string, any>
harness.requests = []
window.electronAPI = {
  invoke: (channel: string, ...args: unknown[]) =>
    new Promise((resolve) =>
      harness.requests.push({
        channel,
        args,
        resolve: (data: unknown) => resolve({ success: true, data }),
        fail: (error: string) => resolve({ success: false, error }),
      }),
    ),
  onVideoWorkflowUpdated: (callback: (id: string) => void) => {
    harness.updated = callback
    return () => {
      harness.updated = () => {}
    }
  },
} as typeof window.electronAPI
function Fixture() {
  const state = useWorkflowProjects()
  const [historyProject, setHistoryProject] = useState<VideoProject | null>(null)
  const history = useWorkflowHistory(historyProject)
  const [draftProject, setDraftProject] = useState<VideoProject | null>(null)
  const [contextInput, setContextInput] = useState<{ project: VideoProject; id: string } | null>(
    null,
  )
  const [restoreInput, setRestoreInput] = useState<{ project: VideoProject; open: boolean } | null>(
    null,
  )
  harness.state = state
  harness.historyState = history
  harness.setHistoryProject = setHistoryProject
  harness.setDraftProject = setDraftProject
  harness.setContextInput = setContextInput
  harness.setRestoreInput = setRestoreInput
  return (
    <div>
      {state.project?.title ?? 'Synthetic list'}:{history.items.length}
      {draftProject && <DraftFixture project={draftProject} />}
      {contextInput && <ContextFixture {...contextInput} />}
      {restoreInput && <RestoreFixture {...restoreInput} />}
    </div>
  )
}
function ContextFixture({ project, id }: { project: VideoProject; id: string }) {
  harness.contextState = useRenderContext(project, id)
  return null
}
function RestoreFixture({ project, open }: { project: VideoProject; open: boolean }) {
  harness.restoreState = useWorkflowHistoryRestore(project, open)
  return null
}
function DraftFixture({ project }: { project: VideoProject }) {
  harness.draft = useWorkflowDraft(project, 'brief')
  return null
}
createRoot(document.getElementById('root')!).render(<Fixture />)
