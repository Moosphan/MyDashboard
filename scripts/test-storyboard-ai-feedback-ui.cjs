const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, writeFileSync, chmodSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const Database = require('better-sqlite3')

const root = mkdtempSync(join(tmpdir(), 'storyboard-ai-feedback-ui-'))
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
const storyboard = {
  mode: 'agent',
  template: 'technical',
  motionPolicy: { enabled: false, excludedSceneIds: [] },
  scenes: [
    {
      id: 'one',
      title: '建国之后：制度与恢复',
      body: '恢复生产，减轻战后压力',
      layout: 'comparison',
      html: '<div>制度与恢复</div>',
    },
  ],
}
const database = new Database(join(root, 'database/dashboard.db'))
database
  .prepare('UPDATE video_workflow_revisions SET payload=? WHERE id=?')
  .run(JSON.stringify(storyboard), project.stages.storyboard.id)
const agent = join(root, 'scene-agent')
const promptFile = join(root, 'scene-prompt.txt')
writeFileSync(
  agent,
  `#!${node}
const fs=require('node:fs');let prompt='';process.stdin.on('data',chunk=>prompt+=chunk);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(promptFile)},prompt);setTimeout(()=>fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify({ ...storyboard, scenes: [{ ...storyboard.scenes[0], title: '重新设计的制度与恢复', html: '<div>新的人物插画与制度图解</div>' }] }))}),500);});`,
)
chmodSync(agent, 0o755)
process.env.MYDASHBOARD_USER_DATA = root
require('../out/main/index.js')
const timeout = setTimeout(() => {
  console.error('Timed out', root)
  app.exit(1)
}, 90000)
app.whenReady().then(async () => {
  let window
  const evaluate = (source) => window.webContents.executeJavaScript(source, true)
  const waitFor = async (source, label) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate(`Boolean(${source})`)) return
      await delay(100)
    }
    console.error(
      await evaluate('[...document.querySelectorAll("[role=alert]")].map(item=>item.textContent)'),
    )
    throw new Error(`Timed out: ${label}`)
  }
  const click = async (text) => {
    assert.ok(
      await evaluate(
        `(()=>{const button=[...document.querySelectorAll('button')].find(item=>(item.textContent.trim()===${JSON.stringify(text)}||item.getAttribute('aria-label')===${JSON.stringify(text)})&&!item.disabled);if(!button)return false;button.click();return true})()`,
      ),
      text,
    )
    await delay(100)
  }
  const fill = async (label, value) => {
    assert.ok(
      await evaluate(
        `(()=>{const label=[...document.querySelectorAll('label')].find(item=>item.textContent.trim()===${JSON.stringify(label)});const field=label&&document.getElementById(label.htmlFor);if(!field)return false;const proto=field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));return true})()`,
      ),
      label,
    )
    await delay(100)
  }
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      window = BrowserWindow.getAllWindows().find((item) =>
        item.webContents.getURL().startsWith('file:'),
      )
      if (window && !window.webContents.isLoadingMainFrame()) break
      await delay(100)
    }
    window.setMinimumSize(720, 640)
    window.setSize(1440, 1100)
    await waitFor('document.querySelector("nav")', 'application')
    await evaluate(
      "window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))",
    )
    await waitFor('document.querySelector(".workflow-project-row")', 'project list')
    await click('继续创作')
    await waitFor('document.querySelectorAll(".workflow-step-button").length===8', 'stages')
    await evaluate('document.querySelectorAll(".workflow-step-button")[2].click()')
    await waitFor('document.querySelector(".workflow-storyboard")', 'storyboard')
    await click('修改此分镜')
    await fill('画面标题', '本地草稿尚未保存')
    await click('采用分镜修改')
    await click('修改此分镜')
    const feedback = '人物插画太抽象，需要重新设计'
    await fill('AI 修改意见', feedback)
    await click('让 AI 按意见修改此镜')
    await waitFor(
      'document.querySelector("[role=dialog] [role=alert]")',
      'unsaved error visible inside editor',
    )
    assert.match(
      await evaluate('document.querySelector("[role=dialog] [role=alert]").textContent'),
      /先保存或放弃/,
    )
    assert.equal(
      await evaluate('document.querySelector("[data-storyboard-ai-feedback]").value'),
      feedback,
    )
    await waitFor(
      'document.querySelector(".workflow-stage-shell").getAttribute("aria-busy")==="false"',
      'failed operation refresh',
    )
    assert.equal(
      database.prepare('SELECT count(*) AS count FROM video_workflow_jobs').get().count,
      0,
    )
    await click('用已保存要求重绘当前一镜')
    assert.ok(
      await evaluate('document.querySelector("[role=dialog]")'),
      'Rejected redraw preserves dialog',
    )
    await evaluate(
      'document.querySelector("[data-storyboard-ai-error]").scrollIntoView({block:"center"})',
    )
    assert.equal(
      await evaluate('document.querySelector("[data-storyboard-ai-feedback]").value'),
      feedback,
    )
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1100)
        await delay(100)
        writeFileSync(
          join(root, `error-${theme}-${width}.png`),
          (await window.webContents.capturePage()).toPNG(),
        )
      }
      window.webContents.setZoomFactor(2)
      await delay(100)
      writeFileSync(
        join(root, `error-${theme}-zoom.png`),
        (await window.webContents.capturePage()).toPNG(),
      )
      window.webContents.setZoomFactor(1)
    }
    window.focus()
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await waitFor('!document.querySelector("[role=dialog]")', 'Escape closes editor')
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), '修改此分镜')
    await click('放弃未保存修改')
    await click('修改此分镜')
    await fill('AI 修改意见', feedback)
    database.prepare('UPDATE video_projects SET revision=revision+1 WHERE id=?').run(project.id)
    await click('让 AI 按意见修改此镜')
    await waitFor(
      'document.querySelector("[role=dialog] [role=alert]")?.textContent.includes("项目已更新")',
      'actual IPC error inside editor',
    )
    assert.equal(
      await evaluate('document.querySelector("[data-storyboard-ai-feedback]").value'),
      feedback,
    )
    database.prepare('UPDATE video_projects SET revision=revision-1 WHERE id=?').run(project.id)
    await evaluate(
      `window.electronAPI.invoke('workflow:configure',{codexPath:${JSON.stringify(agent)}})`,
    )
    await click('让 AI 按意见修改此镜')
    await waitFor('!document.querySelector("[role=dialog]")', 'successful start closes editor')
    await waitFor(
      'document.querySelector(".workflow-scene-notes")?.textContent.includes("重新设计的制度与恢复") && !document.querySelector(".workflow-job-progress")',
      'generation completes',
    )
    await waitFor('document.querySelector("[data-workflow-operation]")', 'operation record')
    const result = await evaluate(
      `window.electronAPI.invoke('workflow:get',${JSON.stringify(project.id)})`,
    )
    assert.equal(result.data.stages.storyboard.status, 'review')
    assert.match(result.data.stages.storyboard.payload.scenes[0].html, /新的人物插画/)
    assert.match(readFileSync(promptFile, 'utf8'), /人物插画太抽象/)
    console.log(
      'PASS unsaved and IPC errors inside modal, retained feedback, failed redraw stays open, successful retry, themes, viewports, zoom, Escape and focus',
    )
    console.log('Artifacts:', root)
    clearTimeout(timeout)
    database.close()
    app.exit(0)
  } catch (error) {
    console.error(error)
    console.error('Artifacts:', root)
    clearTimeout(timeout)
    database.close()
    app.exit(1)
  }
})
