import { TOOL_STALE_MS, TOOL_TIMEOUT_MS, VPN_REFRESH_MS, ToolFailure, type ToolSnapshot } from '../../../shared/toolbox'

interface CoordinatorOptions {
  now?: () => number
  intervalMs?: number
  timeoutMs?: number
  staleMs?: number
  initialSnapshot?: ToolSnapshot | null
}

export class ToolCoordinator {
  private snapshot: ToolSnapshot = { data: null, lastSuccessAt: null, refreshing: false, error: null, stale: false }
  private active = false
  private generation = 0
  private controller: AbortController | null = null
  private pending: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private readonly now: () => number
  private readonly intervalMs: number
  private readonly timeoutMs: number
  private readonly staleMs: number

  constructor(private readonly read: (signal: AbortSignal) => Promise<unknown>, private readonly onChanged: () => void, options: CoordinatorOptions = {}) {
    this.now = options.now ?? Date.now
    this.intervalMs = options.intervalMs ?? VPN_REFRESH_MS
    this.timeoutMs = options.timeoutMs ?? TOOL_TIMEOUT_MS
    this.staleMs = options.staleMs ?? TOOL_STALE_MS
    if (options.initialSnapshot) this.snapshot = { ...options.initialSnapshot, refreshing: false, error: null }
  }

  getSnapshot(): ToolSnapshot {
    return { ...this.snapshot, stale: this.snapshot.lastSuccessAt !== null && this.now() - this.snapshot.lastSuccessAt >= this.staleMs }
  }

  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return
    this.active = active
    if (active) {
      if (!this.requiresLogin()) void this.refresh()
    } else {
      this.cancel()
    }
  }

  invalidate(): void {
    this.cancel()
    this.snapshot = { data: null, lastSuccessAt: null, refreshing: false, error: null, stale: false }
    this.onChanged()
  }

  refresh(): Promise<void> {
    if (this.disposed || !this.active) return Promise.resolve()
    if (this.pending) return this.pending
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const generation = this.generation
    const controller = new AbortController()
    this.controller = controller
    this.snapshot = { ...this.snapshot, refreshing: true, error: null }
    this.onChanged()
    let abortListener: () => void
    const canceled = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(new Error('canceled'))
      controller.signal.addEventListener('abort', abortListener, { once: true })
    })
    const timeout = setTimeout(() => {
      if (this.generation === generation) {
        this.snapshot = { ...this.snapshot, error: { code: 'timeout', message: '读取超时，请稍后重试' } }
        controller.abort()
      }
    }, this.timeoutMs)
    let reading: Promise<unknown>
    try { reading = this.read(controller.signal) } catch (error) { reading = Promise.reject(error) }
    this.pending = Promise.race([reading, canceled]).then(data => {
      if (this.generation !== generation || controller.signal.aborted) return
      this.snapshot = { data, lastSuccessAt: this.now(), refreshing: false, error: null, stale: false }
    }).catch(error => {
      if (this.generation !== generation || controller.signal.aborted) return
      const failure = error instanceof ToolFailure ? error : new ToolFailure('network', '读取失败，请检查网络后重试')
      this.snapshot = { ...this.snapshot, error: { code: failure.code, message: failure.message } }
    }).finally(() => {
      clearTimeout(timeout)
      controller.signal.removeEventListener('abort', abortListener)
      if (this.generation !== generation) return
      this.pending = null
      this.controller = null
      this.snapshot = { ...this.snapshot, refreshing: false }
      this.onChanged()
      if (this.active && !this.requiresLogin()) this.timer = setTimeout(() => { void this.refresh() }, this.intervalMs)
    })
    return this.pending
  }

  dispose(): void {
    this.active = false
    this.disposed = true
    this.cancel()
  }

  private requiresLogin(): boolean {
    return this.snapshot.error?.code === 'login_required' || this.snapshot.error?.code === 'challenge'
  }

  private cancel(): void {
    this.generation++
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.controller?.abort()
    this.controller = null
    this.pending = null
    this.snapshot = { ...this.snapshot, refreshing: false }
    this.onChanged()
  }
}
