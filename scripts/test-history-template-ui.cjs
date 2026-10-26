const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { randomUUID } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')

const root = mkdtempSync(join(tmpdir(), 'history-template-ui-'))
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
const initial = JSON.parse(readFileSync(join(root, 'seed-project.json'), 'utf8'))
process.env.MYDASHBOARD_USER_DATA = root
require('../out/main/index.js')

app.whenReady().then(async () => {
  let window
  const evaluate = (source) => window.webContents.executeJavaScript(source, true)
  const waitFor = async (source, label) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate(`Boolean(${source})`)) return
      await delay(100)
    }
    throw new Error(`Timed out: ${label}`)
  }
  const click = async (name) => {
    assert.ok(
      await evaluate(
        `(() => { const button=[...document.querySelectorAll('button')].find(item=>(item.textContent.trim()===${JSON.stringify(name)}||item.getAttribute('aria-label')===${JSON.stringify(name)})&&!item.disabled);if(!button)return false;button.click();return true})()`,
      ),
      name,
    )
    await delay(120)
  }
  const key = async (keyCode) => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await delay(150)
  }
  const call = async (action, ...args) => {
    const result = await evaluate(
      `window.electronAPI.invoke(${JSON.stringify('workflow:' + action)}, ...${JSON.stringify(args)})`,
    )
    assert.equal(result.success, true, result.error)
    return result.data
  }
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      window = BrowserWindow.getAllWindows().find((item) =>
        item.webContents.getURL().startsWith('file:'),
      )
      if (window && !window.webContents.isLoadingMainFrame()) break
      await delay(100)
    }
    window.setSize(1440, 1100)
    await waitFor('document.querySelector("nav")', 'app ready')
    const original = initial.stages.storyboard.payload
    const custom = {
      ...original,
      mode: 'agent',
      motionPolicy: { enabled: false, excludedSceneIds: [] },
      scenes: original.scenes.map((scene) => ({ ...scene, html: '<h1>旧视觉</h1>' })),
    }
    const before = await call(
      'save',
      initial.id,
      'storyboard',
      custom,
      initial.revision,
      randomUUID(),
    )
    await evaluate(
      "window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))",
    )
    await waitFor('document.querySelector(".workflow-project-row")', 'projects')
    await click('继续创作')
    await evaluate('document.querySelectorAll(".workflow-step-button")[2].click()')
    await waitFor(
      'document.querySelector(".workflow-storyboard") || [...document.querySelectorAll("button")].some(item=>item.textContent.trim()==="创作设置")',
      'storyboard',
    )
    await click('创作设置')
    await evaluate('document.querySelector("[role=dialog] input[value=template]").click()')
    await evaluate(
      `(() => { const label=[...document.querySelectorAll('.workflow-template')].find(item=>item.textContent.includes('史笺'));label.querySelector('input').focus() })()`,
    )
    await key('Space')
    await waitFor(
      'document.querySelector(".workflow-template:has(input:checked)")?.textContent.includes("史笺")',
      'history selected',
    )
    await waitFor(
      'document.querySelectorAll(".workflow-template-examples iframe").length===10',
      'ten examples',
    )
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1100)
        await evaluate(
          'document.querySelector(".workflow-template-options").scrollIntoView({block:"start"})',
        )
        await delay(400)
        writeFileSync(
          join(root, `history-selection-${theme}-${width}.png`),
          (await window.webContents.capturePage()).toPNG(),
        )
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
        assert.ok(
          await evaluate(
            'document.querySelector(".workflow-dialog-footer").getBoundingClientRect().bottom<=innerHeight',
          ),
        )
      }
    }
    window.webContents.setZoomFactor(2)
    await key('Tab')
    assert.ok(
      await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
    )
    writeFileSync(
      join(root, 'history-selection-200percent.png'),
      (await window.webContents.capturePage()).toPNG(),
    )
    await key('Escape')
    assert.ok(await evaluate('document.activeElement.textContent.includes("创作设置")'))
    assert.equal((await call('get', initial.id)).revision, before.revision)
    window.webContents.setZoomFactor(1)
    window.setSize(1440, 1100)
    await click('创作设置')
    await evaluate('document.querySelector("[role=dialog] input[value=template]").click()')
    await evaluate(
      `[...document.querySelectorAll('.workflow-template')].find(item=>item.textContent.includes('史笺')).querySelector('input').click()`,
    )
    await click('采用视觉模板')
    await click('保存草稿')
    await click('确认保存新版本')
    await waitFor('!document.querySelector("[role=dialog]")', 'saved')
    const after = await call('get', initial.id)
    const storyboard = after.stages.storyboard.payload
    assert.equal(storyboard.template, 'history')
    assert.deepEqual(
      storyboard.scenes.map(({ id, title, body, layout }) => ({ id, title, body, layout })),
      original.scenes,
    )
    assert.equal(storyboard.scenes[0].html, undefined)
    assert.equal(after.stages.storyboard.status, 'review')
    const preview = await call('preview', initial.id, storyboard, storyboard.scenes[0].id)
    assert.ok(
      preview.includes('history-scene') &&
        preview.includes('#dfc69c') &&
        !preview.includes('旧视觉'),
    )
    assert.equal(after.stages.copy.id, initial.stages.copy.id)
    await click('修改此分镜')
    await click('本镜布局')
    await waitFor('document.querySelectorAll("[role=option]").length===10', 'ten layout options')
    await key('End')
    await key('Up')
    await key('Enter')
    await click('采用分镜修改')
    await click('保存草稿')
    await click('确认保存新版本')
    await waitFor('!document.querySelector("[role=dialog]")', 'single scene saved')
    const edited = await call('get', initial.id)
    assert.equal(edited.stages.storyboard.payload.scenes[0].layout, 'artifact')
    assert.deepEqual(edited.stages.storyboard.payload.scenes.slice(1), storyboard.scenes.slice(1))
    assert.equal(edited.stages.storyboard.payload.scenes[0].body, storyboard.scenes[0].body)
    assert.ok(
      (
        await call('preview', initial.id, edited.stages.storyboard.payload, storyboard.scenes[0].id)
      ).includes('id="history-artifact"'),
    )
    console.log(
      'History template UI: theme, viewport, keyboard, cancel, save and visual replacement passed. Artifacts:',
      root,
    )
    app.exit(0)
  } catch (error) {
    console.error(error)
    console.error('Artifacts:', root)
    app.exit(1)
  }
})
