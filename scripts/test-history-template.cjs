const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { spawnSync } = require('node:child_process')

const directory = resolve('.scratch/history-template')
app.setPath('userData', mkdtempSync(join(tmpdir(), 'history-template-render-')))
app.commandLine.appendSwitch('force-device-scale-factor', '1')
const generated = spawnSync(
  process.execPath,
  ['--import', 'tsx', join(__dirname, 'preview-history-template.ts'), directory],
  {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
  },
)
assert.equal(generated.status, 0, generated.stderr)
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1920,
    height: 1080,
    useContentSize: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      offscreen: true,
      backgroundThrottling: false,
    },
  })
  try {
    const scenes = JSON.parse(readFileSync(join(directory, 'scenes.json'), 'utf8'))
    assert.equal(new Set(scenes.map((scene) => scene.layout)).size, 10)
    const results = []
    const checks = scenes.flatMap((scene) => [
      scene,
      ...[90, 180].map((size) => ({ ...scene, id: `${scene.id}-stress-${size}` })),
      ...(['map', 'relations', 'artifact'].includes(scene.layout)
        ? [{ ...scene, id: `${scene.id}-stress-nodes` }]
        : []),
    ])
    for (const scene of checks) {
      await window.loadFile(join(directory, scene.id + '.html'))
      await window.webContents.executeJavaScript('document.fonts.ready')
      const overflow = await window.webContents.executeJavaScript(`(() => {
        const elements=[...document.querySelectorAll('h1,.history-entry p,.history-entry-label,.history-diagram-note,.history-route-label')];
        return elements.filter(element=>getComputedStyle(element).display!=='none'&&element.getBoundingClientRect().height>0).map(element=>{
          const bounds=element.getBoundingClientRect();
          return {text:element.textContent,top:bounds.top,bottom:bounds.bottom,right:bounds.right,left:bounds.left};
        }).filter(bounds=>bounds.bottom>914||bounds.top<160||bounds.right>1830||bounds.left<90);
      })()`)
      assert.deepEqual(overflow, [], `${scene.id}: ${JSON.stringify(overflow)}`)
      assert.ok(
        await window.webContents.executeJavaScript(
          '(()=>{const seal=document.querySelector(".history-seal");return seal.scrollHeight<=seal.clientHeight&&seal.scrollWidth<=seal.clientWidth})()',
        ),
        `${scene.id}: seal fits`,
      )
      const capture = await window.webContents.capturePage()
      assert.ok(!capture.isEmpty(), `${scene.id}: screenshot is available`)
      writeFileSync(join(directory, scene.id + '.png'), capture.toPNG())
      if (scene.id === scene.layout)
        writeFileSync(
          join(directory, scene.id + '-thumb.png'),
          capture.resize({ width: 960 }).toPNG(),
        )
      results.push({ layout: scene.layout, overflow })
    }
    writeFileSync(join(directory, 'verification.json'), JSON.stringify(results, null, 2))
    window.setContentSize(1200, 2000)
    await window.loadFile(join(directory, 'index.html'))
    await window.webContents.executeJavaScript(`(async () => {
      const images = [...document.querySelectorAll('.page iframe')].map(frame => {
        const image = document.createElement('img');
        image.src = frame.src.replace('.html', '-thumb.png');
        image.style.cssText = 'width:100%;height:100%;display:block';
        frame.replaceWith(image);
        return image;
      });
      for (const image of images) {
        try { await image.decode(); }
        catch (error) { throw new Error(image.src + ': ' + error.message); }
      }
    })()`)
    await window.webContents.executeJavaScript(
      'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
    )
    writeFileSync(join(directory, 'overview.png'), (await window.webContents.capturePage()).toPNG())
    console.log(
      `History template: ${scenes.length} layouts, ${checks.length} pages render without text overflow. Artifacts:`,
      directory,
    )
    window.destroy()
    app.exit(0)
  } catch (error) {
    console.error(error.stack ?? error)
    window.destroy()
    app.exit(1)
  }
})
