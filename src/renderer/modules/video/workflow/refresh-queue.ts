export class WorkflowRefreshQueue {
  private ids = new Set<string>()
  private full = false
  private active: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  constructor(
    private readonly read: (ids: string[] | null) => Promise<void>,
    private readonly delay = 60,
  ) {}
  updated(id: string) {
    if (this.disposed) return
    this.ids.add(id)
    if (this.ids.size > 100) {
      this.full = true
      this.ids.clear()
    }
    if (!this.active && !this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        void this.drain().catch(() => {})
      }, this.delay)
  }
  refresh() {
    if (this.disposed) return Promise.resolve()
    this.full = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    return this.drain()
  }
  private drain(): Promise<void> {
    if (this.active) return this.active
    const operation = async () => {
      while (!this.disposed && (this.full || this.ids.size)) {
        const ids = this.full ? null : [...this.ids]
        this.full = false
        this.ids.clear()
        await this.read(ids)
      }
    }
    this.active = operation().finally(() => {
      this.active = null
      if (!this.disposed && (this.full || this.ids.size))
        this.timer = setTimeout(() => {
          this.timer = null
          void this.drain().catch(() => {})
        }, this.delay)
    })
    return this.active
  }
  dispose() {
    this.disposed = true
    this.ids.clear()
    this.full = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
