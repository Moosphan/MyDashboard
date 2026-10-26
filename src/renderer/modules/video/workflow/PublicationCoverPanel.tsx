import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpenIcon, MagnifyingGlassPlusIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { VoiceRadioGroup, VoiceTextArea } from '../components/voiceover/VoiceControls'
import { VoiceSelect } from '../components/voiceover/VoiceEngineFields'
import {
  stageValue,
  type CoverGeneration,
  type PlatformMetadata,
  type PublicationCover,
  type PublishPayload,
  type VideoProject,
} from '@shared/video-workflow'
import { mediaUrl, workflowCall } from './useWorkflow'
import { WorkflowDialog } from './WorkflowDialog'

export function PublicationCoverPanel({
  project,
  value,
  disabled,
  canGenerate,
  generating,
  onChange,
  onGenerate,
}: {
  project: VideoProject
  value: PlatformMetadata
  disabled: boolean
  canGenerate: boolean
  generating: boolean
  onChange: (cover: PublicationCover | undefined) => void
  onGenerate: (options: CoverGeneration) => Promise<boolean>
}) {
  const [method, setMethod] = useState<PublicationCover['method']>('code')
  const [feedback, setFeedback] = useState('')
  const [open, setOpen] = useState(false)
  const [generationOpen, setGenerationOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const [ratio, setRatio] = useState(value.cover ? 'feed' : 'landscape')
  const [selectedId, setSelectedId] = useState(value.cover?.file.id ?? 'render-frame')
  const [imageError, setImageError] = useState(false)
  const [revealError, setRevealError] = useState('')
  const [revealing, setRevealing] = useState(false)
  const [imageSize, setImageSize] = useState<{ id: string; width: number; height: number }>()
  const previewButton = useRef<HTMLButtonElement>(null)
  const generateButton = useRef<HTMLButtonElement>(null)
  const submissionPending = useRef(false)
  const versions = useMemo(() => {
    const found = new Map<string, { cover: PublicationCover; version: number }>()
    for (const revision of project.history
      .filter((item) => item.stage === 'publish')
      .sort((left, right) => left.version - right.version)) {
      const cover = (revision.payload as PublishPayload).platforms.bilibili.cover
      if (cover && !found.has(cover.file.id))
        found.set(cover.file.id, { cover, version: revision.version })
    }
    if (value.cover && !found.has(value.cover.file.id))
      found.set(value.cover.file.id, {
        cover: value.cover,
        version: project.stages.publish?.version ?? 0,
      })
    return [...found.values()].sort((left, right) => right.version - left.version)
  }, [value.cover, project.history, project.stages.publish?.version])
  useEffect(() => {
    setSelectedId(value.cover?.file.id ?? 'render-frame')
  }, [value.cover?.file.id])
  const selected = versions.find((item) => item.cover.file.id === selectedId)?.cover
  useEffect(() => {
    setRatio(selectedId === 'render-frame' ? 'landscape' : 'feed')
  }, [selectedId])
  const currentRender = project.stages.render?.id
  const file = selected
    ? ratio === 'feed'
      ? selected.feedFile
      : selected.file
    : stageValue(project, 'render')?.cover
  const aspectRatio = ratio === 'feed' ? 4 / 3 : 16 / 9
  const dimensions = selected
    ? `1600×${ratio === 'feed' ? '1200' : '900'}`
    : imageSize?.id === file?.id
      ? `${imageSize?.width}×${imageSize?.height}`
      : ''
  const stale = selected && selected.sourceRenderId !== currentRender
  const timestamp = (cover: PublicationCover) =>
    new Date(cover.createdAt).toLocaleString('zh-CN', { hour12: false })
  useEffect(() => {
    setImageError(false)
    setRevealError('')
  }, [file?.id])
  const revealFile = async () => {
    if (!file || revealing) return
    setRevealing(true)
    setRevealError('')
    try {
      await workflowCall('showFile', project.id, file)
    } catch (failure) {
      setRevealError((failure as Error).message)
    } finally {
      setRevealing(false)
    }
  }
  const imageLoaded = (image: HTMLImageElement) => {
    if (file) setImageSize({ id: file.id, width: image.naturalWidth, height: image.naturalHeight })
  }
  const generate = async () => {
    if (!canGenerate || submissionPending.current) return
    submissionPending.current = true
    setSubmitting(true)
    setGenerationError('')
    try {
      if (await onGenerate({ method, feedback })) setGenerationOpen(false)
      else setGenerationError('未能启动封面任务，请查看页面错误提示后重试；修改建议已保留。')
    } catch (failure) {
      setGenerationError((failure as Error).message)
    } finally {
      submissionPending.current = false
      setSubmitting(false)
    }
  }
  return (
    <section
      className="workflow-section workflow-publication-cover"
      aria-label="B 站投稿封面"
      data-publication-cover
    >
      <div className="workflow-stage-heading">
        <h4 className="text-body-sm font-semibold">B 站投稿封面</h4>
        <Button
          ref={generateButton}
          size="sm"
          disabled={!canGenerate}
          onClick={() => {
            setGenerationError('')
            setGenerationOpen(true)
          }}
          data-cover-generate
        >
          {generating ? '正在生成封面…' : value.cover ? '重新生成封面' : 'AI 生成封面'}
        </Button>
      </div>
      <div className="workflow-cover-content">
        <div className="workflow-cover-thumbnail">
          <div className="workflow-cover-image">
            {file && (
              <img
                src={mediaUrl(project.id, file)}
                style={{ aspectRatio }}
                alt={selected ? 'B 站投稿封面候选' : '当前使用成片截帧'}
                onError={() => setImageError(true)}
                onLoad={(event) => imageLoaded(event.currentTarget)}
              />
            )}
            <div className="workflow-cover-image-actions">
              <Button
                ref={previewButton}
                variant="ghost"
                size="icon"
                disabled={!file}
                aria-label="放大预览封面"
                title="放大预览封面"
                onClick={() => setOpen(true)}
              >
                <MagnifyingGlassPlusIcon className="size-5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={!file || revealing}
                aria-label="打开封面所在文件夹"
                title="打开封面所在文件夹"
                onClick={() => void revealFile()}
              >
                <FolderOpenIcon className="size-5" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <p className="workflow-muted mt-2" data-cover-source>
            {selected ? '独立封面' : '成片截帧'}
            {dimensions && ` · ${dimensions}`}
            {selected
              ? ` · ${ratio === 'feed' ? '4:3' : '16:9'}`
              : ratio === 'feed'
                ? ' · 4:3 裁切预览'
                : ' · 16:9'}
          </p>
        </div>
        <div className="workflow-cover-summary">
          <p className="workflow-muted" role="status" data-cover-status>
            {generating
              ? '正在生成封面，进度与取消操作见右侧执行记录。'
              : stale
                ? '此封面对应旧成片，请重新生成适配当前成片的封面。'
                : value.cover
                  ? '已纳入发布资料；更换后需保存并重新审核，视频无需重新渲染。'
                  : '当前沿用成片截帧。AI 可按视频内容与风格生成独立封面。'}
          </p>
          <p className="workflow-muted">首页推荐 4:3 · 1600×1200 / 个人空间 16:9 · 1600×900</p>
          {versions.length > 0 && (
            <div className="workflow-toolbar">
              <fieldset disabled={disabled} className="min-w-0 flex-1">
                <VoiceSelect
                  label="封面历史版本"
                  value={selectedId}
                  onChange={setSelectedId}
                  options={[
                    { value: 'render-frame', label: '原成片截帧' },
                    ...versions.map(({ cover, version }) => ({
                      value: cover.file.id,
                      label: `${cover.file.id === value.cover?.file.id ? '当前 · ' : ''}发布 v${version} · ${timestamp(cover)} · ${cover.method === 'code' ? 'AI 代码' : 'Image2'}`,
                    })),
                  ]}
                />
              </fieldset>
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  disabled || !!stale || selectedId === (value.cover?.file.id ?? 'render-frame')
                }
                onClick={() => onChange(selected)}
              >
                {selected ? '使用此封面' : '使用原成片截帧'}
              </Button>
            </div>
          )}
        </div>
      </div>
      {imageError && (
        <p role="alert" className="workflow-error">
          封面加载失败，请检查文件或重新生成。
        </p>
      )}
      {revealError && (
        <p role="alert" className="workflow-error">
          无法定位封面：{revealError}
        </p>
      )}
      <WorkflowDialog
        open={generationOpen}
        onOpenChange={setGenerationOpen}
        title={value.cover ? '修改并重新生成封面' : '生成投稿封面'}
        description="沿用视频内容与视觉风格生成双比例封面；成功后创建待审核发布版本。"
        returnFocus={generateButton}
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenerationOpen(false)}>
              取消
            </Button>
            <Button disabled={!canGenerate || submitting} onClick={() => void generate()}>
              {submitting ? '正在启动…' : '开始生成封面'}
            </Button>
          </>
        }
      >
        <div className="workflow-section">
          <fieldset disabled={disabled || submitting}>
            <VoiceRadioGroup
              label="封面生成方式"
              value={method}
              compact
              onChange={(value) => setMethod(value as PublicationCover['method'])}
              options={[
                { value: 'code', label: 'AI 代码' },
                { value: 'image2', label: 'Image2' },
              ]}
            />
          </fieldset>
          <p className="workflow-muted">
            {method === 'image2'
              ? 'GPT Image 2 · 使用本机图片 API，可能产生费用。'
              : 'Codex / Claude · 两种比例分别独立渲染，沿用视频内容与风格。'}
          </p>
          <VoiceTextArea
            label="封面修改建议（选填）"
            rows={4}
            maxLength={5000}
            disabled={disabled || submitting}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="例如：标题更醒目，增加主题图解，沿用视频的奶油色与紫色，避免大面积空白。"
          />
          <p className="workflow-muted">
            PNG，每张不超过 4 MiB。自动投稿使用 16:9；发布包另含 4:3，可在 B
            站创作中心设置首页推荐封面。关闭弹窗保留建议，不取消已启动任务。
          </p>
          {generationError && (
            <p role="alert" className="workflow-error">
              {generationError}
            </p>
          )}
        </div>
      </WorkflowDialog>
      <WorkflowDialog
        open={open}
        onOpenChange={setOpen}
        title="投稿封面预览"
        description={
          selected
            ? '两种比例对应独立封面文件，可分别核对文字、主体与安全边距。'
            : '当前是原成片截帧；4:3 仅居中裁切预览，尚未生成独立封面，不会修改投稿文件。'
        }
        returnFocus={previewButton}
      >
        <div className="workflow-toolbar">
          <VoiceRadioGroup
            label="预览比例"
            value={ratio}
            onChange={setRatio}
            compact
            options={[
              { value: 'feed', label: '首页推荐 4:3' },
              { value: 'landscape', label: '个人空间 16:9' },
            ]}
          />
          <Button
            variant="ghost"
            size="icon"
            disabled={!file || revealing}
            aria-label="打开预览封面所在文件夹"
            title="打开预览封面所在文件夹"
            onClick={() => void revealFile()}
          >
            <FolderOpenIcon className="size-5" aria-hidden="true" />
          </Button>
        </div>
        {revealError && (
          <p role="alert" className="workflow-error">
            无法定位封面：{revealError}
          </p>
        )}
        {open && file && (
          <div
            className="workflow-cover-preview-frame"
            style={{ aspectRatio, width: `min(100%, ${58 * aspectRatio}vh)` }}
          >
            <img
              className="workflow-cover-preview"
              src={mediaUrl(project.id, file)}
              alt={
                selected
                  ? `${ratio === 'feed' ? '4:3' : '16:9'} 投稿封面放大预览`
                  : '原成片截帧放大预览'
              }
              onError={() => setImageError(true)}
              onLoad={(event) => imageLoaded(event.currentTarget)}
            />
          </div>
        )}
        {selected && (
          <p className="workflow-muted mt-3">
            {timestamp(selected)} · {selected.method === 'code' ? 'AI 代码' : 'GPT Image 2'}
            {selected.feedback && ` · 修改建议：${selected.feedback}`}
          </p>
        )}
      </WorkflowDialog>
    </section>
  )
}
