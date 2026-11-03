const { app, BrowserWindow, ipcMain, session } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { createServer } = require('node:http')
const { setTimeout: delay } = require('node:timers/promises')
const root = mkdtempSync(join(tmpdir(), 'synthetic-resource-budget-'))
app.setPath('userData', root)
app.on('window-all-closed', () => {})
require('tsx/cjs')
const { workflowCommand } = require('../src/main/services/video-workflow/process.ts')
const { mediaTaskBudget } = require('../src/main/services/task-budget.ts')
const { withUsageSession } = require('../src/main/services/reset-radar/usage-session.ts')
ipcMain.handle('synthetic:ping', () => true)

app.whenReady().then(async () => {
  let window
  let server
  let timer
  try {
    server = createServer(() => {})
    await new Promise(done => server.listen(0, '127.0.0.1', done))
    const hangingUrl = `http://127.0.0.1:${server.address().port}/synthetic`
    for (let iteration = 0; iteration < 12; iteration++) {
      let hidden
      await assert.rejects(withUsageSession(() => {
        hidden = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
        const load = hidden.webContents.loadURL.bind(hidden.webContents)
        hidden.webContents.loadURL = () => load(hangingUrl)
        return hidden
      }, new AbortController().signal, async () => { throw new Error('must not run') }, 30), /页面加载(超时|失败)/)
      assert.equal(hidden.isDestroyed(), true)
      assert.equal(BrowserWindow.getAllWindows().length, 0)
    }
    window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, preload: resolve('scripts/fixtures/resource-budget-preload.cjs') } })
    await window.loadURL('data:text/html,<main>Synthetic resource budget</main>')
    process.env.ELECTRON_RUN_AS_NODE = '1'
    const heartbeats = []
    let last = performance.now()
    timer = setInterval(() => { const now = performance.now(); heartbeats.push(now - last); last = now }, 5)
    const command = ['-e', 'let total=0;for(let index=0;index<2000000;index++)total+=Math.sqrt(index);setTimeout(()=>{},70)']
    const pending = Array.from({ length: 12 }, () => workflowCommand(process.execPath, command, { cwd: root }))
    const ipc = []
    let peakRss = process.memoryUsage().rss
    for (let sample = 0; sample < 40; sample++) {
      const then = performance.now()
      assert.equal(await window.webContents.executeJavaScript('window.syntheticPing()'), true)
      ipc.push(performance.now() - then)
      peakRss = Math.max(peakRss, process.memoryUsage().rss)
      assert.ok(mediaTaskBudget.status.active <= 2)
      assert.ok(mediaTaskBudget.status.queued <= 20)
      await delay(5)
    }
    await Promise.all(pending)
    await mediaTaskBudget.drain()
    const recovery = performance.now()
    assert.equal(await window.webContents.executeJavaScript('window.syntheticPing()'), true)
    const recoveryMs = performance.now() - recovery
    clearInterval(timer)
    timer = null
    const percentile = (samples, fraction) => samples.sort((left, right) => left - right)[Math.floor(samples.length * fraction)]
    const heartbeatP95Ms = percentile(heartbeats, 0.95)
    const ipcP95Ms = percentile(ipc, 0.95)
    assert.ok(heartbeatP95Ms <= 100)
    assert.ok(ipcP95Ms <= 100)
    assert.ok(recoveryMs <= 100)
    assert.deepEqual(mediaTaskBudget.status, { active: 0, queued: 0 })
    console.log(JSON.stringify({ benchmark: 'synthetic-media-and-ipc', children: 12, concurrency: 2, queueLimit: 20, heartbeatP95Ms: Math.round(heartbeatP95Ms), ipcP95Ms: Math.round(ipcP95Ms), ipcP99Ms: Math.round(percentile(ipc, 0.99)), recoveryMs: Math.round(recoveryMs), peakMainRssMiB: Math.round(peakRss / 1024 / 1024), failedPagesCleaned: 12 }))
    window.destroy()
    window = null
    server.closeAllConnections()
    await new Promise(done => server.close(done))
    server = null
    app.exit(0)
  } catch (error) {
    console.error(error.message)
    if (timer) clearInterval(timer)
    if (window && !window.isDestroyed()) window.destroy()
    server?.closeAllConnections()
    server?.close()
    app.exit(1)
  }
}).finally(() => rmSync(root, { recursive: true, force: true }))
