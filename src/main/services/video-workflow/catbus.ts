import { existsSync, mkdirSync, realpathSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  BILIBILI_ACCOUNT,
  type BilibiliCategory,
  type BilibiliPublishSnapshot,
} from '../../../shared/bilibili-publishing'
import type { WorkflowRuntime } from '../../../shared/video-workflow'
import { catbusProcess } from './catbus-process'

const MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: '请先扫码连接 B 站账号',
  AUTH_EXPIRED: 'B 站登录已过期，请重新扫码连接',
  RISK_CONTROL: 'B 站触发平台验证或风控，已停止，请前往创作中心核查',
  NETWORK: '网络中断，请核查平台投稿结果后再处理',
  UPSTREAM: 'B 站未返回可确认的投稿结果，请核查创作中心',
  USAGE: '投稿参数未被 CLI 接受，请检查分区与发布资料',
  UNSUPPORTED: '当前 CLI 不支持此操作',
  PROCESS: '无法运行 Catbus，请检查执行环境中的 Node 和 Catbus 路径',
  TIMEOUT: 'Catbus 执行超时，请核查网络和平台结果',
  CANCELLED: '操作已停止；已提交的稿件不会被自动撤回',
  OUTPUT_LIMIT: 'CLI 输出异常，操作已停止',
  INVALID_RESPONSE: 'CLI 未返回有效回执，请核查平台投稿结果',
}
export class CatbusFailure extends Error {
  constructor(readonly code: string) {
    super(MESSAGES[code] ?? 'Catbus 操作失败，请检查运行环境和平台状态')
  }
}
export function supportedCatbusNode(version: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return false
  const [major, minor, patch] = version.split('.').map(Number)
  return (
    major >= 26 ||
    (major === 24 && minor >= 15) ||
    (major === 22 && (minor > 22 || (minor === 22 && patch >= 2)))
  )
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CatbusFailure('INVALID_RESPONSE')
  return value as Record<string, unknown>
}
export function bilibiliVideoId(value: string) {
  if (/^BV[A-Za-z0-9]{10}$/.test(value)) return value
  try {
    const url = new URL(value)
    if (
      url.protocol === 'https:' &&
      ['www.bilibili.com', 'bilibili.com'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
    ) {
      const match = url.pathname.match(/^\/video\/(BV[A-Za-z0-9]{10})\/?$/)
      if (match) return match[1]
    }
  } catch {}
  throw new Error('请填写有效 BV 号或 B 站 HTTPS 作品链接')
}
export class BilibiliCatbus {
  readonly home: string
  private checked?: Promise<void>
  constructor(
    root: string,
    private runtime: WorkflowRuntime,
  ) {
    this.home = join(root, 'config', 'publishing', 'catbus')
    mkdirSync(this.home, { recursive: true, mode: 0o700 })
  }
  private async run(args: string[], signal?: AbortSignal, progress?: (text: string) => void) {
    const configured = this.runtime.catbusPath
    if (
      !configured ||
      !isAbsolute(configured) ||
      !existsSync(configured) ||
      !isAbsolute(this.runtime.nodePath) ||
      !existsSync(this.runtime.nodePath)
    )
      throw new CatbusFailure('PROCESS')
    let entry = realpathSync(configured)
    if (/\.cmd$/i.test(entry))
      entry = join(dirname(entry), 'node_modules', 'catbus-cli', 'dist', 'cli', 'main.js')
    let result: { code: number | null; stdout: string }
    try {
      result = await catbusProcess(this.runtime.nodePath, entry, args, this.home, signal, progress)
    } catch (error) {
      throw new CatbusFailure((error as Error).message)
    }
    let envelope: Record<string, unknown>
    try {
      envelope = object(JSON.parse(result.stdout))
    } catch {
      throw new CatbusFailure('INVALID_RESPONSE')
    }
    if (envelope.ok !== true || result.code !== 0)
      throw new CatbusFailure(
        typeof object(envelope.error).code === 'string'
          ? String(object(envelope.error).code)
          : 'INVALID_RESPONSE',
      )
    if (
      args[0] === 'bilibili' &&
      (envelope.platform !== 'bilibili' ||
        envelope.endpoint !== 'web' ||
        envelope.account !== BILIBILI_ACCOUNT ||
        envelope.resource !== args[1] ||
        envelope.action !== args[2])
    )
      throw new CatbusFailure('INVALID_RESPONSE')
    return envelope.data
  }
  async check(signal?: AbortSignal) {
    this.checked ??= (async () => {
      const result = object(await this.run(['version', '-o', 'json'], signal))
      if (result.version !== '0.2.1')
        throw new Error('请安装 Catbus CLI 0.2.1，并在执行环境配置其路径')
      if (typeof result.node !== 'string' || !supportedCatbusNode(result.node))
        throw new Error('Catbus 需要 Node 22.22.2+（22 系列）、24.15+（24 系列）或 26+')
    })()
    return this.checked
  }
  private async command(
    resource: string,
    action: string,
    args: string[] = [],
    signal?: AbortSignal,
    progress?: (text: string) => void,
  ) {
    await this.check(signal)
    return this.run(
      ['bilibili', resource, action, '-a', BILIBILI_ACCOUNT, '-e', 'web', '-o', 'json', ...args],
      signal,
      progress,
    )
  }
  async account(signal?: AbortSignal) {
    const data = object(await this.command('auth', 'status', [], signal))
    if (data.logged_in !== true) throw new CatbusFailure('AUTH_REQUIRED')
    const user = object(data.user)
    if (typeof user.id !== 'string' || !/^\d+$/.test(user.id) || typeof user.name !== 'string')
      throw new CatbusFailure('INVALID_RESPONSE')
    return { uid: user.id, name: user.name }
  }
  async login(signal: AbortSignal) {
    await this.command('auth', 'login', ['--method', 'qrcode'], signal)
    return this.account(signal)
  }
  async categories(signal?: AbortSignal): Promise<BilibiliCategory[]> {
    const data = await this.command('item', 'categories', [], signal)
    if (!Array.isArray(data)) throw new CatbusFailure('INVALID_RESPONSE')
    return data.map((value) => {
      const category = object(value)
      if (
        typeof category.id !== 'string' ||
        !/^\d+$/.test(category.id) ||
        typeof category.name !== 'string'
      )
        throw new CatbusFailure('INVALID_RESPONSE')
      return {
        id: category.id,
        name: category.name,
        parentId: typeof category.parent_id === 'string' ? category.parent_id : null,
      }
    })
  }
  async publish(
    snapshot: BilibiliPublishSnapshot,
    video: string,
    cover: string,
    signal: AbortSignal,
    progress: (text: string) => void,
  ) {
    const description = join(this.home, `description-${randomUUID()}.txt`)
    writeFileSync(description, snapshot.metadata.description, { mode: 0o600 })
    try {
      const data = object(
        await this.command(
          'item',
          'publish',
          [
            '--video',
            video,
            '--cover',
            cover,
            '--title',
            snapshot.metadata.title,
            '--text',
            `@${description}`,
            ...snapshot.metadata.tags.flatMap((tag) => ['--tag', tag]),
            '--category',
            snapshot.category,
            '--visibility',
            snapshot.visibility,
            ...(snapshot.copyright === 'repost' ? ['--source', snapshot.source] : []),
          ],
          signal,
          progress,
        ),
      )
      if (
        typeof data.id !== 'string' ||
        typeof data.url !== 'string' ||
        data.status !== 'reviewing'
      )
        throw new CatbusFailure('INVALID_RESPONSE')
      let id: string
      try {
        id = bilibiliVideoId(data.id)
        if (bilibiliVideoId(data.url) !== id) throw new Error('mismatch')
      } catch {
        throw new CatbusFailure('INVALID_RESPONSE')
      }
      return { id, url: `https://www.bilibili.com/video/${id}` }
    } finally {
      rmSync(description, { force: true })
    }
  }
  async find(id: string, signal?: AbortSignal) {
    const data = await this.command('item', 'list', ['--limit', '200'], signal)
    if (!Array.isArray(data)) throw new CatbusFailure('INVALID_RESPONSE')
    const found = data.map(object).find((item) => item.id === id)
    if (!found) return null
    return { id, title: found.title, status: found.status, uid: object(found.author).id }
  }
}
