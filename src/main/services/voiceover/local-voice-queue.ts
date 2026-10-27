export class LocalVoiceQueue {
  private tail: Promise<unknown> = Promise.resolve()

  async drain() {
    await this.tail
  }

  run<Result>(action: () => Promise<Result>, signal: AbortSignal): Promise<Result> {
    const pending = this.tail.then(() => {
      if (signal.aborted) throw cancellationReason(signal)
      return action()
    })
    this.tail = pending.catch(() => {})
    return new Promise((resolve, reject) => {
      const abort = () => reject(cancellationReason(signal))
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
      pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
    })
  }
}

function cancellationReason(signal: AbortSignal) {
  return signal.reason instanceof Error && signal.reason.name !== 'AbortError'
    ? signal.reason
    : new Error('任务已取消')
}
