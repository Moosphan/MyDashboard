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
const node = spawnSync('which', ['node'], { encoding: 'utf8' }).stdout.trim()
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
  const pointerClick = async (selector) => {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`,
    )
    const point = await evaluate(`(() => {
      const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
    })()`)
    window.webContents.sendInputEvent({ type: 'mouseMove', ...point })
    window.webContents.sendInputEvent({
      type: 'mouseDown',
      button: 'left',
      clickCount: 1,
      ...point,
    })
    window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
    await delay(150)
  }
  const focusedStyle = () =>
    evaluate(`(() => {
    const button = document.activeElement
    const style = getComputedStyle(button)
    return {
      label: button.getAttribute('aria-label'),
      modality: document.documentElement.dataset.inputModality,
      shadow: style.boxShadow,
      radius: style.borderRadius,
      outline: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
    }
  })()`)
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
  const screenshot = async (name, selector = '[data-bilibili-publishing]') => {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"center"})`,
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
  const saveAndApprove = async () => {
    await click('保存草稿')
    await click('确认保存新版本')
    await waitFor('!document.querySelector("[role=dialog]")', 'settings saved')
    await click('审核通过此版本')
    await click('确认审核通过')
    await waitFor('!document.querySelector("[role=dialog]")', 'settings approved')
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
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${theme === 'dark'})`)
      await pointerClick('[aria-label="播放成片预览"]')
      await waitFor('document.querySelector("[role=dialog] video")', 'pointer video preview')
      const pointerFocus = await focusedStyle()
      assert.equal(pointerFocus.label, '关闭成片预览')
      assert.ok(
        pointerFocus.outline === 'none' || pointerFocus.outlineColor === 'rgba(0, 0, 0, 0)',
        'Mouse-opened dialog must not show an outline, including after keyboard use',
      )
      assert.equal(pointerFocus.shadow, 'none', 'Mouse-opened dialog must not show a focus ring')
      await screenshot(`dialog-pointer-${theme}.png`, '[role=dialog]')
      await key('Escape')
      await key('Space')
      await waitFor('document.querySelector("[role=dialog] video")', 'keyboard video preview')
      const keyboardFocus = await focusedStyle()
      assert.equal(keyboardFocus.label, '关闭成片预览')
      assert.equal(keyboardFocus.modality, 'keyboard')
      assert.equal(keyboardFocus.shadow, 'none', 'Keyboard focus must use one indicator')
      assert.equal(keyboardFocus.radius, '9999px', 'Icon focus follows its circular button')
      assert.equal(keyboardFocus.outline, 'solid')
      assert.equal(keyboardFocus.outlineWidth, '2px')
      assert.notEqual(keyboardFocus.outlineColor, 'rgba(0, 0, 0, 0)')
      await screenshot(`dialog-keyboard-${theme}.png`, '[role=dialog]')
      await key('Tab')
      assert.ok(
        await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
      )
      await key('Escape')
      assert.equal(
        await evaluate('document.activeElement.getAttribute("aria-label")'),
        '播放成片预览',
      )
      await pointerClick('[aria-label="播放成片预览"]')
      await waitFor('document.querySelector("[role=dialog] video")', 'reopen preview with mouse')
      await pointerClick('[aria-label="关闭成片预览"]')
      await waitFor('!document.querySelector("[role=dialog]")', 'mouse closes preview')
      const returnedFocus = await focusedStyle()
      assert.equal(returnedFocus.label, '播放成片预览')
      assert.equal(returnedFocus.shadow, 'none')
      assert.ok(
        returnedFocus.outline === 'none' || returnedFocus.outlineColor === 'rgba(0, 0, 0, 0)',
      )
    }
    await evaluate('document.documentElement.classList.remove("dark")')
    await click('管理 B 站账号')
    await waitFor('document.querySelector("[data-bilibili-accounts]")', 'account dialog')
    await waitFor(
      'document.querySelector("[data-bilibili-accounts]").textContent.includes("绑定第一个")',
      'signed out',
    )
    await waitFor(
      '[...document.querySelectorAll("[data-bilibili-accounts] button")].some(button => button.textContent === "添加 B 站账号" && !button.disabled)',
      'initial account check finished',
    )
    await click('添加 B 站账号')
    await waitFor('document.querySelector("[data-bilibili-accounts] img")', 'QR shown')
    await screenshot('bilibili-qr-light-1440.png')
    await waitFor(
      'document.querySelector("[data-bilibili-publishing]").textContent.includes("已连接：测试 UP")',
      'QR connected',
    )
    await click('关闭B 站账号管理')
    await waitFor('!document.querySelector("[role=dialog]")', 'account manager closes')
    assert.equal(
      await evaluate('document.activeElement.getAttribute("aria-label")'),
      '管理 B 站账号',
    )
    const originalAccounts = await call('bilibiliAccounts')
    const originalAccount = originalAccounts.accounts[0]
    writeFileSync(join(root, 'login-user'), '456')
    await click('管理 B 站账号')
    await click('添加 B 站账号')
    await waitFor('document.querySelector("[data-bilibili-accounts] img")', 'second QR shown')
    await key('Escape')
    await waitFor('!document.querySelector("[role=dialog]")', 'closing does not cancel QR')
    await click('管理 B 站账号')
    await waitFor(
      'document.querySelector("[data-bilibili-account=" + JSON.stringify("456") + "]")',
      'second account bound',
    )
    assert.equal((await call('bilibiliAccounts')).accounts.length, 2)
    await evaluate(
      'document.querySelector("[data-bilibili-accounts]").scrollIntoView({block:"center"})',
    )
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1000)
        await screenshot(`accounts-${theme}-${width}.png`)
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
      }
    }
    window.webContents.setZoomFactor(2)
    await screenshot('accounts-200percent.png')
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
    await key('Tab')
    assert.ok(
      await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
    )
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [
        { name: 'forced-colors', value: 'active' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    })
    await screenshot('accounts-high-contrast.png')
    assert.ok(
      await evaluate(
        'matchMedia("(forced-colors: active)").matches && matchMedia("(prefers-reduced-motion: reduce)").matches',
      ),
    )
    await key('Tab')
    assert.ok(
      await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
    )
    const contrastFocus = await focusedStyle()
    assert.equal(contrastFocus.outline, 'solid')
    assert.equal(contrastFocus.outlineWidth, '2px')
    assert.notEqual(contrastFocus.outlineColor, 'rgba(0, 0, 0, 0)')
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] })
    window.webContents.debugger.detach()
    window.webContents.setZoomFactor(1)
    window.setSize(1440, 1100)
    await evaluate('document.documentElement.classList.remove("dark")')
    await click(`使用账号 测试 UP（UID ${originalAccount.uid}）`)
    await waitFor(
      'document.querySelector("[data-bilibili-account=" + JSON.stringify("123") + "]").textContent.includes("当前投稿账号")',
      'switch original account',
    )
    await click('关闭B 站账号管理')
    await waitFor('!document.querySelector("[role=dialog]")', 'manager closed')
    for (const [name, background] of [
      ['light', '#fff7e8'],
      ['dark', '#161719'],
      [
        'busy',
        'repeating-linear-gradient(25deg,#f2dbbb 0 12px,#604b7a 12px 24px,#162431 24px 36px)',
      ],
    ]) {
      await evaluate(
        `(() => { const image = document.querySelector('.workflow-publish-asset img'); image.style.opacity = 0; image.parentElement.style.background = ${JSON.stringify(background)}; document.querySelector('.workflow-publish-asset').scrollIntoView({block:'center'}); })()`,
      )
      await screenshot(`play-button-${name}.png`, '.workflow-publish-asset')
    }
    await evaluate(
      `document.querySelector('.workflow-publish-asset img').style.opacity = 1; document.querySelector('.workflow-publish-asset img').parentElement.style.background = ''; document.querySelector('[aria-label="播放成片预览"]').focus()`,
    )
    await key('Space')
    await waitFor(
      'document.querySelector("[role=dialog] video")?.readyState >= 2',
      'publish video ready',
    )
    await screenshot('publish-video-dialog.png')
    await key('Escape')
    await waitFor('!document.querySelector("[role=dialog]")', 'video closes')
    assert.equal(await evaluate('document.querySelectorAll("video").length'), 0)
    assert.equal(
      await evaluate('document.activeElement.getAttribute("aria-label")'),
      '播放成片预览',
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
    assert.ok(
      await evaluate(
        'document.querySelector("[data-bilibili-publishing]").textContent.includes("请先保存并重新审核")',
      ),
    )
    await saveAndApprove()
    const savedProject = await call('get', project.id)
    assert.deepEqual(savedProject.stages.publish.payload.platforms.bilibili.submission, {
      category: '17',
      categoryName: '父分区 / 测试分区',
      visibility: 'public',
      copyright: 'original',
      source: '',
    })
    await screenshot('bilibili-ready-light-1440.png')
    writeFileSync(join(root, 'mode'), 'slow')
    await evaluate(
      `(()=>{const button=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()==='一键发布到 B 站');button.click();button.click()})()`,
    )
    await waitFor(
      'document.querySelector("[data-bilibili-submission=uploading]")',
      'upload started',
    )
    await click('管理 B 站账号')
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll("[data-bilibili-accounts] button")].filter(button => !button.getAttribute("aria-label")?.startsWith("关闭")).every(button => button.disabled)',
      ),
    )
    await click('关闭B 站账号管理')
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
    await saveAndApprove()
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
    await click('管理 B 站账号')
    await click('解除绑定账号 456')
    await click('保留绑定')
    assert.equal((await call('bilibiliAccounts')).accounts.length, 2)
    await click('解除绑定账号 456')
    await click('确认解除绑定')
    await waitFor(
      '!document.querySelector("[data-bilibili-account=" + JSON.stringify("456") + "]")',
      'account removed',
    )
    assert.equal((await call('bilibiliAccounts')).accounts.length, 1)
    await key('Escape')
    await evaluate('document.querySelector("input[value=douyin]").click()')
    await waitFor('document.querySelector("[data-douyin-publishing]")', 'douyin publishing panel')
    await click('管理 抖音账号')
    await waitFor(
      'document.querySelector("[data-platform-accounts=douyin]")',
      'douyin account manager',
    )
    await waitFor(
      '[...document.querySelectorAll("[data-platform-accounts=douyin] button")].some(button => button.textContent === "添加 抖音账号" && !button.disabled)',
      'douyin account check finished',
    )
    writeFileSync(join(root, 'login-user'), 'MS4wLjABAAAA_test_123')
    await click('添加 抖音账号')
    await waitFor(
      'document.querySelector("[data-platform-accounts=douyin] img")',
      'douyin QR shown',
    )
    await key('Escape')
    await click('管理 抖音账号')
    await waitFor(
      'document.querySelector("[data-bilibili-account=" + JSON.stringify("MS4wLjABAAAA_test_123") + "]")',
      'douyin bound',
    )
    await waitFor(
      'document.querySelector("[data-platform-accounts=douyin]").textContent.includes("已连接：抖音测试用户")',
      'douyin login complete',
    )
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1000)
        await screenshot(`douyin-accounts-${theme}-${width}.png`, '[data-platform-accounts=douyin]')
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
      }
    }
    window.webContents.setZoomFactor(2)
    await screenshot('douyin-accounts-200percent.png', '[data-platform-accounts=douyin]')
    await key('Tab')
    assert.ok(
      await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
    )
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
    window.webContents.setZoomFactor(1)
    window.setSize(1440, 1100)
    await screenshot('douyin-accounts-dark-1440.png', '[data-platform-accounts=douyin]')
    await key('Escape')
    await select('投稿可见性', '仅自己可见')
    await select('稿件类型', '自制')
    await saveAndApprove()
    writeFileSync(join(root, 'mode'), '')
    await click('一键发布到 抖音')
    await waitFor('document.querySelector("[data-douyin-submission=reviewing]")', 'douyin receipt')
    writeFileSync(join(root, 'mode'), 'private')
    await click('核查平台状态')
    await waitFor(
      'document.querySelector("[data-douyin-submission=private]")',
      'douyin private status',
    )
    assert.equal((await call('douyinSubmissions', project.id)).length, 1)
    assert.equal((await call('bilibiliAccounts')).accounts[0].uid, '123')
    await click('打开作品 7531234567890123456')
    assert.ok(opened.includes('https://www.douyin.com/video/7531234567890123456'))
    await screenshot('douyin-published-dark-1440.png', '[data-douyin-publishing]')
    for (const width of [1440, 1024]) {
      window.setSize(width, 1000)
      await screenshot(`douyin-published-dark-${width}.png`, '[data-douyin-publishing]')
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
    }
    window.webContents.setZoomFactor(2)
    await screenshot('douyin-published-200percent.png', '[data-douyin-publishing]')
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
    window.webContents.setZoomFactor(1)
    await evaluate(
      `window.history.pushState({},'', '/toolbox');window.dispatchEvent(new PopStateEvent('popstate'))`,
    )
    await waitFor(
      '[...document.querySelectorAll("button")].some(button => button.textContent.includes("管理工具") && !button.disabled)',
      'toolbox loaded',
    )
    await evaluate(
      '[...document.querySelectorAll("button")].find(button => button.textContent.includes("管理工具")).dataset.focusManager = "true"',
    )
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${theme === 'dark'})`)
      await pointerClick('[data-focus-manager]')
      await waitFor('document.querySelector("[role=dialog]")', 'toolbox pointer dialog')
      await pointerClick('[aria-label="关闭弹窗"]')
      await waitFor('!document.querySelector("[role=dialog]")', 'toolbox closes')
      await key('Tab')
      await evaluate('document.querySelector("[data-focus-manager]").focus()')
      await key('Space')
      await waitFor('document.querySelector("[role=dialog]")', 'toolbox keyboard dialog')
      const toolboxFocus = await focusedStyle()
      assert.equal(toolboxFocus.outline, 'solid')
      assert.equal(toolboxFocus.outlineWidth, '2px')
      assert.equal(toolboxFocus.shadow, 'none')
      for (const width of [1440, 1024]) {
        window.setSize(width, 1000)
        await screenshot(`toolbox-dialog-${theme}-${width}.png`, '[role=dialog]')
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
      }
      window.webContents.setZoomFactor(2)
      await screenshot(`toolbox-dialog-${theme}-200percent.png`, '[role=dialog]')
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
      window.webContents.setZoomFactor(1)
      await key('Escape')
      await waitFor('!document.querySelector("[role=dialog]")', 'toolbox Escape')
    }
    console.log(
      'Publishing Electron UI: Bilibili and Douyin isolated accounts, QR login, switching, unlinking, keyboard, themes, viewports, zoom, circular translucent video preview, media cleanup, upload locking, receipts and network uncertainty passed',
    )
    app.exit(0)
  } catch (error) {
    console.error(error)
    if (window)
      writeFileSync(join(root, 'failure.png'), (await window.webContents.capturePage()).toPNG())
    app.exit(1)
  }
})
