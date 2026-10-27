import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { VoiceInput, VoiceRadioGroup, VoiceTextArea } from '../components/voiceover/VoiceControls'
import { VoiceSelect } from '../components/voiceover/VoiceEngineFields'
import {
  sceneLayoutsForTemplate,
  videoFrame,
  videoFormatLabel,
  TEMPLATE_FAMILIES,
  storyboardMotionReadiness,
  storyboardMotionNotes,
  sceneMotionEnabled,
  isMaterialBlocker,
  type StoryboardPayload,
  type VideoFormat,
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
  map: '山川行旅',
  relations: '人物关系',
  artifact: '器物解读',
  chapter: '章节过渡',
}
const historyLayoutNames = {
  title: '卷首山川',
  split: '人物与背景',
  steps: '编年脉络',
  comparison: '双栏辨析',
  quote: '文本细读',
  summary: '结语索引',
  map: '山川行旅',
  relations: '人物关系',
  artifact: '器物解读',
  chapter: '章节过渡',
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
  const frame = videoFrame(value.format)
  const viewport = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const bounds = entries[0].contentRect
      setScale(Math.min(bounds.width / frame.width, bounds.height / frame.height))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [frame.width, frame.height])
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
          style={{
            width: frame.width,
            height: frame.height,
            inset: 'auto',
            left: '50%',
            top: '50%',
            transformOrigin: 'center',
            transform: 'translate(-50%, -50%) scale(' + scale + ')',
          }}
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
  targetFormat,
  disabled,
  onRegenerate,
  onAiModify,
  onCreate,
  narration,
  onAcceptIllustration,
  unsaved,
  generationError,
}: {
  projectId: string
  value: StoryboardPayload
  targetFormat?: VideoFormat
  onChange: (payload: StoryboardPayload) => void
  disabled: boolean
  onRegenerate: (sceneId: string) => Promise<boolean>
  onAiModify: (sceneId: string, feedback: string) => Promise<boolean>
  onCreate: (settings: StoryboardPayload, sceneId?: string) => Promise<boolean>
  narration?: { scenes: { id: string; text: string }[] }
  onAcceptIllustration: () => Promise<boolean>
  unsaved: boolean
  generationError?: string
}) {
  const [active, setActive] = useState(value.scenes[0]?.id ?? '')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [fallbackOpen, setFallbackOpen] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [fallbackError, setFallbackError] = useState('')
  const fallbackButton = useRef<HTMLButtonElement>(null)
  const [candidate, setCandidate] = useState(value)
  const [sceneDraft, setSceneDraft] = useState<StoryScene | null>(null)
  const [aiFeedback, setAiFeedback] = useState('')
  const [aiStarting, setAiStarting] = useState(false)
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
  const materialScenes = value.scenes.filter((item) =>
    storyboardMotionReadiness(value).blockers.some(
      (issue) => issue.sceneId === item.id && isMaterialBlocker(issue.message),
    ),
  )
  const index = scene ? value.scenes.indexOf(scene) : 0
  const sampleScenes: StoryScene[] =
    candidate.template === 'history'
      ? [
          {
            id: 'sample-title',
            title: '从长安出发',
            body: '丝绸之路上的相遇与交流\n一条路，如何连接不同的文明？',
            layout: 'title',
          },
          {
            id: 'sample-steps',
            title: '把历史放回时间之中',
            body: '前138年｜张骞首次出使西域\n前119年｜张骞再次出使西域\n交流｜往来逐渐连接不同地域',
            layout: 'steps',
          },
          {
            id: 'sample-split',
            title: '器物背后，是人的生活',
            body: '从材质与工艺，观察当时的生产方式\n从使用与流传，理解人们的日常生活',
            layout: 'split',
          },
          {
            id: 'sample-comparison',
            title: '史实与讲述，如何分辨？',
            body: '文献记载：关注作者、时代与语境\n实物证据：关注出土背景与年代',
            layout: 'comparison',
          },
          {
            id: 'sample-quote',
            title: '读史料，也读它的语境',
            body: '谁写下了这段文字？\n它在何时、为何而写？\n让文字回到自己的时代。',
            layout: 'quote',
          },
          {
            id: 'sample-summary',
            title: '路的尽头，仍是相遇',
            body: '看时间｜建立历史坐标\n看证据｜让文献与实物相互参照\n看生活｜从具体的人理解时代',
            layout: 'summary',
          },
          {
            id: 'sample-map',
            title: '一条路，连接不同的世界',
            body: '长安｜以城市为起点，观察往来的方向。\n河西｜沿走廊展开，理解交通与地理。\n西域｜在不同地域的相遇中，寻找交流的线索。',
            layout: 'map',
          },
          {
            id: 'sample-relations',
            title: '历史，由人的往来织成',
            body: '行旅者｜带来沿途的见闻\n工匠｜在器物中留下技艺\n记录者｜用文字保存时代的记忆',
            layout: 'relations',
          },
          {
            id: 'sample-artifact',
            title: '一件器物的阅读方法',
            body: '器形｜观察轮廓与结构\n工艺｜辨认制作方法和表面痕迹\n语境｜结合来源与使用背景理解器物',
            layout: 'artifact',
          },
          {
            id: 'sample-chapter',
            title: '从山川，走向人间',
            body: '循着道路留下的线索，\n走近相遇、交换与日常生活。',
            layout: 'chapter',
          },
        ]
      : [
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
        !candidate.motionPolicy?.enabled &&
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
    if (candidate.mode === 'template' && value.scenes.length && !candidate.motionPolicy?.enabled) {
      onChange({
        ...value,
        mode: 'template',
        template: candidate.template,
        motionPolicy: candidate.motionPolicy,
        ...(candidate.template !== value.template
          ? {
              scenes: value.scenes.map(
                ({ html: _html, motion: _motion, materialFallback: _fallback, ...item }) => ({
                  ...item,
                  layout: sceneLayoutsForTemplate(candidate.template).includes(item.layout)
                    ? item.layout
                    : 'split',
                }),
              ),
            }
          : {}),
      })
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
      setAiFeedback('')
      setError('')
      setEditing(true)
    }
  }
  const runSceneGeneration = async (action: () => Promise<boolean>) => {
    if (aiStarting) return
    setError('')
    setAiStarting(true)
    try {
      if (await action()) {
        setAiFeedback('')
        setEditing(false)
      } else {
        setError('任务未启动，请先保存或放弃未保存修改，并检查前置审核与执行环境。修改意见已保留。')
      }
    } catch (failure) {
      setError((failure as Error).message || '任务启动失败，修改意见已保留，请重试。')
    } finally {
      setAiStarting(false)
    }
  }
  const runAiModification = () => {
    if (!sceneDraft || !aiFeedback.trim()) {
      setError('请填写 AI 修改意见。')
      return
    }
    void runSceneGeneration(() => onAiModify(sceneDraft.id, aiFeedback.trim()))
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
      {(value.motionPolicy || value.scenes.some((item) => item.motion)) && (
        <div className="workflow-notice" data-storyboard-motion-status>
          {value.motionPolicy?.enabled !== false
            ? `MG 动画已开启 · ${storyboardMotionReadiness(value).planned} 镜计划就绪 · ${value.scenes.filter((item) => !sceneMotionEnabled(value, item.id)).length} 镜已排除。预览为静态关键帧，粗剪按实测配音时长应用动画。`
            : 'MG 动画已关闭，粗剪保留静态分镜。'}
          {value.motionPolicy?.enabled && storyboardMotionReadiness(value).unplanned.length > 0 && (
            <p>
              尚有 {storyboardMotionReadiness(value).unplanned.length}{' '}
              镜缺少计划，请在创作设置中生成分镜候选后审核。
            </p>
          )}
          {storyboardMotionReadiness(value).blockers.map((issue, issueIndex) => (
            <p key={`${issue.sceneId}-${issueIndex}`} className="workflow-error">
              {value.scenes.find((item) => item.id === issue.sceneId)?.title}：{issue.message}
            </p>
          ))}
          {storyboardMotionNotes(value).map((issue, issueIndex) => (
            <p
              key={`note-${issue.sceneId}-${issueIndex}`}
              className="workflow-muted"
              data-storyboard-motion-note
            >
              {value.scenes.find((item) => item.id === issue.sceneId)?.title} · 说明：
              {issue.message} 此说明不阻止人工审核，实际动效仍会校验。
            </p>
          ))}
          {materialScenes.length > 0 && (
            <div className="workflow-actions mt-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled || unsaved}
                ref={fallbackButton}
                data-accept-illustration
                onClick={() => {
                  setFallbackError('')
                  setFallbackOpen(true)
                }}
              >
                接受原创示意图降级
              </Button>
              {unsaved && <span className="workflow-muted">请先保存或放弃当前修改。</span>}
            </div>
          )}
          {value.scenes
            .filter((item) => item.materialFallback)
            .map((item) => (
              <details key={item.id} className="mt-2" data-illustration-accepted={item.id}>
                <summary className="cursor-pointer">
                  「{item.title}」已接受原创示意图 ·{' '}
                  {new Date(item.materialFallback!.acceptedAt).toLocaleString()}
                </summary>
                <p className="workflow-muted">
                  真实素材尚未补齐，保留原创示意图标注。修改本镜内容后需重新确认。
                </p>
                {item.materialFallback!.blockers.map((message) => (
                  <p key={message} className="workflow-muted">
                    原素材缺口：{message}
                  </p>
                ))}
              </details>
            ))}
          {scene?.motion && sceneMotionEnabled(value, scene.id) && (
            <details className="mt-2">
              <summary className="cursor-pointer">本镜 MG 计划：{scene.motion.summary}</summary>
              {scene.motion.effects.map((effect, effectIndex) => (
                <p key={effectIndex} className="workflow-muted">
                  {effect.selector} · 镜内 {Math.round(effect.start * 100)}%–
                  {Math.round((effect.start + effect.duration * (effect.iterations ?? 1)) * 100)}% ·{' '}
                  {Object.keys(effect.keyframes[0]).join('、')}
                </p>
              ))}
            </details>
          )}
        </div>
      )}
      <WorkflowDialog
        open={fallbackOpen}
        onOpenChange={(open) => {
          if (!accepting) setFallbackOpen(open)
        }}
        title="接受原创示意图降级"
        description={`统一接受以下 ${materialScenes.length} 镜的素材降级，保留当前分镜和 MG 动画。`}
        returnFocus={materialScenes.length ? fallbackButton : editButton}
        footer={
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={accepting}
              onClick={() => setFallbackOpen(false)}
            >
              取消
            </Button>
            <Button
              size="sm"
              disabled={accepting || disabled || unsaved}
              data-confirm-illustration
              onClick={async () => {
                setAccepting(true)
                setFallbackError('')
                const accepted = await onAcceptIllustration()
                setAccepting(false)
                if (accepted) {
                  setFallbackOpen(false)
                } else
                  setFallbackError(
                    '未能接受降级，请查看页面错误信息；当前画面必须有可见的原创示意图标注。',
                  )
              }}
            >
              {accepting ? '正在保存…' : '接受降级并保存'}
            </Button>
          </>
        }
      >
        {materialScenes.map((item) => (
          <div key={item.id}>
            <p>{item.title}</p>
            {item.motion?.blockers.filter(isMaterialBlocker).map((message) => (
              <p key={message} className="workflow-muted">
                {message}
              </p>
            ))}
          </div>
        ))}
        <p>保存为待审核版本，保留原素材缺口和原创标注，不表示已取得真实照片；动效缺口仍需补齐。</p>
        {fallbackError && (
          <p role="alert" className="workflow-error">
            {fallbackError}
          </p>
        )}
      </WorkflowDialog>
      {targetFormat && (value.format ?? 'landscape') !== targetFormat && (
        <p className="workflow-notice" role="status">
          当前分镜为{videoFormatLabel(value.format)}，项目目标为{videoFormatLabel(targetFormat)}
          。请重新生成整组分镜以按目标画幅重新排版，旧版保留在历史记录中。
        </p>
      )}
      <ScenePreview projectId={projectId} value={value} scene={scene} />
      <div className="workflow-toolbar workflow-muted">
        <span>
          分镜 {scene ? String(index + 1).padStart(2, '0') : '—'} /{' '}
          {String(value.scenes.length).padStart(2, '0')} · 静态关键帧 ·{' '}
          {videoFormatLabel(value.format)}
        </span>
        <span>
          {TEMPLATE_FAMILIES.find((item) => item.id === value.template)?.name} ·{' '}
          {scene?.html
            ? '自由 HTML'
            : scene
              ? (value.template === 'history' ? historyLayoutNames : layoutNames)[scene.layout]
              : '等待创作'}
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
                : candidate.mode === 'template' &&
                    value.scenes.length &&
                    !candidate.motionPolicy?.enabled
                  ? '采用视觉模板'
                  : '生成分镜候选'}
            </Button>
          </>
        }
      >
        <div className="workflow-section">
          <Toggle
            label="Motion graphics 动画"
            aria-label="Motion graphics 动画"
            disabled={starting}
            pressed={candidate.motionPolicy?.enabled ?? false}
            onPressedChange={(enabled) => {
              setCandidate({
                ...candidate,
                motionPolicy: {
                  enabled,
                  excludedSceneIds: candidate.motionPolicy?.excludedSceneIds ?? [],
                },
              })
              setScope('all')
            }}
          />
          <p className="workflow-muted">
            开启后，本地 Agent 自动为所有未排除页面生成独立元素与解释性 MG
            计划；审核后按实际配音时长应用。不会自动重做口播或配音。
          </p>
          {!candidate.motionPolicy && (
            <p className="workflow-muted">当前沿用原有创作要求；显式关闭后不应用 MG。</p>
          )}
          {candidate.motionPolicy?.enabled && value.scenes.length > 0 && (
            <details>
              <summary className="workflow-muted cursor-pointer">
                排除页面（
                {
                  candidate.motionPolicy.excludedSceneIds.filter((id) =>
                    value.scenes.some((item) => item.id === id),
                  ).length
                }
                ）
              </summary>
              <div className="workflow-section mt-2" role="group" aria-label="排除 MG 的页面">
                {value.scenes.map((item, itemIndex) => (
                  <Toggle
                    key={item.id}
                    label={`第 ${itemIndex + 1} 镜 · ${item.title}`}
                    aria-label={`排除第 ${itemIndex + 1} 镜的 MG 动画`}
                    disabled={starting}
                    pressed={candidate.motionPolicy!.excludedSceneIds.includes(item.id)}
                    onPressedChange={(excluded) => {
                      const policy = candidate.motionPolicy!
                      setCandidate({
                        ...candidate,
                        motionPolicy: {
                          ...policy,
                          excludedSceneIds: excluded
                            ? [...policy.excludedSceneIds, item.id]
                            : policy.excludedSceneIds.filter((id) => id !== item.id),
                        },
                      })
                    }}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
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
                  <p className="workflow-muted mt-1">
                    {
                      (candidate.template === 'history' ? historyLayoutNames : layoutNames)[
                        item.layout
                      ]
                    }
                  </p>
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
              options={sceneLayoutsForTemplate(value.template).map((layout) => ({
                value: layout,
                label: (value.template === 'history' ? historyLayoutNames : layoutNames)[layout],
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
                  placeholder={`内联 CSS + 静态 HTML，${videoFormatLabel(value.format)}`}
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
                    ...(value.motionPolicy
                      ? {
                          motionPolicy: {
                            ...value.motionPolicy,
                            excludedSceneIds: value.motionPolicy.excludedSceneIds.filter(
                              (id) => id !== sceneDraft.id,
                            ),
                          },
                        }
                      : {}),
                    scenes: value.scenes.filter((item) => item.id !== sceneDraft.id),
                  })
                  setEditing(false)
                }}
              >
                移除此镜
              </Button>
            </div>
            <div className="workflow-section workflow-divider">
              <VoiceTextArea
                label="AI 修改意见"
                data-storyboard-ai-feedback
                rows={3}
                maxLength={5000}
                disabled={aiStarting}
                value={aiFeedback}
                onChange={(event) => setAiFeedback(event.target.value)}
                placeholder="例如：把本镜改成三步卡片，突出关键数据，保留原有事实和口播。"
              />
              <p className="workflow-muted">
                AI
                只修改当前分镜并生成待审核版本；不会直接覆盖已审核内容。需要保持事实、口播和镜头顺序。
              </p>
              {(generationError || error) && (
                <p role="alert" className="workflow-error" data-storyboard-ai-error>
                  {generationError || error}
                </p>
              )}
              <div className="workflow-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  data-storyboard-ai-modify
                  disabled={aiStarting || !aiFeedback.trim()}
                  onClick={() => void runAiModification()}
                >
                  {aiStarting ? '正在生成分镜…' : '让 AI 按意见修改此镜'}
                </Button>
                {value.mode === 'agent' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={aiStarting}
                    onClick={() => void runSceneGeneration(() => onRegenerate(sceneDraft.id))}
                  >
                    用已保存要求重绘当前一镜
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </WorkflowDialog>
    </div>
  )
}
