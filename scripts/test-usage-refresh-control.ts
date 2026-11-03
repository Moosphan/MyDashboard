import assert from 'node:assert/strict'
import test from 'node:test'
import { UsageRefreshControl } from '../src/main/services/reset-radar/usage-refresh-control'

const tick = () => new Promise<void>(resolve => setImmediate(resolve))

test('many rebuild callers share at most one pending rebuild and stop invalidates it', async () => {
  const releases: (() => void)[] = []
  let count = 0
  const controller = new UsageRefreshControl({
    run: signal => {
      count++
      return new Promise<void>((resolve, reject) => {
        releases.push(resolve)
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      })
    },
    visible: () => true,
  }, { intervalMs: 1000, timeoutMs: 1000 })
  const first = controller.refresh()
  const rejected = assert.rejects(first)
  await tick()
  const rebuilds = Array.from({ length: 100 }, () => controller.refresh(true))
  await rejected
  await tick()
  assert.equal(count, 2)
  assert.ok(rebuilds.every(item => item === rebuilds[0]))
  releases.at(-1)!()
  await Promise.all(rebuilds)
  const active = controller.refresh()
  const cancelled = assert.rejects(active)
  await tick()
  const pending = controller.refresh(true)
  const pendingCancelled = assert.rejects(pending)
  controller.stop()
  await Promise.all([cancelled, pendingCancelled])
  await tick()
  assert.equal(count, 3)
})

test('automatic refresh defers offscreen, backs off, and coalesces activation', async () => {
  let visible = false
  let calls = 0
  const controller = new UsageRefreshControl({
    run: async () => { calls++; throw new Error('synthetic secret url') },
    visible: () => visible,
  }, { intervalMs: 10, timeoutMs: 50, maxBackoffMs: 40, activationDelayMs: 2 })
  controller.start()
  await new Promise(resolve => setTimeout(resolve, 15))
  assert.equal(calls, 0)
  visible = true
  for (let index = 0; index < 100; index++) controller.activate()
  await new Promise(resolve => setTimeout(resolve, 7))
  assert.equal(calls, 1)
  assert.equal(controller.status.nextDelayMs, 20)
  await assert.rejects(controller.refresh(), /synthetic/)
  assert.equal(controller.status.nextDelayMs, 40)
  controller.stop()
  await new Promise(resolve => setTimeout(resolve, 45))
  assert.equal(calls, 2)
  assert.deepEqual(controller.status, { active: false, pendingRebuild: false, scheduled: false, nextDelayMs: 40 })
})

test('timed out or suspended work cannot notify after late completion', async () => {
  let release!: () => void
  let notifications = 0
  const controller = new UsageRefreshControl({
    run: () => new Promise<void>(resolve => { release = resolve }),
    visible: () => true,
    updated: () => { notifications++ },
  }, { intervalMs: 1000, timeoutMs: 5 })
  const timedOut = assert.rejects(controller.refresh(), /超时/)
  await new Promise(resolve => setTimeout(resolve, 10))
  release()
  await timedOut
  await tick()
  assert.equal(notifications, 0)
  const active = controller.refresh()
  const rejected = assert.rejects(active)
  await tick()
  controller.suspend()
  release()
  await rejected
  await tick()
  assert.equal(notifications, 0)
  controller.stop()
})

test('rebuild waits for delayed abort cleanup rather than overlapping operations', async () => {
  let active = 0
  let maximum = 0
  let release!: () => void
  const controller = new UsageRefreshControl({
    visible: () => true,
    run: async signal => {
      active++
      maximum = Math.max(maximum, active)
      await new Promise<void>(resolve => {
        release = resolve
        signal.addEventListener('abort', () => setTimeout(resolve, 15), { once: true })
      })
      active--
    },
  }, { intervalMs: 1000, timeoutMs: 1000 })
  const first = controller.refresh()
  const rejected = assert.rejects(first)
  await tick()
  const next = controller.refresh(true)
  await rejected
  await tick()
  assert.equal(maximum, 1)
  release()
  await next
  controller.stop()
})
