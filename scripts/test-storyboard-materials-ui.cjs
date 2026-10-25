const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')

const root = mkdtempSync(join(tmpdir(), 'storyboard-materials-ui-'))
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
  const key = (keyCode) => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    if (keyCode === 'Enter') window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode })
  }
  const screenshot = async (name) => {
    await delay(150)
    writeFileSync(join(root, name), (await window.webContents.capturePage()).toPNG())
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
    window.setMinimumSize(720, 640)
    window.setSize(1440, 1000)
    await waitFor('window.electronAPI && document.querySelector("nav")')
    const before = await evaluate(`(async () => {
      const call = async (name,...args) => {
        const result = await window.electronAPI.invoke('workflow:'+name,...args);
        if (!result.success) throw new Error(result.error);
        return result.data;
      };
      let project = await call('create','素材降级验证');
      for (const [stage,payload] of [['brief',{text:'验证素材缺口',duration:10}],['copy',{text:'保留已有原创分镜'}]]) {
        project = await call('save',project.id,stage,payload,project.revision,crypto.randomUUID());
        project = await call('approve',project.id,stage,project.stages[stage].id,project.revision,crypto.randomUUID(),'');
      }
      const payload = { mode:'agent',template:'technical',motionPolicy:{enabled:true,excludedSceneIds:[]},scenes:[1,2,3].map(index=>({
        id:'scene-'+index,title:'分镜 '+index,body:'保留原画面',layout:'title',
        html:'<style>body{background:#171714;color:#eee4d2}h1{font-size:100px}p{font-size:36px}</style><h1>分镜 '+index+'</h1><p>原创示意图 · 非实拍</p>',
        motion:{summary:'现有标题动画',blockers:['真实文物照片尚未取得；当前采用已标注的原创示意图'],effects:[{selector:'h1',start:0,duration:0.4,keyframes:[{opacity:0},{opacity:1}]}]}
      }))};
      project = await call('save',project.id,'storyboard',payload,project.revision,crypto.randomUUID());
      return project;
    })()`)
    await evaluate(
      "window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))",
    )
    await waitFor('document.querySelector(".workflow-project-card")')
    await evaluate(
      '[...document.querySelectorAll("button")].find(item=>item.textContent.trim()==="继续创作").click()',
    )
    await waitFor('document.querySelector("[data-accept-illustration]")')
    assert.equal(
      await evaluate('document.querySelectorAll("[data-accept-illustration]").length'),
      1,
    )
    assert.equal(
      await evaluate('document.querySelector("[data-storyboard-review-blocked]").textContent'),
      '因 3 处素材缺口无法审核',
    )
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll("button")].find(item=>item.textContent.trim()==="审核通过此版本").disabled',
      ),
    )
    window.focus()
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1000)
        await evaluate(
          'document.querySelector("[data-accept-illustration]").scrollIntoView({block:"center"})',
        )
        await screenshot(`materials-${theme}-${width}.png`)
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
      }
      await evaluate('document.querySelector("[data-accept-illustration]").focus()')
      key('Space')
      await waitFor('document.querySelector("[role=dialog]")')
      assert.equal(
        await evaluate('document.querySelectorAll("[data-confirm-illustration]").length'),
        1,
      )
      await screenshot(`confirm-${theme}.png`)
      key('Tab')
      assert.ok(
        await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
      )
      key('Escape')
      await waitFor(
        '!document.querySelector("[role=dialog]") && document.activeElement.matches("[data-accept-illustration]")',
      )
    }
    window.webContents.setZoomFactor(2)
    await evaluate(
      'document.querySelector("[data-accept-illustration]").focus();document.activeElement.scrollIntoView({block:"center"})',
    )
    await screenshot('materials-200percent.png')
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    key('Space')
    await waitFor('document.querySelector("[data-confirm-illustration]")')
    await evaluate(
      'document.querySelector("[data-confirm-illustration]").focus();document.activeElement.scrollIntoView({block:"center"})',
    )
    await screenshot('confirm-200percent.png')
    key('Enter')
    await waitFor(
      '!document.querySelector("[role=dialog]") && document.querySelectorAll("[data-illustration-accepted]").length===3',
    )
    assert.ok(
      await evaluate(
        '!document.querySelector("[data-storyboard-review-blocked]") && ![...document.querySelectorAll("button")].find(item=>item.textContent.trim()==="审核通过此版本").disabled',
      ),
    )
    const after = await evaluate(
      `window.electronAPI.invoke('workflow:get',${JSON.stringify(before.id)}).then(result=>result.data)`,
    )
    assert.equal(after.stages.storyboard.status, 'review')
    assert.equal(after.stages.storyboard.version, before.stages.storyboard.version + 1)
    assert.deepEqual(
      after.stages.storyboard.payload.scenes.map(({ materialFallback, ...scene }) => scene),
      before.stages.storyboard.payload.scenes,
    )
    assert.equal(
      after.jobs.filter((job) => job.operation?.action === 'accept-illustration').length,
      1,
    )
    window.webContents.setZoomFactor(1)
    window.setSize(1440, 1000)
    await screenshot('materials-accepted.png')
    console.log(
      'PASS: one batch button, exact count beside review, cancel and focus return, keyboard confirmation, themes, 1440/1024/200%, one review revision and unchanged HTML/MG',
    )
    app.quit()
  } catch (error) {
    console.error(error)
    if (window) await screenshot('failure.png')
    app.exit(1)
  }
})
