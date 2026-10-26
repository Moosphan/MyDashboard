const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync, mkdirSync, mkdtempSync } = require('node:fs')
const { resolve, join } = require('node:path')
const { tmpdir } = require('node:os')
const { pathToFileURL } = require('node:url')

const directory = resolve('resources/visuals/traditional-culture')
const output = resolve('.scratch/traditional-culture')
mkdirSync(output, { recursive: true })
app.setPath('userData', mkdtempSync(join(tmpdir(), 'culture-assets-preview-')))
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1920,
    height: 1080,
    useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true },
  })
  try {
    const catalog = JSON.parse(readFileSync(join(directory, 'catalog.json'), 'utf8'))
    await window.loadFile(join(directory, 'demo/cover.html'))
    const exported = []
    for (const asset of catalog.assets) {
      for (const palette of Object.keys(catalog.palettes)) {
        const svg = readFileSync(join(directory, asset.files[palette]), 'utf8')
        if (/<script|<image|<foreignObject|\son\w+=|href=|url\(/i.test(svg))
          throw new Error(`${asset.id}/${palette}: unexpected active or external resource`)
        const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
        if (new Set(ids).size !== ids.length)
          throw new Error(`${asset.id}/${palette}: duplicate element IDs`)
        const source = pathToFileURL(join(directory, asset.files[palette])).href
        const result = await window.webContents.executeJavaScript(`(async () => {
          const image = new Image();image.src=${JSON.stringify(source)};await image.decode();
          const canvas = document.createElement('canvas');canvas.width=1500;canvas.height=1200;
          const context=canvas.getContext('2d');context.drawImage(image,0,0,1500,1200);
          const pixel=context.getImageData(0,0,1,1).data;
          return {data:canvas.toDataURL('image/png').split(',')[1],cornerAlpha:pixel[3]};
        })()`)
        if (result.cornerAlpha !== 0)
          throw new Error(`${asset.id}/${palette}: background is not transparent`)
        writeFileSync(
          join(directory, palette, asset.id + '.png'),
          Buffer.from(result.data, 'base64'),
        )
        exported.push(`${palette}/${asset.id}`)
      }
    }
    for (const id of ['cover', 'temple-study', 'palace-chapter', 'garden-quote']) {
      await window.loadFile(join(directory, 'demo', id + '.html'))
      await window.webContents.executeJavaScript('document.fonts.ready')
      await window.webContents.executeJavaScript(
        'Promise.all([...document.images].map(image=>image.decode()))',
      )
      const bounds = await window.webContents.executeJavaScript(
        `Array.from(document.querySelectorAll('h1,.body-copy,.notes,.chapter-note')).map(element=>{const bounds=element.getBoundingClientRect();return {text:element.textContent,top:bounds.top,bottom:bounds.bottom,left:bounds.left,right:bounds.right}})`,
      )
      if (
        bounds.some(
          (item) => item.top < 160 || item.bottom > 920 || item.left < 90 || item.right > 1830,
        )
      )
        throw new Error(`${id}: text outside safe bounds: ${JSON.stringify(bounds)}`)
      const image = await window.webContents.capturePage()
      writeFileSync(join(output, id + '.png'), image.resize({ width: 1920 }).toPNG())
      writeFileSync(
        join(directory, 'demo', id + '-preview.png'),
        image.resize({ width: 960 }).toPNG(),
      )
    }
    window.setContentSize(1440, 1050)
    await window.loadFile(join(directory, 'demo/index.html'))
    await window.webContents.executeJavaScript('document.fonts.ready')
    await window.webContents.executeJavaScript(
      'Promise.all([...document.images].filter(image=>image.loading!=="lazy").map(image=>image.decode()))',
    )
    writeFileSync(
      join(output, 'gallery.png'),
      (await window.webContents.capturePage()).resize({ width: 1440 }).toPNG(),
    )
    const galleryOverflow = await window.webContents.executeJavaScript(
      'document.documentElement.scrollWidth>innerWidth',
    )
    if (galleryOverflow) throw new Error('Gallery horizontal overflow at 1440px')
    window.setContentSize(1440, 1280)
    await window.webContents.executeJavaScript(`(() => {
      document.querySelector('.hero').remove();document.querySelector('.collection').remove();document.querySelector('footer').remove();
      document.querySelector('main').style.padding='32px';
      for(const image of document.querySelectorAll('img'))image.loading='eager';
    })()`)
    await window.webContents.executeJavaScript(
      'Promise.all([...document.images].map(image=>image.decode()))',
    )
    writeFileSync(
      join(output, 'compositions-overview.png'),
      (await window.webContents.capturePage()).resize({ width: 1440 }).toPNG(),
    )
    await window.loadFile(join(directory, 'demo/index.html'))
    await window.webContents.executeJavaScript(
      'Promise.all([...document.querySelectorAll("[data-asset]")].map(image=>image.decode()))',
    )
    await window.webContents.executeJavaScript(`(() => {
      document.querySelector('.hero').remove();document.querySelector('.applications').remove();document.querySelector('footer').remove();
      document.querySelector('.section-top').style.marginTop='30px';
      document.querySelector('main').style.padding='32px';
      const sheet=document.createElement('style');sheet.textContent='.art-link{height:300px}.asset-description,.asset-downloads{display:none}.asset-grid{gap:24px}.asset-caption h3{font-size:20px}.asset-caption span{font-size:10px}';document.head.append(sheet);
    })()`)
    window.setContentSize(1440, 1820)
    writeFileSync(
      join(output, 'elements-overview.png'),
      (await window.webContents.capturePage()).resize({ width: 1440 }).toPNG(),
    )
    for (const palette of ['ink', 'cinnabar']) {
      await window.loadFile(join(directory, 'demo/index.html'), { query: { palette } })
      await window.webContents.executeJavaScript(
        'Promise.all([...document.querySelectorAll("[data-asset]")].map(image=>image.decode()))',
      )
      const current = await window.webContents.executeJavaScript(
        'document.querySelector("[aria-current=true]").dataset.palette',
      )
      if (current !== palette) throw new Error(`Palette selection failed: ${palette}`)
    }
    window.setContentSize(760, 1000)
    await window.loadFile(join(directory, 'demo/index.html'))
    if (
      await window.webContents.executeJavaScript('document.documentElement.scrollWidth>innerWidth')
    )
      throw new Error('Gallery horizontal overflow at 760px')
    writeFileSync(
      join(output, 'verification.json'),
      JSON.stringify(
        {
          svg: exported.length,
          transparentPng: exported.length,
          compositions: 4,
          palettes: 3,
          viewport: [1440, 760],
          textSafeBounds: true,
        },
        null,
        2,
      ),
    )
    console.log(
      'Traditional culture assets rendered: 24 SVG + transparent PNG, four compositions, three palettes, no text overflow. Preview:',
      output,
    )
    window.destroy()
    app.exit(0)
  } catch (error) {
    console.error(error.stack ?? error)
    window.destroy()
    app.exit(1)
  }
})
