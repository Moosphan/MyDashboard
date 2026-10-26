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
export const BASE_SCENE_LAYOUTS = [
  'title',
  'split',
  'steps',
  'comparison',
  'quote',
  'summary',
] as const
export const SCENE_LAYOUTS = [
  ...BASE_SCENE_LAYOUTS,
  'map',
  'relations',
  'artifact',
  'chapter',
] as const
export type SceneLayout = (typeof SCENE_LAYOUTS)[number]
export function sceneLayoutsForTemplate(template: string): readonly SceneLayout[] {
  return template === 'history' ? SCENE_LAYOUTS : BASE_SCENE_LAYOUTS
}
export const TEMPLATE_FAMILIES = [
  { id: 'technical', name: '技术讲解', description: '深色画布 · 代码与步骤 · 左右对照' },
  { id: 'editorial', name: '知识编辑部', description: '浅色画布 · 大字引言 · 分栏与知识卡' },
  { id: 'product', name: '产品叙事', description: '品牌色画布 · 功能分解 · 前后对比' },
  {
    id: 'history',
    name: '史笺 · 历史文化',
    description: '牛皮纸 · 宋体与朱砂 · 十种历史叙事版式',
  },
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
  requirements?: string
  motion?: StoryboardSceneMotion
  materialFallback?: { acceptedAt: string; blockers: string[] }
}
export interface StoryboardSceneMotion {
  summary: string
  effects: MotionEffect[]
  blockers: string[]
  notes?: string[]
}
export interface StoryboardPayload {
  mode: 'template' | 'agent'
  template: string
  referenceText?: string
  references?: string[]
  referenceFile?: WorkflowFile
  referenceSnapshots?: WorkflowFile[]
  styleTemplateId?: string
  motionPolicy?: { enabled: boolean; excludedSceneIds: string[] }
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
export type RenderMusicSource = 'local' | 'openverse'
export interface MusicSearchResult {
  id: string
  title: string
  author: string
  license: string
  licenseUrl?: string
  sourceUrl: string
  downloadUrl: string
  duration?: number
}
export interface RenderMusic {
  file: WorkflowFile
  title: string
  source: RenderMusicSource
  sourceUrl?: string
  license?: string
  author?: string
  start: number
  duration: number
  volume: number
  playbackRate: number
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
  music?: RenderMusic
  motion?: MotionPlan
  sourceStoryboard?: string
  sourceAudio?: string
  sourceNarration?: string
  sourceRoughcut?: string
  renderProfile?: { quality: 'looks' | 'delivery'; fps: 30 }
}
export interface MotionFrame {
  opacity?: number
  translate?: string
  scale?: number
  scaleX?: number
  scaleY?: number
  rotate?: string
}
export const MOTION_CAPABILITIES =
  'opacity(0–1)、translate("0px 20px")、scale(0–4)、scaleX(0–4)、scaleY(0–4)、rotate("10deg")；scale 为等比缩放，scaleX/scaleY 为方向缩放，不在同一关键帧混用。横线展开用 scaleX，柱形增长用 scaleY，缩放原点由 HTML transform-origin 设置。'
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
export interface PublicationCover {
  file: WorkflowFile
  feedFile: WorkflowFile
  designFile?: WorkflowFile
  sourceRenderId: string
  method: 'code' | 'image2'
  createdAt: string
  feedback: string
  width: 1600
  height: 900
  feedWidth: 1600
  feedHeight: 1200
}
export interface CoverGeneration {
  method: PublicationCover['method']
  feedback?: string
}
export interface PlatformMetadata {
  title: string
  description: string
  tags: string[]
  submission?: PublicationSubmission
  cover?: PublicationCover
}
export interface PublicationSubmission {
  category: string
  categoryName: string
  visibility: 'public' | 'private' | ''
  copyright: 'original' | 'repost' | ''
  source: string
}
export interface PublishPayload {
  platforms: Record<VideoPlatform, PlatformMetadata>
}
export interface StagePayloads {
  brief: { text: string; duration: number; audience?: string; references?: string }
  copy: { text: string; requirements?: string }
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
export interface WorkflowOperation {
  action:
    | 'scene-edit'
    | 'scene-generate'
    | 'reuse-narration'
    | 'reuse-audio'
    | 'reuse-roughcut'
    | 'accept-illustration'
    | 'generate-cover'
  sceneId?: string
  sceneTitle?: string
  sceneNumber?: number
  feedback?: string
  sourceVersion?: number
  resultVersion?: number
  changes?: { sceneId: string; title: string; field: string; before: string; after: string }[]
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
  operation?: WorkflowOperation
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
  catbusPath?: string
  codexPath: string
  claudePath: string
  hyperframesPath: string
  ffmpegPath: string
  ffprobePath: string
  image2Path?: string
  bunPath?: string
}
export function stageValue<Stage extends VideoStage>(
  project: VideoProject,
  stage: Stage,
): StagePayloads[Stage] | undefined {
  return project.stages[stage]?.payload as StagePayloads[Stage] | undefined
}
export function renderSourceProject(
  project: VideoProject,
  render = stageValue(project, 'roughcut'),
): VideoProject {
  if (!render) return project
  const stages = { ...project.stages }
  const sources = [
    ['storyboard', render.sourceStoryboard],
    ['narration', render.sourceNarration],
    ['audio', render.sourceAudio],
  ] as const
  for (const [stage, id] of sources) {
    if (!id) continue
    const source =
      project.history.find((item) => item.id === id && item.stage === stage) ??
      (project.stages[stage]?.id === id ? project.stages[stage] : undefined)
    if (!source) throw new Error('预览视频的来源分镜、口播或配音版本不存在，请恢复来源版本后重试')
    stages[stage] = source
  }
  return { ...project, stages }
}
export function stageUnlocked(project: VideoProject, stage: VideoStage) {
  return (
    !project.archived &&
    VIDEO_STAGES.slice(0, VIDEO_STAGES.indexOf(stage)).every(
      (item) => project.stages[item]?.status === 'approved',
    )
  )
}

export function audioSourceRevisions(project: VideoProject, revision: WorkflowRevision) {
  if (revision.stage !== 'audio') return undefined
  const index = project.history.findIndex((item) => item.id === revision.id)
  if (index < 0) return undefined
  const earlier = project.history.slice(index + 1)
  const inputs = VIDEO_STAGES.slice(0, VIDEO_STAGES.indexOf('audio')).map((stage) =>
    earlier.find((item) => item.stage === stage),
  )
  return inputs.every((item): item is WorkflowRevision => Boolean(item)) ? inputs : undefined
}

export function canReuseAudio(project: VideoProject, revision: WorkflowRevision | undefined) {
  if (!revision || !stageUnlocked(project, 'audio')) return false
  const inputs = audioSourceRevisions(project, revision)
  const source = inputs?.find((item) => item.stage === 'narration')?.payload as
    | StagePayloads['narration']
    | undefined
  const current = stageValue(project, 'narration')
  const signature = (payload: StagePayloads['narration']) =>
    JSON.stringify(
      payload.scenes.map((scene) => ({
        id: scene.id,
        text: scene.text,
        pronunciation: scene.pronunciation ?? '',
      })),
    )
  return Boolean(source && current && signature(source) === signature(current))
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
export function validateRenderMusic(value: unknown): RenderMusic {
  const input = record(value)
  const source = input.source
  if (source !== 'local' && source !== 'openverse') throw new Error('配乐来源无效')
  const title = text(input.title, '配乐名称', 300)
  const start = input.start
  const duration = input.duration
  const volume = input.volume
  const playbackRate = input.playbackRate
  if (typeof start !== 'number' || !Number.isFinite(start) || start < 0 || start > 300)
    throw new Error('配乐起始时间必须为 0–300 秒')
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > 300)
    throw new Error('配乐时长必须为 0–300 秒')
  if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 1)
    throw new Error('配乐音量必须为 0–100%')
  if (
    typeof playbackRate !== 'number' ||
    !Number.isFinite(playbackRate) ||
    playbackRate < 0.5 ||
    playbackRate > 2
  )
    throw new Error('配乐速度必须为 0.5–2 倍')
  if (
    source === 'openverse' &&
    (typeof input.sourceUrl !== 'string' || !/^https:\/\//i.test(input.sourceUrl))
  )
    throw new Error('在线配乐必须保留 HTTPS 来源链接')
  return {
    file: file(input.file),
    title,
    source,
    ...(input.sourceUrl !== undefined
      ? { sourceUrl: text(input.sourceUrl, '配乐来源链接', 2000) }
      : {}),
    ...(input.license !== undefined ? { license: text(input.license, '配乐许可证', 300) } : {}),
    ...(input.author !== undefined ? { author: text(input.author, '配乐作者', 300) } : {}),
    start,
    duration,
    volume,
    playbackRate,
  }
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
  else if (stage === 'copy')
    output = {
      text: text(input.text, '文案'),
      ...(input.requirements ? { requirements: text(input.requirements, '创作要求', 30000) } : {}),
    }
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
        ...(scene.requirements
          ? { requirements: text(scene.requirements, '分镜修改要求', 30000) }
          : {}),
        ...(scene.motion ? { motion: validateStoryboardSceneMotion(id, scene.motion) } : {}),
        ...(scene.materialFallback
          ? { materialFallback: validateMaterialFallback(scene.materialFallback, scene.motion) }
          : {}),
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
      let motionPolicy: StoryboardPayload['motionPolicy']
      if (input.motionPolicy !== undefined) {
        const policy = record(input.motionPolicy)
        if (
          typeof policy.enabled !== 'boolean' ||
          !Array.isArray(policy.excludedSceneIds) ||
          policy.excludedSceneIds.length > 60 ||
          policy.excludedSceneIds.some(
            (id) => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id),
          )
        )
          throw new Error('MG 开关或排除分镜格式无效')
        motionPolicy = {
          enabled: policy.enabled,
          excludedSceneIds: [...new Set(policy.excludedSceneIds as string[])],
        }
      }
      output = {
        mode: input.mode as 'template' | 'agent',
        template: String(input.template),
        references: references as string[],
        referenceText: typeof input.referenceText === 'string' ? input.referenceText : '',
        ...(motionPolicy ? { motionPolicy } : {}),
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
    const profile = input.renderProfile === undefined ? undefined : record(input.renderProfile)
    if (profile && (!['looks', 'delivery'].includes(String(profile.quality)) || profile.fps !== 30))
      throw new Error('无效渲染参数')
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
        (name) =>
          typeof name !== 'string' ||
          !/^[a-z0-9-]+\.(html|png|wav|mp3|m4a|ogg|flac|json)$/.test(name),
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
      ...(input.music !== undefined ? { music: validateRenderMusic(input.music) } : {}),
      ...(profile
        ? { renderProfile: { quality: profile.quality as 'looks' | 'delivery', fps: 30 as const } }
        : {}),
      ...(input.sourceRoughcut
        ? { sourceRoughcut: text(input.sourceRoughcut, '来源粗剪', 80) }
        : {}),
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
      let submission: PublicationSubmission | undefined
      if (item.submission !== undefined) {
        const settings = record(item.submission)
        if (
          typeof settings.category !== 'string' ||
          (settings.category !== '' && !/^\d{1,12}$/.test(settings.category)) ||
          typeof settings.categoryName !== 'string' ||
          settings.categoryName.length > 200
        )
          throw new Error('投稿分区格式无效')
        if (
          typeof settings.visibility !== 'string' ||
          !['', 'public', 'private'].includes(settings.visibility)
        )
          throw new Error('投稿可见性无效')
        if (
          typeof settings.copyright !== 'string' ||
          !['', 'original', 'repost'].includes(settings.copyright)
        )
          throw new Error('投稿类型无效')
        if (
          typeof settings.source !== 'string' ||
          settings.source.length > 2000 ||
          (settings.copyright === 'repost' && !settings.source.trim())
        )
          throw new Error('转载必须填写真实来源，最多 2000 字符')
        submission = {
          category: settings.category,
          categoryName: settings.categoryName.trim(),
          visibility: settings.visibility as PublicationSubmission['visibility'],
          copyright: settings.copyright as PublicationSubmission['copyright'],
          source: settings.source.trim(),
        }
      }
      return {
        title: text(item.title, '发布标题', platform === 'douyin' ? 30 : 80),
        description: typeof item.description === 'string' ? item.description : '',
        tags,
        ...(submission ? { submission } : {}),
        ...(item.cover !== undefined ? { cover: validatePublicationCover(item.cover) } : {}),
      }
    }
    output = { platforms: { bilibili: metadata('bilibili'), douyin: metadata('douyin') } }
  }
  return output as StagePayloads[Stage]
}

export function validatePublicationCover(value: unknown): PublicationCover {
  const input = record(value)
  if (
    !['code', 'image2'].includes(String(input.method)) ||
    input.width !== 1600 ||
    input.height !== 900 ||
    input.feedWidth !== 1600 ||
    input.feedHeight !== 1200 ||
    typeof input.sourceRenderId !== 'string' ||
    !input.sourceRenderId.trim() ||
    input.sourceRenderId.length > 80 ||
    typeof input.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(input.createdAt)) ||
    typeof input.feedback !== 'string' ||
    input.feedback.length > 5000
  )
    throw new Error('封面参数无效，请重新生成')
  const checkedFile = (value: unknown) => {
    const checked = file(value)
    if (checked.mime !== 'image/png' || checked.size > 4 * 1024 * 1024)
      throw new Error('封面必须是 4 MiB 以内的 PNG 图片')
    return checked
  }
  const designFile = input.designFile === undefined ? undefined : file(input.designFile)
  if (designFile && (designFile.mime !== 'application/json' || designFile.size > 1024 * 1024))
    throw new Error('封面设计源文件无效')
  return {
    file: checkedFile(input.file),
    feedFile: checkedFile(input.feedFile),
    ...(designFile ? { designFile } : {}),
    sourceRenderId: input.sourceRenderId,
    method: input.method as PublicationCover['method'],
    createdAt: input.createdAt,
    feedback: input.feedback,
    width: 1600,
    height: 900,
    feedWidth: 1600,
    feedHeight: 1200,
  }
}

export function validateMotionPlan(
  value: unknown,
  scenes: { id: string; duration: number }[],
  options: { allowEmpty?: boolean } = {},
): MotionPlan {
  const input = record(value)
  if (
    !Array.isArray(input.scenes) ||
    (!input.scenes.length && !options.allowEmpty) ||
    input.scenes.length > 60
  )
    throw new Error('动效计划需要分镜')
  const seen = new Set<string>()
  const planned = input.scenes.map((value) => {
    const scene = record(value)
    const sceneIndex = scenes.findIndex((item) => item.id === scene.sceneId)
    const duration = scenes[sceneIndex]?.duration
    if (!duration || seen.has(String(scene.sceneId))) throw new Error('动效分镜不存在或重复')
    seen.add(String(scene.sceneId))
    if (
      !Array.isArray(scene.effects) ||
      (!scene.effects.length && !options.allowEmpty) ||
      scene.effects.length > 80
    )
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
            (key) => !['opacity', 'translate', 'scale', 'scaleX', 'scaleY', 'rotate'].includes(key),
          )
        )
          throw new Error('动效只支持透明度、位移、缩放和旋转，不执行代码')
        if (frame.scale !== undefined && (frame.scaleX !== undefined || frame.scaleY !== undefined))
          throw new Error('等比缩放与方向缩放不能在同一关键帧混用')
        const result: MotionFrame = {}
        for (const [key, current] of Object.entries(frame)) {
          if (key === 'opacity' || key === 'scale' || key === 'scaleX' || key === 'scaleY') {
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
      if (
        !(['opacity', 'translate', 'scale', 'scaleX', 'scaleY', 'rotate'] as const).some(
          (property) => {
            const values = keyframes
              .map((frame) => frame[property])
              .filter((value) => value !== undefined)
            return new Set(values).size > 1
          },
        )
      )
        throw new Error('动效关键帧没有实际变化，请重新生成有效动效')
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

function validateStoryboardSceneMotion(id: string, value: unknown): StoryboardSceneMotion {
  const motion = record(value)
  const summary = text(motion.summary, '分镜动效说明', 1500)
  if (!Array.isArray(motion.blockers) || motion.blockers.length > 20)
    throw new Error('请提供动效与素材缺口列表，已完成时填空数组')
  const blockers = motion.blockers.map((value) => text(value, '动效或素材缺口', 1000))
  if (motion.notes !== undefined && (!Array.isArray(motion.notes) || motion.notes.length > 20))
    throw new Error('分镜说明须为不超过 20 项的列表')
  const notes = (motion.notes as unknown[] | undefined)?.map((value) =>
    text(value, '分镜说明', 1000),
  )
  if (!Array.isArray(motion.effects)) throw new Error('缺少结构化分镜动效')
  const effects =
    motion.effects.length || !blockers.length
      ? validateMotionPlan(
          { summary, feedback: summary, at: 0, scenes: [{ sceneId: id, effects: motion.effects }] },
          [{ id, duration: 1 }],
        ).scenes[0].effects
      : []
  return { summary, effects, blockers, ...(notes?.length ? { notes } : {}) }
}

export function sceneMotionEnabled(storyboard: StoryboardPayload, sceneId: string) {
  return (
    !storyboard.motionPolicy ||
    (storyboard.motionPolicy.enabled && !storyboard.motionPolicy.excludedSceneIds.includes(sceneId))
  )
}

export function storyboardMotionReadiness(storyboard: StoryboardPayload) {
  const included = storyboard.scenes.filter((scene) => sceneMotionEnabled(storyboard, scene.id))
  return {
    total: storyboard.scenes.length,
    planned: included.filter(
      (scene) => scene.motion && !sceneBlockers(scene).length && scene.motion.effects.length,
    ).length,
    unplanned: included.filter((scene) => !scene.motion).map((scene) => scene.id),
    blockers: included.flatMap((scene) =>
      sceneBlockers(scene).map((message) => ({ sceneId: scene.id, message })),
    ),
  }
}

export function isMaterialBlocker(message: string) {
  return (
    /图片|照片|摄影|素材|封面|实物/.test(message) &&
    !/选择器|selector|scale[XY]?|关键帧|动画|动效|元素|节点|转场/i.test(message)
  )
}

function isLegacyStoryboardNote(message: string) {
  return [
    '未提供实测配音，归一化卡点需在粗剪时按原口播词锚与实际配音校准。',
    '独立子 agent 设计复核尚未完成：审核会话未收到任务内容，重新创建会话失败，需补做复核。',
  ].includes(message.trim())
}

export function storyboardMotionNotes(storyboard: StoryboardPayload) {
  return storyboard.scenes
    .filter((scene) => sceneMotionEnabled(storyboard, scene.id))
    .flatMap((scene) =>
      [
        ...new Set([
          ...(scene.motion?.notes ?? []),
          ...(scene.motion?.blockers.filter(isLegacyStoryboardNote) ?? []),
        ]),
      ].map((message) => ({ sceneId: scene.id, message })),
    )
}

function sceneBlockers(scene: StoryScene) {
  return (scene.motion?.blockers ?? []).filter(
    (message) =>
      !isLegacyStoryboardNote(message) &&
      (!isMaterialBlocker(message) || !scene.materialFallback?.blockers.includes(message)),
  )
}

function validateMaterialFallback(
  value: unknown,
  source: unknown,
): NonNullable<StoryScene['materialFallback']> {
  const fallback = record(value)
  const blockers = record(source).blockers
  if (
    typeof fallback.acceptedAt !== 'string' ||
    !Number.isFinite(Date.parse(fallback.acceptedAt)) ||
    !Array.isArray(fallback.blockers) ||
    !fallback.blockers.length ||
    fallback.blockers.some(
      (message) =>
        typeof message !== 'string' ||
        !isMaterialBlocker(message) ||
        !Array.isArray(blockers) ||
        !blockers.includes(message),
    )
  )
    throw new Error('素材降级记录无效，仅能接受本镜已标注的素材缺口')
  return { acceptedAt: fallback.acceptedAt, blockers: [...new Set(fallback.blockers)] as string[] }
}

export function retainMaterialFallback(
  previous: StoryboardPayload | undefined,
  next: StoryboardPayload,
): StoryboardPayload {
  return {
    ...next,
    scenes: next.scenes.map((scene) => {
      const original = previous?.scenes.find((item) => item.id === scene.id)
      const content = { ...scene }
      delete content.materialFallback
      const unchanged =
        original &&
        (['title', 'body', 'layout', 'html', 'requirements', 'motion'] as const).every(
          (key) => JSON.stringify(original[key]) === JSON.stringify(scene[key]),
        )
      return unchanged && original.materialFallback
        ? { ...content, materialFallback: original.materialFallback }
        : content
    }),
  }
}

export function storyboardReviewBlockReason(storyboard: StoryboardPayload) {
  const readiness = storyboardMotionReadiness(storyboard)
  const materials = readiness.blockers.filter((issue) => isMaterialBlocker(issue.message)).length
  const motion = readiness.blockers.length - materials
  const reasons = [
    materials && `${materials} 处素材缺口`,
    motion && `${motion} 处动效缺口`,
    storyboard.motionPolicy?.enabled &&
      readiness.unplanned.length &&
      `${readiness.unplanned.length} 镜缺少 MG 计划`,
  ].filter(Boolean)
  return reasons.length ? `因 ${reasons.join('、')}无法审核` : ''
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
