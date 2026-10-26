import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { BrowserWindow, session } from 'electron'
import { randomUUID } from 'node:crypto'
import { fingerprint } from '../../database/repositories/video-workflow-repository'
import {
  stageValue,
  type RenderPayload,
  type VideoProject,
  type WorkflowFile,
  type WorkflowRuntime,
  type MotionPlan,
} from '../../../shared/video-workflow'
import { WorkflowFiles } from './files'
import { escapeHtml, safeStoryboardDocument, sceneHtml } from './storyboard'
import { workflowCommand } from './process'
import { probeMedia, subtitleCues } from './audio'
import { defaultMotion, prepareMotionScene, mergeMotion } from './motion'

type TransitionKeyframe = { opacity?: number; translate?: string; clipPath?: string }

const genericFonts = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
  '-apple-system',
  'blinkmacsystemfont',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
])

function fontString(value: string) {
  return (
    '"' +
    value
      .replace(/["\\]/g, '\\$&')
      .replace(/[<>]/g, (character) => '\\' + character.charCodeAt(0).toString(16) + ' ') +
    '"'
  )
}

export function reusableFrameFiles(
  project: VideoProject,
  sceneCount: number,
  motion: MotionPlan | undefined,
): WorkflowFile[] | undefined {
  const previous = stageValue(project, 'roughcut')
  if (
    !previous ||
    !project.stages.storyboard ||
    previous.sourceStoryboard !== project.stages.storyboard.id ||
    fingerprint(previous.motion ?? null) !== fingerprint(motion ?? null) ||
    previous.compositionFiles.length < sceneCount ||
    previous.compositionNames.length < sceneCount
  )
    return undefined
  const frameNames = previous.compositionNames.slice(0, sceneCount)
  if (!frameNames.every((name, index) => name === `frame-${index}.png`)) return undefined
  return previous.compositionFiles.slice(0, sceneCount)
}

export async function captureStoryboard(
  html: string,
  signal: AbortSignal,
  label = '',
  viewport = { width: 1920, height: 1080 },
): Promise<Buffer> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt < 3; attempt += 1) {
    signal.throwIfAborted()
    const isolated = session.fromPartition(`video-frame-${randomUUID()}`, { cache: false })
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    isolated.setPermissionCheckHandler(() => false)
    isolated.webRequest.onBeforeRequest((details, callback) =>
      callback({ cancel: !details.url.startsWith('data:') }),
    )
    const window = new BrowserWindow({
      show: false,
      width: viewport.width,
      height: viewport.height,
      useContentSize: true,
      webPreferences: {
        session: isolated,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false,
        webSecurity: true,
        offscreen: true,
        backgroundThrottling: false,
      },
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    const abort = () => {
      if (!window.isDestroyed()) window.destroy()
    }
    signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, 20000)
    try {
      await window.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(safeStoryboardDocument(html))}`,
      )
      signal.throwIfAborted()
      await delay(attempt ? 120 : 50, undefined, { signal })
      const image = await window.webContents.capturePage({ x: 0, y: 0, ...viewport })
      if (image.isEmpty()) throw new Error('截图画面为空')
      return image.resize(viewport).toPNG()
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error as Error
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      abort()
      await isolated.clearStorageData()
    }
  }
  const target = label ? `「${label}」` : ''
  throw new Error(`分镜${target}截图失败：${lastError?.message ?? '画面为空，请检查 HTML'}`)
}
export function hyperframesDocument(
  project: VideoProject,
  markup?: string[],
  motion?: MotionPlan,
  fontFamilies: string[] = [],
): string {
  const storyboard = stageValue(project, 'storyboard')!,
    audio = stageValue(project, 'audio')!
  let start = 0
  const scenes = storyboard.scenes
    .map((scene, index) => {
      const duration = audio.tracks
        .filter((track) => track.sceneId === scene.id)
        .reduce((total, track) => total + track.duration, 0)
      const nextTransition = motion?.scenes.find(
        (item) => item.sceneId === storyboard.scenes[index + 1]?.id,
      )?.transition
      const hold = nextTransition?.type !== 'cut' ? (nextTransition?.duration ?? 0) : 0
      const content = markup?.[index]
        ? `<div id="scene-enter-${index}" class="scene-motion-layer"><div id="scene-exit-${index}" class="scene-motion-layer">${markup[index]}</div></div>`
        : `<img src="frame-${index}.png" alt="${escapeHtml(scene.title)}" width="1920" height="1080">`
      const result = `<section class="clip frame" id="clip-${index}" data-start="${start.toFixed(6)}" data-duration="${(duration + hold).toFixed(6)}" data-track-index="0" data-label="${escapeHtml(scene.title)}">${content}</section>`
      start += duration
      return result
    })
    .join('\n')
  const subtitles = subtitleCues(audio.tracks)
    .map(
      (cue) =>
        `<div class="clip caption" data-start="${cue.start.toFixed(6)}" data-duration="${cue.duration.toFixed(6)}" data-track-index="2" data-layout-allow-caption-zone><span>${escapeHtml(cue.text)}</span></div>`,
    )
    .join('\n')
  let offset = 0
  const transitions: {
    root: string
    delay: number
    duration: number
    keyframes: TransitionKeyframe[]
  }[] = []
  const effects = storyboard.scenes.flatMap((scene, index) => {
    const transition = motion?.scenes.find((item) => item.sceneId === scene.id)?.transition
    if (index > 0 && transition && transition.type !== 'cut') {
      const type = transition.type
      const keyframes: TransitionKeyframe[] =
        type === 'crossfade'
          ? [{ opacity: 0 }, { opacity: 1 }]
          : type === 'wipe-left'
            ? [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }]
            : [
                { translate: type === 'slide-left' ? '1920px 0px' : '0px 1080px' },
                { translate: '0px 0px' },
              ]
      transitions.push({
        root: `scene-enter-${index}`,
        delay: offset,
        duration: transition.duration,
        keyframes,
      })
      if (type === 'slide-left' || type === 'slide-up')
        transitions.push({
          root: `scene-exit-${index - 1}`,
          delay: offset,
          duration: transition.duration,
          keyframes: [
            { translate: '0px 0px' },
            { translate: type === 'slide-left' ? '-1920px 0px' : '0px -1080px' },
          ],
        })
    }
    const values = (motion?.scenes.find((item) => item.sceneId === scene.id)?.effects ?? []).map(
      (effect) => ({
        ...effect,
        keyframes: effect.keyframes.map(({ scaleX, scaleY, ...frame }) =>
          scaleX !== undefined || scaleY !== undefined
            ? { ...frame, scale: `${scaleX ?? 1} ${scaleY ?? 1}` }
            : frame,
        ),
        root: `scene-${index}`,
        delay: offset + effect.start,
      }),
    )
    offset += audio.tracks
      .filter((track) => track.sceneId === scene.id)
      .reduce((total, track) => total + track.duration, 0)
    return values
  })
  const animation = motion
    ? `<script>const effects=${JSON.stringify(effects).replace(/</g, '\\u003c')};const transitions=${JSON.stringify(transitions)};const animate=(element,effect)=>{const animation=element.animate(effect.keyframes,{duration:effect.duration*1000,delay:effect.delay*1000,iterations:effect.iterations??1,direction:effect.direction??'normal',easing:effect.easing??'ease-in-out',fill:'both'});animation.pause();};for(const effect of effects){const root=document.getElementById(effect.root);for(const element of root.querySelectorAll(effect.selector))animate(element,effect);}for(const transition of transitions)animate(document.getElementById(transition.root),transition);</script>`
    : ''
  const fonts = [
    { family: 'PingFang SC', sources: ['PingFang SC', 'Microsoft YaHei'] },
    { family: 'Microsoft YaHei', sources: ['Microsoft YaHei', 'PingFang SC'] },
    {
      family: 'SFMono-Regular',
      sources: ['SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'Courier New'],
    },
  ]
  const declared = new Set(fonts.map((font) => font.family.toLowerCase()))
  for (const family of fontFamilies) {
    const key = family.trim().toLowerCase()
    if (!key || genericFonts.has(key) || declared.has(key)) continue
    declared.add(key)
    fonts.push({ family, sources: [family] })
  }
  const localFonts = fonts
    .map(
      ({ family, sources }) =>
        `@font-face{font-family:${fontString(family)};src:${sources.map((source) => `local(${fontString(source)})`).join(',')}}`,
    )
    .join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; media-src 'self'; connect-src 'self'; base-uri 'none'; frame-src 'none'"><title>${escapeHtml(project.title)}</title><style>${localFonts}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#111827;font-family:system-ui,sans-serif}#root{position:relative;width:100%;height:100%;overflow:hidden}.clip{position:absolute;inset:0}.scene-motion-layer{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}.frame>img{display:block;width:100%;height:100%;object-fit:contain}.caption{display:flex;align-items:flex-end;justify-content:center;padding:0 100px 48px;pointer-events:none}.caption span{display:block;max-width:1720px;padding:12px 28px;border-radius:12px;background:#101521;color:#fff;font-size:38px;line-height:1.4;text-align:center}</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${audio.duration.toFixed(6)}" data-width="1920" data-height="1080" data-no-timeline>${scenes}${subtitles}<audio id="narration" src="narration.wav" data-start="0" data-duration="${audio.duration.toFixed(6)}" data-track-index="10" data-audio-group="voiceover"></audio></div>${animation}</body></html>`
}
export function assertHyperframesCheck(value: unknown) {
  const report = value as {
    ok?: boolean
    browserSkipped?: boolean
    layout?: { samples?: unknown[] }
    runtime?: { errors?: unknown[] }
  }
  if (
    !report ||
    report.ok !== true ||
    report.browserSkipped !== false ||
    !report.layout?.samples?.length
  )
    throw new Error('HyperFrames 检查未通过或未采集到实际浏览器样本，不能继续渲染')
}
export function assertRenderRuntime(runtime: WorkflowRuntime) {
  const required: [keyof WorkflowRuntime, string][] = [
    ['hyperframesPath', 'HyperFrames 0.8.181'],
    ['ffmpegPath', 'FFmpeg'],
    ['ffprobePath', 'FFprobe'],
    ...(runtime.hyperframesPath.endsWith('.mjs')
      ? [['nodePath', 'Node.js 22+'] as [keyof WorkflowRuntime, string]]
      : []),
  ]
  const missing = required.filter(([key]) => !runtime[key]?.trim()).map(([, label]) => label)
  if (missing.length)
    throw new Error(
      `缺少 ${missing.join('、')} 路径。请打开右上角「执行环境」，选择已安装的程序后重试；HyperFrames 可使用 bin/hyperframes.mjs。`,
    )
}
async function hyperframes(
  runtime: WorkflowRuntime,
  args: string[],
  cwd: string,
  signal: AbortSignal,
  timeout = 120000,
) {
  return workflowCommand(
    runtime.hyperframesPath.endsWith('.mjs') ? runtime.nodePath : runtime.hyperframesPath,
    [...(runtime.hyperframesPath.endsWith('.mjs') ? [runtime.hyperframesPath] : []), ...args],
    { cwd, signal, timeout, nodePath: runtime.nodePath },
  )
}
export async function renderWorkflow(input: {
  project: VideoProject
  final: boolean
  files: WorkflowFiles
  runtime: WorkflowRuntime
  cwd: string
  signal: AbortSignal
  phase: (message: string) => void
  motion?: MotionPlan
}): Promise<RenderPayload> {
  const { project, final, files, runtime, cwd, signal, phase } = input
  assertRenderRuntime(runtime)
  mkdirSync(cwd, { recursive: true })
  const version = await hyperframes(runtime, ['--version'], cwd, signal, 15000)
  if (!/\b0\.8\.181\b/.test(version))
    throw new Error('首期需 HyperFrames 0.8.181；请配置该版本的可执行文件或 bin/hyperframes.mjs')
  let compositionFiles: WorkflowFile[] = [],
    compositionNames: string[] = [],
    cover: WorkflowFile,
    motion: MotionPlan | undefined
  if (final) {
    const roughcut = stageValue(project, 'roughcut')!
    if (
      fingerprint(
        roughcut.compositionFiles.map((file, index) => [
          roughcut.compositionNames[index],
          file.sha256,
        ]),
      ) !== roughcut.manifestHash
    )
      throw new Error('冻结工程指纹不一致')
    compositionFiles = roughcut.compositionFiles
    compositionNames = roughcut.compositionNames
    cover = roughcut.cover
    motion = roughcut.motion
    for (const [index, file] of compositionFiles.entries())
      copyFileSync(await files.verify(project.id, file), join(cwd, compositionNames[index]))
  } else {
    const storyboard = stageValue(project, 'storyboard')!,
      audio = stageValue(project, 'audio')!
    motion = input.motion
      ? mergeMotion(project, input.motion)
      : (stageValue(project, 'roughcut')?.motion ?? defaultMotion(project))
    let reusableFrames = reusableFrameFiles(project, storyboard.scenes.length, motion)
    let reusableFramePaths: string[] | undefined
    if (reusableFrames) {
      try {
        reusableFramePaths = await Promise.all(
          reusableFrames.map((file) => files.verify(project.id, file)),
        )
      } catch {
        reusableFrames = undefined
      }
    }
    if (reusableFrames)
      phase(`复用已冻结分镜帧 ${reusableFrames.length}/${storyboard.scenes.length}`)
    const markup: string[] = []
    const fontFamilies: string[] = []
    const compiledMotion: MotionPlan = { ...motion, scenes: [] }
    for (const [index, scene] of storyboard.scenes.entries()) {
      phase(`编译元素动效与分镜 ${index + 1}/${storyboard.scenes.length}`)
      const sceneMotion = motion.scenes.find((item) => item.sceneId === scene.id)
      const effects = sceneMotion?.effects ?? []
      const prepared = await prepareMotionScene(
        sceneHtml(scene, storyboard.template),
        `scene-${index}`,
        effects.map((effect) => effect.selector),
        signal,
      )
      if (input.motion && prepared.counts.some((count) => count === 0))
        throw new Error(`分镜「${scene.title}」的动效目标不存在，请重新生成修改计划`)
      markup.push(prepared.html)
      fontFamilies.push(...prepared.fontFamilies)
      compiledMotion.scenes.push({
        sceneId: scene.id,
        ...(sceneMotion?.transition ? { transition: sceneMotion.transition } : {}),
        effects: effects.map((effect, effectIndex) => ({
          ...effect,
          selector: prepared.selectors[effectIndex],
        })),
      })
      const name = `frame-${index}.png`,
        cachedFrame = reusableFrames?.[index]
      if (cachedFrame) {
        copyFileSync(reusableFramePaths![index], join(cwd, name))
        compositionNames.push(name)
        compositionFiles.push(cachedFrame)
      } else {
        const image = await captureStoryboard(
          sceneHtml(scene, storyboard.template),
          signal,
          scene.title,
        )
        writeFileSync(join(cwd, name), image)
        compositionNames.push(name)
        compositionFiles.push(await files.import(project.id, join(cwd, name)))
      }
    }
    cover = compositionFiles[0]
    copyFileSync(await files.verify(project.id, audio.file), join(cwd, 'narration.wav'))
    writeFileSync(
      join(cwd, 'index.html'),
      hyperframesDocument(project, markup, compiledMotion, fontFamilies),
    )
    for (const name of ['narration.wav', 'index.html']) {
      compositionNames.push(name)
      compositionFiles.push(await files.import(project.id, join(cwd, name)))
    }
  }
  phase('HyperFrames 浏览器、布局与字幕检查')
  const checked = await hyperframes(
    runtime,
    ['check', cwd, '--json', '--samples', '9'],
    cwd,
    signal,
    180000,
  )
  const report = JSON.parse(checked)
  assertHyperframesCheck(report)
  const hasMotion = motion?.scenes.some(
    (scene) => scene.effects.length > 0 || (scene.transition && scene.transition.type !== 'cut'),
  )
  const checks = JSON.stringify({
    version: '0.8.181',
    ok: true,
    samples: report.layout.samples.length,
    warnings: report.lint?.warnings ?? [],
    staticKeyframes: !hasMotion,
    motionEngine: hasMotion ? 'waapi' : undefined,
  })
  const output = join(cwd, final ? 'final.mp4' : 'roughcut.mp4')
  const renderProfile = {
    quality: final ? ('delivery' as const) : ('looks' as const),
    fps: 30 as const,
  }
  phase(final ? '渲染最终成片 · 1920×1080 / 30 fps' : '渲染粗剪 · 完成后等待人工审核')
  await hyperframes(
    runtime,
    [
      'render',
      cwd,
      '--output',
      output,
      '--quality',
      renderProfile.quality,
      '--fps',
      String(renderProfile.fps),
    ],
    cwd,
    signal,
    3600000,
  )
  const probed = await probeMedia(runtime, output, cwd, signal),
    video = probed.streams.find((stream) => stream.codec_type === 'video')
  if (
    !video ||
    video.width !== 1920 ||
    video.height !== 1080 ||
    Math.abs(
      probed.duration -
        (final
          ? stageValue(project, 'roughcut')!.duration
          : stageValue(project, 'audio')!.duration),
    ) > 0.15
  )
    throw new Error('输出视频的画幅或音画时长不符合要求')
  return {
    file: await files.import(project.id, output),
    duration: probed.duration,
    width: 1920,
    height: 1080,
    compositionFiles,
    compositionNames,
    cover,
    manifestHash: fingerprint(
      compositionFiles.map((file, index) => [compositionNames[index], file.sha256]),
    ),
    checks,
    renderProfile,
    ...(final ? { sourceRoughcut: project.stages.roughcut!.id } : {}),
    ...(motion ? { motion } : {}),
    sourceStoryboard: final
      ? stageValue(project, 'roughcut')!.sourceStoryboard
      : project.stages.storyboard!.id,
    sourceAudio: final ? stageValue(project, 'roughcut')!.sourceAudio : project.stages.audio!.id,
    sourceNarration: final
      ? stageValue(project, 'roughcut')!.sourceNarration
      : project.stages.narration!.id,
  }
}
