import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { VideoPlatform } from '../../../shared/video-workflow'
import {
  PUBLISHING_PLATFORMS,
  validPublishingUid,
  type PublishingAccount,
} from '../../../shared/platform-publishing'

export function publishingAccountHome(
  root: string,
  id: string,
  platform: VideoPlatform = 'bilibili',
) {
  if (id === PUBLISHING_PLATFORMS[platform].account)
    return join(root, 'config', 'publishing', platform === 'bilibili' ? 'catbus' : 'catbus-douyin')
  if (!/^account-[0-9a-f-]{36}$/.test(id)) throw new Error('平台账号标识无效')
  return join(root, 'config', 'publishing', `${platform}-accounts`, id)
}

export class PublishingAccounts {
  private readonly path: string
  private data: { selectedId: string | null; accounts: PublishingAccount[] } = {
    selectedId: null,
    accounts: [],
  }

  constructor(
    private root: string,
    private platform: VideoPlatform = 'bilibili',
  ) {
    this.path = join(root, 'config', 'publishing', `${platform}-accounts.json`)
    if (!existsSync(this.path)) return
    try {
      const input = JSON.parse(readFileSync(this.path, 'utf8'))
      if (
        !Array.isArray(input.accounts) ||
        input.accounts.some(
          (account: PublishingAccount) =>
            !account ||
            typeof account.id !== 'string' ||
            !publishingAccountHome(root, account.id, platform) ||
            !validPublishingUid(platform, account.uid) ||
            typeof account.name !== 'string' ||
            typeof account.updatedAt !== 'string',
        ) ||
        (input.selectedId !== null &&
          !input.accounts.some((account: PublishingAccount) => account.id === input.selectedId)) ||
        new Set(input.accounts.map((account: PublishingAccount) => account.uid)).size !==
          input.accounts.length ||
        new Set(input.accounts.map((account: PublishingAccount) => account.id)).size !==
          input.accounts.length
      )
        throw new Error('Invalid account index')
      this.data = {
        selectedId: input.selectedId,
        accounts: input.accounts.map(({ id, uid, name, updatedAt }: PublishingAccount) => ({
          id,
          uid,
          name,
          updatedAt,
        })),
      }
    } catch {
      throw new Error(
        `${PUBLISHING_PLATFORMS[platform].label}账号索引无法读取，请检查本机配置文件 ${platform}-accounts.json`,
      )
    }
  }
  state() {
    return structuredClone(this.data)
  }
  hasIndex() {
    return existsSync(this.path)
  }
  get(id: string) {
    const account = this.data.accounts.find((account) => account.id === id)
    if (!account) throw new Error('平台账号不存在或已解除绑定')
    return account
  }
  private save(next: typeof this.data) {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 })
      renameSync(temporary, this.path)
      this.data = next
    } finally {
      rmSync(temporary, { force: true })
    }
  }
  remember(id: string, user: { uid: string; name: string }) {
    publishingAccountHome(this.root, id, this.platform)
    if (!validPublishingUid(this.platform, user.uid)) throw new Error('平台账号标识无效')
    const duplicate = this.data.accounts.find(
      (account) => account.uid === user.uid && account.id !== id,
    )
    const account = { id, ...user, updatedAt: new Date().toISOString() }
    const existing = this.data.accounts.findIndex((item) => item.id === id || item.uid === user.uid)
    this.save({
      selectedId: id,
      accounts:
        existing < 0
          ? [...this.data.accounts, account]
          : this.data.accounts.map((item, index) => (index === existing ? account : item)),
    })
    if (duplicate) {
      try {
        rmSync(publishingAccountHome(this.root, duplicate.id, this.platform), {
          recursive: true,
          force: true,
        })
      } catch {
        return account
      }
    }
    return account
  }
  remove(id: string) {
    this.get(id)
    rmSync(publishingAccountHome(this.root, id, this.platform), { recursive: true, force: true })
    this.save({
      selectedId: this.data.selectedId === id ? null : this.data.selectedId,
      accounts: this.data.accounts.filter((account) => account.id !== id),
    })
  }
}

export { PublishingAccounts as BilibiliAccounts, publishingAccountHome as bilibiliAccountHome }
