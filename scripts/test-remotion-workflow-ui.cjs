const { app, BrowserWindow, session, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { spawnSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')

const root = mkdtempSync(join(tmpdir(), 'synthetic-remotion-ui-'))
const node = spawnSync('which', ['node'], { encoding: 'utf8' }).stdout.trim()
const seeded = spawnSync(
  process.execPath,
  ['--import', 'tsx', join(__dirname, 'seed-bilibili-publishing.ts'), root, node],
  { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' },
)
assert.equal(seeded.status, 0, seeded.stderr)
const seedProject = JSON.parse(readFileSync(join(root, 'seed-project.json'), 'utf8'))
const fixtureDb = new (require('better-sqlite3'))(join(root, 'database/dashboard.db'))
fixtureDb.prepare("DELETE FROM video_workflow_revisions WHERE stage IN ('render', 'publish')").run()
fixtureDb.close()
const runtimeRoot = join(root, 'runtime')
mkdirSync(runtimeRoot)
for (const name of ['react', 'react-dom', 'remotion']) {
  const directory = join(runtimeRoot, 'node_modules', name)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version: '4.0.541' }))
}
const executable = join(runtimeRoot, 'cli.js')
const modePath = join(root, 'mode')
const invocationPath = join(root, 'invocation.json')
writeFileSync(modePath, 'success')
writeFileSync(
  executable,
  `
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('@remotion/cli 4.0.541'); process.exit(0); }
fs.writeFileSync(${JSON.stringify(invocationPath)}, JSON.stringify(process.argv.slice(2)));
if(fs.readFileSync(${JSON.stringify(modePath)}, 'utf8') === 'failure') { console.error('Synthetic Remotion render unavailable'); process.exit(1); }
const output = process.argv[process.argv.indexOf('Video') + 1];
if (!output || !output.endsWith('.mp4')) process.exit(2);
require('node:child_process').execFileSync('ffmpeg', ['-nostdin','-y','-v','error','-f','lavfi','-i','color=c=0x123456:s=1920x1080:d=10','-f','lavfi','-i','sine=frequency=440:duration=10','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',output]);
`,
)
const configPath = join(root, 'config/video-workflow.json')
const agentPath = join(runtimeRoot, 'agent.cjs')
const nativeSources = {
  summary: 'Synthetic native Remotion UI fixture',
  files: [
    {
      name: 'visuals.tsx',
      content:
        "import React from 'react'; import Scene from './scene-0'; export default function Visuals(props) { return <Scene {...props}/> }",
    },
    {
      name: 'scene-0.tsx',
      content:
        "import React from 'react'; export default function Scene() { return <div>Native visual fixture</div> }",
    },
  ],
}
writeFileSync(
  agentPath,
  `#!${node}\nif(process.argv[2]==='mcp'){process.stdout.write('[]');process.exit(0)}process.stdin.resume();process.stdin.on('end',()=>{const output=process.argv.indexOf('--output-last-message');if(output>=0)require('node:fs').writeFileSync(process.argv[output+1],${JSON.stringify(JSON.stringify(nativeSources))});else process.stdout.write(JSON.stringify({result:${JSON.stringify(JSON.stringify(nativeSources))}}));});`,
)
chmodSync(agentPath, 0o700)
writeFileSync(
  configPath,
  JSON.stringify({
    ...JSON.parse(readFileSync(configPath, 'utf8')),
    remotionPath: executable,
    hyperframesPath: '',
    codexPath: agentPath,
    claudePath: agentPath,
    deepseekPath: '',
  }),
)
process.env.MYDASHBOARD_USER_DATA = root
delete process.env.ELECTRON_RENDERER_URL
global.fetch = async () => {
  throw new Error('Synthetic offline fixture')
}
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (_details, done) => done({ cancel: true }),
  )
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
    for (let attempt = 0; attempt < 300; attempt++) {
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
        `(() => {const button=[...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)}); if(!button || button.disabled) return false; button.click(); return true;})()`,
      ),
      label,
    )
  }
  const key = async (keyCode) => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await delay(100)
  }
  const stage = async (index) => {
    await evaluate(
      `document.querySelector('nav[aria-label="视频创作步骤"] button[aria-label^="${index}."]').click()`,
    )
    await wait(
      `document.querySelector('nav [aria-current=step]')?.getAttribute('aria-label').startsWith('${index}.')`,
    )
  }
  const openProject = async () => {
    await evaluate('location.hash="/video"')
    await wait('document.getElementById("workflow-project-search")')
    await click('继续创作')
    await wait('document.querySelector("nav[aria-label=视频创作步骤]")')
  }
  const selector = 'button[role=combobox][aria-label="合成引擎"]'
  const screens = resolve('.scratch/remotion/screens')
  mkdirSync(screens, { recursive: true })
  const screenshot = async (name) => {
    await delay(150)
    writeFileSync(join(screens, `${name}.png`), (await window.webContents.capturePage()).toPNG())
  }
  const deadline = setTimeout(() => {
    console.error('Remotion UI timed out')
    app.exit(1)
  }, 150000)
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      window = BrowserWindow.getAllWindows().find((candidate) =>
        candidate.webContents.getURL().startsWith('file:'),
      )
      if (window && !window.webContents.isLoadingMainFrame()) break
      await delay(100)
    }
    assert.ok(window)
    window.setSize(1440, 1000)
    await openProject()
    await stage(6)
    await wait(`document.querySelector(${JSON.stringify(selector)})`)
    assert.match(
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`),
      /HyperFrames/,
    )
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`)
    await key('Space')
    await wait('document.querySelector("[role=listbox]")')
    await key('End')
    await key('Return')
    await wait(
      `document.querySelector(${JSON.stringify(selector)}).textContent.includes('Remotion')`,
    )
    await wait('!document.querySelector("[role=listbox]")')
    window.webContents.reload()
    await wait('document.querySelector("main")')
    await openProject()
    await stage(6)
    await wait(
      `document.querySelector(${JSON.stringify(selector)}).textContent.includes('Remotion')`,
    )
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1000)
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
        await evaluate(
          `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`,
        )
        await screenshot(`roughcut-${theme}-${width}`)
      }
    }
    window.setSize(1440, 1000)
    await click('合成 Remotion 粗剪')
    await wait(`document.querySelector(${JSON.stringify(selector)}).disabled`)
    await wait('document.querySelector("[data-job-state=succeeded]")')
    const getProject = () =>
      evaluate(`window.electronAPI.invoke('workflow:get', ${JSON.stringify(seedProject.id)})`)
    let result
    for (let attempt = 0; attempt < 100; attempt++) {
      result = await getProject()
      if (result.data.stages.roughcut.payload.renderEngine === 'remotion') break
      await delay(100)
    }
    assert.equal(result.data.stages.roughcut.payload.renderEngine, 'remotion')
    assert.equal(result.data.stages.roughcut.status, 'review')
    const originalId = result.data.stages.roughcut.id
    writeFileSync(modePath, 'failure')
    await click('合成 Remotion 粗剪')
    await wait('document.querySelector("[data-job-state=failed]")')
    assert.equal((await getProject()).data.stages.roughcut.id, originalId)
    assert.ok(JSON.parse(readFileSync(invocationPath, 'utf8')).includes('--concurrency=1'))
    await click('审核通过此版本')
    await wait('document.querySelector("[role=dialog]")')
    await click('确认审核通过')
    await wait('!document.querySelector("[role=dialog]")')
    await stage(7)
    await wait('document.querySelector("main").textContent.includes("合成引擎：Remotion")')
    assert.equal(
      await evaluate(
        `[...document.querySelectorAll('.workflow-inspector-item')].find(item => item.querySelector('span')?.textContent === '生成方式')?.querySelector('strong')?.textContent.trim()`,
      ),
      'Remotion',
    )
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)})`), null)
    writeFileSync(modePath, 'success')
    await click('渲染最终成片')
    await wait('document.querySelector("[data-job-state=running]")')
    assert.equal(
      await evaluate(
        `document.querySelector('[data-job-state=running] .workflow-job-meta span')?.textContent`,
      ),
      'Remotion',
    )
    for (let attempt = 0; attempt < 200; attempt++) {
      result = await getProject()
      if (result.data.stages.render?.payload.renderEngine === 'remotion') break
      await delay(100)
    }
    assert.equal(result.data.stages.render.payload.renderEngine, 'remotion')
    assert.equal(result.data.stages.render.status, 'review')
    assert.equal(result.data.jobs.find((job) => job.stage === 'render').renderEngine, 'remotion')
    assert.equal(
      await evaluate(`document.querySelector('.workflow-job-meta span')?.textContent`),
      'Remotion',
    )
    window.webContents.setZoomFactor(2)
    await evaluate('document.querySelector("[data-workflow-settings]").click()')
    await wait('document.querySelector("[role=dialog]")')
    await key('Tab')
    assert.ok(
      await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
    )
    assert.ok(
      await evaluate(
        `[...document.querySelectorAll('label')].some(label => label.textContent.includes('Remotion 4.0.541'))`,
      ),
    )
    await screenshot('settings-dark-200percent')
    await key('Escape')
    await wait('!document.querySelector("[role=dialog]")')
    await wait('document.activeElement.hasAttribute("data-workflow-settings")')
    window.webContents.setZoomFactor(1)
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-reduced-motion', value: 'reduce' },
        { name: 'forced-colors', value: 'active' },
      ],
    })
    await stage(6)
    await wait(`document.querySelector(${JSON.stringify(selector)})`)
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`)
    await key('Space')
    await wait('document.querySelector("[role=listbox]")')
    await key('Escape')
    await wait('!document.querySelector("[role=listbox]")')
    assert.ok(
      await evaluate(
        `document.activeElement === document.querySelector(${JSON.stringify(selector)})`,
      ),
    )
    await screenshot('roughcut-forced-colors-reduced-motion')
    window.webContents.debugger.detach()
    console.log(
      'PASS Remotion engine keyboard selection, per-project persistence, real IPC render routing, failure preservation, final source engine, themes, widths and 200% dialog',
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
