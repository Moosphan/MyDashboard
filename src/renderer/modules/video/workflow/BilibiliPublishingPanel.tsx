import { useEffect, useRef, useState } from 'react'
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
import type { VideoProject } from '@shared/video-workflow'
import { workflowCall } from './useWorkflow'
import { WorkflowDialog } from './WorkflowDialog'

export function BilibiliPublishingPanel({
  project,
  approved,
  disabled,
  dirty,
}: {
  project: VideoProject
  approved: boolean
  disabled: boolean
  dirty: boolean
}) {
  const storageKey = `video-workflow-bilibili-settings:${project.id}`
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
  const [category, setCategory] = useState(saved.category ?? ''),
    [visibility, setVisibility] = useState(saved.visibility ?? ''),
    [copyright, setCopyright] = useState(saved.copyright ?? ''),
    [source, setSource] = useState(saved.source ?? '')
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
  const refresh = async (check = false) => {
    const [account, submissions] = await Promise.all([
      workflowCall<BilibiliConnection>('bilibiliConnection', check),
      workflowCall<BilibiliSubmission[]>('bilibiliSubmissions', project.id),
    ])
    if (alive.current) {
      setConnection(account)
      setRecords(submissions)
    }
  }
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
  }, [project.id])
  useEffect(() => {
    if (connection.state !== 'connecting') return
    const timer = setInterval(() => {
      void refresh().catch(() => {})
    }, 700)
    return () => clearInterval(timer)
  }, [connection.state, project.id])
  useEffect(() => {
    if (connection.state !== 'connected') {
      setCategories([])
      return
    }
    let current = true
    void workflowCall<BilibiliCategory[]>('bilibiliCategories')
      .then((value) => {
        if (current) setCategories(value)
      })
      .catch((failure) => {
        if (current) setError(failure.message)
      })
    return () => {
      current = false
    }
  }, [connection.state, connection.uid])
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
        workflowCall('bilibiliPublish', {
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
      aria-label="B站自动发布"
      data-bilibili-publishing
    >
      <h4 className="text-body-sm font-semibold">B 站一键发布</h4>
      <p className="workflow-muted">
        连接账号并选择投稿设置后，可直接上传当前已审核成片，无需导出后手动上传。
      </p>
      <p role="status" className="workflow-muted" aria-live="polite">
        {connection.state === 'connected'
          ? `已连接：${connection.name} · UID ${connection.uid}`
          : connection.state === 'connecting'
            ? '请使用哔哩哔哩 App 扫码，并在手机上确认。'
            : connection.state === 'checking'
              ? '正在检查 B 站连接…'
              : '尚未连接 B 站账号'}
      </p>
      {connection.error && (
        <p className="workflow-error" role="alert">
          {connection.error}。可在工作流执行环境配置 Catbus 0.2.1 与兼容的 Node。
        </p>
      )}
      {connection.qrCode && (
        <img src={connection.qrCode} width={200} height={200} alt="使用哔哩哔哩 App 扫码连接账号" />
      )}
      <div className="workflow-toolbar">
        <Button
          size="sm"
          variant="secondary"
          disabled={
            busy || active || connection.state === 'connecting' || connection.state === 'checking'
          }
          onClick={() =>
            void perform(async () =>
              setConnection(await workflowCall<BilibiliConnection>('bilibiliConnect')),
            )
          }
        >
          {connection.state === 'connected' ? '重新扫码连接' : '扫码连接 B 站'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || active || connection.state === 'checking'}
          onClick={() =>
            void perform(async () =>
              setConnection(
                await workflowCall<BilibiliConnection>(
                  connection.state === 'connecting' || connection.state === 'connected'
                    ? 'bilibiliDisconnect'
                    : 'bilibiliConnection',
                  true,
                ),
              ),
            )
          }
        >
          {connection.state === 'connecting'
            ? '取消扫码'
            : connection.state === 'connected'
              ? '断开本地连接'
              : '重新检测连接'}
        </Button>
      </div>
      <fieldset
        disabled={busy || active || disabled || connection.state !== 'connected'}
        className="workflow-section min-w-0"
      >
        <VoiceSelect
          label="B 站投稿分区"
          value={category}
          onChange={setCategory}
          placeholder={categories.length ? '请选择投稿子分区' : '连接后加载分区'}
          options={categories
            .filter((item) => item.parentId)
            .map((item) => ({
              value: item.id,
              label: `${categories.find((parent) => parent.id === item.parentId)?.name ?? '分区'} / ${item.name}`,
            }))}
        />
        <VoiceSelect
          label="投稿可见性"
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'public', label: '公开投稿' },
            { value: 'private', label: '仅自己可见' },
          ]}
        />
        <VoiceSelect
          label="稿件类型"
          value={copyright}
          onChange={setCopyright}
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
            onChange={(event) => setSource(event.target.value)}
          />
        )}
      </fieldset>
      <p className="workflow-muted">
        {dirty
          ? '请先保存并重新审核发布资料。'
          : !approved
            ? '正式成片与发布资料审核通过后才能投稿。'
            : '将上传当前审核版本；平台提交成功后仍需等待 B 站审核。'}
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
          !category ||
          !visibility ||
          !copyright ||
          (copyright === 'repost' && !source.trim())
        }
        onClick={() => void publish()}
      >
        {active ? '正在上传与提交…' : '一键发布到 B 站'}
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
          data-bilibili-submission={record.state}
        >
          <div>
            <strong className="text-body-sm">{BILIBILI_STATE_LABELS[record.state]}</strong>
            <p className="workflow-muted" role="status">
              {record.phase}
            </p>
            <p className="workflow-muted">
              {new Date(record.createdAt).toLocaleString()} · UID {record.snapshot.accountUid} ·{' '}
              {record.snapshot.visibility === 'public' ? '公开' : '私密'}
            </p>
            <p className="workflow-muted">{record.snapshot.metadata.title}</p>
          </div>
          {record.error && <p className="workflow-error">{record.error}</p>}
          {record.url && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                void perform(() => workflowCall('bilibiliOpen', project.id, record.id))
              }
            >
              打开作品 {record.externalId}
            </Button>
          )}
          {BILIBILI_ACTIVE.includes(record.state) ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void perform(() => workflowCall('bilibiliCancel', project.id, record.id))
              }
            >
              停止本地投稿任务
            </Button>
          ) : (
            <>
              {['unknown', 'risk_control'].includes(record.state) && !record.externalId && (
                <VoiceInput
                  label="已提交的 BV 号或作品链接（用于核查）"
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
                  disabled={busy || active || connection.state !== 'connected'}
                  onClick={() =>
                    void perform(
                      () => workflowCall('bilibiliRefresh', project.id, record.id, bvs[record.id]),
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
                    先检查 B 站创作中心。若稿件已存在，请填写 BV
                    号核查；提交结果未确认时不会重复投稿。
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
        description="只有已在 B 站创作中心核查、确认这次投稿没有创建稿件时才能继续。确认后可手动发起新尝试；误判可能产生重复投稿。"
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
                  await workflowCall('bilibiliConfirmNotSubmitted', project.id, confirmation.id)
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
