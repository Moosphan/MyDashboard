export const VPN_TOOL_ID = 'shadowsocks'
export const EXAMPLE_TOOL_ID = 'toolbox-example'
export const VPN_REFRESH_MS = 5 * 60_000
export const TOOL_TIMEOUT_MS = 30_000
export const TOOL_STALE_MS = 30 * 60_000

export interface ToolDescriptor {
  id: string
  title: string
  icon: string
  description: string
  refreshable: boolean
}

export const VPN_TOOL: ToolDescriptor = {
  id: VPN_TOOL_ID,
  title: 'Shadowsocks 套餐',
  icon: 'send',
  description: '查看月流量配额、额外流量包与付款日期',
  refreshable: true,
}

export const EXAMPLE_TOOL: ToolDescriptor = {
  id: EXAMPLE_TOOL_ID,
  title: '扩展验证示例',
  icon: 'extension',
  description: '仅开发环境可用，用于验证公共卡片与生命周期',
  refreshable: true,
}

export interface ToolPreference {
  id: string
  enabled: boolean
  visible: boolean
  pinned: boolean
  everEnabled: boolean
}

export interface ToolboxPreferences {
  version: 1
  tools: ToolPreference[]
}

export type ToolboxAction =
  | { type: 'pin' | 'visible' | 'enabled'; toolId: string; value: boolean }
  | { type: 'move'; toolId: string; targetId: string }

export type ToolErrorCode = 'network' | 'timeout' | 'login_required' | 'challenge' | 'unsupported' | 'service_unavailable'

export interface ToolError {
  code: ToolErrorCode
  message: string
}

export class ToolFailure extends Error {
  constructor(public readonly code: ToolErrorCode, message: string) {
    super(message)
    this.name = 'ToolFailure'
  }
}

export interface ToolSnapshot {
  data: unknown | null
  lastSuccessAt: number | null
  refreshing: boolean
  error: ToolError | null
  stale: boolean
  fromCache?: boolean
}

export interface VpnUsage {
  used: string
  total: string
  remaining: string
  extraRemaining: string | null
  unit: 'GB'
  usedPercent: number | null
  nextResetDate: string | null
  nextPaymentDate: string | null
  cycle: string | null
}

export interface VpnSessionStatus {
  configured: boolean
  persistentSession: boolean
  loginOpen: boolean
  storageWarning?: string
}

export interface ToolboxState {
  revision: number
  preferences: ToolboxPreferences
  tools: ToolDescriptor[]
  snapshots: Record<string, ToolSnapshot>
  vpn: VpnSessionStatus
  active: boolean
}

export interface ToolboxResponse {
  success: boolean
  data?: ToolboxState
  error?: string
}

export interface ToolboxAPI {
  get(): Promise<ToolboxResponse>
  update(action: ToolboxAction): Promise<ToolboxResponse>
  setActive(active: boolean): Promise<ToolboxResponse>
  refresh(toolId: string): Promise<ToolboxResponse>
  login(): Promise<ToolboxResponse>
  logout(): Promise<ToolboxResponse>
  onUpdated(callback: (state: ToolboxState) => void): () => void
}
