const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const Database = require('better-sqlite3')

const root = mkdtempSync(join(tmpdir(), 'storyboard-review-notes-ui-'))
const node = spawnSync('which', ['node'], { encoding: 'utf8' }).stdout.trim()
const seed = spawnSync(
  process.execPath,
  ['--import', 'tsx', join(__dirname, 'seed-bilibili-publishing.ts'), root, node],
  {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
  },
)
assert.equal(seed.status, 0, seed.stderr)
const project = JSON.parse(readFileSync(join(root, 'seed-project.json'), 'utf8'))
const storyboard = process.env.STORYBOARD_REPRO_FILE
  ? JSON.parse(readFileSync(process.env.STORYBOARD_REPRO_FILE, 'utf8'))
  : {
      mode: 'agent',
      template: 'technical',
      scenes: [
        {
          id: 'one',
          title: '刘邦',
          body: '从亭长到开国皇帝',
          layout: 'title',
          html: '<div id="portrait">原创人物示意</div>',
          motion: {
            summary: '人物入场',
            effects: [
              {
                selector: '#portrait',
                start: 0,
                duration: 0.2,
                keyframes: [{ opacity: 0 }, { opacity: 1 }],
              },
            ],
            blockers: [
              '未提供实测配音，归一化卡点需在粗剪时按原口播词锚与实际配音校准。',
              '独立子 agent 设计复核尚未完成：审核会话未收到任务内容，重新创建会话失败，需补做复核。',
            ],
          },
        },
      ],
    }
const fixture = new Database(join(root, 'database/dashboard.db'))
fixture
  .prepare(
    "UPDATE video_workflow_revisions SET payload=?,status='review',approved_at=NULL WHERE id=?",
  )
  .run(JSON.stringify(storyboard), project.stages.storyboard.id)
fixture.close()
process.env.MYDASHBOARD_USER_DATA = root
require('../out/main/index.js')
const timeout = setTimeout(() => {
  console.error('Storyboard review timed out')
  app.exit(1)
}, 90000)
app.whenReady().then(async () => {
  let window
  const evaluate = (source) => window.webContents.executeJavaScript(source, true)
  const waitFor = async (source, label) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (await evaluate(`Boolean(${source})`)) return
      await delay(100)
    }
    throw new Error(`Timed out: ${label}`)
  }
  const click = async (name) => {
    assert.ok(
      await evaluate(`(() => {
      const button=[...document.querySelectorAll('button')].find(item=>(item.textContent.trim()===${JSON.stringify(name)} || item.getAttribute('aria-label')===${JSON.stringify(name)}) && !item.disabled)
      if (!button) return false
      button.click(); return true
    })()`),
      name,
    )
    await delay(100)
  }
  try {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      window = BrowserWindow.getAllWindows().find((item) =>
        item.webContents.getURL().startsWith('file:'),
      )
      if (window && !window.webContents.isLoadingMainFrame()) break
      await delay(100)
    }
    window.setMinimumSize(720, 640)
    window.setSize(1440, 1100)
    await waitFor('document.querySelector("nav")', 'app')
    await evaluate(
      "window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))",
    )
    await waitFor('document.querySelector(".workflow-project-row")', 'project list')
    await click('继续创作')
    await waitFor('document.querySelectorAll(".workflow-step-button").length===8', 'stages')
    await evaluate('document.querySelectorAll(".workflow-step-button")[2].click()')
    await waitFor(
      'document.querySelector("[data-storyboard-motion-note]")',
      'nonblocking explanations',
    )
    assert.equal(
      await evaluate('Boolean(document.querySelector("[data-storyboard-review-blocked]"))'),
      false,
    )
    assert.equal(
      await evaluate('document.querySelectorAll("[data-storyboard-motion-note]").length'),
      2,
    )
    assert.equal(
      await evaluate('Boolean(document.querySelector("[data-accept-illustration]"))'),
      false,
    )
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1100)
        await delay(150)
        writeFileSync(
          join(root, `storyboard-notes-${theme}-${width}.png`),
          (await window.webContents.capturePage()).toPNG(),
        )
      }
      window.webContents.setZoomFactor(2)
      await delay(150)
      writeFileSync(
        join(root, `storyboard-notes-${theme}-200percent.png`),
        (await window.webContents.capturePage()).toPNG(),
      )
      window.webContents.setZoomFactor(1)
    }
    await click('审核通过此版本')
    await waitFor('document.querySelector("[role=dialog]")', 'review dialog')
    window.focus()
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await waitFor('!document.querySelector("[role=dialog]")', 'Escape')
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), '审核通过此版本')
    await click('审核通过此版本')
    await click('确认审核通过')
    await waitFor(
      '!document.querySelector("[role=dialog]") && !document.querySelector("[aria-label=继续下一步]").disabled',
      'approved and unlocked',
    )
    const result = await evaluate(
      `window.electronAPI.invoke('workflow:get',${JSON.stringify(project.id)})`,
    )
    assert.equal(result.data.stages.storyboard.status, 'approved')
    assert.deepEqual(
      result.data.stages.storyboard.payload.scenes[0].motion.blockers,
      storyboard.scenes[0].motion.blockers,
    )
    console.log(
      'PASS: nonblocking notes, preserved history, actual DOM approval, next stage, themes, widths, zoom and focus return',
    )
    console.log('Artifacts:', root)
    clearTimeout(timeout)
    app.exit(0)
  } catch (error) {
    console.error(error)
    console.error('Artifacts:', root)
    clearTimeout(timeout)
    app.exit(1)
  }
})
