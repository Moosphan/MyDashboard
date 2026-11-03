interface PendingTask {
  start(): void
  cancel(error: Error): void
}

export function taskCancellation(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error && signal.reason.name !== 'AbortError'
    ? signal.reason
    : new Error('任务已取消')
}

export class TaskBudget {
  private active = 0
  private pending: PendingTask[] = []
  private waiters: (() => void)[] = []

  constructor(
    private readonly concurrency: number,
    private readonly queueLimit: number,
    private readonly waitMs = 120_000,
    private readonly rejectActiveOnAbort = true,
  ) {}

  get status() {
    return { active: this.active, queued: this.pending.length }
  }

  drain(): Promise<void> {
    return this.active || this.pending.length
      ? new Promise(resolve => this.waiters.push(resolve))
      : Promise.resolve()
  }

  run<Result>(action: () => Promise<Result>, signal?: AbortSignal): Promise<Result> {
    if (signal?.aborted) return Promise.reject(taskCancellation(signal))
    if (this.active >= this.concurrency && this.pending.length >= this.queueLimit)
      return Promise.reject(new Error('QUEUE_FULL: 等待队列已满，请稍后重试'))
    return new Promise<Result>((resolve, reject) => {
      let started = false
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const cleanup = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
      const finish = (error?: unknown, value?: Result) => {
        if (settled) return
        settled = true
        cleanup()
        if (error !== undefined) reject(error)
        else resolve(value as Result)
      }
      const entry: PendingTask = {
        cancel: error => {
          if (!started) this.pending = this.pending.filter(item => item !== entry)
          if (!started || this.rejectActiveOnAbort) finish(error)
        },
        start: () => {
          started = true
          clearTimeout(timer)
          this.active++
          Promise.resolve().then(() => {
            if (signal?.aborted) throw taskCancellation(signal)
            return action()
          }).then(
            value => signal?.aborted ? finish(taskCancellation(signal)) : finish(undefined, value),
            error => finish(error),
          ).finally(() => {
            this.active--
            this.pending.shift()?.start()
            if (!this.active && !this.pending.length)
              this.waiters.splice(0).forEach(waiter => waiter())
          })
        },
      }
      const abort = () => entry.cancel(taskCancellation(signal))
      signal?.addEventListener('abort', abort, { once: true })
      if (this.active < this.concurrency) entry.start()
      else {
        this.pending.push(entry)
        timer = setTimeout(() => entry.cancel(new Error('QUEUE_TIMEOUT: 等待资源超时，请重试')), this.waitMs)
      }
    })
  }
}

export const mediaTaskBudget = new TaskBudget(2, 20, 120_000, false)
