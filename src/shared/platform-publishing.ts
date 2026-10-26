import type { VideoPlatform } from './video-workflow'

export {
  BILIBILI_ACTIVE as PUBLISHING_ACTIVE,
  BILIBILI_STATE_LABELS as PUBLISHING_STATE_LABELS,
} from './bilibili-publishing'
export type {
  BilibiliPublishRequest as PublishingRequest,
  BilibiliPublishSnapshot as PublishingSnapshot,
  BilibiliSubmission as PublishingSubmission,
  BilibiliConnection as PublishingConnection,
  BilibiliAccount as PublishingAccount,
  BilibiliAccountsState as PublishingAccountsState,
} from './bilibili-publishing'

export const PUBLISHING_PLATFORMS = {
  bilibili: {
    label: 'B 站',
    app: '哔哩哔哩',
    account: 'mydashboard-bili',
    identity: 'UID',
    item: 'BV 号',
  },
  douyin: {
    label: '抖音',
    app: '抖音',
    account: 'mydashboard-douyin',
    identity: '账号标识',
    item: '作品 ID',
  },
} as const

export function validPublishingUid(platform: VideoPlatform, value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (platform === 'bilibili' ? /^\d+$/.test(value) : /^[A-Za-z0-9_-]{1,256}$/.test(value))
  )
}
