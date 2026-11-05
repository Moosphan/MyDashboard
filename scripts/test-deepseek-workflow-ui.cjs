const { app, BrowserWindow, ipcMain, session } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')

const root = mkdtempSync(join(tmpdir(), 'synthetic-deepseek-workflow-'))
const node = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['node'], {
  encoding: 'utf8',
})
  .stdout.trim()
  .split(/\r?\n/)[0]
const seeded = spawnSync(
  process.execPath,
  ['--import', 'tsx', join(__dirname, 'seed-bilibili-publishing.ts'), root, node],
  {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
  },
)
assert.equal(seeded.status, 0, seeded.stderr)
const project = JSON.parse(readFileSync(join(root, 'seed-project.json'), 'utf8'))
const executable = join(root, 'deepseek fixture.cjs')
const mode = join(root, 'deepseek-mode')
const captured = join(root, 'deepseek-invocation.json')
writeFileSync(mode, 'success')
writeFileSync(
  executable,
  `
const fs = require('node:fs')
if (process.argv.includes('--version')) { console.log('dsh 0.2.1-rc.5'); process.exit(0) }
let prompt = ''
process.stdin.on('data', chunk => prompt += chunk)
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(captured)}, JSON.stringify({ args: process.argv.slice(2), prompt }))
  if (fs.readFileSync(${JSON.stringify(mode)}, 'utf8') === 'failure') {
    console.error('Synthetic DeepSeek service unavailable')
    process.exit(1)
  }
  for (const event of [
    { type: 'session', sessionId: 'synthetic-ui-session' },
    { type: 'thinking', text: 'Intermediate output must not replace reviewed copy' },
    { type: 'status', phase: 'turn_end', reason: { kind: 'completed' } },
    { type: 'final', text: JSON.stringify({ text: 'DeepSeek 合成测试文案：已按审核简报生成，等待人工审核。' }) },
  ]) console.log(JSON.stringify(event))
})
`,
)
const configPath = join(root, 'config/video-workflow.json')
writeFileSync(
  configPath,
  JSON.stringify({
    ...JSON.parse(readFileSync(configPath, 'utf8')),
    deepseekPath: executable,
  }),
)
process.env.MYDASHBOARD_USER_DATA = root
delete process.env.ELECTRON_RENDERER_URL
global.fetch = async () => {
  throw new Error('Synthetic offline fixture')
}
app.whenReady().then(() => {
  for (const partition of [
    session.defaultSession,
    session.fromPartition('persist:chatgpt-session'),
  ]) {
    partition.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (_details, done) => done({ cancel: true }),
    )
  }
})
require('../out/main/index.js')

app.whenReady().then(async () => {
  ipcMain.removeHandler('ai:getCodexUsageDashboard')
  ipcMain.handle('ai:getCodexUsageDashboard', () => ({
    success: false,
    error: 'Synthetic offline fixture',
  }))
  let window
  const evaluate = (source) => window.webContents.executeJavaScript(source, true)
  const wait = async (source, label = source) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (
        window &&
        !window.isDestroyed() &&
        !window.webContents.isLoadingMainFrame() &&
        (await evaluate(`Boolean(${source})`))
      )
        return
      await delay(100)
    }
    throw new Error('Timed out: ' + label)
  }
  const click = async (label) => {
    assert.ok(
      await evaluate(
        `(() => { const button = [...document.querySelectorAll('button')].find(button => (button.textContent.trim() === ${JSON.stringify(label)} || button.getAttribute('aria-label') === ${JSON.stringify(label)}) && !button.disabled); if (!button) return false; button.click(); return true })()`,
      ),
      label,
    )
    await delay(100)
  }
  const stage = async (index) => {
    assert.ok(
      await evaluate(
        `(() => { const button = [...document.querySelectorAll('nav[aria-label="视频创作步骤"] button')].find(button => button.getAttribute('aria-label').startsWith('${index}.')); if (!button) return false; button.click(); return true })()`,
      ),
    )
    await wait(
      `document.querySelector('nav[aria-label="视频创作步骤"] [aria-current=step]')?.getAttribute('aria-label').startsWith('${index}.')`,
    )
  }
  const key = async (keyCode) => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await delay(100)
  }
  const selector = 'button[role=combobox][aria-label="本地执行器"]'
  const select = async (end) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`)
    await key('Space')
    await wait('document.querySelector("[role=listbox]")')
    await key(end ? 'End' : 'Home')
    await key('Return')
    await wait('!document.querySelector("[role=listbox]")')
    await wait(
      `document.querySelector(${JSON.stringify(selector)}).textContent.includes(${JSON.stringify(end ? 'DeepSeek' : 'Codex')})`,
    )
  }
  const openProject = async () => {
    await evaluate('location.hash="/video"')
    await wait('document.getElementById("workflow-project-search")')
    await click('继续创作')
    await wait('document.querySelector("nav[aria-label=视频创作步骤]")')
  }
  const screens = resolve('.scratch/deepseek-cli/screens')
  mkdirSync(screens, { recursive: true })
  const screenshot = async (name) => {
    await delay(150)
    writeFileSync(join(screens, name + '.png'), (await window.webContents.capturePage()).toPNG())
  }
  const deadline = setTimeout(() => {
    console.error('DeepSeek UI fixture timed out')
    app.exit(1)
  }, 150000)
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      window = BrowserWindow.getAllWindows().find((candidate) =>
        candidate.webContents.getURL().startsWith('file:'),
      )
      if (window && !window.webContents.isLoadingMainFrame()) break
      await delay(100)
    }
    assert.ok(window)
    window.setSize(1440, 1000)
    await openProject()
    await click('执行环境')
    await wait('document.querySelector("[role=dialog]")')
    assert.ok(
      await evaluate(
        `(() => { const label = [...document.querySelectorAll('label')].find(label => label.textContent.includes('DeepSeek Harness')); return label && document.getElementById(label.htmlFor).value === ${JSON.stringify(executable)} })()`,
      ),
    )
    await click('保存配置')
    await wait('!document.querySelector("[role=dialog]")')
    await wait('document.activeElement.hasAttribute("data-workflow-settings")')
    const restored = await evaluate('window.electronAPI.invoke("workflow:runtime")')
    assert.equal(restored.data.deepseekPath, executable)
    await stage(2)
    await wait(`document.querySelector(${JSON.stringify(selector)})`)
    assert.match(
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`),
      /Codex/,
    )
    await select(true)
    await stage(6)
    await evaluate('document.getElementById("workflow-motion-plan").open = true')
    await wait(
      `document.querySelector('#workflow-motion-plan ${selector}').textContent.includes('DeepSeek')`,
    )
    await select(false)
    await stage(2)
    await wait(`document.querySelector(${JSON.stringify(selector)}).textContent.includes('Codex')`)
    await select(true)
    window.webContents.reload()
    await wait('document.querySelector("main")')
    await openProject()
    await stage(2)
    await wait(
      `document.querySelector(${JSON.stringify(selector)}).textContent.includes('DeepSeek')`,
    )
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1000)
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
        await screenshot('copy-' + theme + '-' + width)
      }
    }
    window.setSize(1440, 1000)
    window.webContents.setZoomFactor(2)
    await click('执行环境')
    await wait('document.querySelector("[role=dialog]")')
    assert.ok(
      await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
    )
    await key('Tab')
    assert.ok(
      await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
    )
    await screenshot('settings-dark-200percent')
    await key('Escape')
    await wait('!document.querySelector("[role=dialog]")')
    await wait('document.activeElement.hasAttribute("data-workflow-settings")')
    window.webContents.setZoomFactor(1)
    await evaluate('document.querySelector("[data-copy-generate]").click()')
    await wait(
      'document.querySelector("[data-copy-text]").value.includes("DeepSeek 合成测试文案")',
      'DeepSeek copy generation',
    )
    const invocation = JSON.parse(readFileSync(captured, 'utf8'))
    assert.deepEqual(invocation.args.slice(0, 2), ['--profile', 'headless'])
    assert.ok(invocation.prompt.includes('审核内容'))
    await wait('document.querySelector("[data-job-state=succeeded]")')
    const savedText = await evaluate('document.querySelector("[data-copy-text]").value')
    writeFileSync(mode, 'failure')
    await evaluate('document.querySelector("[data-copy-generate]").click()')
    await wait('document.querySelector("[data-job-state=failed]")', 'failed DeepSeek job')
    assert.equal(await evaluate('document.querySelector("[data-copy-text]").value'), savedText)
    assert.ok(await evaluate('document.querySelector("main").textContent.includes("DeepSeek CLI")'))
    await screenshot('copy-failure-preserves-version')
    console.log(
      'PASS DeepSeek settings, keyboard selection, shared motion selector, reload persistence, real IPC generation, failure preservation, themes, viewports and 200% dialog',
    )
    console.log('Synthetic screenshots:', screens)
    app.exit(0)
  } catch (error) {
    console.error(error)
    if (window) await screenshot('failure')
    app.exit(1)
  } finally {
    clearTimeout(deadline)
  }
})
