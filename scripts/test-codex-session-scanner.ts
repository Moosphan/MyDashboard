import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, appendFile, rename, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CodexSessionScanner } from '../src/main/services/codex-session-scanner'
import { createCodexSessionUsageService } from '../src/main/services/codex-session-usage-service'

const date = new Date().toISOString().slice(0, 10)
const meta = (id: string) => JSON.stringify({ type: 'session_meta', payload: { id } }) + '\n'
const event = (count: number, second = 0) =>
  JSON.stringify({
    type: 'event_msg',
    timestamp: `${date}T12:00:${String(second).padStart(2, '0')}Z`,
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: { input_tokens: count, output_tokens: 2, total_tokens: count + 2 },
      },
    },
  }) + '\n'

test('built worker incrementally scans, shares requests, handles partial tails and replaced files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usage-synthetic-'))
  const service = createCodexSessionUsageService({
    directory,
    workerPath:
      process.env.CODEX_USAGE_TEST_WORKER ??
      join(process.cwd(), 'out/main/codex-session-usage-worker.js'),
  })
  try {
    const path = join(directory, 'a.jsonl')
    await writeFile(path, meta('synthetic-a') + event(10))
    const results = await Promise.all(Array.from({ length: 6 }, () => service.get(true)))
    assert.equal(results[0].totalTokens, 12)
    assert.equal(service.diagnostics.scans, 1)
    assert.ok(service.diagnostics.maxConcurrentReads <= 2)
    await service.get(true)
    assert.equal(service.diagnostics.bytesRead, 0)
    const largeLine =
      JSON.stringify({ type: 'response_item', payload: { text: 'synthetic'.repeat(200_000) } }) +
      '\n'
    await appendFile(path, largeLine)
    assert.equal((await service.get(true)).totalTokens, 12)
    assert.equal(service.diagnostics.parsedLines, 0)
    const next = event(20, 1)
    await appendFile(path, next.slice(0, -5))
    assert.equal((await service.get(true)).totalTokens, 12)
    await appendFile(path, next.slice(-5))
    assert.equal((await service.get(true)).totalTokens, 22)
    assert.ok(service.diagnostics.bytesRead < Buffer.byteLength(next) + 256)
    const utf8 = Buffer.from(
      meta('synthetic-a') +
        JSON.stringify({ type: 'session_meta', payload: { id: '合成会话' } }) +
        '\n',
    )
    const split = utf8.indexOf(Buffer.from('合')) + 1
    await writeFile(path, utf8.subarray(0, split))
    assert.equal((await service.get(true)).totalTokens, 0)
    await appendFile(path, Buffer.concat([utf8.subarray(split), Buffer.from(event(3))]))
    assert.equal((await service.get(true)).totalTokens, 5)
    await writeFile(path, meta('synthetic-a') + event(3))
    assert.equal((await service.get(true)).totalTokens, 5)
    await writeFile(join(directory, 'replacement'), meta('synthetic-b') + event(40))
    await rename(join(directory, 'replacement'), path)
    assert.equal((await service.get(true)).totalTokens, 42)
    // Duplicate cumulative events and counter rollback use the existing aggregator rules.
    await appendFile(path, event(40, 1) + event(20, 2) + event(25, 3))
    assert.equal((await service.get(true)).totalTokens, 47)
    await rm(directory, { recursive: true })
    await writeFile(directory, 'not a directory')
    assert.equal(
      (await service.get(true)).totalTokens,
      47,
      'failure retains last successful result',
    )
  } finally {
    await service.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

test('synthetic large scan leaves caller heartbeat within the initial 100 ms P95 budget', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usage-heartbeat-'))
  const service = createCodexSessionUsageService({
    directory,
    workerPath:
      process.env.CODEX_USAGE_TEST_WORKER ??
      join(process.cwd(), 'out/main/codex-session-usage-worker.js'),
  })
  const samples: number[] = []
  let last = performance.now()
  const timer = setInterval(() => {
    const now = performance.now()
    samples.push(now - last)
    last = now
  }, 5)
  try {
    const irrelevant =
      JSON.stringify({ type: 'response_item', payload: { text: 'synthetic'.repeat(1024) } }) + '\n'
    for (let index = 0; index < 4; index++)
      await writeFile(
        join(directory, `${index}.jsonl`),
        meta(`synthetic-${index}`) + irrelevant.repeat(2048) + event(10),
      )
    const result = await service.get(true)
    assert.equal(result.totalTokens, 48)
    assert.ok(service.diagnostics.maxConcurrentReads <= 2)
    assert.equal(service.diagnostics.parsedLines, 8)
    samples.sort((a, b) => a - b)
    const p95 = samples[Math.floor(samples.length * 0.95)]
    assert.ok(samples.length >= 5)
    assert.ok(p95 <= 100, `synthetic heartbeat P95 ${p95.toFixed(1)} ms exceeds 100 ms`)
    console.log(
      JSON.stringify({
        benchmark: 'synthetic-session-scan',
        bytesRead: service.diagnostics.bytesRead,
        heartbeatP95Ms: Math.round(p95),
        maxConcurrentReads: service.diagnostics.maxConcurrentReads,
      }),
    )
  } finally {
    clearInterval(timer)
    await service.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

test('worker startup failure is sanitized and a later request can recover', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usage-recovery-'))
  const workerPath = join(directory, 'worker.cjs')
  const service = createCodexSessionUsageService({ directory, workerPath })
  try {
    await writeFile(join(directory, 'session.jsonl'), meta('synthetic-recovery') + event(5))
    await assert.rejects(service.get(true), { message: 'Codex 用量后台统计失败' })
    await copyFile(join(process.cwd(), 'out/main/codex-session-usage-worker.js'), workerPath)
    assert.equal((await service.get(true)).totalTokens, 7)
  } finally {
    await service.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

test('disposing an active service stops its worker and prevents further requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usage-dispose-'))
  const service = createCodexSessionUsageService({
    directory,
    workerPath: join(process.cwd(), 'out/main/codex-session-usage-worker.js'),
  })
  try {
    const pending = assert.rejects(service.get(true), { message: 'Codex 用量统计已停止' })
    await service.dispose()
    await pending
    await assert.rejects(service.get(), { message: 'Codex 用量统计已停止' })
  } finally {
    await service.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

// A producer may escape JSON string values; candidate filtering must not drop valid counters.
test('candidate filtering accepts escaped JSON type names', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usage-escaped-'))
  try {
    const line = event(8).replace('token_count', String.raw`token_\u0063ount`)
    await writeFile(join(directory, 'escaped.jsonl'), meta('synthetic') + line)
    assert.equal((await new CodexSessionScanner().scan(directory)).summary.totalTokens, 10)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
