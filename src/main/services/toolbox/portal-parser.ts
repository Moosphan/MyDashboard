import { ToolFailure, type VpnUsage } from '../../../shared/toolbox'

export interface PortalFields {
  overview?: boolean
  login?: boolean
  challenge?: boolean
  unavailable?: boolean
  usageDetail?: string
  remaining?: string
  percent?: string
  extra?: string
  reset?: string
  payment?: string
  cycle?: string
}

function unsupported(): never {
  throw new ToolFailure('unsupported', '官网字段无法识别，请打开官网检查或重新选择服务。')
}

function amount(value: string | undefined): string {
  const match = value?.trim().match(/^(\d+(?:\.\d{1,6})?)\s+GB(?:\s|$)/)
  if (!match || !Number.isFinite(Number(match[1])) || Number(match[1]) > 1e12) return unsupported()
  return match[1]
}

function tolerance(value: string): number {
  return 0.5 * 10 ** -(value.split('.')[1]?.length ?? 0)
}

function date(value: string | undefined): string | null {
  if (!value?.trim()) return null
  const match = value.match(/\b(\d{4})[/-](\d{2})[/-](\d{2})\b/)
  if (!match) return unsupported()
  const [, year, month, day] = match
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day)) return unsupported()
  return `${year}-${month}-${day}`
}

export function parsePortalFields(fields: PortalFields): VpnUsage {
  if (fields.challenge) throw new ToolFailure('challenge', '请打开官网登录窗口完成安全验证。')
  if (fields.unavailable) throw new ToolFailure('service_unavailable', '所选服务无法读取，请在官网重新选择服务。')
  if (!fields.overview && fields.login) throw new ToolFailure('login_required', '请在独立官网登录窗口登录。')
  if (!fields.overview) return unsupported()
  const parts = fields.usageDetail?.split('/')
  if (parts?.length !== 2) return unsupported()
  const used = amount(parts[0])
  const total = amount(parts[1])
  const remaining = amount(fields.remaining)
  const rounding = tolerance(used) + tolerance(total) + tolerance(remaining) + 1e-8
  if (Math.abs(Number(used) + Number(remaining) - Number(total)) > rounding) return unsupported()
  let usedPercent: number | null = null
  if (Number(total) > 0 && fields.percent?.trim()) {
    if (!/^\d+(?:\.\d+)?$/.test(fields.percent.trim())) return unsupported()
    usedPercent = Number(fields.percent)
    const percentageTolerance = (tolerance(used) + tolerance(total)) / Number(total) * 100 + tolerance(fields.percent) + 0.01
    if (usedPercent > 100 || Math.abs(usedPercent - Number(used) / Number(total) * 100) > percentageTolerance) return unsupported()
  }
  const cycle = fields.cycle?.trim() || null
  if (cycle && (cycle.length > 120 || !/^\d{4}[/-]\d{2}[/-]\d{2}\s*(?:-|至|到|~|–|—)\s*\d{4}[/-]\d{2}[/-]\d{2}$/.test(cycle))) return unsupported()
  if (cycle) {
    const dates = cycle.match(/\d{4}[/-]\d{2}[/-]\d{2}/g)!
    const start = date(dates[0])!
    const end = date(dates[1])!
    if (start > end) return unsupported()
  }
  return { used, total, remaining, extraRemaining: fields.extra?.trim() ? amount(fields.extra) : null, unit: 'GB', usedPercent, nextResetDate: date(fields.reset), nextPaymentDate: date(fields.payment), cycle }
}
