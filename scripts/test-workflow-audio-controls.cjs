const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { randomUUID } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')

const root = mkdtempSync(join(tmpdir(), 'workflow-audio-controls-'))
process.env.MYDASHBOARD_USER_DATA = root
console.log('UI artifacts:', root)
const source = join(root, 'voice.wav')
execFileSync('/opt/homebrew/bin/ffmpeg', [
  '-v',
  'error',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:duration=3',
  '-ar',
  '48000',
  source,
])
dialog.showOpenDialog = async (_window, options) => ({
  canceled: false,
  filePaths: options.properties.includes('multiSelections') ? [source, source] : [source],
})
const originalHandle = ipcMain.handle.bind(ipcMain)
let captured
ipcMain.handle = (channel, listener) =>
  originalHandle(channel, (event, ...args) => {
    if (channel === 'workflow:generate' && args[0]?.audioTrackId) {
      captured = args[0]
      return { success: false, error: '测试生成失败，旧配音已保留' }
    }
    return listener(event, ...args)
  })
require('../out/main/index.js')

app.whenReady().then(async () => {
  let window
  const evaluate = async (source) => {
    try { return await window.webContents.executeJavaScript(source, true) }
    catch (error) { console.error('EVALUATE_FAILED', source, error); throw error }
  }
  const waitFor = async (source, label) => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await evaluate(`Boolean(${source})`)) return
      await delay(100)
    }
    throw new Error(`Timed out: ${label}`)
  }
  const invoke = async (channel, ...args) => {
    const response = await evaluate(
      `window.electronAPI.invoke(${[channel, ...args].map((value) => JSON.stringify(value)).join(',')})`,
    )
    assert.equal(response.success, true, response.error)
    return response.data
  }
  const click = async (label) => {
    assert.ok(
      await evaluate(
        `(()=>{const item=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===${JSON.stringify(label)}||item.getAttribute('aria-label')===${JSON.stringify(label)});if(!item||item.disabled)return false;item.click();return true})()`,
      ),
      label,
    )
    await delay(100)
  }
  const key = async (keyCode) => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await delay(100)
  }
  const field = (label) =>
    `(()=>{const label=[...document.querySelectorAll('label')].find(item=>item.textContent.trim()===${JSON.stringify(label)});return label&&document.getElementById(label.htmlFor)})()`
  const screenshot = async (name) => {
    await delay(150)
    writeFileSync(join(root, name + '.png'), (await window.webContents.capturePage()).toPNG())
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
    let project = await invoke('workflow:create', '配音参数和单段重生成验证')
    const payloads = {
      brief: { text: '验证单段配音', duration: 10 },
      copy: { text: '第一镜。第二镜。' },
      storyboard: {
        mode: 'template',
        template: 'technical',
        scenes: [
          { id: 'one', title: '第一镜', body: '第一镜说明', layout: 'title' },
          { id: 'two', title: '第二镜', body: '第二镜说明', layout: 'title' },
        ],
      },
      narration: {
        scenes: [
          { id: 'one', text: '第一镜口播。' },
          { id: 'two', text: '第二镜口播。' },
        ],
      },
    }
    for (const stage of ['brief', 'copy', 'storyboard', 'narration']) {
      project = await invoke(
        'workflow:save',
        project.id,
        stage,
        payloads[stage],
        project.revision,
        randomUUID(),
      )
      project = await invoke(
        'workflow:approve',
        project.id,
        stage,
        project.stages[stage].id,
        project.revision,
        randomUUID(),
        '',
      )
    }
    const draft = await invoke('tts:importReference')
    const profile = await invoke('tts:saveProfile', {
      draftId: draft.id,
      name: '验证女声音色',
      transcript: '验证参考录音。',
      start: 0,
      end: 3,
    })
    const job = await invoke('workflow:importAudio', {
      projectId: project.id,
      expectedRevision: project.revision,
      requestId: randomUUID(),
    })
    for (let attempt = 0; attempt < 120; attempt++) {
      project = await invoke('workflow:get', project.id)
      if (project.jobs.find((item) => item.id === job.id)?.state !== 'running') break
      await delay(100)
    }
    assert.equal(project.jobs.find((item) => item.id === job.id)?.state, 'succeeded')
    const secondJob = await invoke('workflow:importAudio', {
      projectId: project.id,
      stage: 'audio',
      expectedRevision: project.revision,
      requestId: randomUUID(),
      executor: 'template',
    })
    for (let attempt = 0; attempt < 120; attempt++) {
      project = await invoke('workflow:get', project.id)
      if (project.jobs.find((item) => item.id === secondJob.id)?.state !== 'running') break
      await delay(100)
    }
    assert.equal(project.jobs.find((item) => item.id === secondJob.id)?.state, 'succeeded')
    assert.equal(project.history.filter((item) => item.stage === 'audio').length, 2)
    await evaluate(
      `(()=>{history.pushState({},'', '/video');dispatchEvent(new PopStateEvent('popstate'))})()`,
    )
    await waitFor('document.querySelector(".workflow-project-card")', 'project list')
    await click('继续创作')
    await waitFor(
      'document.querySelectorAll(".workflow-audio-row").length===2',
      'two playable segments',
    )
    await waitFor('document.querySelector("[data-audio-version-selector]")', 'audio version selector')
    await click('分段配音版本')
    await waitFor(
      '[...document.querySelectorAll("[role=option]")].some(item=>item.textContent.includes("历史 v1"))',
      'historical audio version option',
    )
    await evaluate(
      '[...document.querySelectorAll("[role=option]")].find(item=>item.textContent.includes("历史 v1")).click()',
    )
    await waitFor('document.body.textContent.includes("切换为当前版本")', 'restore audio version action')
    assert.ok(await evaluate('document.body.textContent.includes("生成于")'))
    await click('切换为当前版本')
    await waitFor('document.body.textContent.includes("已切换分段配音版本")', 'restored audio version')
    project = await invoke('workflow:get', project.id)
    assert.ok(await evaluate('document.querySelector(".workflow-audio-row audio").controls'))
    await waitFor('document.querySelector("[data-audio-track-menu]")', 'segment menu')
    await evaluate('document.querySelector("[data-audio-track-menu]").focus()')
    window.focus()
    await key('Space')
    await waitFor('document.querySelector("[role=menuitem]")', 'keyboard opens menu')
    assert.ok(
      await evaluate(
        'document.querySelector("[role=menuitem]").textContent.includes("重新生成此段配音")',
      ),
    )
    await key('Escape')
    assert.ok(await evaluate('document.activeElement.matches("[data-audio-track-menu]")'))
    await evaluate('document.querySelector("details.workflow-notice").open=true')
    await click('配音引擎')
    await evaluate(
      '[...document.querySelectorAll("[role=option]")].find(item=>item.textContent.includes("VoxCPM2")).click()',
    )
    await click('已保存参考音色（冻结版本）')
    await evaluate('document.querySelector("[role=option]").click()')
    await waitFor(`${field('参考尾部停顿（毫秒）')}?.value==='320'`, 'default pause')
    await evaluate(
      `(()=>{const input=${field('参考尾部停顿（毫秒）')};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'500');input.dispatchEvent(new Event('input',{bubbles:true}))})()`,
    )
    await evaluate(
      'window.__unchangedPlayer=document.querySelectorAll(".workflow-audio-row audio")[1]',
    )
    await evaluate('document.querySelector("[data-audio-track-menu]").focus()')
    await key('Space')
    await key('Enter')
    await waitFor(
      'document.body.textContent.includes("测试生成失败，旧配音已保留")',
      'failure keeps audio',
    )
    assert.equal(captured.audioTrackId, project.stages.audio.payload.tracks[0].file.id)
    assert.equal(captured.voice.engine, 'voxcpm2')
    assert.equal(captured.voice.profileId, profile.id)
    assert.equal(captured.voice.options.promptPauseMs, 500)
    assert.ok(
      await evaluate(
        'window.__unchangedPlayer===document.querySelectorAll(".workflow-audio-row audio")[1]',
      ),
    )
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1000)
        await evaluate(
          'document.querySelector("[data-audio-track-menu]").scrollIntoView({block:"center"});document.querySelector("[data-audio-track-menu]").focus()',
        )
        await key('Space')
        await waitFor('document.querySelector("[role=menu]")', 'visible segment menu')
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        await screenshot(`audio-menu-${theme}-${width}`)
        await key('Escape')
      }
      window.setSize(1440, 1100)
      window.webContents.setZoomFactor(2)
      await evaluate(
        'document.querySelector("[data-audio-track-menu]").scrollIntoView({block:"center"});document.querySelector("[data-audio-track-menu]").focus()',
      )
      await key('Space')
      await screenshot(`audio-menu-${theme}-zoom200`)
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
      await key('Escape')
      window.webContents.setZoomFactor(1)
      await evaluate(`${field('参考尾部停顿（毫秒）')}.scrollIntoView({block:'center'})`)
      await screenshot(`audio-pause-${theme}`)
    }
    await click('打开配音工具')
    await waitFor('document.querySelector("[role=dialog]")', 'voiceover dialog')
    await evaluate(
      '[...document.querySelectorAll("label")].find(item=>item.textContent.trim()==="声音克隆").click()',
    )
    await evaluate(
      '[...document.querySelectorAll("summary")].find(item=>item.textContent.trim()==="高级参数").parentElement.open=true',
    )
    await waitFor(
      `(()=>{const label=[...document.querySelectorAll('[role=dialog] label')].find(item=>item.textContent.trim()==='参考尾部停顿（毫秒）');return label&&document.getElementById(label.htmlFor)?.value==='320'})()`,
      'voiceover pause field',
    )
    await screenshot('voiceover-pause-dark')
    console.log(
      'PASS: native players retained, pause setting reaches single-track request, keyboard menu/Escape, failure retention, light/dark, 1440/1024/200%',
    )
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
