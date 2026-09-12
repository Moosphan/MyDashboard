import {
  createGuestResetRadarSnapshot,
  type ResetRadarPublicSignal,
  type ResetRadarConfidence,
  type ResetRadarResetType,
  type ResetRadarSnapshot,
} from '../../../shared/reset-radar'

export const OPENAI_STATUS_URL = 'https://status.openai.com/api/v2/summary.json'
export const CODEX_RESET_FEED_URL = process.env.CODEX_RESET_FEED_URL || 'https://codex-reset.com/api/feed'

const OFFICIAL_CODEX_LEAD_HANDLE = 'thsottiaux'
const ACTIVE_CONFIRMATION_MAX_AGE_MS = 24 * 60 * 60 * 1000

export interface OpenAIStatusSummary {
  indicator: 'none' | 'minor' | 'major' | 'critical' | 'unknown'
  description: string
  incidentCount: number
  sourceStatus: 'ok' | 'warn' | 'error'
  observedAt: string
}

export interface XResetAnnouncement {
  externalId: string
  title: string
  detail: string
  author: string
  publishedAt: string
  url: string
  resetType: ResetRadarResetType
  confidence: ResetRadarConfidence
  kind: 'confirmed-global' | 'announced-global' | 'banked'
}

export type XSourceStatus = 'ok' | 'stale' | 'error'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeIndicator(value: unknown): OpenAIStatusSummary['indicator'] {
  if (value === 'none' || value === 'minor' || value === 'major' || value === 'critical') return value
  return 'unknown'
}

function asIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const raw = String(value).trim()
  if (!raw) return null
  const normalized = typeof value === 'string' && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
    ? `${raw}Z`
    : raw
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function isResetAnnouncement(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ')
  if (/password reset|git reset|reset button|reset config|reset cache|重置密码|重置配置/.test(normalized)) return false
  const mentionsQuota = /codex|chatgpt work|usage|limit|quota|allowance|credits|rate limit|额度|配额|限额/.test(normalized)
  const mentionsReset = /reset(?:ed|ting|s)?|refill|restore|replenish|regain|恢复|重置/.test(normalized)
  return mentionsQuota && mentionsReset
}

export function classifyResetType(text: string): ResetRadarResetType {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ')
  if (/banked reset|reset credit|gift(?:ed|ing)? reset|赠送|重置卡|credits? to everyone/.test(normalized)) return 'gift'
  if (/global reset|all (?:paid )?users|all plans|all chatgpt|all codex|全局|所有用户|全部用户/.test(normalized)) return 'global'
  return 'unknown'
}

function getOfficialResetKind(
  text: string,
  explicitResetClaim: boolean,
): XResetAnnouncement['kind'] | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ')
  const isBanked = /banked reset|reset credit|gift(?:ed|ing)? reset|赠送|重置卡/.test(normalized)
  if (isBanked) return 'banked'

  const explicitGlobalReset = /\b(?:reset all|all reset|global reset)\b|全部.*重置|所有.*重置/.test(normalized)
  if (explicitResetClaim && explicitGlobalReset) return 'confirmed-global'

  const announcedGlobalReset = /\b(?:will|going to|plan to|do)\b.{0,64}\b(?:global|full)?\s*reset\b.{0,96}\b(?:all|everyone|paid|subscriptions|users)\b/.test(normalized)
    || /\b(?:global|full) reset\b.{0,96}\b(?:all|everyone|paid|subscriptions|users)\b/.test(normalized)
  return announcedGlobalReset ? 'announced-global' : null
}

function createXAnnouncement(input: {
  externalId: string
  title: string
  detail: string
  author: string
  publishedAt: string
  url: string
  kind: XResetAnnouncement['kind']
}): XResetAnnouncement {
  const resetType: ResetRadarResetType = input.kind === 'banked' ? 'gift' : 'global'
  return {
    ...input,
    resetType,
    confidence: input.kind === 'confirmed-global' ? 'high' : 'medium',
  }
}

export function parseXResetAnnouncements(payload: unknown): XResetAnnouncement[] {
  const root = asRecord(payload)
  const source = asRecord(root.source)
  const items = Array.isArray(root.items) ? root.items : []
  const sourceAuthor = asString(source.user_name, 'thsottiaux')

  return items.map((value): XResetAnnouncement | null => {
    const item = asRecord(value)
    const externalId = asString(item.external_id ?? item.id, '')
    const detail = asString(item.content ?? item.text, '')
    const title = asString(item.title, detail)
    const publishedAt = asIsoDate(item.published_at ?? item.created_at)
    if (!externalId || !detail || !publishedAt || !isResetAnnouncement(`${title} ${detail}`)) return null
    const author = asString(item.author ?? asRecord(item.metadata).author_user_name, sourceAuthor)
    const url = asString(item.url, `https://x.com/${author}/status/${externalId}`)
    const resetType = classifyResetType(`${title} ${detail}`)
    return createXAnnouncement({
      externalId,
      title,
      detail,
      author,
      publishedAt,
      url,
      kind: resetType === 'gift' ? 'banked' : 'confirmed-global',
    })
  }).filter((item): item is XResetAnnouncement => item !== null)
    .filter((item, index, items) => items.findIndex((candidate) => candidate.externalId === item.externalId) === index)
    .sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime())
}

export function parseOfficialXResetAnnouncements(payload: unknown): XResetAnnouncement[] {
  const root = asRecord(payload)
  const profile = asRecord(root.profile)
  const author = asString(profile.handle, '')
  const tweets = Array.isArray(root.tweets) ? root.tweets : []
  if (author !== OFFICIAL_CODEX_LEAD_HANDLE) return []

  return tweets.map((value): XResetAnnouncement | null => {
    const tweet = asRecord(value)
    const externalId = asString(tweet.id, '')
    const detail = asString(tweet.text, '')
    const publishedAt = asIsoDate(tweet.at ?? tweet.declared_at)
    if (!externalId || !detail || !publishedAt || asBoolean(tweet.is_reply)) return null

    const kind = getOfficialResetKind(detail, asBoolean(tweet.explicit_reset_claim))
    if (!kind) return null
    return createXAnnouncement({
      externalId,
      title: detail,
      detail,
      author,
      publishedAt,
      url: asString(tweet.url, `https://x.com/${author}/status/${externalId}`),
      kind,
    })
  }).filter((item): item is XResetAnnouncement => item !== null)
    .filter((item, index, items) => items.findIndex((candidate) => candidate.externalId === item.externalId) === index)
    .sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime())
}

export function getOfficialXSourceStatus(payload: unknown, observedAt = new Date().toISOString()): XSourceStatus {
  const root = asRecord(payload)
  const profile = asRecord(root.profile)
  if (asString(profile.handle, '') !== OFFICIAL_CODEX_LEAD_HANDLE) return 'error'
  if (asBoolean(root.stale)) return 'stale'
  const newestPostAt = asIsoDate(root.newest_post_at)
  if (!newestPostAt) return 'stale'
  const age = new Date(observedAt).getTime() - new Date(newestPostAt).getTime()
  return age > ACTIVE_CONFIRMATION_MAX_AGE_MS ? 'stale' : 'ok'
}

export function parseOpenAIStatusPayload(payload: unknown, observedAt = new Date().toISOString()): OpenAIStatusSummary {
  const root = asRecord(payload)
  const status = asRecord(root.status)
  const incidents = Array.isArray(root.incidents) ? root.incidents : []
  const indicator = normalizeIndicator(status.indicator)

  return {
    indicator,
    description: asString(status.description, 'OpenAI Status response received'),
    incidentCount: incidents.length,
    sourceStatus: indicator === 'unknown' ? 'error' : indicator === 'none' ? 'ok' : 'warn',
    observedAt,
  }
}

function isRecentConfirmation(announcement: XResetAnnouncement, observedAt: string): boolean {
  return announcement.kind === 'confirmed-global'
    && new Date(observedAt).getTime() - new Date(announcement.publishedAt).getTime() <= ACTIVE_CONFIRMATION_MAX_AGE_MS
    && new Date(observedAt).getTime() >= new Date(announcement.publishedAt).getTime() - 5 * 60 * 1000
}

export function buildPublicResetRadarSnapshot(
  status: OpenAIStatusSummary,
  announcements: XResetAnnouncement[] = [],
  xSourceStatus: XSourceStatus = 'ok',
): ResetRadarSnapshot {
  const snapshot = createGuestResetRadarSnapshot(status.observedAt)
  const observedTimestamp = new Date(status.observedAt).getTime()
  const latestConfirmation = xSourceStatus === 'ok' ? announcements.find((announcement) => {
    const publishedTimestamp = new Date(announcement.publishedAt).getTime()
    return isRecentConfirmation(announcement, status.observedAt)
      && publishedTimestamp <= observedTimestamp + 5 * 60 * 1000
  }) : undefined
  const latestOfficialUpdate = xSourceStatus === 'ok' ? announcements.find((announcement) => {
    const publishedTimestamp = new Date(announcement.publishedAt).getTime()
    return announcement.kind !== 'confirmed-global'
      && publishedTimestamp <= observedTimestamp + 5 * 60 * 1000
      && observedTimestamp - publishedTimestamp <= ACTIVE_CONFIRMATION_MAX_AGE_MS
  }) : undefined
  const confidence = latestConfirmation ? 'high' : latestOfficialUpdate ? 'medium' : 'low'

  snapshot.forecast.confidence = confidence
  snapshot.forecast.peakProbability = latestConfirmation ? 0.85 : latestOfficialUpdate ? 0.35 : 0.12
  snapshot.forecast.label = latestConfirmation
    ? '检测到官方确认的全局重置'
    : latestOfficialUpdate ? '检测到官方重置相关动态，待账户核验' : '暂无官方重置信号'
  snapshot.sources[0] = {
    id: 'openai-status',
    label: 'OpenAI Status',
    status: status.sourceStatus,
    detail: status.description,
  }
  snapshot.sources[1] = {
    id: 'codex-lead-x',
    label: 'X / Tibo (@OpenAI)',
    status: xSourceStatus,
    detail: xSourceStatus === 'error'
      ? 'X 公开动态源暂时不可用'
      : xSourceStatus === 'stale' ? '官方动态源数据已过期，暂不用于雷达判断'
        : announcements.length > 0 ? `已读取 ${announcements.length} 条重置相关动态` : '已检查官方动态，暂未发现重置相关公告',
  }
  snapshot.publicSignals = announcements.map((announcement): ResetRadarPublicSignal => ({
    id: `x:${announcement.externalId}`,
    title: announcement.title,
    detail: announcement.detail,
    source: 'X / Tibo (@OpenAI)',
    url: announcement.url,
    observedAt: announcement.publishedAt,
    confidence: announcement.confidence,
    resetType: announcement.resetType,
  }))

  if (latestConfirmation) {
    snapshot.activeSignal = {
      id: `x:${latestConfirmation.externalId}`,
      title: latestConfirmation.title,
      detail: latestConfirmation.detail,
      source: 'X / Tibo (@OpenAI)',
      url: latestConfirmation.url,
      observedAt: latestConfirmation.publishedAt,
      confidence: 'high',
      resetType: 'global',
    }
    snapshot.advice = {
      kind: 'wait',
      title: '官方已确认全局重置',
      detail: '这是公开公告信号；账户同步可能存在延迟，请刷新账户用量确认实际状态。',
    }
  } else if (latestOfficialUpdate) {
    snapshot.activeSignal = {
      id: `x:${latestOfficialUpdate.externalId}`,
      title: latestOfficialUpdate.title,
      detail: latestOfficialUpdate.detail,
      source: 'X / Tibo (@OpenAI)',
      url: latestOfficialUpdate.url,
      observedAt: latestOfficialUpdate.publishedAt,
      confidence: 'medium',
      resetType: latestOfficialUpdate.resetType,
    }
    snapshot.advice = {
      kind: 'check_account',
      title: latestOfficialUpdate.resetType === 'gift' ? '官方提到定向重置卡' : '官方提到重置安排',
      detail: '该动态不代表全部账户已完成重置，请刷新账户用量确认。',
    }
  }

  return snapshot
}

export async function fetchPublicResetRadarSnapshot(signal?: AbortSignal): Promise<ResetRadarSnapshot> {
  const observedAt = new Date().toISOString()
  const [statusResult, xResult] = await Promise.allSettled([
    fetch(OPENAI_STATUS_URL, { headers: { Accept: 'application/json' }, signal }),
    fetch(CODEX_RESET_FEED_URL, { headers: { Accept: 'application/json' }, signal }),
  ])
  const errors: string[] = []
  let status = parseOpenAIStatusPayload({}, observedAt)
  let xAnnouncements: XResetAnnouncement[] = []
  let xSourceStatus: XSourceStatus = 'error'

  if (statusResult.status === 'fulfilled' && statusResult.value.ok) {
    status = parseOpenAIStatusPayload(await statusResult.value.json() as unknown, observedAt)
  } else {
    errors.push(statusResult.status === 'fulfilled' ? `OpenAI Status HTTP ${statusResult.value.status}` : String(statusResult.reason))
  }

  if (xResult.status === 'fulfilled' && xResult.value.ok) {
    const payload = await xResult.value.json() as unknown
    xAnnouncements = parseOfficialXResetAnnouncements(payload)
    xSourceStatus = getOfficialXSourceStatus(payload, observedAt)
  } else {
    errors.push(xResult.status === 'fulfilled' ? `X source HTTP ${xResult.value.status}` : String(xResult.reason))
  }

  const statusAvailable = statusResult.status === 'fulfilled' && statusResult.value.ok
  const xAvailable = xResult.status === 'fulfilled' && xResult.value.ok
  if (!statusAvailable && !xAvailable) {
    throw new Error(errors.join('; ') || 'Public reset signal sources unavailable')
  }
  return buildPublicResetRadarSnapshot(status, xAnnouncements, xSourceStatus)
}
