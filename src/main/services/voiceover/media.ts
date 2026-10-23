import { readFileSync, statSync, realpathSync, lstatSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'

export function managedPath(root: string, file: string): string {
  const target = resolve(root, file)
  const inside = relative(resolve(root), target)
  if (!inside || inside.startsWith(`..${sep}`) || inside === '..' || isAbsolute(inside)) throw new Error('无效媒体路径')
  let ancestor = target
  while (!lstatSync(ancestor, { throwIfNoEntry: false }) && ancestor !== dirname(ancestor)) ancestor = dirname(ancestor)
  const actual = relative(realpathSync(root), realpathSync(ancestor))
  if (actual.startsWith(`..${sep}`) || actual === '..' || isAbsolute(actual)) throw new Error('无效媒体路径')
  return target
}

export function readAudioData(root: string, file: string) {
  const path = managedPath(root, file)
  const mime: Record<string, string> = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.ogg': 'audio/ogg' }
  const mimeType = mime[extname(path).toLowerCase()]
  if (!mimeType) throw new Error('不支持的音频格式')
  const size = statSync(path).size
  if (size > 32 * 1024 * 1024) throw new Error('音频超过 32 MB，请导出后播放')
  return { dataUrl: `data:${mimeType};base64,${readFileSync(path).toString('base64')}`, mimeType, size }
}
