const { app, dialog, safeStorage } = require('electron')
const assert = require('node:assert/strict')
const { readFileSync, writeFileSync, existsSync } = require('node:fs')
const { resolve, join } = require('node:path')

const directory = process.env.TOOLBOX_TEST_USER_DATA
if (!directory) throw new Error('Encrypted cache test requires isolated userData')
app.setPath('userData', directory)
process.env.TSX_TSCONFIG_PATH = resolve('tsconfig.main.json')
require('tsx/cjs')
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const { ShadowsocksPortal } = require('../src/main/services/toolbox/portal.ts')
  const portal = new ShadowsocksPortal(() => {})
  const partition = portal.partition
  const file = join(directory, 'toolbox/portal-cache.enc')
  const token = 'synthetic-sensitive-session-token'
  try {
    assert.equal(safeStorage.isEncryptionAvailable(), true, 'Test environment must provide actual OS encryption')
    assert.equal(portal.getStatus().persistentSession, true, 'Login must persist even without the Chromium cookie encryption fuse')
    assert.equal(partition.isPersistent(), false, 'Chromium must never create a plaintext cookie database')
    let offline = false
    await partition.protocol.handle('https', async request => {
      if (offline) return Response.error()
      const authenticated = (await partition.cookies.get({ url: request.url })).some(cookie => cookie.value === token)
      return new Response(authenticated ? '<meta charset="utf-8"><div id="Overview"><div id="data-usage-bar-graph"><div class="usage-detail">39.05 GB / 100.00 GB</div><div class="usage-addition-info">60.95 GB 剩余</div><div class="progress-bar" aria-valuenow="39.05"></div></div></div>' : '<form id="frmLogin"></form>', { headers: { 'Content-Type': 'text/html;charset=utf-8' } })
    })
    if (process.argv.includes('--write')) {
      await partition.cookies.set({ url: 'https://portal.shadowsocks.nz', name: 'session-token', value: token, secure: true, httpOnly: true, sameSite: 'lax' })
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
      await portal.openLogin()
      await portal.login.loadURL('https://portal.shadowsocks.nz/clientarea.php?action=productdetails&id=42')
      for (let attempt = 0; attempt < 100 && portal.getStatus().loginOpen; attempt++) await new Promise(resolveWait => setTimeout(resolveWait, 30))
      assert.equal(portal.getStatus().configured, true)
      assert.equal((await portal.read(new AbortController().signal)).used, '39.05')
      assert.equal(existsSync(file), true)
      const encrypted = readFileSync(file)
      assert.equal(encrypted.includes(Buffer.from(token)), false)
      assert.equal(encrypted.includes(Buffer.from('39.05')), false)
      const record = JSON.parse(safeStorage.decryptString(encrypted))
      assert.equal(record.cookies.some(cookie => cookie.value === token), true)
      assert.equal(record.cached.data.used, '39.05')
      assert.equal(JSON.stringify(portal.getStatus()).includes(token), false)
      console.log('PASS: actual OS encryption protects session Cookie and cached usage')
    } else {
      assert.equal(portal.getStatus().configured, true, 'Restart must retain service selection')
      const cached = portal.getCachedSnapshot()
      assert.equal(cached.data.used, '39.05', 'Restart must restore last successful usage before networking')
      assert.equal(cached.fromCache, true)
      assert.equal((await portal.read(new AbortController().signal)).used, '39.05', 'Restored session Cookie must authenticate the request')
      offline = true
      await assert.rejects(() => portal.read(new AbortController().signal), { code: 'network' })
      assert.equal(portal.getCachedSnapshot().data.used, '39.05')
      await portal.clear()
      assert.equal(existsSync(file), false)
      assert.equal((await partition.cookies.get({})).length, 0)
      assert.equal(portal.getCachedSnapshot(), null)
      writeFileSync(file, 'corrupted encrypted cache')
      const corrupted = new ShadowsocksPortal(() => {})
      assert.equal(corrupted.getStatus().configured, false)
      assert.match(corrupted.getStatus().storageWarning, /损坏/)
      assert.equal(corrupted.getCachedSnapshot(), null)
      await corrupted.clear()
      corrupted.dispose()
      console.log('PASS: separate process restores encrypted login and offline usage; logout clears both')
    }
    partition.protocol.unhandle('https')
    portal.dispose()
    app.exit(0)
  } catch (error) {
    console.error(error)
    portal.dispose()
    app.exit(1)
  }
})
