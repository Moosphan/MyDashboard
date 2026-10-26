import { createWriteStream, mkdirSync, rmSync } from 'node:fs'
import { join, extname } from 'node:path'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { net } from 'electron'
import type { MusicSearchResult, WorkflowFile } from '../../../shared/video-workflow'
import type { WorkflowFiles } from './files'

const OPENVERSE_ENDPOINT = 'https://api.openverse.org/v1/audio/'
const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.flac'])

function publicHttps(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('音频来源链接无效')
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('音频来源仅支持公开 HTTPS 链接')
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '::1'
  )
    throw new Error('音频来源地址不允许访问本机网络')
  const ip = isIP(host)
  if (ip === 4) {
    const octets = host.split('.').map(Number)
    if (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    )
      throw new Error('音频来源地址不允许访问私有网络')
  }
  if (
    ip === 6 &&
    (host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8'))
  )
    throw new Error('音频来源地址不允许访问私有网络')
  return url
}

function privateAddress(address: string) {
  const ip = isIP(address)
  if (ip === 4) {
    const octets = address.split('.').map(Number)
    return (
      octets[0] === 0 ||
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    )
  }
  const normalized = address.toLowerCase()
  if (normalized.startsWith('::ffff:')) return privateAddress(normalized.slice(7))
  return (
    ip === 6 &&
    (normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8'))
  )
}

async function fetchPublic(value: string, init?: RequestInit) {
  let url = publicHttps(value)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const addresses = await lookup(url.hostname, { all: true })
    if (!addresses.length || addresses.some(({ address }) => privateAddress(address)))
      throw new Error('音频来源地址不允许访问本机或私有网络')
    const response = await net.fetch(url.toString(), {
      ...init,
      redirect: 'manual',
      signal: init?.signal ?? AbortSignal.timeout(15000),
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('音频来源重定向缺少目标')
      url = publicHttps(new URL(location, url).toString())
      continue
    }
    return response
  }
  throw new Error('音频来源重定向次数过多')
}

function contentExtension(response: Response, sourceUrl: string) {
  const fromUrl = extname(new URL(sourceUrl).pathname).toLowerCase()
  if (AUDIO_EXTENSIONS.has(fromUrl)) return fromUrl
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.toLowerCase()
  const byType: Record<string, string> = {
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/mp4': '.m4a',
    'audio/ogg': '.ogg',
    'audio/flac': '.flac',
  }
  const extension = contentType ? byType[contentType] : undefined
  if (!extension) throw new Error('在线结果不是受支持的音频格式')
  return extension
}

export async function searchOpenverse(query: string): Promise<MusicSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed || trimmed.length > 120) throw new Error('请输入 1–120 个字符的搜索词')
  const url = new URL(OPENVERSE_ENDPOINT)
  url.searchParams.set('q', trimmed)
  url.searchParams.set('page_size', '20')
  const response = await fetchPublic(url.toString(), { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`在线搜索失败（HTTP ${response.status}）`)
  const body = (await response.json()) as { results?: Record<string, unknown>[] }
  return (body.results ?? []).flatMap((item, index) => {
    const sourceUrl = typeof item.foreign_landing_url === 'string' ? item.foreign_landing_url : ''
    const downloadUrl = typeof item.url === 'string' ? item.url : ''
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    if (!sourceUrl || !downloadUrl || !title) return []
    try {
      publicHttps(sourceUrl)
      publicHttps(downloadUrl)
    } catch {
      return []
    }
    return [{
      id: typeof item.id === 'string' ? item.id : `${index}-${title}`,
      title: title.slice(0, 300),
      author: typeof item.creator === 'string' && item.creator.trim() ? item.creator.trim().slice(0, 300) : '未知作者',
      license: typeof item.license === 'string' ? item.license.toUpperCase() : '许可证待核实',
      ...(typeof item.license_url === 'string' ? { licenseUrl: item.license_url } : {}),
      sourceUrl,
      downloadUrl,
      ...(typeof item.duration === 'number' && Number.isFinite(item.duration) ? { duration: item.duration } : {}),
    }]
  })
}

export async function downloadOpenverseMusic(
  root: string,
  files: WorkflowFiles,
  projectId: string,
  result: MusicSearchResult,
): Promise<{ file: WorkflowFile; title: string; sourceUrl: string; license: string; author: string }> {
  if (!result || typeof result !== 'object') throw new Error('在线音频结果无效')
  const response = await fetchPublic(result.downloadUrl)
  if (!response.ok || !response.body) throw new Error(`音频下载失败（HTTP ${response.status}）`)
  const extension = contentExtension(response, result.downloadUrl)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(length) && length > MAX_DOWNLOAD_BYTES)
    throw new Error('在线音频超过 256 MB 大小限制')
  const temporary = join(root, 'cache', 'video-workflow-music', `${randomUUID()}${extension}`)
  mkdirSync(join(root, 'cache', 'video-workflow-music'), { recursive: true })
  const stream = createWriteStream(temporary, { flags: 'wx' })
  let total = 0
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength
      if (total > MAX_DOWNLOAD_BYTES) throw new Error('在线音频超过 256 MB 大小限制')
      if (!stream.write(Buffer.from(chunk))) await once(stream, 'drain')
    }
    stream.end()
    await once(stream, 'close')
    const file = await files.import(projectId, temporary, extension)
    return {
      file,
      title: result.title,
      sourceUrl: result.sourceUrl,
      license: result.license,
      author: result.author,
    }
  } finally {
    stream.destroy()
    rmSync(temporary, { force: true })
  }
}
