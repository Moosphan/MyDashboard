import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  VoiceInput,
  VoiceTextArea,
  VoiceSlider,
  VoiceRadioGroup,
} from '../components/voiceover/VoiceControls'
import { VoiceSelect, VoiceNumber } from '../components/voiceover/VoiceEngineFields'
import { Toggle } from '@/components/ui/toggle'
import type { VoiceProfile } from '@shared/voiceover'
import {
  stageValue,
  stageUnlocked,
  canReuseAudio,
  type VideoProject,
  type WorkflowVoice,
  type PublishPayload,
  type VideoPlatform,
  type RenderPayload,
  type StoryboardPayload,
  type AudioPayload,
  type StagePayloads,
} from '@shared/video-workflow'
import { ipcInvoke } from '@/lib/ipc'
import { mediaUrl, workflowCall } from './useWorkflow'
import { ScenePreview } from './StoryboardEditor'
import { AudioTrackPlayer } from './AudioTrackPlayer'
import { RenderActions } from './RenderActions'
import { renderSceneTimeline, renderSceneAtTime } from './render-timeline'

export function AudioPanel({
  project,
  voice,
  onVoice,
  onConfigure,
  disabled,
  onRegenerate,
  onRestoreVersion,
}: {
  project: VideoProject
  voice: WorkflowVoice
  onVoice: (voice: WorkflowVoice) => void
  onConfigure: () => void
  disabled: boolean
  onRegenerate: (fileId: string) => void
  onRestoreVersion: (revisionId: string) => void
}) {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]),
    [error, setError] = useState('')
  const [versionId, setVersionId] = useState('current')
  useEffect(() => {
    void ipcInvoke<VoiceProfile[]>('tts:listProfiles')
      .then(setProfiles)
      .catch((failure) => setError(failure.message))
  }, [])
  useEffect(() => setVersionId('current'), [project.revision])
  const audioVersions = project.history.filter((revision) => revision.stage === 'audio')
  const currentAudioVersion = project.stages.audio
  const selectedVersion =
    versionId === 'current'
      ? currentAudioVersion
      : audioVersions.find((revision) => revision.id === versionId)
  const audio = selectedVersion?.payload as AudioPayload | undefined
  const viewingHistory = versionId !== 'current'
  const latestJob = project.jobs.find((job) => job.stage === 'audio')
  const pendingJob =
    latestJob &&
    latestJob.state !== 'succeeded' &&
    latestJob.state !== 'stale' &&
    latestJob.expectedRevision === project.revision &&
    (!latestJob.audioProgress?.regeneratingTrackId || latestJob.state === 'running')
      ? latestJob
      : undefined
  const visiblePendingJob = viewingHistory ? undefined : pendingJob
  const progress = visiblePendingJob?.audioProgress
  const tracks = visiblePendingJob ? (progress?.tracks ?? []) : (audio?.tracks ?? [])
  const total = progress?.total ?? stageValue(project, 'narration')?.scenes.length ?? 0
  const regenerateDisabledReason = viewingHistory
    ? '当前正在查看历史版本，请先切换为当前版本。'
    : disabled || project.jobs.some((job) => job.state === 'running')
      ? '任务执行中，请等待或取消后再重新生成。'
      : !stageUnlocked(project, 'audio') || project.stages.audio?.status === 'stale'
        ? canReuseAudio(project, project.stages.audio)
          ? '口播内容未变，可先在右侧沿用并审核此版配音，再重新生成单段。'
          : '请先审核前置步骤并生成当前完整配音。'
        : pendingJob || !audio
          ? '请先完成完整配音，再重新生成单段。'
          : voice.engine !== 'edge' && !voice.profileId
            ? '请先选择参考音色。'
            : undefined
  return (
    <div className="workflow-section">
      <div className="workflow-fields">
        <VoiceSelect
          label="配音引擎"
          value={voice.engine}
          onChange={(engine) =>
            onVoice({
              engine: engine as WorkflowVoice['engine'],
              options: {},
              ...(engine === 'edge' ? { voiceId: 'zh-CN-XiaoxiaoNeural' } : {}),
            })
          }
          options={[
            { value: 'edge', label: 'Edge TTS · 在线预设' },
            { value: 'voxcpm2', label: 'VoxCPM2 · 本地克隆' },
            { value: 'qwen3-tts', label: 'Qwen3-TTS · 本地克隆' },
          ]}
        />
        {voice.engine === 'edge' ? (
          <VoiceInput
            label="Edge 音色 ID"
            value={voice.voiceId ?? ''}
            onChange={(event) => onVoice({ ...voice, voiceId: event.target.value })}
            placeholder="zh-CN-XiaoxiaoNeural"
            disabled={disabled}
          />
        ) : (
          <VoiceSelect
            label="已保存参考音色（冻结版本）"
            value={voice.profileId ? `${voice.profileId}:${voice.profileRevision}` : ''}
            onChange={(value) => {
              const [profileId, revision] = value.split(':')
              onVoice({ ...voice, profileId, profileRevision: Number(revision) })
            }}
            options={profiles
              .filter((profile) => !profile.deletedAt)
              .flatMap((profile) =>
                profile.revisions.map((revision) => ({
                  value: `${profile.id}:${revision.revision}`,
                  label: `${profile.name} · v${revision.revision}${revision.revision === profile.currentRevision ? '（当前）' : ''}`,
                })),
              )}
          />
        )}
      </div>
      <div className="workflow-toolbar">
        <p className="text-body-sm">
          {visiblePendingJob
            ? progress?.regeneratingTrackId
              ? '单段配音重新生成中 · 其他片段保持不变'
              : `已生成 ${tracks.length} / ${total} 段 · ${visiblePendingJob.state === 'running' ? '生成中，可先试听' : '任务未完成，已成功片段可试听'}`
            : audio
              ? `${viewingHistory ? `历史 v${selectedVersion?.version} · ` : ''}${audio.tracks.length} 个配音段落`
              : '等待生成配音'}
        </p>
        <Button size="sm" variant="ghost" onClick={onConfigure}>
          打开配音工具
        </Button>
      </div>
      {audioVersions.length > 0 && (
        <div className="workflow-reference-file" data-audio-version-selector>
          <VoiceSelect
            label="分段配音版本"
            value={versionId}
            onChange={(value) => setVersionId(value)}
            options={[
              ...(currentAudioVersion
                ? [{ value: 'current', label: `当前 v${currentAudioVersion.version}` }]
                : []),
              ...audioVersions
                .filter((revision) => revision.id !== currentAudioVersion?.id)
                .map((revision) => ({
                  value: revision.id,
                  label: `历史 v${revision.version} · ${new Date(revision.createdAt).toLocaleString('zh-CN')}`,
                })),
            ]}
          />
          <div className="workflow-actions">
            {selectedVersion && (
              <span className="workflow-muted">
                生成于 {new Date(selectedVersion.createdAt).toLocaleString('zh-CN')}
                {selectedVersion.status === 'stale' ? ' · 已过期' : ''}
              </span>
            )}
            {viewingHistory && (
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  disabled || Boolean(pendingJob) || !canReuseAudio(project, selectedVersion)
                }
                onClick={() => selectedVersion && onRestoreVersion(selectedVersion.id)}
              >
                切换为当前版本
              </Button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p className="workflow-error" role="alert">
          {error}
        </p>
      )}
      {visiblePendingJob && (
        <div className="workflow-notice" role="status" data-audio-progress>
          {visiblePendingJob.state === 'running' ? (
            <div className="workflow-actions">
              <span
                className="material-symbols-outlined animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              >
                progress_activity
              </span>
              <span>{visiblePendingJob.phase}</span>
            </div>
          ) : (
            <p>
              本次任务
              {visiblePendingJob.state === 'failed'
                ? '失败'
                : visiblePendingJob.state === 'cancelled'
                  ? '已取消'
                  : '已中断'}
              。成功片段已保留，可试听；完整音频生成成功后才能审核。
            </p>
          )}
          {progress && !progress.regeneratingTrackId && (
            <progress
              className="workflow-audio-progress"
              max={total}
              value={tracks.length}
              aria-label="已完成配音段落"
            />
          )}
          {audio && (
            <p className="workflow-muted">
              当前显示本次任务片段。此前完整配音仍保留在下方，版本审核仅适用于完整产物。
            </p>
          )}
        </div>
      )}
      {tracks.length > 0 ? (
        <>
          <section aria-label="逐镜试听">
            <div className="workflow-section">
              {tracks.map((track, index) => (
                <AudioTrackPlayer
                  key={track.file.id}
                  projectId={project.id}
                  track={track}
                  index={index}
                  onRegenerate={() => onRegenerate(track.file.id)}
                  regenerateDisabledReason={regenerateDisabledReason}
                  title={
                    stageValue(project, 'storyboard')?.scenes.find(
                      (scene) => scene.id === track.sceneId,
                    )?.title ?? '配音片段'
                  }
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="workflow-notice">
          {visiblePendingJob?.state === 'running'
            ? '首段配音完成后会立即显示，无需等待全部生成。'
            : '尚未生成音频。也可按分镜顺序导入外部配音文件。'}
        </div>
      )}
      {audio && (
        <details className="workflow-divider">
          <summary className="workflow-muted cursor-pointer">
            {visiblePendingJob ? '此前完整配音与总时长' : '完整配音与总时长'}
          </summary>
          <div className="workflow-section mt-4">
            {' '}
            <div className="workflow-toolbar">
              <h4 className="workflow-section-title">完整配音</h4>
              <span className="workflow-muted">
                {audio.duration.toFixed(1)} 秒 · {audio.tracks.length} 段
              </span>
            </div>
            <audio
              controls
              preload="metadata"
              src={mediaUrl(project.id, audio.file)}
              className="w-full"
              aria-label="完整配音试听"
            />
          </div>
        </details>
      )}
      <details className="workflow-notice">
        <summary className="cursor-pointer">配音参数</summary>
        <div className="workflow-section mt-4">
          {voice.engine === 'edge' ? (
            <>
              {(['rate', 'pitchHz', 'volume'] as const).map((key, index) => (
                <VoiceSlider
                  key={key}
                  label={['语速', '音调', '音量'][index]}
                  value={voice.options[key] ?? 0}
                  min={-50}
                  max={key === 'rate' ? 100 : 50}
                  unit={key === 'pitchHz' ? ' Hz' : '%'}
                  onChange={(value) =>
                    onVoice({ ...voice, options: { ...voice.options, [key]: value } })
                  }
                />
              ))}
            </>
          ) : (
            <>
              {voice.engine === 'voxcpm2' ? (
                <>
                  <VoiceRadioGroup
                    label="生成质量"
                    value={String(voice.options.steps ?? 20)}
                    onChange={(value) =>
                      onVoice({
                        ...voice,
                        options: { ...voice.options, steps: Number(value) as 10 | 20 },
                      })
                    }
                    options={[
                      { value: '10', label: '快速 · 10 步' },
                      { value: '20', label: '精细 · 20 步' },
                    ]}
                    compact
                  />
                  <VoiceNumber
                    label="引导强度 CFG"
                    min={1}
                    max={3}
                    step={0.1}
                    value={voice.options.cfg ?? 2}
                    onChange={(cfg) => onVoice({ ...voice, options: { ...voice.options, cfg } })}
                  />
                  <VoiceNumber
                    label="参考尾部停顿（毫秒）"
                    min={0}
                    max={1000}
                    step={10}
                    value={voice.options.promptPauseMs ?? 320}
                    onChange={(promptPauseMs) =>
                      onVoice({ ...voice, options: { ...voice.options, promptPauseMs } })
                    }
                  />
                  <p className="workflow-muted">
                    默认 320 毫秒，减少句首额外发声；0 为关闭。仅调整临时参考，不截掉生成的人声。
                  </p>
                </>
              ) : (
                <>
                  <VoiceNumber
                    label="采样温度"
                    min={0.1}
                    max={1}
                    step={0.1}
                    value={voice.options.temperature ?? 0.7}
                    onChange={(temperature) =>
                      onVoice({ ...voice, options: { ...voice.options, temperature } })
                    }
                  />
                  <VoiceSelect
                    label="口播语言"
                    value={voice.options.language ?? 'zh'}
                    onChange={(language) =>
                      onVoice({
                        ...voice,
                        options: { ...voice.options, language: language as 'zh' | 'en' },
                      })
                    }
                    options={[
                      { value: 'zh', label: '中文' },
                      { value: 'en', label: '英文' },
                    ]}
                  />
                </>
              )}
              <VoiceSlider
                label="响度增益"
                min={-12}
                max={6}
                unit=" dB"
                value={voice.options.gainDb ?? 0}
                onChange={(gainDb) => onVoice({ ...voice, options: { ...voice.options, gainDb } })}
              />
              <div className="workflow-toolbar">
                <span>参考音频降噪</span>
                <Toggle
                  pressed={voice.options.denoise ?? false}
                  onPressedChange={(denoise) =>
                    onVoice({ ...voice, options: { ...voice.options, denoise } })
                  }
                  aria-label="参考音频降噪"
                />
              </div>
            </>
          )}
          <p className="workflow-muted">
            参数用于下一次生成，当前音轨保持原样。重新生成后需要再次审核。
          </p>
        </div>
      </details>

      <p className="workflow-muted">
        按已审核口播逐镜配音，长文本自动拆段并复用现有任务队列。字幕按段落真实时长分配，需人工试听校对。
      </p>
    </div>
  )
}
export function RenderPanel({
  project,
  final,
  disabled,
  run,
}: {
  project: VideoProject
  final: boolean
  disabled: boolean
  run: (action: () => Promise<unknown>, message?: string) => Promise<boolean>
}) {
  const [versionId, setVersionId] = useState('current')
  const [time, setTime] = useState(0)
  const versions = project.history.filter(
    (revision) => revision.stage === (final ? 'render' : 'roughcut'),
  )
  const selectedVersion =
    versionId === 'current'
      ? project.stages[final ? 'render' : 'roughcut']
      : versions.find((revision) => revision.id === versionId)
  const render = selectedVersion?.payload as RenderPayload | undefined
  const storyboard = (project.history.find((revision) => revision.id === render?.sourceStoryboard)
    ?.payload ?? stageValue(project, 'storyboard')) as StoryboardPayload | undefined
  const audio = (project.history.find((revision) => revision.id === render?.sourceAudio)?.payload ??
    stageValue(project, 'audio')) as AudioPayload | undefined
  const narration = (project.history.find((revision) => revision.id === render?.sourceNarration)
    ?.payload ?? stageValue(project, 'narration')) as StagePayloads['narration'] | undefined
  const [activeScene, setActiveScene] = useState(0)
  const player = useRef<HTMLVideoElement>(null)
  const timeline = renderSceneTimeline(storyboard?.scenes ?? [], audio?.tracks ?? [])
  useEffect(() => {
    setTime(0)
    setActiveScene(0)
  }, [render?.file.id])
  const syncPlayback = (media: HTMLVideoElement) => {
    if (media.seeking) return
    setTime(media.currentTime)
    setActiveScene(renderSceneAtTime(timeline, media.currentTime))
  }
  const scene = storyboard?.scenes[activeScene]
  const latestPlan = project.jobs.find((job) => job.kind === 'motion-plan')
  const pendingPlan =
    !final &&
    latestPlan?.state === 'succeeded' &&
    latestPlan.motionPlan &&
    latestPlan.expectedRevision === project.revision
  const failedPlan =
    !final && latestPlan?.state === 'failed' && latestPlan.expectedRevision === project.revision
      ? latestPlan
      : undefined
  const focusMotionPlan = () => {
    const details = document.getElementById('workflow-motion-plan') as HTMLDetailsElement | null
    if (details) {
      details.open = true
      details.scrollIntoView({ block: 'start' })
      details.querySelector('summary')?.focus({ preventScroll: true })
    }
  }
  return (
    <div className="workflow-section">
      {render ? (
        <>
          {failedPlan && (
            <div
              className="workflow-error workflow-section"
              role="alert"
              aria-label="动效计划生成失败"
            >
              <strong className="text-body-sm">修改计划未生成，当前没有可确认或预览的计划</strong>
              <p>{failedPlan.error ?? '任务失败，请展开执行记录查看详情。'}</p>
              <p className="workflow-muted">
                动效计划只处理已有分镜元素的动画和转场。若要改文字、HTML、图形或素材，请先回到分镜阶段修改并审核。
              </p>
              <div className="workflow-actions">
                <Button size="sm" variant="secondary" onClick={focusMotionPlan}>
                  查看修改入口
                </Button>
              </div>
            </div>
          )}
          {pendingPlan && (
            <div
              className="workflow-notice workflow-section"
              role="status"
              aria-label="修改计划尚未应用"
            >
              <strong className="text-body-sm">修改计划已生成，视频尚未更新</strong>
              <p className="workflow-muted">
                当前预览仍为粗剪 v{selectedVersion?.version}。请确认计划后合成粗剪 v
                {(project.stages.roughcut?.version ?? 0) + 1}，完成后再审核新版。
              </p>
              <div className="workflow-actions">
                <Button size="sm" variant="secondary" onClick={focusMotionPlan}>
                  查看计划并确认合成
                </Button>
              </div>
            </div>
          )}
          {versions.length > 1 && (
            <VoiceSelect
              label="预览版本（审核针对当前版本）"
              value={versionId}
              onChange={(value) => {
                setVersionId(value)
                setTime(0)
                setActiveScene(0)
              }}
              options={[
                {
                  value: 'current',
                  label: `当前 v${project.stages[final ? 'render' : 'roughcut']!.version}`,
                },
                ...versions.slice(1).map((revision) => ({
                  value: revision.id,
                  label: `历史 v${revision.version} · ${new Date(revision.createdAt).toLocaleString('zh-CN')}`,
                })),
              ]}
            />
          )}
          <video
            key={render.file.id}
            ref={player}
            className="workflow-media"
            controls
            preload="metadata"
            src={mediaUrl(project.id, render.file)}
            poster={mediaUrl(project.id, render.cover)}
            aria-label={final ? '最终成片预览' : '粗剪预览'}
            onTimeUpdate={(event) => syncPlayback(event.currentTarget)}
            onSeeked={(event) => syncPlayback(event.currentTarget)}
          />
          <div className="workflow-toolbar">
            <span>{render.duration.toFixed(1)} 秒 · 1920 × 1080 · 30 fps</span>
            <span className="workflow-muted">工程 {render.manifestHash.slice(0, 12)}</span>
          </div>
          {storyboard && (
            <>
              <div className="workflow-scenes" role="group" aria-label="视频分镜定位">
                {storyboard.scenes.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className="workflow-scene"
                    aria-pressed={activeScene === index}
                    onClick={() => {
                      setActiveScene(index)
                      if (player.current && audio) {
                        const time = timeline[index].seek
                        player.current.currentTime = time
                        setTime(time)
                      }
                    }}
                  >
                    <ScenePreview
                      projectId={project.id}
                      value={storyboard}
                      scene={item}
                      thumbnail
                    />
                    <span>
                      {String(index + 1).padStart(2, '0')} · {item.title}
                    </span>
                  </button>
                ))}
              </div>
              {scene && (
                <div className="workflow-scene-notes">
                  <div>
                    <p className="workflow-muted">屏幕文字</p>
                    <p className="text-body-sm font-semibold mt-1">{scene.title}</p>
                  </div>
                  <div>
                    <p className="workflow-muted">对应口播</p>
                    <p className="text-body-sm leading-relaxed mt-1">
                      {narration?.scenes.find((item) => item.id === scene.id)?.text}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
          <RenderActions
            project={project}
            final={final}
            sceneId={scene?.id}
            sceneTitle={scene?.title}
            time={time}
            disabled={disabled || versionId !== 'current'}
            run={run}
          />
          {final ? (
            <div className="workflow-facts">
              <span>MP4 · H.264 / AAC</span>
              <span>完整观看后审核</span>
              <span>两平台共用</span>
            </div>
          ) : (
            <p className="workflow-muted">
              时间轴检查：字幕按实际音频时长分配；请试听校对字幕与画面。
            </p>
          )}
        </>
      ) : (
        <div className="workflow-preview grid place-items-center">
          <span className="workflow-muted">{final ? '等待最终渲染' : '等待合成粗剪'}</span>
        </div>
      )}
      <p className="workflow-muted">
        {final
          ? '复用已审核粗剪的冻结 HyperFrames 工程，以交付质量渲染。'
          : render?.motion
            ? '保留 HTML 元素，用可定位时间的动效合成配音与字幕；修改计划确认后生成新版本。'
            : '此版本由静态截图合成。可提出元素动效修改，生成新版粗剪后重新审核。'}
      </p>
    </div>
  )
}
export function PublishingPanel({
  disabled,
  project,
  platform,
  onPlatform,
  feedback,
  onFeedback,
  canGenerate,
  generating,
  dirty,
  onGenerate,
  value,
  onChange,
  approved,
  run,
}: {
  disabled: boolean
  project: VideoProject
  platform: VideoPlatform
  onPlatform: (platform: VideoPlatform) => void
  feedback: string
  onFeedback: (value: string) => void
  canGenerate: boolean
  generating: boolean
  dirty: boolean
  onGenerate: () => void
  value: PublishPayload
  onChange: (payload: PublishPayload) => void
  approved: boolean
  run: (action: () => Promise<unknown>, message?: string) => void
}) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  return (
    <div className="workflow-section">
      <fieldset disabled={disabled} className="min-w-0">
        <VoiceRadioGroup
          label="发布平台"
          value={platform}
          onChange={(value) => onPlatform(value as VideoPlatform)}
          options={[
            { value: 'bilibili', label: 'Bilibili' },
            { value: 'douyin', label: '抖音' },
          ]}
          compact
        />
      </fieldset>
      {stageValue(project, 'render') && (
        <div className="workflow-publish-asset">
          <img
            src={mediaUrl(project.id, stageValue(project, 'render')!.cover)}
            alt="共用成片封面"
          />
          <div>
            <strong className="text-body-sm">共用成片 · 横版 1920×1080</strong>
            <p className="workflow-muted mt-2">
              {stageValue(project, 'render')!.duration.toFixed(1)} 秒 · Bilibili / 抖音
            </p>
          </div>
        </div>
      )}
      <p className="workflow-muted">
        两平台发布同一份横版成片。先审核发布信息，再导出对应平台发布包；上传成功后回填链接。
      </p>
      <div className="workflow-section">
        {[platform].map((platform) => {
          const metadata = value.platforms[platform],
            records = project.publications.filter((item) => item.platform === platform)
          const update = (changes: Partial<typeof metadata>) =>
            onChange({ platforms: { ...value.platforms, [platform]: { ...metadata, ...changes } } })
          return (
            <div key={platform}>
              <div className="workflow-section">
                <div className="workflow-stage-heading">
                  <div>
                    <h4 className="text-body-sm font-semibold">
                      {platform === 'bilibili' ? 'Bilibili' : '抖音'}发布资料
                    </h4>
                    <p className="workflow-muted mt-2" data-publish-sources>
                      基于内容文案 v{project.stages.copy?.version ?? '—'} · HTML 分镜 v
                      {project.stages.storyboard?.version ?? '—'} · 口播 v
                      {project.stages.narration?.version ?? '—'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    data-publish-generate
                    disabled={!canGenerate}
                    onClick={onGenerate}
                  >
                    {generating
                      ? 'AI 正在生成…'
                      : project.jobs.some(
                            (job) => job.stage === 'publish' && job.state === 'succeeded',
                          )
                        ? 'AI 重新生成发布资料'
                        : 'AI 生成发布资料'}
                  </Button>
                </div>
                <details>
                  <summary className="workflow-muted cursor-pointer">
                    生成偏好与修改要求（选填）
                  </summary>
                  <div className="mt-3">
                    <VoiceTextArea
                      disabled={disabled}
                      label="给 AI 的要求"
                      rows={3}
                      maxLength={5000}
                      value={feedback}
                      onChange={(event) => onFeedback(event.target.value)}
                      placeholder="例如：标题用问题切入，突出 Kotlin 的发展反差；简介更精炼，标签面向开发者。可补充有来源和日期的热点背景。"
                    />
                  </div>
                </details>
                <p className="workflow-muted" role="status" data-publish-status>
                  {generating
                    ? '正在生成当前平台的标题、简介与标签，进度见右侧执行记录；原资料在成功前保留。'
                    : dirty
                      ? '请先保存或放弃未保存修改，再让 AI 生成新版本。'
                      : '每次仅更新当前平台，另一平台保持原值；可反复生成或手动编辑，生成后需重新审核。不自动获取实时热搜。'}
                </p>
                <VoiceInput
                  disabled={disabled}
                  label={`发布标题（最多 ${platform === 'bilibili' ? 80 : 30} 字）`}
                  value={metadata.title}
                  onChange={(event) => update({ title: event.target.value })}
                  maxLength={platform === 'bilibili' ? 80 : 30}
                />
                <VoiceTextArea
                  disabled={disabled}
                  label="发布简介"
                  maxLength={2000}
                  value={metadata.description}
                  onChange={(event) => update({ description: event.target.value })}
                />
                <VoiceInput
                  disabled={disabled}
                  label="标签（用逗号分隔）"
                  value={metadata.tags.join(',')}
                  onChange={(event) =>
                    update({
                      tags: event.target.value.split(/[,，]/),
                    })
                  }
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!approved}
                  onClick={() =>
                    run(
                      () => workflowCall('export', project.id, platform),
                      '发布包已导出，请手动上传并回填链接',
                    )
                  }
                >
                  导出{platform === 'bilibili' ? ' Bilibili ' : '抖音'}发布包
                </Button>
                {records.map((record) => (
                  <div key={record.id} className="workflow-divider space-y-3">
                    <div className="workflow-toolbar">
                      <span className="workflow-muted">
                        {new Date(record.createdAt).toLocaleString()} ·{' '}
                        {record.url ? '已回填（人工记录）' : '待上传 / 回填'}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          run(() => workflowCall('revealExport', project.id, record.id))
                        }
                      >
                        打开发布包
                      </Button>
                    </div>
                    <VoiceInput
                      label="平台发布链接"
                      type="url"
                      value={urls[record.id] ?? record.url ?? ''}
                      onChange={(event) => setUrls({ ...urls, [record.id]: event.target.value })}
                      placeholder={
                        platform === 'bilibili'
                          ? 'https://www.bilibili.com/video/…'
                          : 'https://www.douyin.com/video/…'
                      }
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!(urls[record.id] ?? record.url)}
                      onClick={() =>
                        run(
                          () =>
                            workflowCall(
                              'receipt',
                              project.id,
                              record.id,
                              urls[record.id] ?? record.url,
                            ),
                          '已保存人工发布记录',
                        )
                      }
                    >
                      保存发布链接
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
