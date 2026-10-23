import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { VoiceInput, VoiceRadioGroup, VoiceTextArea } from '../components/voiceover/VoiceControls'
import { VoiceSelect } from '../components/voiceover/VoiceEngineFields'
import {
  SCENE_LAYOUTS,
  TEMPLATE_FAMILIES,
  type StoryboardPayload,
  type StoryScene,
  type WorkflowFile,
  type VideoStyleTemplate,
} from '@shared/video-workflow'
import { mediaUrl, workflowCall } from './useWorkflow'
import { WorkflowDialog } from './WorkflowDialog'

export const layoutNames = {
  title: '开场标题',
  split: '左右分栏',
  steps: '步骤卡片',
  comparison: '对比说明',
  quote: '大字引言',
  summary: '总结清单',
}

export function ScenePreview({
  projectId,
  value,
  scene,
  thumbnail = false,
}: {
  projectId: string
  value: StoryboardPayload
  scene?: StoryScene
  thumbnail?: boolean
}) {
  const [html, setHtml] = useState('')
  const [error, setError] = useState('')
  const [scale, setScale] = useState(0)
  const viewport = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver((entries) => setScale(entries[0].contentRect.width / 1920))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let current = true
    setHtml('')
    setError('')
    if (!scene) return
    const timer = setTimeout(() => {
      void workflowCall<string>('preview', projectId, value, scene.id)
        .then((result) => {
          if (current) setHtml(result)
        })
        .catch((failure) => {
          if (current) setError(failure.message)
        })
    }, 120)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [projectId, value, scene])
  return (
    <div
      className={'workflow-preview' + (thumbnail ? ' workflow-preview-thumbnail' : '')}
      ref={viewport}
    >
      {html ? (
        <iframe
          title={(thumbnail ? '缩略图：' : '分镜预览：') + scene?.title}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={html}
          tabIndex={-1}
          style={{ transform: 'scale(' + scale + ')' }}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center p-3 workflow-muted">
          {error || (scene ? '正在准备安全预览…' : '生成或导入分镜后，在这里逐镜审阅画面')}
        </div>
      )}
    </div>
  )
}

export function StoryboardEditor({
  projectId,
  value,
  onChange,
  disabled,
  onRegenerate,
  onCreate,
  narration,
}: {
  projectId: string
  value: StoryboardPayload
  onChange: (payload: StoryboardPayload) => void
  disabled: boolean
  onRegenerate: (sceneId: string) => void
  onCreate: (settings: StoryboardPayload, sceneId?: string) => Promise<boolean>
  narration?: { scenes: { id: string; text: string }[] }
}) {
  const [active, setActive] = useState(value.scenes[0]?.id ?? '')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [candidate, setCandidate] = useState(value)
  const [sceneDraft, setSceneDraft] = useState<StoryScene | null>(null)
  const [scope, setScope] = useState('all')
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [templates, setTemplates] = useState<Omit<VideoStyleTemplate, 'storyboard' | 'motion'>[]>(
    [],
  )
  const [templatesError, setTemplatesError] = useState('')
  useEffect(() => {
    if (!settingsOpen) return
    let current = true
    void workflowCall<Omit<VideoStyleTemplate, 'storyboard' | 'motion'>[]>('templates')
      .then((items) => {
        if (current) {
          setTemplates(items)
          setTemplatesError('')
        }
      })
      .catch((failure) => {
        if (current) setTemplatesError(failure.message)
      })
    return () => {
      current = false
    }
  }, [settingsOpen])
  const settingsButton = useRef<HTMLButtonElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const scene = value.scenes.find((item) => item.id === active) ?? value.scenes[0]
  const index = scene ? value.scenes.indexOf(scene) : 0
  const sampleScenes: StoryScene[] = [
    {
      id: 'sample-title',
      title: '一个想法，清晰表达',
      body: '从问题开始\n把内容组织成故事',
      layout: 'title',
    },
    {
      id: 'sample-steps',
      title: '把创作串成工作流',
      body: '整理观点\n设计画面\n生成作品',
      layout: 'steps',
    },
    {
      id: 'sample-split',
      title: '结构与内容相辅相成',
      body: '左侧解释原理\n右侧展示实践',
      layout: 'split',
    },
    {
      id: 'sample-comparison',
      title: '从灵感到作品',
      body: '修改前：信息分散\n修改后：叙事清晰',
      layout: 'comparison',
    },
  ]
  const examples = { ...candidate, scenes: sampleScenes }
  const importReference = async () => {
    try {
      const file = await workflowCall<WorkflowFile | null>('importReference', projectId)
      if (file) setCandidate((current) => ({ ...current, referenceFile: file }))
    } catch (failure) {
      setError((failure as Error).message)
    }
  }
  const applySettings = async () => {
    const references = (candidate.references ?? []).map((item) => item.trim()).filter(Boolean)
    if (candidate.mode === 'agent') {
      if (
        !candidate.styleTemplateId &&
        !candidate.referenceText?.trim() &&
        !references.length &&
        !candidate.referenceFile
      ) {
        setError('请填写文字描述、参考链接或导入 HTML，至少提供一项。')
        return
      }
      try {
        for (const reference of references) {
          const url = new URL(reference)
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
        }
      } catch {
        setError('参考链接需为完整的 HTTP(S) 地址，请逐行检查。')
        return
      }
    }
    const settings = { ...candidate, references }
    if (candidate.mode === 'template' && value.scenes.length) {
      onChange({ ...value, mode: 'template', template: candidate.template })
    } else {
      setStarting(true)
      const started = await onCreate(
        settings,
        scope === 'scene' && candidate.mode === 'agent' ? scene?.id : undefined,
      )
      setStarting(false)
      if (!started) {
        setError('任务未启动。请先保存现有修改，并检查前置审核与执行环境；创作要求已保留。')
        return
      }
    }
    setSettingsOpen(false)
  }
  const openEditor = () => {
    if (scene) {
      setSceneDraft({ ...scene })
      setEditing(true)
    }
  }
  return (
    <div className="workflow-section workflow-storyboard">
      <div className="workflow-stage-heading">
        <div>
          <h2 className="workflow-section-title">HTML 分镜</h2>
          <p className="workflow-muted">逐镜确认画面与内容，整体风格一致，版式按内容变化。</p>
        </div>
        <Button
          ref={settingsButton}
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => {
            setCandidate(value)
            setScope('all')
            setError('')
            setSettingsOpen(true)
          }}
        >
          创作设置
        </Button>
      </div>
      <ScenePreview projectId={projectId} value={value} scene={scene} />
      <div className="workflow-toolbar workflow-muted">
        <span>
          分镜 {scene ? String(index + 1).padStart(2, '0') : '—'} /{' '}
          {String(value.scenes.length).padStart(2, '0')} · 静态关键帧
        </span>
        <span>
          {TEMPLATE_FAMILIES.find((item) => item.id === value.template)?.name} ·{' '}
          {scene?.html ? '自由 HTML' : scene ? layoutNames[scene.layout] : '等待创作'}
        </span>
      </div>
      {value.scenes.length > 0 && (
        <div className="workflow-scenes" role="group" aria-label="分镜选择">
          {value.scenes.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className="workflow-scene"
              aria-pressed={scene?.id === item.id}
              onClick={() => setActive(item.id)}
            >
              <ScenePreview projectId={projectId} value={value} scene={item} thumbnail />
              <span>
                {String(i + 1).padStart(2, '0')} · {item.title}
              </span>
            </button>
          ))}
        </div>
      )}
      {scene && (
        <div className="workflow-scene-notes">
          <div className="workflow-toolbar">
            <div>
              <p className="workflow-muted">屏幕文字</p>
              <h3 className="text-body-sm font-semibold mt-1">{scene.title}</h3>
            </div>
            <Button
              ref={editButton}
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={openEditor}
            >
              修改此分镜
            </Button>
          </div>
          <p className="text-body-sm whitespace-pre-wrap leading-relaxed">{scene.body}</p>
          <div>
            <p className="workflow-muted">对应口播{narration ? '' : '草稿'}</p>
            <p className="text-body-sm leading-relaxed mt-1">
              {narration?.scenes.find((item) => item.id === scene.id)?.text ||
                '待分镜审核通过后，在口播定稿阶段生成。'}
            </p>
          </div>
        </div>
      )}
      <div className="workflow-toolbar workflow-scene-tools">
        <span className="workflow-muted">
          {value.mode === 'agent' ? 'Agent 自由创作' : '套用视觉模板'} ·
          修改后需保存新版本并重新审核
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            const id = crypto.randomUUID()
            onChange({
              ...value,
              scenes: [
                ...value.scenes,
                { id, title: '新的分镜', body: '补充画面要点', layout: 'split' },
              ],
            })
            setActive(id)
          }}
        >
          添加分镜
        </Button>
      </div>

      <WorkflowDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title="分镜创作设置"
        description="统一视觉语言，按镜头内容采用不同版式。生成或保存新版本后仍需人工审核。"
        returnFocus={settingsButton}
        footer={
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={starting}
              onClick={() => setSettingsOpen(false)}
            >
              取消
            </Button>
            <Button size="sm" disabled={starting} onClick={() => void applySettings()}>
              {starting
                ? '正在启动…'
                : candidate.mode === 'template' && value.scenes.length
                  ? '采用视觉模板'
                  : '生成分镜候选'}
            </Button>
          </>
        }
      >
        <VoiceSelect
          label="我的模板"
          value={candidate.styleTemplateId ?? 'builtin'}
          onChange={(id) =>
            setCandidate({
              ...candidate,
              styleTemplateId: id === 'builtin' ? undefined : id,
              ...(id !== 'builtin' ? { mode: 'agent' as const } : {}),
            })
          }
          options={[
            { value: 'builtin', label: '不使用已保存模板' },
            ...templates.map((template) => ({ value: template.id, label: template.name })),
          ]}
        />
        {candidate.styleTemplateId && (
          <p className="workflow-muted">
            本地 Agent 将结合新文案复用多镜版式、配色与动效风格，每镜重新编排；不会复制旧视频内容。
          </p>
        )}
        {candidate.styleTemplateId &&
          templates.find((item) => item.id === candidate.styleTemplateId) && (
            <img
              className="workflow-media"
              alt="已保存风格模板封面"
              src={mediaUrl(
                templates.find((item) => item.id === candidate.styleTemplateId)!.sourceProjectId,
                templates.find((item) => item.id === candidate.styleTemplateId)!.cover,
              )}
            />
          )}
        {templatesError && (
          <p className="workflow-error" role="alert">
            模板列表加载失败：{templatesError}。重新打开创作设置可重试。
          </p>
        )}
        <VoiceRadioGroup
          label="分镜创作方式"
          value={candidate.mode}
          onChange={(mode) =>
            setCandidate({
              ...candidate,
              mode: mode as 'template' | 'agent',
              ...(mode === 'template' ? { styleTemplateId: undefined } : {}),
            })
          }
          options={[
            { value: 'template', label: '套用视觉模板' },
            { value: 'agent', label: 'Agent 自由创作' },
          ]}
          compact
        />
        {candidate.mode === 'template' ? (
          <>
            <fieldset className="workflow-template-options" aria-label="视觉模板族">
              {TEMPLATE_FAMILIES.map((template) => (
                <label key={template.id} className="workflow-template">
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={'template-' + projectId}
                      checked={candidate.template === template.id}
                      onChange={() => setCandidate({ ...candidate, template: template.id })}
                    />
                    <strong>{template.name}</strong>
                  </span>
                  <span className="workflow-muted">{template.description}</span>
                </label>
              ))}
            </fieldset>
            <p className="workflow-muted">同一视觉模板 · 不同分镜版式示例</p>
            <div className="workflow-template-examples">
              {sampleScenes.map((item) => (
                <div key={item.id}>
                  <ScenePreview projectId={projectId} value={examples} scene={item} thumbnail />
                  <p className="workflow-muted mt-1">{layoutNames[item.layout]}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="workflow-muted">Agent 可自由设计各镜版式，支持链接、文件与描述组合。</p>
            <VoiceTextArea
              label="创作要求 / 参考描述"
              value={candidate.referenceText ?? ''}
              onChange={(event) =>
                setCandidate({ ...candidate, referenceText: event.target.value })
              }
              placeholder="描述视觉风格、内容结构和希望参考的画面…"
            />
            <VoiceTextArea
              label="参考链接（每行一条，可留空）"
              value={(candidate.references ?? []).join('\n')}
              onChange={(event) =>
                setCandidate({ ...candidate, references: event.target.value.split('\n') })
              }
              rows={2}
              placeholder="https://example.com/reference"
            />
            <div className="workflow-reference-file">
              <div>
                <strong className="text-body-sm">参考 HTML</strong>
                <p className="workflow-muted">
                  {candidate.referenceFile
                    ? '已保存参考文件快照'
                    : '选择本地 HTML 文件，作为创作参考'}
                </p>
              </div>
              <div className="workflow-actions">
                <Button size="sm" variant="secondary" onClick={() => void importReference()}>
                  导入参考 HTML
                </Button>
                {candidate.referenceFile && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCandidate({ ...candidate, referenceFile: undefined })}
                  >
                    移除参考
                  </Button>
                )}
              </div>
            </div>
            <p className="workflow-muted">
              链接会冻结为公开网页快照；需登录或内网资源请导入 HTML。脚本和外部资源不会执行。
            </p>
          </>
        )}
        <div className="workflow-divider">
          {candidate.mode === 'agent' && scene ? (
            <VoiceRadioGroup
              label="应用范围"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'all', label: '整片分镜' },
                { value: 'scene', label: '仅当前分镜' },
              ]}
              compact
            />
          ) : (
            <>
              <p className="workflow-muted">应用范围</p>
              <p className="text-body-sm mt-2">整片分镜；每镜按内容采用不同版式。</p>
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="workflow-error">
            {error}
          </p>
        )}
      </WorkflowDialog>
      <WorkflowDialog
        open={editing}
        onOpenChange={setEditing}
        title="修改此分镜"
        description="编辑当前镜头；取消不会改变已采用的内容。"
        returnFocus={editButton}
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (sceneDraft) {
                  onChange({
                    ...value,
                    scenes: value.scenes.map((item) =>
                      item.id === sceneDraft.id ? sceneDraft : item,
                    ),
                  })
                  setEditing(false)
                }
              }}
            >
              采用分镜修改
            </Button>
          </>
        }
      >
        {sceneDraft && (
          <>
            <VoiceInput
              label="画面标题"
              value={sceneDraft.title}
              maxLength={32}
              onChange={(event) => setSceneDraft({ ...sceneDraft, title: event.target.value })}
            />
            <VoiceSelect
              label="本镜布局"
              value={sceneDraft.layout}
              onChange={(layout) =>
                setSceneDraft({
                  ...sceneDraft,
                  layout: layout as StoryScene['layout'],
                  html: undefined,
                })
              }
              options={SCENE_LAYOUTS.map((layout) => ({
                value: layout,
                label: layoutNames[layout],
              }))}
            />
            <VoiceTextArea
              label="画面要点（每行一项）"
              value={sceneDraft.body}
              onChange={(event) => setSceneDraft({ ...sceneDraft, body: event.target.value })}
            />
            <details className="workflow-divider">
              <summary className="workflow-muted cursor-pointer">独立 HTML（可选）</summary>
              <div className="mt-4">
                <VoiceTextArea
                  label="本镜 HTML 源码"
                  value={sceneDraft.html ?? ''}
                  onChange={(event) =>
                    setSceneDraft({ ...sceneDraft, html: event.target.value || undefined })
                  }
                  placeholder="内联 CSS + 静态 HTML，1920×1080"
                  className="font-mono text-[12px]"
                />
                <p className="workflow-muted mt-2">
                  切换布局会恢复模板画面；HTML 仅作无脚本安全预览。
                </p>
              </div>
            </details>
            <div className="workflow-toolbar workflow-divider">
              <Button
                size="sm"
                variant="ghost"
                disabled={index === 0}
                onClick={() => {
                  const scenes = [...value.scenes]
                  ;[scenes[index - 1], scenes[index]] = [scenes[index], scenes[index - 1]]
                  onChange({ ...value, scenes })
                  setEditing(false)
                }}
              >
                前移此镜
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={value.scenes.length <= 1}
                onClick={() => {
                  onChange({
                    ...value,
                    scenes: value.scenes.filter((item) => item.id !== sceneDraft.id),
                  })
                  setEditing(false)
                }}
              >
                移除此镜
              </Button>
            </div>
            {value.mode === 'agent' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onRegenerate(sceneDraft.id)
                  setEditing(false)
                }}
              >
                用已保存要求重绘当前一镜
              </Button>
            )}
          </>
        )}
      </WorkflowDialog>
    </div>
  )
}
