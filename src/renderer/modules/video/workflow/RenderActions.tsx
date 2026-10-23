import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  MOTION_TRANSITIONS,
  stageValue,
  stageUnlocked,
  type VideoProject,
} from '@shared/video-workflow'
import { VoiceInput, VoiceRadioGroup, VoiceTextArea } from '../components/voiceover/VoiceControls'
import { VoiceSelect } from '../components/voiceover/VoiceEngineFields'
import { WorkflowDialog } from './WorkflowDialog'
import { workflowCall } from './useWorkflow'

export function RenderActions({
  project,
  final,
  sceneId,
  time,
  disabled,
  run,
}: {
  project: VideoProject
  final: boolean
  sceneId?: string
  time: number
  disabled: boolean
  run: (action: () => Promise<unknown>, message?: string) => Promise<boolean>
}) {
  const [feedback, setFeedback] = useState('')
  const [scope, setScope] = useState('scene')
  const [executor, setExecutor] = useState('codex')
  const [templateOpen, setTemplateOpen] = useState(false)
  const [name, setName] = useState(project.title.slice(0, 75) + ' · 风格')
  const [description, setDescription] = useState('')
  const templateButton = useRef<HTMLButtonElement>(null)
  const motionDetails = useRef<HTMLDetailsElement>(null)
  const storageKey = `video-motion-feedback:${project.id}`
  useEffect(() => {
    try {
      setFeedback(localStorage.getItem(storageKey) ?? '')
    } catch {
      setFeedback('')
    }
  }, [storageKey])
  const running = project.jobs.some((job) => job.state === 'running')
  const latestPlan = project.jobs.find((job) => job.kind === 'motion-plan')
  const plan =
    latestPlan?.state === 'succeeded' && latestPlan.expectedRevision === project.revision
      ? latestPlan.motionPlan
      : undefined
  const pendingPlanId = !final && plan ? latestPlan?.id : undefined
  useEffect(() => {
    if (pendingPlanId && motionDetails.current) motionDetails.current.open = true
  }, [pendingPlanId])
  const locked = disabled || running
  const generatePlan = () =>
    run(
      () =>
        workflowCall('generate', {
          projectId: project.id,
          stage: 'roughcut',
          expectedRevision: project.revision,
          requestId: crypto.randomUUID(),
          executor,
          modification: {
            feedback,
            at: time,
            ...(scope === 'scene' && sceneId ? { sceneId } : {}),
          },
        }),
      '正在生成修改计划，完成后请确认再合成',
    )
  return (
    <div className="workflow-section workflow-divider">
      <div className="workflow-toolbar">
        <p className="workflow-muted">
          工程源码与视频分别保存，可导出副本供 HyperFrames Studio 编辑。
        </p>
        <div className="workflow-actions">
          <Button
            size="sm"
            variant="secondary"
            disabled={locked}
            onClick={() =>
              void run(
                () => workflowCall('exportComposition', project.id, final ? 'render' : 'roughcut'),
                '工程副本已导出，原审核版本保持不变',
              )
            }
          >
            导出可编辑工程
          </Button>
          {final && (
            <Button
              ref={templateButton}
              size="sm"
              variant="secondary"
              disabled={locked || project.stages.render?.status !== 'approved'}
              onClick={() => setTemplateOpen(true)}
            >
              保存为模板
            </Button>
          )}
        </div>
      </div>
      {final ? (
        <p className="workflow-muted">审核通过正片后可保存风格模板，后续视频使用新内容重新编排。</p>
      ) : (
        <details ref={motionDetails} id="workflow-motion-plan">
          <summary className="text-body-sm font-semibold cursor-pointer">
            提出修改 · 元素动效与转场{plan ? ' · 计划待确认' : ''}
          </summary>
          <div className="workflow-section mt-3">
            <div className="workflow-fields">
              <VoiceRadioGroup
                label="修改范围"
                value={scope}
                onChange={setScope}
                compact
                options={[
                  { value: 'scene', label: '当前分镜' },
                  { value: 'all', label: '整片' },
                ]}
              />
              <VoiceSelect
                label="本地执行器"
                value={executor}
                onChange={setExecutor}
                options={[
                  { value: 'codex', label: 'Codex CLI' },
                  { value: 'claude', label: 'Claude Code' },
                ]}
              />
            </div>
            <p className="workflow-muted">
              定位 {time.toFixed(1)} 秒 ·{' '}
              {scope === 'scene'
                ? (stageValue(project, 'storyboard')?.scenes.find((scene) => scene.id === sceneId)
                    ?.title ?? '当前分镜')
                : '所有分镜'}
              。保持文案、配音与总时长；涉及内容变化需回前置阶段复审。
              {scope === 'scene'
                ? ' 仅修改当前镜；希望调整每一镜及镜间转场时请选择整片。'
                : ' 可同时规划各镜元素动画与镜间转场。'}
            </p>
            <VoiceTextArea
              label="修改意见"
              rows={3}
              maxLength={5000}
              disabled={locked}
              value={feedback}
              onChange={(event) => {
                setFeedback(event.target.value)
                try {
                  localStorage.setItem(storageKey, event.target.value)
                } catch {
                  return
                }
              }}
              placeholder="例如：标题依次入场，角色轻弹出现后缓慢浮动，时间线节点依次展开；保持口播不变。"
            />
            <div className="workflow-actions">
              <Button
                size="sm"
                variant="secondary"
                disabled={locked || !feedback.trim() || !stageUnlocked(project, 'roughcut')}
                onClick={() => void generatePlan()}
              >
                {running && latestPlan?.state === 'running' ? '正在分析修改…' : '生成修改计划'}
              </Button>
            </div>
            {plan && (
              <div className="workflow-section workflow-divider" aria-label="待确认动效计划">
                <strong className="text-body-sm">修改计划 · 尚未应用到视频</strong>
                <p className="workflow-muted">
                  计划覆盖 {plan.scenes.length} /{' '}
                  {stageValue(project, 'storyboard')?.scenes.length ?? 0} 镜。 当前视频仍为粗剪 v
                  {project.stages.roughcut?.version}；确认后才合成新版，不会自动审核。
                </p>
                <p className="text-body-sm whitespace-pre-wrap">{plan.summary}</p>
                <p className="workflow-muted">原始意见：{plan.feedback}</p>
                <ul className="text-body-sm space-y-2">
                  {plan.scenes.map((scene) => (
                    <li key={scene.sceneId}>
                      <strong>
                        {
                          stageValue(project, 'storyboard')?.scenes.find(
                            (item) => item.id === scene.sceneId,
                          )?.title
                        }
                      </strong>
                      <span className="workflow-muted"> · {scene.effects.length} 项动效</span>
                      {scene.transition && (
                        <p className="workflow-muted">
                          与上一镜交接：{MOTION_TRANSITIONS[scene.transition.type]} ·{' '}
                          {scene.transition.duration.toFixed(1)} 秒
                        </p>
                      )}
                      <p className="workflow-muted">
                        {scene.effects
                          .map(
                            (effect) =>
                              `${effect.selector}：${effect.start.toFixed(1)}–${(effect.start + effect.duration * (effect.iterations ?? 1)).toFixed(1)} 秒`,
                          )
                          .join('；')}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="workflow-actions">
                  <Button
                    size="sm"
                    disabled={locked}
                    onClick={() =>
                      void run(
                        () =>
                          workflowCall('generate', {
                            projectId: project.id,
                            stage: 'roughcut',
                            expectedRevision: project.revision,
                            requestId: crypto.randomUUID(),
                            executor: 'template',
                            motionPlanJobId: latestPlan!.id,
                          }),
                        '正在生成新版粗剪；旧版本保留，新版需要重新审核',
                      )
                    }
                  >
                    确认计划，生成粗剪 v{(project.stages.roughcut?.version ?? 0) + 1}
                  </Button>
                </div>
              </div>
            )}
            {latestPlan && latestPlan.expectedRevision !== project.revision && (
              <p className="workflow-muted">旧修改计划对应的输入版本已变化，需重新生成计划。</p>
            )}
            {running && (
              <p className="workflow-muted" role="status">
                任务执行中，处理阶段与耗时见右侧执行记录。
              </p>
            )}
          </div>
        </details>
      )}
      <WorkflowDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        title="保存为风格模板"
        description="保存配色、字体、多镜版式和已有动效，作为新视频的视觉参考。文案与配音随新项目重新生成。"
        returnFocus={templateButton}
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setTemplateOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              disabled={locked || !name.trim()}
              onClick={() =>
                void (async () => {
                  if (
                    await run(
                      () =>
                        workflowCall(
                          'saveTemplate',
                          project.id,
                          project.revision,
                          name,
                          description,
                        ),
                      '模板已保存，可在分镜创作设置中选择',
                    )
                  )
                    setTemplateOpen(false)
                })()
              }
            >
              保存模板
            </Button>
          </>
        }
      >
        <VoiceInput
          label="模板名称"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={locked}
        />
        <VoiceTextArea
          label="风格描述（选填）"
          maxLength={1000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={locked}
        />
        <p className="workflow-muted">
          {stageValue(project, 'render')?.motion
            ? '包含元素动效方案。'
            : '来源工程为静态画面，模板不包含画内元素动效。'}{' '}
          本期以本地 Agent 结合样式样本套用，每镜按新内容选择不同版式。
        </p>
      </WorkflowDialog>
    </div>
  )
}
