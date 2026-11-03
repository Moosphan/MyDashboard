interface RefreshDependencies {
  run(signal: AbortSignal): Promise<void>
  visible(): boolean
  updated?(): void
  failed?(): void
}

interface RefreshOptions {
  intervalMs: number
  timeoutMs: number
  maxBackoffMs?: number
  activationDelayMs?: number
}

export class UsageRefreshControl {
  private inFlight: Promise<void> | null = null
  private cleanup: Promise<void> | null = null
  private pendingRebuild: Promise<void> | null = null
  private controller: AbortController | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private activation: ReturnType<typeof setTimeout> | null = null
  private running = false
  private suspended = false
  private stopped = false
  private generation = 0
  private failures = 0

  constructor(private readonly dependencies: RefreshDependencies, private readonly options: RefreshOptions) {}

  get status() {
    return {
      active: this.inFlight !== null,
      pendingRebuild: this.pendingRebuild !== null,
      scheduled: this.timer !== null || this.activation !== null,
      nextDelayMs: Math.min(this.options.intervalMs * 2 ** this.failures, this.options.maxBackoffMs ?? 15 * 60_000),
    }
  }

  refresh(rebuild = false): Promise<void> {
    if (this.stopped || this.suspended) return Promise.reject(new Error('用量刷新已停止'))
    if (this.inFlight) {
      if (!rebuild) return this.inFlight
      if (this.pendingRebuild) return this.pendingRebuild
      const generation = this.generation
      const previous = this.inFlight
      const cleanup = this.cleanup
      this.controller?.abort()
      const pending = previous.catch(() => {}).then(() => cleanup).then(() => {
        if (this.generation !== generation || this.stopped || this.suspended)
          throw new Error('用量刷新已停止')
        return this.refresh()
      }).finally(() => {
        if (this.pendingRebuild === pending) this.pendingRebuild = null
      })
      this.pendingRebuild = pending
      return pending
    }
    this.clearTimer()
    const generation = this.generation
    const controller = new AbortController()
    this.controller = controller
    const work = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error('用量刷新已取消或超时')
      return this.dependencies.run(controller.signal)
    })
    const cleanup = work.then(() => {}, () => {})
    this.cleanup = cleanup
    let timedOut = false
    let timeout: ReturnType<typeof setTimeout>
    let aborted!: () => void
    const operation = new Promise<void>((resolve, reject) => {
      aborted = () => reject(new Error('用量刷新已取消或超时'))
      controller.signal.addEventListener('abort', aborted, { once: true })
      timeout = setTimeout(() => { timedOut = true; controller.abort() }, this.options.timeoutMs)
      const completed = work.then(() => {
        if (controller.signal.aborted) throw new Error('用量刷新已取消或超时')
      })
      completed.then(resolve, reject)
    })
    const refresh = operation.then(() => {
      if (generation !== this.generation || controller.signal.aborted) return
      this.failures = 0
      this.dependencies.updated?.()
    }, error => {
      if (generation === this.generation && (!controller.signal.aborted || timedOut)) {
        this.failures = Math.min(this.failures + 1, 8)
        this.dependencies.failed?.()
      }
      throw error
    }).finally(async () => {
      clearTimeout(timeout)
      controller.signal.removeEventListener('abort', aborted)
      await cleanup
      if (this.inFlight === refresh) {
        this.inFlight = null
        this.controller = null
        if (this.cleanup === cleanup) this.cleanup = null
      }
      this.schedule()
    })
    this.inFlight = refresh
    return refresh
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.stopped = false
    this.suspended = false
    this.automatic()
  }

  activate(): void {
    if (!this.running || this.stopped || this.suspended || this.activation) return
    this.activation = setTimeout(() => {
      this.activation = null
      this.automatic()
    }, this.options.activationDelayMs ?? 1500)
  }

  suspend(): void {
    this.suspended = true
    this.cancel()
  }

  resume(): void {
    if (this.stopped) return
    this.suspended = false
    this.activate()
  }

  stop(): void {
    this.running = false
    this.stopped = true
    this.cancel()
  }

  private cancel(): void {
    this.generation++
    this.clearTimer()
    if (this.activation) clearTimeout(this.activation)
    this.activation = null
    this.controller?.abort()
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private automatic(): void {
    if (!this.running || this.stopped || this.suspended) return
    if (!this.dependencies.visible()) {
      this.schedule()
      return
    }
    void this.refresh().catch(() => {})
  }

  private schedule(): void {
    if (!this.running || this.stopped || this.suspended || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.automatic()
    }, this.status.nextDelayMs)
  }
}
