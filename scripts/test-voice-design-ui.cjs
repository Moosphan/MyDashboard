const { app, BrowserWindow, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const Database = require('better-sqlite3')

const root = mkdtempSync(join(tmpdir(), 'voice-design-ui-'))
process.env.MYDASHBOARD_USER_DATA = root
app.setAppPath(join(__dirname, '..'))
let captured
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) =>
  originalHandle(channel, async (event, ...args) => {
    if (channel === 'tts:createJob') {
      captured = args[0]
      return { success: false, error: '测试启动失败，输入应保留' }
    }
    if (channel === 'tts:getRuntime')
      return {
        success: true,
        data: {
          supported: true,
          checking: false,
          config: {},
          engines: {
            voxcpm2: { ready: true, reason: '' },
            'qwen3-tts': { ready: false, reason: '未配置' },
          },
          versions: {},
        },
      }
    return listener(event, ...args)
  })
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
      await evaluate(
        '[...document.querySelectorAll("[role=alert],.voiceover-dialog")].map(item=>({state:item.getAttribute("data-state"),text:item.textContent.slice(0,120),visible:item.getBoundingClientRect().width}))',
      ),
    )
    throw new Error(`Timed out: ${label}`)
  }
  const click = async (text) => {
    assert.ok(
      await evaluate(
        `(()=>{const button=[...document.querySelectorAll('button')].find(item=>item.textContent.trim().endsWith(${JSON.stringify(text)})&&!item.disabled);if(!button)return false;button.focus();button.click();return true})()`,
      ),
      text,
    )
    await delay(120)
  }
  const fill = async (label, value) => {
    assert.ok(
      await evaluate(
        `(()=>{const label=[...document.querySelectorAll('label')].find(item=>item.textContent.trim()===${JSON.stringify(label)});const field=label&&document.getElementById(label.htmlFor);if(!field)return false;const prototype=field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));return true})()`,
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
    await waitFor('document.querySelector("nav")', 'app')
    const database = new Database(join(root, 'database', 'dashboard.db'))
    for (const state of ['failed', 'cancelled', 'interrupted']) {
      const request = {
        clientRequestId: `ui-${state}`,
        engine: 'edge',
        text: `可删除的${state}任务`,
        voiceId: 'zh-CN-XiaoxiaoNeural',
        options: {},
      }
      database
        .prepare(
          'INSERT INTO voice_jobs (id,client_request_id,request_json,state,phase,attempt_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(
          `ui-${state}`,
          request.clientRequestId,
          JSON.stringify(request),
          state,
          state,
          `attempt-${state}`,
          new Date().toISOString(),
          new Date().toISOString(),
        )
    }
    database.close()
    await evaluate(
      "window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))",
    )
    await waitFor(
      '[...document.querySelectorAll("button")].some(item=>item.textContent.includes("AI 配音"))',
      'video page',
    )
    await click('AI 配音')
    await waitFor('document.querySelector("[role=dialog].voiceover-dialog")', 'dialog')
    await waitFor(
      'document.querySelectorAll("[data-delete-voice-job]").length===3',
      'terminal delete buttons',
    )
    const deleteFirst = () => evaluate('document.querySelector("[data-delete-voice-job]").click()')
    await deleteFirst()
    await waitFor(
      '[...document.querySelectorAll("[role=dialog]")].some(item=>item.textContent.includes("删除任务记录？"))',
      'delete confirmation',
    )
    await click('保留记录')
    assert.equal((await evaluate("window.electronAPI.invoke('tts:listJobs')")).data.length, 3)
    for (let index = 0; index < 3; index++) {
      await deleteFirst()
      await click('确认删除')
      await waitFor(
        `document.querySelectorAll('[data-delete-voice-job]').length===${2 - index}`,
        'deleted job gone',
      )
    }
    assert.equal((await evaluate("window.electronAPI.invoke('tts:listJobs')")).data.length, 0)
    assert.ok(
      await evaluate(
        `(()=>{const radio=document.querySelector('input[value="design"]');if(!radio)return false;radio.click();return true})()`,
      ),
      'Voice design mode exists',
    )
    await waitFor('document.querySelector("[data-voice-design]")', 'design controls')
    await waitFor(
      'document.querySelector("[data-design-description]")?.value.length>0',
      'preset loaded',
    )
    await click('试听内置声音')
    await waitFor(
      'document.querySelector(".voiceover-dialog audio")?.src.startsWith("data:audio/wav")',
      'real sample loaded',
    )
    await click('使用内置音色')
    await waitFor(
      'document.querySelector("[data-voice-design]")?.textContent.includes("已加入我的音色")',
      'builtin voice available for workflow',
    )
    const builtinProfiles = await evaluate("window.electronAPI.invoke('tts:listProfiles')")
    assert.equal(builtinProfiles.data.length, 1)
    assert.equal(builtinProfiles.data[0].name, '砚声 · 历史旁白')
    await click('使用内置音色')
    await delay(200)
    assert.equal((await evaluate("window.electronAPI.invoke('tts:listProfiles')")).data.length, 1)
    await evaluate(
      "[...document.querySelectorAll('summary')].find(item=>item.textContent==='细化声音特征').click()",
    )
    const choose = async (label, option) => {
      await evaluate(
        `document.querySelector('[role=combobox][aria-label=${JSON.stringify(label)}]').focus()`,
      )
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
      await waitFor('document.querySelector("[role=listbox]")', `select ${label}`)
      await evaluate(
        `[...document.querySelectorAll('[role=option]')].find(item=>item.textContent===${JSON.stringify(option)}).focus()`,
      )
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
      await waitFor('!document.querySelector("[role=listbox]")', `selected ${option}`)
    }
    await choose('声线配方', '少女 · 动漫软音')
    const softDescription = await evaluate(
      'document.querySelector("[data-design-description]").value',
    )
    assert.match(softDescription, /少女感.*软糯.*气声/)
    await waitFor(
      '!document.querySelector(".voiceover-dialog audio")?.getAttribute("src")',
      'original preview cleared after traits change',
    )
    assert.ok(
      await evaluate(
        "[...document.querySelectorAll('button')].find(item=>item.textContent==='试听内置声音').disabled",
      ),
    )
    assert.ok(
      !(await evaluate(
        "[...document.querySelectorAll('button')].some(item=>item.textContent==='使用内置音色')",
      )),
    )
    await choose('声音年龄感', '年长')
    const editedDescription = await evaluate(
      'document.querySelector("[data-design-description]").value',
    )
    assert.match(editedDescription, /年长感/)
    assert.ok(!editedDescription.includes('少女感'))
    await choose('情绪组合', '兴奋雀跃')
    assert.match(
      await evaluate('document.querySelector("[data-design-description]").value'),
      /强烈的愉悦/,
    )
    await click('换个声音（新种子）')
    await fill('造声实际语速（倍）', '0.8')
    await click('生成试听样本')
    assert.equal(captured.options.designTempo, 0.8)
    assert.notEqual(captured.options.seed, 1042)
    assert.match(captured.voiceDesign, /年长感/)
    await fill('声音描述', '成熟温暖的男性，中低音，吐字清晰，情绪沉稳。')
    await fill('声音方案名称', '我的纪录片旁白')
    await click('保存声音方案')
    await waitFor(
      'document.querySelector("[data-voice-design]")?.textContent.includes("方案已保存")',
      'plan saved',
    )
    const plans = await evaluate("window.electronAPI.invoke('tts:listVoiceDesigns')")
    assert.ok(plans.data.some((item) => item.name === '我的纪录片旁白'))
    await click('生成试听样本')
    assert.equal(captured.engine, 'voxcpm2')
    assert.equal(captured.voiceDesign, '成熟温暖的男性，中低音，吐字清晰，情绪沉稳。')
    assert.equal(captured.profileId, undefined)
    assert.equal(captured.options.denoise, false)
    await waitFor(
      'document.querySelector("[role=alert]")?.textContent.includes("测试启动失败")',
      'error visible',
    )
    assert.equal(
      await evaluate('document.querySelector("[data-design-description]").value'),
      captured.voiceDesign,
    )
    await fill('配音文案', '这是一段全新设计的声音。')
    await click('生成配音')
    assert.equal(captured.text, '这是一段全新设计的声音。')
    await choose('声线配方', '少女 · 动漫软音')
    await evaluate("document.querySelector('input[type=range]').focus()")
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' })
    await waitFor(
      'document.querySelector("[data-design-description]").value.includes("明显的愉悦")',
      'keyboard emotion update',
    )
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1000)
        await delay(150)
        writeFileSync(
          join(root, `${theme}-${width}.png`),
          (await window.webContents.capturePage()).toPNG(),
        )
      }
      window.webContents.setZoomFactor(2)
      await delay(150)
      writeFileSync(
        join(root, `${theme}-zoom.png`),
        (await window.webContents.capturePage()).toPNG(),
      )
      assert.ok(
        await evaluate(
          'document.querySelector("[role=dialog].voiceover-dialog").getBoundingClientRect().right<=innerWidth+1',
        ),
      )
      window.webContents.setZoomFactor(1)
    }
    window.focus()
    window.webContents.focus()
    await evaluate('document.querySelector("[data-design-description]").focus()')
    await delay(300)
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await waitFor('!document.querySelector("[role=dialog].voiceover-dialog")', 'Escape')
    assert.match(await evaluate('document.activeElement.textContent'), /AI 配音/)
    console.log(
      'PASS terminal deletion and confirmation, automatic traits, anime soft recipe, emotion keyboard control, seed and tempo IPC, real builtin preview, persisted plan, no reference request, failure retention, themes, viewports, zoom and Escape focus',
      root,
    )
  } catch (error) {
    console.error(error)
    app.exitCode = 1
  } finally {
    clearTimeout(timeout)
    app.exit(app.exitCode || 0)
  }
})
