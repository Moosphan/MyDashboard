import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import type { RenderMusic, WorkflowRuntime } from '../../../shared/video-workflow'
import { workflowCommand } from './process'
import {
  NATIVE_REMOTION_ENTRY,
  remotionPackageDirectory,
  validateNativeSources,
} from './remotion-native'

export const REMOTION_PUBLIC_FILE =
  /^[a-z0-9-]+\.(html|png|jpg|jpeg|webp|svg|wav|mp3|m4a|ogg|flac|mp4|woff|woff2)$/

export const REMOTION_VERSION = '4.0.541'
export const REMOTION_FILES = ['remotion.tsx', 'composition.json', 'package.json']

export const REMOTION_ENTRY = `import React, {useCallback, useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, Audio, Composition, Sequence, continueRender, delayRender, registerRoot, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import data from './composition.json';

function Video() {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const iframe = useRef<HTMLIFrameElement>(null);
  const [handle] = useState(() => delayRender('Loading frozen storyboard'));
  const seek = useCallback(() => {
    const document = iframe.current?.contentDocument;
    if (!document) return;
    const time = frame / fps;
    for (const clip of document.querySelectorAll<HTMLElement>('.clip')) {
      const start = Number(clip.dataset.start || 0);
      const end = start + Number(clip.dataset.duration || 0);
      clip.style.display = time >= start && time < end ? '' : 'none';
    }
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = time * 1000;
    }
  }, [frame, fps]);
  useLayoutEffect(seek, [seek]);
  const loaded = async () => {
    const document = iframe.current?.contentDocument;
    if (!document) return;
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(image => image.decode().catch(() => {})));
    seek();
    continueRender(handle);
  };
  return <AbsoluteFill style={{backgroundColor:'#111827'}}>
    <iframe ref={iframe} src={staticFile('index.html')} onLoad={loaded} style={{width:'100%',height:'100%',border:0}} />
    <Audio src={staticFile('narration.wav')} />
    {data.music && <Sequence durationInFrames={Math.max(1, Math.ceil(data.music.duration * fps))}>
      <Audio src={staticFile(data.music.name)} trimBefore={Math.round(data.music.start * fps)} volume={data.music.volume} playbackRate={data.music.playbackRate} />
    </Sequence>}
  </AbsoluteFill>;
}

registerRoot(() => <Composition id="Video" component={Video} durationInFrames={Math.ceil(data.duration * 30)} fps={30} width={data.width} height={data.height} />);
`

export function writeRemotionComposition(
  cwd: string,
  duration: number,
  frame: { width: number; height: number },
  music?: RenderMusic,
) {
  writeFileSync(join(cwd, 'remotion.tsx'), REMOTION_ENTRY)
  writeFileSync(join(cwd, 'composition.json'), JSON.stringify({ duration, ...frame }))
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify(
      {
        name: 'mydashboard-video',
        private: true,
        scripts: {
          studio: 'remotion studio remotion.tsx --public-dir=public',
          render: 'remotion render remotion.tsx Video output.mp4 --public-dir=public',
        },
        dependencies: {
          '@remotion/cli': REMOTION_VERSION,
          remotion: REMOTION_VERSION,
          react: '18.3.1',
          'react-dom': '18.3.1',
        },
      },
      null,
      2,
    ),
  )
  if (music) updateRemotionMusic(cwd, music)
}

export function updateRemotionMusic(cwd: string, music: RenderMusic) {
  const path = join(cwd, 'composition.json')
  const data = JSON.parse(readFileSync(path, 'utf8'))
  data.music = {
    name: basename(music.file.path),
    start: music.start,
    duration: music.duration,
    volume: music.volume,
    playbackRate: music.playbackRate,
  }
  writeFileSync(path, JSON.stringify(data))
}

function linkRemotionDependencies(runtime: WorkflowRuntime, cwd: string) {
  const executable = realpathSync(runtime.remotionPath!)
  const resolve = createRequire(executable)
  const directory = join(cwd, 'node_modules')
  mkdirSync(directory, { recursive: true })
  for (const name of ['react', 'react-dom', 'remotion']) {
    const source = remotionPackageDirectory(name, resolve)
    const target = join(directory, name)
    if (!existsSync(target))
      symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir')
    else if (realpathSync(target) !== realpathSync(source))
      throw new Error('Remotion 工程依赖来源冲突')
  }
  const installed = JSON.parse(readFileSync(resolve.resolve('remotion/package.json'), 'utf8'))
  if (installed.version !== REMOTION_VERSION)
    throw new Error(`请配置 Remotion ${REMOTION_VERSION}；当前版本为 ${installed.version}`)
  const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    if (['@remotion/cli', 'react', 'react-dom', 'remotion'].includes(name)) continue
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name))
      throw new Error(`不支持的浏览器依赖：${name}`)
    const source = remotionPackageDirectory(name, resolve)
    const installed = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
    if (installed.version !== version) throw new Error(`冻结依赖版本不一致：${name}`)
    const target = join(directory, name)
    mkdirSync(dirname(target), { recursive: true })
    if (!existsSync(target))
      symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir')
    else if (realpathSync(target) !== realpathSync(source))
      throw new Error('Remotion 工程依赖来源冲突')
  }
}

export async function renderRemotion(
  runtime: WorkflowRuntime,
  cwd: string,
  signal: AbortSignal,
  final: boolean,
  phase: (message: string) => void,
) {
  signal.throwIfAborted()
  const entry = readFileSync(join(cwd, 'remotion.tsx'), 'utf8')
  if (entry !== REMOTION_ENTRY && entry !== NATIVE_REMOTION_ENTRY)
    throw new Error('冻结 Remotion 入口与应用可信模板不一致，请重新生成粗剪')
  if (entry === NATIVE_REMOTION_ENTRY) {
    const settings = JSON.parse(readFileSync(join(cwd, 'composition.json'), 'utf8'))
    if (
      !Array.isArray(settings.sourceFiles) ||
      settings.sourceFiles.some(
        (name: unknown) =>
          typeof name !== 'string' ||
          !/^(?:visuals|scene-\d+|component-[a-z0-9-]+)\.tsx$/.test(name),
      )
    )
      throw new Error('冻结原生 Remotion 源码清单无效')
    validateNativeSources(
      {
        summary: settings.summary,
        files: settings.sourceFiles.map((name: string) => ({
          name,
          content: readFileSync(join(cwd, name), 'utf8'),
        })),
      },
      settings.scenes.map((scene: { id: string }) => scene.id),
      JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).dependencies,
    )
  }
  try {
    linkRemotionDependencies(runtime, cwd)
  } catch (error) {
    throw new Error(
      `Remotion 依赖检查失败：${(error as Error).message}。请在执行环境选择 @remotion/cli/remotion-cli.js，或安装同版本 CLI 后重试。`,
    )
  }
  const script = /\.[cm]?js$/i.test(realpathSync(runtime.remotionPath!))
  const publicDirectory = join(cwd, 'public')
  mkdirSync(publicDirectory, { recursive: true })
  for (const name of readdirSync(cwd))
    if (REMOTION_PUBLIC_FILE.test(name)) copyFileSync(join(cwd, name), join(publicDirectory, name))
  const output = join(cwd, final ? 'final.mp4' : 'roughcut.mp4')
  phase(`Remotion ${REMOTION_VERSION} · 按帧合成 · 单并发`)
  await workflowCommand(
    script ? runtime.nodePath : runtime.remotionPath!,
    [
      ...(script ? [runtime.remotionPath!] : []),
      'render',
      join(cwd, 'remotion.tsx'),
      'Video',
      output,
      '--public-dir',
      publicDirectory,
      '--codec=h264',
      '--pixel-format=yuv420p',
      '--concurrency=1',
      '--crf',
      final ? '18' : '23',
      '--timeout=60000',
      '--log=error',
      ...(runtime.remotionBrowserPath ? ['--browser-executable', runtime.remotionBrowserPath] : []),
    ],
    {
      cwd,
      signal,
      timeout: 3600000,
      timeoutMessage: 'Remotion 合成超时，原版本已保留；请检查浏览器或缩短视频后重试',
      nodePath: runtime.nodePath,
    },
  )
  return output
}
