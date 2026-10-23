import { createReadStream, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import type { WorkflowFiles } from './files'
import type { WorkflowFile } from '../../../shared/video-workflow'

export function mediaRange(
  header: string | null,
  size: number,
): { status: 200 | 206; start: number; end: number } | { status: 416 } {
  if (!header) return { status: 200, start: 0, end: size - 1 }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) return { status: 416 }
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start ||
    (!match[1] && Number(match[2]) <= 0)
  )
    return { status: 416 }
  return { status: 206, start, end }
}
export function workflowMediaResponse(files: WorkflowFiles, file: WorkflowFile, request: Request) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
  const path = files.path(file),
    size = statSync(path).size
  const range = mediaRange(request.method === 'HEAD' ? null : request.headers.get('range'), size)
  if (range.status === 416)
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  const headers: Record<string, string> = {
    'Content-Type': file.mime,
    'Content-Length': String(range.end - range.start + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  }
  if (range.status === 206) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`
  const body =
    request.method === 'HEAD'
      ? null
      : (Readable.toWeb(
          createReadStream(path, { start: range.start, end: range.end }),
        ) as ConstructorParameters<typeof Response>[0])
  return new Response(body, { status: range.status, headers })
}
