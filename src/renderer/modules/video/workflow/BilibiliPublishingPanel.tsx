import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { VoiceInput } from '../components/voiceover/VoiceControls'
import { VoiceSelect } from '../components/voiceover/VoiceEngineFields'
import {
  BILIBILI_ACTIVE,
  BILIBILI_STATE_LABELS,
  type BilibiliCategory,
  type BilibiliConnection,
  type BilibiliSubmission,
} from '@shared/bilibili-publishing'
import type { PublicationSubmission, VideoPlatform, VideoProject } from '@shared/video-workflow'
import { PUBLISHING_PLATFORMS } from '@shared/platform-publishing'
import { workflowCall } from './useWorkflow'
import { WorkflowDialog } from './WorkflowDialog'
import { PlatformAccountsDialog } from './BilibiliAccountsDialog'

export function PlatformPublishingPanel({
  platform = 'bilibili',
  project,
  approved,
  disabled,
  dirty,
  submission,
  onSubmissionChange,
}: {
  platform?: VideoPlatform
  project: VideoProject
  approved: boolean
  disabled: boolean
  dirty: boolean
  submission?: PublicationSubmission
  onSubmissionChange: (submission: PublicationSubmission) => void
}) {
  const { label, app, identity, item } = PUBLISHING_PLATFORMS[platform]
  const call = useCallback(
    <Result,>(action: string, ...args: unknown[]) =>
      workflowCall<Result>(`${platform}${action}`, ...args),
    [platform],
  )
  const storageKey = `video-workflow-${platform}-settings:${project.id}`
  const [saved] = useState<Record<string, string>>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
      return value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          )
        : {}
    } catch {
      return {}
    }
  })
  const [connection, setConnection] = useState<BilibiliConnection>({
    state: 'checking',
    uid: null,
    name: null,
    qrCode: null,
    error: null,
  })
  const [categories, setCategories] = useState<BilibiliCategory[]>([])
  const [records, setRecords] = useState<BilibiliSubmission[]>([])
  const category = submission?.category ?? saved.category ?? ''
  const visibility = submission?.visibility ?? saved.visibility ?? ''
  const copyright = submission?.copyright ?? saved.copyright ?? ''
  const source = submission?.source ?? saved.source ?? ''
  const updateSubmission = (changes: Partial<PublicationSubmission>) =>
    onSubmissionChange({
      category,
      categoryName: submission?.categoryName ?? '',
      visibility: visibility as PublicationSubmission['visibility'],
      copyright: copyright as PublicationSubmission['copyright'],
      source,
      ...changes,
    })
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('')
  const [bvs, setBvs] = useState<Record<string, string>>({})
  const [confirmation, setConfirmation] = useState<BilibiliSubmission | null>(null)
  const lock = useRef(false),
    alive = useRef(true),
    publishButton = useRef<HTMLButtonElement>(null)
  const active = records.some((record) => BILIBILI_ACTIVE.includes(record.state))
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ category, visibility, copyright, source }))
    } catch {
      setError('投稿设置无法保存在本机；请在重新打开发布页后核对设置。')
    }
  }, [storageKey, category, visibility, copyright, source])
  const refresh = useCallback(
    async (check = false) => {
      const [account, submissions] = await Promise.all([
        call<BilibiliConnection>('Connection', check),
        call<BilibiliSubmission[]>('Submissions', project.id),
      ])
      if (alive.current) {
        setConnection(account)
        setRecords(submissions)
      }
    },
    [project.id, call],
  )
  useEffect(() => {
    alive.current = true
    void refresh(true).catch((failure) => {
      if (alive.current) setError(failure.message)
    })
    const remove = window.electronAPI.onVideoWorkflowUpdated(() => {
      void refresh().catch(() => {})
    })
    return () => {
      alive.current = false
      remove()
    }
  }, [refresh])
  useEffect(() => {
    if (connection.state !== 'connecting') return
    const timer = setInterval(() => {
      void refresh().catch(() => {})
    }, 700)
    return () => clearInterval(timer)
  }, [connection.state, refresh])
  useEffect(() => {
    if (connection.state !== 'connected' || platform !== 'bilibili') {
      setCategories([])
      return
    }
    let current = true
    void call<BilibiliCategory[]>('Categories')
      .then((value) => {
        if (current) setCategories(value)
      })
      .catch((failure) => {
        if (current) setError(failure.message)
      })
    return () => {
      current = false
    }
  }, [connection.state, connection.uid, platform, call])
  const perform = async (action: () => Promise<unknown>, message = '') => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      await refresh()
      if (alive.current) setNotice(message)
    } catch (failure) {
      if (alive.current) setError((failure as Error).message)
    } finally {
      lock.current = false
      if (alive.current) setBusy(false)
    }
  }
  const publish = () =>
    perform(
      () =>
        call('Publish', {
          projectId: project.id,
          expectedRevision: project.revision,
          requestId: crypto.randomUUID(),
          accountUid: connection.uid,
          category,
          visibility,
          copyright,
          source,
        }),
      '已创建投稿任务；上传与提交结果将在下方更新。',
    )
  return (
    <section
      className="workflow-section workflow-divider"
      aria-label={platform === 'bilibili' ? 'B站自动发布' : '抖音自动发布'}
      data-bilibili-publishing={platform === 'bilibili' ? '' : undefined}
      data-douyin-publishing={platform === 'douyin' ? '' : undefined}
    >
      <h4 className="text-body-sm font-semibold">{label}一键发布</h4>
      <p className="workflow-muted">
        连接账号并选择投稿设置后，可直接上传当前已审核成片，无需导出后手动上传。
      </p>
      <p role="status" className="workflow-muted" aria-live="polite">
        {connection.state === 'connected'
          ? `已连接：${connection.name} · ${identity} ${connection.uid}`
          : connection.state === 'connecting'
            ? `请使用${app} App 扫码，并在手机上确认。`
            : connection.state === 'checking'
              ? `正在检查${label}连接…`
              : `尚未连接${label}账号`}
      </p>
      {connection.error && (
        <p className="workflow-error" role="alert">
          {connection.error}。可在工作流执行环境配置 Catbus 0.2.1 与兼容的 Node。
        </p>
      )}
      <div className="workflow-actions">
        <PlatformAccountsDialog
          platform={platform}
          connection={connection}
          disabled={busy || active}
          onChanged={() => refresh()}
        />
      </div>
      <fieldset disabled={busy || active || disabled} className="workflow-section min-w-0">
        {platform === 'bilibili' ? (
          <>
            <VoiceSelect
              label="B 站投稿分区"
              value={category}
              onChange={(category) => {
                const selected = categories.find((item) => item.id === category)
                updateSubmission({
                  category,
                  categoryName: selected
                    ? `${categories.find((parent) => parent.id === selected.parentId)?.name ?? '分区'} / ${selected.name}`
                    : '',
                })
              }}
              placeholder={categories.length ? '请选择投稿子分区' : '连接后加载分区'}
              options={[
                ...(category && !categories.some((item) => item.id === category && item.parentId)
                  ? [
                      {
                        value: category,
                        label: `${submission?.categoryName || category}（待连接核验）`,
                      },
                    ]
                  : []),
                ...categories
                  .filter((item) => item.parentId)
                  .map((item) => ({
                    value: item.id,
                    label: `${categories.find((parent) => parent.id === item.parentId)?.name ?? '分区'} / ${item.name}`,
                  })),
              ]}
            />
            {submission?.categoryName && !category && (
              <p className="workflow-muted" role="status">
                AI 分区建议：{submission.categoryName}。连接 B 站后请选择实际投稿子分区。
              </p>
            )}
          </>
        ) : (
          <VoiceInput
            label="内容分区建议"
            value={submission?.categoryName ?? ''}
            onChange={(event) => updateSubmission({ categoryName: event.target.value })}
          />
        )}
        <VoiceSelect
          label="投稿可见性"
          value={visibility}
          onChange={(visibility) =>
            updateSubmission({ visibility: visibility as 'public' | 'private' })
          }
          options={[
            { value: 'public', label: '公开投稿' },
            { value: 'private', label: '仅自己可见' },
          ]}
        />
        <VoiceSelect
          label="稿件类型"
          value={copyright}
          onChange={(copyright) =>
            updateSubmission({ copyright: copyright as 'original' | 'repost' })
          }
          options={[
            { value: 'original', label: '自制' },
            { value: 'repost', label: '转载' },
          ]}
        />
        {copyright === 'repost' && (
          <VoiceInput
            label="转载来源"
            value={source}
            maxLength={2000}
            onChange={(event) => updateSubmission({ source: event.target.value })}
          />
        )}
        {!copyright && source && (
          <p className="workflow-muted" role="status">
            类型待核实：{source}
          </p>
        )}
      </fieldset>
      <p className="workflow-muted">投稿设置随发布资料保存，AI 建议可修改，修改后需重新审核。</p>
      {platform === 'douyin' && (
        <p className="workflow-muted">
          自动投稿提交视频、封面、标题、简介、话题和可见性。分区、稿件类型与来源仅作为资料记录和导出建议，需要平台声明时请到抖音创作中心核对。
        </p>
      )}
      <p className="workflow-muted">
        {dirty
          ? '请先保存并重新审核发布资料。'
          : !approved
            ? '正式成片与发布资料审核通过后才能投稿。'
            : `将上传当前审核版本；平台提交成功后仍需等待${label}审核。`}
      </p>
      <Button
        ref={publishButton}
        size="sm"
        disabled={
          busy ||
          active ||
          disabled ||
          dirty ||
          !approved ||
          connection.state !== 'connected' ||
          (platform === 'bilibili' &&
            (!category || !categories.some((item) => item.id === category && item.parentId))) ||
          !visibility ||
          !copyright ||
          (copyright === 'repost' && !source.trim())
        }
        onClick={() => void publish()}
      >
        {active ? '正在上传与提交…' : `一键发布到 ${label}`}
      </Button>
      {error && (
        <p className="workflow-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="workflow-muted" role="status">
          {notice}
        </p>
      )}
      {records.map((record) => (
        <div
          key={record.id}
          className="workflow-divider workflow-section"
          data-bilibili-submission={platform === 'bilibili' ? record.state : undefined}
          data-douyin-submission={platform === 'douyin' ? record.state : undefined}
        >
          <div>
            <strong className="text-body-sm">{BILIBILI_STATE_LABELS[record.state]}</strong>
            <p className="workflow-muted" role="status">
              {record.phase}
            </p>
            <p className="workflow-muted break-words">
              {new Date(record.createdAt).toLocaleString()} · {identity}{' '}
              {record.snapshot.accountUid} ·{' '}
              {record.snapshot.visibility === 'public' ? '公开' : '私密'}
            </p>
            <p className="workflow-muted">{record.snapshot.metadata.title}</p>
          </div>
          {record.error && <p className="workflow-error">{record.error}</p>}
          {record.url && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void perform(() => call('Open', project.id, record.id))}
            >
              打开作品 {record.externalId}
            </Button>
          )}
          {BILIBILI_ACTIVE.includes(record.state) ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void perform(() => call('Cancel', project.id, record.id))}
            >
              停止本地投稿任务
            </Button>
          ) : (
            <>
              {['unknown', 'risk_control'].includes(record.state) && !record.externalId && (
                <VoiceInput
                  label={`已提交的 ${item}或作品链接（用于核查）`}
                  value={bvs[record.id] ?? ''}
                  onChange={(event) =>
                    setBvs((current) => ({ ...current, [record.id]: event.target.value }))
                  }
                />
              )}
              {(record.externalId || bvs[record.id]) && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={
                    busy ||
                    active ||
                    connection.state === 'connecting' ||
                    connection.state === 'checking'
                  }
                  onClick={() =>
                    void perform(
                      () => call('Refresh', project.id, record.id, bvs[record.id]),
                      '已核查平台稿件状态',
                    )
                  }
                >
                  核查平台状态
                </Button>
              )}
              {['unknown', 'risk_control'].includes(record.state) && (
                <>
                  <p className="workflow-muted">
                    先检查{label}创作中心。若稿件已存在，请填写{item}
                    核查；提交结果未确认时不会重复投稿。
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || active}
                    onClick={() => setConfirmation(record)}
                  >
                    确认平台没有此稿件…
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      ))}
      <WorkflowDialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
        title="确认平台没有此稿件"
        description={`只有已在${label}创作中心核查、确认这次投稿没有创建稿件时才能继续。确认后可手动发起新尝试；误判可能产生重复投稿。`}
        returnFocus={publishButton}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmation(null)}>
              取消
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  if (!confirmation) return
                  await call('ConfirmNotSubmitted', project.id, confirmation.id)
                  setConfirmation(null)
                })
              }
            >
              已核查，确认没有稿件
            </Button>
          </>
        }
      >
        <p className="workflow-muted">{confirmation?.snapshot.metadata.title}</p>
      </WorkflowDialog>
    </section>
  )
}

export { PlatformPublishingPanel as BilibiliPublishingPanel }
