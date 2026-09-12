import { useCallback, useEffect, useState } from 'react'
import type { CodexUsageDashboard } from '@shared/codex-usage'
import { buildUsageRhythmBars, formatUsageTokens } from '@shared/codex-usage-display'

function formatDateTime(value: string | null): string {
  if (!value) return '暂无记录'
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatPlan(plan: string | null): string {
  if (!plan) return '未连接 ChatGPT'
  const labels: Record<string, string> = {
    free: 'ChatGPT Free',
    plus: 'ChatGPT Plus',
    pro: 'ChatGPT Pro',
    team: 'ChatGPT Team',
    enterprise: 'ChatGPT Enterprise',
  }
  return labels[plan.toLowerCase()] ?? plan
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  const visible = local.length <= 2 ? local[0] : local.slice(0, 3)
  return `${visible}${local.length > visible.length ? '***' : '*'}@${domain}`
}

function formatAccountIdentity(dashboard: CodexUsageDashboard): string {
  if (dashboard.accountStatus !== 'connected') return '等待连接'
  if (dashboard.accountEmail) return maskEmail(dashboard.accountEmail)
  if (dashboard.accountName) return dashboard.accountName
  return '已连接'
}

function getWindow(kind: 'five_hour' | 'weekly', dashboard: CodexUsageDashboard) {
  return dashboard.quotaWindows.find((item) => item.kind === kind)
}

function QuotaWindow({
  label,
  remainingPercent,
  resetAt,
}: {
  label: string
  remainingPercent: number | null
  resetAt: string | null
}) {
  const hasData = remainingPercent !== null
  const safePercent = Math.max(0, Math.min(100, remainingPercent ?? 0))

  return (
    <div className="rounded-lg bg-surface-container-low px-sm py-xs">
      <div className="flex items-center justify-between gap-xs text-[10px]">
        <span className="font-semibold text-on-surface-variant">{label}</span>
        <span className="font-bold text-on-surface">{hasData ? `${safePercent}% 剩余` : '暂无数据'}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${safePercent}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-on-surface-variant">
        {hasData ? `重置于 ${formatDateTime(resetAt)}` : '登录后刷新用量'}
      </p>
    </div>
  )
}

function ActivityMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-outline-variant/20 bg-surface-container-low px-sm py-xs">
      <p className="truncate text-[10px] text-on-surface-variant">{label}</p>
      <p className="mt-0.5 whitespace-nowrap text-[13px] font-bold leading-tight text-on-surface">{value}</p>
    </div>
  )
}

export function TokenUsage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [dashboard, setDashboard] = useState<CodexUsageDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async (forceRefresh = false) => {
    setError(null)
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const response = await window.electronAPI.invoke('ai:getCodexUsageDashboard', { forceRefresh })
      if (response.success && response.data) {
        setDashboard(response.data as CodexUsageDashboard)
      } else {
        setError(response.error ?? '使用统计暂不可用')
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '使用统计暂不可用')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const refreshQuota = useCallback(async () => {
    setError(null)
    setRefreshing(true)
    try {
      const response = await window.electronAPI.invoke('ai:refreshCodexUsageDashboard')
      if (response.success && response.data) {
        setDashboard(response.data as CodexUsageDashboard)
      } else {
        setError(response.error ?? '实时额度同步失败')
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : '实时额度同步失败')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard().catch(() => {})
  }, [loadDashboard, refreshKey])

  useEffect(() => window.electronAPI.onCodexUsageUpdated(() => {
    loadDashboard().catch(() => {})
  }), [loadDashboard])

  if (loading && !dashboard) {
    return (
      <div className="h-full min-h-[190px] w-full flex-1 rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-md shadow-ambient flex items-center justify-center">
        <div className="flex items-center gap-xs text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
          正在读取使用统计...
        </div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="h-full min-h-[190px] w-full flex-1 rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-md shadow-ambient flex flex-col justify-center">
        <p className="text-body-sm text-error">{error ?? '使用统计暂不可用'}</p>
        <button type="button" onClick={() => refreshQuota()} className="mt-sm self-start text-body-sm font-semibold text-primary hover:underline">
          重新加载
        </button>
      </div>
    )
  }

  const fiveHourWindow = getWindow('five_hour', dashboard)
  const weeklyWindow = getWindow('weekly', dashboard)
  const activity = dashboard.activity
  const recentUsage = buildUsageRhythmBars(dashboard.dailyUsage.slice(-7))
  const planLabel = formatPlan(dashboard.plan)
  const accountIdentity = formatAccountIdentity(dashboard)

  return (
    <article className="h-full min-h-[190px] flex-1 rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-md shadow-ambient flex flex-col gap-sm">
      <header className="flex items-start justify-between gap-sm">
        <div className="flex min-w-0 items-center gap-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary-fixed text-primary">
            <span className="material-symbols-outlined text-[20px]">data_usage</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-headline-sm text-headline-sm truncate">使用统计</h3>
            <p className="mt-[2px] truncate text-[10px] text-on-surface-variant">
              {planLabel} · {accountIdentity}{dashboard.subscriptionExpiresAt ? ` · 到期 ${formatDateTime(dashboard.subscriptionExpiresAt)}` : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refreshQuota()}
          disabled={refreshing}
          aria-label="实时同步使用统计"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-[18px] ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
        </button>
      </header>

      <div className="flex items-center justify-between gap-sm border-b border-outline-variant/20 pb-sm text-[10px]">
        <div className="min-w-0">
          <span className="text-on-surface-variant">实时额度</span>
          <p className="truncate font-semibold text-on-surface">每 2 分钟从已绑定会话同步</p>
        </div>
        <span className="shrink-0 text-on-surface-variant" title={dashboard.lastSyncedAt ?? undefined}>
          {dashboard.lastSyncedAt ? `同步 ${formatDateTime(dashboard.lastSyncedAt)}` : '等待同步'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-xs">
        <QuotaWindow label="5 小时额度" remainingPercent={fiveHourWindow?.remainingPercent ?? null} resetAt={fiveHourWindow?.resetAt ?? null} />
        <QuotaWindow label="每周额度" remainingPercent={weeklyWindow?.remainingPercent ?? null} resetAt={weeklyWindow?.resetAt ?? null} />
      </div>

      <div className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-sm py-xs">
        <div className="flex items-center justify-between gap-sm">
          <span className="text-[10px] font-semibold text-on-surface-variant">近 7 天 Token 消耗节奏</span>
          <span className="text-[10px] text-on-surface-variant" title="从本机 Codex 会话日志汇总，可能受会话分叉或日志缺失影响">会话日志估算</span>
        </div>
        {recentUsage.length > 0 ? (
          <div className="mt-xs grid h-[88px] grid-cols-7 items-end gap-xs">
            {recentUsage.map((day) => {
              return (
                <div
                  key={day.date}
                  className="flex h-[88px] min-w-0 flex-col items-center"
                  title={`${day.date} · 约 ${day.valueLabel} tokens`}
                >
                  <span className="max-w-full shrink-0 truncate text-[9px] font-semibold leading-none text-on-surface">
                    {day.valueLabel}
                  </span>
                  <div className="mt-[3px] flex h-[58px] w-full items-end justify-center">
                    <div
                      className={`w-full max-w-5 shrink-0 rounded-sm transition-[height] duration-500 ${day.isEmpty ? 'h-[2px] bg-outline-variant/70' : 'min-h-[4px] bg-primary'}`}
                      style={day.isEmpty ? undefined : { height: `${day.heightPercent}%` }}
                    />
                  </div>
                  <span className="mt-[3px] shrink-0 text-[9px] leading-none text-on-surface-variant">{day.dateLabel}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="mt-xs text-[10px] text-on-surface-variant">暂无可用的 Codex 会话日志</p>
        )}
      </div>

      <div className="mt-auto">
        <div className="mb-xs flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">账户活跃度</span>
        </div>
        <div className="grid grid-cols-2 gap-xs sm:grid-cols-5">
          <ActivityMetric label="近 7 天 Token" value={`约 ${formatUsageTokens(activity.totalTokens)}`} />
          <ActivityMetric label="今日 Token" value={`约 ${formatUsageTokens(activity.todayTokens)}`} />
          <ActivityMetric label="单日峰值" value={`约 ${formatUsageTokens(activity.peakDayTokens)}`} />
          <ActivityMetric label="连续活跃" value={`${activity.currentStreakDays} 天`} />
          <ActivityMetric label="最长连续" value={`${activity.longestStreakDays} 天`} />
        </div>
      </div>
    </article>
  )
}
