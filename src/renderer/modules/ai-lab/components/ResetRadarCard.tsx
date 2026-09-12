import { useEffect, useRef, useState } from 'react'
import {
  createGuestResetRadarSnapshot,
  getResetRadarFooterActions,
  getResetRadarTone,
  getResetTypeLabel,
  type ResetRadarSnapshot,
} from '@shared/reset-radar'

interface ResetRadarCardProps {
  onOpenStatus: (url: string) => void
  onOpenAccount: () => void
  onOpenHistory: () => void
  refreshKey?: number
}

const toneStyles = {
  quiet: {
    dot: 'bg-primary',
    label: '低置信度',
    badge: 'bg-primary-fixed text-on-primary-fixed-variant',
  },
  watch: {
    dot: 'bg-secondary-container',
    label: '留意信号',
    badge: 'bg-secondary-container text-on-secondary-container',
  },
  active: {
    dot: 'bg-error',
    label: '信号活跃',
    badge: 'bg-error-container text-on-error-container',
  },
} as const

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDateTime(value: string | null): string {
  if (!value) return '暂无已观测记录'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function ResetRadarCard({ onOpenStatus, onOpenAccount, onOpenHistory, refreshKey = 0 }: ResetRadarCardProps) {
  const [snapshot, setSnapshot] = useState<ResetRadarSnapshot>(() => createGuestResetRadarSnapshot())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const tone = getResetRadarTone(snapshot.forecast.confidence, snapshot.activeSignal !== null)
  const toneStyle = toneStyles[tone]

  const loadSnapshot = async (forceRefresh = false) => {
    const currentRequestId = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const response = await window.electronAPI.invoke('reset-radar:getSnapshot', { forceRefresh })
      if (currentRequestId !== requestId.current) return
      if (response.success && response.data) {
        setSnapshot(response.data as ResetRadarSnapshot)
      } else {
        setError(response.error ?? '雷达数据暂不可用')
      }
    } catch (loadError) {
      if (currentRequestId !== requestId.current) return
      setError(loadError instanceof Error ? loadError.message : '雷达数据暂不可用')
    } finally {
      if (currentRequestId === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    loadSnapshot(refreshKey > 0).catch(() => {})
  }, [refreshKey])

  useEffect(() => window.electronAPI.onResetRadarUpdated(() => {
    loadSnapshot().catch(() => {})
  }), [])

  const source = snapshot.activeSignal
    ? snapshot.sources.find((item) => item.label === snapshot.activeSignal?.source)
    : snapshot.sources.find((item) => item.id === 'codex-lead-x')
  const signalResult = !snapshot.activeSignal
    ? '暂无明确重置信号'
    : snapshot.activeSignal.confidence === 'high'
      ? '官方确认全局重置'
      : snapshot.activeSignal.resetType === 'gift'
        ? '官方预告：定向重置卡'
        : '官方预告：等待账户核验'
  const publicEvidenceUrl = snapshot.activeSignal?.url ?? 'https://codex-reset.com/zh/radar'
  const accountConnected = snapshot.account.status === 'connected'
  const footerActions = getResetRadarFooterActions(snapshot.account.status)

  return (
    <article className="h-full min-h-[232px] flex-1 rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-md shadow-ambient flex flex-col gap-sm">
      <header className="flex items-start justify-between gap-sm">
        <div className="flex items-center gap-sm">
          <div className="w-9 h-9 rounded-2xl bg-primary-fixed flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[20px]">radar</span>
          </div>
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">Codex Reset Radar</h2>
            <p className="text-[11px] text-on-surface-variant mt-[2px]">公开信号 · {accountConnected ? '已连接' : '访客模式'}</p>
          </div>
        </div>
        <div className="flex items-center gap-xs">
          <button
            type="button"
            onClick={onOpenHistory}
            aria-label="查看重置历史"
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">history</span>
          </button>
          <button
            type="button"
            onClick={() => loadSnapshot(true)}
            aria-label="刷新重置雷达"
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </header>

      <div className="flex items-center gap-sm rounded-xl bg-surface-container-low p-sm">
        <div className="relative flex h-[62px] w-[62px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-fixed/40">
          <div className="absolute inset-[8px] rounded-full border border-primary/25" />
          <div className="absolute inset-[18px] rounded-full border border-primary/30" />
          <div className="absolute left-1/2 top-0 bottom-0 border-l border-primary/20" />
          <div className="absolute top-1/2 left-0 right-0 border-t border-primary/20" />
          <span className={`relative h-2.5 w-2.5 rounded-full ${toneStyle.dot} shadow-[0_0_0_4px_rgb(var(--color-primary)/0.12)]`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-xs">
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${toneStyle.badge}`}>{toneStyle.label}</span>
            {snapshot.activeSignal && (
              <span className="rounded-full bg-surface-container-high px-2 py-1 text-[10px] font-semibold text-on-surface-variant">
                {getResetTypeLabel(snapshot.activeSignal.resetType)}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-[15px] font-semibold leading-tight text-on-surface">{loading ? '正在读取信号' : signalResult}</p>
        </div>
      </div>

      <div className="grid min-h-[84px] grid-cols-2 gap-sm">
        <div className="flex flex-col items-center justify-center rounded-lg border border-outline-variant/25 bg-surface-container-low px-sm py-sm text-center">
          <p className="text-[12px] font-semibold text-on-surface-variant">估算概率</p>
          <p className="mt-1 text-[26px] font-bold leading-none text-primary">{Math.round(snapshot.forecast.peakProbability * 100)}%</p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-outline-variant/25 bg-surface-container-low px-sm py-sm text-center">
          <p className="text-[12px] font-semibold text-on-surface-variant">估算时间</p>
          <p className="mt-1 text-[15px] font-semibold leading-tight text-on-surface">
            {snapshot.forecast.nextWindowAt ? formatDateTime(snapshot.forecast.nextWindowAt) : `未来 ${snapshot.forecast.windowHours} 小时`}
          </p>
        </div>
      </div>

      <div className="mt-auto border-t border-outline-variant/30 pt-sm">
        <div className="mb-sm space-y-sm">
          <div className="flex items-center justify-between gap-sm text-[11px]">
            <span className="text-on-surface-variant">当前重置卡</span>
            <span className="font-semibold text-on-surface">
              {snapshot.resetCredits?.availableCount === null || snapshot.resetCredits?.availableCount === undefined
                ? '暂无数据'
                : `${snapshot.resetCredits.availableCount} 张`}
            </span>
          </div>
          <div className="flex items-center justify-between gap-sm text-[11px]">
            <span className="text-on-surface-variant">上次重置</span>
            <span className="truncate text-right font-semibold text-on-surface">{formatDateTime(snapshot.account.lastResetAt)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-sm text-[11px] text-on-surface-variant">
          <span className="truncate" title={error ?? source?.detail}>{error ?? source?.detail ?? '公开信号'}</span>
          <span className="shrink-0">{formatTime(snapshot.generatedAt)} 更新</span>
        </div>
        <div className="flex items-center gap-xs mt-sm">
          <button
            type="button"
            onClick={() => footerActions.primaryAction === 'account'
              ? onOpenAccount()
              : onOpenStatus(publicEvidenceUrl)}
            className="flex-1 h-8 rounded-full border border-outline-variant/50 text-on-surface-variant text-[11px] font-bold hover:bg-surface-container transition-colors"
          >
            {footerActions.primaryLabel}
          </button>
          <button
            type="button"
            onClick={onOpenAccount}
            className="flex-1 h-8 rounded-full bg-primary text-on-primary text-[11px] font-bold hover:brightness-110 active:scale-95 transition-all"
          >
            {footerActions.secondaryLabel}
          </button>
        </div>
      </div>
    </article>
  )
}
