const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync, readFileSync, copyFileSync } = require('node:fs')
const { randomUUID } = require('node:crypto')
const Database = require('better-sqlite3')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { spawnSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')

const root = mkdtempSync(join(tmpdir(), 'video-music-ui-'))
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
const initial = JSON.parse(readFileSync(join(root, 'seed-project.json'), 'utf8'))
const musicPath = join(root, '本地配乐.wav')
const audio = spawnSync('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-f',
  'lavfi',
  '-i',
  'anullsrc=r=44100:cl=mono',
  '-t',
  '15',
  musicPath,
])
assert.equal(audio.status, 0, audio.stderr.toString())
process.env.MYDASHBOARD_USER_DATA = root
const opened = []
shell.openExternal = async (url) => {
  opened.push(url)
}
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [musicPath] })
require('../out/main/index.js')

const timeout = setTimeout(() => {
  console.error('Music UI timed out')
  app.exit(1)
}, 90000)
app.whenReady().then(async () => {
  let window
  const evaluate = (source) => window.webContents.executeJavaScript(source, true)
  const waitFor = async (source, label) => {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      if (await evaluate(`Boolean(${source})`)) return
      await delay(100)
    }
    throw new Error(`Timed out: ${label}`)
  }
  const click = async (name) => {
    assert.ok(
      await evaluate(`(() => {
      const button=[...document.querySelectorAll('button')].find(item =>
        (item.textContent.trim()===${JSON.stringify(name)} || item.getAttribute('aria-label')===${JSON.stringify(name)}) && !item.disabled)
      if (!button) return false
      button.click(); return true
    })()`),
      name,
    )
    await delay(100)
  }
  const key = async (keyCode) => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode })
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
    await waitFor('document.querySelector(".workflow-project-row")', 'projects')
    await click('继续创作')
    await waitFor('document.querySelectorAll(".workflow-step-button").length===8', 'stages')
    await evaluate('document.querySelectorAll(".workflow-step-button")[6].click()')
    await waitFor('document.querySelector("[data-music-summary]")', 'compact music summary')
    assert.equal(await evaluate('Boolean(document.getElementById("workflow-music-volume"))'), false)
    assert.equal(
      await evaluate('Boolean(document.querySelector("[data-music-summary] audio"))'),
      false,
    )
    const before = await evaluate(
      `window.electronAPI.invoke('workflow:get',${JSON.stringify(initial.id)})`,
    )
    await click('管理配乐')
    await waitFor(
      'document.querySelector("[role=dialog]")?.textContent.includes("管理配乐")',
      'music dialog',
    )
    await click('爱给网')
    await click('100Audio')
    assert.deepEqual(opened, ['https://www.aigei.com/music/', 'https://100audio.com/'])
    assert.equal(await evaluate('document.querySelector("[data-music-openverse]").open'), false)
    await click('选择本地音频')
    await waitFor('document.getElementById("workflow-music-volume")', 'imported music controls')
    await evaluate(`(() => {
      const field=document.getElementById('workflow-music-volume')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'40')
      field.dispatchEvent(new Event('input',{bubbles:true}))
      field.focus()
    })()`)
    await key('Right')
    assert.equal(await evaluate('document.getElementById("workflow-music-volume").value'), '41')
    await key('Escape')
    await waitFor('!document.querySelector("[role=dialog]")', 'Escape closes')
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), '管理配乐')
    assert.equal(await evaluate('Boolean(document.getElementById("workflow-music-volume"))'), false)
    assert.ok(
      await evaluate(
        'document.querySelector("[data-music-summary]").textContent.includes("尚未应用")',
      ),
    )
    await click('管理配乐')
    assert.equal(await evaluate('document.getElementById("workflow-music-volume").value'), '41')
    assert.ok(
      await evaluate(
        'document.querySelector("[role=dialog]").textContent.includes("本地配乐.wav")',
      ),
    )
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1000)
        await delay(150)
        assert.ok(
          await evaluate(
            'document.querySelector("[role=dialog]").scrollWidth<=document.querySelector("[role=dialog]").clientWidth+1',
          ),
        )
        writeFileSync(
          join(root, `music-${theme}-${width}.png`),
          (await window.webContents.capturePage()).toPNG(),
        )
      }
      window.webContents.setZoomFactor(2)
      await delay(150)
      assert.ok(
        await evaluate(
          'document.querySelector("[role=dialog]").getBoundingClientRect().right<=innerWidth+1',
        ),
      )
      writeFileSync(
        join(root, `music-${theme}-200percent.png`),
        (await window.webContents.capturePage()).toPNG(),
      )
      window.webContents.setZoomFactor(1)
    }
    await evaluate('document.querySelector("[role=dialog] button").focus()')
    for (let index = 0; index < 18; index += 1) {
      await key('Tab')
      assert.ok(await evaluate('Boolean(document.activeElement.closest("[role=dialog]"))'))
    }
    await click('关闭管理配乐')
    await evaluate('document.querySelector("[aria-label=选择成片配乐]").focus()')
    await key('Space')
    await waitFor('document.querySelector("[role=listbox]")', 'music selector')
    await key('Home')
    await key('Enter')
    await waitFor('!document.querySelector("[role=listbox]")', 'music selected')
    assert.equal(
      await evaluate('Boolean(document.querySelector("[data-music-summary] [role=status]"))'),
      false,
    )
    await key('Space')
    await waitFor('document.querySelector("[role=listbox]")', 'switch music')
    await key('End')
    await key('Enter')
    await waitFor(
      'Boolean(document.querySelector("[data-music-summary] [role=status]"))',
      'switched to imported music',
    )
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`)
      window.setSize(1440, 1100)
      await evaluate(
        'document.querySelector("[data-music-summary]").scrollIntoView({block:"center"})',
      )
      await delay(100)
      assert.ok(
        await evaluate(
          'document.querySelector("[data-music-summary]").scrollWidth<=document.querySelector("[data-music-summary]").clientWidth+1',
        ),
      )
      writeFileSync(
        join(root, `music-summary-${theme}.png`),
        (await window.webContents.capturePage()).toPNG(),
      )
    }
    const after = await evaluate(
      `window.electronAPI.invoke('workflow:get',${JSON.stringify(initial.id)})`,
    )
    assert.equal(
      after.data.jobs.length,
      before.data.jobs.length,
      'Import, editing and closing do not render',
    )
    assert.equal(after.data.stages.render.id, before.data.stages.render.id)
    const fixture = new Database(join(root, 'database/dashboard.db'))
    const audioFile = fixture
      .prepare(
        "SELECT id,path,sha256,size,mime FROM video_workflow_files WHERE mime='audio/wav' LIMIT 1",
      )
      .get()
    const videoFile = { ...initial.stages.render.payload.file, id: randomUUID() }
    videoFile.path = videoFile.path.replace(/[^/]+$/, `${videoFile.id}.mp4`)
    copyFileSync(join(root, initial.stages.render.payload.file.path), join(root, videoFile.path))
    fixture
      .prepare(
        'INSERT INTO video_workflow_files(id,project_id,path,sha256,size,mime) VALUES(?,?,?,?,?,?)',
      )
      .run(
        videoFile.id,
        initial.id,
        videoFile.path,
        videoFile.sha256,
        videoFile.size,
        videoFile.mime,
      )
    const saved = {
      ...initial.stages.render.payload,
      file: videoFile,
      music: {
        file: audioFile,
        title: '已应用A',
        source: 'local',
        start: 0,
        duration: 10,
        volume: 0.25,
        playbackRate: 1,
      },
    }
    const original = fixture
      .prepare('SELECT * FROM video_workflow_revisions WHERE id=?')
      .get(initial.stages.render.id)
    const next = { ...original, id: randomUUID(), version: 2, payload: JSON.stringify(saved) }
    fixture
      .prepare(
        `INSERT INTO video_workflow_revisions(${Object.keys(next).join(',')}) VALUES(${Object.keys(
          next,
        )
          .map(() => '?')
          .join(',')})`,
      )
      .run(...Object.values(next))
    fixture.close()
    window.webContents.send('workflow:updated', initial.id)
    await waitFor(
      'document.querySelector("[data-music-summary]").textContent.includes("已应用A")',
      'applied music fixture',
    )
    await click('管理配乐')
    await evaluate(`(() => {
      const field=document.getElementById('workflow-music-volume')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'50')
      field.dispatchEvent(new Event('input',{bubbles:true}))
    })()`)
    await click('关闭管理配乐')
    await evaluate('document.querySelector("[aria-label=选择成片配乐]").focus()')
    await key('Space')
    await key('Home')
    await key('Enter')
    await key('Space')
    await key('End')
    await key('Enter')
    await click('管理配乐')
    assert.equal(
      await evaluate('document.getElementById("workflow-music-volume").value'),
      '50',
      'Switching away and back preserves applied-track edits',
    )
    window.webContents.send('workflow:updated', initial.id)
    await delay(200)
    assert.equal(
      await evaluate('document.getElementById("workflow-music-volume").value'),
      '50',
      'Same-video refresh preserves edits',
    )
    ipcMain.removeHandler('workflow:searchMusic')
    ipcMain.handle('workflow:searchMusic', () => ({
      success: true,
      data: [
        {
          id: 'delayed',
          title: '延迟下载曲目',
          author: 'fixture',
          license: 'CC0',
          sourceUrl: 'https://example.com/music',
          downloadUrl: 'https://example.com/music.wav',
        },
      ],
    }))
    let completeDownload
    ipcMain.removeHandler('workflow:downloadMusic')
    ipcMain.handle(
      'workflow:downloadMusic',
      () =>
        new Promise((resolve) => {
          completeDownload = resolve
        }),
    )
    await evaluate(`(() => {
      document.querySelector('[data-music-openverse]').open=true
      const field=[...document.querySelectorAll('[role=dialog] input')].find(item=>item.type==='text')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'test')
      field.dispatchEvent(new Event('input',{bubbles:true}))
    })()`)
    await click('搜索')
    await waitFor('document.querySelector("[aria-label=在线配乐搜索结果]")', 'search fixture')
    await click('下载并使用')
    await click('关闭管理配乐')
    await click('预览版本（审核针对当前版本）')
    await key('End')
    await key('Enter')
    await waitFor(
      'document.querySelector("[data-music-summary]").textContent.includes("配乐 · 未添加")',
      'historical version',
    )
    completeDownload({
      success: true,
      data: {
        file: audioFile,
        title: '延迟下载曲目',
        sourceUrl: 'https://example.com/music',
        license: 'CC0',
        author: 'fixture',
      },
    })
    await delay(200)
    await click('管理配乐')
    assert.equal(
      await evaluate('Boolean(document.querySelector("[role=dialog] audio"))'),
      false,
      'Late download must not replace historical preview selection',
    )
    console.log(
      'PASS: compact music summary, dialog import, draft persistence, keyboard focus, themes, widths and zoom',
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
