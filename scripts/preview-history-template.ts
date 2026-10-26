import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { sceneHtml, safeStoryboardDocument } from '../src/main/services/video-workflow/storyboard'
import type { StoryScene } from '../src/shared/video-workflow'

const directory = resolve(process.argv[2] ?? '.scratch/history-template')
mkdirSync(directory, { recursive: true })
const scenes: StoryScene[] = [
  {
    id: 'title',
    layout: 'title',
    title: '从长安出发',
    body: '丝绸之路上的相遇与交流\n一条路，如何连接不同的文明？',
  },
  {
    id: 'split',
    layout: 'split',
    title: '器物背后，是人的生活',
    body: '材质与工艺｜一件器物，折射出当时的生产方式与技术条件。\n使用与流传｜从日常生活的细节，理解不同地域的人如何相遇。',
  },
  {
    id: 'steps',
    layout: 'steps',
    title: '把历史放回时间之中',
    body: '前138年｜张骞首次出使西域\n前119年｜张骞再次出使西域\n交流｜往来逐渐连接不同地域',
  },
  {
    id: 'comparison',
    layout: 'comparison',
    title: '同一段历史，两种观看方式',
    body: '文献记载｜关注作者、成书时代与叙述立场，理解文字背后的语境。\n实物证据｜关注出土背景、材质与年代，让器物与文字相互参照。',
  },
  {
    id: 'quote',
    layout: 'quote',
    title: '阅读史料，也阅读它的语境',
    body: '谁写下了这段文字？\n它在何时、为何而写？\n把一句话放回原来的时代，\n才能更接近它真正的含义。',
  },
  {
    id: 'summary',
    layout: 'summary',
    title: '路的尽头，\n仍是相遇',
    body: '看时间：先建立清晰的历史坐标\n看证据：让文献与实物相互参照\n看生活：从具体的人理解时代',
  },
  {
    id: 'map',
    layout: 'map',
    title: '一条路，连接不同的世界',
    body: '长安｜以城市为起点，观察往来的方向。\n河西｜沿走廊展开，理解交通与地理。\n西域｜在不同地域的相遇中，寻找交流的线索。',
  },
  {
    id: 'relations',
    layout: 'relations',
    title: '历史，由人的往来织成',
    body: '行旅者｜带来沿途的见闻\n工匠｜在器物中留下技艺\n记录者｜用文字保存时代的记忆',
  },
  {
    id: 'artifact',
    layout: 'artifact',
    title: '一件器物的阅读方法',
    body: '器形｜观察轮廓与结构，辨识不同部位的作用。\n工艺｜留意制作方法和表面痕迹，理解技艺。\n语境｜结合来源与使用背景，理解器物与人的关系。',
  },
  {
    id: 'chapter',
    layout: 'chapter',
    title: '从山川，\n走向人间',
    body: '循着道路留下的线索，\n走近相遇、交换与日常生活。',
  },
]
for (const scene of scenes)
  writeFileSync(
    join(directory, scene.id + '.html'),
    safeStoryboardDocument(sceneHtml(scene, 'history')),
  )
for (const scene of scenes) {
  for (const size of [90, 180]) {
    const stress = {
      ...scene,
      title: '历史文化的传播需要尊重语境与证据'
        .repeat(3)
        .slice(0, ['map', 'relations', 'artifact', 'chapter'].includes(scene.layout) ? 48 : 32),
      body: '文'.repeat(size),
    }
    writeFileSync(
      join(directory, `${scene.id}-stress-${size}.html`),
      safeStoryboardDocument(sceneHtml(stress, 'history')),
    )
  }
  if (['map', 'relations', 'artifact'].includes(scene.layout)) {
    writeFileSync(
      join(directory, `${scene.id}-stress-nodes.html`),
      safeStoryboardDocument(
        sceneHtml(
          {
            ...scene,
            title: '历史文化的传播需要尊重语境与证据'.repeat(3).slice(0, 48),
            body: Array.from({ length: 4 }, () => '长标签的布局需要验证｜' + '文'.repeat(30)).join(
              '\n',
            ),
          },
          'history',
        ),
      ),
    )
  }
}
writeFileSync(join(directory, 'scenes.json'), JSON.stringify(scenes, null, 2))
writeFileSync(
  join(directory, 'index.html'),
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>史笺 · 历史文化模板</title><style>*{box-sizing:border-box}body{margin:0;background:#26221e;color:#f1dfc2;font-family:system-ui,sans-serif;padding:32px}header{display:flex;align-items:baseline;gap:28px;margin-bottom:28px}h1{font-size:28px;margin:0}header p{font-size:14px;color:#c1ad8b;margin:0}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}.page{position:relative;aspect-ratio:16/9;overflow:hidden;background:#dfc69c}iframe{width:1920px;height:1080px;border:0;position:absolute;transform-origin:top left;transform:scale(var(--scale,.35))}article p{margin:10px 0 0;color:#c1ad8b;font-size:14px}@media(max-width:900px){.gallery{grid-template-columns:1fr}}</style><header><h1>史笺</h1><p>历史文化普及 / 十种版式 / 牛皮纸 · 墨色 · 朱砂 / 1920 × 1080</p></header><div class="gallery">${scenes.map((scene, index) => `<article><div class="page"><iframe title="${scene.id}" sandbox="" src="${scene.id}.html"></iframe></div><p>${String(index + 1).padStart(2, '0')} / ${{ title: '卷首山川', split: '人物与背景', steps: '编年脉络', comparison: '双栏辨析', quote: '文本细读', summary: '结语索引', map: '山川行旅', relations: '人物关系', artifact: '器物解读', chapter: '章节过渡' }[scene.layout]}</p></article>`).join('')}</div><script>document.querySelectorAll('.page').forEach(element=>new ResizeObserver(entries=>element.style.setProperty('--scale',entries[0].contentRect.width/1920)).observe(element));</script></html>`,
)
console.log(directory)
