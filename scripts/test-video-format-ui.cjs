const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { randomUUID } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')

const root = mkdtempSync(join(tmpdir(), 'video-format-ui-'))
const node = spawnSync('which', ['node'], { encoding: 'utf8' }).stdout.trim()
const seeded = spawnSync(
  process.execPath,
  ['--import', 'tsx', join(__dirname, 'seed-bilibili-publishing.ts'), root, node],
  {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
  },
)
assert.equal(seeded.status, 0, seeded.stderr)
let project = JSON.parse(readFileSync(join(root, 'seed-project.json'), 'utf8'))
process.env.MYDASHBOARD_USER_DATA = root
require('../out/main/index.js')
const timeout = setTimeout(() => {
  console.error('Video format UI timed out', root)
  app.exit(1)
}, 120000)

app.whenReady().then(async () => {
  let window
  const evaluate = (source) => window.webContents.executeJavaScript(source, true)
  const waitFor = async (source) => {
    for (let attempt = 0; attempt < 180; attempt++) {
      if (await evaluate(`Boolean(${source})`)) return
      await delay(100)
    }
    throw new Error(`Timed out: ${source}`)
  }
  const click = async (name) => {
    assert.ok(
      await evaluate(
        `(() => { const button=[...document.querySelectorAll('button')].find(item=>(item.textContent.trim()===${JSON.stringify(name)}||item.getAttribute('aria-label')===${JSON.stringify(name)})&&!item.disabled);if(!button)return false;button.click();return true })()`,
      ),
      name,
    )
    await delay(150)
  }
  const key = async (keyCode, modifiers = []) => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await delay(150)
  }
  const call = async (action, ...args) => {
    const result = await evaluate(
      `window.electronAPI.invoke(${JSON.stringify('workflow:' + action)}, ...${JSON.stringify(args)})`,
    )
    assert.equal(result.success, true, result.error)
    return result.data
  }
  const save = async (stage, payload) => {
    project = await call('save', project.id, stage, payload, project.revision, randomUUID())
  }
  const approve = async (stage) => {
    project = await call(
      'approve',
      project.id,
      stage,
      project.stages[stage].id,
      project.revision,
      randomUUID(),
    )
  }
  try {
    for (let attempt = 0; attempt < 180; attempt++) {
      window = BrowserWindow.getAllWindows().find((item) =>
        item.webContents.getURL().startsWith('file:'),
      )
      if (window) break
      await delay(100)
    }
    assert.ok(window)
    await waitFor('window.electronAPI')
    const originalBoard = project.stages.storyboard.payload
    await save('brief', { ...project.stages.brief.payload, format: 'portrait' })
    await approve('brief')
    await save('copy', project.stages.copy.payload)
    await approve('copy')
    await save('storyboard', originalBoard)
    const wrongReview = await evaluate(
      `window.electronAPI.invoke('workflow:approve', ${JSON.stringify(project.id)}, 'storyboard', ${JSON.stringify(project.stages.storyboard.id)}, ${project.revision}, ${JSON.stringify(randomUUID())})`,
    )
    assert.equal(wrongReview.success, false)
    assert.match(wrongReview.error, /画幅与项目目标不一致/)
    const portrait = {
      ...originalBoard,
      format: 'portrait',
      motionPolicy: { enabled: false, excludedSceneIds: [] },
      scenes: originalBoard.scenes.map((scene) => ({ ...scene, html: undefined })),
    }
    const rejected = await evaluate(
      `window.electronAPI.invoke('workflow:save', ${JSON.stringify(project.id)}, 'storyboard', ${JSON.stringify({ ...portrait, scenes: [{ ...portrait.scenes[0], html: '<style>section{width:1920px;height:1080px}</style><section><h1>错误横版</h1></section>' }] })}, ${project.revision}, ${JSON.stringify(randomUUID())})`,
    )
    assert.equal(rejected.success, false)
    assert.match(rejected.error, /超出 1080×1920/)
    await save('storyboard', portrait)
    await evaluate(
      "window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))",
    )
    await waitFor('document.querySelector(".workflow-project-row")')
    await click('继续创作')
    await evaluate('document.querySelectorAll(".workflow-step-button")[2].click()')
    await waitFor('document.querySelector(".workflow-preview iframe")')
    assert.ok(await evaluate('document.body.textContent.includes("竖版 9:16 · 1080×1920")'))
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1100)
        await delay(800)
        const frame = await evaluate(
          `(() => { const frame=document.querySelector('.workflow-preview iframe');const bounds=frame.getBoundingClientRect();const parent=frame.parentElement.getBoundingClientRect();return {width:frame.style.width,height:frame.style.height,ratio:bounds.width/bounds.height,inside:bounds.left>=parent.left-1&&bounds.right<=parent.right+1&&bounds.top>=parent.top-1&&bounds.bottom<=parent.bottom+1,source:frame.srcdoc.includes('width:1080px;height:1920px')} })()`,
        )
        assert.equal(frame.width, '1080px')
        assert.equal(frame.height, '1920px')
        assert.ok(Math.abs(frame.ratio - 9 / 16) < 0.001)
        assert.ok(frame.inside && frame.source)
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
        writeFileSync(
          join(root, `portrait-${theme}-${width}.png`),
          (await window.webContents.capturePage()).toPNG(),
        )
      }
    }
    window.webContents.setZoomFactor(2)
    await delay(400)
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
    writeFileSync(
      join(root, 'portrait-200-percent.png'),
      (await window.webContents.capturePage()).toPNG(),
    )
    window.webContents.setZoomFactor(1)
    window.setSize(1440, 1100)
    await evaluate('document.querySelectorAll(".workflow-step-button")[0].click()')
    await waitFor('document.querySelector("[aria-label=视频画幅]")')
    await evaluate('document.querySelector("[aria-label=视频画幅]").focus()')
    await key('Tab')
    assert.ok(await evaluate('document.activeElement?.getAttribute("aria-label")!=="视频画幅"'))
    await key('Tab', ['shift'])
    await waitFor('document.activeElement?.getAttribute("aria-label")==="视频画幅"')
    await key('Space')
    await waitFor('document.querySelector("[role=listbox]")')
    await key('Up')
    await key('Return')
    await waitFor('document.querySelector("[aria-label=视频画幅]").textContent.includes("横版")')
    await click('放弃未保存修改')
    await waitFor('document.querySelector("[aria-label=视频画幅]").textContent.includes("竖版")')
    await evaluate('document.querySelector("[aria-label=视频画幅]").focus()')
    await key('Space')
    await waitFor('document.querySelector("[role=listbox]")')
    await key('Escape')
    await waitFor('document.activeElement?.getAttribute("aria-label")==="视频画幅"')
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'forced-colors', value: 'active' }],
    })
    assert.ok(await evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches && matchMedia("(forced-colors: active)").matches'))
    await key('Space')
    await waitFor('document.querySelector("[role=listbox]")')
    writeFileSync(join(root, 'format-forced-colors-reduced-motion.png'), (await window.webContents.capturePage()).toPNG())
    await key('Escape')
    await waitFor('document.activeElement?.getAttribute("aria-label")==="视频画幅"')
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] })
    window.webContents.debugger.detach()
    project = await call('get', project.id)
    assert.equal(project.stages.brief.payload.format, 'portrait')
    assert.equal(project.stages.storyboard.payload.format, 'portrait')
    assert.ok(
      project.history.some(
        (item) => item.stage === 'storyboard' && item.id !== project.stages.storyboard.id,
      ),
    )
    console.log(
      'PASS: portrait persistence, canvas rejection, frozen preview ratio, themes, viewports, zoom and keyboard. Artifacts:',
      root,
    )
    clearTimeout(timeout)
    app.exit(0)
  } catch (error) {
    console.error(error, 'Artifacts:', root)
    clearTimeout(timeout)
    app.exit(1)
  }
})
