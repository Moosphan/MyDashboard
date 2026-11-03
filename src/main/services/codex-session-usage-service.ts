import { homedir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { CodexSessionUsageSummary } from '../../shared/codex-session-usage'
import type { ScanDiagnostics } from './codex-session-scanner'

const CACHE_DURATION_MS = 60_000
const SCAN_TIMEOUT_MS = 120_000
interface ScanResult {
  ok: boolean
  summary?: CodexSessionUsageSummary
  diagnostics?: ScanDiagnostics
}

/** One shared worker and request per service; callers cannot cancel work needed by another consumer. */
export function createCodexSessionUsageService(options: {
  directory: string
  workerPath?: string
}) {
  let worker: Worker | null = null
  let cached: { at: number; summary: CodexSessionUsageSummary } | null = null
  let inFlight: Promise<CodexSessionUsageSummary> | null = null
  let rejectPending: ((error: Error) => void) | null = null
  let disposed = false
  let diagnostics: ScanDiagnostics = {
    scans: 0,
    bytesRead: 0,
    parsedLines: 0,
    maxConcurrentReads: 0,
  }
  const resetWorker = () => {
    const old = worker
    worker = null
    if (old) void old.terminate()
  }
  const getWorker = () => {
    if (!worker) {
      // The separately bundled entry lives beside index.js in dev, build and app.asar.
      worker = new Worker(options.workerPath ?? join(__dirname, 'codex-session-usage-worker.js'), {
        workerData: { directory: options.directory },
      })
      const created = worker
      created.on('error', () => {
        if (worker === created) {
          rejectPending?.(new Error('Codex 用量后台统计失败'))
          resetWorker()
        }
      })
      created.on('exit', () => {
        if (worker === created) {
          worker = null
          rejectPending?.(new Error('Codex 用量后台统计已退出'))
        }
      })
    }
    return worker
  }
  const service = {
    get diagnostics() {
      return diagnostics
    },
    get(forceRefresh = false): Promise<CodexSessionUsageSummary> {
      if (disposed) return Promise.reject(new Error('Codex 用量统计已停止'))
      if (inFlight) return inFlight
      if (!forceRefresh && cached && Date.now() - cached.at < CACHE_DURATION_MS)
        return Promise.resolve(cached.summary)
      inFlight = new Promise<CodexSessionUsageSummary>((resolve, reject) => {
        const current = getWorker()
        current.ref()
        const timeout = setTimeout(() => {
          rejectPending?.(new Error('Codex 用量后台统计超时'))
          resetWorker()
        }, SCAN_TIMEOUT_MS)
        const cleanup = () => {
          clearTimeout(timeout)
          current.off('message', onMessage)
          current.unref()
          rejectPending = null
        }
        const onMessage = (message: ScanResult) => {
          cleanup()
          if (!message.ok || !message.summary || !message.diagnostics) {
            reject(new Error('Codex 用量后台统计失败'))
            return
          }
          diagnostics = message.diagnostics
          cached = { at: Date.now(), summary: message.summary }
          resolve(message.summary)
        }
        rejectPending = (error) => {
          cleanup()
          reject(error)
        }
        current.once('message', onMessage)
        current.postMessage('scan')
      })
        .catch((error) => {
          if (cached) {
            cached.at = Date.now()
            return cached.summary
          }
          throw error
        })
        .finally(() => {
          inFlight = null
        })
      return inFlight
    },
    async dispose() {
      disposed = true
      rejectPending?.(new Error('Codex 用量统计已停止'))
      const old = worker
      worker = null
      if (old) await old.terminate()
    },
  }
  return service
}
const defaultService = createCodexSessionUsageService({
  directory: join(homedir(), '.codex', 'sessions'),
})
export const getRecentCodexSessionUsage = (forceRefresh = false) => defaultService.get(forceRefresh)
export const stopCodexSessionUsage = () => defaultService.dispose()
