import type { PlatformMetadata, WorkflowFile } from './video-workflow'

export const BILIBILI_ACCOUNT = 'mydashboard-bili'
export type BilibiliPublishState =
  | 'queued'
  | 'uploading'
  | 'submitting'
  | 'reviewing'
  | 'published'
  | 'private'
  | 'rejected'
  | 'needs_auth'
  | 'risk_control'
  | 'unknown'
  | 'failed'
  | 'cancelled'
export const BILIBILI_STATE_LABELS: Record<BilibiliPublishState, string> = {
  queued: '准备投稿',
  uploading: '上传与提交中',
  submitting: '提交中',
  reviewing: '平台审核中',
  published: '平台审核通过',
  private: '私密投稿已通过',
  rejected: '平台退回',
  needs_auth: '需要重新连接账号',
  risk_control: '平台风控，已停止',
  unknown: '提交结果待核查',
  failed: '投稿失败',
  cancelled: '已取消',
}
export const BILIBILI_ACTIVE: BilibiliPublishState[] = ['queued', 'uploading', 'submitting']
export interface BilibiliPublishRequest {
  projectId: string
  expectedRevision: number
  requestId: string
  accountUid: string
  category: string
  visibility: 'public' | 'private'
  copyright: 'original' | 'repost'
  source?: string
}
export interface BilibiliPublishSnapshot {
  renderRevisionId: string
  publishRevisionId: string
  video: WorkflowFile
  cover: WorkflowFile
  metadata: PlatformMetadata
  accountUid: string
  category: string
  visibility: 'public' | 'private'
  copyright: 'original' | 'repost'
  source: string
}
export interface BilibiliSubmission {
  id: string
  projectId: string
  requestId: string
  state: BilibiliPublishState
  phase: string
  snapshot: BilibiliPublishSnapshot
  externalId: string | null
  url: string | null
  error: string | null
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  verifiedAt: string | null
  cliVersion: string
}
export interface BilibiliConnection {
  state: 'disconnected' | 'checking' | 'connecting' | 'connected' | 'error'
  uid: string | null
  name: string | null
  qrCode: string | null
  error: string | null
}
export interface BilibiliAccount {
  id: string
  uid: string
  name: string
  updatedAt: string
}
export interface BilibiliAccountsState {
  accounts: BilibiliAccount[]
  selectedId: string | null
  connection: BilibiliConnection
  busy: boolean
}
export interface BilibiliCategory {
  id: string
  name: string
  parentId: string | null
}
