import type { StoryScene, VideoFormat } from '../../../shared/video-workflow'

export const HISTORY_TEMPLATE_GUIDE = `视觉模板「史笺 · 历史文化」：全幅牛皮纸 #dfc69c，深墨 #302a23，朱砂 #873b2a，辅色茶褐 #654d3a；低对比纸纤维纹理，书籍版心、细规则线与印章式栏目签。中文宋体标题（Songti SC / STSong / SimSun / serif），黑体正文（PingFang SC / Microsoft YaHei / sans-serif），不要用圆角卡片、现代科技界面或满屏仿古花纹。画布遵循当前项目指定画幅及字幕安全区，标题76–112px、正文32–38px；竖版使用上下布局，图解与正文错层，避免横版分栏挤压。十种版式按内容选择：title 卷首山川、split 人物/背景分栏、steps 编年脉络、comparison 双栏辨析、quote 文本细读、summary 结语索引、map 山川行旅、relations 人物关系、artifact 器物解读、chapter 章节过渡。map 使用独立路线和节点，标注“路线示意 · 非比例地图”；relations 只呈现文案明确的关联，不推断血缘、师承或因果；artifact 使用可拆解的原创器形轮廓，标注“原创器形示意 · 非实物复原”，不自动套用为具体文物；chapter 使用大字章节与短导语，承接叙事转场。地图、关系、器物各最多4项，支持“标签｜说明”；普通段落使用序号，不猜测地名或人名。山川仅为原创装饰，不能冒充史实地图、文物或历史人物肖像；不虚构年代、引文及来源。保留文案事实，长段落拆镜。MG开启时创建可独立选中的年表线/节点、人物关系线、器形局部/说明、证据段落/重点标记，以实际内容解释顺序或关系；每个元素有稳定ID，纸纹不做闪烁或随机运动；MG关闭时保持静态。不用通用标题入场代替解释性动画。`

function escapeText(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  )
}

function landscape() {
  return `<svg class="history-landscape" viewBox="0 0 1000 750" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <circle cx="680" cy="240" r="155" fill="#923e2b" opacity=".13"/>
    <g fill="none" stroke="#705843" stroke-width="2" opacity=".35">
      <path d="M-80 570C30 530 40 444 110 458S178 520 226 420 290 286 328 320 380 432 438 391 480 326 527 362 577 498 640 447 708 340 754 370 818 455 877 408 1000 310 1090 330"/>
      <path d="M-80 590C30 550 40 464 110 478S178 540 226 440 290 306 328 340 380 452 438 411 480 346 527 382 577 518 640 467 708 360 754 390 818 475 877 428 1000 330 1090 350"/>
      <path d="M-80 610C30 570 40 484 110 498S178 560 226 460 290 326 328 360 380 472 438 431 480 366 527 402 577 538 640 487 708 380 754 410 818 495 877 448 1000 350 1090 370"/>
      <path d="M-80 630C30 590 40 504 110 518S178 580 226 480 290 346 328 380 380 492 438 451 480 386 527 422 577 558 640 507 708 400 754 430 818 515 877 468 1000 370 1090 390"/>
      <path d="M-80 650C30 610 40 524 110 538S178 600 226 500 290 366 328 400 380 512 438 471 480 406 527 442 577 578 640 527 708 420 754 450 818 535 877 488 1000 390 1090 410"/>
    </g>
    <path d="M-80 715Q35 545 100 570T245 640C310 610 385 440 435 470S550 665 600 635 715 500 755 530 940 660 1050 680V800H-80Z" fill="#705843" opacity=".13"/>
    <g fill="none" stroke="#705843" stroke-width="2" opacity=".4">
      <path d="M-80 745Q35 575 100 600T245 670C310 640 385 470 435 500S550 695 600 665 715 530 755 560 940 690 1050 710"/>
      <path d="M-80 769Q35 599 100 624T245 694C310 664 385 494 435 524S550 719 600 689 715 554 755 584 940 714 1050 734"/>
    </g>
  </svg>`
}

const paperTexture = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".64" numOctaves="3" seed="17" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#paper)" opacity=".25"/></svg>')}`

const styles = `
body{background:#dfc69c;color:#302a23}
.history-scene{--ink:#302a23;--red:#873b2a;--muted:#654d3a;position:relative;width:100%;height:100%;overflow:hidden;background:radial-gradient(ellipse at 35% 30%,#f0dfbf70,transparent 72%),#dfc69c;font-family:"PingFang SC","Microsoft YaHei",sans-serif}
.history-scene::before{content:"";position:absolute;inset:0;background-image:url("${paperTexture}");opacity:.26;pointer-events:none;mix-blend-mode:multiply}
.history-scene::after{content:"";position:absolute;inset:30px;border:1px solid #70584340;pointer-events:none}
.history-top{position:absolute;top:62px;left:100px;right:100px;display:flex;align-items:center;gap:28px;font-size:24px;letter-spacing:.18em;color:var(--muted)}
.history-top-rule{height:1px;background:#70584360;flex:1}
.history-seal{display:grid;place-items:center;width:62px;height:62px;background:var(--red);color:#f2dfbd;border:4px double #dfc69c;font-family:"Songti SC","STSong",serif;font-size:22px;line-height:1;letter-spacing:.05em;writing-mode:vertical-rl;white-space:nowrap}
.history-bottom{position:absolute;left:100px;right:100px;bottom:156px;display:flex;align-items:center;gap:24px;font-size:22px;letter-spacing:.16em;color:var(--muted)}
.history-bottom::before{content:"";height:1px;background:#70584360;flex:1}
.history-main{position:absolute;inset:180px 100px 220px}
.history-scene h1,.history-scene h2,.history-scene p{margin:0;overflow-wrap:anywhere}
.history-scene h1{font-family:"Songti SC","STSong","SimSun",serif;font-size:80px;line-height:1.25;letter-spacing:.025em;font-weight:700}
.history-content{position:relative;display:flex;flex-direction:column;gap:26px;margin-top:46px}
.history-entry{position:relative;min-width:0;font-size:36px;line-height:1.65;overflow-wrap:anywhere}
.history-entry-label{font-family:Georgia,serif;font-size:28px;line-height:1.4;color:var(--red);letter-spacing:.08em}
.history-entry p{white-space:pre-wrap}
.history-landscape{position:absolute;right:-80px;bottom:0;width:1050px;height:790px;pointer-events:none}
.history-title .history-main{right:600px;display:flex;flex-direction:column;justify-content:center}
.history-title h1{font-size:112px;line-height:1.2;max-width:1200px;position:relative;z-index:1}
.history-title .history-content{max-width:1080px;border-top:2px solid #923e2b90;padding-top:30px}
.history-title .history-entry{font-size:36px}
.history-title .history-entry-label{display:none}
.history-title .history-landscape{right:-10px;opacity:.85}
.history-title .history-spine{position:absolute;right:156px;top:196px;writing-mode:vertical-rl;letter-spacing:.32em;font-family:"Songti SC","STSong",serif;font-size:36px;color:var(--red)}
.history-split .history-main{display:grid;grid-template-columns:600px 1fr;gap:110px;align-items:center}
.history-split .history-heading{align-self:stretch;display:flex;flex-direction:column;justify-content:center;border-right:1px solid #70584360;padding-right:72px}
.history-split .history-content{margin:0;gap:34px}
.history-split .history-entry{display:grid;grid-template-columns:54px 1fr;gap:20px;border-bottom:1px solid #70584340;padding-bottom:24px}
.history-split .history-entry.history-labeled{grid-template-columns:1fr;gap:12px}
.history-split h1{font-size:88px}
.history-kicker{font-size:24px;color:var(--red);letter-spacing:.2em;margin-bottom:28px}
.history-steps .history-content{display:grid;grid-template-columns:repeat(var(--entries),minmax(0,1fr));gap:44px;margin-top:90px}
.history-timeline{position:absolute;top:-4px;left:0;right:0;height:2px;background:#923e2b80;transform-origin:left}
.history-steps .history-entry{padding-top:42px;font-size:34px}
.history-node{position:absolute;top:-12px;left:0;width:18px;height:18px;background:var(--red);border:4px solid #dfc69c;outline:1px solid var(--red);border-radius:50%}
.history-steps .history-entry-label{margin-bottom:26px;font-size:42px}
.history-comparison .history-content{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border-top:2px solid var(--red);margin-top:52px}
.history-comparison .history-entry{padding:34px 54px 34px 0;border-bottom:1px solid #70584360}
.history-comparison .history-entry:nth-child(even){padding-left:54px;border-left:1px solid #70584360}
.history-comparison .history-entry-label{font-size:30px;margin-bottom:24px}
.history-quote .history-main{padding:22px 90px 0 168px}
.history-quote h1{font-size:64px;color:var(--muted)}
.history-quote .history-content{margin-top:52px;gap:24px;padding:0 0 0 52px;border-left:3px solid var(--red)}
.history-quote .history-entry{font-family:"Songti SC","STSong","SimSun",serif;font-size:48px;line-height:1.65}
.history-quote .history-entry-label{display:none}
.history-mark{position:absolute;top:126px;left:20px;color:var(--red);font:180px Georgia,serif;line-height:1;opacity:.75}
.history-summary .history-main{display:grid;grid-template-columns:610px 1fr;gap:100px;align-items:center}
.history-summary h1{font-size:92px}
.history-summary .history-content{margin:0;gap:0;border-top:2px solid var(--red)}
.history-summary .history-entry{display:grid;grid-template-columns:64px 1fr;gap:24px;padding:24px 0;border-bottom:1px solid #70584360}
.history-summary .history-entry-label{padding-top:6px}
.history-summary .history-landscape{left:-180px;right:auto;bottom:-140px;width:850px;opacity:.35}
.history-diagram{position:absolute;left:0;top:220px;width:930px;height:380px}
.history-diagram svg{width:100%;height:100%;overflow:visible}
.history-diagram-note{position:absolute;left:0;bottom:-44px;font-size:22px;letter-spacing:.1em;color:var(--muted)}
.history-map .history-content{margin-left:1000px;margin-top:42px;gap:22px}
.history-map .history-entry{font-size:30px;line-height:1.5;padding-bottom:18px;border-bottom:1px solid #70584350}
.history-map .history-entry-label{margin-bottom:8px}
.history-map .history-landscape{left:0;right:auto;bottom:20px;width:1000px;height:600px;opacity:.5}
.history-route-label{font-size:28px;fill:var(--ink);font-family:"Songti SC","STSong",serif}
.history-relations .history-content{position:absolute;top:220px;left:520px;right:0;margin:0;height:420px;display:grid;grid-template-rows:repeat(var(--entries),minmax(0,1fr));gap:12px}
.history-relations .history-entry{display:grid;grid-template-columns:200px 1fr;gap:30px;align-items:center;font-size:30px;line-height:1.5;padding:12px 0;border-bottom:1px solid #70584350}
.history-relations .history-entry-label{font-size:30px}
.history-relations .history-diagram{top:220px;width:470px;height:420px}
.history-relation-hub{fill:var(--ink);font-family:"Songti SC","STSong",serif;font-size:48px;letter-spacing:.2em}
.history-artifact .history-content{margin:42px 0 0 720px;gap:22px}
.history-artifact .history-entry{font-size:30px;line-height:1.5;padding:0 0 18px 26px;border-left:2px solid #923e2b80}
.history-artifact .history-entry-label{margin-bottom:8px}
.history-artifact .history-diagram{top:190px;left:40px;width:560px;height:410px}
.history-artifact .history-diagram-note{left:0;bottom:-48px;white-space:nowrap}
.history-chapter .history-main{display:grid;grid-template-columns:820px 1fr;gap:120px;align-items:center}
.history-chapter .history-heading{position:relative;border-right:2px solid #923e2b90;padding:30px 90px 30px 0}
.history-chapter h1{font-size:110px;line-height:1.3;white-space:pre-line}
.history-chapter .history-content{margin:0;gap:28px}
.history-chapter .history-entry{font-size:38px;line-height:1.7}
.history-chapter .history-entry-label{display:none}
.history-chapter-arc{position:absolute;left:-250px;top:80px;width:1050px;height:1050px;border:1px solid #70584340;border-radius:50%;box-shadow:0 0 0 36px #70584308,0 0 0 72px #70584308;pointer-events:none}
.history-dense .history-entry{font-size:30px;line-height:1.5}
.history-dense.history-quote .history-entry{font-size:38px}
.history-dense .history-content{gap:20px}
.history-dense.history-map .history-entry{font-size:28px;line-height:1.4;padding-bottom:12px}
.history-dense.history-map .history-content{margin-top:32px;gap:16px}
.history-dense.history-artifact .history-entry{font-size:28px;line-height:1.4;padding-bottom:12px}
.history-dense.history-artifact .history-content{margin-top:32px;gap:16px}
.history-dense.history-relations .history-entry{font-size:28px;line-height:1.4;padding:8px 0}
.history-dense.history-relations .history-entry-label{font-size:26px}
.history-dense.history-many-nodes.history-map .history-entry,.history-dense.history-many-nodes.history-artifact .history-entry{display:grid;grid-template-columns:200px 1fr;gap:20px;align-items:start}
.history-dense.history-many-nodes.history-map .history-entry-label,.history-dense.history-many-nodes.history-artifact .history-entry-label{margin-bottom:0}
.history-long-title h1{font-size:70px}
.history-long-title.history-quote h1{font-size:54px}
.history-long-title.history-map h1,.history-long-title.history-relations h1,.history-long-title.history-artifact h1{font-size:62px}
`

const portraitStyles = `
.history-top{left:72px;right:120px;top:90px;font-size:22px;gap:18px}
.history-top>span:last-child{display:none}
.history-bottom{left:72px;right:120px;bottom:320px}
.history-main{inset:230px 120px 390px 72px}
.history-scene h1{font-size:80px;line-height:1.3}
.history-content{gap:36px;margin-top:60px}
.history-title .history-main{right:120px;justify-content:flex-start;padding-top:110px}
.history-title h1{font-size:96px}
.history-title .history-spine{right:65px;top:270px;font-size:26px}
.history-title .history-landscape{width:1080px;height:800px;bottom:220px;opacity:.5}
.history-title .history-content{margin-top:80px}
.history-split .history-main,.history-chapter .history-main,.history-summary .history-main{display:flex;flex-direction:column;align-items:stretch;gap:70px}
.history-split .history-heading,.history-chapter .history-heading{border-right:0;border-bottom:2px solid #923e2b90;padding:0 0 42px;display:block}
.history-split .history-content,.history-chapter .history-content{margin:0}
.history-steps .history-content{grid-template-columns:1fr;margin-top:70px;gap:42px;padding-left:40px}
.history-timeline{top:0;bottom:0;left:0;width:2px;height:auto;right:auto;transform-origin:top}
.history-steps .history-entry{padding:0 0 0 20px}
.history-node{left:-48px;top:12px}
.history-steps .history-entry-label{font-size:36px;margin-bottom:14px}
.history-comparison .history-content,.history-summary .history-content{grid-template-columns:1fr}
.history-comparison .history-entry,.history-comparison .history-entry:nth-child(even){border-left:0;padding:32px 0}
.history-quote .history-main{padding:30px 0 0 40px}
.history-quote .history-content{padding-left:32px}
.history-quote .history-entry{font-size:44px}
.history-map .history-diagram,.history-relations .history-diagram,.history-artifact .history-diagram{position:relative;top:auto;left:auto;width:100%;height:400px;margin-top:42px}
.history-map .history-content,.history-relations .history-content,.history-artifact .history-content{position:relative;top:auto;left:auto;right:auto;margin:54px 0 0;height:auto;gap:24px;display:flex;flex-direction:column}
.history-map .history-diagram-note,.history-artifact .history-diagram-note{bottom:-30px;font-size:20px}
.history-relations .history-entry{grid-template-columns:170px 1fr}
.history-chapter h1{font-size:96px}
.history-dense.history-many-nodes .history-entry{font-size:30px}
`

export function historySceneHtml(scene: StoryScene, format: VideoFormat = 'landscape') {
  const characters = Array.from(scene.body).length
  if (characters > 180 || Array.from(scene.title).length > 48)
    throw new Error('史笺模板单镜最多 180 字正文、48 字标题，请拆分为多个分镜或使用 Agent 重新排版')
  const lines = scene.body.split('\n').filter((line) => line.trim())
  const paragraphs = lines.flatMap((line) => {
    const content = Array.from(line)
    return Array.from({ length: Math.ceil(content.length / 90) }, (_, index) =>
      content.slice(index * 90, (index + 1) * 90).join(''),
    )
  })
  if (paragraphs.length > 6)
    throw new Error('史笺模板单镜最多 6 个内容段，请拆分分镜以保证阅读质量')
  if (['steps', 'map', 'relations', 'artifact'].includes(scene.layout) && paragraphs.length > 4)
    throw new Error('编年、路线、关系及器物版式单镜最多 4 个节点，请拆分分镜以保证图解清晰')
  const items = paragraphs.map((paragraph, index) => {
    const separator = [
      'split',
      'steps',
      'comparison',
      'summary',
      'map',
      'relations',
      'artifact',
    ].includes(scene.layout)
      ? paragraph.indexOf('｜')
      : -1
    const labeled = separator > 0 && separator <= 12
    return {
      labeled,
      label: labeled ? paragraph.slice(0, separator) : String(index + 1).padStart(2, '0'),
      content: labeled ? paragraph.slice(separator + 1) : paragraph,
    }
  })
  const entries = items
    .map((item, index) => {
      return `<div class="history-entry${item.labeled ? ' history-labeled' : ''}" id="history-entry-${index + 1}">${scene.layout === 'steps' ? `<div class="history-node" id="history-node-${index + 1}"></div>` : ''}<div class="history-entry-label">${escapeText(item.label)}</div><p>${escapeText(item.content)}</p></div>`
    })
    .join('')
  const roles = {
    title: '卷首',
    split: '人物与时代',
    steps: '时间与脉络',
    comparison: '异同与辨析',
    quote: '文本细读',
    summary: '回望与思考',
    map: '山川与行旅',
    relations: '人物与关联',
    artifact: '器形与工艺',
    chapter: '翻开新篇',
  }
  let diagram = ''
  if (scene.layout === 'map') {
    const points = items.map((item, index) => ({
      ...item,
      x: items.length === 1 ? 440 : 100 + (index * 700) / (items.length - 1),
      y: index % 2 === 0 ? 220 : 120,
    }))
    diagram = `<div class="history-diagram" id="history-route"><svg viewBox="0 0 930 380" xmlns="http://www.w3.org/2000/svg"><path id="history-route-line" d="${points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ')}" fill="none" stroke="#873b2a" stroke-width="3" stroke-dasharray="10 9"/>${points
      .map(
        (point, index) =>
          `<g id="history-route-node-${index + 1}"><circle cx="${point.x}" cy="${point.y}" r="18" fill="#dfc69c" stroke="#873b2a" stroke-width="2"/><circle cx="${point.x}" cy="${point.y}" r="6" fill="#873b2a"/><text class="history-route-label" x="${point.x}" y="${point.y + 62}" text-anchor="middle">${Array.from(
            { length: Math.ceil(Array.from(point.label).length / 6) },
            (_, line) =>
              `<tspan x="${point.x}" dy="${line ? 36 : 0}">${escapeText(
                Array.from(point.label)
                  .slice(line * 6, (line + 1) * 6)
                  .join(''),
              )}</tspan>`,
          ).join('')}</text></g>`,
      )
      .join('')}</svg><div class="history-diagram-note">路线示意 · 非比例地图</div></div>`
  }
  if (scene.layout === 'relations') {
    diagram = `<div class="history-diagram" id="history-relations"><svg viewBox="0 0 470 450" xmlns="http://www.w3.org/2000/svg">${items.map((_item, index) => `<path id="history-relation-line-${index + 1}" d="M170 225 Q300 225 450 ${(450 * (index + 0.5)) / items.length}" fill="none" stroke="#873b2a" stroke-width="2"/>`).join('')}<circle id="history-relation-hub" cx="170" cy="225" r="114" fill="#dfc69c" stroke="#873b2a" stroke-width="2"/><circle cx="170" cy="225" r="100" fill="none" stroke="#70584360"/><text class="history-relation-hub" x="175" y="242" text-anchor="middle">脉络</text></svg><div class="history-diagram-note">主题关联示意 · 以文案为据</div></div>`
  }
  if (scene.layout === 'artifact') {
    diagram = `<div class="history-diagram" id="history-artifact"><svg viewBox="0 0 560 410" xmlns="http://www.w3.org/2000/svg"><ellipse cx="280" cy="385" rx="170" ry="12" fill="#70584318"/><path id="history-artifact-body" d="M150 90 Q170 140 160 200 Q158 305 235 328 L325 328 Q402 305 400 200 Q390 140 410 90Z" fill="#70584318" stroke="#654d3a" stroke-width="3"/><path id="history-artifact-rim" d="M140 78 Q280 45 420 78 L410 96 Q280 72 150 96Z" fill="#dfc69c" stroke="#873b2a" stroke-width="3"/><path id="history-artifact-handles" d="M160 140 C40 80 70 270 180 255 M400 140 C520 80 490 270 380 255" fill="none" stroke="#654d3a" stroke-width="8"/><path id="history-artifact-foot" d="M235 328 L220 373 M325 328 L340 373 M280 330 L280 373" fill="none" stroke="#654d3a" stroke-width="10"/><path id="history-artifact-detail" d="M172 182 Q280 211 388 182 M173 200 Q280 229 387 200 M193 270 Q280 294 367 270" fill="none" stroke="#873b2a" stroke-width="2"/><path id="history-artifact-callout" d="M346 194 L458 170 L530 170 M325 328 L470 320 L530 320" fill="none" stroke="#873b2a" stroke-width="1.5"/><circle cx="346" cy="194" r="5" fill="#873b2a"/><circle cx="325" cy="328" r="5" fill="#873b2a"/></svg><div class="history-diagram-note">原创器形示意 · 非实物复原</div></div>`
  }
  const heading = `<div class="history-heading" id="history-heading"><div class="history-kicker">${roles[scene.layout]}</div><h1 id="history-title">${escapeText(scene.title)}</h1></div>`
  return `<style>${styles}${format === 'portrait' ? portraitStyles : ''}</style><section class="history-scene history-${scene.layout}${characters > 100 || paragraphs.length > 4 ? ' history-dense' : ''}${paragraphs.length > 2 ? ' history-many-nodes' : ''}${Array.from(scene.title).length > 18 ? ' history-long-title' : ''}" style="--entries:${Math.min(paragraphs.length, 4)}"><div class="history-top"><div class="history-seal">史笺</div><span>历史 · 文化 · 人间</span><div class="history-top-rule"></div><span>HISTORY &amp; CULTURE</span></div>${['title', 'summary', 'map'].includes(scene.layout) ? landscape() : ''}${scene.layout === 'chapter' ? '<div class="history-chapter-arc" aria-hidden="true"></div>' : ''}${scene.layout === 'title' ? '<div class="history-spine">以古观今 · 以史为镜</div>' : ''}<main class="history-main">${scene.layout === 'quote' ? '<div class="history-mark" aria-hidden="true">“</div>' : ''}${heading}${diagram}<div class="history-content" id="history-content">${scene.layout === 'steps' ? '<div class="history-timeline" id="history-timeline"></div>' : ''}${entries}</div></main><div class="history-bottom">${roles[scene.layout]} / 史笺</div></section>`
}
