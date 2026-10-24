const { app, BrowserWindow, shell } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync, readFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')

const root = mkdtempSync(join(tmpdir(), 'bilibili-ui-'))
const opened = []
shell.openExternal = async (url) => {
  opened.push(url)
}
const node =
  process.env.npm_node_execpath || spawnSync('which', ['node'], { encoding: 'utf8' }).stdout.trim()
const seed = spawnSync(
  process.execPath,
  ['--import', 'tsx', join(__dirname, 'seed-bilibili-publishing.ts'), root, node],
  { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' },
)
assert.equal(seed.status, 0, seed.stderr)
process.env.MYDASHBOARD_USER_DATA = root
const project = JSON.parse(readFileSync(join(root, 'seed-project.json'), 'utf8'))
console.log('Bilibili UI artifacts:', root)
require('../out/main/index.js')

app.whenReady().then(async () => {
  let window
  const evaluate = (source) => window.webContents.executeJavaScript(source, true)
  const waitFor = async (source, label) => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await evaluate(`Boolean(${source})`)) return
      await delay(100)
    }
    throw new Error(`Timed out: ${label}`)
  }
  const click = async (text) => {
    assert.ok(
      await evaluate(
        `(()=>{const button=[...document.querySelectorAll('button')].find(item=>(item.textContent.trim()===${JSON.stringify(text)}||item.getAttribute('aria-label')===${JSON.stringify(text)})&&!item.disabled);if(!button)return false;button.click();return true})()`,
      ),
      `Button missing: ${text}`,
    )
    await delay(100)
  }
  const key = async (keyCode) => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await delay(120)
  }
  const select = async (label, text) => {
    await evaluate(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').focus()`)
    await key('Space')
    await waitFor('document.querySelector("[role=listbox]")', 'select opens')
    await key('Home')
    const options = await evaluate(
      '[...document.querySelectorAll("[role=option]")].map(item=>item.textContent.trim())',
    )
    const index = options.indexOf(text)
    assert.ok(index >= 0, `Missing option: ${text}`)
    for (let position = 0; position < index; position++) await key('Down')
    await key('Enter')
    await waitFor('!document.querySelector("[role=listbox]")', 'select closes')
    assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`), label)
  }
  const screenshot = async (name) => {
    await evaluate(
      'document.querySelector("[data-bilibili-publishing]").scrollIntoView({block:"start"})',
    )
    await delay(150)
    writeFileSync(join(root, name), (await window.webContents.capturePage()).toPNG())
  }
  const call = async (action, ...args) => {
    const result = await evaluate(
      `window.electronAPI.invoke(${JSON.stringify('workflow:' + action)}, ...${JSON.stringify(args)})`,
    )
    assert.equal(result.success, true, result.error)
    return result.data
  }
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      window = BrowserWindow.getAllWindows().find((item) =>
        item.webContents.getURL().startsWith('file:'),
      )
      if (window && !window.webContents.isLoadingMainFrame()) break
      await delay(100)
    }
    assert.ok(window)
    window.setMinimumSize(720, 640)
    window.setSize(1440, 1100)
    await waitFor('document.querySelector("nav")', 'app loaded')
    await evaluate(
      `window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))`,
    )
    await waitFor('document.querySelector(".workflow-project-row")', 'project list')
    await click('继续创作')
    await waitFor('document.querySelector("[data-bilibili-publishing]")', 'publishing panel')
    await waitFor(
      'document.querySelector("[data-bilibili-publishing]").textContent.includes("请先扫码")',
      'signed out',
    )
    await click('扫码连接 B 站')
    await waitFor('document.querySelector("[data-bilibili-publishing] img")', 'QR shown')
    await screenshot('bilibili-qr-light-1440.png')
    await waitFor(
      'document.querySelector("[data-bilibili-publishing]").textContent.includes("已连接：测试 UP")',
      'QR connected',
    )
    assert.equal(
      await evaluate(
        '[...document.querySelectorAll("button")].find(item=>item.textContent==="一键发布到 B 站").disabled',
      ),
      true,
    )
    await select('B 站投稿分区', '父分区 / 测试分区')
    await select('投稿可见性', '公开投稿')
    await select('稿件类型', '自制')
    await screenshot('bilibili-ready-light-1440.png')
    writeFileSync(join(root, 'mode'), 'slow')
    await evaluate(
      `(()=>{const button=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()==='一键发布到 B 站');button.click();button.click()})()`,
    )
    await waitFor(
      'document.querySelector("[data-bilibili-submission=uploading]")',
      'upload started',
    )
    await screenshot('bilibili-uploading-light-1440.png')
    await waitFor(
      'document.querySelector("[data-bilibili-submission=reviewing]")',
      'reviewing receipt',
    )
    assert.equal(readFileSync(join(root, 'calls'), 'utf8').trim().split('\n').length, 1)
    await click('核查平台状态')
    await waitFor(
      'document.querySelector("[data-bilibili-submission=published]")',
      'published receipt',
    )
    await click('打开作品 BV1xx411c7mD')
    assert.deepEqual(opened, ['https://www.bilibili.com/video/BV1xx411c7mD'])
    await screenshot('bilibili-published-light-1440.png')
    await evaluate(
      'document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"',
    )
    await screenshot('bilibili-published-dark-1440.png')
    window.setSize(1024, 900)
    await screenshot('bilibili-published-dark-1024.png')
    window.webContents.setZoomFactor(2)
    await screenshot('bilibili-published-dark-200.png')
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
    window.webContents.setZoomFactor(1)
    window.setSize(1440, 1100)
    await click('一键发布到 B 站')
    await delay(300)
    assert.equal(readFileSync(join(root, 'calls'), 'utf8').trim().split('\n').length, 1)
    assert.equal((await call('get', project.id)).publications.length, 0)
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll("button")].some(item=>item.textContent.includes("导出 Bilibili 发布包"))',
      ),
    )
    await evaluate('document.querySelector("input[value=douyin]").click()')
    await waitFor(
      '!document.querySelector("[data-bilibili-publishing]")',
      'Douyin keeps manual publication',
    )
    await evaluate('document.querySelector("input[value=bilibili]").click()')
    await waitFor('document.querySelector("[data-bilibili-publishing]")', 'Bilibili reopens')
    assert.ok(
      await evaluate(
        'document.querySelector("button[aria-label=投稿可见性]").textContent.includes("公开投稿")',
      ),
    )
    await waitFor(
      'document.querySelector("[data-bilibili-publishing]").textContent.includes("已连接：测试 UP")',
      'connection restores',
    )
    writeFileSync(join(root, 'mode'), 'network')
    await select('投稿可见性', '仅自己可见')
    await click('一键发布到 B 站')
    await waitFor(
      'document.querySelector("[data-bilibili-submission=unknown]")',
      'network outcome unknown',
    )
    await click('确认平台没有此稿件…')
    await waitFor('document.querySelector("[role=dialog]")', 'acknowledgement dialog')
    await key('Escape')
    await waitFor('!document.querySelector("[role=dialog]")', 'Escape closes dialog')
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), '一键发布到 B 站')
    assert.ok(await evaluate('document.querySelector("[data-bilibili-submission=unknown]")'))
    await click('确认平台没有此稿件…')
    await click('已核查，确认没有稿件')
    await waitFor(
      'document.querySelector("[data-bilibili-submission=failed]")',
      'explicit acknowledgement permits retry',
    )
    assert.equal((await call('bilibiliSubmissions', project.id)).length, 2)
    console.log(
      'Bilibili Electron UI: QR, required fields, keyboard, duplicate click, receipt, status refresh, themes, viewports, zoom, settings restore, Douyin, network uncertainty and acknowledgement passed',
    )
    app.exit(0)
  } catch (error) {
    console.error(error)
    if (window)
      writeFileSync(join(root, 'failure.png'), (await window.webContents.capturePage()).toPNG())
    app.exit(1)
  }
})
