const { app, BrowserWindow, ipcMain, session } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const { tmpdir } = require('node:os')
const { join, resolve, extname } = require('node:path')
const { createServer } = require('node:http')
const { setTimeout: delay } = require('node:timers/promises')

const fixtureRoot = mkdtempSync(join(tmpdir(), 'synthetic-file-routing-'))
const localScripts = new Set()
const node = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['node'], { encoding: 'utf8' }).stdout.trim().split(/\r?\n/)[0]
const seeded = spawnSync(process.execPath, ['--import', 'tsx', join(__dirname, 'seed-bilibili-publishing.ts'), fixtureRoot, node], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8',
})
assert.equal(seeded.status, 0, seeded.stderr)
const seededProject = JSON.parse(readFileSync(join(fixtureRoot, 'seed-project.json'), 'utf8'))
process.env.MYDASHBOARD_USER_DATA = fixtureRoot
delete process.env.ELECTRON_RENDERER_URL
global.fetch = async () => { throw new Error('Synthetic offline fixture') }
app.whenReady().then(() => {
  session.defaultSession.webRequest.onCompleted({ urls: ['file://*/*'] }, details => {
    if (new URL(details.url).pathname.endsWith('.js')) localScripts.add(details.url)
  })
  for (const partition of [session.defaultSession, session.fromPartition('persist:chatgpt-session')]) {
    partition.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, done) => done({ cancel: true }))
  }
})
require('../out/main/index.js')

app.whenReady().then(async () => {
  ipcMain.removeHandler('ai:getCodexUsageDashboard')
  ipcMain.handle('ai:getCodexUsageDashboard', () => ({ success: false, error: 'Synthetic offline fixture' }))
  let window
  let server
  const evaluate = async source => {
    try { return await window.webContents.executeJavaScript(source, true) }
    catch { throw new Error('Renderer evaluation failed: ' + source) }
  }
  const wait = async (source, label = source) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (window && !window.isDestroyed() && !window.webContents.isLoadingMainFrame() && await evaluate(`Boolean(${source})`)) return
      await delay(100)
    }
    throw new Error('Timed out: ' + label)
  }
  const deadline = setTimeout(() => { console.error('Routing fixture timed out'); app.exit(1) }, 90_000)
  const click = async label => {
    assert.ok(await evaluate(`(()=>{const button=[...document.querySelectorAll('aside button')].find(button=>button.textContent.trim().endsWith(${JSON.stringify(label)}));if(!button)return false;button.click();return true})()`), label)
  }
  const home = () => wait('[...document.querySelectorAll("main h3")].some(element=>element.textContent==="Tasks")', 'real dashboard content')
  const route = async (label, path, content) => {
    await click(label)
    await wait(`location.hash===${JSON.stringify('#' + path)} && document.querySelector('main').textContent.includes(${JSON.stringify(content)})`, label)
    assert.equal(await evaluate('location.protocol'), 'file:')
  }
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().startsWith('file:'))
      if (window && !window.webContents.isLoadingMainFrame()) break
      await delay(100)
    }
    assert.ok(window)
    await home()
    assert.equal(await evaluate('location.hash'), '#/dashboard')
    assert.equal(await evaluate('location.pathname.endsWith("/index.html")'), true)
    console.log('PASS file cold start renders dashboard without navigation or HTTP server')
    await route('Writing', '/writing', 'Writing Studio')
    await route('Video', '/video', '新建视频项目')
    await wait('document.querySelector(".workflow-project-thumb img")?.naturalWidth>0', 'project cover loaded')
    assert.equal(await evaluate('document.querySelector(".workflow-project-thumb img").getAttribute("src")'), `video-workflow://${seededProject.id}/${seededProject.stages.render.payload.cover.id}`)
    await evaluate('document.querySelector(".workflow-project-thumb img").dispatchEvent(new Event("error"))')
    await wait('document.querySelector(".workflow-project-placeholder span")?.textContent==="封面加载失败"')
    assert.ok(!await evaluate(`document.querySelector('.workflow-project-thumb').textContent.includes(${JSON.stringify(seededProject.title)})`))
    const emptyProject = await evaluate('window.electronAPI.invoke("workflow:create", "Synthetic project without cover")')
    assert.equal(emptyProject.success, true)
    const media = seededProject.stages.render.payload.file
    assert.ok(media)
    const mediaSource = `video-workflow://${seededProject.id}/${media.id}`
    assert.ok(await evaluate(`fetch(${JSON.stringify(mediaSource)},{headers:{Range:'bytes=0-31'}}).then(async response=>response.status===206 && (await response.arrayBuffer()).byteLength===32)`))
    await route('Insights', '/insights', 'Insights')
    await route('AI Lab', '/ai-lab', 'AI')
    await route('Toolbox', '/toolbox', 'Toolbox')
    await route('Settings', '/settings', 'Settings')
    assert.ok(await evaluate('document.querySelector(\'script[type="module"]\').src.startsWith("file:")'))
    assert.ok(localScripts.size >= 7, 'all module chunks must load from local files')
    await evaluate('history.back()')
    await wait('location.hash==="#/toolbox" && document.querySelector("main h1")?.textContent==="Toolbox"')
    await evaluate('history.forward()')
    await wait('location.hash==="#/settings" && document.querySelector("main h2")?.textContent==="Settings"')
    window.webContents.reload()
    await wait('location.hash==="#/settings" && document.querySelector("main h2")?.textContent==="Settings"')
    window.webContents.send('notification:navigate', { route: '/video?source=notification' })
    await wait('location.hash==="#/video?source=notification" && document.querySelector("main").textContent.includes("新建视频项目")')
    await evaluate('location.hash="/unknown-synthetic-route"')
    await home()
    assert.equal(await evaluate('location.hash'), '#/dashboard')
    assert.equal(await evaluate('document.querySelector(\'img[alt="MyDashboard logo"]\').naturalWidth>0'), true)
    assert.ok(await evaluate('document.styleSheets.length>0 && getComputedStyle(document.querySelector("aside")).display==="flex"'))
    assert.ok(await evaluate('document.fonts.load(\'20px "Material Symbols Outlined"\').then(fonts=>fonts.length>0)'))
    await click('Video')
    await wait('document.querySelectorAll(".workflow-project-row").length===2')
    await wait('document.querySelector(".workflow-project-thumb img")?.naturalWidth>0')
    assert.equal(await evaluate('document.querySelector(".workflow-project-placeholder span").textContent'), '暂无封面')
    assert.equal(await evaluate('document.querySelector(".workflow-project-placeholder").textContent.includes("Synthetic")'), false)
    const screenDirectory = join(fixtureRoot, 'screens')
    mkdirSync(screenDirectory)
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 900)
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
        writeFileSync(join(screenDirectory, theme + '-' + width + '.png'), (await window.webContents.capturePage()).toPNG())
      }
    }
    window.setSize(1440, 900)
    window.webContents.setZoomFactor(2)
    await click('Video')
    await wait('document.querySelector("main").textContent.includes("新建视频项目")')
    await evaluate('[...document.querySelectorAll("main button")].find(button=>button.textContent.trim()==="新建视频项目").focus()')
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
    window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
    await wait('document.querySelector("[role=dialog]")')
    assert.ok(await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'))
    writeFileSync(join(screenDirectory, 'keyboard-200percent.png'), (await window.webContents.capturePage()).toPNG())
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await wait('!document.querySelector("[role=dialog]")')
    await wait('document.activeElement.textContent.trim()==="新建视频项目"')
    window.webContents.setZoomFactor(1)
    for (const candidate of BrowserWindow.getAllWindows()) candidate.destroy()
    app.emit('activate')
    for (let attempt = 0; attempt < 150; attempt++) {
      window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().startsWith('file:'))
      if (window && !window.webContents.isLoadingMainFrame()) break
      await delay(100)
    }
    await home()
    console.log('PASS modules, history, reload, reopen, notification, fallback, local assets and keyboard/theme/viewport checks')
    const rendererRoot = resolve('out/renderer')
    server = createServer((request, response) => {
      const requested = resolve(rendererRoot, '.' + new URL(request.url, 'http://localhost').pathname)
      if (!requested.startsWith(rendererRoot + '/')) { response.writeHead(403); response.end(); return }
      const file = existsSync(requested) && extname(requested) ? requested : join(rendererRoot, 'index.html')
      response.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.html': 'text/html' }[extname(file)] || 'application/octet-stream')
      response.end(readFileSync(file))
    })
    await new Promise(done => server.listen(0, '127.0.0.1', done))
    session.defaultSession.webRequest.onBeforeRequest(null)
    await window.loadURL(`http://127.0.0.1:${server.address().port}/video`)
    await wait('location.pathname==="/video" && !location.hash && document.querySelector("main").textContent.includes("新建视频项目")')
    await click('Dashboard')
    await home()
    assert.equal(await evaluate('location.pathname'), '/dashboard')
    window.webContents.reload()
    await home()
    console.log('PASS HTTP BrowserRouter navigation and reload use clean paths')
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  } finally {
    clearTimeout(deadline)
    server?.close()
  }
})
