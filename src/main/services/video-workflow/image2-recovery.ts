import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'

/** Journal only the image result, never API headers, credentials or prompts. */
export function prepareImageRecovery(
  directory: string,
  source: { projectId: string; renderId: string; publishId?: string },
) {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const preload = join(directory, 'capture-result.mjs')
  const resultPath = join(directory, 'result.json')
  const imagePath = join(directory, 'original.png')
  // Bun preload runs before the configured third-party CLI. Saving the JSON response
  // before returning it ensures a later CLI download failure cannot lose the URL.
  writeFileSync(
    preload,
    `
import { writeFileSync, renameSync } from 'node:fs';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  const input = args[0];
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (response.ok && /\\/images\\/(?:edits|generations)(?:\\?|$)/.test(new URL(url).pathname)) {
    const result = await response.clone().json();
    const image = result?.data?.[0];
    if (image && (typeof image.url === 'string' || typeof image.b64_json === 'string')) {
      const record = {...${JSON.stringify(source)}, createdAt: new Date().toISOString()};
      if (typeof image.url === 'string') record.url = image.url;
      writeFileSync(${JSON.stringify(`${resultPath}.tmp`)}, JSON.stringify(record), {mode:0o600});
      renameSync(${JSON.stringify(`${resultPath}.tmp`)}, ${JSON.stringify(resultPath)});
      if (typeof image.b64_json === 'string') {
        writeFileSync(${JSON.stringify(`${imagePath}.tmp`)}, Buffer.from(image.b64_json, 'base64'), {mode:0o600});
        renameSync(${JSON.stringify(`${imagePath}.tmp`)}, ${JSON.stringify(imagePath)});
      }
    }
  }
  return response;
};
`,
    { mode: 0o600 },
  )
  return { preload, resultPath, imagePath }
}

type ImageFetcher = (url: string, options: RequestInit) => Promise<Response>

/** Only retries download of an existing result; never invokes image generation. */
export async function recoverImageDownload(
  directory: string,
  fetchImage: ImageFetcher,
  signal: AbortSignal,
): Promise<string | null> {
  signal.throwIfAborted()
  const imagePath = join(directory, 'original.png')
  if (existsSync(imagePath)) return imagePath
  const resultPath = join(directory, 'result.json')
  if (!existsSync(resultPath)) return null
  const result = JSON.parse(readFileSync(resultPath, 'utf8'))
  if (typeof result.url !== 'string') return null
  const url = new URL(result.url)
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('生成结果的下载地址无效，恢复记录已保留')
  const response = await fetchImage(url.href, {
    credentials: 'omit',
    signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
  })
  if (!response.ok || !response.body) throw new Error(`图片恢复下载失败（HTTP ${response.status}）`)
  const partial = join(directory, 'download.part')
  const file = await open(partial, 'w', 0o600)
  let bytes = 0
  const expected = Number(response.headers.get('Content-Length')) || null
  const reader = response.body.getReader()
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 16 * 1024 * 1024) throw new Error('图片下载超过 16 MiB 限制')
      await file.writeFile(value)
    }
    if (
      !bytes ||
      (expected !== null && !response.headers.get('Content-Encoding') && bytes !== expected)
    )
      throw new Error('图片下载不完整，恢复记录已保留')
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
    await file.close()
  }
  renameSync(partial, imagePath)
  return imagePath
}
