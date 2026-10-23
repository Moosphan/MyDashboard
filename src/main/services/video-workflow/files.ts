import { createHash, randomUUID } from 'node:crypto'
import {
  createReadStream,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, extname, join, relative, sep } from 'node:path'
import { managedPath } from '../voiceover/media'
import type { WorkflowFile } from '../../../shared/video-workflow'
import { VideoWorkflowRepository } from '../../database/repositories/video-workflow-repository'

export async function fileHash(path: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.srt': 'text/plain',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
}
export class WorkflowFiles {
  constructor(
    readonly root: string,
    private repository: VideoWorkflowRepository,
  ) {
    mkdirSync(join(root, 'media', 'video-workflow'), { recursive: true })
  }
  path(file: WorkflowFile) {
    return managedPath(this.root, file.path)
  }
  async import(
    projectId: string,
    source: string,
    extension = extname(source).toLowerCase(),
  ): Promise<WorkflowFile> {
    if (!MIME[extension] || !lstatSync(source).isFile() || lstatSync(source).isSymbolicLink())
      throw new Error('仅支持普通 HTML、JSON、文本、音频、PNG 和 MP4 文件')
    const size = statSync(source).size
    if (
      size <= 0 ||
      size >
        (['.mp4', '.wav', '.mp3', '.m4a'].includes(extension)
          ? 1024 * 1024 * 1024
          : 4 * 1024 * 1024)
    )
      throw new Error('文件为空或超出大小限制')
    this.repository.get(projectId)
    const id = randomUUID(),
      target = managedPath(this.root, `media/video-workflow/${projectId}/${id}${extension}`)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(source, target)
    const result = {
      id,
      path: relative(this.root, target).split(sep).join('/'),
      sha256: await fileHash(target),
      size,
      mime: MIME[extension],
    }
    return this.repository.registerFile(projectId, result)
  }
  async write(projectId: string, content: string | Buffer, extension: string) {
    const temporary = join(
      this.root,
      'cache',
      'video-workflow-files',
      `${randomUUID()}${extension}`,
    )
    mkdirSync(dirname(temporary), { recursive: true })
    writeFileSync(temporary, content)
    try {
      return await this.import(projectId, temporary, extension)
    } finally {
      const { unlinkSync } = await import('node:fs')
      unlinkSync(temporary)
    }
  }
  async verify(projectId: string, file: WorkflowFile) {
    const stored = this.repository.file(projectId, file.id)
    if (!stored || JSON.stringify(stored) !== JSON.stringify(file)) {
      if (
        !stored ||
        stored.path !== file.path ||
        stored.sha256 !== file.sha256 ||
        stored.size !== file.size ||
        stored.mime !== file.mime
      )
        throw new Error('文件不属于当前项目或元数据已改变')
    }
    const path = this.path(file)
    if (
      !existsSync(path) ||
      statSync(path).size !== file.size ||
      (await fileHash(path)) !== file.sha256
    )
      throw new Error('文件丢失或内容被修改，请重新导入并审核')
    return path
  }
  async verifyPayload(projectId: string, payload: unknown): Promise<void> {
    if (!payload || typeof payload !== 'object') return
    const value = payload as Record<string, unknown>
    if (
      typeof value.id === 'string' &&
      typeof value.sha256 === 'string' &&
      typeof value.path === 'string'
    ) {
      await this.verify(projectId, value as unknown as WorkflowFile)
      return
    }
    for (const entry of Object.values(value)) await this.verifyPayload(projectId, entry)
  }
  text(file: WorkflowFile) {
    if (file.size > 4 * 1024 * 1024) throw new Error('文本过大')
    return readFileSync(this.path(file), 'utf8')
  }
}
