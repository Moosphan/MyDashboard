import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  BILIBILI_ACTIVE,
  BILIBILI_STATE_LABELS,
  type BilibiliAccountsState,
  type BilibiliConnection,
  type BilibiliPublishRequest,
  type BilibiliPublishSnapshot,
  type BilibiliSubmission,
} from '../../../shared/bilibili-publishing'
import {
  stageUnlocked,
  stageValue,
  type VideoPlatform,
  type WorkflowRuntime,
} from '../../../shared/video-workflow'
import { PUBLISHING_PLATFORMS, validPublishingUid } from '../../../shared/platform-publishing'
import {
  fingerprint,
  VideoWorkflowRepository,
} from '../../database/repositories/video-workflow-repository'
import { WorkflowFiles } from './files'
import {
  CatbusPublishingClient,
  publishingVideoId,
  publishingVideoUrl,
  CatbusFailure,
} from './catbus'
import { PublishingAccounts, publishingAccountHome } from './bilibili-accounts'

type SubmissionRow = { record: string; request_fingerprint: string }
const RETRYABLE = ['failed', 'needs_auth', 'cancelled']

export class PlatformPublishingService {
  private running = new Map<string, { controller: AbortController; promise: Promise<void> }>()
  private login?: { controller: AbortController; promise: Promise<void> }
  private checking?: Promise<BilibiliConnection>
  private readonly reads = new AbortController()
  private stopped = false
  private accountReads = 0
  private readonly boundAccounts: PublishingAccounts
  private get table() {
    return this.platform === 'bilibili' ? 'video_bilibili_submissions' : 'video_douyin_submissions'
  }
  private get label() {
    return PUBLISHING_PLATFORMS[this.platform].label
  }
  private get defaultAccount() {
    return PUBLISHING_PLATFORMS[this.platform].account
  }
  private connectionState: BilibiliConnection = {
    state: 'disconnected',
    uid: null,
    name: null,
    qrCode: null,
    error: null,
  }

  constructor(
    private root: string,
    private db: Database.Database,
    private projects: VideoWorkflowRepository,
    private files: WorkflowFiles,
    private runtime: () => WorkflowRuntime,
    private changed: (projectId: string) => void,
    private platform: VideoPlatform = 'bilibili',
  ) {
    this.boundAccounts = new PublishingAccounts(root, platform)
    for (const row of this.db
      .prepare(
        `SELECT record FROM ${this.table} WHERE state IN ('queued','uploading','submitting')`,
      )
      .all() as SubmissionRow[]) {
      const record = JSON.parse(row.record) as BilibiliSubmission
      this.update(record, {
        state: record.state === 'queued' ? 'cancelled' : 'unknown',
        error:
          record.state === 'queued'
            ? '应用退出，尚未开始投稿'
            : '应用退出前的投稿结果待核查，请先检查创作中心',
      })
    }
  }
  private client(id = this.boundAccounts.state().selectedId ?? this.defaultAccount) {
    return new CatbusPublishingClient(this.root, { ...this.runtime() }, id, this.platform)
  }
  private clientForUid(uid: string) {
    const { accounts } = this.boundAccounts.state()
    const account = accounts.find((account) => account.uid === uid)
    if (!account && this.boundAccounts.hasIndex())
      throw new CatbusFailure('AUTH_REQUIRED', this.platform)
    return this.client(account?.id ?? this.defaultAccount)
  }
  accounts(): BilibiliAccountsState {
    return {
      ...this.boundAccounts.state(),
      connection: { ...this.connectionState },
      busy: Boolean(this.busy()),
    }
  }
  private get(projectId: string, id: string) {
    const record = this.list(projectId).find((item) => item.id === id)
    if (!record) throw new Error('投稿记录不存在')
    return record
  }
  list(projectId: string): BilibiliSubmission[] {
    this.projects.get(projectId)
    return (
      this.db
        .prepare(`SELECT record FROM ${this.table} WHERE project_id=? ORDER BY rowid DESC`)
        .all(projectId) as SubmissionRow[]
    ).map((row) => JSON.parse(row.record))
  }
  private update(record: BilibiliSubmission, changes: Partial<BilibiliSubmission>) {
    const next = { ...record, ...changes, updatedAt: new Date().toISOString() }
    if (changes.state && !changes.phase) next.phase = BILIBILI_STATE_LABELS[changes.state]
    this.db
      .prepare(`UPDATE ${this.table} SET state=?,record=? WHERE id=?`)
      .run(next.state, JSON.stringify(next), record.id)
    this.changed(record.projectId)
    return next
  }
  private busy() {
    return (
      this.login ||
      this.checking ||
      this.accountReads ||
      this.db
        .prepare(
          `SELECT id FROM ${this.table} WHERE state IN ('queued','uploading','submitting') LIMIT 1`,
        )
        .get()
    )
  }
  async connection(refresh = false): Promise<BilibiliConnection> {
    if (this.stopped) throw new Error('发布服务正在退出')
    if (!refresh || this.login) return { ...this.connectionState }
    if (this.checking) return this.checking
    const { selectedId } = this.boundAccounts.state()
    if (!selectedId && this.boundAccounts.hasIndex()) {
      this.connectionState = {
        state: 'disconnected',
        uid: null,
        name: null,
        qrCode: null,
        error: null,
      }
      return { ...this.connectionState }
    }
    this.connectionState = { ...this.connectionState, state: 'checking', error: null }
    this.checking = (async () => {
      try {
        const account = await this.client().account(this.reads.signal)
        if (selectedId && this.boundAccounts.get(selectedId).uid !== account.uid)
          throw new Error('登录账号与绑定 UID 不一致，请重新扫码原账号')
        this.boundAccounts.remember(selectedId ?? this.defaultAccount, account)
        this.connectionState = { state: 'connected', ...account, qrCode: null, error: null }
      } catch (error) {
        this.connectionState = {
          state: 'error',
          uid: null,
          name: null,
          qrCode: null,
          error: (error as Error).message,
        }
      } finally {
        this.checking = undefined
      }
      return { ...this.connectionState }
    })()
    return this.checking
  }
  connect(accountId?: string) {
    if (this.stopped) throw new Error('发布服务正在退出')
    if (this.busy()) throw new Error(`请等待当前${this.label}操作结束`)
    const expected = accountId === undefined ? undefined : this.boundAccounts.get(accountId)
    const previous = { ...this.connectionState }
    const temporaryId = `account-${randomUUID()}`
    const client = this.client(temporaryId),
      controller = new AbortController()
    const qr = join(client.home, 'cache', this.platform, 'qrcode.png')
    rmSync(qr, { force: true })
    this.connectionState = { state: 'connecting', uid: null, name: null, qrCode: null, error: null }
    const timer = setInterval(() => {
      if (existsSync(qr)) {
        try {
          const data = readFileSync(qr)
          if (data.length <= 1024 * 1024)
            this.connectionState.qrCode = `data:image/png;base64,${data.toString('base64')}`
        } catch {
          // The QR file may be replaced while the login helper is writing it.
        }
      }
    }, 300)
    const promise = Promise.resolve().then(async () => {
      try {
        const account = await client.login(controller.signal)
        if (expected && account.uid !== expected.uid)
          throw new Error('扫码账号与待重新登录账号的 UID 不一致，已保留原绑定')
        if (controller.signal.aborted) throw new CatbusFailure('CANCELLED', this.platform)
        this.boundAccounts.remember(temporaryId, account)
        this.connectionState = { state: 'connected', ...account, qrCode: null, error: null }
      } catch (error) {
        rmSync(client.home, { recursive: true, force: true })
        this.connectionState = {
          ...previous,
          state: previous.uid ? previous.state : 'disconnected',
          qrCode: null,
          error: controller.signal.aborted ? null : (error as Error).message,
        }
      } finally {
        clearInterval(timer)
        rmSync(qr, { force: true })
        this.login = undefined
        this.changed('')
      }
    })
    this.login = { controller, promise }
    return { ...this.connectionState }
  }
  async cancelLogin() {
    if (this.login) {
      this.login.controller.abort()
      await this.login.promise
    }
    return { ...this.connectionState }
  }
  async selectAccount(id: string) {
    if (this.stopped) throw new Error('发布服务正在退出')
    if (this.busy()) throw new Error(`请等待当前${this.label}操作结束后切换账号`)
    const selected = this.boundAccounts.get(id)
    const promise = (async () => {
      const account = await this.client(id).account(this.reads.signal)
      if (account.uid !== selected.uid)
        throw new Error('登录账号与绑定 UID 不一致，请重新扫码原账号')
      this.boundAccounts.remember(id, account)
      this.connectionState = { state: 'connected', ...account, qrCode: null, error: null }
      return { ...this.connectionState }
    })()
    this.checking = promise
    try {
      return await promise
    } finally {
      this.checking = undefined
      this.changed('')
    }
  }
  async removeAccount(id: string) {
    if (this.stopped) throw new Error('发布服务正在退出')
    if (this.busy()) throw new Error(`请等待当前${this.label}操作结束后解除绑定`)
    const selected = this.boundAccounts.state().selectedId === id
    this.boundAccounts.remove(id)
    if (selected)
      this.connectionState = {
        state: 'disconnected',
        uid: null,
        name: null,
        qrCode: null,
        error: null,
      }
    this.changed('')
    return this.accounts()
  }
  async disconnect() {
    await this.cancelLogin()
    if (this.busy()) throw new Error(`请等待${this.label}投稿结束后再断开账号`)
    const selected = this.boundAccounts.state().selectedId
    if (selected) await this.removeAccount(selected)
    else
      rmSync(publishingAccountHome(this.root, this.defaultAccount, this.platform), {
        recursive: true,
        force: true,
      })
    this.connectionState = {
      state: 'disconnected',
      uid: null,
      name: null,
      qrCode: null,
      error: null,
    }
    return { ...this.connectionState }
  }
  async categories() {
    return this.client().categories(this.reads.signal)
  }
  start(input: BilibiliPublishRequest): BilibiliSubmission {
    if (this.stopped) throw new Error('发布服务正在退出')
    if (
      !input ||
      typeof input.projectId !== 'string' ||
      typeof input.requestId !== 'string' ||
      !input.requestId ||
      input.requestId.length > 120
    )
      throw new Error('缺少有效投稿请求 ID')
    const requestFingerprint = fingerprint(input)
    const previous = this.db
      .prepare(`SELECT record,request_fingerprint FROM ${this.table} WHERE request_id=?`)
      .get(input.requestId) as SubmissionRow | undefined
    if (previous) {
      if (previous.request_fingerprint !== requestFingerprint)
        throw new Error('请求 ID 已用于不同投稿')
      return JSON.parse(previous.record)
    }
    if (!validPublishingUid(this.platform, input.accountUid))
      throw new Error(`请先连接并确认${this.label}账号`)
    if (
      this.platform === 'bilibili' &&
      (typeof input.category !== 'string' || !/^\d+$/.test(input.category))
    )
      throw new Error('请选择有效投稿分区')
    if (!['public', 'private'].includes(input.visibility)) throw new Error('请明确选择投稿可见性')
    if (!['original', 'repost'].includes(input.copyright)) throw new Error('请选择自制或转载')
    if (
      input.copyright === 'repost' &&
      (typeof input.source !== 'string' || !input.source.trim() || input.source.length > 2000)
    )
      throw new Error('转载必须填写来源，最多 2000 字符')
    const project = this.projects.get(input.projectId)
    if (project.revision !== input.expectedRevision) throw new Error('项目已更新，请刷新后重试')
    if (project.stages.publish?.status !== 'approved' || !stageUnlocked(project, 'publish'))
      throw new Error('请先审核通过正式成片与发布资料')
    const render = stageValue(project, 'render')!,
      metadata = stageValue(project, 'publish')!.platforms[this.platform]
    if (this.platform === 'bilibili' && !metadata.tags.some((tag) => tag.trim()))
      throw new Error('B 站投稿至少需要一个有效标签，请修改资料并重新审核')
    if (
      metadata.submission &&
      ((this.platform === 'bilibili' && metadata.submission.category !== input.category) ||
        metadata.submission.visibility !== input.visibility ||
        metadata.submission.copyright !== input.copyright ||
        (input.copyright === 'repost' && metadata.submission.source !== input.source?.trim()))
    )
      throw new Error('投稿设置与已审核资料不一致，请保存并重新审核后投稿')
    const snapshot: BilibiliPublishSnapshot = structuredClone({
      renderRevisionId: project.stages.render!.id,
      publishRevisionId: project.stages.publish.id,
      video: render.file,
      cover: render.cover,
      metadata,
      accountUid: input.accountUid,
      category: this.platform === 'bilibili' ? input.category : '',
      visibility: input.visibility,
      copyright: input.copyright,
      source: input.copyright === 'repost' ? input.source!.trim() : '',
    })
    const intent = fingerprint([project.id, snapshot])
    const existing = (
      this.db
        .prepare(`SELECT record FROM ${this.table} WHERE intent_key=? ORDER BY rowid DESC`)
        .all(intent) as SubmissionRow[]
    )
      .map((row) => JSON.parse(row.record) as BilibiliSubmission)
      .find((record) => !RETRYABLE.includes(record.state))
    if (existing) return existing
    const unresolved = this.list(project.id).find(
      (record) =>
        ['unknown', 'risk_control'].includes(record.state) &&
        record.snapshot.accountUid === snapshot.accountUid &&
        record.snapshot.video.sha256 === snapshot.video.sha256,
    )
    if (unresolved) throw new Error('此成片有待核查的投稿，请先核查平台状态或确认未投稿后再尝试')
    if (this.busy()) throw new Error(`已有${this.label}任务在执行，请等待完成`)
    const now = new Date().toISOString()
    const record: BilibiliSubmission = {
      id: randomUUID(),
      projectId: project.id,
      requestId: input.requestId,
      state: 'queued',
      phase:
        this.platform === 'bilibili'
          ? '核对账号、分区与已审核文件'
          : '核对账号、可见性与已审核文件',
      snapshot,
      externalId: null,
      url: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
      verifiedAt: null,
      cliVersion: '0.2.1',
    }
    this.db
      .prepare(`INSERT INTO ${this.table} VALUES(?,?,?,?,?,?,?)`)
      .run(
        record.id,
        project.id,
        input.requestId,
        requestFingerprint,
        intent,
        record.state,
        JSON.stringify(record),
      )
    const controller = new AbortController()
    const promise = Promise.resolve()
      .then(() => this.execute(record, controller.signal))
      .finally(() => this.running.delete(record.id))
    this.running.set(record.id, { controller, promise })
    this.changed(project.id)
    return record
  }
  private async execute(record: BilibiliSubmission, signal: AbortSignal) {
    let started = false
    try {
      const selected = this.boundAccounts.state().selectedId
      if (
        this.boundAccounts.hasIndex() &&
        (!selected || this.boundAccounts.get(selected).uid !== record.snapshot.accountUid)
      )
        throw new CatbusFailure('AUTH_EXPIRED', this.platform)
      const client = this.clientForUid(record.snapshot.accountUid)
      const account = await client.account(signal)
      if (account.uid !== record.snapshot.accountUid)
        throw new CatbusFailure('AUTH_EXPIRED', this.platform)
      if (this.platform === 'bilibili') {
        const categories = await client.categories(signal)
        if (
          !categories.some(
            (category) => category.id === record.snapshot.category && category.parentId,
          )
        )
          throw new Error('所选分区不可投稿，请重新选择子分区')
      }
      const video = await this.files.verify(record.projectId, record.snapshot.video),
        cover = await this.files.verify(record.projectId, record.snapshot.cover)
      const current = this.projects.get(record.projectId)
      if (
        current.stages.render?.id !== record.snapshot.renderRevisionId ||
        current.stages.publish?.id !== record.snapshot.publishRevisionId ||
        current.stages.publish.status !== 'approved' ||
        !stageUnlocked(current, 'publish')
      )
        throw new Error('准备期间审核版本已变化，请重新确认后发布')
      if (signal.aborted) throw new CatbusFailure('CANCELLED', this.platform)
      started = true
      record = this.update(record, { state: 'uploading' })
      const result = await client.publish(record.snapshot, video, cover, signal, (phase) => {
        record = this.update(record, { phase })
      })
      this.update(record, {
        state: 'reviewing',
        externalId: result.id,
        url: result.url,
        error: null,
        submittedAt: new Date().toISOString(),
      })
    } catch (error) {
      const code = error instanceof CatbusFailure ? error.code : ''
      const state = ['AUTH_REQUIRED', 'AUTH_EXPIRED'].includes(code)
        ? 'needs_auth'
        : code === 'RISK_CONTROL'
          ? 'risk_control'
          : started && !['USAGE', 'UNSUPPORTED'].includes(code)
            ? 'unknown'
            : code === 'CANCELLED'
              ? 'cancelled'
              : 'failed'
      this.update(record, { state, error: (error as Error).message })
    }
  }
  async cancel(projectId: string, id: string) {
    const record = this.get(projectId, id),
      active = this.running.get(id)
    if (!active) return record
    active.controller.abort()
    await active.promise
    return this.get(projectId, id)
  }
  async refresh(projectId: string, id: string, suppliedId?: string) {
    if (this.stopped) throw new Error('发布服务正在退出')
    if (this.login || this.checking)
      throw new Error(`请等待当前${this.label}账号操作结束后核查投稿`)
    this.accountReads++
    try {
      return await this.refreshRecord(projectId, id, suppliedId)
    } finally {
      this.accountReads--
    }
  }
  private async refreshRecord(projectId: string, id: string, suppliedId?: string) {
    const record = this.get(projectId, id)
    if (suppliedId !== undefined && (typeof suppliedId !== 'string' || suppliedId.length > 500))
      throw new Error(`请填写有效${PUBLISHING_PLATFORMS[this.platform].item}或作品链接`)
    if (BILIBILI_ACTIVE.includes(record.state)) throw new Error('请等待当前投稿结束')
    const externalId =
      record.externalId ?? (suppliedId ? publishingVideoId(this.platform, suppliedId) : null)
    if (!externalId)
      throw new Error(`请先在创作中心核查，并填写对应${PUBLISHING_PLATFORMS[this.platform].item}`)
    const client = this.clientForUid(record.snapshot.accountUid),
      account = await client.account(this.reads.signal)
    if (account.uid !== record.snapshot.accountUid)
      throw new Error('当前账号与投稿账号不一致，请重新连接原账号')
    const item = await client.find(externalId, this.reads.signal)
    if (!item)
      throw new Error(
        `最近 200 条投稿中尚未找到此${PUBLISHING_PLATFORMS[this.platform].item}，已保留原记录，请稍后核查`,
      )
    if (
      item.uid !== record.snapshot.accountUid ||
      (suppliedId && item.title !== record.snapshot.metadata.title)
    )
      throw new Error('此稿件的账号或标题与本次投稿不符，未绑定记录')
    const state =
      item.status === 'published'
        ? this.platform === 'bilibili' && record.snapshot.visibility === 'private'
          ? 'private'
          : 'published'
        : item.status === 'private'
          ? 'private'
          : item.status === 'rejected'
            ? 'rejected'
            : item.status === 'reviewing'
              ? 'reviewing'
              : null
    if (!state) throw new Error('平台状态暂无法确认，已保留原记录')
    return this.update(record, {
      state,
      externalId,
      url: publishingVideoUrl(this.platform, externalId),
      error: null,
      verifiedAt: new Date().toISOString(),
    })
  }
  confirmNotSubmitted(projectId: string, id: string) {
    const record = this.get(projectId, id)
    if (!['unknown', 'risk_control'].includes(record.state))
      throw new Error('只有待核查或风控记录可以确认未投稿')
    return this.update(record, {
      state: 'failed',
      error: '用户核查创作中心后确认未投稿，允许手动发起新尝试',
    })
  }
  async dispose() {
    this.stopped = true
    this.reads.abort()
    this.login?.controller.abort()
    for (const active of this.running.values()) active.controller.abort()
    await Promise.allSettled([
      ...(this.checking ? [this.checking] : []),
      ...(this.login ? [this.login.promise] : []),
      ...[...this.running.values()].map((active) => active.promise),
    ])
  }
}

export { PlatformPublishingService as BilibiliPublishingService }
