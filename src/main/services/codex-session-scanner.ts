import { promises as fs, createReadStream, type Stats } from 'node:fs'
import { join } from 'node:path'
import {
  buildCodexSessionUsageSummary,
  type CodexSessionTokenEvent,
} from '../../shared/codex-session-usage'

export interface ScanDiagnostics {
  scans: number
  bytesRead: number
  parsedLines: number
  maxConcurrentReads: number
}
interface FileIndex {
  stat: Stats
  offset: number
  sourceId: string
  events: CodexSessionTokenEvent[]
  anchor: Buffer
}
const READ_CONCURRENCY = 2
const DAY_MS = 86_400_000
const count = (value: unknown) =>
  Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value)) : 0
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/** Only compact token counters are indexed. Session text is never persisted or returned. */
export class CodexSessionScanner {
  private index = new Map<string, FileIndex>()
  private scans = 0
  async scan(directory: string, now = Date.now()) {
    const diagnostics: ScanDiagnostics = {
      scans: ++this.scans,
      bytesRead: 0,
      parsedLines: 0,
      maxConcurrentReads: 0,
    }
    const files: { path: string; stat: Stats }[] = []
    const walk = async (directory: string) => {
      let entries
      try {
        entries = await fs.readdir(directory, { withFileTypes: true })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
        throw error
      }
      for (const entry of entries) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) await walk(path)
        else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          try {
            const stat = await fs.stat(path)
            if (stat.mtimeMs >= now - 8 * DAY_MS) files.push({ path, stat })
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          }
        }
      }
    }
    await walk(directory)
    const next = new Map<string, FileIndex>()
    let cursor = 0,
      active = 0
    const consume = async () => {
      while (cursor < files.length) {
        const file = files[cursor++]
        const previous = this.index.get(file.path)
        if (
          previous &&
          previous.stat.size === file.stat.size &&
          previous.stat.mtimeMs === file.stat.mtimeMs &&
          previous.stat.ctimeMs === file.stat.ctimeMs &&
          previous.stat.ino === file.stat.ino &&
          previous.stat.dev === file.stat.dev
        ) {
          next.set(file.path, previous)
          continue
        }
        active++
        diagnostics.maxConcurrentReads = Math.max(diagnostics.maxConcurrentReads, active)
        try {
          next.set(file.path, await this.read(file.path, file.stat, previous, diagnostics))
        } finally {
          active--
        }
      }
    }
    const readers = await Promise.allSettled(Array.from({ length: READ_CONCURRENCY }, consume))
    const failure = readers.find((value) => value.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
    const summary = buildCodexSessionUsageSummary(
      [...next.values()].flatMap((value) => value.events),
      { asOf: new Date(now).toISOString().slice(0, 10) },
    )
    this.index = next
    return { summary, diagnostics }
  }
  private async read(
    path: string,
    stat: Stats,
    previous: FileIndex | undefined,
    diagnostics: ScanDiagnostics,
  ): Promise<FileIndex> {
    let reuse =
      previous &&
      previous.stat.ino === stat.ino &&
      previous.stat.dev === stat.dev &&
      stat.size >= previous.stat.size
    // Check the committed boundary before treating a changed file as an append.
    if (reuse && previous!.anchor.length) {
      const handle = await fs.open(path, 'r')
      try {
        const anchor = Buffer.alloc(previous!.anchor.length)
        const { bytesRead } = await handle.read(
          anchor,
          0,
          anchor.length,
          previous!.offset - anchor.length,
        )
        diagnostics.bytesRead += bytesRead
        reuse = anchor.equals(previous!.anchor)
      } finally {
        await handle.close()
      }
    }
    // Same-size writes are replacements, even if their boundary happens to match.
    if (previous && stat.size === previous.stat.size) reuse = false
    const result: FileIndex = reuse
      ? { ...previous!, stat, events: [...previous!.events] }
      : { stat, offset: 0, sourceId: path, events: [], anchor: Buffer.alloc(0) }
    if (stat.size === result.offset) return result
    let pending: Buffer[] = []
    let pendingLength = 0
    const stream = createReadStream(path, {
      start: result.offset,
      end: stat.size - 1,
      highWaterMark: 64 * 1024,
    })
    for await (const chunk of stream) {
      const bytes = chunk as Buffer
      diagnostics.bytesRead += bytes.length
      let start = 0,
        end: number
      while ((end = bytes.indexOf(10, start)) !== -1) {
        const part = bytes.subarray(start, end + 1)
        const lineBytes = pendingLength
          ? Buffer.concat([...pending, part], pendingLength + part.length)
          : part
        this.parse(lineBytes.toString('utf8'), result, diagnostics)
        result.offset += lineBytes.length
        const boundary =
          lineBytes.length >= 128 ? lineBytes : Buffer.concat([result.anchor, lineBytes])
        result.anchor = Buffer.from(boundary.subarray(-128))
        pending = []
        pendingLength = 0
        start = end + 1
      }
      if (start < bytes.length) {
        const tail = bytes.subarray(start)
        pending.push(tail)
        pendingLength += tail.length
      }
    }
    // Unfinished lines stay on disk; the next scan reads them again, including split UTF-8 bytes.
    return result
  }
  private parse(line: string, file: FileIndex, diagnostics: ScanDiagnostics) {
    // Unicode-escaped JSON strings can encode the type names too.
    if (!line.includes('session_meta') && !line.includes('token_count') && !line.includes('\\u'))
      return
    let root: Record<string, unknown> | null
    try {
      diagnostics.parsedLines++
      root = record(JSON.parse(line))
    } catch {
      return
    }
    const payload = record(root?.payload)
    if (root?.type === 'session_meta') {
      const id = payload?.session_id ?? payload?.id
      if (typeof id === 'string' && id) file.sourceId = id
      return
    }
    const total = record(record(payload?.info)?.total_token_usage)
    if (
      root?.type !== 'event_msg' ||
      payload?.type !== 'token_count' ||
      !total ||
      typeof root.timestamp !== 'string'
    )
      return
    const inputTokens = count(total.input_tokens),
      outputTokens = count(total.output_tokens)
    const totalTokens = count(total.total_tokens) || inputTokens + outputTokens
    if (!totalTokens && !inputTokens && !outputTokens) return
    file.events.push({
      sourceId: file.sourceId,
      timestamp: root.timestamp,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        cachedInputTokens: count(total.cached_input_tokens ?? total.cache_read_input_tokens),
      },
    })
  }
}
