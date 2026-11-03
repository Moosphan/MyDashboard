import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalVoiceQueue, LOCAL_VOICE_QUEUE_LIMIT } from '../src/main/services/voiceover/local-voice-queue'
import { TaskBudget } from '../src/main/services/task-budget'
import { mediaTaskBudget } from '../src/main/services/task-budget'
import { workflowCommand } from '../src/main/services/video-workflow/process'
import { runCommand } from '../src/main/services/voiceover/process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('local voice queue rejects excess pending work and removes cancelled entries', async () => {
  assert.ok(Number.isInteger(LOCAL_VOICE_QUEUE_LIMIT))
  const queue = new LocalVoiceQueue()
  const first = new AbortController()
  let release!: () => void
  const events: string[] = []
  const active = queue.run(async () => {
    events.push('active')
    await new Promise<void>(resolve => { release = resolve })
  }, first.signal)
  await new Promise(resolve => setImmediate(resolve))
  for (let index = 0; index <= LOCAL_VOICE_QUEUE_LIMIT; index++) {
    const controller = new AbortController()
    const pending = queue.run(async () => { events.push(`pending-${index}`) }, controller.signal)
    if (index === 0) {
      controller.abort()
      await assert.rejects(pending, /取消/)
    } else void pending.catch(() => {})
  }
  await assert.rejects(
    queue.run(async () => {}, new AbortController().signal),
    /QUEUE_FULL/,
  )
  first.abort()
  await assert.rejects(active, /取消/)
  release()
  await queue.drain()
  assert.equal(events.includes('pending-0'), false)
  assert.equal(events.length, LOCAL_VOICE_QUEUE_LIMIT + 1)
})

test('task budget holds active slot after cancellation until work settles', async () => {
  const budget = new TaskBudget(1, 1, 50)
  const controller = new AbortController()
  let release!: () => void
  const first = budget.run(() => new Promise<void>(resolve => { release = resolve }), controller.signal)
  const firstRejected = assert.rejects(first, /取消/)
  await new Promise(resolve => setImmediate(resolve))
  let ran = false
  const second = budget.run(async () => { ran = true })
  controller.abort()
  await firstRejected
  assert.equal(ran, false)
  release()
  await second
  await budget.drain()
  assert.deepEqual(budget.status, { active: 0, queued: 0 })
})

test('waiting budget entries time out without spawning and release their capacity', async () => {
  const budget = new TaskBudget(1, 1, 10)
  let release!: () => void
  const first = budget.run(() => new Promise<void>(resolve => { release = resolve }))
  let ran = false
  await assert.rejects(budget.run(async () => { ran = true }), /QUEUE_TIMEOUT/)
  assert.equal(ran, false)
  assert.equal(budget.status.queued, 0)
  release()
  await first
  await budget.drain()
})

test('workflow and voice subprocesses share bounded admission without spawning cancelled waiters', async () => {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-media-budget-'))
  try {
    const command = (name: string) => ['-e', `require('node:fs').writeFileSync(process.argv[1],'synthetic');setTimeout(()=>{},100)`, join(root, name)]
    const first = workflowCommand(process.execPath, command('first'), { cwd: root })
    const second = runCommand(process.execPath, command('second'))
    const controller = new AbortController()
    const cancelled = workflowCommand(process.execPath, command('cancelled'), { cwd: root, signal: controller.signal })
    const rejected = assert.rejects(cancelled, /取消/)
    const last = runCommand(process.execPath, command('last'))
    await new Promise(resolve => setTimeout(resolve, 25))
    assert.deepEqual(mediaTaskBudget.status, { active: 2, queued: 2 })
    controller.abort()
    await rejected
    await Promise.all([first, second, last])
    await mediaTaskBudget.drain()
    assert.deepEqual(readdirSync(root).sort(), ['first', 'last', 'second'])
    assert.deepEqual(mediaTaskBudget.status, { active: 0, queued: 0 })
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('local lane stays occupied until its cancelled media process actually closes', async () => {
  const queue = new LocalVoiceQueue()
  const controller = new AbortController()
  let started!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  const first = queue.run(() => workflowCommand(process.execPath, ['-e', "process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),100));console.log('ready');setInterval(()=>{},1000)"], {
    cwd: process.cwd(), signal: controller.signal, onOutput: () => started(),
  }).then(() => {}), controller.signal)
  const rejected = assert.rejects(first, /取消/)
  await ready
  let nextStarted = false
  const next = queue.run(async () => { nextStarted = true }, new AbortController().signal)
  controller.abort()
  await rejected
  await new Promise(resolve => setTimeout(resolve, 25))
  assert.equal(nextStarted, false)
  await next
  await queue.drain()
})
