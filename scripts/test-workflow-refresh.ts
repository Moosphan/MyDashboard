import test from 'node:test'
import assert from 'node:assert/strict'
import { WorkflowRefreshQueue } from '../src/renderer/modules/video/workflow/refresh-queue'

test('coalesces events while active and drains latest ids without overlap', async () => {
  const batches: (string[] | null)[] = []
  const releases: (() => void)[] = []
  let active = 0,
    maxActive = 0
  const queue = new WorkflowRefreshQueue(async (ids) => {
    active++
    maxActive = Math.max(maxActive, active)
    batches.push(ids)
    await new Promise<void>((resolve) => releases.push(resolve))
    active--
  }, 0)
  const pending = queue.refresh()
  await new Promise((resolve) => setTimeout(resolve, 1))
  for (let index = 0; index < 100; index++) queue.updated('a')
  queue.updated('b')
  releases.shift()!()
  await new Promise((resolve) => setTimeout(resolve, 1))
  assert.deepEqual(batches, [null, ['a', 'b']])
  releases.shift()!()
  await pending
  assert.equal(maxActive, 1)
  queue.dispose()
})

test('disposal cancels scheduled demand and reports one refresh failure to caller', async () => {
  let calls = 0
  const queue = new WorkflowRefreshQueue(async () => {
    calls++
    throw new Error('synthetic failure')
  }, 0)
  await assert.rejects(queue.refresh(), /synthetic failure/)
  queue.updated('a')
  queue.dispose()
  await new Promise((resolve) => setTimeout(resolve, 2))
  assert.equal(calls, 1)
})

test('drains newer demand even when the active batch fails', async () => {
  const batches: (string[] | null)[] = []
  let fail: (error: Error) => void = () => {}
  const queue = new WorkflowRefreshQueue(async (ids) => {
    batches.push(ids)
    if (batches.length === 1)
      await new Promise<void>((_resolve, reject) => {
        fail = reject
      })
  }, 0)
  const first = assert.rejects(queue.refresh(), /failure/)
  queue.updated('terminal')
  fail(new Error('failure'))
  await first
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.deepEqual(batches, [null, ['terminal']])
  queue.dispose()
})
