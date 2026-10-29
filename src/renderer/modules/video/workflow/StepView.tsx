import {
  VIDEO_STAGES,
  VIDEO_STAGE_LABELS,
  stageUnlocked,
  isImportedVideo,
  stageValue,
  type VideoProject,
  type VideoStage,
} from '@shared/video-workflow'
import { cn } from '@/lib/utils'

export const revisionStatus = { review: '待审核', approved: '已通过', stale: '需更新' }
export function StepView({
  project,
  active,
  onSelect,
}: {
  project: VideoProject
  active: VideoStage
  onSelect: (stage: VideoStage) => void
}) {
  const imported = isImportedVideo(project)
  const render = stageValue(project, 'render')
  return (
    <nav aria-label="视频创作步骤" className="workflow-step-scroll">
      {imported && render && (
        <p className="workflow-muted mb-3" data-imported-video-summary>
          外部成品视频 · {render.width}×{render.height} · {render.duration.toFixed(1)} 秒。
          已跳过简报、分镜、配音和渲染，预览并审核发布资料后即可投稿。
        </p>
      )}
      <ol className="workflow-steps">
        {(imported ? ['publish' as const] : VIDEO_STAGES).map((stage) => {
          const index = VIDEO_STAGES.indexOf(stage)
          const revision = project.stages[stage],
            unlocked = stageUnlocked(project, stage)
          const running = project.jobs.some((job) => job.stage === stage && job.state === 'running')
          const status = running
            ? '生成中'
            : revision
              ? revisionStatus[revision.status]
              : unlocked
                ? '待开始'
                : '未生成'
          return (
            <li
              key={stage}
              className={cn(
                'workflow-step',
                active === stage && 'is-active',
                revision?.status === 'approved' && 'is-approved',
              )}
            >
              <button
                type="button"
                aria-current={active === stage ? 'step' : undefined}
                aria-label={`${index + 1}. ${VIDEO_STAGE_LABELS[stage]}，${status}`}
                onClick={() => onSelect(stage)}
                className="workflow-step-button"
              >
                <span className="workflow-step-number" aria-hidden="true">
                  {revision?.status === 'approved' ? (
                    <span className="material-symbols-outlined text-[18px]">check</span>
                  ) : (
                    String(index + 1).padStart(2, '0')
                  )}
                </span>
                <span className="workflow-step-label">{VIDEO_STAGE_LABELS[stage]}</span>
                <span className="workflow-step-status">{status}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
