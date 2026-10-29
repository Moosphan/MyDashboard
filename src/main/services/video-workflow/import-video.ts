import { copyFile, mkdir, rm } from 'node:fs/promises'
import { lstatSync } from 'node:fs'
import { basename, extname, isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  VideoWorkflowRepository,
  fingerprint,
} from '../../database/repositories/video-workflow-repository'
import type { RenderPayload, WorkflowRuntime } from '../../../shared/video-workflow'
import { WorkflowFiles } from './files'
import { workflowCommand } from './process'

export async function importFinishedVideo(
  repository: VideoWorkflowRepository,
  files: WorkflowFiles,
  runtime: WorkflowRuntime,
  title: string,
  source: string,
  description: string,
  requestId: string,
  signal: AbortSignal,
) {
  if (typeof title !== 'string' || !title.trim() || title.length > 120)
    throw new Error('项目名称需为 1–120 字')
  if (typeof description !== 'string' || description.length > 5000)
    throw new Error('视频内容说明最多 5000 字符')
  if (typeof source !== 'string' || !isAbsolute(source) || extname(source).toLowerCase() !== '.mp4')
    throw new Error('请选择本地 MP4 成品视频')
  if (typeof requestId !== 'string' || !requestId || requestId.length > 120)
    throw new Error('缺少导入请求 ID')
  const requestValue = ['import-video', title.trim(), source, description.trim()]
  const previous = repository.db
    .prepare('SELECT project_id,fingerprint FROM video_workflow_requests WHERE request_id=?')
    .get(requestId) as { project_id: string; fingerprint: string } | undefined
  if (previous) {
    if (previous.fingerprint !== fingerprint(requestValue))
      throw new Error('请求 ID 已用于不同操作')
    return repository.get(previous.project_id)
  }
  const stat = lstatSync(source)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 1024 ** 3)
    throw new Error('仅支持 1 GB 以内的普通非空 MP4 文件')
  const cache = join(files.root, 'cache', 'video-import', randomUUID())
  let projectId: string | undefined
  try {
    await mkdir(cache, { recursive: true })
    const videoPath = join(cache, 'video.mp4'),
      coverPath = join(cache, 'cover.png')
    await copyFile(source, videoPath)
    const raw = await workflowCommand(
      runtime.ffprobePath,
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-show_entries',
        'format=duration,format_name:stream=codec_type,codec_name,width,height:stream_disposition=attached_pic:stream_side_data=rotation',
        '-of',
        'json',
        videoPath,
      ],
      { cwd: cache, signal, timeout: 30000 },
    )
    const probe = JSON.parse(raw) as {
      format?: { duration?: string; format_name?: string }
      streams?: {
        codec_type?: string
        codec_name?: string
        width?: number
        height?: number
        disposition?: { attached_pic?: number }
        side_data_list?: { rotation?: number }[]
      }[]
    }
    const video = probe.streams?.find(
      (stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic,
    )
    const duration = Number(probe.format?.duration)
    if (
      !probe.format?.format_name?.split(',').includes('mp4') ||
      !video ||
      video.codec_name !== 'h264' ||
      probe.streams?.some((stream) => stream.codec_type === 'audio' && stream.codec_name !== 'aac')
    )
      throw new Error('请使用 H.264 视频、AAC 音轨的 MP4 文件；可导入无音轨视频')
    if (!Number.isFinite(duration) || duration <= 0 || duration > 300)
      throw new Error('成品视频时长需在 0–300 秒内')
    let width = Number(video.width),
      height = Number(video.height)
    const rotation =
      video.side_data_list?.find((item) => item.rotation !== undefined)?.rotation ?? 0
    if (Math.abs(rotation % 180) === 90) [width, height] = [height, width]
    if (![width, height].every((value) => Number.isInteger(value) && value >= 16 && value <= 8192))
      throw new Error('视频分辨率无效，宽高需为 16–8192 像素')
    await workflowCommand(
      runtime.ffmpegPath,
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-ss',
        String(Math.min(1, duration / 2)),
        '-i',
        videoPath,
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        '-vf',
        "scale=w='min(1600,iw)':h='min(900,ih)':force_original_aspect_ratio=decrease",
        '-update',
        '1',
        coverPath,
      ],
      { cwd: cache, signal, timeout: 30000 },
    )
    if (signal.aborted) throw new Error('导入已取消')
    const project = repository.create(title)
    projectId = project.id
    const file = await files.import(project.id, videoPath)
    const cover = await files.import(project.id, coverPath)
    if (signal.aborted) throw new Error('导入已取消')
    const render: RenderPayload = {
      file,
      cover,
      duration,
      width,
      height,
      compositionFiles: [],
      compositionNames: [],
      manifestHash: file.sha256,
      checks: '已检测 MP4 编码、时长、分辨率并抽取封面；原视频已复制到项目，未重新渲染。',
      imported: { filename: basename(source), description: description.trim() },
    }
    return repository.completeVideoImport(project.id, render, requestId, requestValue)
  } catch (error) {
    if (projectId) {
      repository.discardIncompleteImport(projectId)
      await rm(join(files.root, 'media', 'video-workflow', projectId), {
        recursive: true,
        force: true,
      })
    }
    throw error
  } finally {
    await rm(cache, { recursive: true, force: true })
  }
}
