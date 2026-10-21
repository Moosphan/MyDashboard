const { app, BrowserWindow, dialog, ipcMain, safeStorage } = require('electron')
const assert = require('node:assert/strict')
const { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } = require('node:fs')
const { createServer } = require('node:http')
const { tmpdir } = require('node:os')
const { join, resolve, extname } = require('node:path')

const restartPhase = process.argv.find(argument => argument === '--restart-write' || argument === '--restart-read')
const temporaryUserData = restartPhase ? process.env.TOOLBOX_TEST_USER_DATA : mkdtempSync(join(tmpdir(), 'mydashboard-toolbox-test-'))
if (!temporaryUserData) throw new Error('Restart test requires its isolated userData directory')
app.setPath('userData', temporaryUserData)
process.env.TOOLBOX_DEV_TOOLS = '1'
process.env.TSX_TSCONFIG_PATH = resolve('tsconfig.main.json')
require('tsx/cjs')

app.whenReady().then(async () => {
  const { initFileStorage } = require('../src/main/services/file-service.ts')
  const { registerToolboxIpcHandlers, stopToolbox } = require('../src/main/ipc/toolbox.ts')
  initFileStorage()
  ipcMain.handle('profile:get', () => ({ success: true, data: null }))
  ipcMain.handle('notification:center:listUnread', () => ({ success: true, data: [] }))
  for (const channel of ['dashboard:getTodayOverview', 'tasks:getPending', 'weather:get', 'focus-sessions:getActive', 'activity:getRecent', 'ideas:getPinned', 'ideas:getRecent', 'projects:getActive']) ipcMain.handle(channel, () => ({ success: false, error: 'Unrelated module excluded from Toolbox integration test' }))
  const window = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: {
    preload: resolve('out/preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false,
  } })
  registerToolboxIpcHandlers(() => window)
  const invoke = expression => window.webContents.executeJavaScript(expression)
  try {
    await window.loadURL('data:text/html,<title>Toolbox integration test</title>')
    const initial = await invoke('window.toolboxAPI.get()')
    assert.equal(initial.success, true)
    if (restartPhase) {
      if (restartPhase === '--restart-write') {
        window.show()
        await invoke('window.toolboxAPI.setActive(true)')
        await invoke('window.toolboxAPI.update({type:"enabled",toolId:"toolbox-example",value:true})')
        await invoke('window.toolboxAPI.refresh("toolbox-example")')
        await invoke('window.toolboxAPI.update({type:"pin",toolId:"shadowsocks",value:true})')
        await invoke('window.toolboxAPI.update({type:"visible",toolId:"shadowsocks",value:false})')
        assert.notEqual((await invoke('window.toolboxAPI.get()')).data.snapshots['toolbox-example'].data, null)
      } else {
        assert.deepEqual(initial.data.preferences.tools.map(tool => ({ id: tool.id, enabled: tool.enabled, visible: tool.visible, pinned: tool.pinned })), [
          { id: 'toolbox-example', enabled: true, visible: true, pinned: false },
          { id: 'shadowsocks', enabled: true, visible: false, pinned: true },
        ])
        assert.equal(initial.data.snapshots['toolbox-example'].data, null)
        assert.equal(initial.data.active, false)
      }
      stopToolbox()
      window.destroy()
      console.log('PASS: ' + restartPhase)
      app.exit(0)
      return
    }
    assert.equal(initial.data.tools.length, 2)
    assert.equal(initial.data.vpn.configured, false)
    assert.equal(initial.data.snapshots.shadowsocks.data, null)
    console.log('PASS: initial state has no invented usage and developer tool starts disabled')

    window.show()
    await invoke('window.toolboxAPI.setActive(true)')
    await invoke('window.toolboxAPI.update({type:"enabled",toolId:"toolbox-example",value:true})')
    const refreshed = await invoke('window.toolboxAPI.refresh("toolbox-example")')
    assert.equal(refreshed.success, true)
    assert.match(refreshed.data.snapshots['toolbox-example'].data.text, /统一协调器/)
    console.log('PASS: registered example uses shared refresh coordinator')

    await invoke('window.toolboxAPI.update({type:"pin",toolId:"shadowsocks",value:true})')
    await invoke('window.toolboxAPI.update({type:"visible",toolId:"shadowsocks",value:false})')
    stopToolbox()
    const restarted = await invoke('window.toolboxAPI.get()')
    const vpnPreference = restarted.data.preferences.tools.find(tool => tool.id === 'shadowsocks')
    assert.equal(vpnPreference.pinned, true)
    assert.equal(vpnPreference.visible, false)
    assert.equal(restarted.data.snapshots['toolbox-example'].data, null)
    const stored = JSON.parse(readFileSync(join(temporaryUserData, 'config/settings.json'), 'utf8'))
    assert.equal(stored.toolbox.version, 1)
    console.log('PASS: recreated service restores disk layout, not usage snapshots')
    const settingsPath = join(temporaryUserData, 'config/settings.json')
    const settingsBackup = readFileSync(settingsPath, 'utf8')
    rmSync(settingsPath)
    mkdirSync(settingsPath)
    try {
      const failedSave = await invoke('window.toolboxAPI.update({type:"visible",toolId:"shadowsocks",value:true})')
      assert.equal(failedSave.success, false)
      assert.match(failedSave.error, /布局未保存/)
      assert.equal((await invoke('window.toolboxAPI.get()')).data.preferences.tools.find(tool => tool.id === 'shadowsocks').visible, false)
    } finally {
      rmSync(settingsPath, { recursive: true })
      writeFileSync(settingsPath, settingsBackup)
    }
    console.log('PASS: failed disk save reports failure and preserves current layout')

    await invoke('window.toolboxAPI.setActive(true)')
    window.hide()
    const hidden = await invoke('window.toolboxAPI.get()')
    assert.equal(hidden.data.active, false)
    const rejected = await invoke('window.toolboxAPI.update({type:"enabled",toolId:"unknown",value:true})')
    assert.equal(rejected.success, false)
    console.log('PASS: actual hidden window pauses activity; unknown tool is rejected')

    const outsider = new BrowserWindow({ show: false, webPreferences: { preload: resolve('out/preload/index.js'), sandbox: true, contextIsolation: true } })
    await outsider.loadURL('data:text/html,<title>Other renderer</title>')
    const denied = await outsider.webContents.executeJavaScript('window.toolboxAPI.get()')
    assert.equal(denied.success, false)
    outsider.destroy()
    console.log('PASS: another renderer cannot call toolbox IPC')
    const { PORTAL_EXTRACT_SCRIPT } = require('../src/main/services/toolbox/portal.ts')
    const fixture = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
    await fixture.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<div id="Overview"><div class="row"><div><label>注册日期</label><span>2025/01/01</span></div><div><label>下次付款日期</label><span>2026/11/09</span></div></div><div class="data-column"><div class="usage-detail-container remains">4.18\n GB\n 剩余</div><span>额外购买的流量包剩余量</span></div></div>'))
    const fields = await fixture.webContents.executeJavaScript(PORTAL_EXTRACT_SCRIPT)
    assert.equal(fields.payment, '2026/11/09')
    assert.match(fields.extra, /^4\.18\s+GB\s*剩余$/)
    fixture.destroy()
    console.log('PASS: payment extraction uses the matching label, not an earlier registration date')
    const { ShadowsocksPortal } = require('../src/main/services/toolbox/portal.ts')
    mkdirSync(join(temporaryUserData, 'toolbox'), { recursive: true })
    writeFileSync(join(temporaryUserData, 'toolbox/portal-service.json'), JSON.stringify({ service: '42' }))
    const portal = new ShadowsocksPortal(() => {})
    const partition = portal.partition
    let redirectService = false
    let delayedFields = false
    await partition.protocol.handle('https', request => {
      if (redirectService && new URL(request.url).searchParams.get('id') === '42') return new Response(null, { status: 302, headers: { Location: 'https://portal.shadowsocks.nz/clientarea.php?action=productdetails&id=43' } })
      if (delayedFields) return new Response('<html><meta charset="utf-8"><div id="Overview"><div id="data-usage-bar-graph"></div></div><script>setTimeout(() => { document.querySelector("#data-usage-bar-graph").innerHTML = \'<div class="usage-detail">39.05 GB / 100.00 GB</div><div class="usage-addition-info">60.95 GB (60.95%) 剩余</div><div class="progress-bar" aria-valuenow="39.05"></div>\'; }, 200)</script></html>', { headers: { 'Content-Type': 'text/html;charset=utf-8' } })
      return new Response('<html><meta charset="utf-8"><div id="Overview"><input type="password" value="not-a-secret"><div id="data-usage-bar-graph"><div class="usage-detail">12.34 GB / 100.00 GB</div><div class="usage-addition-info">87.66 GB 剩余</div><div class="progress-bar" aria-valuenow="12.34"></div></div><div><label>下次付款日期</label><span>2026/11/09</span></div></div></html>', { headers: { 'Content-Type': 'text/html;charset=utf-8' } })
    })
    await partition.cookies.set({ url: 'https://portal.shadowsocks.nz', name: 'synthetic-test-cookie', value: 'synthetic-session', secure: true, httpOnly: true })
    assert.equal(portal.getStatus().persistentSession, safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(safeStorage.getSelectedStorageBackend())))
    assert.equal(partition.isPersistent(), false)
    assert.equal(portal.getStatus().configured, true)
    const originalMessageBox = dialog.showMessageBox
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
    try {
      await portal.openLogin()
      assert.equal(portal.getStatus().configured, false)
      const privileges = await portal.login.webContents.executeJavaScript('({require:typeof require, bridge:typeof window.electronAPI, toolbox:typeof window.toolboxAPI})')
      assert.deepEqual(privileges, { require: 'undefined', bridge: 'undefined', toolbox: 'undefined' })
      await portal.login.loadURL('https://portal.shadowsocks.nz/clientarea.php?action=productdetails&id=42')
      for (let attempt = 0; attempt < 60 && (!portal.getStatus().configured || portal.getStatus().loginOpen); attempt++) await new Promise(resolveConfirm => setTimeout(resolveConfirm, 50))
      assert.equal(portal.getStatus().configured, true)
      assert.equal(portal.getStatus().loginOpen, false)
      const usage = await portal.read(new AbortController().signal)
      assert.equal(usage.used, '12.34')
      assert.equal(JSON.stringify(usage).includes('not-a-secret'), false)
      delayedFields = true
      const loadedUsage = await portal.read(new AbortController().signal)
      assert.equal(loadedUsage.used, '39.05', 'Reading must wait for rendered usage fields after document load')
      delayedFields = false
      redirectService = true
      await assert.rejects(() => portal.read(new AbortController().signal), { code: 'service_unavailable' })
      await portal.clear()
      assert.equal((await partition.cookies.get({})).length, 0)
      assert.equal(existsSync(join(temporaryUserData, 'toolbox/portal-service.json')), false)
      portal.dispose()
    } finally {
      dialog.showMessageBox = originalMessageBox
      partition.protocol.unhandle('https')
    }
    console.log('PASS: synthetic official session confirms explicitly, revokes old selection, rejects redirects, hides secrets and clears cookies')
    if (process.argv.includes('--ui')) {
      mkdirSync('.scratch/toolbox/assets', { recursive: true })
      const root = resolve('out/renderer')
      const server = createServer((request, response) => {
        const requested = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname)
        if (!requested.startsWith(root + '/')) { response.writeHead(403); response.end(); return }
        const file = existsSync(requested) && extname(requested) ? requested : join(root, 'index.html')
        const contentType = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html', '.woff2': 'font/woff2' }[extname(file)] || 'application/octet-stream'
        response.writeHead(200, { 'Content-Type': contentType })
        response.end(readFileSync(file))
      })
      await new Promise(resolveListening => server.listen(0, '127.0.0.1', resolveListening))
      const waitFor = async expression => {
        for (let attempt = 0; attempt < 60; attempt++) {
          if (await invoke(expression)) return
          await new Promise(resolveWaiting => setTimeout(resolveWaiting, 50))
        }
        throw new Error('UI condition not reached: ' + expression)
      }
      await invoke('window.toolboxAPI.update({type:"visible",toolId:"shadowsocks",value:true})')
      await invoke('window.toolboxAPI.update({type:"pin",toolId:"shadowsocks",value:false})')
      window.show()
      await window.loadURL(`http://127.0.0.1:${server.address().port}/toolbox`)
      await waitFor('document.querySelectorAll("[aria-label^=移动]").length === 2')
      await waitFor(`document.querySelector('[aria-label="移动扩展验证示例"]').closest('header').textContent.includes('已获取')`)
      await invoke('document.fonts.load(\'24px "Material Symbols Outlined"\')')
      await new Promise(resolveAnimation => setTimeout(resolveAnimation, 600))
      assert.equal(await invoke('document.fonts.check(\'24px "Material Symbols Outlined"\')'), true)
      assert.deepEqual(await invoke(`['14', '18', '64'].map(size => { const icon = document.createElement('span'); icon.className = 'material-symbols-outlined text-[' + size + 'px]'; icon.textContent = 'refresh'; document.body.append(icon); const computedSize = getComputedStyle(icon).fontSize; icon.remove(); return computedSize; })`), ['14px', '18px', '64px'])
      assert.equal(await invoke('Array.from(document.querySelectorAll("[aria-label^=移动]")).every(handle => Math.round(handle.closest("header").parentElement.getBoundingClientRect().height) === 320)'), true)
      const settledState = (await invoke('window.toolboxAPI.get()')).data
      window.webContents.send('toolbox:updated', { ...settledState, revision: settledState.revision - 1, snapshots: { ...settledState.snapshots, 'toolbox-example': { ...settledState.snapshots['toolbox-example'], refreshing: true } } })
      await new Promise(resolveDelivery => setTimeout(resolveDelivery, 100))
      assert.equal(await invoke(`document.querySelector('[aria-label="移动扩展验证示例"]').closest('header').textContent.includes('已获取')`), true)
      const initialCardWidth = await invoke('document.querySelector("[aria-label^=移动]").closest("header").parentElement.getBoundingClientRect().width')
      writeFileSync('.scratch/toolbox/assets/toolbox-actual-wide.png', (await window.webContents.capturePage()).toPNG())
      await invoke('document.querySelector("[aria-label=移动扩展验证示例]").focus()')
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Up', modifiers: ['alt'] })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Up', modifiers: ['alt'] })
      await waitFor('document.querySelector("[aria-label^=移动]")?.getAttribute("aria-label") === "移动扩展验证示例"')
      await waitFor('document.querySelector("[aria-label=置顶]").disabled === false')
      await new Promise(resolveLayout => setTimeout(resolveLayout, 250))
      const positions = await invoke('Array.from(document.querySelectorAll("[aria-label^=移动]")).map(handle => {const bounds=handle.getBoundingClientRect();return {x:Math.round(bounds.x+bounds.width/2),y:Math.round(bounds.y+bounds.height/2)}})')
      window.webContents.sendInputEvent({ type: 'mouseMove', ...positions[0] })
      window.webContents.sendInputEvent({ type: 'mouseDown', ...positions[0], button: 'left', clickCount: 1 })
      for (let step = 1; step <= 12; step++) {
        const fraction = step / 12
        window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(positions[0].x + (positions[1].x - positions[0].x) * fraction), y: Math.round(positions[0].y + (positions[1].y - positions[0].y) * fraction) })
        await new Promise(resolveMove => setTimeout(resolveMove, 20))
      }
      window.webContents.sendInputEvent({ type: 'mouseUp', ...positions[1], button: 'left', clickCount: 1 })
      await waitFor('document.querySelector("[aria-label^=移动]")?.getAttribute("aria-label") === "移动Shadowsocks 套餐"')
      await invoke('document.querySelector("[aria-label=置顶]").click()')
      await waitFor('document.querySelector("[aria-label=置顶工具]") !== null')
      const groupedWidths = await invoke('Array.from(document.querySelectorAll("[aria-label^=移动]")).map(handle => handle.closest("header").parentElement.getBoundingClientRect().width)')
      assert.equal(Math.abs(groupedWidths[0] - groupedWidths[1]) < 1, true)
      assert.equal(Math.abs(groupedWidths[0] - initialCardWidth) < 16, true)
      await invoke(`document.querySelector('[aria-label="隐藏Shadowsocks 套餐"]').click()`)
      await waitFor('document.querySelectorAll("[aria-label^=移动]").length === 1')
      await invoke('Array.from(document.querySelectorAll("button")).find(button=>button.textContent.includes("管理工具")).click()')
      await waitFor(`document.querySelector('[aria-label="显示Shadowsocks 套餐"]') !== null`)
      await invoke('new Promise(resolvePaint => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)))')
      writeFileSync('.scratch/toolbox/assets/toolbox-actual-manager.png', (await window.webContents.capturePage()).toPNG())
      await invoke(`document.querySelector('[aria-label="显示Shadowsocks 套餐"]').click()`)
      await waitFor('document.querySelectorAll("[aria-label^=移动]").length === 2')
      await invoke('Array.from(document.querySelectorAll("[role=dialog] button")).find(button=>button.textContent === "完成").click()')
      await invoke(`Array.from(document.querySelector('[aria-label="移动Shadowsocks 套餐"]').closest('header').parentElement.querySelectorAll('footer button')).find(button => button.textContent === '配置').click()`)
      await waitFor('document.querySelector("[role=dialog]")?.textContent.includes("登录与隐私")')
      writeFileSync('.scratch/toolbox/assets/toolbox-actual-configuration.png', (await window.webContents.capturePage()).toPNG())
      await invoke('Array.from(document.querySelectorAll("[role=dialog] button")).find(button=>button.textContent === "完成").click()')
      const beforeNavigation = (await invoke('window.toolboxAPI.get()')).data.snapshots['toolbox-example'].data.text
      await invoke('Array.from(document.querySelectorAll("aside nav button")).find(button=>button.textContent.includes("Dashboard")).click()')
      await waitFor('location.pathname === "/dashboard"')
      await waitFor('window.toolboxAPI.get().then(response => response.data.active === false)')
      await invoke('Array.from(document.querySelectorAll("aside nav button")).find(button=>button.textContent.includes("Toolbox")).click()')
      await waitFor('location.pathname === "/toolbox" && document.querySelector("[aria-label^=移动]") !== null')
      await waitFor(`document.querySelector('[aria-label="移动扩展验证示例"]').closest('header').textContent.includes('已获取')`)
      const returnedState = (await invoke('window.toolboxAPI.get()')).data
      assert.equal(returnedState.active, true)
      assert.notEqual(returnedState.snapshots['toolbox-example'].data.text, beforeNavigation)
      await waitFor('getComputedStyle(document.querySelector("main > div")).opacity === "1"')
      window.setSize(720, 900)
      await new Promise(resolveResize => setTimeout(resolveResize, 200))
      assert.equal(await invoke('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), true)
      writeFileSync('.scratch/toolbox/assets/toolbox-actual-narrow.png', (await window.webContents.capturePage()).toPNG())
      await invoke('document.documentElement.classList.add("dark")')
      await new Promise(resolveTheme => setTimeout(resolveTheme, 250))
      writeFileSync('.scratch/toolbox/assets/toolbox-actual-dark.png', (await window.webContents.capturePage()).toPNG())
      window.setSize(440, 900)
      const denseState = (await invoke('window.toolboxAPI.get()')).data
      denseState.revision += 1
      denseState.vpn.configured = true
      denseState.tools.find(tool => tool.id === 'shadowsocks').title = 'Shadowsocks 套餐长标题与完整用量展示验证'
      denseState.snapshots.shadowsocks = { data: { used: '12.34', total: '100.00', remaining: '87.66', extraRemaining: '1.50', unit: 'GB', usedPercent: 12.34, nextResetDate: '2026/11/09', nextPaymentDate: '2026/11/09', cycle: '2026/10/09 - 2026/11/09' }, refreshing: false, stale: true, lastSuccessAt: Date.now() - 1_800_000, error: { code: 'network', message: '连接暂时中断，请检查网络后重试。'.repeat(8) } }
      window.webContents.send('toolbox:updated', denseState)
      await waitFor('document.querySelector("[aria-label^=移动Shadowsocks]").closest("header").textContent.includes("更新失败")')
      await new Promise(resolveDenseLayout => setTimeout(resolveDenseLayout, 250))
      assert.equal(await invoke(`(() => { const handle = document.querySelector('[aria-label^=移动Shadowsocks]'); if (!handle) return false; const card = handle.closest('header').parentElement; const body = card.children[1]; return Math.round(card.getBoundingClientRect().height) === 320 && body.scrollHeight <= body.clientHeight && document.documentElement.scrollWidth <= document.documentElement.clientWidth; })()`), true)
      writeFileSync('.scratch/toolbox/assets/toolbox-actual-dense.png', (await window.webContents.capturePage()).toPNG())
      await invoke(`document.querySelector('[aria-label^=移动Shadowsocks]').closest('header').parentElement.children[1].scrollTop = 10000`)
      await invoke('new Promise(resolvePaint => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)))')
      assert.equal(await invoke(`document.querySelector('[aria-label^=移动Shadowsocks]').closest('header').parentElement.children[1].scrollTop`), 0)
      writeFileSync('.scratch/toolbox/assets/toolbox-actual-dense-details.png', (await window.webContents.capturePage()).toPNG())
      const connectedState = structuredClone(denseState)
      connectedState.revision += 1
      connectedState.tools.find(tool => tool.id === 'shadowsocks').title = 'Shadowsocks 套餐'
      connectedState.preferences.tools.forEach(tool => { tool.pinned = false })
      Object.assign(connectedState.snapshots.shadowsocks, { error: null, stale: false, lastSuccessAt: Date.now() })
      window.setSize(1440, 900)
      await invoke('document.documentElement.classList.remove("dark")')
      window.webContents.send('toolbox:updated', connectedState)
      await waitFor(`document.querySelector('[aria-label="移动Shadowsocks 套餐"]').closest('header').textContent.includes('已获取')`)
      await invoke(`document.querySelector('[aria-label="移动Shadowsocks 套餐"]').closest('header').parentElement.children[1].scrollTop = 0`)
      await new Promise(resolveConnectedLayout => setTimeout(resolveConnectedLayout, 250))
      const usageFitsCard = `(() => { const card = document.querySelector('[aria-label="移动Shadowsocks 套餐"]').closest('header').parentElement; const body = card.children[1]; const note = body.lastElementChild.lastElementChild; return body.scrollHeight <= body.clientHeight && body.scrollWidth <= body.clientWidth && note.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom && body.textContent.includes('流量周期') && body.textContent.includes('2026/10/09 - 2026/11/09'); })()`
      assert.equal(await invoke('document.querySelector("main h1").textContent'), 'Toolbox')
      assert.equal(await invoke(`document.querySelector('[aria-label="移动Shadowsocks 套餐"]').closest('header').querySelector('.material-symbols-outlined').textContent`), 'send')
      writeFileSync('.scratch/toolbox/assets/toolbox-actual-connected.png', (await window.webContents.capturePage()).toPNG())
      const usageMeasurements = `(() => { const body = document.querySelector('[aria-label="移动Shadowsocks 套餐"]').closest('header').parentElement.children[1]; return { available: body.clientHeight, content: body.scrollHeight, rows: Array.from(body.firstElementChild.children).map(element => ({text:element.textContent,height:element.getBoundingClientRect().height,margin:getComputedStyle(element).marginTop})), width:body.clientWidth, contentWidth:body.scrollWidth }; })()`
      assert.equal(await invoke(usageFitsCard), true, `All VPN fields must fit the wide card without scrolling: ${JSON.stringify(await invoke(usageMeasurements))}`)
      window.setSize(440, 900)
      await new Promise(resolveCompactLayout => setTimeout(resolveCompactLayout, 250))
      assert.equal(await invoke(usageFitsCard), true, 'All VPN fields must fit the narrow card without scrolling')
      await invoke(`document.querySelector('[aria-label="移动Shadowsocks 套餐"]').closest('header').parentElement.scrollIntoView({ block: 'center' })`)
      await invoke('new Promise(resolvePaint => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)))')
      writeFileSync('.scratch/toolbox/assets/toolbox-actual-connected-narrow.png', (await window.webContents.capturePage()).toPNG())
      const offlineState = structuredClone(connectedState)
      offlineState.revision += 1
      Object.assign(offlineState.snapshots.shadowsocks, { fromCache: true, stale: true, lastSuccessAt: Date.now() - 1_800_001, error: { code: 'network', message: '官网连接暂时不可用，当前显示上次成功用量。' } })
      window.webContents.send('toolbox:updated', offlineState)
      await waitFor(`document.querySelector('[aria-label="移动Shadowsocks 套餐"]').closest('header').textContent.includes('更新失败 · 缓存')`)
      assert.equal(await invoke(usageFitsCard), true, 'Offline cached usage must remain fully visible')
      await invoke('new Promise(resolvePaint => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)))')
      writeFileSync('.scratch/toolbox/assets/toolbox-actual-offline-cache.png', (await window.webContents.capturePage()).toPNG())
      server.close()
      console.log('PASS: bundled icon font, stale-response isolation, equal cards, keyboard/pointer sorting, pin, hide/recover, sidebar return, dense narrow layout and VPN usage without scrolling')
    }
    stopToolbox()
    window.destroy()
    console.log('Toolbox Electron integration: 8 backend scenarios passed' + (process.argv.includes('--ui') ? ' plus actual renderer interactions' : ''))
    try { rmSync(temporaryUserData, { recursive: true, force: true }) } catch {}
    app.exit(0)
  } catch (error) {
    console.error(error)
    stopToolbox()
    app.exit(1)
  }
}).catch(error => { console.error(error); app.exit(1) })

app.on('will-quit', () => {
  if (!restartPhase) try { rmSync(temporaryUserData, { recursive: true, force: true }) } catch {}
})
