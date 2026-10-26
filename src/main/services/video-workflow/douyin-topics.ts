import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function douyinTopicFields(title: string, description: string, tags: string[]) {
  const names = [...new Set(tags.map((tag) => tag.trim().replace(/^#+/, '')))]
  if (names.some((name) => !name || /[\s#@]/u.test(name))) throw new Error('TOPIC_INVALID')
  let caption = description.trim()
  const existing = new Set([...caption.matchAll(/#([^\s#]+)/gu)].map((match) => match[1]))
  for (const name of names) {
    if (!existing.has(name)) caption += `${caption ? ' ' : ''}#${name}`
  }
  const itemTitle = title.trim()
  const offset = itemTitle ? itemTitle.length + 1 : 0
  const topics = [...caption.matchAll(/#([^\s#]+)/gu)]
    .filter((match) => names.includes(match[1]))
    .map((match) => ({
      start: offset + match.index!,
      end: offset + match.index! + match[0].length,
      type: 1,
      hashtag_name: match[1],
      hashtag_id: 0,
      user_id: '',
      caption_start: match.index!,
      caption_end: match.index! + match[0].length,
    }))
  return {
    text: itemTitle ? `${itemTitle} ${caption}` : caption,
    caption,
    item_title: itemTitle,
    text_extra: JSON.stringify(topics),
    challenges: '[]',
    hashtag_source: topics.map(() => 'search').join('/'),
  }
}

export function douyinTopicPreload(
  entry: string,
  metadata: { title: string; description: string; tags: string[] },
) {
  const fields = douyinTopicFields(metadata.title, metadata.description, metadata.tags)
  const creator = resolve(dirname(entry), '../platforms/douyin/web/creator.js')
  let source: string
  try {
    source = readFileSync(creator, 'utf8')
  } catch {
    throw new Error('TOPIC_UNSUPPORTED')
  }
  const start = source.indexOf('export function videoItem(')
  const marker = '    withExtras(common, o, false);'
  const position = source.indexOf(marker, start)
  const section = source.slice(start, position)
  if (
    start < 0 ||
    position < 0 ||
    !section.includes("text_extra: '[]'") ||
    !section.includes("hashtag_source: ''")
  )
    throw new Error('TOPIC_UNSUPPORTED')
  const originalDesc = [
    metadata.description,
    ...metadata.tags.map((tag) => `#${tag.replace(/^#/, '')}`),
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
  const expectedText = metadata.title.trim()
    ? `${metadata.title.trim()} ${originalDesc}`
    : originalDesc
  const injection = `
    if (common.text !== ${JSON.stringify(expectedText)} || common.caption !== ${JSON.stringify(originalDesc)})
        throw new CatbusError('USAGE', '抖音话题位置校验失败，未提交作品');
    Object.assign(common, ${JSON.stringify(fields)});
`
  const creatorUrl = pathToFileURL(creator).href
  const hook = `
import { createHash } from 'node:crypto';
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url !== ${JSON.stringify(creatorUrl)}) return result;
  const source = String(result.source);
  if (createHash('sha256').update(source).digest('hex') !== ${JSON.stringify(createHash('sha256').update(source).digest('hex'))}) throw new Error('TOPIC_UNSUPPORTED');
  return { ...result, source: source.slice(0, ${position}) + ${JSON.stringify(injection)} + source.slice(${position}) };
}`
  const hookUrl = `data:text/javascript;base64,${Buffer.from(hook).toString('base64')}`
  return `import { register } from 'node:module'; register(${JSON.stringify(hookUrl)}, ${JSON.stringify(pathToFileURL(entry).href)});`
}
