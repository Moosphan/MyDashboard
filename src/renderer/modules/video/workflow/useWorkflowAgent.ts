import { useSyncExternalStore } from 'react'
import { isWorkflowAgent, type WorkflowAgent } from '@shared/video-workflow'

const storageKey = 'video-workflow:agent-executor:v1'
const changedEvent = 'video-workflow-agent-changed'
let memoryAgent: WorkflowAgent = 'codex'

function currentAgent(): WorkflowAgent {
  try {
    const stored = localStorage.getItem(storageKey)
    return isWorkflowAgent(stored) ? stored : 'codex'
  } catch {
    return memoryAgent
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(changedEvent, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(changedEvent, listener)
    window.removeEventListener('storage', listener)
  }
}

function selectAgent(value: string) {
  if (!isWorkflowAgent(value)) return
  memoryAgent = value
  try {
    localStorage.setItem(storageKey, value)
  } catch {
    memoryAgent = value
  }
  window.dispatchEvent(new Event(changedEvent))
}

export function useWorkflowAgent() {
  return [
    useSyncExternalStore(subscribe, currentAgent, () => 'codex' as const),
    selectAgent,
  ] as const
}
