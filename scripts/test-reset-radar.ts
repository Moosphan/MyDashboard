import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { createGuestResetRadarSnapshot, getResetRadarFooterActions, getResetRadarTone } from '../src/shared/reset-radar'
import {
  buildPublicResetRadarSnapshot,
  classifyResetType,
  getOfficialXSourceStatus,
  parseOpenAIStatusPayload,
  parseOfficialXResetAnnouncements,
  parseXResetAnnouncements,
} from '../src/main/services/reset-radar/public-signal'
import { hasChatGPTSessionCookie, waitForChatGPTSession } from '../src/main/services/reset-radar/account-session'
import { normalizeChatGPTUsage, normalizeResetCredits } from '../src/main/services/reset-radar/account-usage'

test('guest radar snapshot never presents private quota data', () => {
  const snapshot = createGuestResetRadarSnapshot('2026-08-27T00:00:00.000Z')

  assert.equal(snapshot.account.status, 'signed_out')
  assert.equal(snapshot.account.limitReached, null)
  assert.equal(snapshot.quotaWindows.length, 0)
  assert.equal(snapshot.resetCredits, null)
  assert.equal(snapshot.forecast.confidence, 'low')
})

test('reset radar card displays the current reset credit count', () => {
  const cardSource = readFileSync(join(__dirname, '../src/renderer/modules/ai-lab/components/ResetRadarCard.tsx'), 'utf8')

  assert.match(cardSource, /snapshot\.resetCredits\?\.availableCount/)
  assert.match(cardSource, /当前重置卡/)
  assert.match(cardSource, /space-y-sm/)
  assert.match(cardSource, /官方确认全局重置/)
  assert.match(cardSource, /source\?\.detail/)
  assert.equal((cardSource.match(/justify-between gap-sm text-\[11px\]/g) ?? []).length, 3)
})

test('radar tone follows deterministic confidence and signal state', () => {
  assert.equal(getResetRadarTone('low', false), 'quiet')
  assert.equal(getResetRadarTone('medium', true), 'watch')
  assert.equal(getResetRadarTone('high', true), 'active')
})

test('bound radar account replaces public status action with account switching', () => {
  assert.deepEqual(getResetRadarFooterActions('connected'), {
    primaryLabel: '更换绑定',
    primaryAction: 'account',
    secondaryLabel: '打开会话',
  })
})

test('parses an operational OpenAI status response without creating a reset signal', () => {
  const status = parseOpenAIStatusPayload({
    status: { indicator: 'none', description: 'All Systems Operational' },
    incidents: [],
  }, '2026-08-28T00:00:00.000Z')

  assert.equal(status.indicator, 'none')
  assert.equal(status.incidentCount, 0)
  assert.equal(status.sourceStatus, 'ok')
  assert.equal(buildPublicResetRadarSnapshot(status).activeSignal, null)
})

test('keeps a public service incident as source health instead of a reset signal', () => {
  const status = parseOpenAIStatusPayload({
    status: { indicator: 'minor', description: 'Some systems are experiencing issues' },
    incidents: [{ name: 'Elevated errors for Codex' }],
  }, '2026-08-28T00:00:00.000Z')

  const snapshot = buildPublicResetRadarSnapshot(status)

  assert.equal(snapshot.activeSignal, null)
  assert.equal(snapshot.forecast.confidence, 'low')
  assert.equal(snapshot.sources[0].status, 'warn')
})

test('extracts official reset announcements from the public X source', () => {
  const announcements = parseXResetAnnouncements({
    source: { user_name: 'thsottiaux', source_url: 'https://x.com/thsottiaux' },
    items: [
      {
        external_id: '2093014447833116908',
        title: 'Never slept better and feeling reseted',
        content: 'Brand new me and brand new usage for all ChatGPT Work and Codex users.',
        author: 'thsottiaux',
        published_at: '2026-08-27T16:35:05',
        url: 'https://x.com/thsottiaux/status/2093014447833116908',
      },
      {
        external_id: 'unrelated',
        title: 'A regular product update',
        content: 'A regular product update without a quota change.',
        published_at: '2026-08-27T12:00:00Z',
      },
    ],
  })

  assert.equal(announcements.length, 1)
  assert.equal(announcements[0].externalId, '2093014447833116908')
  assert.equal(announcements[0].publishedAt, '2026-08-27T16:35:05.000Z')
  assert.equal(announcements[0].resetType, 'global')
})

test('makes the latest official X announcement the active public signal', () => {
  const snapshot = buildPublicResetRadarSnapshot(
    parseOpenAIStatusPayload(
      { status: { indicator: 'none', description: 'All Systems Operational' } },
      '2026-08-28T00:00:00.000Z',
    ),
    [{
      externalId: '2093014447833116908',
      title: 'Never slept better and feeling reseted',
      detail: 'Brand new me and brand new usage for all ChatGPT Work and Codex users.',
      author: 'thsottiaux',
      publishedAt: '2026-08-27T16:35:05.000Z',
      url: 'https://x.com/thsottiaux/status/2093014447833116908',
      resetType: 'global',
      confidence: 'high',
      kind: 'confirmed-global',
    }],
    'ok',
  )

  assert.equal(snapshot.activeSignal?.source, 'X / Tibo (@OpenAI)')
  assert.equal(snapshot.activeSignal?.url, 'https://x.com/thsottiaux/status/2093014447833116908')
  assert.equal(snapshot.publicSignals.length, 1)
  assert.equal(snapshot.forecast.confidence, 'high')
})

test('accepts a short, explicit Tibo global-reset confirmation without quota keywords', () => {
  const announcements = parseOfficialXResetAnnouncements({
    profile: { handle: 'thsottiaux' },
    tweets: [{
      id: 'confirmed-reset',
      text: 'Reset all propagated. Sweet dreams.',
      at: '2026-09-12T08:09:17.000Z',
      url: 'https://x.com/thsottiaux/status/confirmed-reset',
      is_reply: false,
      tibo_lane: 'reset_announcement',
      explicit_reset_claim: true,
    }],
  })

  assert.equal(announcements.length, 1)
  assert.equal(announcements[0].resetType, 'global')
  assert.equal(announcements[0].confidence, 'high')
})

test('does not promote replies or scoped banked resets into high-confidence global resets', () => {
  const announcements = parseOfficialXResetAnnouncements({
    profile: { handle: 'thsottiaux' },
    tweets: [
      {
        id: 'reply-tease',
        text: 'Who says it will not reset in a while?',
        at: '2026-09-12T08:09:17.000Z',
        url: 'https://x.com/thsottiaux/status/reply-tease',
        is_reply: true,
        tibo_lane: 'reset_related',
        explicit_reset_claim: false,
      },
      {
        id: 'plus-banked',
        text: 'Plus users without access will receive a banked reset by end of day.',
        at: '2026-09-12T08:09:17.000Z',
        url: 'https://x.com/thsottiaux/status/plus-banked',
        is_reply: false,
        tibo_lane: 'reset_related',
        explicit_reset_claim: false,
      },
    ],
  })
  const snapshot = buildPublicResetRadarSnapshot(
    parseOpenAIStatusPayload(
      { status: { indicator: 'minor', description: 'Codex degradation' }, incidents: [{ name: 'Codex' }] },
      '2026-09-12T09:00:00.000Z',
    ),
    announcements,
    'ok',
  )

  assert.equal(announcements.length, 1)
  assert.equal(announcements[0].resetType, 'gift')
  assert.equal(announcements[0].confidence, 'medium')
  assert.notEqual(snapshot.activeSignal?.confidence, 'high')
  assert.notEqual(snapshot.activeSignal?.resetType, 'global')
})

test('keeps an OpenAI status incident informational when no official reset announcement exists', () => {
  const status = parseOpenAIStatusPayload({
    status: { indicator: 'major', description: 'Codex degradation' },
    incidents: [{ name: 'Codex' }],
  }, '2026-09-12T09:00:00.000Z')

  const snapshot = buildPublicResetRadarSnapshot(status)

  assert.equal(snapshot.activeSignal, null)
  assert.equal(snapshot.forecast.confidence, 'low')
  assert.equal(snapshot.sources[0].status, 'warn')
})

test('marks an old official X timeline as stale instead of treating HTTP success as fresh data', () => {
  assert.equal(getOfficialXSourceStatus({
    profile: { handle: 'thsottiaux' },
    newest_post_at: '2026-09-10T08:00:00.000Z',
  }, '2026-09-12T09:00:00.000Z'), 'stale')
})

test('deduplicates X announcements and ignores unrelated reset wording', () => {
  const announcements = parseXResetAnnouncements({
    items: [
      {
        external_id: 'same-id',
        title: 'Reset usage limits',
        content: 'Codex usage limits reset for paid users.',
        published_at: '2026-08-27T10:00:00Z',
      },
      {
        external_id: 'same-id',
        title: 'Reset usage limits again',
        content: 'Codex usage limits reset for paid users.',
        published_at: '2026-08-27T11:00:00Z',
      },
      {
        external_id: 'password',
        title: 'Password reset',
        content: 'Reset your password from account settings.',
        published_at: '2026-08-27T12:00:00Z',
      },
    ],
  })

  assert.equal(announcements.length, 1)
  assert.equal(announcements[0].externalId, 'same-id')
})

test('classifies public reset announcements by reset type', () => {
  assert.equal(classifyResetType('We reset usage limits for all paid users.'), 'global')
  assert.equal(classifyResetType('We are giving everyone a banked reset credit.'), 'gift')
  assert.equal(classifyResetType('Usage reset is rolling out.'), 'unknown')
})

test('recognizes a persisted ChatGPT session without exposing cookie values', () => {
  assert.equal(hasChatGPTSessionCookie([{ name: '__Secure-next-auth.session-token', value: 'secret' }]), true)
  assert.equal(hasChatGPTSessionCookie([{ name: '__Secure-next-auth.session-token.0', value: 'secret-part' }]), true)
  assert.equal(hasChatGPTSessionCookie([{ name: 'oai-did', value: 'device-only' }]), false)
  assert.equal(hasChatGPTSessionCookie([]), false)
})

test('waits for a session cookie that is written just after login', async () => {
  let reads = 0
  const status = await waitForChatGPTSession(async () => {
    reads += 1
    return reads === 1
      ? []
      : [{ name: '__Secure-next-auth.session-token.0', value: 'secret-part' }]
  }, { attempts: 2, delayMs: 0 })

  assert.equal(status, 'connected')
  assert.equal(reads, 2)
})

test('normalizes ChatGPT usage windows and reset credits', () => {
  const usage = normalizeChatGPTUsage({
    account: {
      email: 'dorck@example.com',
      name: 'Dorck',
    },
    plan_type: 'pro',
    rate_limit: {
      primary_window: {
        used_percent: 72,
        limit_window_seconds: 18000,
        reset_after_seconds: 3600,
        limit_reached: false,
      },
      secondary_window: {
        used_percent: 35,
        limit_window_seconds: 604800,
        reset_at: '2026-08-28T06:00:00.000Z',
      },
    },
  }, '2026-08-28T05:00:00.000Z', {
    data: {
      plan: 'plus',
      subscription: {
        billing_period: { end: '2026-09-01T00:00:00.000Z' },
      },
    },
  })

  assert.equal(usage?.plan, 'pro')
  assert.equal(usage?.email, 'dorck@example.com')
  assert.equal(usage?.name, 'Dorck')
  assert.equal(usage?.subscriptionExpiresAt, '2026-09-01T00:00:00.000Z')
  assert.equal(usage?.windows[0].kind, 'five_hour')
  assert.equal(usage?.windows[0].remainingPercent, 28)
  assert.equal(usage?.windows[1].kind, 'weekly')
  assert.equal(usage?.limitReached, false)

  const credits = normalizeResetCredits({
    available_count: 2,
    credits: [
      { status: 'available', expires_at: '2026-08-29T00:00:00.000Z' },
      { status: 'redeemed', expires_at: '2026-08-28T00:00:00.000Z' },
    ],
  }, '2026-08-28T05:00:00.000Z')

  assert.deepEqual(credits, {
    availableCount: 2,
    nearestExpiry: '2026-08-29T00:00:00.000Z',
  })
})

test('uses the authenticated session profile when usage payload has no identity', () => {
  const usage = normalizeChatGPTUsage({
    plan_type: 'plus',
    rate_limit: {
      primary_window: {
        used_percent: 20,
        limit_window_seconds: 18000,
      },
    },
  }, '2026-08-28T05:00:00.000Z', null, {
    data: {
      user: {
        email: 'account@example.com',
        name: 'Account Owner',
      },
    },
  })

  assert.equal(usage?.email, 'account@example.com')
  assert.equal(usage?.name, 'Account Owner')
})
