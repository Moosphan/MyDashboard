const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const Module = require('node:module')
const { setTimeout: delay } = require('node:timers/promises')
require('tsx/cjs')
const app = new EventEmitter()
const powerMonitor = new EventEmitter()
const windows = []
let loads = 0
let accountReads = 0
let snapshotReads = 0
let loadMode = 'success'
let failAccount = false
const sent = []
const main = { isDestroyed: () => false, isVisible: () => true, isMinimized: () => false, webContents: { send: channel => sent.push(channel) } }
class Window extends EventEmitter {
  destroyed = false
  constructor() {
    super()
    windows.push(this)
    this.webContents = Object.assign(new EventEmitter(), {
      isDestroyed: () => this.destroyed,
      stop: () => {},
      setWindowOpenHandler: () => {},
      executeJavaScript: async () => 'synthetic-token',
      loadURL: async () => { loads++; if (loadMode === 'success') setImmediate(() => this.webContents.emit('did-finish-load')) },
    })
  }
  isVisible() { return false }
  isMinimized() { return false }
  isDestroyed() { return this.destroyed }
  destroy() { this.destroyed = true; this.emit('closed') }
  static getAllWindows() { return [main, ...windows.filter(window => !window.destroyed)] }
}
const originalLoad = Module._load
Module._load = function(request, parent, isMain) {
  if (request === 'electron') return { app, powerMonitor, BrowserWindow: Window }
  if (request === './reset-radar-service') return {
    refreshChatGPTAccountUsage: async (token, signal) => {
      assert.equal(token, 'synthetic-token')
      assert.equal(signal.aborted, false)
      accountReads++
      if (failAccount) throw new Error('https://synthetic.invalid/?token=private')
    },
    getResetRadarSnapshot: async (_force, signal) => { assert.equal(signal.aborted, false); snapshotReads++ },
  }
  if (request === './chatgpt-usage-refresh') return { CHATGPT_USAGE_REFRESH_INTERVAL_MS: 10000 }
  return originalLoad.call(this, request, parent, isMain)
}
const scheduler = require('../src/main/services/reset-radar/usage-refresh-scheduler.ts')
Module._load = originalLoad
async function run() {
  const output = []
  const originalInfo = console.info
  console.info = (...args) => output.push(args.join(' '))
  try {
    scheduler.startChatGPTUsageRefreshScheduler()
    await delay(20)
    assert.equal(accountReads, 1)
    assert.equal(snapshotReads, 1)
    assert.equal(windows.filter(window => !window.destroyed).length, 0)
    failAccount = true
    await assert.rejects(scheduler.refreshChatGPTUsageNow(), /synthetic/)
    assert.equal(snapshotReads, 2, 'public radar remains available after account failure')
    assert.equal(output.some(line => line.includes('private') || line.includes('synthetic.invalid')), false)
    loadMode = 'hang'
    const active = scheduler.refreshChatGPTUsageNow()
    const rejected = assert.rejects(active, /取消/)
    await delay(5)
    powerMonitor.emit('suspend')
    await rejected
    assert.equal(windows.filter(window => !window.destroyed).length, 0)
    powerMonitor.emit('resume')
    for (let index = 0; index < 100; index++) app.emit('browser-window-focus')
    scheduler.stopChatGPTUsageRefreshScheduler()
    const count = loads
    await delay(1600)
    assert.equal(loads, count)
    assert.equal(powerMonitor.eventNames().length, 0)
    assert.equal(app.eventNames().length, 0)
    assert.ok(sent.includes('reset-radar:updated'))
    console.log('USAGE_SCHEDULER_OK: public fallback, sanitized failures, suspend/stop cleanup and no late recreation')
  } finally {
    scheduler.stopChatGPTUsageRefreshScheduler()
    console.info = originalInfo
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
