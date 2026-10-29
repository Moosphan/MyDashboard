const { app, BrowserWindow, dialog, nativeImage, shell, net } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync, readFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { spawnSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')

const root = mkdtempSync(join(tmpdir(), 'publication-cover-ui-'))
const originalFetch = net.fetch.bind(net)
let recoveredDownloads = 0
net.fetch = (url, options) => {
  if (url === 'https://image-recovery.example/generated-cover.png') {
    recoveredDownloads++
    assert.equal(options.credentials, 'omit')
    return Promise.resolve(new Response(readFileSync(join(root, 'cover-source.png'))))
  }
  return originalFetch(url, options)
}
const revealed = []
shell.showItemInFolder = path => revealed.push(path)
const node = spawnSync('which', ['node'], { encoding: 'utf8' }).stdout.trim()
const seed = spawnSync(process.execPath, ['--import', 'tsx', join(__dirname, 'seed-bilibili-publishing.ts'), root, node], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8',
})
assert.equal(seed.status, 0, seed.stderr)
process.env.MYDASHBOARD_USER_DATA = root
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
const initial = JSON.parse(readFileSync(join(root, 'seed-project.json'), 'utf8'))
require('../out/main/index.js')

app.whenReady().then(async () => {
  let window
  const evaluate = source => window.webContents.executeJavaScript(source, true)
  const waitFor = async (source, label) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await evaluate(`Boolean(${source})`)) return
      await delay(100)
    }
    throw new Error(`Timed out: ${label}`)
  }
  const click = async name => {
    assert.ok(await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find(item =>
        (item.textContent.trim() === ${JSON.stringify(name)} || item.getAttribute('aria-label') === ${JSON.stringify(name)}) && !item.disabled)
      if (!button) return false
      button.click(); return true
    })()`), name)
    await delay(150)
  }
  const call = async (action, ...args) => {
    const result = await evaluate(`window.electronAPI.invoke(${JSON.stringify(`workflow:${action}`)}, ...${JSON.stringify(args)})`)
    assert.equal(result.success, true, result.error)
    return result.data
  }
  const key = async keyCode => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await delay(120)
  }
  const screenshot = async name => {
    await evaluate('document.querySelector("[role=dialog], [data-publication-cover]").scrollIntoView({block:"center"})')
    await delay(100)
    writeFileSync(join(root, name), (await window.webContents.capturePage()).toPNG())
  }
  const completed = async () => {
    let project
    for (let attempt = 0; attempt < 200; attempt++) {
      project = await call('get', initial.id)
      if (!project.jobs.some(job => job.state === 'running')) return project
      await delay(100)
    }
    throw new Error('Cover task did not complete')
  }
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      window = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().startsWith('file:'))
      if (window && !window.webContents.isLoadingMainFrame()) break
      await delay(100)
    }
    window.setMinimumSize(720, 640)
    window.setSize(1440, 1100)
    await waitFor('document.querySelector("nav")', 'app ready')
    await evaluate("window.history.pushState({},'', '/video');window.dispatchEvent(new PopStateEvent('popstate'))")
    await waitFor('document.querySelector(".workflow-project-row")', 'project list')
    await click('继续创作')
    await waitFor('document.querySelector("[data-publication-cover]")', 'cover panel')
    await waitFor('document.querySelector("[data-cover-source]")?.textContent.includes("成片截帧")', 'original source label')
    await screenshot('cover-original-light-1440.png')
    await click('放大预览封面')
    assert.equal(await evaluate('document.querySelectorAll("[role=dialog] input[type=radio]").length'), 2)
    for (const [ratio, expected] of [['feed', 4 / 3], ['landscape', 16 / 9]]) {
      await evaluate(`document.querySelector('[role=dialog] input[value=${ratio}]').click()`)
      const actual = await evaluate(`(() => {const rect=document.querySelector('.workflow-cover-preview').getBoundingClientRect();return rect.width/rect.height})()`)
      assert.ok(Math.abs(actual - expected) < 0.02, `${ratio}: ${actual}`)
      await click('打开预览封面所在文件夹')
      assert.equal(revealed.at(-1), join(root, initial.stages.render.payload.cover.path))
    }
    await key('Escape')
    await click('打开封面所在文件夹')
    assert.equal(revealed.at(-1), join(root, initial.stages.render.payload.cover.path))
    assert.equal(await evaluate('document.querySelector("[data-publication-cover] textarea")'), null)
    await click('AI 生成封面')
    await waitFor('document.querySelector("[role=dialog] textarea")', 'cover generation dialog')
    assert.equal((await call('get', initial.id)).jobs.length, initial.jobs.length)
    await evaluate(`(() => {
      const field = document.querySelector('[role=dialog] textarea')
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, '保留当前风格')
      field.dispatchEvent(new Event('input', {bubbles:true}))
    })()`)
    await key('Escape')
    assert.equal(await evaluate('document.activeElement.hasAttribute("data-cover-generate")'), true)
    await click('AI 生成封面')
    assert.equal(await evaluate('document.querySelector("[role=dialog] textarea").value'), '保留当前风格')
    const runtime = await call('runtime')
    await call('configure', { ...runtime, bunPath: '' })
    await evaluate('document.querySelector("[role=dialog] input[value=image2]").click()')
    await click('开始生成封面')
    await waitFor('document.querySelector("[role=dialog] [role=alert]")?.textContent.includes("未能启动")', 'launch error keeps dialog')
    assert.ok(await evaluate('document.body.textContent.includes("请在执行环境配置 Image2 脚本和 Bun 路径")'))
    assert.equal((await call('get', initial.id)).jobs.length, initial.jobs.length)
    assert.equal(await evaluate('document.querySelector("[role=dialog] textarea").value'), '保留当前风格')
    await call('configure', runtime)
    await evaluate('document.querySelector("[role=dialog] input[value=code]").click()')
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1000)
        await screenshot(`cover-generation-${theme}-${width}.png`)
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
      }
    }
    window.webContents.setZoomFactor(2)
    await screenshot('cover-generation-200percent.png')
    await key('Tab')
    assert.ok(await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'))
    window.webContents.setZoomFactor(1)
    window.setSize(1440, 1100)
    await evaluate('document.documentElement.classList.remove("dark")')
    await click('开始生成封面')
    let project = await completed()
    await waitFor('!document.querySelector("[role=dialog]")', 'generation accepted')
    assert.equal(project.jobs[0].state, 'succeeded', project.jobs[0].error)
    assert.equal(project.jobs[0].operation.action, 'generate-cover')
    const first = project.stages.publish.payload.platforms.bilibili.cover
    assert.equal(first.method, 'code')
    assert.equal(first.sourceRenderId, initial.stages.render.id)
    assert.ok(first.designFile)
    assert.equal(project.stages.publish.status, 'review')
    for (const [file, height] of [[first.file, 900], [first.feedFile, 1200]]) {
      assert.deepEqual(nativeImage.createFromPath(join(root, file.path)).getSize(), { width: 1600, height })
      assert.ok(file.size <= 4 * 1024 * 1024)
    }
    const prompt = readFileSync(join(root, 'cover-prompt.txt'), 'utf8')
    assert.ok(prompt.includes('审核文案') && prompt.includes('font-family') && prompt.includes('内容要饱满'))
    for (const stage of ['brief', 'copy', 'storyboard', 'narration', 'audio', 'roughcut', 'render'])
      assert.equal(project.stages[stage].id, initial.stages[stage].id)
    assert.deepEqual(project.stages.publish.payload.platforms.douyin, initial.stages.publish.payload.platforms.douyin)
    await waitFor('document.querySelector("[data-cover-generate]")?.textContent.includes("重新生成")', 'cover applied')
    await waitFor('document.querySelector("[data-cover-source]")?.textContent.includes("独立封面")', 'generated source label')
    await click('打开封面所在文件夹')
    assert.equal(revealed.at(-1), join(root, first.feedFile.path))
    await click('放大预览封面')
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${theme === 'dark'})`)
      for (const ratio of ['feed', 'landscape']) {
        await evaluate(`document.querySelector('[role=dialog] input[value=${ratio}]').click()`)
        await waitFor('document.querySelector(".workflow-cover-preview")?.complete', 'preview ready')
        const dimensions = await evaluate('(() => {const image=document.querySelector(".workflow-cover-preview");const rect=image.getBoundingClientRect();return {width:image.naturalWidth,height:image.naturalHeight,ratio:rect.width/rect.height}})()')
        assert.equal(dimensions.width, 1600)
        assert.equal(dimensions.height, ratio === 'feed' ? 1200 : 900)
        assert.ok(Math.abs(dimensions.ratio - (ratio === 'feed' ? 4 / 3 : 16 / 9)) < 0.02)
        await click('打开预览封面所在文件夹')
        assert.equal(revealed.at(-1), join(root, (ratio === 'feed' ? first.feedFile : first.file).path))
        for (const width of [1440, 1024]) {
          window.setSize(width, 1000)
          await screenshot(`cover-preview-${theme}-${ratio}-${width}.png`)
          assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
        }
      }
    }
    window.webContents.setZoomFactor(2)
    await screenshot('cover-preview-200percent.png')
    await key('Tab')
    assert.ok(await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'))
    await key('Escape')
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), '放大预览封面')
    window.webContents.setZoomFactor(1)
    window.setSize(1440, 1100)
    await evaluate('document.documentElement.classList.remove("dark")')
    writeFileSync(join(root, 'cover-mode'), 'v2')
    const options = { method: 'code', feedback: '标题更醒目，保留奶油色背景' }
    await click('重新生成封面')
    await evaluate(`(() => {
      const field = document.querySelector('[role=dialog] textarea')
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, ${JSON.stringify(options.feedback)})
      field.dispatchEvent(new Event('input', {bubbles:true}))
    })()`)
    await click('开始生成封面')
    project = await completed()
    const second = project.stages.publish.payload.platforms.bilibili.cover
    assert.notEqual(first.file.sha256, second.file.sha256)
    assert.equal(second.feedback, options.feedback)
    assert.ok(readFileSync(join(root, 'cover-prompt.txt'), 'utf8').includes(options.feedback))
    assert.ok(readFileSync(join(root, 'cover-prompt.txt'), 'utf8').includes('一份内容，两种封面'))
    writeFileSync(join(root, 'cover-mode'), 'api-error')
    await call('generate', { projectId: initial.id, stage: 'publish', executor: 'codex', expectedRevision: project.revision, requestId: 'image2-api-error', cover: { method: 'image2' } })
    project = await completed()
    assert.equal(project.jobs[0].state, 'failed')
    assert.match(project.jobs[0].error, /HTTP 503 upstream unavailable/)
    for (const secret of ['test-private-token', 'test-private-key', 'sk-exampleSensitiveCredential12345'])
      assert.ok(!project.jobs[0].error.includes(secret))
    assert.equal(project.stages.publish.payload.platforms.bilibili.cover.file.id, second.file.id)
    for (const method of ['code', 'image2']) {
      writeFileSync(join(root, 'cover-mode'), 'invalid')
      await call('generate', { projectId: initial.id, stage: 'publish', executor: 'codex', expectedRevision: project.revision, requestId: `invalid-${method}`, cover: { method } })
      project = await completed()
      assert.equal(project.jobs[0].state, 'failed')
      assert.equal(project.stages.publish.payload.platforms.bilibili.cover.file.id, second.file.id)
    }
    writeFileSync(join(root, 'cover-mode'), 'slow')
    const slow = await call('generate', { projectId: initial.id, stage: 'publish', executor: 'codex', expectedRevision: project.revision, requestId: 'cancel-cover', cover: { method: 'code' } })
    await call('cancel', slow.id)
    project = await completed()
    assert.equal(project.jobs[0].state, 'cancelled')
    assert.equal(project.stages.publish.payload.platforms.bilibili.cover.file.id, second.file.id)
    writeFileSync(join(root, 'cover-mode'), '')
    await call('generate', { projectId: initial.id, stage: 'publish', executor: 'codex', expectedRevision: project.revision, requestId: 'image2-cover', cover: { method: 'image2', feedback: '中文标题居中安全区' } })
    project = await completed()
    assert.equal(project.jobs[0].state, 'succeeded', project.jobs[0].error)
    assert.equal(project.jobs[0].executor, 'image2')
    const image2 = project.stages.publish.payload.platforms.bilibili.cover
    assert.equal(image2.method, 'image2')
    const imageArgs = JSON.parse(readFileSync(join(root, 'cover-image-args.json'), 'utf8'))
    assert.equal(imageArgs[imageArgs.indexOf('--model') + 1], 'gpt-image-2')
    assert.equal(imageArgs[imageArgs.indexOf('--size') + 1], '1600x1200')
    assert.deepEqual(nativeImage.createFromPath(join(root, image2.file.path)).getSize(), { width: 1600, height: 900 })
    writeFileSync(join(root, 'cover-mode'), 'download-error')
    const recoveryJob = await call('generate', { projectId: initial.id, stage: 'publish', executor: 'codex', expectedRevision: project.revision, requestId: 'recover-image2-cover', cover: { method: 'image2' } })
    project = await completed()
    assert.equal(project.jobs[0].state, 'succeeded', project.jobs[0].error)
    assert.equal(recoveredDownloads, 1)
    assert.equal(readFileSync(join(root, 'cover-generation-count'), 'utf8'), '1')
    const recoveryDirectory = join(root, 'cache/video-cover-recovery', initial.id, recoveryJob.id)
    assert.ok(existsSync(join(recoveryDirectory, 'result.json')))
    assert.deepEqual(nativeImage.createFromPath(join(recoveryDirectory, 'original.png')).getSize(), {width:1600,height:1200})
    assert.ok(!existsSync(join(root, 'cache/video-workflow', recoveryJob.id)))
    assert.equal(project.stages.publish.payload.platforms.bilibili.cover.method, 'image2')
    writeFileSync(join(root, 'cover-mode'), '')
    await waitFor('document.querySelector("[data-cover-status]")?.textContent.includes("已纳入")', 'image2 applied')
    await evaluate('document.querySelector("button[aria-label=封面历史版本]").focus()')
    await key('Space')
    await waitFor('document.querySelector("[role=listbox]")', 'cover history opens')
    await key('End')
    await key('Enter')
    await click('使用此封面')
    await click('保存草稿')
    await click('确认保存新版本')
    await waitFor('!document.querySelector("[role=dialog]")', 'cover switch saved')
    project = await call('get', initial.id)
    assert.equal(project.stages.publish.payload.platforms.bilibili.cover.file.id, first.file.id)
    assert.equal(project.stages.publish.status, 'review')
    const wrongSource = structuredClone(project.stages.publish.payload)
    wrongSource.platforms.bilibili.cover.sourceRenderId = 'wrong-render'
    const rejected = await evaluate(`window.electronAPI.invoke('workflow:save',${JSON.stringify(initial.id)},'publish',${JSON.stringify(wrongSource)},${project.revision},'wrong-source')`)
    assert.equal(rejected.success, false)
    assert.match(rejected.error, /成片已变化/)
    await call('approve', project.id, 'publish', project.stages.publish.id, project.revision, 'approve-cover', '')
    const exported = await call('export', project.id, 'bilibili')
    assert.deepEqual(readFileSync(join(exported, 'cover.png')), readFileSync(join(root, first.file.path)))
    assert.deepEqual(readFileSync(join(exported, 'cover-4x3.png')), readFileSync(join(root, first.feedFile.path)))
    project = await call('get', project.id)
    writeFileSync(join(root, 'mode'), '')
    await call('bilibiliConnection')
    const submission = await call('bilibiliPublish', { projectId: project.id, expectedRevision: project.revision, requestId: 'cover-upload', accountUid: '123', category: '17', visibility: 'public', copyright: 'original', source: '' })
    assert.equal(submission.snapshot.cover.id, first.file.id)
    await waitFor('document.querySelector("[data-bilibili-submission=reviewing]")', 'selected cover uploaded')
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${theme === 'dark'})`)
      for (const width of [1440, 1024]) {
        window.setSize(width, 1000)
        await screenshot(`cover-panel-${theme}-${width}.png`)
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
        assert.ok(await evaluate(`(() => {
          const section = document.querySelector('[data-publication-cover]')
          const right = section.getBoundingClientRect().right
          return [...section.querySelectorAll('.workflow-cover-summary p, .workflow-cover-summary button')]
            .every(element => element.getBoundingClientRect().right <= right + 1)
        })()`), `cover content stays in main column: ${theme} ${width}`)
      }
    }
    window.webContents.setZoomFactor(2)
    await screenshot('cover-panel-200percent.png')
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
    console.log('PUBLICATION_COVERS_OK', root)
    app.exit(0)
  } catch (error) {
    console.error(error)
    if (window) writeFileSync(join(root, 'failure.png'), (await window.webContents.capturePage()).toPNG())
    app.exit(1)
  }
})
