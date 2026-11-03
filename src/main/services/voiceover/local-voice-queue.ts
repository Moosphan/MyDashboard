import { TaskBudget } from '../task-budget'

export const LOCAL_VOICE_QUEUE_LIMIT = 20

export class LocalVoiceQueue {
  private readonly budget = new TaskBudget(1, LOCAL_VOICE_QUEUE_LIMIT)

  drain() {
    return this.budget.drain()
  }

  run<Result>(action: () => Promise<Result>, signal: AbortSignal): Promise<Result> {
    return this.budget.run(action, signal)
  }
}
