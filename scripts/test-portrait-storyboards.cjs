require('tsx/cjs')
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const {
  sceneHtml,
  safeStoryboardDocument,
} = require('../src/main/services/video-workflow/storyboard.ts')
const { prepareMotionScene } = require('../src/main/services/video-workflow/motion.ts')
const {
  TEMPLATE_FAMILIES,
  sceneLayoutsForTemplate,
  videoFrame,
} = require('../src/shared/video-workflow.ts')
const root = mkdtempSync(join(tmpdir(), 'portrait-storyboards-'))
app.setPath('userData', root)
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.whenReady().then(async () => {
  const frame = videoFrame('portrait')
  const window = new BrowserWindow({
    show: false,
    ...frame,
    useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true },
  })
  const results = []
  try {
    for (const template of TEMPLATE_FAMILIES) {
      for (const layout of sceneLayoutsForTemplate(template.id)) {
        for (const stress of [false, true]) {
          const scene = {
            id: layout,
            layout,
            title: stress ? '历史文化的传播需要尊重语境与证据'.repeat(2) : '从历史走向人间',
            body: stress ? '文'.repeat(180) : '依据史料讲清人物与时代\n从具体事件理解选择与转折',
          }
          const html = sceneHtml(scene, template.id, 'portrait')
          await window.loadURL(
            'data:text/html;charset=utf-8,' +
              encodeURIComponent(safeStoryboardDocument(html, frame)),
          )
          await window.webContents.executeJavaScript('document.fonts.ready')
          const overflow = await window.webContents.executeJavaScript(
            `(() => [...document.querySelectorAll('h1,.history-entry p,.history-entry-label,.history-diagram-note,.history-route-label,.block p')].filter(element=>getComputedStyle(element).display!=='none').map(element=>{const bounds=element.getBoundingClientRect();return {text:element.textContent,top:bounds.top,bottom:bounds.bottom,left:bounds.left,right:bounds.right}}).filter(bounds=>bounds.bottom>1620||bounds.top<60||bounds.right>1010||bounds.left<35))()`,
          )
          assert.deepEqual(
            overflow,
            [],
            `${template.id}/${layout}/${stress}: ${JSON.stringify(overflow)}`,
          )
          if (!stress)
            writeFileSync(
              join(root, `${template.id}-${layout}.png`),
              (await window.webContents.capturePage()).toPNG(),
            )
          await prepareMotionScene(html, 'check-scene', [], new AbortController().signal, frame)
          results.push({ template: template.id, layout, stress })
        }
      }
    }
    await assert.rejects(
      prepareMotionScene(
        '<style>body{width:1920px;height:1080px}</style><section style="width:100%;height:100%">横版</section>',
        'bad-canvas',
        [],
        new AbortController().signal,
        frame,
      ),
      /错误画幅/,
    )
    writeFileSync(join(root, 'verification.json'), JSON.stringify(results, null, 2))
    console.log(
      `PASS: ${results.length} portrait template layout / content cases and incorrect body canvas rejected. Artifacts:`,
      root,
    )
    window.destroy()
    app.exit(0)
  } catch (error) {
    console.error(error, 'Artifacts:', root)
    window.destroy()
    app.exit(1)
  }
})
