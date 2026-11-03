import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { withUsageSession } from '../src/main/services/reset-radar/usage-session'

class SessionWindow extends EventEmitter {
  destroyed = false
  stopped = false
  webContents = Object.assign(new EventEmitter(), {
    loadURL: async (_url: string) => {},
    executeJavaScript: async (_source: string) => 'synthetic-token',
    stop: () => { this.stopped = true },
    isDestroyed: () => this.destroyed,
    setWindowOpenHandler: (_handler: unknown) => {},
  })
  isDestroyed = () => this.destroyed
  destroy = () => { this.destroyed = true; this.emit('closed') }
}

test('page timeout destroys the owned window and listeners before outer timeout', async () => {
  for (let index = 0; index < 10; index++) {
    const window = new SessionWindow()
    let ran = false
    await assert.rejects(withUsageSession(() => window, new AbortController().signal, async () => { ran = true }, 2), /页面加载超时/)
    assert.equal(window.destroyed, true)
    assert.equal(window.stopped, true)
    assert.equal(window.webContents.listenerCount('did-finish-load'), 0)
    assert.equal(window.webContents.listenerCount('did-fail-load'), 0)
    assert.equal(window.listenerCount('closed'), 0)
    window.webContents.emit('did-finish-load')
    assert.equal(ran, false)
  }
})

test('success and token failures release the hidden window', async () => {
  for (const fail of [false, true]) {
    const window = new SessionWindow()
    const pending = withUsageSession(() => window, new AbortController().signal, async token => {
      assert.equal(token, 'synthetic-token')
      if (fail) throw new Error('synthetic failure')
    }, 100)
    window.webContents.emit('did-finish-load')
    if (fail) await assert.rejects(pending, /synthetic/)
    else await pending
    assert.equal(window.destroyed, true)
    assert.equal(window.webContents.eventNames().length, 0)
  }
})

test('abort destroys page and prevents late token completion from running account work', { timeout: 100 }, async () => {
  const window = new SessionWindow()
  const controller = new AbortController()
  let resolveToken!: (value: string) => void
  window.webContents.executeJavaScript = () => new Promise(resolve => { resolveToken = resolve })
  let ran = false
  const pending = withUsageSession(() => window, controller.signal, async () => { ran = true }, 100)
  const rejected = assert.rejects(pending, /取消/)
  window.webContents.emit('did-finish-load')
  await new Promise(resolve => setImmediate(resolve))
  controller.abort()
  await rejected
  resolveToken('late-token')
  assert.equal(window.destroyed, true)
  assert.equal(ran, false)
})
