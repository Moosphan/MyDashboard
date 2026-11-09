import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  stageValue,
  type MotionPlan,
  type VideoProject,
  type WorkflowRuntime,
} from '../../../shared/video-workflow'
import { WorkflowFiles } from './files'
import { sceneHtml } from './storyboard'
import { subtitleCues } from './audio'
import { REMOTION_PUBLIC_FILE } from './remotion'
import {
  assertNativeRevisionScope,
  nativeCreationPrompt,
  nativeDependencies,
  nativeSettings,
  validateNativeSources,
  writeNativeComposition,
  type NativeSources,
} from './remotion-native'

export async function authorNativeComposition(input: {
  project: VideoProject
  files: WorkflowFiles
  runtime: WorkflowRuntime
  cwd: string
  motion?: MotionPlan
  signal: AbortSignal
  phase: (message: string) => void
  create: (prompt: string) => Promise<unknown>
  capture: (html: string, label: string) => Promise<Buffer>
}) {
  const { project, files, runtime, cwd, motion, signal, phase } = input
  const settings = nativeSettings(project)
  const dependencies = nativeDependencies(runtime)
  const storyboard = stageValue(project, 'storyboard')!
  const prior = stageValue(project, 'roughcut')
  const names: string[] = []
  let previous: NativeSources | undefined
  if (motion?.native && prior?.compositionNames.includes('visuals.tsx')) {
    const pathFor = async (name: string) => {
      const index = prior.compositionNames.indexOf(name)
      if (index < 0) throw new Error(`冻结原生工程缺少 ${name}`)
      return files.verify(project.id, prior.compositionFiles[index])
    }
    const config = JSON.parse(readFileSync(await pathFor('composition.json'), 'utf8'))
    const candidates = prior.compositionNames.filter((name) =>
      /^(visuals|scene-\d+|component-[a-z0-9-]+)\.tsx$/.test(name),
    )
    previous = validateNativeSources(
      {
        summary: config.summary,
        files: await Promise.all(
          candidates.map(async (name) => ({
            name,
            content: readFileSync(await pathFor(name), 'utf8'),
          })),
        ),
      },
      settings.scenes.map((scene) => scene.id),
      dependencies,
    )
    for (const asset of config.assets ?? []) {
      if (!REMOTION_PUBLIC_FILE.test(asset.name) || /\.html$/.test(asset.name))
        throw new Error('冻结原生工程素材清单无效')
      copyFileSync(await pathFor(asset.name), join(cwd, asset.name))
      settings.assets.push(asset)
      names.push(asset.name)
    }
  }
  if (motion?.native && motion.sceneId && !previous)
    throw new Error('历史 HTML 工程尚无原生逐镜源码，请先生成整片原生粗剪，再进行当前分镜修改')
  if (!previous) {
    for (const [index, scene] of storyboard.scenes.entries()) {
      signal.throwIfAborted()
      phase(`冻结原生创作参考与素材 ${index + 1}/${storyboard.scenes.length}`)
      const html = sceneHtml(scene, storyboard.template, storyboard.format)
      const reference = `reference-${index}.png`
      writeFileSync(join(cwd, reference), await input.capture(html, scene.title))
      settings.assets.push({
        name: reference,
        sceneId: scene.id,
        role: '静态分镜参考，motionEnabled=false 时可作为静态画面',
      })
      names.push(reference)
      const images = new Map<string, string>()
      const referenceHtml = html.replace(
        /data:image\/(png|jpeg|jpg|webp|svg\+xml)(?:;charset=[^;,"'\s)]+)?(;base64)?,([^"'\s)<>]+)/gi,
        (source, kind: string, base64: string | undefined, body: string) => {
          if (images.has(source)) return images.get(source)!
          const extension = kind === 'svg+xml' ? 'svg' : kind
          const name = `asset-${index}-${images.size}.${extension}`
          const content = base64
            ? Buffer.from(body, 'base64')
            : Buffer.from(decodeURIComponent(body))
          if (!content.length || content.length > 4 * 1024 * 1024)
            throw new Error(`分镜「${scene.title}」内嵌素材大小无效`)
          writeFileSync(join(cwd, name), content)
          images.set(source, name)
          settings.assets.push({
            name,
            sceneId: scene.id,
            role: '分镜内嵌原始图片，可独立用于原生场景',
          })
          names.push(name)
          return name
        },
      )
      settings.scenes[index].referenceHtml = referenceHtml
    }
  }
  settings.captions = subtitleCues(stageValue(project, 'audio')!.tracks)
  phase('Agent 创作原生 Remotion 场景与镜头编排')
  const sources = validateNativeSources(
    await input.create(
      nativeCreationPrompt(
        project,
        settings,
        dependencies,
        previous,
        motion?.native?.instructions,
        motion?.sceneId,
      ),
    ),
    settings.scenes.map((scene) => scene.id),
    dependencies,
  )
  if (previous)
    assertNativeRevisionScope(
      previous,
      sources,
      settings.scenes.map((scene) => scene.id),
      motion?.sceneId,
    )
  signal.throwIfAborted()
  writeNativeComposition(cwd, sources, settings, dependencies)
  copyFileSync(
    await files.verify(project.id, stageValue(project, 'audio')!.file),
    join(cwd, 'narration.wav'),
  )
  return [
    ...names,
    ...sources.files.map((file) => file.name),
    'remotion.tsx',
    'composition.json',
    'package.json',
    'narration.wav',
  ]
}
