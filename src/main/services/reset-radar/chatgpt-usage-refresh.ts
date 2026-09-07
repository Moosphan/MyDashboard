export const CHATGPT_USAGE_REFRESH_INTERVAL_MS = 2 * 60_000

interface UsageResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export interface ChatGPTUsageFetcher {
  fetch(input: string, init?: RequestInit): Promise<UsageResponse>
}

export interface ChatGPTAccountUsagePayload {
  usage: unknown
  credits: unknown | null
  subscription: unknown | null
  session: unknown | null
}

const CHATGPT_ORIGIN = 'https://chatgpt.com'
const REQUEST_HEADERS = {
  accept: 'application/json',
  'oai-language': 'zh-CN',
}

function buildRequestHeaders(accessToken?: string): HeadersInit {
  return accessToken ? { ...REQUEST_HEADERS, authorization: `Bearer ${accessToken}` } : REQUEST_HEADERS
}

async function requestJson(fetcher: ChatGPTUsageFetcher, path: string, accessToken?: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetcher.fetch(`${CHATGPT_ORIGIN}${path}`, {
    headers: buildRequestHeaders(accessToken),
    signal,
  })
  if (!response.ok) throw new Error(`ChatGPT usage request failed: HTTP ${response.status}`)
  return response.json()
}

async function requestFirstAvailable(fetcher: ChatGPTUsageFetcher, paths: string[], accessToken?: string, signal?: AbortSignal): Promise<unknown | null> {
  for (const path of paths) {
    try {
      return await requestJson(fetcher, path, accessToken, signal)
    } catch {
      // Optional metadata endpoints can change independently from the quota endpoint.
    }
  }
  return null
}

export async function fetchChatGPTAccountUsage(fetcher: ChatGPTUsageFetcher, accessToken?: string, signal?: AbortSignal): Promise<ChatGPTAccountUsagePayload> {
  const usage = await requestJson(fetcher, '/backend-api/wham/usage', accessToken, signal)
  const [credits, subscription, authSession, accountProfile] = await Promise.all([
    requestFirstAvailable(fetcher, ['/backend-api/wham/rate-limit-reset-credits'], accessToken, signal),
    requestFirstAvailable(fetcher, ['/backend-api/subscriptions', '/backend-api/subscription'], accessToken, signal),
    requestFirstAvailable(fetcher, ['/api/auth/session'], accessToken, signal),
    requestFirstAvailable(fetcher, ['/backend-api/accounts/check/v4-2023-04-27', '/backend-api/accounts/check'], accessToken, signal),
  ])

  return {
    usage,
    credits,
    subscription,
    session: { auth: authSession, accountProfile },
  }
}
