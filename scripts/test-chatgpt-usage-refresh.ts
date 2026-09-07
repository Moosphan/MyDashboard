import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { CHATGPT_USAGE_REFRESH_INTERVAL_MS, fetchChatGPTAccountUsage } from '../src/main/services/reset-radar/chatgpt-usage-refresh'

test('refreshes usage on the configured two-minute interval', () => {
  assert.equal(CHATGPT_USAGE_REFRESH_INTERVAL_MS, 2 * 60_000)
})

interface ResponseLike {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

function jsonResponse(data: unknown, status = 200): ResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }
}

test('reads current quota from the authenticated ChatGPT session', async () => {
  const requests: string[] = []
  const payload = await fetchChatGPTAccountUsage({
    fetch: async (url: string) => {
      requests.push(url)
      if (url.endsWith('/backend-api/wham/usage')) {
        return jsonResponse({ rate_limit: { primary_window: { used_percent: 11 } } })
      }
      if (url.endsWith('/backend-api/wham/rate-limit-reset-credits')) return jsonResponse({ available_count: 1 })
      if (url.endsWith('/backend-api/subscriptions')) return jsonResponse({ plan: 'plus' })
      if (url.endsWith('/api/auth/session')) return jsonResponse({ user: { email: 'dorck@example.com' } })
      return jsonResponse({}, 404)
    },
  })

  assert.deepEqual(payload.usage, { rate_limit: { primary_window: { used_percent: 11 } } })
  assert.deepEqual(payload.credits, { available_count: 1 })
  assert.equal(requests[0], 'https://chatgpt.com/backend-api/wham/usage')
  assert.ok(requests.includes('https://chatgpt.com/api/auth/session'))
})

test('does not treat an unauthorized response as a successful quota refresh', async () => {
  await assert.rejects(
    () => fetchChatGPTAccountUsage({
      fetch: async () => jsonResponse({}, 401),
    }),
    /HTTP 401/,
  )
})

test('uses the page access token when the session requires bearer authentication', async () => {
  let authorization: string | null = null
  await fetchChatGPTAccountUsage({
    fetch: async (_url: string, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get('authorization')
      return jsonResponse({ rate_limit: { primary_window: { used_percent: 1 } } })
    },
  }, 'short-lived-token')

  assert.equal(authorization, 'Bearer short-lived-token')
})

test('passes a cancellation signal to each usage request', async () => {
  const controller = new AbortController()
  const signals: AbortSignal[] = []

  await fetchChatGPTAccountUsage({
    fetch: async (_url: string, init?: RequestInit) => {
      if (init?.signal instanceof AbortSignal) signals.push(init.signal)
      return jsonResponse({ rate_limit: { primary_window: { used_percent: 1 } } })
    },
  }, undefined, controller.signal)

  assert.ok(signals.length > 0)
  assert.ok(signals.every((signal) => signal === controller.signal))
})

test('routes manual refresh and wake recovery through the resilient usage scheduler', () => {
  const aiIpcSource = readFileSync(join(__dirname, '../src/main/ipc/ai.ts'), 'utf8')
  const schedulerSource = readFileSync(join(__dirname, '../src/main/services/reset-radar/usage-refresh-scheduler.ts'), 'utf8')

  assert.match(aiIpcSource, /refreshChatGPTUsageNow/)
  assert.match(schedulerSource, /powerMonitor\.on\('resume'/)
  assert.match(schedulerSource, /export function refreshChatGPTUsageNow/)
  assert.match(schedulerSource, /if \(options\.rebuildSession\) activeRefreshController\?\.abort\(\)/)
})
