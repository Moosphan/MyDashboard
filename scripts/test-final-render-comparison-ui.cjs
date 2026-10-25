const { app, BrowserWindow, shell } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { execFileSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')

const root = mkdtempSync(join(tmpdir(), 'final-render-comparison-ui-'))
const revealed = []
shell.showItemInFolder = (path) => revealed.push(path)
process.env.MYDASHBOARD_USER_DATA = root
console.log('UI artifacts:', root)
require('../out/main/index.js')
app.whenReady().then(async () => {
  let window
  const evaluate = (code) => window.webContents.executeJavaScript(code, true)
  const waitFor = async (code) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(`Boolean(${code})`)) return
      await delay(100)
    }
    throw new Error(`Timed out: ${code}`)
  }
  const screenshot = async (name) => {
    await delay(150)
    writeFileSync(join(root, name), (await window.webContents.capturePage()).toPNG())
  }
  const press = (keyCode) => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode })
  }
  const openComparison = async () => {
    await evaluate(`document.querySelector('[aria-label="查看相较粗剪的变化"]').focus()`)
    press('Space')
    await waitFor('document.querySelector("[role=dialog] [data-final-render-comparison]")')
  }
  const closeComparison = async () => {
    press('Escape')
    await waitFor(
      `!document.querySelector('[role=dialog]') && document.activeElement.getAttribute('aria-label') === '查看相较粗剪的变化'`,
    )
  }
  const checkPageBottom = async (name) => {
    await evaluate(
      'document.querySelector("main").scrollTop = document.querySelector("main").scrollHeight',
    )
    assert.ok(
      await evaluate('document.documentElement.scrollHeight <= innerHeight + 1'),
      'App shell must not create outer document scroll space',
    )
    assert.ok(
      await evaluate(`(() => {
      const main = document.querySelector('main')
      const page = document.querySelector('.workflow-page')
      const footer = document.querySelector('.workflow-bottom')
      return main.scrollHeight <= page.offsetHeight + 1 &&
        main.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom <= parseFloat(getComputedStyle(page).paddingBottom) + 1
    })()`),
      'Page scroll must end after the workflow footer and normal page padding',
    )
    await screenshot(name)
  }
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      window = BrowserWindow.getAllWindows().find((item) =>
        item.webContents.getURL().startsWith('file:'),
      )
      if (window && !window.webContents.isLoadingMainFrame()) break
      await delay(100)
    }
    assert.ok(window)
    await waitFor('window.electronAPI && document.querySelector("nav")')
    require('tsx/cjs')
    const Database = require('better-sqlite3')
    const { randomUUID } = require('node:crypto')
    const {
      VideoWorkflowRepository,
    } = require('../src/main/database/repositories/video-workflow-repository')
    const { WorkflowFiles } = require('../src/main/services/video-workflow/files')
    const database = new Database(join(root, 'database/dashboard.db'))
    let state
    try {
      const repository = new VideoWorkflowRepository(database)
      const files = new WorkflowFiles(root, repository)
      state = repository.create('正片差异验证')
      const scenes = Array.from({ length: 16 }, (_, index) => ({
        id: `scene-${index + 1}`,
        title: `演示 ${index + 1}`,
        body: '原内容',
        layout: 'title',
      }))
      for (const [stage, payload] of [
        ['brief', { text: '成片输出对比', duration: 10 }],
        ['copy', { text: '保留内容' }],
        [
          'storyboard',
          {
            mode: 'template',
            template: 'technical',
            scenes,
          },
        ],
        ['narration', { scenes: scenes.map((scene) => ({ id: scene.id, text: '原口播' })) }],
      ]) {
        state = repository.save(state.id, stage, payload, state.revision, randomUUID())
        state = repository.approve(
          state.id,
          stage,
          state.stages[stage].id,
          state.revision,
          randomUUID(),
        )
      }
      const mediaPath = join(root, 'fixture.mp4')
      execFileSync(
        'ffmpeg',
        [
          '-nostdin',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=navy:s=1920x1080:r=30:d=1',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          mediaPath,
        ],
        { stdio: 'ignore' },
      )
      const file = await files.import(state.id, mediaPath)
      const audio = await files.write(state.id, Buffer.alloc(44), '.wav')
      const subtitles = await files.write(
        state.id,
        '1\n00:00:00,000 --> 00:00:01,000\n原口播\n',
        '.srt',
      )
      const coverPath = join(root, 'cover.png')
      execFileSync('ffmpeg', ['-nostdin', '-y', '-i', mediaPath, '-frames:v', '1', coverPath], {
        stdio: 'ignore',
      })
      const cover = await files.import(state.id, coverPath)
      const html = await files.write(state.id, '<h1>演示</h1>', '.html')
      state = repository.save(
        state.id,
        'audio',
        {
          file: audio,
          subtitles,
          duration: 1,
          tracks: scenes.map((scene) => ({
            sceneId: scene.id,
            file: audio,
            text: '原口播',
            duration: 1 / scenes.length,
          })),
        },
        state.revision,
        randomUUID(),
      )
      state = repository.approve(
        state.id,
        'audio',
        state.stages.audio.id,
        state.revision,
        randomUUID(),
      )
      const payload = {
        file,
        cover,
        duration: 1,
        width: 1920,
        height: 1080,
        compositionFiles: [html],
        compositionNames: ['index.html'],
        manifestHash: html.sha256,
        checks: JSON.stringify({ ok: true, samples: 9, version: '0.8.181' }),
        sourceStoryboard: state.stages.storyboard.id,
        sourceAudio: state.stages.audio.id,
        sourceNarration: state.stages.narration.id,
      }
      state = repository.save(
        state.id,
        'roughcut',
        {
          ...payload,
          file: { ...file, sha256: 'a'.repeat(64) },
          renderProfile: { quality: 'looks', fps: 30 },
        },
        state.revision,
        randomUUID(),
      )
      state = repository.approve(
        state.id,
        'roughcut',
        state.stages.roughcut.id,
        state.revision,
        randomUUID(),
      )
      state = repository.save(state.id, 'render', payload, state.revision, randomUUID())
      state = repository.save(
        state.id,
        'render',
        {
          ...payload,
          sourceRoughcut: state.stages.roughcut.id,
          renderProfile: { quality: 'delivery', fps: 30 },
        },
        state.revision,
        randomUUID(),
      )
    } finally {
      database.close()
    }
    await evaluate(
      "window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))",
    )
    await waitFor('document.querySelector(".workflow-project-card")')
    await evaluate(
      '[...document.querySelectorAll("button")].find(item=>item.textContent.trim()==="继续创作").click()',
    )
    await waitFor('document.querySelector(".workflow-bottom")')
    assert.ok(
      await evaluate(`!!document.querySelector('[aria-label="打开视频所在文件夹"]')`),
      'Final video must have a file location action',
    )
    await evaluate(`document.querySelector('[aria-label="打开视频所在文件夹"]').click()`)
    for (let attempt = 0; attempt < 50 && !revealed.length; attempt++) await delay(100)
    assert.equal(revealed[0], join(root, state.stages.render.payload.file.path))
    await checkPageBottom('page-bottom.png')
    await waitFor(`document.querySelector('[aria-label="查看相较粗剪的变化"]')`)
    assert.equal(await evaluate('document.querySelector("[data-final-render-comparison]")'), null)
    await openComparison()
    press('Tab')
    assert.ok(
      await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
    )
    press('Tab')
    assert.ok(
      await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
    )
    assert.ok(
      await evaluate(
        'document.querySelector("[data-final-render-comparison]").textContent.includes("粗剪 v1")',
      ),
    )
    assert.ok(
      await evaluate(
        'document.querySelector("[data-render-quality-summary]").textContent.includes("交付编码")',
      ),
    )
    assert.ok(
      await evaluate(
        'document.querySelector("[data-final-render-comparison]").textContent.includes("画面、动画、配音和字幕保持一致")',
      ),
    )
    window.focus()
    window.setMinimumSize(720, 640)
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1000)
        await evaluate('document.querySelector(".workflow-dialog-body").scrollTop = 0')
        await screenshot(`comparison-${theme}-${width}.png`)
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        await closeComparison()
        await checkPageBottom(`page-bottom-${theme}-${width}.png`)
        await openComparison()
      }
    }
    window.webContents.setZoomFactor(2)
    await evaluate('document.querySelector(".workflow-dialog-body").scrollTop = 0')
    await screenshot('comparison-200percent.png')
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    await closeComparison()
    await checkPageBottom('page-bottom-200percent.png')
    window.webContents.setZoomFactor(1)
    window.setSize(1440, 1000)
    await evaluate(
      '[...document.querySelectorAll("button")].find(item=>item.textContent.trim()==="审核通过此版本").focus()',
    )
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
    await waitFor('document.querySelector("[role=dialog]")')
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await waitFor(
      '!document.querySelector("[role=dialog]") && document.activeElement.textContent.includes("审核通过此版本")',
    )
    await evaluate(`document.querySelector('[aria-label="预览版本（审核针对当前版本）"]').focus()`)
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
    await waitFor('document.querySelector("[role=option]")')
    await evaluate(
      '[...document.querySelectorAll("[role=option]")].find(item=>item.textContent.includes("历史 v1")).click()',
    )
    await waitFor('!document.querySelector("[role=option]")')
    await openComparison()
    await waitFor(
      'document.querySelector("[data-render-quality-summary]")?.textContent.includes("历史版本未记录编码参数")',
    )
    await screenshot('comparison-legacy.png')
    await closeComparison()
    await checkPageBottom('page-bottom-after-dialog.png')
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [
        { name: 'forced-colors', value: 'active' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    })
    await openComparison()
    assert.ok(
      await evaluate(
        `matchMedia('(forced-colors: active)').matches && matchMedia('(prefers-reduced-motion: reduce)').matches`,
      ),
    )
    await screenshot('comparison-high-contrast-reduced-motion.png')
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab', modifiers: ['shift'] })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab', modifiers: ['shift'] })
    assert.ok(
      await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
    )
    await evaluate(`document.querySelector('[aria-label="关闭相较粗剪的变化"]').focus()`)
    press('Return')
    window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
    await waitFor('!document.querySelector("[role=dialog]")')
    assert.ok(
      await evaluate(`document.activeElement.getAttribute('aria-label') === '查看相较粗剪的变化'`),
    )
    await checkPageBottom('page-bottom-high-contrast.png')
    window.webContents.debugger.detach()
    console.log(
      'PASS: compact comparison dialog, source roughcut, legacy parameters, final video file location, keyboard focus trap and return, themes, viewports, zoom and no bottom overflow with 16 scenes',
    )
    app.quit()
  } catch (error) {
    console.error(error)
    if (window) await screenshot('failure.png')
    app.exit(1)
  }
})
