import { useCallback, useEffect, useRef, useState } from 'react'
import { ipcInvoke } from '@/lib/ipc'
import {
  VIDEO_STAGES,
  stageValue,
  projectVideoFormat,
  type VideoProject,
  type VideoStage,
  type StagePayloads,
  type WorkflowFile,
} from '@shared/video-workflow'

export const workflowCall = <Result>(action: string, ...args: unknown[]) =>
  ipcInvoke<Result>(`workflow:${action}`, ...args)
export function mediaUrl(projectId: string, file: WorkflowFile) {
  return `video-workflow://${projectId}/${file.id}`
}
export function nextStage(project: VideoProject): VideoStage {
  return VIDEO_STAGES.find((stage) => project.stages[stage]?.status !== 'approved') ?? 'publish'
}
export function useWorkflowProjects() {
  const [projects, setProjects] = useState<VideoProject[]>([])
  const [project, setProject] = useState<VideoProject | null>(null)
  const [archived, setArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const selected = useRef<string | null>(null),
    sequence = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++sequence.current
    try {
      const [list, current] = await Promise.all([
        workflowCall<VideoProject[]>('list', archived),
        selected.current
          ? workflowCall<VideoProject>('get', selected.current)
          : Promise.resolve(null),
      ])
      if (request === sequence.current) {
        setProjects(list)
        setProject(current)
        setError('')
      }
    } catch (failure) {
      if (request === sequence.current) setError((failure as Error).message)
    } finally {
      if (request === sequence.current) setLoading(false)
    }
  }, [archived])
  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh])
  useEffect(
    () =>
      window.electronAPI.onVideoWorkflowUpdated(() => {
        void refresh()
      }),
    [refresh],
  )
  const select = (value: VideoProject | null) => {
    sequence.current++
    selected.current = value?.id ?? null
    setProject(value)
    setError('')
  }
  return { projects, project, select, archived, setArchived, loading, error, refresh }
}
export function initialPayload(
  project: VideoProject,
  stage: VideoStage,
): StagePayloads[VideoStage] {
  const existing = project.stages[stage]?.payload
  if (existing) return existing
  switch (stage) {
    case 'brief':
      return { text: '', duration: 120 }
    case 'copy':
      return { text: '' }
    case 'storyboard':
      return {
        format: projectVideoFormat(project),
        mode: 'template',
        template: 'technical',
        referenceText: '',
        references: [],
        scenes: [],
      }
    case 'narration':
      return {
        scenes: (stageValue(project, 'storyboard')?.scenes ?? []).map((scene) => ({
          id: scene.id,
          text: '',
        })),
      }
    case 'publish':
      return {
        platforms: {
          bilibili: { title: project.title, description: '', tags: [] },
          douyin: { title: project.title.slice(0, 30), description: '', tags: [] },
        },
      }
    default:
      return { text: '' }
  }
}
export function useWorkflowDraft(
  project: VideoProject,
  stage: VideoStage,
  restoredPayload?: StagePayloads[VideoStage],
) {
  const key = `video-workflow-draft:${project.id}:${stage}`
  const [storageError, setStorageError] = useState(false)
  const [draft, setDraft] = useState<{
    payload: StagePayloads[VideoStage]
    expected: number
    dirty: boolean
  }>(() => {
    if (restoredPayload) {
      return { payload: restoredPayload, expected: project.revision, dirty: true }
    }
    const fallback = {
      payload: initialPayload(project, stage),
      expected: project.revision,
      dirty: false,
    }
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null')
      if (stored?.dirty && stored.payload) return stored
    } catch {
      return fallback
    }
    return fallback
  })
  useEffect(() => {
    setDraft((current) =>
      current.dirty || current.expected === project.revision
        ? current
        : { payload: initialPayload(project, stage), expected: project.revision, dirty: false },
    )
  }, [project, stage])
  useEffect(() => {
    try {
      if (draft.dirty) localStorage.setItem(key, JSON.stringify(draft))
      else localStorage.removeItem(key)
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [draft, key])
  const update = (payload: StagePayloads[VideoStage]) =>
    setDraft((previous) => ({ ...previous, payload, dirty: true }))
  const reset = useCallback(
    (current = project) => {
      setDraft({
        payload: initialPayload(current, stage),
        expected: current.revision,
        dirty: false,
      })
    },
    [project, stage],
  )
  const rebase = () => setDraft((current) => ({ ...current, expected: project.revision }))
  return {
    ...draft,
    update,
    reset,
    rebase,
    storageError,
    conflict: draft.dirty && draft.expected !== project.revision,
  }
}
