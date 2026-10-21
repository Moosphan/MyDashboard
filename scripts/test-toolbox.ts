import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePreferences, applyToolboxAction } from '../src/shared/toolbox-preferences'
import { ToolCoordinator } from '../src/main/services/toolbox/coordinator'
import { VPN_TOOL, VPN_REFRESH_MS, TOOL_STALE_MS, TOOL_TIMEOUT_MS, ToolFailure, type ToolDescriptor } from '../src/shared/toolbox'

const descriptors: ToolDescriptor[] = [VPN_TOOL, ...['a', 'b', 'c'].map(id => ({ ...VPN_TOOL, id }))]

test('new VPN is visible, later tools require enabling; removed tools retain preferences', () => {
  const initial = normalizePreferences(null, descriptors)
  assert.equal(initial.tools[0].enabled, true)
  assert.equal(initial.tools[1].enabled, false)
  const removed = normalizePreferences(initial, [VPN_TOOL])
  assert.equal(removed.tools.length, 4)
  assert.deepEqual(normalizePreferences(JSON.parse(JSON.stringify(removed)), descriptors), initial)
})

test('visible reorder retains hidden slots, pin moves to group end, enable restores visibility preference', () => {
  let prefs = normalizePreferences(null, descriptors)
  for (const toolId of ['a', 'b', 'c']) prefs = applyToolboxAction(prefs, { type: 'enabled', toolId, value: true })
  prefs = applyToolboxAction(prefs, { type: 'visible', toolId: 'b', value: false })
  prefs = applyToolboxAction(prefs, { type: 'move', toolId: 'c', targetId: 'a' })
  assert.deepEqual(prefs.tools.map(tool => tool.id), ['shadowsocks', 'c', 'b', 'a'])
  prefs = applyToolboxAction(prefs, { type: 'pin', toolId: 'c', value: true })
  prefs = applyToolboxAction(prefs, { type: 'pin', toolId: 'a', value: true })
  assert.deepEqual(prefs.tools.filter(tool => tool.pinned).map(tool => tool.id), ['c', 'a'])
  prefs = applyToolboxAction(prefs, { type: 'enabled', toolId: 'b', value: false })
  prefs = applyToolboxAction(prefs, { type: 'enabled', toolId: 'b', value: true })
  assert.equal(prefs.tools.find(tool => tool.id === 'b')?.visible, false)
  assert.throws(() => applyToolboxAction(prefs, { type: 'move', toolId: 'c', targetId: 'shadowsocks' }))
})

test('rejects invalid actions and malformed persisted state', () => {
  assert.throws(() => normalizePreferences({ version: 3, tools: [] }, descriptors))
  const prefs = normalizePreferences(null, descriptors)
  assert.throws(() => applyToolboxAction(prefs, { type: 'visible', toolId: 'missing', value: true }))
  assert.throws(() => applyToolboxAction(prefs, { type: 'visible', toolId: 'a', value: true }))
})

test('first enable appends to normal group in activation order; re-enable retains saved position', () => {
  let prefs = normalizePreferences(null, descriptors)
  prefs = applyToolboxAction(prefs, { type: 'enabled', toolId: 'c', value: true })
  prefs = applyToolboxAction(prefs, { type: 'enabled', toolId: 'a', value: true })
  assert.deepEqual(prefs.tools.filter(tool => tool.enabled).map(tool => tool.id), ['shadowsocks', 'c', 'a'])
  prefs = applyToolboxAction(prefs, { type: 'enabled', toolId: 'c', value: false })
  prefs = applyToolboxAction(prefs, { type: 'enabled', toolId: 'c', value: true })
  assert.deepEqual(prefs.tools.filter(tool => tool.enabled).map(tool => tool.id), ['shadowsocks', 'c', 'a'])
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

test('deduplicates refresh and ignores late results after pause or configuration invalidation', async () => {
  const pending = deferred<unknown>()
  let calls = 0
  let signal: AbortSignal | undefined
  const coordinator = new ToolCoordinator(async received => { calls++; signal = received; return pending.promise }, () => {}, { intervalMs: 100_000 })
  coordinator.setActive(true)
  const request = coordinator.refresh()
  assert.equal(calls, 1)
  coordinator.setActive(false)
  assert.equal(signal?.aborted, true)
  pending.resolve({ account: 'old' })
  await request
  assert.equal(coordinator.getSnapshot().data, null)
  assert.equal(coordinator.getSnapshot().error, null)
  coordinator.dispose()
})

test('success snapshot survives failures, stale uses successful retrieval time', async () => {
  let now = 10
  let fail = false
  const coordinator = new ToolCoordinator(async () => {
    if (fail) throw new ToolFailure('network', '网络请求失败')
    return { used: '1.00' }
  }, () => {}, { now: () => now, intervalMs: 100_000, staleMs: 100 })
  coordinator.setActive(true)
  await coordinator.refresh()
  fail = true
  now = 111
  await coordinator.refresh()
  assert.equal(coordinator.getSnapshot().lastSuccessAt, 10)
  assert.equal(coordinator.getSnapshot().stale, true)
  assert.deepEqual(coordinator.getSnapshot().data, { used: '1.00' })
  coordinator.invalidate()
  assert.equal(coordinator.getSnapshot().data, null)
  coordinator.dispose()
})

test('timeout settles even when adapter ignores cancellation', async () => {
  const coordinator = new ToolCoordinator(() => new Promise(() => {}), () => {}, { timeoutMs: 10, intervalMs: 100_000 })
  coordinator.setActive(true)
  await coordinator.refresh()
  assert.equal(coordinator.getSnapshot().error?.code, 'timeout')
  assert.equal(coordinator.getSnapshot().refreshing, false)
  coordinator.dispose()
})

test('configured timing is five minutes, thirty seconds and thirty minutes', () => {
  assert.equal(VPN_REFRESH_MS, 300_000)
  assert.equal(TOOL_TIMEOUT_MS, 30_000)
  assert.equal(TOOL_STALE_MS, 1_800_000)
})

test('authentication failure stops timers; returning after ordinary pause refreshes only once', async () => {
  let calls = 0
  let signedIn = true
  const coordinator = new ToolCoordinator(async () => {
    calls++
    if (!signedIn) throw new ToolFailure('login_required', '请登录')
    return calls
  }, () => {}, { intervalMs: 10 })
  coordinator.setActive(true)
  await coordinator.refresh()
  coordinator.setActive(false)
  await new Promise(resolve => setTimeout(resolve, 25))
  assert.equal(calls, 1)
  coordinator.setActive(true)
  await coordinator.refresh()
  assert.equal(calls, 2)
  signedIn = false
  await coordinator.refresh()
  await new Promise(resolve => setTimeout(resolve, 25))
  assert.equal(calls, 3)
  coordinator.dispose()
})

test('configuration invalidation isolates old response from new request', async () => {
  const first = deferred<unknown>()
  let calls = 0
  const coordinator = new ToolCoordinator(() => ++calls === 1 ? first.promise : Promise.resolve('new service'), () => {})
  coordinator.setActive(true)
  const oldRequest = coordinator.refresh()
  coordinator.invalidate()
  await coordinator.refresh()
  first.resolve('old service')
  await oldRequest
  assert.equal(coordinator.getSnapshot().data, 'new service')
  coordinator.dispose()
})

test('restored disk snapshot survives offline refresh and is replaced on success', async () => {
  let offline = true
  const coordinator = new ToolCoordinator(async () => {
    if (offline) throw new ToolFailure('network', '离线')
    return { used: '40.00' }
  }, () => {}, { now: () => 200, staleMs: 100, initialSnapshot: { data: { used: '39.05' }, lastSuccessAt: 10, refreshing: false, error: null, stale: false, fromCache: true } })
  assert.equal(coordinator.getSnapshot().fromCache, true)
  assert.equal(coordinator.getSnapshot().stale, true)
  coordinator.setActive(true)
  await coordinator.refresh()
  assert.deepEqual(coordinator.getSnapshot().data, { used: '39.05' })
  assert.equal(coordinator.getSnapshot().lastSuccessAt, 10)
  assert.equal(coordinator.getSnapshot().fromCache, true)
  offline = false
  await coordinator.refresh()
  assert.deepEqual(coordinator.getSnapshot().data, { used: '40.00' })
  assert.equal(coordinator.getSnapshot().fromCache, undefined)
  assert.equal(coordinator.getSnapshot().lastSuccessAt, 200)
  coordinator.dispose()
})
