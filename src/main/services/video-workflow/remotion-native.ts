import { createRequire, builtinModules } from 'node:module'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import ts from 'typescript'
import {
  stageValue,
  videoFrame,
  sceneMotionEnabled,
  type VideoProject,
  type WorkflowRuntime,
} from '../../../shared/video-workflow'
import { REMOTION_VERSION } from './remotion'

export interface NativeSources {
  summary: string
  files: { name: string; content: string }[]
}

export interface NativeSettings {
  duration: number
  width: number
  height: number
  fps: number
  scenes: {
    id: string
    title: string
    text: string
    start: number
    duration: number
    from: number
    durationInFrames: number
    module: string
    motionEnabled: boolean
    referenceHtml?: string
  }[]
  captions: { start: number; duration: number; text: string }[]
  assets: { name: string; sceneId: string; role: string }[]
}

export const NATIVE_REMOTION_ENTRY = `import React from 'react';
import {AbsoluteFill, Audio, Composition, Img, Sequence, registerRoot, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import Visuals from './visuals';
import data from './composition.json';
function Video() {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const time = frame / fps;
  const caption = data.captions.find(cue => time >= cue.start && time < cue.start + cue.duration);
  const staticScene = data.scenes.findIndex(scene => !scene.motionEnabled && time >= scene.start && time < scene.start + scene.duration);
  return <AbsoluteFill style={{backgroundColor: '#111827', overflow: 'hidden'}}>
    {staticScene >= 0 ? <Img src={staticFile('reference-' + staticScene + '.png')} style={{width: '100%', height: '100%'}} /> : <Visuals {...data} />}
    {caption && <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', padding: data.height > data.width ? '0 120px 200px 72px' : '0 100px 48px', pointerEvents: 'none'}}>
      <div style={{fontFamily: 'system-ui, sans-serif', fontSize: 38, lineHeight: 1.4, textAlign: 'center', color: '#fff', background: '#101521', padding: '12px 28px', borderRadius: 12}}>{caption.text}</div>
    </AbsoluteFill>}
    <Audio src={staticFile('narration.wav')} />
    {data.music && <Sequence durationInFrames={Math.max(1, Math.ceil(data.music.duration * fps))}>
      <Audio src={staticFile(data.music.name)} trimBefore={Math.round(data.music.start * fps)} volume={data.music.volume} playbackRate={data.music.playbackRate} />
    </Sequence>}
  </AbsoluteFill>;
}
registerRoot(() => <Composition id="Video" component={Video} durationInFrames={Math.ceil(data.duration * data.fps)} fps={data.fps} width={data.width} height={data.height} />);
`

const sourceName = /^(?:visuals|scene-\d+|component-[a-z0-9-]+)\.tsx$/
const nodeModules = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]))

export function remotionPackageDirectory(name: string, resolve: ReturnType<typeof createRequire>) {
  try {
    return dirname(resolve.resolve(`${name}/package.json`))
  } catch {
    let directory = dirname(resolve.resolve(name))
    while (dirname(directory) !== directory) {
      const manifest = join(directory, 'package.json')
      if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === name)
        return directory
      directory = dirname(directory)
    }
    throw new Error(`Remotion 依赖缺少有效 manifest：${name}`)
  }
}

export function nativeDependencies(runtime: WorkflowRuntime) {
  const executable = realpathSync(runtime.remotionPath!)
  const resolve = createRequire(executable)
  const dependencies: Record<string, string> = {}
  let directory = dirname(executable)
  while (dirname(directory) !== directory) {
    const path = join(directory, 'package.json')
    if (existsSync(path) && !directory.split(sep).includes('node_modules')) {
      const manifest = JSON.parse(readFileSync(path, 'utf8'))
      for (const name of Object.keys(
        manifest.name === '@remotion/cli' ? {} : (manifest.dependencies ?? {}),
      )) {
        if (name === '@remotion/cli' || nodeModules.has(name)) continue
        try {
          dependencies[name] = JSON.parse(
            readFileSync(join(remotionPackageDirectory(name, resolve), 'package.json'), 'utf8'),
          ).version
        } catch {
          continue
        }
      }
      break
    }
    directory = dirname(directory)
  }
  for (const name of ['react', 'react-dom', 'remotion'])
    dependencies[name] = JSON.parse(
      readFileSync(join(remotionPackageDirectory(name, resolve), 'package.json'), 'utf8'),
    ).version
  return dependencies
}

export function validateNativeSources(
  value: unknown,
  sceneIds: string[],
  dependencies: Record<string, string>,
): NativeSources {
  if (!value || typeof value !== 'object') throw new Error('原生 Remotion 工程格式无效')
  const input = value as NativeSources
  const blockers = (value as { blockers?: unknown }).blockers
  if (Array.isArray(blockers) && blockers.length)
    throw new Error(`原生 Remotion 创作尚未就绪：${blockers.map(String).join('；')}`)
  if (
    typeof input.summary !== 'string' ||
    !input.summary.trim() ||
    input.summary.length > 3000 ||
    !Array.isArray(input.files) ||
    !input.files.length ||
    input.files.length > 180
  )
    throw new Error('原生 Remotion 工程缺少说明或文件')
  const names = new Set<string>()
  for (const file of input.files) {
    if (
      !file ||
      typeof file.name !== 'string' ||
      !sourceName.test(file.name) ||
      names.has(file.name) ||
      typeof file.content !== 'string' ||
      !file.content.trim() ||
      file.content.length > 500000
    )
      throw new Error('原生 Remotion 工程文件名、内容或重复文件无效')
    names.add(file.name)
  }
  if (!names.has('visuals.tsx') || sceneIds.some((_, index) => !names.has(`scene-${index}.tsx`)))
    throw new Error('原生 Remotion 工程缺少 visuals 或逐镜模块')
  if (input.files.reduce((total, file) => total + file.content.length, 0) > 2000000)
    throw new Error('原生 Remotion 工程源码超过 2 MB')
  for (const file of input.files) {
    const parsed = ts.createSourceFile(
      file.name,
      file.content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const transpiled = ts.transpileModule(file.content, {
      fileName: file.name,
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext },
    })
    const error = transpiled.diagnostics?.find(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    )
    if (error)
      throw new Error(
        `原生 Remotion 语法错误 ${file.name}：${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`,
      )
    const checkImport = (specifier: string) => {
      if (specifier.startsWith('./')) {
        const target = specifier.slice(2).replace(/\.tsx$/, '') + '.tsx'
        if (!names.has(target)) throw new Error(`原生 Remotion 模块不存在：${specifier}`)
      } else {
        const name = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : specifier.split('/')[0]
        if (
          nodeModules.has(specifier) ||
          specifier.startsWith('node:') ||
          !Object.hasOwn(dependencies, name)
        )
          throw new Error(`原生 Remotion 导入依赖未安装或不是浏览器依赖：${specifier}`)
      }
    }
    const visit = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        checkImport(node.moduleSpecifier.text)
      if (ts.isImportEqualsDeclaration(node))
        throw new Error('原生 Remotion 只支持浏览器 ES 模块导入')
      if (
        ts.isIdentifier(node) &&
        ['require', 'process', '__dirname', '__filename', 'eval', 'Function'].includes(node.text)
      )
        throw new Error(`原生 Remotion 浏览器源码不能使用 ${node.text}`)
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
        throw new Error('原生 Remotion 使用静态模块导入，动态导入未支持')
      ts.forEachChild(node, visit)
    }
    visit(parsed)
  }
  return {
    summary: input.summary,
    files: input.files.map((file) => ({ name: file.name, content: file.content })),
  }
}

export function assertNativeRevisionScope(
  previous: NativeSources,
  next: NativeSources,
  sceneIds: string[],
  sceneId?: string,
) {
  if (!sceneId) return
  const index = sceneIds.indexOf(sceneId)
  if (index < 0) throw new Error('当前分镜不存在')
  const allowed = `scene-${index}.tsx`
  const unchanged = (source: NativeSources) =>
    source.files
      .filter((file) => file.name !== allowed)
      .sort((first, second) => first.name.localeCompare(second.name))
  if (JSON.stringify(unchanged(previous)) !== JSON.stringify(unchanged(next)))
    throw new Error('当前分镜修改只能改变对应 scene 模块；跨镜头结构调整请选择整片')
}

export function writeNativeComposition(
  cwd: string,
  sources: NativeSources,
  settings: NativeSettings,
  dependencies: Record<string, string>,
) {
  writeFileSync(join(cwd, 'remotion.tsx'), NATIVE_REMOTION_ENTRY)
  writeFileSync(
    join(cwd, 'composition.json'),
    JSON.stringify({
      ...settings,
      native: true,
      summary: sources.summary,
      sourceFiles: sources.files.map((file) => file.name),
    }),
  )
  for (const file of sources.files) writeFileSync(join(cwd, file.name), file.content)
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify(
      {
        name: 'mydashboard-native-video',
        private: true,
        scripts: {
          studio: 'remotion studio remotion.tsx --public-dir=public',
          render: 'remotion render remotion.tsx Video output.mp4 --public-dir=public',
        },
        dependencies: { ...dependencies, '@remotion/cli': REMOTION_VERSION },
      },
      null,
      2,
    ),
  )
}

export function nativeSettings(project: VideoProject): NativeSettings {
  const storyboard = stageValue(project, 'storyboard')!
  const audio = stageValue(project, 'audio')!
  let start = 0
  return {
    ...videoFrame(storyboard.format),
    duration: audio.duration,
    fps: 30,
    captions: [],
    assets: [],
    scenes: storyboard.scenes.map((scene, index) => {
      const duration = audio.tracks
        .filter((track) => track.sceneId === scene.id)
        .reduce((total, track) => total + track.duration, 0)
      const from = Math.round(start * 30)
      const value = {
        id: scene.id,
        title: scene.title,
        text: audio.tracks
          .filter((track) => track.sceneId === scene.id)
          .map((track) => track.text)
          .join(''),
        start,
        duration,
        from,
        durationInFrames: Math.max(1, Math.round((start + duration) * 30) - from),
        module: `scene-${index}.tsx`,
        motionEnabled: sceneMotionEnabled(storyboard, scene.id),
      }
      start += duration
      return value
    }),
  }
}

export function nativeCreationPrompt(
  project: VideoProject,
  settings: NativeSettings,
  dependencies: Record<string, string>,
  previous?: NativeSources,
  instructions?: string,
  sceneId?: string,
) {
  const storyboard = stageValue(project, 'storyboard')!
  return `你是 Remotion 视频导演与 React 工程师，创作完整原生视频画面。输出且仅输出 JSON：{"summary":"本次镜头设计与画面变化","files":[{"name":"visuals.tsx","content":"完整 TSX 源码"},{"name":"scene-0.tsx","content":"完整 TSX 源码"}]}。
画面直接使用 React + Remotion。静态分镜是内容、风格、素材、叙事意图参考；请重新设计适合时间展开的构图、镜内切镜、视角、对象动作、连续场景与视觉解释，HTML 版式和原动效字段不构成画面上限。根据内容决定表达形式，无固定版式、镜头清单或动作枚举。SVG 路径形变、Canvas 绘制、粒子、透视、遮罩、程序化图形、弹簧、非线性运动、实测口播卡点均可按需创作。真实素材要求沿用登记素材，不能用示意素材冒充真实资料。
visuals.tsx 默认导出 React 组件，接收下面 settings 的全部 props，拥有全片视觉编排；每个 scene-N.tsx 默认导出该语义分镜的组件，组件可以包含任意数量子镜头，使用 Sequence 按 settings 的 from/durationInFrames 编排。从 Remotion 导入 useCurrentFrame/useVideoConfig/interpolate/spring/random/Sequence/Img/OffthreadVideo/staticFile 等实际可用 API。Sequence 内帧是局部帧。可以增加 component-xxx.tsx 辅助模块；所有文件位于根目录，完整返回全部源码。仅导入下列已安装浏览器依赖以及本工程静态相对模块：${JSON.stringify(dependencies)}。需要额外依赖时明确返回 blockers 说明包名，不伪造已安装或悄悄降级。禁止 Node API、require、动态 import、eval、Function。只创建视觉组件，不创建 registerRoot、Composition、配音、字幕或配乐，宿主统一负责这些。保持事实、口播顺序及总时长；每镜的 from 和 durationInFrames 是口播语义区间，镜内自由切换，跨镜连续性可由 visuals 设计。
全部运动由帧决定，随机使用固定 seed，Canvas 按当前帧重绘；渲染可随机 seek，不依赖实时时钟、浏览器 CSS 动画或外部网络。素材使用 settings.assets 中名称配合 staticFile；原图保留原有内容，分镜参考图只作参考，避免将整张参考图作为唯一画面再平移。motionEnabled=false 的分镜保持静态，可使用其 reference 图片，不添加动画。画幅填满，不改变项目规格；底部字幕区保持可读。
创作要求：${JSON.stringify({ brief: stageValue(project, 'brief'), copy: stageValue(project, 'copy'), referenceText: storyboard.referenceText, references: storyboard.references, scenes: storyboard.scenes.map(({ html, ...scene }) => scene) })}
实测时间线、素材与画幅：${JSON.stringify(settings)}
当前源码：${JSON.stringify(previous ?? null)}
当前修改意见：${instructions ?? '创作首版原生视频，落实原创作要求，给出主体行为、镜头变化、信息揭示节奏及可读停留。'}
${sceneId ? `仅修改当前分镜 ${sceneId}，只允许更改 scene-${storyboard.scenes.findIndex((scene) => scene.id === sceneId)}.tsx；其他源码必须原样返回。` : '可以调整全片视觉编排，分镜 ID 与口播语义区间保持稳定。'}
素材、依赖或动作确有无法完成之处时返回 {"blockers":["具体缺口"]}，不要用默认渐入替代。`
}

export function nativeRevisionPrompt(
  project: VideoProject,
  feedback: string,
  at: number,
  sceneId?: string,
) {
  const settings = nativeSettings(project)
  const included = settings.scenes.filter(
    (scene) => scene.motionEnabled && (!sceneId || scene.id === sceneId),
  )
  return `规划原生 Remotion 视频修改，输出且仅输出 JSON：{"summary":"逐镜动作、镜头与节奏修改摘要","native":{"instructions":"可执行的详细视觉导演说明"},"scenes":[${included.map((scene) => JSON.stringify({ sceneId: scene.id, effects: [] })).join(',')}]}。当前修改意见：${JSON.stringify(feedback)}；定位 ${at} 秒，范围 ${sceneId ?? '整片'}。原生画面可以重新构图、创建视觉对象、绘制 SVG/Canvas、设计镜内切镜和连续运动，不受 HTML 选择器与 WAAPI 属性枚举约束。保留事实、口播、字幕、总时长以及明确的素材真实性要求；需要改变文案或配音则返回 {"requiresUpstream":true,"reason":"具体原因"}。覆盖范围内每个未排除分镜，effects 为空数组，具体创作说明写入 native.instructions。时间线：${JSON.stringify(settings)}。原分镜意图：${JSON.stringify(stageValue(project, 'storyboard')?.scenes.map(({ html, ...scene }) => scene))}`
}
