import { useCallback, useEffect, useRef, useState } from 'react'
import { ipcInvoke } from '@/lib/ipc'
import {
  VIDEO_STAGES,
  stageValue,
  projectVideoFormat,
  isImportedVideo,
  type VideoProject,
  type VideoStage,
  type StagePayloads,
  type WorkflowFile,
  type VideoProjectSummary,
} from '@shared/video-workflow'
import { WorkflowRefreshQueue } from './refresh-queue'

export const workflowCall = <Result>(action: string, ...args: unknown[]) =>
  ipcInvoke<Result>(`workflow:${action}`, ...args)
export function mediaUrl(projectId: string, file: WorkflowFile) {
  return `video-workflow://${projectId}/${file.id}`
}
export function nextStage(project: VideoProject): VideoStage {
  if (isImportedVideo(project)) return 'publish'
  return VIDEO_STAGES.find((stage) => project.stages[stage]?.status !== 'approved') ?? 'publish'
}
export function useWorkflowProjects() {
  const [projects, setProjects] = useState<VideoProjectSummary[]>([])
  const [project, setProject] = useState<VideoProject | null>(null)
  const [archived, setArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const selected = useRef<string | null>(null),
    sequence = useRef(0)
  const detailSequence = useRef(0)
  const queue = useRef<WorkflowRefreshQueue | null>(null)
  const refresh = useCallback(
    () => queue.current?.refresh().catch(() => {}) ?? Promise.resolve(),
    [],
  )
  useEffect(() => {
    let alive = true
    const coordinator = new WorkflowRefreshQueue(async (ids) => {
      const selectedId = selected.current
      const selection = sequence.current
      try {
        if (ids) {
          for (const id of ids) {
            const summary = await workflowCall<VideoProjectSummary | null>('summary', id)
            if (!alive) return
            setProjects((current) => {
              const next = current.filter((item) => item.id !== id)
              if (summary && summary.archived === archived) next.push(summary)
              next.sort(
                (left, right) =>
                  right.updatedAt.localeCompare(left.updatedAt) || right.sortOrder - left.sortOrder,
              )
              return JSON.stringify(next) === JSON.stringify(current) ? current : next
            })
          }
        } else {
          const list = await workflowCall<VideoProjectSummary[]>('list', archived)
          if (!alive) return
          setProjects(list)
        }
        if (selectedId && (!ids || ids.includes(selectedId))) {
          const detailRequest = ++detailSequence.current
          const current = await workflowCall<VideoProject>('get', selectedId)
          if (
            alive &&
            detailRequest === detailSequence.current &&
            selection === sequence.current &&
            selected.current === selectedId
          )
            setProject((previous) =>
              !previous || current.revision >= previous.revision ? current : previous,
            )
        }
        if (alive) setError('')
      } catch (failure) {
        if (alive) setError((failure as Error).message)
        throw failure
      } finally {
        if (alive) setLoading(false)
      }
    })
    queue.current = coordinator
    setLoading(true)
    void coordinator.refresh().catch(() => {})
    const unsubscribe = window.electronAPI.onVideoWorkflowUpdated((id) => coordinator.updated(id))
    return () => {
      alive = false
      unsubscribe()
      coordinator.dispose()
      if (queue.current === coordinator) queue.current = null
    }
  }, [archived])
  const select = (value: VideoProject | null) => {
    detailSequence.current++
    sequence.current++
    selected.current = value?.id ?? null
    setProject(value)
    setError('')
  }
  const open = async (id: string) => {
    const request = ++sequence.current
    selected.current = id
    const detailRequest = ++detailSequence.current
    setError('')
    try {
      const value = await workflowCall<VideoProject>('get', id)
      if (request !== sequence.current) return null
      if (detailRequest === detailSequence.current) setProject(value)
      return value
    } catch (failure) {
      if (request === sequence.current) {
        selected.current = null
        setError((failure as Error).message)
      }
      return null
    }
  }
  return { projects, project, select, open, archived, setArchived, loading, error, refresh }
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
