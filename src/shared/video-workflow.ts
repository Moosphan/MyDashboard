import type { VoiceRequest } from './voiceover'

export const VIDEO_STAGES = [
  'brief',
  'copy',
  'storyboard',
  'narration',
  'audio',
  'roughcut',
  'render',
  'publish',
] as const
export type VideoStage = (typeof VIDEO_STAGES)[number]
export const VIDEO_STAGE_LABELS: Record<VideoStage, string> = {
  brief: '创作简报',
  copy: '内容文案',
  storyboard: 'HTML 分镜',
  narration: '口播定稿',
  audio: '分段配音',
  roughcut: '动态粗剪',
  render: '正式成片',
  publish: '平台发布',
}
export const SCENE_LAYOUTS = ['title', 'split', 'steps', 'comparison', 'quote', 'summary'] as const
export type SceneLayout = (typeof SCENE_LAYOUTS)[number]
export const TEMPLATE_FAMILIES = [
  { id: 'technical', name: '技术讲解', description: '深色画布 · 代码与步骤 · 左右对照' },
  { id: 'editorial', name: '知识编辑部', description: '浅色画布 · 大字引言 · 分栏与知识卡' },
  { id: 'product', name: '产品叙事', description: '品牌色画布 · 功能分解 · 前后对比' },
] as const
export interface WorkflowFile {
  id: string
  path: string
  sha256: string
  size: number
  mime: string
}
export interface StoryScene {
  id: string
  title: string
  body: string
  layout: SceneLayout
  html?: string
}
export interface StoryboardPayload {
  mode: 'template' | 'agent'
  template: string
  referenceText?: string
  references?: string[]
  referenceFile?: WorkflowFile
  referenceSnapshots?: WorkflowFile[]
  styleTemplateId?: string
  scenes: StoryScene[]
}
export type WorkflowVoice = Omit<VoiceRequest, 'text' | 'clientRequestId'>
export interface AudioTrack {
  sceneId: string
  file: WorkflowFile
  duration: number
  text: string
}
export interface AudioProgress {
  tracks: AudioTrack[]
  total: number
  regeneratingTrackId?: string
}
export interface AudioPayload {
  tracks: AudioTrack[]
  file: WorkflowFile
  subtitles: WorkflowFile
  duration: number
  voice?: WorkflowVoice
}
export interface RenderPayload {
  file: WorkflowFile
  duration: number
  width: number
  height: number
  compositionFiles: WorkflowFile[]
  compositionNames: string[]
  manifestHash: string
  checks: string
  cover: WorkflowFile
  motion?: MotionPlan
  sourceStoryboard?: string
  sourceAudio?: string
  sourceNarration?: string
}
export interface MotionFrame {
  opacity?: number
  translate?: string
  scale?: number
  rotate?: string
}
export interface MotionEffect {
  selector: string
  start: number
  duration: number
  keyframes: MotionFrame[]
  easing?: string
  iterations?: number
  direction?: 'normal' | 'alternate'
}
export const MOTION_TRANSITIONS = {
  cut: '直接切换',
  crossfade: '叠化',
  'slide-left': '横向推移',
  'slide-up': '纵向推移',
  'wipe-left': '擦除',
} as const
export interface MotionTransition {
  type: keyof typeof MOTION_TRANSITIONS
  duration: number
}
export interface MotionPlan {
  summary: string
  feedback: string
  at: number
  sceneId?: string
  scenes: { sceneId: string; effects: MotionEffect[]; transition?: MotionTransition }[]
}
export interface VideoStyleTemplate {
  id: string
  name: string
  description: string
  version: number
  sourceProjectId: string
  sourceRevisionId: string
  createdAt: string
  storyboard: StoryboardPayload
  motion?: MotionPlan
  cover: WorkflowFile
}
export type VideoPlatform = 'bilibili' | 'douyin'
export interface PublicationGeneration {
  platform: VideoPlatform
  feedback?: string
}
export interface PlatformMetadata {
  title: string
  description: string
  tags: string[]
}
export interface PublishPayload {
  platforms: Record<VideoPlatform, PlatformMetadata>
}
export interface StagePayloads {
  brief: { text: string; duration: number; audience?: string; references?: string }
  copy: { text: string }
  storyboard: StoryboardPayload
  narration: { scenes: { id: string; text: string; pronunciation?: string }[] }
  audio: AudioPayload
  roughcut: RenderPayload
  render: RenderPayload
  publish: PublishPayload
}
export interface WorkflowRevision {
  id: string
  stage: VideoStage
  version: number
  payload: StagePayloads[VideoStage]
  dependencies: string
  createdAt: string
  status: 'review' | 'approved' | 'stale'
  approvedAt: string | null
  note: string
}
export interface WorkflowJob {
  id: string
  projectId: string
  stage: VideoStage
  requestId: string
  expectedRevision: number
  executor: string
  state: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted' | 'stale'
  phase: string
  error: string | null
  audioProgress?: AudioProgress
  kind?: 'generation' | 'motion-plan'
  motionPlan?: MotionPlan
  createdAt: string
  updatedAt: string
}
export interface PublicationRecord {
  id: string
  platform: VideoPlatform
  revisionId: string
  metadata: PlatformMetadata
  exportPath: string
  url: string | null
  createdAt: string
  publishedAt: string | null
}
export interface VideoProject {
  id: string
  title: string
  revision: number
  archived: boolean
  createdAt: string
  updatedAt: string
  stages: Partial<Record<VideoStage, WorkflowRevision>>
  history: WorkflowRevision[]
  jobs: WorkflowJob[]
  publications: PublicationRecord[]
}
export interface WorkflowRuntime {
  nodePath: string
  codexPath: string
  claudePath: string
  hyperframesPath: string
  ffmpegPath: string
  ffprobePath: string
}
export function stageValue<Stage extends VideoStage>(
  project: VideoProject,
  stage: Stage,
): StagePayloads[Stage] | undefined {
  return project.stages[stage]?.payload as StagePayloads[Stage] | undefined
}
export function stageUnlocked(project: VideoProject, stage: VideoStage) {
  return (
    !project.archived &&
    VIDEO_STAGES.slice(0, VIDEO_STAGES.indexOf(stage)).every(
      (item) => project.stages[item]?.status === 'approved',
    )
  )
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效内容格式')
  return value as Record<string, unknown>
}
function text(value: unknown, name: string, maximum = 30000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw new Error(`${name}不能为空，最多 ${maximum} 字符`)
  return value.trim()
}
function optionalText(value: unknown, name: string, maximum: number): string | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || value.length > maximum)
    throw new Error(`${name}最多 ${maximum} 字符`)
  return value.trim() || undefined
}
function file(value: unknown): WorkflowFile {
  const input = record(value)
  if (
    typeof input.id !== 'string' ||
    typeof input.path !== 'string' ||
    !/^media\/video-workflow\/[a-zA-Z0-9/-]+\.[a-z0-9]+$/.test(input.path) ||
    typeof input.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.sha256) ||
    typeof input.size !== 'number' ||
    input.size <= 0 ||
    typeof input.mime !== 'string'
  )
    throw new Error('无效受管文件')
  return {
    id: input.id,
    path: input.path,
    sha256: input.sha256,
    size: input.size,
    mime: input.mime,
  }
}
function seconds(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 300)
    throw new Error('视频时长必须为 0–300 秒')
  return value
}
export function validatePayload<Stage extends VideoStage>(
  stage: Stage,
  value: unknown,
): StagePayloads[Stage] {
  if (!VIDEO_STAGES.includes(stage)) throw new Error('未知工作流阶段')
  const input = record(value)
  let output: StagePayloads[VideoStage]
  if (stage === 'brief')
    output = {
      text: text(input.text, '简报'),
      duration: seconds(input.duration),
      audience: optionalText(input.audience, '目标受众', 500),
      references: optionalText(input.references, '参考资料', 15000),
    }
  else if (stage === 'copy') output = { text: text(input.text, '文案') }
  else if (stage === 'storyboard' || stage === 'narration') {
    if (!Array.isArray(input.scenes) || !input.scenes.length || input.scenes.length > 60)
      throw new Error('需要 1–60 个分镜')
    const seen = new Set<string>()
    const scenes = input.scenes.map((value) => {
      const scene = record(value)
      const id = text(scene.id, '分镜 ID', 80)
      if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('无效分镜 ID')
      if (seen.has(id)) throw new Error('分镜 ID 重复')
      seen.add(id)
      if (stage === 'narration')
        return {
          id,
          text: text(scene.text, '逐镜口播', 5000),
          pronunciation: optionalText(scene.pronunciation, '读音与停顿', 2000),
        }
      if (!SCENE_LAYOUTS.includes(scene.layout as SceneLayout)) throw new Error('未知分镜布局')
      return {
        id,
        title: text(scene.title, '分镜标题', 200),
        body: text(scene.body, '分镜正文', 6000),
        layout: scene.layout as SceneLayout,
        ...(scene.html ? { html: text(scene.html, 'HTML', 200000) } : {}),
      }
    })
    if (stage === 'narration') output = { scenes } as StagePayloads['narration']
    else {
      if (
        !['template', 'agent'].includes(String(input.mode)) ||
        !TEMPLATE_FAMILIES.some((item) => item.id === input.template)
      )
        throw new Error('请选择创作方式和视觉模板族')
      if (input.styleTemplateId && input.mode !== 'agent')
        throw new Error('已保存风格模板需由本地 Agent 结合新内容套用')
      const rawReferences = input.references ?? []
      if (!Array.isArray(rawReferences) || rawReferences.some((value) => typeof value !== 'string'))
        throw new Error('参考链接格式无效')
      const references = (rawReferences as string[]).map((value) => value.trim()).filter(Boolean)
      if (
        references.length > 8 ||
        references.some((value) => value.length > 2000 || !/^https?:\/\//i.test(value))
      )
        throw new Error('参考链接仅支持 http/https，最多 8 条')
      if (typeof input.referenceText === 'string' && input.referenceText.length > 15000)
        throw new Error('参考描述最多 15000 字符')
      output = {
        mode: input.mode as 'template' | 'agent',
        template: String(input.template),
        references: references as string[],
        referenceText: typeof input.referenceText === 'string' ? input.referenceText : '',
        ...(input.styleTemplateId
          ? { styleTemplateId: text(input.styleTemplateId, '风格模板', 80) }
          : {}),
        ...(input.referenceFile ? { referenceFile: file(input.referenceFile) } : {}),
        ...(Array.isArray(input.referenceSnapshots)
          ? { referenceSnapshots: input.referenceSnapshots.map(file) }
          : {}),
        scenes: scenes as StoryScene[],
      }
    }
  } else if (stage === 'audio') {
    if (!Array.isArray(input.tracks) || !input.tracks.length || input.tracks.length > 600)
      throw new Error('缺少音轨')
    output = {
      file: file(input.file),
      subtitles: file(input.subtitles),
      duration: seconds(input.duration),
      tracks: input.tracks.map((value) => {
        const track = record(value)
        return {
          sceneId: text(track.sceneId, '分镜 ID', 80),
          text: text(track.text, '字幕'),
          file: file(track.file),
          duration: seconds(track.duration),
        }
      }),
      ...(input.voice ? { voice: input.voice as WorkflowVoice } : {}),
    }
  } else if (stage === 'roughcut' || stage === 'render') {
    if (
      !Array.isArray(input.compositionFiles) ||
      !input.compositionFiles.length ||
      input.width !== 1920 ||
      input.height !== 1080
    )
      throw new Error('缺少冻结的 1920×1080 合成工程')
    if (
      !Array.isArray(input.compositionNames) ||
      input.compositionNames.length !== input.compositionFiles.length ||
      input.compositionNames.some(
        (name) => typeof name !== 'string' || !/^[a-z0-9-]+\.(html|png|wav|json)$/.test(name),
      )
    )
      throw new Error('无效冻结工程文件名')
    output = {
      file: file(input.file),
      cover: file(input.cover),
      duration: seconds(input.duration),
      width: 1920,
      height: 1080,
      compositionFiles: input.compositionFiles.map(file),
      compositionNames: input.compositionNames as string[],
      manifestHash: text(input.manifestHash, '工程指纹', 64),
      checks: text(input.checks, '合成检查', 20000),
      ...(input.motion ? { motion: input.motion as MotionPlan } : {}),
      ...(input.sourceStoryboard
        ? { sourceStoryboard: text(input.sourceStoryboard, '来源分镜', 80) }
        : {}),
      ...(input.sourceAudio ? { sourceAudio: text(input.sourceAudio, '来源配音', 80) } : {}),
      ...(input.sourceNarration
        ? { sourceNarration: text(input.sourceNarration, '来源口播', 80) }
        : {}),
    }
  } else {
    const platforms = record(input.platforms)
    const metadata = (platform: VideoPlatform): PlatformMetadata => {
      const item = record(platforms[platform])
      if (!Array.isArray(item.tags) || item.tags.some((tag) => typeof tag !== 'string'))
        throw new Error('标签格式无效')
      const tags = (item.tags as string[]).map((tag) => tag.trim()).filter(Boolean)
      if (tags.length > 10 || tags.some((tag) => tag.length > 30))
        throw new Error('标签最多 10 个，每个最多 30 字')
      if (typeof item.description === 'string' && item.description.length > 2000)
        throw new Error('发布简介最多 2000 字符')
      return {
        title: text(item.title, '发布标题', platform === 'douyin' ? 30 : 80),
        description: typeof item.description === 'string' ? item.description : '',
        tags,
      }
    }
    output = { platforms: { bilibili: metadata('bilibili'), douyin: metadata('douyin') } }
  }
  return output as StagePayloads[Stage]
}

export function validateMotionPlan(
  value: unknown,
  scenes: { id: string; duration: number }[],
): MotionPlan {
  const input = record(value)
  if (!Array.isArray(input.scenes) || !input.scenes.length || input.scenes.length > 60)
    throw new Error('动效计划需要分镜')
  const seen = new Set<string>()
  const planned = input.scenes.map((value) => {
    const scene = record(value)
    const sceneIndex = scenes.findIndex((item) => item.id === scene.sceneId)
    const duration = scenes[sceneIndex]?.duration
    if (!duration || seen.has(String(scene.sceneId))) throw new Error('动效分镜不存在或重复')
    seen.add(String(scene.sceneId))
    if (!Array.isArray(scene.effects) || !scene.effects.length || scene.effects.length > 80)
      throw new Error('每镜需要 1–80 项动效')
    const effects = scene.effects.map((value): MotionEffect => {
      const effect = record(value)
      const selector = text(effect.selector, '元素选择器', 250)
      if (
        /\p{Cc}/u.test(selector) ||
        /(?:^|[ >+~,(])(html|body|script|style|iframe)(?:$|[ >+~,.#[:)])/i.test(selector)
      )
        throw new Error(
          `分镜「${scene.sceneId}」的动效选择器「${selector}」不能选择根节点或脚本元素`,
        )
      const start = effect.start,
        length = effect.duration,
        iterations = effect.iterations ?? 1
      if (
        typeof start !== 'number' ||
        !Number.isFinite(start) ||
        start < 0 ||
        typeof length !== 'number' ||
        !Number.isFinite(length) ||
        length <= 0 ||
        typeof iterations !== 'number' ||
        !Number.isInteger(iterations) ||
        iterations < 1 ||
        iterations > 100 ||
        start + length * iterations > duration + 0.001
      )
        throw new Error('动效时间必须位于当前分镜内，循环次数必须有限')
      if (
        !Array.isArray(effect.keyframes) ||
        effect.keyframes.length < 2 ||
        effect.keyframes.length > 20
      )
        throw new Error('动效需要 2–20 个关键帧')
      const keyframes = effect.keyframes.map((value): MotionFrame => {
        const frame = record(value)
        if (
          !Object.keys(frame).length ||
          Object.keys(frame).some(
            (key) => !['opacity', 'translate', 'scale', 'rotate'].includes(key),
          )
        )
          throw new Error('动效只支持透明度、位移、缩放和旋转，不执行代码')
        const result: MotionFrame = {}
        for (const [key, current] of Object.entries(frame)) {
          if (key === 'opacity' || key === 'scale') {
            if (
              typeof current !== 'number' ||
              !Number.isFinite(current) ||
              current < 0 ||
              current > (key === 'opacity' ? 1 : 4)
            )
              throw new Error('无效动效数值')
          } else if (
            typeof current !== 'string' ||
            !(
              key === 'translate' ? /^-?\d+(?:\.\d+)?px -?\d+(?:\.\d+)?px$/ : /^-?\d+(?:\.\d+)?deg$/
            ).test(current)
          )
            throw new Error('无效动效单位')
          Object.assign(result, { [key]: current })
        }
        return result
      })
      const easing = effect.easing ?? 'ease-out'
      if (!['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'].includes(String(easing)))
        throw new Error('无效缓动曲线')
      if (
        effect.direction !== undefined &&
        !['normal', 'alternate'].includes(String(effect.direction))
      )
        throw new Error('无效循环方向')
      return {
        selector,
        start,
        duration: length,
        keyframes,
        easing: String(easing),
        iterations,
        direction: effect.direction === 'alternate' ? 'alternate' : 'normal',
      }
    })
    let transition: MotionTransition | undefined
    if (scene.transition !== undefined) {
      const current = record(scene.transition)
      if (typeof current.type !== 'string' || !Object.hasOwn(MOTION_TRANSITIONS, current.type))
        throw new Error('不支持的镜间转场')
      if (sceneIndex === 0 && current.type !== 'cut')
        throw new Error('首镜没有前一镜，不能设置镜间转场')
      if (
        typeof current.duration !== 'number' ||
        !Number.isFinite(current.duration) ||
        (current.type === 'cut'
          ? current.duration !== 0
          : current.duration <= 0 ||
            current.duration >
              Math.min(1.5, duration / 2, (scenes[sceneIndex - 1]?.duration ?? 0) / 2))
      )
        throw new Error(
          '转场时长必须大于 0，且不超过 1.5 秒及相邻两镜各自时长的一半；直接切换为 0 秒',
        )
      transition = { type: current.type as MotionTransition['type'], duration: current.duration }
    }
    return { sceneId: String(scene.sceneId), effects, ...(transition ? { transition } : {}) }
  })
  if (typeof input.at !== 'number' || !Number.isFinite(input.at) || input.at < 0 || input.at > 300)
    throw new Error('无效修改时间')
  const sceneId = optionalText(input.sceneId, '指定分镜', 80)
  if (sceneId && (planned.length !== 1 || planned[0].sceneId !== sceneId))
    throw new Error('单镜修改只能包含指定分镜')
  return {
    summary: text(input.summary, '修改计划', 3000),
    feedback: text(input.feedback, '修改意见', 5000),
    at: input.at,
    ...(sceneId ? { sceneId } : {}),
    scenes: planned,
  }
}

export function splitNarration(value: string): string[] {
  const characters = Array.from(value)
  const chunks: string[] = []
  let offset = 0
  while (offset < characters.length) {
    let end = Math.min(offset + 300, characters.length)
    if (end < characters.length) {
      const boundary = characters
        .slice(offset, end)
        .join('')
        .search(/[。！？.!?\n][^。！？.!?\n]*$/)
      if (boundary >= 100)
        end =
          offset +
          Array.from(
            characters
              .slice(offset, end)
              .join('')
              .slice(0, boundary + 1),
          ).length
    }
    const chunk = characters.slice(offset, end).join('')
    if (chunk.trim()) chunks.push(chunk)
    offset = end
  }
  return chunks
}
