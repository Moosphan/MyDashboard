const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync, mkdirSync, mkdtempSync } = require('node:fs')
const { resolve, join } = require('node:path')
const { tmpdir } = require('node:os')
const { pathToFileURL } = require('node:url')

const directory = resolve(__dirname, '../resources/visuals/traditional-culture')
const output = resolve(__dirname, '../.scratch/traditional-culture')
mkdirSync(output, { recursive: true })
app.setPath('userData', mkdtempSync(join(tmpdir(), 'ink-wash-preview-')))
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1440,
    height: 1780,
    useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true },
  })
  try {
    await window.loadFile(join(directory, 'demo/ink-study.html'))
    await window.webContents.executeJavaScript('document.fonts.ready')
    await window.webContents.executeJavaScript(
      'Promise.all([...document.images].map(image=>image.decode()))',
    )
    const catalog = JSON.parse(readFileSync(join(directory, 'ink-wash/catalog.json'), 'utf8'))
    const exported = []
    for (const asset of catalog.assets) {
      const source = readFileSync(join(directory, 'ink-wash', asset.svg), 'utf8')
      if (/<script|<image|<foreignObject|\son\w+=|href=/i.test(source))
        throw new Error(asset.id + ': active/external resource')
      const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
      if (new Set(ids).size !== ids.length) throw new Error(asset.id + ': duplicate IDs')
      for (const match of source.matchAll(/url\(#([^)]+)\)/g))
        if (!ids.includes(match[1])) throw new Error(asset.id + ': unresolved filter or mask')
      const url = pathToFileURL(join(directory, 'ink-wash', asset.svg)).href
      const rendered = await window.webContents.executeJavaScript(`(async()=>{
        const image=new Image();image.src=${JSON.stringify(url)};await image.decode();
        const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;
        const context=canvas.getContext('2d');context.drawImage(image,0,0);
        const pixels=context.getImageData(0,0,1600,1000).data;
        let painted=0;for(let offset=3;offset<pixels.length;offset+=4)if(pixels[offset]>20)painted++;
        return {data:canvas.toDataURL('image/png').split(',')[1],cornerAlpha:pixels[3],painted};
      })()`)
      if (rendered.cornerAlpha !== 0 || rendered.painted < 40000)
        throw new Error(asset.id + ': missing art or transparency')
      writeFileSync(join(directory, 'ink-wash', asset.png), Buffer.from(rendered.data, 'base64'))
      exported.push({ id: asset.id, painted: rendered.painted, cornerAlpha: rendered.cornerAlpha })
    }
    const detail = await window.webContents.executeJavaScript(`(async()=>{
      const sources=${JSON.stringify(['misty-mountains.png', 'pagoda-pines.png'].map((name) => pathToFileURL(join(directory, 'ink-wash', name)).href))};
      const pictures=await Promise.all(sources.map(async source=>{const image=new Image();image.src=source;await image.decode();return image}));
      const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;
      const context=canvas.getContext('2d');context.fillStyle='#dfc69c';context.fillRect(0,0,1600,1000);
      context.fillStyle='#434d41';context.font='30px "Songti SC",serif';
      context.fillText('山石 · 青灰与淡赭',60,75);context.fillText('古塔 · 薄檐与连贯塔身',930,75);
      context.drawImage(pictures[0],730,180,750,720,35,130,845,811);
      context.drawImage(pictures[1],875,215,330,535,1020,140,470,762);
      return canvas.toDataURL('image/png').split(',')[1];
    })()`)
    writeFileSync(join(output, 'ink-wash-details.png'), Buffer.from(detail, 'base64'))
    const collection = await window.webContents.executeJavaScript(`(async()=>{
      const assets=${JSON.stringify(catalog.assets.slice(3).map((asset) => ({ name: asset.name, source: pathToFileURL(join(directory, 'ink-wash', asset.png)).href })))};
      const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1740;
      const context=canvas.getContext('2d');context.fillStyle='#dfc69c';context.fillRect(0,0,1600,1740);
      for(const [index,asset] of assets.entries()){
        const image=new Image();image.src=asset.source;await image.decode();
        const left=(index%2)*800;const top=Math.floor(index/2)*580;
        context.fillStyle='#434d41';context.font='28px "Songti SC",serif';context.fillText(asset.name,left+46,top+55);
        context.drawImage(image,left+16,top+62,768,480);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    })()`)
    writeFileSync(join(output, 'ink-wash-new-works.png'), Buffer.from(collection, 'base64'))
    await window.webContents.executeJavaScript(
      'document.documentElement.style.scrollbarWidth="none"',
    )
    const height = await window.webContents.executeJavaScript(
      'document.documentElement.scrollHeight',
    )
    window.setContentSize(1440, height)
    await window.webContents.executeJavaScript(
      'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
    )
    writeFileSync(
      join(output, 'ink-wash-overview.png'),
      (await window.webContents.capturePage()).resize({ width: 1440 }).toPNG(),
    )
    const hero = await window.webContents.executeJavaScript(
      '(()=>{const rect=document.querySelector(".hero").getBoundingClientRect();return {x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)}})()',
    )
    writeFileSync(
      join(output, 'ink-wash-landscape.png'),
      (await window.webContents.capturePage(hero)).toPNG(),
    )
    for (const width of [1440, 760, 390]) {
      window.setContentSize(width, 1000)
      const overflow = await window.webContents.executeJavaScript(
        'document.documentElement.scrollWidth>innerWidth',
      )
      if (overflow) throw new Error('Gallery horizontal overflow at ' + width)
    }
    writeFileSync(
      join(output, 'ink-wash-verification.json'),
      JSON.stringify({ exported, viewports: [1440, 760, 390], svgReferences: true }, null, 2) +
        '\n',
    )
    console.log(
      `Ink-wash demo rendered: ${exported.length} transparent PNGs, SVG reference checks and three gallery widths passed.`,
    )
    window.destroy()
    app.exit(0)
  } catch (error) {
    console.error(error.stack ?? error)
    window.destroy()
    app.exit(1)
  }
})
