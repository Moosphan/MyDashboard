const { app, BrowserWindow, session } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')

process.env.MYDASHBOARD_USER_DATA = mkdtempSync(join(tmpdir(), 'video-music-ipc-'))
require('../out/main/index.js')

const timeout = setTimeout(() => {
  console.error('FAIL: music IPC timed out')
  app.exit(1)
}, 45000)

app.whenReady().then(async () => {
  try {
    let window
    for (let attempt = 0; attempt < 100; attempt += 1) {
      window = BrowserWindow.getAllWindows().find((item) =>
        item.webContents.getURL().startsWith('file:'),
      )
      if (window && !window.webContents.isLoadingMainFrame()) break
      await delay(100)
    }
    assert.ok(window, 'Application main window must load')
    const invalid = await window.webContents.executeJavaScript(
      "window.electronAPI.invoke('workflow:searchMusic', '')",
      true,
    )
    assert.equal(invalid.success, false)
    assert.match(invalid.error, /请输入 1–120 个字符的搜索词/)
    console.log('PASS: renderer can invoke registered music search handler')
    const download = await window.webContents.executeJavaScript(
      "window.electronAPI.invoke('workflow:downloadMusic', 'test-project', null)",
      true,
    )
    assert.equal(download.success, false)
    assert.match(download.error, /在线音频结果无效/)
    console.log('PASS: renderer can invoke registered music download handler')
    if (process.argv.includes('--live')) {
      console.log('Openverse proxy:', await session.defaultSession.resolveProxy('https://api.openverse.org'))
      const result = await window.webContents.executeJavaScript(
        "window.electronAPI.invoke('workflow:searchMusic', 'piano')",
        true,
      )
      assert.equal(result.success, true, result.error)
      assert.ok(result.data.length > 0, 'Live piano search must return audio results')
      assert.ok(result.data.every((item) => item.downloadUrl.startsWith('https://')))
      console.log(`PASS: live Openverse search returned ${result.data.length} audio results`)
    }
    clearTimeout(timeout)
    app.exit(0)
  } catch (error) {
    console.error(error)
    clearTimeout(timeout)
    app.exit(1)
  }
})
