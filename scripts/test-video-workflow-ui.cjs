const { app, BrowserWindow, clipboard } = require('electron')
const assert = require('node:assert/strict')
const {
  cpSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  chmodSync,
  readFileSync,
} = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')

const root = mkdtempSync(join(tmpdir(), 'video-workflow-ui-'))
process.env.MYDASHBOARD_USER_DATA = root
if (process.env.WORKFLOW_SEED_DIR) {
  mkdirSync(join(root, 'database'), { recursive: true })
  copyFileSync(
    join(process.env.WORKFLOW_SEED_DIR, 'workflow.db'),
    join(root, 'database/dashboard.db'),
  )
  cpSync(join(process.env.WORKFLOW_SEED_DIR, 'media'), join(root, 'media'), { recursive: true })
  if (process.env.WORKFLOW_RESTORE_APPROVED_SEED === '1') {
    const Database = require('better-sqlite3')
    const fixture = new Database(join(root, 'database/dashboard.db'))
    const originals = fixture
      .prepare(
        'SELECT project_id FROM video_workflow_revisions WHERE version=1 AND approved_at IS NOT NULL GROUP BY project_id HAVING count(*)=8',
      )
      .all()
    assert.equal(originals.length, 1, 'Expected the eight approved smoke revisions')
    fixture.transaction(() => {
      fixture
        .prepare(
          "DELETE FROM video_workflow_revisions WHERE project_id=? AND stage='brief' AND version>1 AND approved_at IS NULL",
        )
        .run(originals[0].project_id)
      fixture
        .prepare(
          "UPDATE video_workflow_revisions SET status='approved' WHERE project_id=? AND version=1 AND approved_at IS NOT NULL",
        )
        .run(originals[0].project_id)
    })()
    fixture.close()
    console.log(
      'Screenshot fixture: restored the smoke history before its invalidation test, in the temporary profile only',
    )
  }
}
console.log('UI artifacts:', root)
require('../out/main/index.js')

app.whenReady().then(async () => {
  let window
  const evaluate = async (source) => {
    try {
      return await window.webContents.executeJavaScript(source, true)
    } catch (error) {
      console.error('Failed UI assertion:', source)
      throw error
    }
  }
  const waitFor = async (source, label) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(`Boolean(${source})`)) return
      await delay(100)
    }
    throw new Error(`Timed out: ${label}`)
  }
  const click = async (text) => {
    const found = await evaluate(
      `(()=>{const element=[...document.querySelectorAll('button')].find(item=>(item.textContent.trim()===${JSON.stringify(text)}||item.getAttribute('aria-label')===${JSON.stringify(text)})&&!item.disabled);if(!element)return false;element.click();return true})()`,
    )
    assert.ok(found, `Missing enabled button: ${text}`)
    await delay(100)
  }
  const fill = async (label, value) => {
    assert.ok(
      await evaluate(
        `(()=>{const label=[...document.querySelectorAll('label')].find(item=>item.textContent.trim()===${JSON.stringify(label)});const field=label&&document.getElementById(label.htmlFor);if(!field)return false;const prototype=field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));return true})()`,
      ),
      `Missing input: ${label}`,
    )
    await delay(100)
  }
  const toggleAudio = async (index) => {
    const point = await evaluate(
      `(()=>{const audio=document.querySelectorAll('.workflow-audio-row audio')[${index}];audio.scrollIntoView({block:'center'});const bounds=audio.getBoundingClientRect();return {x:Math.round(bounds.left+30),y:Math.round(bounds.top+bounds.height/2)}})()`,
    )
    window.webContents.sendInputEvent({
      type: 'mouseDown',
      ...point,
      button: 'left',
      clickCount: 1,
    })
    window.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
    await delay(100)
  }
  const screenshot = async (name) => {
    await delay(150)
    writeFileSync(join(root, name), (await window.webContents.capturePage()).toPNG())
    const viewport = await evaluate(
      '({width:innerWidth,height:innerHeight,devicePixelRatio,zoom:visualViewport.scale})',
    )
    writeFileSync(
      join(root, name + '.json'),
      JSON.stringify({ ...viewport, zoomFactor: window.webContents.getZoomFactor() }, null, 2),
    )
  }
  const approve = async () => {
    await click('审核通过此版本')
    await waitFor('document.querySelector("[role=dialog]")', 'review dialog')
    await click('确认审核通过')
    await waitFor('!document.querySelector("[role=dialog]")', 'review closes')
    await waitFor(
      '[...document.querySelectorAll("button")].some(item=>item.getAttribute("aria-label")==="继续下一步"&&!item.disabled)',
      'next stage enabled',
    )
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
    window.setSize(1440, 1100)
    await waitFor(`document.querySelector('nav')`, 'video navigation')
    await evaluate(
      `(()=>{window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))})()`,
    )
    await waitFor('document.getElementById("workflow-project-search")', 'project list')
    const filterMetrics = await evaluate(`(()=>{
      const search=document.getElementById('workflow-project-search');
      const bounds=search.getBoundingClientRect();
      const controls=[...document.querySelectorAll('.workflow-project-filters button')];
      return {height:bounds.height,radius:parseFloat(getComputedStyle(search).borderRadius),
        aligned:controls.every(control=>Math.abs(control.getBoundingClientRect().top+control.getBoundingClientRect().height/2-bounds.top-bounds.height/2)<1),
        visibleLabels:[...document.querySelectorAll('.workflow-project-filters label')].filter(label=>getComputedStyle(label).position!=='absolute').map(label=>label.textContent)};
    })()`)
    assert.equal(filterMetrics.height, 40)
    assert.ok(filterMetrics.radius <= 8)
    assert.equal(filterMetrics.aligned, true)
    assert.ok(!filterMetrics.visibleLabels.includes('项目状态'))
    assert.equal(
      await evaluate('document.querySelector("[aria-label=查看已归档]")?.textContent.trim()'),
      'archive',
    )
    await screenshot('01-projects-light-1440.png')
    if (process.env.WORKFLOW_SEED_DIR) {
      assert.equal(
        await evaluate(
          'Boolean(document.querySelector(".workflow-project-actions > button:last-child[aria-haspopup=menu]"))',
        ),
        true,
      )
      window.focus()
      await delay(150)
      await evaluate(
        'document.querySelector(".workflow-project-actions button[aria-haspopup=menu]").focus()',
      )
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
      await waitFor('document.querySelector("[role=menuitem]")', 'project actions popup')
      assert.ok(
        await evaluate(
          'document.querySelector("[role=menuitem]").textContent.includes("归档项目")',
        ),
      )
      await screenshot('project-list-menu-light-1440.png')
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await waitFor(
        '!document.querySelector("[role=menu]") && document.activeElement.title==="更多操作"',
        'popup Escape focus return',
      )
      await evaluate(
        'document.querySelector(".workflow-project-actions button[aria-haspopup=menu]").focus()',
      )
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
      await waitFor('document.querySelector("[role=menuitem]")', 'archive popup')
      await evaluate('document.querySelector("[role=menuitem]").click()')
      await waitFor(
        '!document.querySelector(".workflow-project-card")',
        'archived removed from active list',
      )
      await click('查看已归档')
      await waitFor('document.querySelector(".workflow-project-card")', 'archive view')
      assert.equal(
        await evaluate(
          'document.querySelector("[aria-label=查看进行中项目]").getAttribute("aria-pressed")',
        ),
        'true',
      )
      await evaluate(
        'document.querySelector(".workflow-project-actions button[aria-haspopup=menu]").focus()',
      )
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
      await waitFor('document.querySelector("[role=menuitem]")', 'restore popup')
      assert.ok(
        await evaluate(
          'document.querySelector("[role=menuitem]").textContent.includes("恢复项目")',
        ),
      )
      await evaluate('document.querySelector("[role=menuitem]").click()')
      await waitFor(
        '!document.querySelector(".workflow-project-card")',
        'restored removed from archive view',
      )
      await click('查看进行中项目')
      await waitFor('document.querySelector(".workflow-project-card")', 'restored active list')
      window.setSize(1024, 900)
      await screenshot('project-list-controls-light-1024.png')
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
      window.webContents.setZoomFactor(2)
      await evaluate('document.getElementById("workflow-project-search").focus()')
      await screenshot('project-list-controls-light-zoom200.png')
      assert.ok(
        await evaluate(
          'document.documentElement.scrollWidth<=innerWidth+1 && document.activeElement.id==="workflow-project-search"',
        ),
      )
      window.webContents.setZoomFactor(1)
      window.setSize(1440, 1100)
    }
    await click('新建视频项目')
    await fill('项目名称', 'UI 验证：从想法到分镜')
    await screenshot('01-new-project-light-1440.png')
    await click('创建项目')
    await waitFor(
      '[...document.querySelectorAll("label")].some(item=>item.textContent==="想法与创作简报")',
      'brief editor',
    )
    await fill(
      '想法与创作简报',
      '给技术团队介绍视频工作流。先解释为什么需要人工审核，再演示不同分镜布局。',
    )
    await fill('目标受众', '技术团队')
    await fill('参考资料', '项目文档与已核实的功能说明')
    await click('保存草稿')
    await click('确认保存新版本')
    await waitFor(
      '[...document.querySelectorAll("button")].some(item=>item.textContent.trim()==="审核通过此版本"&&!item.disabled)',
      'saved brief',
    )
    await approve()
    await click('继续下一步')
    await waitFor(
      'document.querySelector("[data-copy-generate]")',
      'copy AI entry in editor header',
    )
    assert.equal(await evaluate('document.querySelectorAll("[data-copy-generate]").length'), 1)
    assert.ok(
      await evaluate(
        'Boolean(document.querySelector(".workflow-artifact-card .workflow-stage-heading [data-copy-generate]"))',
      ),
    )
    assert.ok(
      await evaluate(
        '!document.querySelector(".workflow-task-section").textContent.includes("重新生成")',
      ),
    )
    const copyRuntime = await evaluate(
      '(async()=>{const result=await window.electronAPI.invoke("workflow:runtime");return result.data})()',
    )
    const copyCLI = join(root, 'copy-test-codex')
    const copyResponse = join(root, 'copy-response.json')
    const copyPrompt = join(root, 'copy-prompt.txt')
    const copyText =
      '# 为什么需要审核\n事实、表达与风格需要逐步确认。\n\n# 用不同布局讲清内容\n开场聚焦观点，分栏解释原理，步骤总结方法。'
    writeFileSync(copyResponse, JSON.stringify({ text: copyText }))
    writeFileSync(
      copyCLI,
      `#!/usr/bin/env node\nconst fs=require('node:fs');let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(copyPrompt)},input);setTimeout(()=>fs.copyFileSync(${JSON.stringify(copyResponse)},process.argv[process.argv.indexOf('--output-last-message')+1]),1200);});\n`,
    )
    chmodSync(copyCLI, 0o755)
    await evaluate(
      `window.electronAPI.invoke('workflow:configure',{codexPath:${JSON.stringify(copyCLI)}})`,
    )
    await fill('文案创作要求 / 修改建议（选填）', '以一个人工审核案例开场，保留两个章节')
    await evaluate('document.querySelector("[data-copy-generate]").focus()')
    window.focus()
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
    await waitFor(
      'document.querySelector("[data-copy-status]").textContent.includes("正在生成")',
      'copy AI loading',
    )
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll(".workflow-artifact-card textarea")].every(item=>item.disabled) && document.querySelector("[data-copy-generate]").disabled && Boolean(document.querySelector(".workflow-job-progress"))',
      ),
    )
    await screenshot('copy-ai-running-light-1440.png')
    await waitFor(
      'document.querySelector("[data-copy-text]").value.includes("为什么需要审核")',
      'copy AI first draft',
    )
    const copyProject = await evaluate(
      '(async()=>{const result=await window.electronAPI.invoke("workflow:list");return result.data.find(item=>item.title==="UI 验证：从想法到分镜")})()',
    )
    assert.equal(copyProject.stages.copy.status, 'review')
    assert.ok(readFileSync(copyPrompt, 'utf8').includes('以一个人工审核案例开场'))
    await fill('视频内容文案', '尚未保存的手工修改')
    assert.equal(await evaluate('document.querySelector("[data-copy-generate]").disabled'), true)
    await click('放弃未保存修改')
    await fill('文案创作要求 / 修改建议（选填）', '保持两章结构，解释更简洁')
    writeFileSync(copyResponse, JSON.stringify({ text: copyText + '\n每一步都由你确认。' }))
    await click('AI 重新生成文案')
    await waitFor(
      'document.querySelector("[data-copy-text]").value.includes("每一步都由你确认")',
      'copy AI revision',
    )
    const revisedCopy = await evaluate(
      `(async()=>{const result=await window.electronAPI.invoke('workflow:get',${JSON.stringify(copyProject.id)});return result.data})()`,
    )
    assert.equal(revisedCopy.stages.copy.version, 2)
    assert.equal(revisedCopy.stages.copy.status, 'review')
    const capturedCopyPrompt = readFileSync(copyPrompt, 'utf8')
    assert.ok(
      capturedCopyPrompt.includes('保持两章结构') &&
        capturedCopyPrompt.includes(copyText.split('\n')[0]),
    )
    writeFileSync(copyResponse, JSON.stringify({ text: '' }))
    await click('AI 重新生成文案')
    await waitFor('document.querySelector("[data-job-state=failed]")', 'copy AI validation failure')
    assert.ok(
      await evaluate(
        'document.querySelector("[data-copy-text]").value.includes("每一步都由你确认")',
      ),
    )
    await click('AI 重新生成文案')
    await waitFor('document.querySelector(".workflow-job-progress")', 'copy AI retry')
    await click('取消任务')
    await waitFor('!document.querySelector("[data-copy-generate]").disabled', 'copy AI cancelled')
    assert.ok(
      await evaluate(
        'document.querySelector("[data-copy-text]").value.includes("每一步都由你确认")',
      ),
    )
    await screenshot('copy-ai-review-light-1440.png')
    for (const width of [1024, 1440]) {
      window.setSize(width, 1000)
      await evaluate(
        'document.querySelector("[data-copy-generate]").scrollIntoView({block:"center"})',
      )
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
      await screenshot(`copy-ai-review-light-${width}.png`)
    }
    window.webContents.setZoomFactor(2)
    await evaluate(
      'document.querySelector("[data-copy-generate]").focus();document.querySelector("[data-copy-generate]").scrollIntoView({block:"center"})',
    )
    assert.ok(
      await evaluate(
        'document.activeElement.matches("[data-copy-generate]") && document.documentElement.scrollWidth<=innerWidth+1',
      ),
    )
    await screenshot('copy-ai-review-light-zoom200.png')
    window.webContents.setZoomFactor(1)
    window.setSize(1440, 1100)
    await evaluate(
      `window.electronAPI.invoke('workflow:configure',{codexPath:${JSON.stringify(copyRuntime.codexPath)}})`,
    )
    await fill(
      '视频内容文案',
      '# 为什么需要审核\n事实、表达与风格需要逐步确认。\n\n# 用不同布局讲清内容\n开场聚焦观点，分栏解释原理，步骤总结方法。',
    )
    await click('保存草稿')
    await click('确认保存新版本')
    await approve()
    await click('继续下一步')
    await click('生成模板分镜')
    await waitFor(
      'document.querySelectorAll(".workflow-scene").length===2 && document.querySelector("iframe")',
      'generated storyboard',
    )
    await waitFor(
      '[...document.querySelectorAll("button")].some(item=>item.textContent.trim()==="审核通过此版本"&&!item.disabled)',
      'storyboard waits for review',
    )
    assert.equal(await evaluate('document.querySelector("iframe").getAttribute("sandbox")'), '')
    assert.equal(await evaluate('document.querySelectorAll(".workflow-step").length'), 8)
    assert.ok(
      await evaluate(
        'document.querySelector(".workflow-step-scroll").scrollWidth<=document.querySelector(".workflow-step-scroll").clientWidth+1',
      ),
    )
    assert.ok(
      await evaluate(
        'document.querySelector(".workflow-preview").getBoundingClientRect().top<document.querySelector(".workflow-scenes").getBoundingClientRect().top',
      ),
    )
    assert.equal(
      await evaluate('document.querySelectorAll(".workflow-artifact-card textarea").length'),
      0,
    )
    assert.equal(
      await evaluate(
        'getComputedStyle(document.querySelector(".workflow-body")).gridTemplateColumns.split(" ").length',
      ),
      2,
    )
    assert.equal(
      await evaluate(
        'Math.round(document.querySelector(".workflow-aside").getBoundingClientRect().width)',
      ),
      240,
    )
    assert.ok(await evaluate('document.querySelector(".workflow-bottom [aria-label]").disabled'))
    assert.ok(
      await evaluate('Boolean(document.querySelector(".workflow-job-log time[datetime]"))'),
      'Execution records must display their actual timestamps',
    )
    assert.ok(
      await evaluate('document.querySelector(".workflow-job-log").textContent.includes("耗时")'),
      'Execution records must display elapsed time',
    )
    await screenshot('02-storyboard-light-1440.png')
    const Database = require('better-sqlite3')
    const logFixture = new Database(join(root, 'database/dashboard.db'))
    const logProject = await evaluate(
      '(async()=>{const result=await window.electronAPI.invoke("workflow:list");return result.data.find(item=>item.title==="UI 验证：从想法到分镜")})()',
    )
    const logStart = new Date(Date.now() - 65000).toISOString()
    const logEnd = new Date().toISOString()
    const longError =
      'CLI 执行失败：SIGKILL\n' + '完整诊断信息 /long/path/to/agent/output '.repeat(40)
    const insertLog = logFixture.prepare(
      'INSERT INTO video_workflow_jobs(id,project_id,stage,request_id,expected_revision,executor,input_fingerprint,state,phase,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    for (const state of ['failed', 'cancelled', 'interrupted', 'stale', 'running']) {
      insertLog.run(
        `ui-log-${state}`,
        logProject.id,
        'storyboard',
        `ui-log-${state}`,
        logProject.revision,
        'codex',
        '{}',
        state,
        state === 'running' ? '等待 Codex 生成；生成后需人工审核' : '生成未完成，输入已保留',
        state === 'failed' ? longError : null,
        logStart,
        logEnd,
      )
    }
    window.webContents.send('workflow:updated', logProject.id)
    await waitFor('document.querySelector(".workflow-job-progress")', 'running progress')
    assert.equal(
      await evaluate(
        'document.querySelector(".workflow-job-progress").hasAttribute("aria-valuenow")',
      ),
      false,
    )
    assert.equal(
      await evaluate('document.querySelector(".workflow-job-entry").dataset.jobState'),
      'running',
    )
    assert.ok(await evaluate('document.querySelector(".workflow-job-spinner")'))
    const firstElapsed = await evaluate('document.querySelector(".workflow-job-meta").textContent')
    await delay(1200)
    assert.notEqual(
      await evaluate('document.querySelector(".workflow-job-meta").textContent'),
      firstElapsed,
    )
    await click('查看全部 6 条记录')
    assert.equal(await evaluate('document.querySelectorAll(".workflow-job-entry").length'), 6)
    window.focus()
    await evaluate('document.querySelector("[data-job-state=failed] summary").focus()')
    assert.ok(await evaluate('document.activeElement.matches("[data-job-state=failed] summary")'))
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
    await waitFor(
      'document.querySelector("[data-job-state=failed] details").open',
      'keyboard error details',
    )
    assert.equal(
      await evaluate('document.querySelector("[aria-label=完整错误信息]").textContent'),
      longError,
    )
    window.focus()
    await click('复制错误信息')
    await waitFor(
      'document.querySelector("[data-job-state=failed]").textContent.includes("已复制")',
      'copy success feedback',
    )
    assert.equal(clipboard.readText(), longError)
    assert.equal(
      await evaluate(
        'getComputedStyle(document.querySelector("[aria-label=完整错误信息]")).userSelect',
      ),
      'text',
    )
    await evaluate(
      `void (() => { window.originalClipboardWrite = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = () => Promise.reject(new Error('clipboard unavailable')) })()`,
    )
    await click('复制错误信息')
    await waitFor(
      'document.querySelector("[data-job-state=failed]").textContent.includes("复制失败")',
      'copy error feedback',
    )
    assert.equal(
      await evaluate('document.querySelector("[aria-label=完整错误信息]").textContent'),
      longError,
    )
    await evaluate('void (navigator.clipboard.writeText = window.originalClipboardWrite)')
    await evaluate('document.querySelector("[data-job-state=failed] button").focus()')
    window.focus()
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
    await waitFor(
      'document.querySelector("[data-job-state=failed]").textContent.includes("已复制")',
      'keyboard copy retry',
    )
    assert.equal(clipboard.readText(), longError)
    await screenshot('execution-log-error-details.png')
    for (const width of [1440, 1024]) {
      window.setSize(width, 900)
      await delay(100)
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
      assert.ok(
        await evaluate(
          'document.querySelector(".workflow-job-log").scrollWidth<=document.querySelector(".workflow-job-log").clientWidth+1',
        ),
      )
      await evaluate('document.querySelector(".workflow-job-log").scrollTop=0')
      await screenshot(`execution-log-light-${width}.png`)
    }
    window.webContents.setZoomFactor(2)
    await delay(100)
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    await screenshot('execution-log-light-zoom200.png')
    window.webContents.setZoomFactor(1)
    window.setSize(1440, 1100)
    for (const theme of ['dark', 'light']) {
      await evaluate(
        "(()=>{window.history.pushState({},'', '/settings');window.dispatchEvent(new PopStateEvent('popstate'))})()",
      )
      await waitFor(
        `[...document.querySelectorAll("button")].some(item=>item.textContent.includes("${theme}_mode"))`,
        'theme settings for log',
      )
      await evaluate(
        `[...document.querySelectorAll("button")].find(item=>item.textContent.includes("${theme}_mode")).click()`,
      )
      await evaluate(
        "(()=>{window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))})()",
      )
      await waitFor(
        'document.getElementById("workflow-project-search")',
        'return to log project list',
      )
      await evaluate(
        "(()=>{const heading=[...document.querySelectorAll('h3')].find(item=>item.textContent==='UI 验证：从想法到分镜');heading.closest('.workflow-project-card').querySelector('button').click()})()",
      )
      await waitFor(
        'document.querySelector(".workflow-job-progress")',
        'running log after theme change',
      )
      await evaluate(
        'document.querySelector(".workflow-execution-log").scrollIntoView({block:"center"})',
      )
      if (!(await evaluate('Boolean(document.querySelector("[data-job-state=failed] details"))')))
        await click('查看全部 6 条记录')
      await evaluate('document.querySelector("[data-job-state=failed] details").open = true')
      assert.ok(await evaluate('Boolean(document.querySelector("[data-job-state=failed] button"))'))
      await evaluate(
        'document.querySelector("[data-job-state=failed] button").scrollIntoView({block:"center"})',
      )
      await screenshot(`execution-log-${theme}-1440.png`)
    }
    logFixture.prepare("DELETE FROM video_workflow_jobs WHERE id LIKE 'ui-log-%'").run()
    logFixture.close()
    window.webContents.send('workflow:updated', logProject.id)
    await waitFor('!document.querySelector(".workflow-job-progress")', 'fixture cleanup')
    await evaluate('document.querySelectorAll(".workflow-step-button")[3].click()')
    await waitFor(
      'document.querySelector(".workflow-stage-shell")?.dataset.workflowStage==="narration"',
      'narration before storyboard approval',
    )
    assert.equal(
      await evaluate('document.querySelector("[data-narration-generate]")?.disabled'),
      true,
      'Narration AI entry is visible but gated by storyboard approval',
    )
    await evaluate('document.querySelectorAll(".workflow-step-button")[2].click()')
    await waitFor('document.querySelector(".workflow-storyboard iframe")', 'return to storyboard')
    await evaluate('document.querySelectorAll(".workflow-scene")[1].click()')
    await waitFor(
      'document.querySelectorAll(".workflow-scene")[1].getAttribute("aria-pressed")==="true"',
      'scene selection',
    )
    await click('修改此分镜')
    await fill('画面标题', '取消编辑不改变画面')
    await click('取消')
    assert.ok(
      await evaluate(
        '!document.querySelector(".workflow-scene-notes").textContent.includes("取消编辑不改变画面")',
      ),
    )
    await click('创作设置')
    await evaluate(
      '[...document.querySelectorAll("input[type=radio]")].find(item=>item.value==="agent").click()',
    )
    await click('生成分镜候选')
    assert.ok(
      await evaluate(
        'document.querySelector("[role=dialog] [role=alert]")?.textContent.includes("至少")',
      ),
    )
    await fill('创作要求 / 参考描述', '以杂志风格自由创作，保留分镜之间的版式差异。')
    await screenshot('03-agent-creation-light-1440.png')
    for (const width of [1024, 720]) {
      window.setSize(width, 720)
      await delay(100)
      assert.ok(
        await evaluate(
          '(()=>{const footer=document.querySelector(".workflow-dialog-footer").getBoundingClientRect();return footer.bottom<=innerHeight&&footer.top>=0})()',
        ),
      )
      assert.ok(
        await evaluate(
          'document.querySelector("[role=dialog]").getBoundingClientRect().width<=innerWidth',
        ),
      )
      await screenshot('03-agent-creation-light-' + width + '.png')
    }
    window.setSize(1440, 1100)
    await click('取消')
    assert.ok(
      await evaluate(
        '!document.querySelector(".workflow-bottom").textContent.includes("本地草稿已保留")',
      ),
    )
    await waitFor(
      'document.activeElement.textContent.trim()==="创作设置"',
      'focus returns to creation settings',
    )
    await click('创作设置')
    await evaluate(
      '[...document.querySelectorAll("input[type=radio]")].find(item=>item.name.startsWith("template-")&&!item.checked).click()',
    )
    await screenshot('03-template-family-light-1440.png')
    await click('采用视觉模板')
    await click('保存草稿')
    await screenshot('03-save-impact-light-1440.png')
    await click('确认保存新版本')
    await waitFor(
      '[...document.querySelectorAll("button")].some(item=>item.textContent.trim()==="审核通过此版本"&&!item.disabled)',
      'storyboard saved',
    )
    await click('执行环境')
    await waitFor('document.querySelector("[role=dialog]")', 'settings dialog')
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
    assert.ok(await evaluate('Boolean(document.activeElement.closest("[role=dialog]"))'))
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await waitFor('!document.querySelector("[role=dialog]")', 'escape closes settings')
    assert.ok(await evaluate('document.activeElement.hasAttribute("data-workflow-settings")'))
    window.setSize(1024, 900)
    await delay(100)
    assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'))
    assert.equal(
      await evaluate(
        'Math.round(document.querySelector(".workflow-aside").getBoundingClientRect().width)',
      ),
      224,
    )
    assert.equal(
      await evaluate(
        'getComputedStyle(document.querySelector(".workflow-steps")).gridTemplateColumns.split(" ").length',
      ),
      8,
    )
    await screenshot('04-storyboard-light-1024.png')
    window.webContents.setZoomFactor(2)
    await delay(100)
    assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'))
    await screenshot('05-storyboard-light-zoom200.png')
    await evaluate(
      '[...document.querySelectorAll("button")].find(item=>item.textContent.trim()==="审核通过此版本").focus()',
    )
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
    await waitFor('document.querySelector("[role=dialog]")', 'keyboard review at 200%')
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await waitFor('!document.querySelector("[role=dialog]")', 'keyboard review closes at 200%')
    window.webContents.setZoomFactor(1)
    window.setSize(1440, 1100)
    await evaluate(
      `(()=>{window.history.pushState({},'', '/settings');window.dispatchEvent(new PopStateEvent('popstate'))})()`,
    )
    await waitFor(
      '[...document.querySelectorAll("button")].some(item=>item.textContent.includes("dark_mode"))',
      'theme settings',
    )
    await evaluate(
      '[...document.querySelectorAll("button")].find(item=>item.textContent.includes("dark_mode")).click()',
    )
    await waitFor('document.documentElement.classList.contains("dark")', 'live dark theme')
    await evaluate(
      `(()=>{window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))})()`,
    )
    await waitFor('document.getElementById("workflow-project-search")', 'return to list')
    const project = await evaluate(
      '(async()=>{const result=await window.electronAPI.invoke("workflow:list");return result.data.find(item=>item.title==="UI 验证：从想法到分镜")})()',
    )
    assert.equal(project.stages.storyboard.status, 'review')
    assert.equal(project.stages.brief.payload.audience, '技术团队')
    assert.equal(project.stages.brief.payload.references, '项目文档与已核实的功能说明')
    await evaluate(
      `(()=>{const cards=[...document.querySelectorAll('h3')];const heading=cards.find(item=>item.textContent==='UI 验证：从想法到分镜');const card=heading.closest('.p-md');[...card.querySelectorAll('button')].find(item=>item.textContent==='继续创作').click()})()`,
    )
    await waitFor(
      '!document.getElementById("workflow-project-search") && document.querySelector(".workflow-page-title")?.textContent==="UI 验证：从想法到分镜" && document.querySelector(".workflow-storyboard iframe")',
      'reopen persisted project',
    )
    await screenshot('06-storyboard-dark-1440.png')
    await evaluate('document.querySelectorAll(".workflow-step-button")[1].click()')
    await waitFor('document.querySelector("[data-copy-generate]")', 'copy AI dark theme')
    assert.ok(
      await evaluate(
        'document.querySelector("[data-copy-sources]").textContent.includes("创作简报 v1")',
      ),
    )
    for (const width of [1440, 1024]) {
      window.setSize(width, 1000)
      await evaluate(
        'document.querySelector("[data-copy-generate]").scrollIntoView({block:"center"})',
      )
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
      await screenshot(`copy-ai-review-dark-${width}.png`)
    }
    window.webContents.setZoomFactor(2)
    await evaluate(
      'document.querySelector("[data-copy-generate]").focus();document.querySelector("[data-copy-generate]").scrollIntoView({block:"center"})',
    )
    assert.ok(
      await evaluate(
        'document.activeElement.matches("[data-copy-generate]") && document.documentElement.scrollWidth<=innerWidth+1',
      ),
    )
    await screenshot('copy-ai-review-dark-zoom200.png')
    window.webContents.setZoomFactor(1)
    window.setSize(1440, 1100)
    await evaluate('document.querySelectorAll(".workflow-step-button")[2].click()')
    await waitFor(
      'document.querySelector(".workflow-storyboard iframe")',
      'return from copy to storyboard',
    )
    await click('项目版本历史')
    await waitFor('document.querySelector("[role=dialog]")', 'history dialog')
    await click('作为新草稿')
    await waitFor(
      '!document.querySelector("[role=dialog]") && document.querySelector(".workflow-bottom").textContent.includes("本地草稿已保留")',
      'history restores editable draft',
    )
    assert.ok(await evaluate(`document.querySelector('button[aria-label="继续下一步"]').disabled`))
    await click('放弃未保存修改')
    await approve()
    await click('继续下一步')
    await waitFor('document.querySelector("[data-narration-generate]")', 'narration AI entry')
    const narrationProject = await evaluate(
      `(async()=>{const result=await window.electronAPI.invoke('workflow:get',${JSON.stringify(logProject.id)});return result.data})()`,
    )
    const aiNarration = {
      scenes: narrationProject.stages.storyboard.payload.scenes.map((scene) => ({
        id: scene.id,
        text: 'AI 测试口播：' + scene.title + '。根据内容文案解释这个画面。',
      })),
    }
    const narrationCLI = join(root, 'narration-test-codex')
    writeFileSync(
      narrationCLI,
      `#!/usr/bin/env node\nconst fs=require('node:fs');process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>{fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify(aiNarration))});},900));\n`,
    )
    chmodSync(narrationCLI, 0o755)
    const previousRuntime = await evaluate(
      '(async()=>{const result=await window.electronAPI.invoke("workflow:runtime");return result.data})()',
    )
    await evaluate(
      `window.electronAPI.invoke('workflow:configure',{codexPath:${JSON.stringify(narrationCLI)}})`,
    )
    await click('AI 生成口播稿')
    await waitFor('document.querySelector(".workflow-job-progress")', 'AI narration loading')
    assert.ok(
      await evaluate(
        'document.querySelector("[data-narration-generate]").disabled && document.querySelector(".workflow-artifact-card textarea").disabled',
      ),
    )
    await screenshot('narration-ai-running-dark.png')
    await waitFor(
      '!document.querySelector(".workflow-job-progress") && document.querySelector(".workflow-artifact-card textarea").value.startsWith("AI 测试口播")',
      'AI narration appears in editor',
    )
    assert.ok(await evaluate('document.querySelector("button[aria-label=继续下一步]").disabled'))
    const generatedNarration = await evaluate(
      `(async()=>{const result=await window.electronAPI.invoke('workflow:get',${JSON.stringify(logProject.id)});return result.data})()`,
    )
    assert.equal(generatedNarration.stages.narration.status, 'review')
    assert.deepEqual(generatedNarration.stages.narration.payload, aiNarration)
    assert.equal(generatedNarration.stages.audio, undefined)
    await evaluate(
      `window.electronAPI.invoke('workflow:configure',${JSON.stringify(previousRuntime)})`,
    )
    await screenshot('narration-ai-review-dark.png')
    window.setSize(1024, 900)
    await delay(100)
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    await screenshot('narration-ai-review-dark-1024.png')
    window.webContents.setZoomFactor(2)
    await delay(100)
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    await evaluate('document.querySelector("[data-narration-generate]").focus()')
    assert.ok(await evaluate('document.activeElement.matches("[data-narration-generate]")'))
    await screenshot('narration-ai-review-dark-zoom200.png')
    window.webContents.setZoomFactor(1)
    window.setSize(900, 900)
    await delay(100)
    assert.equal(
      await evaluate(
        'getComputedStyle(document.querySelector(".workflow-steps")).gridTemplateColumns.split(" ").length',
      ),
      4,
    )
    window.setSize(1440, 1100)
    if (process.env.WORKFLOW_SEED_DIR) {
      const media = await evaluate(
        '(async()=>{const result=await window.electronAPI.invoke("workflow:list");const project=result.data.find(item=>item.stages.render);return {id:project.id,file:project.stages.render.payload.file}})()',
      )
      const response = await evaluate(
        `(async()=>{const response=await fetch(${JSON.stringify(`video-workflow://${media.id}/${media.file.id}`)},{headers:{Range:'bytes=0-99'}});return {status:response.status,bytes:(await response.arrayBuffer()).byteLength}})()`,
      )
      assert.equal(response.status, 206)
      assert.equal(response.bytes, 100)
      await evaluate(`document.querySelector('button[aria-label="返回视频项目列表"]').click()`)
      await waitFor(
        'document.getElementById("workflow-project-search")',
        'project list before video playback',
      )
      await screenshot('aligned-projects-dark-1440.png')
      await evaluate(
        `(()=>{const heading=[...document.querySelectorAll('h3')].find(item=>item.textContent.includes('工作流真实合成验证'));const card=heading.closest('.p-md');[...card.querySelectorAll('button')].find(item=>item.textContent==='继续创作').click()})()`,
      )
      await waitFor(
        '!document.getElementById("workflow-project-search") && document.querySelector(".workflow-page-title")?.textContent.includes("工作流真实合成验证")',
        'media project detail',
      )
      const stageLabels = [
        '创作简报',
        '内容文案',
        'HTML 分镜',
        '口播定稿',
        '分段配音',
        '动态粗剪',
        '正式成片',
        '平台发布',
      ]
      const stageKeys = [
        'brief',
        'copy',
        'storyboard',
        'narration',
        'audio',
        'roughcut',
        'final',
        'publish',
      ]
      for (const theme of ['dark', 'light']) {
        if (theme === 'light') {
          await evaluate(
            `(()=>{window.history.pushState({},'', '/settings');window.dispatchEvent(new PopStateEvent('popstate'))})()`,
          )
          await waitFor(
            '[...document.querySelectorAll("button")].some(item=>item.textContent.includes("light_mode"))',
            'light theme setting',
          )
          await evaluate(
            '[...document.querySelectorAll("button")].find(item=>item.textContent.includes("light_mode")).click()',
          )
          await waitFor('!document.documentElement.classList.contains("dark")', 'live light theme')
          await evaluate(
            `(()=>{window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))})()`,
          )
          await waitFor(
            'document.getElementById("workflow-project-search")',
            'light populated list',
          )
          await screenshot('aligned-projects-light-1440.png')
          await evaluate(
            `(()=>{const heading=[...document.querySelectorAll('h3')].find(item=>item.textContent.includes('工作流真实合成验证'));heading.closest('.workflow-project-card').querySelector('button').click()})()`,
          )
          await waitFor(
            '!document.getElementById("workflow-project-search") && document.querySelector(".workflow-page-title")?.textContent.includes("工作流真实合成验证")',
            'light media project',
          )
        }
        for (let index = 0; index < stageKeys.length; index++) {
          await evaluate(`document.querySelectorAll(".workflow-step-button")[${index}].click()`)
          await waitFor(
            `document.querySelector('.workflow-step-button[aria-current="step"]')?.textContent.includes(${JSON.stringify(stageLabels[index])}) && document.querySelector(".workflow-stage-shell")?.dataset.workflowStage===${JSON.stringify(stageKeys[index] === 'final' ? 'render' : stageKeys[index])}`,
            'stage content: ' + stageKeys[index],
          )
          if (stageKeys[index] === 'storyboard') {
            await waitFor(
              'document.querySelector(".workflow-preview iframe")?.srcdoc.length>100',
              'real scene preview',
            )
          }
          if (['roughcut', 'final'].includes(stageKeys[index])) {
            await waitFor('document.querySelector("video")?.readyState>=2', 'video frame')
            assert.ok(
              await evaluate(
                '[...document.querySelectorAll("button")].some(item=>item.textContent.trim()==="导出可编辑工程")',
              ),
            )
          }
          if (stageKeys[index] === 'roughcut') {
            await evaluate(
              '(()=>{const summary=[...document.querySelectorAll("summary")].find(item=>item.textContent.includes("提出修改"));if(!summary.parentElement.open)summary.click()})()',
            )
            await fill('修改意见', '第一镜标题依次入场；角色轻弹；保持口播与时长不变。')
            if (theme === 'dark') {
              const motionCLI = join(root, 'motion-test-codex')
              writeFileSync(
                motionCLI,
                `#!/usr/bin/env node\nconst fs=require('node:fs');process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],JSON.stringify({summary:'标题轻弹入场，保持配音与时长',scenes:[{sceneId:'scene-1',effects:[{selector:'h1',start:0,duration:0.6,keyframes:[{opacity:0,scale:0.9},{opacity:1,scale:1}]}]}]})),700));\n`,
              )
              chmodSync(motionCLI, 0o755)
              await evaluate(
                `window.electronAPI.invoke('workflow:configure',{codexPath:${JSON.stringify(motionCLI)}})`,
              )
              await click('生成修改计划')
              const previousVideo = await evaluate('document.querySelector("video").src')
              await waitFor(
                'document.querySelector(".workflow-job-progress")',
                'motion plan running',
              )
              await waitFor(
                'document.querySelector("[aria-label=待确认动效计划]")',
                'motion plan ready',
              )
              assert.ok(
                await evaluate(
                  'document.querySelector("[aria-label=待确认动效计划]").textContent.includes("尚未应用")',
                ),
              )
              assert.equal(await evaluate('document.querySelector("video").src'), previousVideo)
              assert.ok(await evaluate('document.getElementById("workflow-motion-plan").open'))
              assert.ok(
                await evaluate(
                  'document.querySelector("[aria-label=修改计划尚未应用]").textContent.includes("粗剪 v1")',
                ),
              )
              await evaluate(
                'document.querySelector("[aria-label=修改计划尚未应用]").scrollIntoView({block:"start"})',
              )
              await screenshot('motion-plan-pending-preview-dark.png')
              await evaluate('document.getElementById("workflow-motion-plan").open=false')
              await click('查看计划并确认合成')
              assert.ok(
                await evaluate(
                  'document.getElementById("workflow-motion-plan").open && document.activeElement.tagName==="SUMMARY"',
                ),
              )
              assert.ok(
                await evaluate(
                  '[...document.querySelectorAll("button")].some(item=>item.textContent.includes("确认计划，生成粗剪 v2")&&!item.disabled)',
                ),
              )
              assert.ok(
                await evaluate(
                  'document.querySelector(".workflow-aside").textContent.includes("已通过")',
                ),
              )
              await evaluate(
                `window.electronAPI.invoke('workflow:configure',${JSON.stringify(previousRuntime)})`,
              )
            }
            for (const width of [1440, 1024]) {
              window.setSize(width, 900)
              await evaluate(
                '[...document.querySelectorAll("summary")].find(item=>item.textContent.includes("提出修改")).scrollIntoView({block:"start"})',
              )
              await delay(100)
              assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
              await screenshot(`motion-feedback-${theme}-${width}.png`)
            }
            window.webContents.setZoomFactor(2)
            await delay(100)
            assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            await evaluate(
              '[...document.querySelectorAll("summary")].find(item=>item.textContent.includes("提出修改")).scrollIntoView({block:"start"})',
            )
            await screenshot(`motion-feedback-${theme}-200percent.png`)
            window.webContents.setZoomFactor(1)
            window.setSize(1440, 1100)
          }
          if (stageKeys[index] === 'final') {
            await click('保存为模板')
            await waitFor('document.querySelector("[role=dialog]")', 'style template dialog')
            for (const width of [1440, 1024]) {
              window.setSize(width, 900)
              await delay(100)
              assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
              await screenshot(`save-template-${theme}-${width}.png`)
            }
            window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
            window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
            await waitFor('!document.querySelector("[role=dialog]")', 'template Escape')
            assert.ok(await evaluate('document.activeElement.textContent.includes("保存为模板")'))
            window.setSize(1440, 1100)
            await click('保存为模板')
            await fill('模板名称', `UI 验证模板 ${theme}`)
            await click('保存模板')
            await waitFor('!document.querySelector("[role=dialog]")', 'template saved')
            assert.ok(
              await evaluate(
                `(async()=>{const result=await window.electronAPI.invoke('workflow:templates');return result.success&&result.data.some(item=>item.name==='UI 验证模板 ${theme}')})()`,
              ),
            )
          }
          if (stageKeys[index] === 'audio') {
            await waitFor(
              'document.querySelector("audio")?.duration>0',
              'real segment audio metadata',
            )
            assert.ok(
              await evaluate('document.querySelector(".workflow-audio-row audio").controls'),
              'restore original native player controls',
            )
            await evaluate('document.querySelector("[data-audio-track-menu]").click()')
            await waitFor(
              '[...document.querySelectorAll("[role=menuitem]")].some(item=>item.textContent.includes("打开所在文件夹"))',
              'audio file location action',
            )
            await evaluate(
              '[...document.querySelectorAll("[role=menuitem]")].find(item=>item.textContent.includes("打开所在文件夹")).click()',
            )
            await toggleAudio(0)
            await waitFor(
              'document.querySelector(".workflow-audio-row[data-playing=true]")',
              'playing segment highlight',
            )
            assert.ok(
              await evaluate(
                'Number(getComputedStyle(document.querySelector(".workflow-audio-row[data-playing=true] strong")).fontWeight)>=700',
              ),
            )
            assert.equal(
              await evaluate(
                'document.querySelector(".workflow-audio-row[data-playing=true] audio").dataset.playing',
              ),
              'true',
            )
            await screenshot('audio-playing-' + theme + '-1440.png')
            await toggleAudio(0)
            await waitFor(
              '!document.querySelector(".workflow-audio-row[data-playing=true]")',
              'pause clears highlight',
            )
            await evaluate('document.querySelector(".workflow-audio-row audio").focus()')
            window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
            window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
            await waitFor(
              'document.querySelector(".workflow-audio-row[data-playing=true]")',
              'keyboard starts playback',
            )
            await toggleAudio(1)
            await waitFor(
              'document.querySelectorAll(".workflow-audio-row")[1].dataset.playing==="true" && document.querySelectorAll(".workflow-audio-row")[0].dataset.playing==="false"',
              'playing another segment clears previous highlight',
            )
            assert.ok(await evaluate('document.querySelector(".workflow-audio-row audio").paused'))
            await evaluate(
              'document.querySelectorAll(".workflow-audio-row audio")[1].currentTime=document.querySelectorAll(".workflow-audio-row audio")[1].duration-0.05',
            )
            await waitFor(
              '!document.querySelector(".workflow-audio-row[data-playing=true]")',
              'ending clears highlight',
            )
            window.setSize(1024, 900)
            await delay(100)
            await evaluate(
              'document.querySelector(".workflow-audio-player").scrollIntoView({block:"center"})',
            )
            assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            await screenshot('audio-' + theme + '-1024.png')
            window.webContents.setZoomFactor(2)
            await delay(100)
            await evaluate(
              'document.querySelector(".workflow-audio-player").scrollIntoView({block:"center"})',
            )
            assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            assert.ok(
              await evaluate(
                '(()=>{const bounds=document.querySelector(".workflow-audio-player").getBoundingClientRect();return bounds.left>=0&&bounds.right<=innerWidth&&bounds.top>=0&&bounds.bottom<=innerHeight})()',
              ),
            )
            await evaluate('document.querySelector(".workflow-audio-player").focus()')
            const positionBeforeKey = await evaluate(
              'document.querySelector(".workflow-audio-row audio").currentTime',
            )
            window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' })
            window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' })
            await waitFor(
              `document.querySelector(".workflow-audio-row audio").currentTime>${positionBeforeKey}`,
              'keyboard seeks audio at 200 percent',
            )
            await screenshot('audio-' + theme + '-200percent.png')
            window.webContents.setZoomFactor(1)
            window.setSize(1440, 1100)
            if (theme === 'dark') {
              const Database = require('better-sqlite3')
              const fixture = new Database(join(root, 'database/dashboard.db'))
              const mediaProject = fixture
                .prepare('SELECT id,revision FROM video_projects WHERE title LIKE ?')
                .get('%工作流真实合成验证%')
              const original = JSON.parse(
                fixture
                  .prepare(
                    "SELECT payload FROM video_workflow_revisions WHERE project_id=? AND stage='audio' ORDER BY version DESC LIMIT 1",
                  )
                  .get(mediaProject.id).payload,
              )
              assert.ok(original.tracks.length >= 2)
              const progressId = 'ui-progress-job'
              const now = new Date().toISOString()
              fixture
                .prepare(
                  'INSERT INTO video_workflow_jobs(id,project_id,stage,request_id,expected_revision,executor,input_fingerprint,state,phase,created_at,updated_at,audio_progress) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                )
                .run(
                  progressId,
                  mediaProject.id,
                  'audio',
                  progressId,
                  mediaProject.revision,
                  'template',
                  '',
                  'running',
                  '配音 2/2 镜',
                  now,
                  now,
                  JSON.stringify({
                    tracks: original.tracks.slice(0, 1),
                    total: original.tracks.length,
                  }),
                )
              const notify = () => window.webContents.send('workflow:updated', mediaProject.id)
              try {
                notify()
                await waitFor(
                  'document.querySelector("[data-audio-progress]") && document.querySelectorAll(".workflow-audio-row").length===1',
                  'first completed segment while job is running',
                )
                await toggleAudio(0)
                await waitFor(
                  'document.querySelector(".workflow-audio-row[data-playing=true]")',
                  'partial segment playback',
                )
                await evaluate(
                  'window.__workflowTestAudio=document.querySelector(".workflow-audio-row audio");window.__workflowTestAudio.loop=true',
                )
                fixture
                  .prepare('UPDATE video_workflow_jobs SET audio_progress=? WHERE id=?')
                  .run(
                    JSON.stringify({ tracks: original.tracks, total: original.tracks.length }),
                    progressId,
                  )
                notify()
                await waitFor(
                  `document.querySelectorAll(".workflow-audio-row").length===${original.tracks.length}`,
                  'next segment appears',
                )
                assert.ok(
                  await evaluate(
                    'window.__workflowTestAudio===document.querySelector(".workflow-audio-row audio") && !window.__workflowTestAudio.paused',
                  ),
                  'new results preserve the existing playing element',
                )
                await screenshot('audio-progress-dark-1440.png')
                fixture
                  .prepare(
                    "UPDATE video_workflow_jobs SET state='failed',error='测试中断' WHERE id=?",
                  )
                  .run(progressId)
                notify()
                await waitFor(
                  'document.querySelector("[data-audio-progress]")?.textContent.includes("成功片段已保留")',
                  'failure retains completed segments',
                )
                await screenshot('audio-partial-failed-dark-1440.png')
                fixture
                  .prepare('UPDATE video_projects SET revision=revision+1 WHERE id=?')
                  .run(mediaProject.id)
                notify()
                await waitFor(
                  '!document.querySelector("[data-audio-progress]")',
                  'upstream edits hide obsolete partial results',
                )
                fixture
                  .prepare('UPDATE video_projects SET revision=? WHERE id=?')
                  .run(mediaProject.revision, mediaProject.id)
                fixture
                  .prepare("UPDATE video_workflow_jobs SET state='succeeded' WHERE id=?")
                  .run(progressId)
                notify()
                await waitFor(
                  '!document.querySelector("[data-audio-progress]") && document.querySelectorAll(".workflow-audio-row").length>1',
                  'complete result returns',
                )
              } finally {
                fixture.prepare('DELETE FROM video_workflow_jobs WHERE id=?').run(progressId)
                fixture
                  .prepare('UPDATE video_projects SET revision=? WHERE id=?')
                  .run(mediaProject.revision, mediaProject.id)
                fixture.close()
                notify()
                await evaluate(
                  'if(window.__workflowTestAudio){window.__workflowTestAudio.pause();window.__workflowTestAudio.loop=false;delete window.__workflowTestAudio}',
                )
              }
            }
          }
          if (stageKeys[index] === 'narration') {
            assert.equal(
              await evaluate('document.querySelector("[data-narration-generate]").disabled'),
              false,
            )
            assert.ok(
              await evaluate(
                'document.querySelector("[data-narration-sources]").textContent.includes("内容文案 v1") && document.querySelector("[data-narration-sources]").textContent.includes("HTML 分镜 v1")',
              ),
            )
            const original = await evaluate(
              'document.querySelector(".workflow-artifact-card textarea").value',
            )
            const label = await evaluate(
              '(()=>{const field=document.querySelector(".workflow-artifact-card textarea");return [...document.querySelectorAll("label")].find(item=>item.htmlFor===field.id).textContent})()',
            )
            await fill(label, original + '保留人工修改')
            assert.equal(
              await evaluate('document.querySelector("[data-narration-generate]").disabled'),
              true,
            )
            await click('放弃未保存修改')
            assert.equal(
              await evaluate('document.querySelector("[data-narration-generate]").disabled'),
              false,
            )
          }
          if (stageKeys[index] === 'publish') {
            assert.equal(
              await evaluate('Boolean(document.querySelector("[data-publish-generate]"))'),
              true,
            )
            assert.ok(
              await evaluate(
                'document.querySelector("[data-publish-sources]").textContent.includes("内容文案 v1")',
              ),
            )
            if (theme === 'dark') {
              const currentProject = await evaluate(
                'window.electronAPI.invoke("workflow:list").then(result=>result.data.find(item=>item.title.includes("工作流真实合成验证")))',
              )
              const savedBilibili = currentProject.stages.publish.payload.platforms.bilibili
              const originalTitle = await evaluate(
                'document.querySelector("input[maxlength]").value',
              )
              await fill('发布标题（最多 80 字）', originalTitle + '编辑')
              assert.equal(
                await evaluate('document.querySelector("[data-publish-generate]").disabled'),
                true,
              )
              await click('放弃未保存修改')
              await evaluate(
                '[...document.querySelectorAll("input[type=radio]")].find(item=>item.value==="douyin").click()',
              )
              await waitFor(
                'document.querySelector("input[maxlength]")?.maxLength===30',
                'Douyin AI target',
              )
              await evaluate('document.querySelector(".workflow-artifact-card details").open=true')
              await fill('给 AI 的要求', '标题用问题切入，简介更精炼')
              const publishCLI = join(root, 'publish-test-codex')
              const responsePath = join(root, 'publish-response.json')
              const response = {
                title: '视频为什么需要逐步审核？',
                description: '先文案，再分镜，最后确认成片。',
                tags: ['视频创作', 'AI工作流'],
              }
              writeFileSync(responsePath, JSON.stringify(response))
              writeFileSync(
                publishCLI,
                `#!/usr/bin/env node\nconst fs=require('node:fs');process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>fs.copyFileSync(${JSON.stringify(responsePath)},process.argv[process.argv.indexOf('--output-last-message')+1]),1500));\n`,
              )
              chmodSync(publishCLI, 0o755)
              await evaluate(
                `window.electronAPI.invoke('workflow:configure',{codexPath:${JSON.stringify(publishCLI)}})`,
              )
              window.focus()
              await delay(150)
              await evaluate('document.querySelector("[data-publish-generate]").focus()')
              assert.ok(
                await evaluate(
                  'document.activeElement.matches("[data-publish-generate]") && !document.activeElement.disabled',
                ),
              )
              window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
              window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
              await delay(100)
              assert.ok(await evaluate('document.querySelector(".workflow-job-progress")'))
              await waitFor(
                'document.querySelector("[data-publish-status]").textContent.includes("正在生成")',
                'publish AI loading',
              )
              assert.equal(
                await evaluate(
                  'document.querySelector("[data-publish-generate]").disabled && document.querySelector("input[maxlength]").disabled',
                ),
                true,
              )
              await screenshot('publish-ai-running-dark-1440.png')
              await waitFor(
                'document.querySelector("input[maxlength]").value==="视频为什么需要逐步审核？"',
                'publish AI result',
              )
              const firstResult = await evaluate(
                `window.electronAPI.invoke('workflow:get',${JSON.stringify(currentProject.id)}).then(result=>result.data)`,
              )
              assert.equal(firstResult.stages.publish.status, 'review')
              assert.deepEqual(firstResult.stages.publish.payload.platforms.bilibili, savedBilibili)
              assert.deepEqual(firstResult.stages.publish.payload.platforms.douyin, response)
              assert.ok(
                await evaluate(
                  '[...document.querySelectorAll("button")].some(item=>item.textContent.includes("导出抖音发布包")&&item.disabled)',
                ),
              )
              await evaluate(
                'document.querySelector(".workflow-artifact-card details").open=false;document.querySelector("[data-publish-sources]").closest(".workflow-stage-heading").scrollIntoView({block:"start"})',
              )
              await screenshot('publish-ai-review-dark-1440.png')
              const second = { ...response, title: 'AI 视频如何把好审核关？' }
              writeFileSync(responsePath, JSON.stringify(second))
              await click('AI 重新生成发布资料')
              await waitFor(
                'document.querySelector("input[maxlength]").value==="AI 视频如何把好审核关？"',
                'publish AI regeneration',
              )
              writeFileSync(responsePath, JSON.stringify({ ...response, title: '长'.repeat(31) }))
              await click('AI 重新生成发布资料')
              await waitFor(
                'document.querySelector("[data-publish-status]").textContent.includes("正在生成")',
                'invalid AI run',
              )
              await waitFor(
                'document.querySelector(".workflow-job-error") || [...document.querySelectorAll("summary")].some(item=>item.textContent.includes("错误")) || document.querySelector(".workflow-task-section").textContent.includes("发布标题不能为空")',
                'invalid AI failure',
              )
              assert.equal(
                await evaluate('document.querySelector("input[maxlength]").value'),
                second.title,
              )
              assert.equal(
                await evaluate('document.querySelector("[data-publish-generate]").disabled'),
                false,
              )
              writeFileSync(responsePath, JSON.stringify(second))
              await click('AI 重新生成发布资料')
              await waitFor(
                '!document.querySelector("[data-publish-generate]").disabled',
                'retry success',
              )
              await click('AI 重新生成发布资料')
              await waitFor(
                'document.querySelector(".workflow-job-progress")',
                'cancel publish running',
              )
              await click('取消任务')
              await waitFor(
                '!document.querySelector("[data-publish-generate]").disabled',
                'publish cancelled',
              )
              assert.equal(
                await evaluate('document.querySelector("input[maxlength]").value'),
                second.title,
              )
              window.setSize(1024, 900)
              await screenshot('publish-ai-review-dark-1024.png')
              assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
              window.webContents.setZoomFactor(2)
              await evaluate(
                'document.querySelector("[data-publish-generate]").focus();document.querySelector("[data-publish-generate]").scrollIntoView({block:"center"})',
              )
              await screenshot('publish-ai-review-dark-zoom200.png')
              assert.ok(
                await evaluate(
                  'document.activeElement.matches("[data-publish-generate]") && document.documentElement.scrollWidth<=innerWidth+1',
                ),
              )
              window.webContents.setZoomFactor(1)
              window.setSize(1440, 1100)
            }
            await evaluate(
              '[...document.querySelectorAll("input[type=radio]")].find(item=>item.value==="douyin").click()',
            )
            await waitFor(`document.querySelector('input[maxlength="30"]')`, 'Douyin metadata')
            assert.equal(
              await evaluate(
                'document.querySelectorAll(".workflow-artifact-card input[maxlength]").length',
              ),
              1,
            )
            await evaluate(
              '[...document.querySelectorAll("input[type=radio]")].find(item=>item.value==="bilibili").click()',
            )
          }
          assert.equal(await evaluate('document.querySelectorAll(".workflow-step").length'), 8)
          assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'))
          await evaluate('document.querySelector("main").scrollTop=0')
          await screenshot('aligned-' + stageKeys[index] + '-' + theme + '-1440.png')
        }
      }
      await evaluate('document.querySelectorAll(".workflow-step-button")[6].click()')
      await waitFor('document.querySelector("video")?.readyState>=1', 'actual video metadata')
      assert.ok(await evaluate('document.querySelector("video").videoWidth===1920'))
      await evaluate('document.querySelector("video").currentTime=2.5')
      await waitFor(
        'document.querySelector("video").readyState>=2 && Math.abs(document.querySelector("video").currentTime-2.5)<0.1',
        'video seeking',
      )
      await screenshot('07-final-video-light-1440.png')
    }
    console.log(
      'PASS: real Electron IPC, creation, save/review gates, two scene layouts, Agent inputs, sandbox preview, keyboard focus, 1440/1024/200% and persisted project',
    )
    app.quit()
  } catch (error) {
    console.error(error)
    if (window) await screenshot('failure.png')
    app.exit(1)
  }
})
