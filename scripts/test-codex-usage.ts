import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildCodexUsageDashboard } from '../src/shared/codex-usage'
import { buildUsageRhythmBars } from '../src/shared/codex-usage-display'

test('builds Codex usage statistics from session token totals', () => {
  const dashboard = buildCodexUsageDashboard({
    generatedAt: '2026-09-02T08:00:00.000Z',
    account: {
      status: 'connected',
      fetchedAt: '2026-09-02T07:55:00.000Z',
      plan: 'pro',
      email: 'dorck@example.com',
      name: 'Dorck',
      subscriptionExpiresAt: '2026-09-08T00:00:00.000Z',
    },
    quotaWindows: [{ kind: 'five_hour', remainingPercent: 72, resetAt: '2026-09-02T10:00:00.000Z', durationSeconds: 18000 }],
    sessionUsage: {
      dailyUsage: [
        { date: '2026-08-27', inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        { date: '2026-08-28', inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        { date: '2026-08-29', inputTokens: 200, outputTokens: 40, totalTokens: 240 },
        { date: '2026-08-30', inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        { date: '2026-08-31', inputTokens: 500, outputTokens: 100, totalTokens: 600 },
        { date: '2026-09-01', inputTokens: 300, outputTokens: 60, totalTokens: 360 },
        { date: '2026-09-02', inputTokens: 250, outputTokens: 50, totalTokens: 300 },
      ],
      inputTokens: 1350,
      outputTokens: 270,
      totalTokens: 1620,
    },
  })

  assert.equal(dashboard.accountEmail, 'dorck@example.com')
  assert.equal(dashboard.dailyUsage.at(-1)?.totalTokens, 300)
  assert.deepEqual(dashboard.activity, {
    totalTokens: 1620,
    todayTokens: 300,
    peakDayTokens: 600,
    currentStreakDays: 3,
    longestStreakDays: 3,
  })
})

test('does not invent session token totals when logs are unavailable', () => {
  const dashboard = buildCodexUsageDashboard({
    generatedAt: '2026-09-02T08:00:00.000Z',
    account: { status: 'signed_out', fetchedAt: null, plan: null, email: null, name: null, subscriptionExpiresAt: null },
    quotaWindows: [],
    sessionUsage: {
      dailyUsage: Array.from({ length: 7 }, (_, index) => ({ date: `2026-08-${String(27 + index).padStart(2, '0')}`, inputTokens: 0, outputTokens: 0, totalTokens: 0 })),
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
  })

  assert.equal(dashboard.activity.totalTokens, 0)
  assert.equal(dashboard.activity.peakDayTokens, 0)
  assert.equal(dashboard.activity.currentStreakDays, 0)
})

test('builds visible labels for token rhythm bars', () => {
  const bars = buildUsageRhythmBars([
    { date: '2026-08-25', totalTokens: 0 },
    { date: '2026-08-26', totalTokens: 1400 },
    { date: '2026-08-27', totalTokens: 12500 },
  ])

  assert.deepEqual(bars.map((bar) => ({
    dateLabel: bar.dateLabel,
    valueLabel: bar.valueLabel,
    heightPercent: bar.heightPercent,
    isEmpty: bar.isEmpty,
  })), [
    { dateLabel: '08/25', valueLabel: '0', heightPercent: 10, isEmpty: true },
    { dateLabel: '08/26', valueLabel: '1.4K', heightPercent: 11, isEmpty: false },
    { dateLabel: '08/27', valueLabel: '12.5K', heightPercent: 100, isEmpty: false },
  ])
})

test('does not show a noisy sync warning inside the usage card', () => {
  const tokenUsageSource = readFileSync(join(__dirname, '../src/renderer/modules/ai-lab/components/TokenUsage.tsx'), 'utf8')

  assert.doesNotMatch(tokenUsageSource, /同步异常/)
})
