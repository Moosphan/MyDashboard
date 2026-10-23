import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { VOICE_TERMINAL } from '../../../shared/voiceover'
import {
  stageValue,
  splitNarration,
  type AudioPayload,
  type AudioTrack,
  type VideoProject,
  type WorkflowJob,
  type WorkflowRuntime,
  type WorkflowVoice,
} from '../../../shared/video-workflow'
import type { VoiceoverService } from '../voiceover/voiceover-service'
import { managedPath } from '../voiceover/media'
import { WorkflowFiles } from './files'
import { workflowCommand } from './process'

export async function probeMedia(
  runtime: WorkflowRuntime,
  path: string,
  cwd: string,
  signal?: AbortSignal,
) {
  const output = await workflowCommand(
    runtime.ffprobePath,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,width,height',
      '-of',
      'json',
      path,
    ],
    { cwd, signal, timeout: 30000 },
  )
  const data = JSON.parse(output) as {
    format?: { duration: string }
    streams?: { codec_type: string; width?: number; height?: number }[]
  }
  const duration = Number(data.format?.duration)
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 300.1 ||
    !data.streams?.some((stream) => stream.codec_type === 'audio')
  )
    throw new Error('媒体必须包含音轨且时长不超过 300 秒')
  return { duration, streams: data.streams }
}
export function subtitleCues(tracks: AudioTrack[]) {
  let offset = 0
  const cues: { start: number; duration: number; text: string }[] = []
  for (const track of tracks) {
    const chunks = Array.from(track.text.replace(/\s+/g, ' ').trim())
      .join('')
      .match(/.{1,24}/gu) ?? ['']
    const total = chunks.reduce((count, chunk) => count + Array.from(chunk).length, 0) || 1
    let position = offset
    for (const chunk of chunks) {
      const duration = (track.duration * Array.from(chunk).length) / total
      cues.push({ start: position, duration, text: chunk })
      position += duration
    }
    offset += track.duration
  }
  return cues
}
function srtTime(value: number) {
  const milliseconds = Math.round(value * 1000)
  return `${String(Math.floor(milliseconds / 3600000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')},${String(milliseconds % 1000).padStart(3, '0')}`
}
export async function createWorkflowAudio(input: {
  project: VideoProject
  job: WorkflowJob
  voice: WorkflowVoice
  service: VoiceoverService
  files: WorkflowFiles
  runtime: WorkflowRuntime
  cwd: string
  signal: AbortSignal
  phase: (message: string) => void
  progress?: (progress: { tracks: AudioTrack[]; total: number }) => void | Promise<void>
  imports?: string[]
}): Promise<AudioPayload> {
  const { project, job, voice, service, files, runtime, cwd, signal, phase, imports } = input
  const scenes = stageValue(project, 'narration')!.scenes
  if (imports && imports.length !== scenes.length)
    throw new Error('请按分镜顺序选择音频，文件数量需与分镜数量一致')
  if (!imports && voice.engine !== 'edge') {
    const runtime = service.runtime.get()
    if (
      !runtime.engines[voice.engine].ready ||
      (voice.options.denoise && !runtime.denoising?.ready)
    ) {
      signal.throwIfAborted()
      phase('检测本地配音与降噪环境')
      await service.runtime.check()
      signal.throwIfAborted()
    }
  }
  const tracks: AudioTrack[] = [],
    normalized: string[] = []
  const trackCount = scenes.reduce(
    (count, scene) => count + (imports ? 1 : splitNarration(scene.text).length),
    0,
  )
  let total = 0
  mkdirSync(cwd, { recursive: true })
  for (const [sceneIndex, scene] of scenes.entries()) {
    const chunks = imports ? [scene.text] : splitNarration(scene.text)
    for (const [chunkIndex, text] of chunks.entries()) {
      signal.throwIfAborted()
      phase(`配音 ${sceneIndex + 1}/${scenes.length} 镜 · 第 ${chunkIndex + 1}/${chunks.length} 段`)
      let source = imports?.[sceneIndex]
      if (!source) {
        const voiceJob = await service.create({
          ...voice,
          text,
          clientRequestId: `workflow:${job.id}:${sceneIndex}:${chunkIndex}`,
        })
        const cancel = () => {
          service.jobs.cancel(voiceJob.id)
        }
        signal.addEventListener('abort', cancel, { once: true })
        try {
          let state = voiceJob
          while (!VOICE_TERMINAL.includes(state.state)) {
            await delay(350, undefined, { signal })
            state = service.jobs.get(voiceJob.id)!
          }
          if (state.state !== 'succeeded' || !state.assetId)
            throw new Error(state.error ?? `配音${state.phase}`)
          source = managedPath(service.root, service.assets.asset(state.assetId).file_path)
        } finally {
          signal.removeEventListener('abort', cancel)
          if (signal.aborted) service.jobs.cancel(voiceJob.id)
        }
      }
      await probeMedia(runtime, source, cwd, signal)
      const path = join(cwd, `audio-${tracks.length}.wav`)
      await workflowCommand(
        runtime.ffmpegPath,
        [
          '-nostdin',
          '-y',
          '-i',
          source,
          '-vn',
          '-ac',
          '1',
          '-ar',
          '48000',
          '-c:a',
          'pcm_s16le',
          path,
        ],
        { cwd, signal, timeout: 60000 },
      )
      const { duration } = await probeMedia(runtime, path, cwd, signal)
      total += duration
      if (total > 300) throw new Error('实际配音超过 5 分钟，请缩短口播后重新生成')
      normalized.push(path)
      tracks.push({ sceneId: scene.id, text, duration, file: await files.import(project.id, path) })
      signal.throwIfAborted()
      await input.progress?.({ tracks: [...tracks], total: trackCount })
    }
  }
  const list = join(cwd, 'concat.txt')
  writeFileSync(list, normalized.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join('\n'))
  const combined = join(cwd, 'narration.wav')
  phase('合并音轨与字幕，校验真实时长')
  await workflowCommand(
    runtime.ffmpegPath,
    ['-nostdin', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'pcm_s16le', combined],
    { cwd, signal, timeout: 60000 },
  )
  const { duration } = await probeMedia(runtime, combined, cwd, signal)
  const subtitles = subtitleCues(tracks)
    .map(
      (cue, index) =>
        `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.start + cue.duration)}\n${cue.text}\n`,
    )
    .join('\n')
  return {
    tracks,
    file: await files.import(project.id, combined),
    subtitles: await files.write(project.id, subtitles, '.srt'),
    duration,
    ...(imports ? {} : { voice }),
  }
}
