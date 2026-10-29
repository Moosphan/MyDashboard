import { parentPort, workerData } from 'node:worker_threads'
import { CodexSessionScanner } from './codex-session-scanner'

const scanner = new CodexSessionScanner()
parentPort?.on('message', async () => {
  try {
    parentPort?.postMessage({ ok: true, ...(await scanner.scan(workerData.directory)) })
  } catch {
    parentPort?.postMessage({ ok: false })
  } // Never transfer session paths or raw parser errors.
})
