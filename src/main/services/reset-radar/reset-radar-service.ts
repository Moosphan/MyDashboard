import { createGuestResetRadarSnapshot, type ResetRadarHistoryEntry, type ResetRadarSnapshot } from '../../../shared/reset-radar'
import { session } from 'electron'
import { CHATGPT_SESSION_PARTITION, waitForChatGPTSession } from './account-session'
import { normalizeChatGPTUsage, normalizeResetCredits } from './account-usage'
import { getDatabase } from '../../database/connection'
import { ResetRadarRepository, type ResetRadarAccountSnapshotData } from '../../database/repositories/reset-radar-repository'
import { fetchPublicResetRadarSnapshot } from './public-signal'
import { sendDedupedNotification } from '../notification-service'
import { fetchChatGPTAccountUsage } from './chatgpt-usage-refresh'

const CACHE_DURATION_MS = 10 * 60 * 1000
const REQUEST_TIMEOUT_MS = 10_000

let cachedSnapshot: ResetRadarSnapshot | null = null
let cachedAt = 0

function getHistoryRepository(): ResetRadarRepository {
  return new ResetRadarRepository(getDatabase())
}

function persistPublicSignals(snapshot: ResetRadarSnapshot): void {
  const historyRepository = getHistoryRepository()
  for (const signal of snapshot.publicSignals) {
    if (historyRepository.hasExternalId(signal.id)) {
      historyRepository.updateResetType(signal.id, signal.resetType)
      continue
    }
    historyRepository.addReset(
      signal.observedAt,
      signal.title,
      signal.detail,
      signal.source,
      { externalId: signal.id, url: signal.url, resetType: signal.resetType },
    )
  }
}

const CHATGPT_SESSION_URLS = [
  'https://chatgpt.com',
  'https://chat.openai.com',
  'https://auth.openai.com',
]

export async function getChatGPTAccountStatus(waitForSession = false): Promise<'connected' | 'signed_out' | 'error'> {
  try {
    const chatGPTSession = session.fromPartition(CHATGPT_SESSION_PARTITION)
    return await waitForChatGPTSession(
      async () => {
        const cookieLists = await Promise.all(
          CHATGPT_SESSION_URLS.map((url) => chatGPTSession.cookies.get({ url })),
        )
        return cookieLists.flat()
      },
      waitForSession ? { attempts: 6, delayMs: 250 } : undefined,
    )
  } catch {
    return 'error'
  }
}

async function addAccountStatus(snapshot: ResetRadarSnapshot, waitForSession = false): Promise<ResetRadarSnapshot> {
  const status = await getChatGPTAccountStatus(waitForSession)
  const historyRepository = getHistoryRepository()
  const persistedAccountSnapshot = historyRepository.getAccountSnapshot()
  const cachedAccountSnapshot = cachedSnapshot
  const accountData = cachedAccountSnapshot?.account ?? persistedAccountSnapshot
  const keepAccountData = status === 'connected' && accountData !== null
  const nextSnapshot: ResetRadarSnapshot = {
    ...snapshot,
    account: {
      ...snapshot.account,
      ...(keepAccountData && accountData ? {
        plan: accountData.plan,
        email: accountData.email,
        name: accountData.name,
        subscriptionExpiresAt: accountData.subscriptionExpiresAt,
        limitReached: accountData.limitReached,
        fetchedAt: accountData.fetchedAt,
      } : {}),
      status,
      // Keep the actual quota observation time. Checking that cookies still exist is not a usage refresh.
      fetchedAt: status === 'connected' && accountData ? accountData.fetchedAt : snapshot.account.fetchedAt,
      lastResetAt: snapshot.account.lastResetAt ?? getHistoryRepository().getRecent(1)[0]?.occurredAt ?? null,
    },
    quotaWindows: keepAccountData && snapshot.quotaWindows.length === 0 && accountData
      ? (cachedAccountSnapshot?.quotaWindows ?? persistedAccountSnapshot?.quotaWindows ?? [])
      : snapshot.quotaWindows,
    resetCredits: keepAccountData && snapshot.resetCredits === null && accountData
      ? (cachedAccountSnapshot?.resetCredits ?? persistedAccountSnapshot?.resetCredits ?? null)
      : snapshot.resetCredits,
  }

  if (status === 'connected') {
    nextSnapshot.advice = {
      kind: 'none',
      title: 'ChatGPT 会话已连接',
      detail: '已复用本地登录会话；点击刷新可重新读取公开信号。',
    }
  }

  return nextSnapshot
}

function hasQuotaReset(previous: ResetRadarSnapshot | null, nextWindows: ResetRadarSnapshot['quotaWindows']): boolean {
  if (!previous || previous.quotaWindows.length === 0 || nextWindows.length === 0) return false
  return nextWindows.some((nextWindow) => previous.quotaWindows.some((previousWindow) => (
    previousWindow.kind === nextWindow.kind
    && previousWindow.remainingPercent !== null
    && nextWindow.remainingPercent !== null
    && nextWindow.remainingPercent - previousWindow.remainingPercent >= 20
    && previousWindow.resetAt !== nextWindow.resetAt
  )))
}

export function ingestChatGPTAccountUsage(
  rawUsage: unknown,
  rawCredits: unknown,
  rawSubscription?: unknown,
  rawSession?: unknown,
): ResetRadarSnapshot {
  const observedAt = new Date().toISOString()
  const usage = normalizeChatGPTUsage(rawUsage, observedAt, rawSubscription, rawSession)
  if (!usage) throw new Error('ChatGPT usage response did not contain rate-limit windows')

  const historyRepository = getHistoryRepository()
  const persistedAccountSnapshot = historyRepository.getAccountSnapshot()
  const previous = cachedSnapshot ?? (persistedAccountSnapshot ? {
    ...createGuestResetRadarSnapshot(persistedAccountSnapshot.fetchedAt),
    account: {
      ...createGuestResetRadarSnapshot(persistedAccountSnapshot.fetchedAt).account,
      status: 'connected' as const,
      fetchedAt: persistedAccountSnapshot.fetchedAt,
      plan: persistedAccountSnapshot.plan,
      email: persistedAccountSnapshot.email,
      name: persistedAccountSnapshot.name,
      subscriptionExpiresAt: persistedAccountSnapshot.subscriptionExpiresAt,
      limitReached: persistedAccountSnapshot.limitReached,
    },
    quotaWindows: persistedAccountSnapshot.quotaWindows,
    resetCredits: persistedAccountSnapshot.resetCredits,
  } : null)
  const history = historyRepository.getRecent(1)[0]
  let lastResetAt = previous?.account.lastResetAt ?? history?.occurredAt ?? null

  if (hasQuotaReset(previous, usage.windows)) {
    const entry = historyRepository.addReset(
      observedAt,
      '观测到配额窗口重置',
      'ChatGPT 用量窗口在连续采样中恢复，已记录为一次本地观测事件。',
      'ChatGPT usage',
      { resetType: 'unknown' },
    )
    lastResetAt = entry.occurredAt
  }

  const resetCredits = normalizeResetCredits(rawCredits, observedAt)
  const nextSnapshot: ResetRadarSnapshot = {
    ...(previous ?? createGuestResetRadarSnapshot(observedAt)),
    generatedAt: observedAt,
    account: {
      status: 'connected',
      fetchedAt: usage.fetchedAt,
      plan: usage.plan,
      email: usage.email ?? previous?.account.email ?? null,
      name: usage.name ?? previous?.account.name ?? null,
      subscriptionExpiresAt: usage.subscriptionExpiresAt ?? previous?.account.subscriptionExpiresAt ?? null,
      limitReached: usage.limitReached,
      lastResetAt,
    },
    quotaWindows: usage.windows,
    resetCredits: resetCredits ?? previous?.resetCredits ?? null,
  }
  nextSnapshot.advice = {
    kind: usage.limitReached ? 'wait' : 'none',
    title: usage.limitReached ? '当前已达到用量限制' : 'ChatGPT 用量已同步',
    detail: usage.limitReached
      ? '等待窗口重置后再继续使用；时间轴只记录本地观测到的重置事件。'
      : '数据来自内置浏览器当前登录会话，最后同步时间已更新。',
  }

  cachedSnapshot = nextSnapshot
  cachedAt = Date.now()
  historyRepository.saveAccountSnapshot({
    plan: nextSnapshot.account.plan,
    email: nextSnapshot.account.email,
    name: nextSnapshot.account.name,
    subscriptionExpiresAt: nextSnapshot.account.subscriptionExpiresAt,
    limitReached: nextSnapshot.account.limitReached,
    quotaWindows: nextSnapshot.quotaWindows,
    resetCredits: nextSnapshot.resetCredits,
    fetchedAt: nextSnapshot.account.fetchedAt ?? observedAt,
  } satisfies ResetRadarAccountSnapshotData)
  historyRepository.addUsageSample({
    observedAt,
    quotaWindows: nextSnapshot.quotaWindows,
  })
  return nextSnapshot
}

export async function refreshChatGPTAccountUsage(accessToken?: string, signal?: AbortSignal): Promise<ResetRadarSnapshot> {
  const status = await getChatGPTAccountStatus()
  if (status !== 'connected') throw new Error('当前没有可用的 ChatGPT 登录会话')
  if (signal?.aborted) throw new Error('ChatGPT usage refresh timed out')

  const chatGPTSession = session.fromPartition(CHATGPT_SESSION_PARTITION)
  const payload = await fetchChatGPTAccountUsage(chatGPTSession, accessToken, signal)
  if (signal?.aborted) throw new Error('ChatGPT usage refresh timed out')
  return ingestChatGPTAccountUsage(payload.usage, payload.credits, payload.subscription, payload.session)
}

export function getResetRadarHistory(limit = 20): ResetRadarHistoryEntry[] {
  return getHistoryRepository().getRecent(limit)
}

function createUnavailableSnapshot(message: string): ResetRadarSnapshot {
  const snapshot = cachedSnapshot ?? createGuestResetRadarSnapshot()
  return {
    ...snapshot,
    generatedAt: new Date().toISOString(),
    sources: snapshot.sources.map((source) => ({ ...source, status: 'error', detail: message })),
  }
}

export async function getResetRadarSnapshot(forceRefresh = false): Promise<ResetRadarSnapshot> {
  const now = Date.now()
  if (!forceRefresh && cachedSnapshot && now - cachedAt < CACHE_DURATION_MS) {
    return addAccountStatus(cachedSnapshot, forceRefresh)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const publicSnapshot = await fetchPublicResetRadarSnapshot(controller.signal)
    persistPublicSignals(publicSnapshot)
    if (publicSnapshot.activeSignal?.confidence === 'high') {
      sendDedupedNotification(`reset-radar:${publicSnapshot.activeSignal.id}`, {
        title: 'AI Reset Radar 检测到高置信信号',
        body: publicSnapshot.activeSignal.title,
        silent: true,
        target: { type: 'reset-radar', signalId: publicSnapshot.activeSignal.id },
      })
    }
    const snapshot = await addAccountStatus(publicSnapshot, forceRefresh)
    cachedSnapshot = snapshot
    cachedAt = Date.now()
    return snapshot
  } catch (error) {
    return addAccountStatus(createUnavailableSnapshot(error instanceof Error ? error.message : 'Public signal unavailable'), forceRefresh)
  } finally {
    clearTimeout(timeout)
  }
}
