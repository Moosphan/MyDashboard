const { app, BrowserWindow, dialog } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { execFileSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const root = mkdtempSync(join(tmpdir(), 'import-video-ui-'))
mkdirSync(join(root, 'config'), { recursive: true })
writeFileSync(
  join(root, 'config/video-workflow.json'),
  JSON.stringify({
    ffmpegPath: '/opt/homebrew/bin/ffmpeg',
    ffprobePath: '/opt/homebrew/bin/ffprobe',
    nodePath: execFileSync('which', ['node'], { encoding: 'utf8' }).trim(),
    catbusPath: join(__dirname, 'fixtures/catbus.mjs'),
  }),
)
const video = join(root, '外部AI成片.mp4'),
  invalid = join(root, 'invalid.mp4')
execFileSync('/opt/homebrew/bin/ffmpeg', [
  '-v',
  'error',
  '-f',
  'lavfi',
  '-i',
  'color=c=blue:s=360x640:d=1',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  video,
])
writeFileSync(invalid, 'not a video')
let selected = null
dialog.showOpenDialog = async () => ({ canceled: !selected, filePaths: selected ? [selected] : [] })
process.env.MYDASHBOARD_USER_DATA = root
const badAccountIndex = process.env.MYDASHBOARD_TEST_BAD_PUBLISHING_INDEX === '1'
if (badAccountIndex) {
  mkdirSync(join(root, 'config/publishing'), { recursive: true })
  writeFileSync(join(root, 'config/publishing/douyin-accounts.json'), '{invalid')
}
require('../out/main/index.js')
console.log('Import UI artifacts:', root)
app.whenReady().then(async () => {
  let win
  const evaluate = (source) => win.webContents.executeJavaScript(source, true)
  const wait = async (source, label) => {
    for (let n = 0; n < 150; n++) {
      if (await evaluate(`Boolean(${source})`)) return
      await delay(100)
    }
    throw new Error(`Timed out: ${label}`)
  }
  const click = async (name) => {
    assert.ok(
      await evaluate(
        `(()=>{const el=[...document.querySelectorAll('button')].find(el=>(el.textContent.trim()===${JSON.stringify(name)}||el.getAttribute('aria-label')===${JSON.stringify(name)})&&!el.disabled);if(!el)return false;el.click();return true})()`,
      ),
      `Missing enabled button ${name}`,
    )
    await delay(100)
  }
  const key = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    if (keyCode === 'Return' || keyCode === 'Enter')
      win.webContents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await delay(100)
  }
  const input = async (selector, value) =>
    evaluate(
      `(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`,
    )
  const call = async (action, ...args) => {
    const r = await evaluate(
      `window.electronAPI.invoke(${JSON.stringify('workflow:' + action)},...${JSON.stringify(args)})`,
    )
    assert.ok(r.success, r.error)
    return r.data
  }
  try {
    for (let n = 0; n < 150; n++) {
      win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith('file:'))
      if (win && !win.webContents.isLoadingMainFrame()) break
      await delay(100)
    }
    assert.ok(win)
    win.setMinimumSize(720, 640)
    win.setSize(1440, 1000)
    await wait('document.querySelector("nav")', 'app ready')
    if (badAccountIndex) {
      const result = await evaluate('window.electronAPI.invoke("workflow:list")')
      assert.equal(result.success, false)
      assert.match(result.error, /账号索引无法读取/)
      assert.ok(!win.isDestroyed())
      console.log('SCHEDULED_PUBLISHING_BAD_ACCOUNT_STARTUP_OK')
      app.exit(0)
      return
    }
    await evaluate(
      "window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))",
    )
    await wait(
      '[...document.querySelectorAll("button")].some(el=>el.textContent.trim()==="新建视频项目")',
      'video list',
    )
    await click('新建视频项目')
    await wait('document.querySelector("[data-finished-video-import] summary")', 'import foldout')
    assert.equal(
      await evaluate('document.querySelector("[data-finished-video-import]").open'),
      false,
    )
    await evaluate('document.querySelector("[data-finished-video-import] summary").focus()')
    await key('Space')
    assert.equal(
      await evaluate('document.querySelector("[data-finished-video-import]").open'),
      true,
    )
    await click('选择成品视频')
    assert.equal((await call('list')).length, 0)
    assert.ok(await evaluate('document.querySelector("#video-import-path")'))
    await evaluate('document.querySelector("#video-import-path").focus()')
    await input('#video-import-path', ` "${video}" `)
    await key('Tab')
    assert.equal(
      await evaluate('document.querySelector("#video-project-name").value'),
      '外部AI成片',
    )
    await input('#video-import-path', '')
    await input('#video-project-name', '外部成片发布验证')
    await input('#video-import-path', invalid)
    await input('#video-import-description', '蓝色画面，讲解城市交通。')
    await click('导入并进入发布')
    await wait('document.querySelector("[role=dialog] [role=alert]")', 'invalid file error')
    assert.equal(
      await evaluate('document.querySelector("#video-project-name").value'),
      '外部成片发布验证',
    )
    assert.equal((await call('list')).length, 0)
    selected = video
    await click('重新选择视频')
    assert.equal(await evaluate('document.querySelector("#video-import-path").value'), video)
    selected = null
    await click('重新选择视频')
    assert.equal(await evaluate('document.querySelector("#video-import-path").value'), video)
    selected = video
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        win.setSize(width, 1000)
        writeFileSync(
          join(root, `import-${theme}-${width}.png`),
          (await win.webContents.capturePage()).toPNG(),
        )
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
      }
    }
    win.webContents.setZoomFactor(2)
    await key('Tab')
    await key('Tab')
    assert.ok(
      await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
    )
    writeFileSync(
      join(root, 'import-200percent.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    win.webContents.setZoomFactor(1)
    win.setSize(1440, 1000)
    await key('Tab', ['shift'])
    assert.ok(
      await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
    )
    win.webContents.debugger.attach('1.3')
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [
        { name: 'forced-colors', value: 'active' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    })
    assert.ok(
      await evaluate(
        'matchMedia("(forced-colors: active)").matches && matchMedia("(prefers-reduced-motion: reduce)").matches',
      ),
    )
    assert.ok(
      await evaluate(
        'document.querySelector("[data-finished-video-import] summary").getBoundingClientRect().width>0',
      ),
    )
    writeFileSync(
      join(root, 'import-high-contrast-reduced-motion.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] })
    win.webContents.debugger.detach()
    await key('Escape')
    await wait('!document.querySelector("[role=dialog]")', 'creation closes')
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), '新建视频项目')
    await click('新建视频项目')
    await input('#video-project-name', '外部成片发布验证')
    await evaluate('document.querySelector("[data-finished-video-import] summary").focus()')
    await key('Space')
    await click('选择成品视频')
    await input('#video-import-description', '蓝色画面，讲解城市交通。')
    await evaluate(
      "(()=>{const b=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='导入并进入发布');b.click();b.click()})()",
    )
    await wait('document.querySelector("[data-bilibili-publishing]")', 'direct publication')
    assert.equal(
      await evaluate('document.querySelector("[data-scheduled-publishing]")?.open'),
      false,
    )
    let projects = await call('list')
    assert.equal(projects.length, 1)
    const project = projects[0]
    assert.deepEqual(Object.keys(project.stages).sort(), ['publish', 'render'])
    assert.ok(
      await evaluate(
        'document.querySelector("[data-imported-video-summary]").textContent.includes("360×640")',
      ),
    )
    assert.equal(await evaluate('document.querySelectorAll(".workflow-step-button").length'), 1)
    assert.ok(
      !(await evaluate(
        'document.querySelector("[data-publish-sources]").textContent.includes("分镜 v")',
      )),
    )
    await click('播放成片预览')
    await wait(
      'document.querySelector("[role=dialog] video")?.readyState>=2',
      'imported video decodes',
    )
    await key('Escape')
    assert.equal(
      await evaluate('document.activeElement.getAttribute("aria-label")'),
      '播放成片预览',
    )
    await evaluate('document.querySelector("input[value=douyin]").click()')
    await wait('document.querySelector("[data-douyin-publishing]")', 'douyin page')
    await click('投稿可见性')
    await evaluate(
      '[...document.querySelectorAll("[role=option]")].find(el=>el.textContent.includes("公开投稿")).click()',
    )
    await click('稿件类型')
    await evaluate(
      '[...document.querySelectorAll("[role=option]")].find(el=>el.textContent.includes("自制")).click()',
    )
    await input('input[maxlength="30"]', '城市交通')
    await click('保存草稿')
    await click('确认保存新版本')
    await wait('!document.querySelector("[role=dialog]")', 'metadata saved')
    await click('审核通过此版本')
    await click('确认审核通过')
    await wait('!document.querySelector("[role=dialog]")', 'metadata approved')
    await wait(
      'document.querySelector("[data-douyin-publishing]").textContent.includes("已连接：")',
      'fixture account connected',
    )
    assert.equal((await call('get', project.id)).stages.publish.status, 'approved')
    assert.equal(
      await evaluate(
        '[...document.querySelectorAll("button")].find(el=>el.textContent.trim()==="导出抖音发布包").disabled',
      ),
      false,
    )
    assert.equal(
      await evaluate(
        '[...document.querySelectorAll("button")].find(el=>el.textContent.trim()==="一键发布到 抖音").disabled',
      ),
      false,
    )
    await evaluate('document.querySelector("[data-scheduled-publishing] summary").focus()')
    await key('Space')
    await input('#scheduled-publish-time', '')
    assert.equal(
      await evaluate(
        '[...document.querySelectorAll("button")].find(el=>el.textContent.trim()==="设置定时发布").disabled',
      ),
      true,
    )
    const scheduleAt = new Date(Date.now() + 3600000)
    const localTime = new Date(scheduleAt.getTime() - scheduleAt.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    await input('#scheduled-publish-time', localTime)
    await click('设置定时发布')
    await wait('document.querySelector("[role=dialog]")', 'schedule confirmation')
    assert.ok(
      await evaluate(
        'document.querySelector("[role=dialog]").textContent.includes("MS4wLjABAAAA_test_123")',
      ),
    )
    await key('Escape')
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), '设置定时发布')
    await click('设置定时发布')
    writeFileSync(
      join(root, 'scheduled-confirmation.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    win.webContents.setZoomFactor(2)
    await key('Tab')
    await key('Tab', ['shift'])
    assert.ok(
      await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
    )
    writeFileSync(
      join(root, 'scheduled-confirmation-200percent.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    win.webContents.setZoomFactor(1)
    await click('确认定时发布')
    await wait('document.querySelector("[data-douyin-submission=scheduled]")', 'schedule persisted')
    await wait('!document.querySelector("[role=dialog]")', 'schedule confirmation closes')
    assert.equal((await call('douyinSubmissions', project.id))[0].state, 'scheduled')
    assert.equal(
      await evaluate(
        '[...document.querySelectorAll("button")].find(el=>el.textContent.trim()==="一键发布到 抖音").disabled',
      ),
      true,
    )
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        win.setSize(width, 1000)
        await evaluate(
          'document.querySelector("[data-scheduled-publishing]").scrollIntoView({block:"center"})',
        )
        await delay(200)
        writeFileSync(
          join(root, `scheduled-${theme}-${width}.png`),
          (await win.webContents.capturePage()).toPNG(),
        )
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
      }
    }
    win.webContents.debugger.attach('1.3')
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [
        { name: 'forced-colors', value: 'active' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    })
    assert.ok(
      await evaluate(
        'matchMedia("(forced-colors: active)").matches && matchMedia("(prefers-reduced-motion: reduce)").matches',
      ),
    )
    await evaluate(
      'document.querySelector("[data-scheduled-publishing]").scrollIntoView({block:"center"})',
    )
    await delay(200)
    writeFileSync(
      join(root, 'scheduled-high-contrast-reduced-motion.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] })
    win.webContents.debugger.detach()
    await click('取消定时发布')
    await wait('document.querySelector("[data-douyin-submission=cancelled]")', 'schedule cancelled')
    assert.equal((await call('douyinSubmissions', project.id))[0].state, 'cancelled')
    await click('一键发布到 抖音')
    await wait(
      'document.querySelector("[data-douyin-submission=reviewing]")',
      'fixture submission completed',
    )
    await click('设置定时发布')
    await click('确认定时发布')
    await wait(
      'document.querySelector("[role=dialog] [role=alert]")',
      'existing submission scheduling error',
    )
    assert.ok(
      await evaluate(
        'document.querySelector("[role=dialog] [role=alert]").textContent.includes("未创建定时计划")',
      ),
    )
    assert.ok(
      !(await call('douyinSubmissions', project.id)).some((record) => record.state === 'scheduled'),
    )
    await key('Escape')
    win.setSize(1440, 1000)
    writeFileSync(
      join(root, 'import-publish-ready.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    await click('返回视频项目列表')
    await click('继续创作')
    await wait(
      'document.querySelector("[data-bilibili-publishing]")',
      'reopened imported project stays at publish',
    )
    await click('返回视频项目列表')
    await click('新建视频项目')
    await input('#video-project-name', '外部成片发布验证')
    await evaluate('document.querySelector("[data-finished-video-import] summary").click()')
    await input('#video-import-path', `  "${video}"  `)
    await input('#video-import-description', '蓝色画面，讲解城市交通。')
    await click('导入并进入发布')
    await wait('document.querySelector("[data-bilibili-publishing]")', 'deliberate second import')
    assert.equal((await call('list')).length, 2)
    await click('返回视频项目列表')
    await click('新建视频项目')
    await input('#video-project-name', '正常创作项目')
    await evaluate('document.querySelector("[data-finished-video-import] summary").click()')
    await click('选择成品视频')
    await click('取消导入选择')
    assert.equal(await evaluate('document.querySelector("#video-import-path").value'), '')
    await evaluate(
      '[...document.querySelectorAll("button")].find(el=>el.textContent.trim()==="创建项目").focus()',
    )
    await key('Return')
    await wait(
      '!document.querySelector("[role=dialog]") && document.querySelectorAll(".workflow-step-button").length===8',
      'ordinary creation enters original workflow',
    )
    projects = await call('list')
    assert.equal(projects.length, 3)
    assert.deepEqual(Object.keys(projects.find((item) => item.title === '正常创作项目').stages), [])
    console.log('IMPORT_VIDEO_UI_OK')
    app.exit(0)
  } catch (error) {
    console.error(error)
    if (win) {
      writeFileSync(join(root, 'failed.png'), (await win.webContents.capturePage()).toPNG())
      writeFileSync(join(root, 'failed.txt'), await evaluate('document.body.innerText'))
    }
    app.exit(1)
  }
})
