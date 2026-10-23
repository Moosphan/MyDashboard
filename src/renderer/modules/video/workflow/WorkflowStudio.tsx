import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  VIDEO_STAGES,
  VIDEO_STAGE_LABELS,
  stageValue,
  type VideoProject,
  type VideoStage,
  type StagePayloads,
} from '@shared/video-workflow'
import { mediaUrl, nextStage, useWorkflowProjects, workflowCall } from './useWorkflow'
import { StepView, revisionStatus } from './StepView'
import { StageWorkspace } from './StageWorkspace'
import { WorkflowDialog } from './WorkflowDialog'

export function WorkflowStudio({
  onVoiceover,
  onSettings,
  onAssets,
  activeJobs,
}: {
  onVoiceover: () => void
  onSettings: () => void
  onAssets: () => void
  activeJobs: number
}) {
  const state = useWorkflowProjects()
  const [stage, setStage] = useState<VideoStage>('brief')
  const [title, setTitle] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [history, setHistory] = useState(false)
  const [restored, setRestored] = useState<{
    key: number
    stage: VideoStage
    payload: StagePayloads[VideoStage]
  } | null>(null)
  const createButton = useRef<HTMLButtonElement>(null)
  const historyButton = useRef<HTMLButtonElement>(null)
  const open = (project: VideoProject) => {
    setRestored(null)
    state.select(project)
    setStage(nextStage(project))
    setError('')
  }
  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const project = await workflowCall<VideoProject>('create', title)
      setCreating(false)
      setTitle('')
      open(project)
      await state.refresh()
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const archive = async (project: VideoProject) => {
    setBusy(true)
    setError('')
    try {
      await workflowCall('archive', project.id, !project.archived, project.revision)
      await state.refresh()
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const projects = state.projects.filter(
    (project) =>
      project.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (filter === 'all' ||
        (filter === 'review'
          ? Object.values(project.stages).some((item) => item?.status === 'review')
          : project.stages.render?.status === 'approved')),
  )
  const environment = (
    <Button
      size="icon"
      variant="ghost"
      data-workflow-settings
      aria-label="执行环境"
      title="执行环境"
      onClick={onSettings}
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
        tune
      </span>
    </Button>
  )
  if (state.loading)
    return (
      <Card>
        <p role="status" className="workflow-muted">
          正在读取视频项目…
        </p>
      </Card>
    )
  return (
    <div className={state.project ? 'workflow-studio workflow-studio-detail' : 'workflow-studio'}>
      {(error || state.error) && !creating && (
        <div role="alert" className="workflow-error">
          {error || state.error}
          <Button size="sm" variant="ghost" onClick={() => void state.refresh()}>
            重试
          </Button>
        </div>
      )}
      {state.project ? (
        <>
          <div className="workflow-project-heading">
            <div className="workflow-project-title">
              <Button
                size="sm"
                variant="ghost"
                className="px-0"
                onClick={() => state.select(null)}
                aria-label="返回视频项目列表"
              >
                <span aria-hidden="true" className="material-symbols-outlined">
                  chevron_left
                </span>
                所有视频项目
              </Button>
              <h1 className="workflow-page-title">{state.project.title}</h1>
              <div className="workflow-facts">
                <span>横版 16:9</span>
                <span>
                  目标 {stageValue(state.project, 'brief')?.duration ?? '—'} 秒 · 最长 5 分钟
                </span>
                <span>Bilibili / 抖音</span>
              </div>
            </div>
            <div className="workflow-actions">
              {environment}
              <Button
                ref={historyButton}
                size="icon"
                variant="ghost"
                aria-label="项目版本历史"
                onClick={() => setHistory(true)}
              >
                <span aria-hidden="true" className="material-symbols-outlined">
                  history
                </span>
              </Button>
            </div>
          </div>
          <StepView
            project={state.project}
            active={stage}
            onSelect={(next) => {
              setRestored(null)
              setStage(next)
            }}
          />
          <StageWorkspace
            key={state.project.id + ':' + stage + ':' + (restored?.key ?? '')}
            project={state.project}
            stage={stage}
            onProject={state.select}
            onNext={() => setStage(VIDEO_STAGES[Math.min(VIDEO_STAGES.indexOf(stage) + 1, 7)])}
            refresh={state.refresh}
            onVoiceover={onVoiceover}
            restoredPayload={restored?.stage === stage ? restored.payload : undefined}
          />
          <WorkflowDialog
            open={history}
            onOpenChange={setHistory}
            title="项目版本历史"
            description="历史版本与审核记录保留。作为新草稿会替换该阶段本地编辑，保存后才形成新版本并重新审核。"
            returnFocus={historyButton}
          >
            {state.project.history.length ? (
              state.project.history.map((item) => (
                <div key={item.id} className="workflow-history-row">
                  <strong>
                    {VIDEO_STAGE_LABELS[item.stage]} · v{item.version}
                  </strong>
                  <span className="workflow-muted">
                    {revisionStatus[item.status]} · {new Date(item.createdAt).toLocaleString()}
                    {item.note ? ' · ' + item.note : ''}
                  </span>
                  {['brief', 'copy', 'storyboard', 'narration', 'publish'].includes(item.stage) &&
                    !state.project?.archived && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="justify-self-start"
                        onClick={() => {
                          setRestored({ key: Date.now(), stage: item.stage, payload: item.payload })
                          setStage(item.stage)
                          setHistory(false)
                        }}
                      >
                        作为新草稿
                      </Button>
                    )}
                </div>
              ))
            ) : (
              <p className="workflow-muted">尚未保存版本。</p>
            )}
          </WorkflowDialog>
        </>
      ) : (
        <>
          <div className="workflow-toolbar">
            <div>
              <h1 className="workflow-page-title">视频工作台</h1>
              <p className="workflow-muted mt-2">从一个想法，到一份可以发布的作品。</p>
            </div>
            <div className="workflow-actions">
              <Button size="sm" variant="ghost" onClick={onAssets}>
                素材库
              </Button>
              <Button size="sm" variant="ghost" onClick={onVoiceover}>
                AI 配音{activeJobs > 0 ? ' · ' + activeJobs : ''}
              </Button>
              <Button
                ref={createButton}
                size="sm"
                onClick={() => {
                  setError('')
                  setTitle('')
                  setCreating(true)
                }}
              >
                新建视频项目
              </Button>
            </div>
          </div>
          <div className="workflow-overview" aria-label="项目概况">
            <div>
              <span className="workflow-muted">{state.archived ? '已归档' : '进行中'}</span>
              <strong>
                {state.projects.length}
                <small> 个项目</small>
              </strong>
            </div>
            <div>
              <span className="workflow-muted">等待你的审核</span>
              <strong>
                {
                  state.projects.filter((project) =>
                    Object.values(project.stages).some((item) => item?.status === 'review'),
                  ).length
                }
                <small> 个项目</small>
              </strong>
            </div>
            <div>
              <span className="workflow-muted">已完成成片</span>
              <strong>
                {
                  state.projects.filter((project) => project.stages.render?.status === 'approved')
                    .length
                }
                <small> 支视频</small>
              </strong>
            </div>
            <div>
              <span className="workflow-muted">首期制作规格</span>
              <strong className="workflow-spec">横版 · ≤ 5 分钟</strong>
            </div>
          </div>
          <div className="workflow-project-filters">
            <div>
              <label htmlFor="workflow-project-search" className="sr-only">
                搜索视频项目
              </label>
              <Input
                id="workflow-project-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索项目名称…"
              />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger
                size="sm"
                aria-label="项目状态"
                className="workflow-project-status [&>span:last-child]:rotate-90"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="review">待审核</SelectItem>
                <SelectItem value="complete">已完成成片</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="ghost"
              aria-label={state.archived ? '查看进行中项目' : '查看已归档'}
              title={state.archived ? '查看进行中项目' : '查看已归档'}
              aria-pressed={state.archived}
              onClick={() => state.setArchived(!state.archived)}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                {state.archived ? 'unarchive' : 'archive'}
              </span>
            </Button>
            {environment}
          </div>
          {!projects.length ? (
            <Card>
              <div className="py-8 text-center space-y-3">
                <h2 className="workflow-section-title">
                  {search || filter !== 'all'
                    ? '没有匹配的项目'
                    : state.archived
                      ? '暂无已归档项目'
                      : '开始你的第一支视频'}
                </h2>
                <p className="workflow-muted">
                  {search || filter !== 'all'
                    ? '尝试其他关键词或项目状态。'
                    : '新建视频项目，先把想法整理成创作简报。'}
                </p>
              </div>
            </Card>
          ) : (
            <div className="workflow-project-list">
              {projects.map((project) => {
                const current = nextStage(project)
                const cover =
                  stageValue(project, 'render')?.cover ?? stageValue(project, 'roughcut')?.cover
                return (
                  <Card key={project.id} className="workflow-project-card">
                    <div className="workflow-project-row">
                      <div className="workflow-project-thumb">
                        {cover ? (
                          <img src={mediaUrl(project.id, cover)} alt="成片封面" />
                        ) : (
                          <div className="workflow-project-placeholder" aria-hidden="true">
                            <span>
                              {stageValue(project, 'storyboard')?.scenes[0]?.title ?? project.title}
                            </span>
                            <small>16:9 · VIDEO PROJECT</small>
                          </div>
                        )}
                      </div>
                      <div className="workflow-project-info">
                        <div className="workflow-facts">
                          <span>视频创作</span>
                          <span>
                            {stageValue(project, 'audio')?.duration.toFixed(0) ??
                              stageValue(project, 'brief')?.duration ??
                              '—'}{' '}
                            秒 · 横版
                          </span>
                        </div>
                        <h3>{project.title}</h3>
                        <p className="workflow-muted">
                          {new Date(project.updatedAt).toLocaleString()} 更新 · Bilibili / 抖音
                        </p>
                      </div>
                      <div className="workflow-project-state">
                        <Badge variant="low">
                          {project.archived ? '已归档' : VIDEO_STAGE_LABELS[current]}
                        </Badge>
                        <span className="workflow-muted">
                          {
                            VIDEO_STAGES.filter(
                              (item) => project.stages[item]?.status === 'approved',
                            ).length
                          }{' '}
                          / 8 步已审核
                        </span>
                      </div>
                      <div className="workflow-project-actions">
                        <Button size="sm" variant="secondary" onClick={() => open(project)}>
                          {project.archived ? '查看项目' : '继续创作'}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={busy}
                              aria-label={`更多操作：${project.title}`}
                              title="更多操作"
                            >
                              <span
                                aria-hidden="true"
                                className="material-symbols-outlined text-[20px]"
                              >
                                more_horiz
                              </span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              icon={project.archived ? 'unarchive' : 'archive'}
                              disabled={busy || project.jobs.some((job) => job.state === 'running')}
                              title={
                                project.jobs.some((job) => job.state === 'running')
                                  ? '请等待或取消正在执行的任务后再归档'
                                  : undefined
                              }
                              className="data-[highlighted]:bg-surface-container-low data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
                              onSelect={() => void archive(project)}
                            >
                              {project.archived ? '恢复项目' : '归档项目'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
          <WorkflowDialog
            open={creating}
            onOpenChange={setCreating}
            title="新建视频项目"
            description="先命名这支视频，接着整理创作目标与参考资料。"
            returnFocus={createButton}
            footer={
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setCreating(false)}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  type="submit"
                  form="workflow-create-project"
                  disabled={busy || !title.trim()}
                >
                  {busy ? '正在创建…' : '创建项目'}
                </Button>
              </>
            }
          >
            <form id="workflow-create-project" onSubmit={create}>
              <label
                htmlFor="video-project-name"
                className="block text-label-sm text-on-surface-variant mb-2"
              >
                项目名称
              </label>
              <Input
                autoFocus
                id="video-project-name"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                placeholder="例如：5 分钟讲清一个技术概念"
              />
            </form>
            {error && (
              <p role="alert" className="workflow-error">
                {error}
              </p>
            )}
          </WorkflowDialog>
        </>
      )}
    </div>
  )
}
