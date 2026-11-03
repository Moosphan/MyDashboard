const { app, BrowserWindow, ipcMain, session } = require('electron')
const { writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')

const started = performance.now()
app.setAppPath(process.env.DAILY_FIXTURE_RELEASE)
if (!process.env.DAILY_BENCHMARK) delete process.env.ELECTRON_RENDERER_URL
global.fetch = async () => { throw new Error('Synthetic offline fixture') }
app.whenReady().then(() => {
  for (const partition of [session.defaultSession, session.fromPartition('persist:chatgpt-session')]) {
    partition.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, done) => done({ cancel: !details.url.startsWith('http://127.0.0.1:') }))
  }
})
require(resolve(process.env.DAILY_FIXTURE_RELEASE, 'out/main/index.js'))
app.whenReady().then(async () => {
  ipcMain.removeHandler('ai:getCodexUsageDashboard')
  ipcMain.handle('ai:getCodexUsageDashboard', () => ({ success: false, error: 'Synthetic offline fixture' }))
  for (let attempt = 0; attempt < 150; attempt++) {
    const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().startsWith(process.env.ELECTRON_RENDERER_URL || 'file:'))
    if (window && !window.webContents.isLoadingMainFrame()) {
      const ready = await window.webContents.executeJavaScript(`(() => {
        if (![...document.querySelectorAll('main h3')].some(element=>element.textContent==='Tasks')) return false
        const restored = localStorage.getItem('video-workflow-draft:synthetic:brief')?.includes('synthetic saved draft') === true
        localStorage.setItem('video-workflow-draft:synthetic:brief', JSON.stringify({payload:{text:'synthetic saved draft'},expected:1}))
        return (location.protocol==='file:' && location.hash==='#/dashboard') || (location.protocol==='http:' && location.pathname==='/dashboard') ? { restored } : false
      })()`)
      if (ready) {
        if (process.env.DAILY_BENCHMARK) {
          const startupMs = performance.now() - started
          const go = async label => {
            const then = performance.now()
            await window.webContents.executeJavaScript(`[...document.querySelectorAll('aside button')].find(button=>button.textContent.trim().endsWith(${JSON.stringify(label)})).click()`)
            for (let check = 0; check < 150; check++) {
              const done = await window.webContents.executeJavaScript(label === 'Video' ? `document.querySelector('main').textContent.includes('新建视频项目')` : `[...document.querySelectorAll('main h3')].some(item=>item.textContent==='Tasks')`)
              if (done) return performance.now() - then
              await delay(10)
            }
            throw new Error('Benchmark navigation timeout')
          }
          const firstVideoMs = await go('Video')
          await go('Dashboard')
          const warmVideoMs = await go('Video')
          const ipc = []
          for (let sample = 0; sample < 20; sample++) {
            const then = performance.now()
            await window.webContents.executeJavaScript(`window.electronAPI.invoke('profile:get')`)
            ipc.push(performance.now() - then)
          }
          const cpu = process.cpuUsage()
          await delay(500)
          const idleCpuMs = Object.values(process.cpuUsage(cpu)).reduce((sum, value) => sum + value, 0) / 1000
          writeFileSync(process.env.DAILY_FIXTURE_READY, JSON.stringify({ startupMs, firstVideoMs, warmVideoMs, ipcP95Ms: ipc.sort((left, right) => left-right)[18], idleCpuMs, rssMiB: process.memoryUsage().rss / 1024 / 1024 }))
          app.exit(0)
          return
        }
        writeFileSync(process.env.DAILY_FIXTURE_READY, JSON.stringify({ ready: true, restored: ready.restored }))
        return
      }
    }
    await delay(100)
  }
  app.exit(1)
})
