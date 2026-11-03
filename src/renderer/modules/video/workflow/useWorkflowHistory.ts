import { useEffect, useRef, useState } from 'react'
import type {
  VideoProject,
  VideoStage,
  WorkflowHistoryPage,
  WorkflowRevision,
  WorkflowRevisionSummary,
} from '@shared/video-workflow'
import { workflowCall } from './useWorkflow'

export function useWorkflowHistory(
  project: VideoProject | null,
  stage?: VideoStage,
  enabled = true,
) {
  const [items, setItems] = useState<WorkflowRevisionSummary[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const pending = useRef(false)
  const requestSequence = useRef(0)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const readLatest = useRef<() => Promise<void>>(async () => {})
  const lastRevision = useRef(project?.revision)
  const identity = `${project?.id}:${stage}:${enabled}`
  const latest = useRef(identity)
  latest.current = identity
  const read = async (next?: number, preserve = false) => {
    if (!project || !enabled || lock.current) return
    lock.current = true
    setLoading(true)
    setError('')
    const current = identity
    const request = ++requestSequence.current
    try {
      const page = await workflowCall<WorkflowHistoryPage>('history', project.id, stage, next)
      if (latest.current !== current || request !== requestSequence.current) return
      setItems((previous) =>
        next
          ? [
              ...previous,
              ...page.items.filter((item) => !previous.some((value) => value.id === item.id)),
            ]
          : preserve
            ? [
                ...page.items,
                ...previous.filter((item) => !page.items.some((value) => value.id === item.id)),
              ]
            : page.items,
      )
      if (!preserve || itemsRef.current.length <= 20) setCursor(page.nextCursor)
    } catch (failure) {
      if (latest.current === current && request === requestSequence.current)
        setError((failure as Error).message)
    } finally {
      if (latest.current === current && request === requestSequence.current) {
        lock.current = false
        setLoading(false)
        if (pending.current) {
          pending.current = false
          void readLatest.current()
        }
      }
    }
  }
  readLatest.current = () => read(undefined, true)
  useEffect(() => {
    requestSequence.current++
    pending.current = false
    lastRevision.current = project?.revision
    lock.current = false
    setItems([])
    setCursor(null)
    setError('')
    if (enabled && project) void read()
    return () => {
      requestSequence.current++
    }
  }, [identity])
  useEffect(() => {
    if (lastRevision.current === project?.revision) return
    lastRevision.current = project?.revision
    if (enabled && project) {
      if (lock.current) pending.current = true
      else void read(undefined, true)
    }
  }, [project?.revision])
  return {
    items,
    cursor,
    loading,
    error,
    more: () => read(cursor ?? undefined),
    retry: () => read(),
  }
}

export function useWorkflowRevision(project: VideoProject, id: string | undefined) {
  const local = project.history.find((item) => item.id === id)
  const [loaded, setLoaded] = useState<WorkflowRevision | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setLoaded(null)
    setError('')
    if (id && !local)
      void workflowCall<WorkflowRevision>('revision', project.id, id)
        .then((value) => {
          if (active) setLoaded(value)
        })
        .catch((failure) => {
          if (active) setError(failure.message)
        })
    return () => {
      active = false
    }
  }, [project.id, id, local?.id, attempt])
  const revision = local ?? (loaded?.id === id ? (loaded ?? undefined) : undefined)
  return {
    revision,
    error,
    loading: Boolean(id && !revision && !error),
    retry: () => setAttempt((value) => value + 1),
  }
}

export function useWorkflowAssets<Value>(project: VideoProject, kind: 'cover' | 'music') {
  const [items, setItems] = useState<{ version: number; value: Value }[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setError('')
    void workflowCall<{ version: number; value: Value }[]>('historyAssets', project.id, kind)
      .then((value) => {
        if (active) setItems(value)
      })
      .catch((failure) => {
        if (active) setError(failure.message)
      })
    return () => {
      active = false
    }
  }, [project.id, project.revision, kind])
  return { items, error }
}

export function useRenderContext(project: VideoProject, id: string | undefined) {
  const identity = `${project.id}:${id}`
  const [loaded, setLoaded] = useState<{
    identity: string
    revisions: WorkflowRevision[]
    error: string
  } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setLoaded(null)
    if (id)
      void workflowCall<WorkflowRevision[]>('revisionContext', project.id, id)
        .then((items) => {
          if (active) setLoaded({ identity, revisions: items, error: '' })
        })
        .catch((failure) => {
          if (active) setLoaded({ identity, revisions: [], error: failure.message })
        })
    return () => {
      active = false
    }
  }, [identity, attempt])
  const matching = loaded?.identity === identity ? loaded : null
  const revisions = matching?.revisions ?? []
  return {
    project: {
      ...project,
      history: [
        ...revisions,
        ...project.history.filter((item) => !revisions.some((value) => value.id === item.id)),
      ],
    },
    ready: Boolean(id && matching && !matching.error),
    loading: Boolean(id && !matching),
    error: matching?.error ?? '',
    retry: () => setAttempt((value) => value + 1),
  }
}

export function useWorkflowHistoryRestore(project: VideoProject | null, open: boolean) {
  const identity = `${project?.id}:${open}`
  const scope = useRef({ identity, sequence: 0 })
  if (scope.current.identity !== identity)
    scope.current = { identity, sequence: scope.current.sequence + 1 }
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setError('')
    setLoading(false)
    return () => {
      scope.current.sequence++
    }
  }, [identity])
  const load = async (id: string) => {
    if (!project || !open) return null
    const sequence = ++scope.current.sequence
    const active = () => scope.current.identity === identity && scope.current.sequence === sequence
    setLoading(true)
    setError('')
    try {
      const revision = await workflowCall<WorkflowRevision>('revision', project.id, id)
      return active() ? revision : null
    } catch (failure) {
      if (active()) setError((failure as Error).message)
      return null
    } finally {
      if (active()) setLoading(false)
    }
  }
  return { load, loading, error }
}
