import { useState, type ComponentType } from 'react'
import { EXAMPLE_TOOL_ID, VPN_TOOL, VPN_TOOL_ID, type ToolSnapshot, type ToolboxState, type VpnUsage } from '@shared/toolbox'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Modal } from '@/components/ui/modal'
import { toolboxAPI } from './api'
import { ToolIcon } from './ToolIcon'

export interface ToolContentProps {
  snapshot: ToolSnapshot
  state: ToolboxState
  configure: () => void
}

export interface ToolConfigurationProps {
  state: ToolboxState
  onState: (state: ToolboxState) => void
}

export interface ToolDefinition {
  Content: ComponentType<ToolContentProps>
  Configuration?: ComponentType<ToolConfigurationProps>
  officialUrl?: string
  canRefresh?: (snapshot: ToolSnapshot, state: ToolboxState) => boolean
  needsConfiguration?: (snapshot: ToolSnapshot, state: ToolboxState) => boolean
}

function vpnNeedsConfiguration(snapshot: ToolSnapshot, state: ToolboxState) {
  return !state.vpn.configured || snapshot.error?.code === 'login_required' || snapshot.error?.code === 'challenge'
}

function VpnConfiguration({ state, onState }: ToolConfigurationProps) {
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (operation: 'login' | 'logout') => {
    setError(null)
    try {
      const response = await toolboxAPI[operation]()
      if (!response.success) setError(response.error ?? '操作失败，请重试')
      else if (response.data) onState(response.data)
    } catch { setError('官网会话操作失败，请重试') }
  }
  return <>
    <div className="text-body-sm text-on-surface-variant space-y-md">
      {error && <p role="alert" className="text-error">{error}</p>}
      <div className="flex items-start gap-3 rounded-xl border border-outline-variant/30 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:text-primary-fixed-dim"><ToolIcon name={VPN_TOOL.icon} /></span><div><h3 className="font-semibold text-on-surface">{state.vpn.configured ? '已关联官网套餐' : '连接 Shadowsocks 账号'}</h3><p className="mt-1 text-[13px] leading-relaxed">在官网完成登录并选择套餐，即可查看流量与账单信息。</p><Button size="sm" className="mt-4 h-9 px-4" onClick={() => void run('login')}>{state.vpn.loginOpen ? '返回官网登录窗口' : state.vpn.configured ? '重新选择套餐' : '前往官网登录'}<span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_forward</span></Button></div></div>
      <div className="rounded-xl bg-surface-container-low p-4 text-[13px] leading-relaxed"><p className="mb-1 font-medium text-on-surface">登录与隐私</p><p>{state.vpn.persistentSession ? '登录令牌与最近用量由系统安全存储加密保存在本机，重启后自动恢复。断网时仍可查看上次用量。' : '系统加密存储不可用，当前仅使用临时会话，不会以明文保存登录令牌。'}</p><p className="mt-1">官网会话过期时仍需重新登录。应用不会保存账号密码或订阅链接。</p>{state.vpn.storageWarning && <p role="status" className="mt-2 text-error">{state.vpn.storageWarning}</p>}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/30 pt-4"><p className="text-[12px]">移除关联将同时清除当前面板的用量数据。</p><Button variant="ghost" size="sm" className="text-error hover:text-error" onClick={() => setLogoutOpen(true)}>退出并清除登录</Button></div>
    </div>
    <Modal open={logoutOpen} onClose={() => setLogoutOpen(false)} title="退出并清除登录？" description="将清除专用官网会话、服务关联和当前用量，之后需要重新登录。" cancelText="取消" confirmText="清除登录" variant="danger" onConfirm={() => void run('logout')} />
  </>
}

function VpnContent({ snapshot, state, configure }: ToolContentProps) {
  if (!state.vpn.configured) {
    return <div className="flex h-full flex-col items-center justify-center gap-3 px-2 text-center"><div><h3 className="text-body-md font-semibold text-on-surface">连接你的订阅</h3><p className="mx-auto mt-2 max-w-[260px] text-[13px] leading-relaxed">关联官网套餐，随时查看流量余额与下次付款日期。</p></div><Button size="sm" className="mt-1 h-8 px-4 text-[12px]" onClick={configure}>连接账号<span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_forward</span></Button></div>
  }
  const usage = snapshot.data as VpnUsage | null
  if (!usage) return <p>尚未成功获取用量，请刷新或检查官网会话。</p>
  return <div className="space-y-1 tabular-nums">
    <div className="flex flex-wrap items-baseline justify-between gap-x-2"><p className="text-[12px] leading-6">月流量已用</p><p className="text-[20px] font-semibold leading-6 text-on-surface">{usage.used}<span className="ml-1 text-[12px] font-normal text-on-surface-variant">/ {usage.total} GB</span></p></div>
    {usage.usedPercent !== null && <Progress value={usage.usedPercent} className="[&>div]:h-1" />}
    <div className="grid grid-cols-2 gap-3"><div><p className="text-[11px] leading-4">月流量剩余</p><p className="text-[13px] font-semibold leading-4 text-on-surface">{usage.remaining} GB</p></div><div className="border-l border-outline-variant/30 pl-3"><p className="text-[11px] leading-4">额外包剩余</p><p className="text-[13px] font-semibold leading-4 text-on-surface">{usage.extraRemaining === null ? '未知' : `${usage.extraRemaining} GB`}</p></div></div>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[12px] leading-4">
      <dt>流量重置</dt><dd className="text-right text-on-surface">{usage.nextResetDate ?? '未知'}</dd>
      <dt>下次付款</dt><dd className="text-right text-on-surface">{usage.nextPaymentDate ?? '未知'}</dd>
      <dt>流量周期</dt><dd className="text-right text-on-surface">{usage.cycle ?? '未知'}</dd>
    </dl>
    <p className="text-[11px] leading-4 text-on-surface-variant/75">日期以官网为准 · 实际到期日期未知</p>
  </div>
}

function ExampleContent({ snapshot }: ToolContentProps) {
  const data = snapshot.data as { text: string } | null
  return <div className="space-y-sm"><p>开发扩展验证示例。此内容复用公共卡片的排序、管理、刷新与生命周期。</p><p>{data?.text ?? '尚未获取示例结果'}</p></div>
}

export const toolRegistry: Record<string, ToolDefinition> = {
  [VPN_TOOL_ID]: {
    Content: VpnContent,
    Configuration: VpnConfiguration,
    officialUrl: 'https://portal.shadowsocks.nz',
    canRefresh: (snapshot, state) => !vpnNeedsConfiguration(snapshot, state),
    needsConfiguration: vpnNeedsConfiguration,
  },
  [EXAMPLE_TOOL_ID]: { Content: ExampleContent },
}
