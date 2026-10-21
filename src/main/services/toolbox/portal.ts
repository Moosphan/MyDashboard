import { app, BrowserWindow, dialog, safeStorage, session, type Cookie, type Session } from 'electron'
import { readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { ToolFailure, type ToolSnapshot, type VpnSessionStatus, type VpnUsage } from '../../../shared/toolbox'
import { parsePortalFields, type PortalFields } from './portal-parser'
import { EncryptedPortalStore } from './encrypted-store'

const ORIGIN = 'https://portal.shadowsocks.nz'
const HOME = `${ORIGIN}/clientarea.php`

interface PortalRecord {
  version: 1
  service: string | null
  cookies: Cookie[]
  cached: { service: string; data: VpnUsage; lastSuccessAt: number } | null
}

function emptyRecord(): PortalRecord {
  return { version: 1, service: null, cookies: [], cached: null }
}

function portalCookie(cookie: Cookie): boolean {
  const domain = cookie.domain?.replace(/^\./, '')
  return domain === 'portal.shadowsocks.nz' || domain === 'shadowsocks.nz' && !cookie.hostOnly
}

function validateRecord(value: unknown): PortalRecord {
  if (!value || typeof value !== 'object') throw new Error('Invalid cache')
  const record = value as PortalRecord
  if (record.version !== 1 || (record.service !== null && (typeof record.service !== 'string' || !/^\d{1,20}$/.test(record.service))) || !Array.isArray(record.cookies) || record.cookies.length > 200) throw new Error('Invalid cache')
  for (const cookie of record.cookies) {
    if (!cookie || typeof cookie.domain !== 'string' || !portalCookie(cookie) || typeof cookie.name !== 'string' || typeof cookie.value !== 'string' || typeof cookie.path !== 'string' || !cookie.path.startsWith('/') || typeof cookie.secure !== 'boolean' || typeof cookie.httpOnly !== 'boolean' || (cookie.expirationDate !== undefined && !Number.isFinite(cookie.expirationDate)) || !['unspecified', 'no_restriction', 'lax', 'strict'].includes(cookie.sameSite)) throw new Error('Invalid Cookie cache')
  }
  if (record.cached !== null) {
    const cached = record.cached
    if (!cached || cached.service !== record.service || !cached.data || !Number.isFinite(cached.lastSuccessAt) || cached.lastSuccessAt <= 0 || cached.lastSuccessAt > Date.now() + 60_000) throw new Error('Invalid usage cache')
    const data = cached.data
    cached.data = parsePortalFields({ overview: true, usageDetail: `${data.used} GB / ${data.total} GB`, remaining: `${data.remaining} GB`, extra: data.extraRemaining === null ? '' : `${data.extraRemaining} GB`, percent: data.usedPercent === null ? '' : String(data.usedPercent), reset: data.nextResetDate ?? '', payment: data.nextPaymentDate ?? '', cycle: data.cycle ?? '' })
  }
  return record
}

function trusted(value: string): boolean {
  try { return new URL(value).origin === ORIGIN } catch { return false }
}

function serviceFromUrl(value: string): string | null {
  if (!trusted(value)) return null
  const url = new URL(value)
  const service = url.searchParams.get('id')
  return url.pathname === '/clientarea.php' && url.searchParams.get('action') === 'productdetails' && service && /^\d{1,20}$/.test(service) ? service : null
}

export const PORTAL_EXTRACT_SCRIPT = `(() => {
  const text = selector => document.querySelector(selector)?.textContent?.trim() || '';
  const columns = [...document.querySelectorAll('#Overview .data-column')];
  const extra = columns.find(column => column.textContent.includes('额外购买的流量包剩余量'));
  const labels = [...document.querySelectorAll('#Overview *')].filter(element => element.textContent.trim().replace(/[：:]$/, '') === '下次付款日期');
  const payment = labels.flatMap(label => [label.nextElementSibling, label.parentElement]).map(element => element?.textContent.trim().replace(/^下次付款日期\\s*[：:]?\\s*/, '') || '').find(value => /^\\d{4}[/-]\\d{2}[/-]\\d{2}$/.test(value)) || '';
  const cycleText = text('#days-remaining-bar-graph .usage-detail');
  return {
    overview: !!document.querySelector('#Overview #data-usage-bar-graph'),
    login: !!document.querySelector('form[action*="dologin"], form#frmLogin, form.login-form'),
    challenge: !!document.querySelector('#challenge-form, #cf-challenge-running') || /Just a moment|Attention Required|安全检查|Checking your browser/i.test(document.title),
    unavailable: !!document.querySelector('.alert-danger') && /服务.*(?:不存在|不可用)|not found|not authorized|access denied/i.test(text('.alert-danger')),
    usageDetail: text('#data-usage-bar-graph .usage-detail'),
    remaining: text('#data-usage-bar-graph .usage-addition-info'),
    percent: document.querySelector('#data-usage-bar-graph .progress-bar')?.getAttribute('aria-valuenow') || '',
    extra: extra ? (extra.textContent.match(/\\d+(?:\\.\\d+)?\\s+[A-Za-z]+\\s*剩余/)?.[0] || 'unsupported') : '',
    reset: text('#days-remaining-bar-graph .usage-addition-info'), payment,
    cycle: cycleText.match(/\\d{4}[/-]\\d{2}[/-]\\d{2}\\s*(?:-|至|到|~|–|—)\\s*\\d{4}[/-]\\d{2}[/-]\\d{2}/)?.[0] || ''
  };
})()`

export class ShadowsocksPortal {
  private readonly partition: Session
  private readonly persistentSession: boolean
  private readonly store: EncryptedPortalStore
  private record = emptyRecord()
  private readonly ready: Promise<void>
  private restoring = true
  private storageWarning: string | undefined
  private readonly configPath = join(app.getPath('userData'), 'toolbox', 'portal-service.json')
  private service: string | null = null
  private login: BrowserWindow | null = null
  private readonly requests = new Set<BrowserWindow>()
  private disposed = false
  private generation = 0
  private confirming = false
  private clearing = false

  private readonly cookieChanged = (_event: Electron.Event, cookie: Cookie, _cause: string, removed: boolean): void => {
    if (this.disposed || this.clearing || this.restoring || !portalCookie(cookie)) return
    this.record.cookies = this.record.cookies.filter(saved => saved.domain !== cookie.domain || saved.path !== cookie.path || saved.name !== cookie.name)
    if (!removed) this.record.cookies.push(cookie)
    this.saveRecord()
  }

  constructor(private readonly onChanged: (configurationChanged?: boolean) => void) {
    this.store = new EncryptedPortalStore(join(app.getPath('userData'), 'toolbox', 'portal-cache.enc'), safeStorage, process.platform)
    this.persistentSession = this.store.available
    this.partition = session.fromPartition(`toolbox-shadowsocks-${randomUUID()}`, { cache: false })
    this.partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    this.partition.setPermissionCheckHandler(() => false)
    this.partition.on('will-download', event => event.preventDefault())
    try {
      const saved = this.store.load()
      if (saved !== null) this.record = validateRecord(saved)
      else {
        try {
          const legacy: unknown = JSON.parse(readFileSync(this.configPath, 'utf8'))
          if (legacy && typeof legacy === 'object' && 'service' in legacy && typeof legacy.service === 'string' && /^\d{1,20}$/.test(legacy.service)) this.record.service = legacy.service
        } catch { this.record = emptyRecord() }
      }
    } catch {
      this.record = emptyRecord()
      this.storageWarning = '本机缓存无法解密或已损坏，请重新登录。'
    }
    this.service = this.record.service
    this.partition.cookies.on('changed', this.cookieChanged)
    this.ready = this.restoreCookies().finally(() => { this.restoring = false })
  }

  getStatus(): VpnSessionStatus {
    return { configured: this.service !== null, persistentSession: this.persistentSession, loginOpen: this.login !== null, storageWarning: this.storageWarning }
  }

  getCachedSnapshot(): ToolSnapshot | null {
    const cached = this.record.cached
    if (!cached || cached.service !== this.service) return null
    return { data: { ...cached.data }, lastSuccessAt: cached.lastSuccessAt, refreshing: false, error: null, stale: false, fromCache: true }
  }

  private saveRecord(): void {
    if (!this.store.available || this.disposed || this.clearing || this.restoring) return
    try {
      if (!this.record.service && !this.record.cookies.length && !this.record.cached) this.store.clear()
      else this.store.save(this.record)
      this.storageWarning = undefined
    } catch {
      this.storageWarning = '本机加密缓存保存失败，请检查磁盘权限或空间后重试。'
    }
  }

  private async restoreCookies(): Promise<void> {
    try {
      this.record.cookies = this.record.cookies.filter(cookie => cookie.expirationDate === undefined || cookie.expirationDate > Date.now() / 1000)
      for (const cookie of this.record.cookies) {
        if (this.disposed || this.clearing) return
        await this.partition.cookies.set({ url: `https://${cookie.domain!.replace(/^\./, '')}${cookie.path}`, name: cookie.name, value: cookie.value, domain: cookie.hostOnly ? undefined : cookie.domain, path: cookie.path, secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, expirationDate: cookie.expirationDate })
      }
    } catch {
      this.storageWarning = '本机登录状态恢复失败，请重新登录官网。'
    }
  }

  private async readUsage(window: BrowserWindow, generation: number, signal?: AbortSignal): Promise<VpnUsage> {
    let previous: VpnUsage | null = null
    for (let attempt = 0; attempt < 25; attempt++) {
      if (this.disposed || generation !== this.generation || window.isDestroyed() || signal?.aborted) throw new Error('Aborted')
      const fields: PortalFields = await window.webContents.executeJavaScript(PORTAL_EXTRACT_SCRIPT)
      try {
        const usage = parsePortalFields(fields)
        if (JSON.stringify(usage) === JSON.stringify(previous)) return usage
        previous = usage
      } catch (error) {
        previous = null
        if (!(error instanceof ToolFailure) || error.code !== 'unsupported' || attempt === 24) throw error
      }
      await delay(150, undefined, { signal })
    }
    throw new ToolFailure('unsupported', '官网统计尚未稳定，请稍后刷新或打开官网检查。')
  }

  private window(show: boolean): BrowserWindow {
    const window = new BrowserWindow({ width: 1050, height: 780, show, title: 'Shadowsocks 官网', autoHideMenuBar: true, webPreferences: { session: this.partition, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, url) => { if (!trusted(url)) event.preventDefault() })
    window.webContents.on('will-redirect', (event, url) => { if (!trusted(url)) event.preventDefault() })
    window.webContents.on('will-attach-webview', event => event.preventDefault())
    return window
  }

  async openLogin(): Promise<void> {
    await this.ready
    if (this.disposed) return
    if (this.clearing) throw new ToolFailure('network', '正在清除登录，请稍后重试。')
    if (this.login) { this.login.show(); this.login.focus(); return }
    const window = this.window(true)
    this.login = window
    this.generation++
    this.service = null
    this.record.service = null
    this.record.cached = null
    this.saveRecord()
    window.on('closed', () => { if (this.login === window) this.login = null; this.onChanged() })
    window.webContents.on('did-finish-load', () => { void this.confirmSelection(window) })
    this.onChanged(true)
    try { await rm(this.configPath, { force: true }) } catch {
      window.destroy()
      throw new ToolFailure('network', '无法更新本地服务关联，请重试。')
    }
    if (!this.persistentSession) await dialog.showMessageBox(window, { type: 'info', message: '系统加密存储不可用', detail: '为避免明文保存登录令牌，本次仅使用临时登录；系统加密可用后将自动保留登录。', buttons: ['继续登录'] })
    if (!window.isDestroyed()) await window.loadURL(HOME).catch(() => { throw new ToolFailure('network', '官网加载失败，请稍后重试。') })
  }

  private async confirmSelection(window: BrowserWindow): Promise<void> {
    const service = serviceFromUrl(window.webContents.getURL())
    if (!service || this.confirming || window.isDestroyed()) return
    this.confirming = true
    const generation = this.generation
    try {
      await this.readUsage(window, generation)
      const result = await dialog.showMessageBox(window, { type: 'question', message: '使用当前官网页面的套餐？', detail: '确认后工具箱将只读取当前选中的服务。可在官网打开其他套餐详情后重新选择。', buttons: ['使用此套餐', '取消'], defaultId: 0, cancelId: 1 })
      if (result.response !== 0 || this.disposed || generation !== this.generation || window.isDestroyed() || serviceFromUrl(window.webContents.getURL()) !== service) return
      if (generation !== this.generation || this.disposed) return
      this.service = service
      this.record.service = service
      this.saveRecord()
      if (this.storageWarning && this.persistentSession) {
        this.service = null
        this.record.service = null
        throw new Error('Could not persist service')
      }
      this.onChanged(true)
      window.close()
    } catch {
      if (!window.isDestroyed()) await dialog.showMessageBox(window, { type: 'warning', message: '无法关联当前服务', detail: this.storageWarning ?? '请确认页面已显示有效的套餐用量，然后重新打开套餐详情。', buttons: ['知道了'] })
    } finally { this.confirming = false }
  }

  async read(signal: AbortSignal): Promise<VpnUsage> {
    await this.ready
    if (!this.service) throw new ToolFailure('login_required', '请先登录官网并确认所选套餐。')
    if (this.disposed || signal.aborted) throw new Error('Aborted')
    const window = this.window(false)
    this.requests.add(window)
    const generation = this.generation
    const service = this.service
    let rejectAbort: (reason: Error) => void = () => undefined
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
    const cancel = (): void => { rejectAbort(new Error('Aborted')); if (!window.isDestroyed()) window.destroy() }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      return await Promise.race([aborted, (async () => {
        await window.loadURL(`${HOME}?action=productdetails&id=${encodeURIComponent(service)}`)
        const usage = await this.readUsage(window, generation, signal)
        if (signal.aborted || generation !== this.generation) throw new Error('Aborted')
        if (serviceFromUrl(window.webContents.getURL()) !== service) throw new ToolFailure('service_unavailable', '官网未返回所选套餐，请重新选择服务。')
        this.record.cached = { service, data: usage, lastSuccessAt: Date.now() }
        this.saveRecord()
        return usage
      })()])
    } catch (error) {
      if (error instanceof ToolFailure) throw error
      if (signal.aborted || generation !== this.generation || this.disposed) throw new Error('Aborted')
      throw new ToolFailure('network', '官网读取失败，请稍后重试。')
    } finally {
      signal.removeEventListener('abort', cancel)
      this.requests.delete(window)
      if (!window.isDestroyed()) window.destroy()
    }
  }

  async clear(): Promise<void> {
    if (this.clearing) throw new ToolFailure('network', '正在清除登录，请稍后重试。')
    this.clearing = true
    this.generation++
    this.service = null
    this.record = emptyRecord()
    this.login?.destroy()
    this.login = null
    for (const window of this.requests) if (!window.isDestroyed()) window.destroy()
    this.onChanged(true)
    try {
      await this.ready
      const results = await Promise.allSettled([
        rm(this.configPath, { force: true }),
        Promise.resolve().then(() => this.store.clear()),
        this.partition.clearStorageData(),
        this.partition.clearCache(),
        this.partition.closeAllConnections(),
      ])
      if (results.some(result => result.status === 'rejected')) throw new ToolFailure('network', '登录信息未能完全清除，请重试。')
    } finally {
      this.clearing = false
    }
  }

  dispose(): void {
    this.disposed = true
    this.generation++
    this.partition.cookies.removeListener('changed', this.cookieChanged)
    this.login?.destroy()
    this.login = null
    for (const window of this.requests) if (!window.isDestroyed()) window.destroy()
    this.requests.clear()
  }
}
