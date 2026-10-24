import assert from 'node:assert/strict'
import test from 'node:test'
import { Agent } from 'node:https'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import Database from 'better-sqlite3'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runMigrations } from '../src/main/database/migrations'
import { VoiceRepository } from '../src/main/database/repositories/voice-repository'
import { VoiceJobManager, type VoiceAdapter } from '../src/main/services/voiceover/job-manager'
import { resolveVoiceRequest, mergeVoiceJobs } from '../src/shared/voiceover'
import { managedPath, readAudioData } from '../src/main/services/voiceover/media'
import { runVoiceWorker } from '../src/main/services/voiceover/python-adapter'
import { VoiceRuntimeManager } from '../src/main/services/voiceover/runtime-manager'
import { VoiceProfileStore, probeAudio } from '../src/main/services/voiceover/profile-store'
import { VoiceAssetStore } from '../src/main/services/voiceover/asset-writer'
import { createBackup, restoreBackup } from '../src/main/services/backup-service'
import { createEdgeAdapter } from '../src/main/services/voiceover/edge-adapter'
import { createHash } from 'node:crypto'
import { LocalVoiceQueue } from '../src/main/services/voiceover/local-voice-queue'
import { runCommand } from '../src/main/services/voiceover/process'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dashboard-voice-'))
  const db = new Database(':memory:')
  runMigrations(db)
  const repository = new VoiceRepository(db)
  return { root, db, repository, close() { db.close(); rmSync(root, { recursive: true, force: true }) } }
}

const request = (id: string) => ({ clientRequestId: id, engine: 'edge' as const, text: 'Hello world', voiceId: 'en-US-AriaNeural', options: { rate: 0, pitchHz: 0, volume: 0 } })
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))
async function waitUntil(condition: () => boolean) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (condition()) return
    await delay(10)
  }
  assert.fail('Timed out waiting for task')
}

test('validates engine-specific parameters without leaking preset options', () => {
  assert.equal(resolveVoiceRequest({ clientRequestId: 'one', engine: 'voxcpm2', text: '你好', profileId: 'profile', profileRevision: 1, options: {} }).options.steps, 20)
  assert.throws(() => resolveVoiceRequest({ ...request('two'), text: '  ' }), /文案/)
  assert.throws(() => resolveVoiceRequest({ ...request('three'), engine: 'voxcpm2', profileId: 'profile', profileRevision: 1, options: { pitchHz: 10 } }), /参数/)
  assert.throws(() => resolveVoiceRequest({ ...request('four'), text: '字'.repeat(301) }), /300/)
})

test('reference denoising is an explicit boolean for both clone engines and unavailable to Edge', () => {
  for (const engine of ['voxcpm2', 'qwen3-tts']) {
    const input = { clientRequestId: `denoise-${engine}`, engine, text: '你好', profileId: 'profile', profileRevision: 1, options: {} }
    assert.equal(resolveVoiceRequest(input).options.denoise, false)
    for (const denoise of [true, false]) assert.equal(resolveVoiceRequest({ ...input, options: { denoise } }).options.denoise, denoise)
    for (const denoise of ['true', 1, null]) assert.throws(() => resolveVoiceRequest({ ...input, options: { denoise } }), /降噪/)
  }
  assert.throws(() => resolveVoiceRequest({ ...request('edge-denoise'), options: { denoise: true } }), /参数/)
})

test('VoxCPM2 prompt pause defaults to 320ms, supports zero, and stays engine-specific', () => {
  const input = { clientRequestId: 'prompt-pause', engine: 'voxcpm2', text: '你好', profileId: 'profile', profileRevision: 1, options: {} }
  assert.equal(resolveVoiceRequest(input).options.promptPauseMs, 320)
  for (const promptPauseMs of [0, 160, 320, 1000]) {
    assert.equal(resolveVoiceRequest({ ...input, options: { promptPauseMs } }).options.promptPauseMs, promptPauseMs)
  }
  for (const promptPauseMs of [-1, 1001, NaN, Infinity, '320']) {
    assert.throws(() => resolveVoiceRequest({ ...input, options: { promptPauseMs } }), /参数/)
  }
  assert.throws(() => resolveVoiceRequest({ ...input, engine: 'qwen3-tts', options: { promptPauseMs: 320 } }), /参数/)
  assert.throws(() => resolveVoiceRequest({ ...request('edge-pause'), options: { promptPauseMs: 320 } }), /参数/)
})

test('reference denoising forwards the cleaned hash, preserves source audio, and skips work when disabled', async () => {
  const { prepareVoiceReference } = await import('../src/main/services/voiceover/reference-denoiser')
  const root = mkdtempSync(join(tmpdir(), 'voice-denoise-'))
  const runtime = new VoiceRuntimeManager(root)
  const source = join(root, 'reference.wav')
  const output = join(root, 'clean.wav')
  const sourceBytes = Buffer.from('original reference')
  writeFileSync(source, sourceBytes)
  const sha256 = createHash('sha256').update(sourceBytes).digest('hex')
  let calls = 0
  const execute: typeof runCommand = async (_python, args, signal) => {
    calls++
    assert.equal(signal?.aborted, false)
    assert.ok(args.includes(source))
    assert.ok(args.includes(sha256))
    writeFileSync(output, 'cleaned reference')
    return JSON.stringify({ sampleRate: 16000, duration: 4 })
  }
  const state = runtime.get()
  state.denoising = { ready: true, reason: 'ready' }
  try {
    const disabled = await prepareVoiceReference({ enabled: false, referencePath: source, referenceSha256: sha256, outputPath: output, workerPath: '/resources/worker.py', runtime: state }, new AbortController().signal, () => {}, execute)
    assert.equal(disabled.path, source)
    assert.equal(disabled.sha256, sha256)
    assert.equal(calls, 0)
    const phases: string[] = []
    const cleaned = await prepareVoiceReference({ enabled: true, referencePath: source, referenceSha256: sha256, outputPath: output, workerPath: '/resources/worker.py', runtime: state }, new AbortController().signal, phase => phases.push(phase), execute)
    assert.equal(cleaned.path, output)
    assert.equal(cleaned.sha256, createHash('sha256').update(readFileSync(output)).digest('hex'))
    assert.equal(cleaned.denoising?.model, 'iic/speech_zipenhancer_ans_multiloss_16k_base')
    assert.equal(calls, 1)
    assert.ok(phases.some(phase => phase.includes('降噪')))
    assert.deepEqual(readFileSync(source), sourceBytes)
    await assert.rejects(prepareVoiceReference({ enabled: true, referencePath: source, referenceSha256: sha256, outputPath: output, workerPath: '/resources/worker.py', runtime: { ...state, denoising: { ready: false, reason: '降噪环境未就绪' } } }, new AbortController().signal, () => {}, execute), /降噪环境未就绪/)
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(prepareVoiceReference({ enabled: true, referencePath: source, referenceSha256: sha256, outputPath: output, workerPath: '/resources/worker.py', runtime: state }, controller.signal, () => {}, execute), /取消/)
    assert.equal(calls, 1)
    await assert.rejects(prepareVoiceReference({ enabled: true, referencePath: source, referenceSha256: sha256, outputPath: output, workerPath: '/resources/worker.py', runtime: state }, new AbortController().signal, () => {}, async () => { throw new Error('denoiser failed') }), /denoiser failed/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('late snapshots do not replace newer terminal task state', () => {
  const job = { id: 'one', revision: 5, state: 'succeeded' as const, phase: '完成', attemptId: 'attempt', request: request('snapshot'), assetId: 1, error: null, createdAt: '2026-10-21', updatedAt: '2026-10-21' }
  const merged = mergeVoiceJobs([job], [{ ...job, revision: 2, state: 'generating' }])
  assert.equal(merged[0].state, 'succeeded')
})

test('deduplicates requests, serializes execution and registers one asset per completed job', async () => {
  const context = fixture()
  let running = 0
  let maximum = 0
  const adapter: VoiceAdapter = async job => {
    running++
    maximum = Math.max(maximum, running)
    await delay(25)
    const folder = join(context.root, 'cache', 'voice-jobs', job.id)
    mkdirSync(folder, { recursive: true })
    const path = join(folder, 'raw.wav')
    writeFileSync(path, Buffer.alloc(48))
    running--
    return { path, duration: 1, sampleRate: 24000 }
  }
  const manager = new VoiceJobManager(context.repository, context.root, adapter)
  try {
    const first = manager.create(request('first'))
    assert.equal(manager.create(request('first')).id, first.id)
    const second = manager.create(request('second'))
    await waitUntil(() => manager.get(second.id)?.state === 'succeeded')
    assert.equal(maximum, 1)
    assert.equal(context.db.prepare('SELECT count(*) AS count FROM video_assets').get().count, 2)
    const result = manager.get(first.id)!
    assert.ok(result.assetId)
    const asset = context.db.prepare('SELECT * FROM video_assets WHERE id = ?').get(result.assetId)
    assert.equal(JSON.parse(asset.metadata).engine, 'edge')
    assert.ok(existsSync(join(context.root, asset.file_path)))
  } finally { await manager.dispose(); context.close() }
})

test('cancelled late results never register a playable asset', async () => {
  const context = fixture()
  let release: (() => void) | undefined
  const manager = new VoiceJobManager(context.repository, context.root, async job => {
    await new Promise<void>(resolve => { release = resolve })
    const path = join(context.root, 'cache', 'voice-jobs', job.id, 'raw.wav')
    mkdirSync(join(context.root, 'cache', 'voice-jobs', job.id), { recursive: true })
    writeFileSync(path, Buffer.alloc(48))
    return { path, duration: 1, sampleRate: 24000 }
  })
  try {
    const job = manager.create(request('cancel'))
    await waitUntil(() => Boolean(release))
    manager.cancel(job.id)
    release!()
    await waitUntil(() => manager.get(job.id)?.state === 'cancelled')
    assert.equal(context.db.prepare('SELECT count(*) AS count FROM video_assets').get().count, 0)
  } finally { await manager.dispose(); context.close() }
})

test('postprocessing preserves raw output and recycles the whole generated bundle', async () => {
  const context = fixture()
  const manager = new VoiceJobManager(context.repository, context.root, async job => {
    const directory = join(context.root, 'cache', 'voice-jobs', job.id)
    const rawPath = join(directory, 'raw.wav')
    const path = join(directory, 'output.wav')
    writeFileSync(rawPath, Buffer.alloc(64))
    writeFileSync(path, Buffer.alloc(48))
    return { path, rawPath, duration: 1, sampleRate: 24000, referenceDenoising: { model: 'iic/speech_zipenhancer_ans_multiloss_16k_base', sha256: 'cleaned-reference-hash', sampleRate: 16000 } }
  })
  try {
    const job = manager.create(request('gain-output'))
    await waitUntil(() => manager.get(job.id)?.state === 'succeeded')
    const store = new VoiceAssetStore(context.root, context.repository)
    const asset = store.asset(manager.get(job.id)!.assetId!)
    const metadata = JSON.parse(asset.metadata)
    assert.equal(metadata.referenceDenoising.sha256, 'cleaned-reference-hash')
    assert.notEqual(metadata.rawPath, asset.file_path)
    assert.ok(existsSync(join(context.root, metadata.rawPath)))
    store.trash(asset.id)
    assert.equal(existsSync(join(context.root, metadata.rawPath)), false)
    store.restore(asset.id)
    assert.ok(existsSync(join(context.root, metadata.rawPath)))
    assert.ok(existsSync(join(context.root, asset.file_path)))
  } finally { await manager.dispose(); context.close() }
})

test('profiles retain immutable revisions and survive a new repository instance', () => {
  const context = fixture()
  try {
    const first = context.repository.saveProfile({ name: '我的声音', transcript: '参考文字', referencePath: 'media/voice-profiles/reference.wav', originalPath: 'media/voice-profiles/original.m4a', sha256: 'hash', duration: 8 })
    context.repository.saveProfile({ id: first.id, name: '我的声音', transcript: '修改文字', referencePath: 'media/voice-profiles/reference.wav', originalPath: 'media/voice-profiles/original.m4a', sha256: 'hash', duration: 8 })
    const repository = new VoiceRepository(context.db)
    assert.equal(repository.profile(first.id)!.currentRevision, 2)
    assert.equal(repository.profile(first.id)!.revisions[0].transcript, '参考文字')
  } finally { context.close() }
})

test('recovers unfinished tasks as interrupted without recreating completed assets', async () => {
  const context = fixture()
  try {
    const job = context.repository.createJob(resolveVoiceRequest(request('restart')))
    context.repository.updateJob(job.id, { state: 'generating' })
    const manager = new VoiceJobManager(context.repository, context.root, async () => { throw new Error('must not execute') })
    assert.equal(manager.get(job.id)?.state, 'interrupted')
    await manager.dispose()
  } finally { context.close() }
})

test('rejects traversal and returns actual audio MIME', () => {
  const context = fixture()
  try {
    assert.throws(() => managedPath(context.root, '../outside.wav'), /路径/)
    assert.throws(() => managedPath(context.root, '/etc/passwd'), /路径/)
    mkdirSync(join(context.root, 'media'), { recursive: true })
    writeFileSync(join(context.root, 'media', 'test.wav'), Buffer.alloc(48))
    assert.equal(readAudioData(context.root, 'media/test.wav').mimeType, 'audio/wav')
    symlinkSync(tmpdir(), join(context.root, 'outside-link'))
    assert.throws(() => managedPath(context.root, 'outside-link/not-yet-created.wav'), /路径/)
  } finally { context.close() }
})

test('worker protocol validates identity, rejects stray output and observes cancellation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'voice-worker-'))
  const script = join(root, 'worker.cjs')
  try {
    writeFileSync(script, `process.stdin.once('data', data => { const request = JSON.parse(data.toString().split('\\n')[0]); console.log(JSON.stringify({protocolVersion:1,jobId:request.jobId,attemptId:request.attemptId,type:'result',path:'raw.wav',duration:2,sampleRate:24000})); process.exit(0) })`)
    const result = await runVoiceWorker(process.execPath, script, { jobId: 'job', attemptId: 'attempt' }, new AbortController().signal)
    assert.equal(result.sampleRate, 24000)
    writeFileSync(script, `process.stdin.once('data', () => { console.log(JSON.stringify({protocolVersion:1,jobId:'wrong-job',attemptId:'attempt',type:'result',path:'raw.wav',duration:2,sampleRate:24000})); process.exit(0) })`)
    await assert.rejects(runVoiceWorker(process.execPath, script, { jobId: 'job', attemptId: 'attempt' }, new AbortController().signal), /身份/)
    writeFileSync(script, `process.stdin.once('data', () => { const output = JSON.stringify({protocolVersion:1,jobId:'job',attemptId:'attempt',type:'result',path:'raw.wav',duration:2,sampleRate:24000})+'\\n'; process.stdout.write(output.slice(0, 10)); setTimeout(() => { process.stdout.write(output.slice(10)); process.exit(0) }, 10) })`)
    assert.equal((await runVoiceWorker(process.execPath, script, { jobId: 'job', attemptId: 'attempt' }, new AbortController().signal)).duration, 2)
    writeFileSync(script, `console.log('not-json'); setInterval(() => {}, 1000)`)
    await assert.rejects(runVoiceWorker(process.execPath, script, { jobId: 'job', attemptId: 'attempt' }, new AbortController().signal), /协议/)
    writeFileSync(script, `process.stdin.resume(); setInterval(() => {}, 1000)`)
    const controller = new AbortController()
    const pending = runVoiceWorker(process.execPath, script, { jobId: 'job', attemptId: 'attempt' }, controller.signal)
    controller.abort()
    await assert.rejects(pending, /取消/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('runtime reports unsupported platforms without executing MLX or downloading models', async () => {
  const root = mkdtempSync(join(tmpdir(), 'voice-runtime-'))
  try {
    const runtime = new VoiceRuntimeManager(root, 'linux', 'x64')
    const state = await runtime.check()
    assert.equal(state.supported, false)
    assert.equal(state.engines.voxcpm2.ready, false)
    assert.match(state.engines['qwen3-tts'].reason, /Apple Silicon/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('reference import transcribes the selected range automatically and preserves optional corrections', async () => {
  const context = fixture()
  const source = join(context.root, 'reference.wav')
  const rate = 24000
  const audio = Buffer.alloc(44 + rate * 8 * 2)
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8)
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22)
  audio.writeUInt32LE(rate, 24); audio.writeUInt32LE(rate * 2, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34)
  audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40)
  for (let index = 0; index < rate * 8; index++) audio.writeInt16LE(Math.round(8000 * Math.sin(index * 440 * Math.PI * 2 / rate)), 44 + index * 2)
  writeFileSync(source, audio)
  const runtime = new VoiceRuntimeManager(context.root)
  const ranges: string[] = []
  const profiles = new VoiceProfileStore(context.root, context.repository, runtime, async (path) => {
    ranges.push(path)
    return '自动识别的参考文字'
  })
  try {
    const draft = await profiles.importReference(source)
    rmSync(source)
    await assert.rejects(profiles.transcribe(draft.id, 0, 2), /3–30/)
    const recognized = await Promise.all([profiles.transcribe(draft.id, 0, 8), profiles.transcribe(draft.id, 0, 8)])
    assert.equal(recognized[0].transcript, '自动识别的参考文字')
    assert.equal(ranges.length, 1)
    await profiles.transcribe(draft.id, 1, 7)
    assert.equal(ranges.length, 2, 'a changed selection requires its own transcription')
    const profile = await profiles.save({ draftId: draft.id, name: '我的音色', start: 0, end: 8 })
    assert.equal(ranges.length, 2, 'saving reuses the exact range transcription')
    assert.equal(profile.revisions[0].duration, 8)
    assert.deepEqual(profile.revisions[0].segment, { start: 0, end: 8 })
    assert.ok(profile.revisions[0].originalSha256)
    assert.ok(existsSync(join(context.root, profile.revisions[0].referencePath)))
    const edited = await profiles.save({ profileId: profile.id, name: '声音改名', transcript: '准确文字', confirmed: true })
    assert.equal(edited.currentRevision, 2)
    assert.equal(edited.revisions[0].transcript, '自动识别的参考文字')
    const renamed = await profiles.save({ profileId: profile.id, name: '只改名称' })
    assert.equal(renamed.revisions.at(-1)?.transcript, '准确文字')
  } finally { context.close() }
})

test('waveform and selected audition cover audio after 30 seconds and save only the chosen segment', async () => {
  const context = fixture()
  const runtime = new VoiceRuntimeManager(context.root)
  const source = join(context.root, 'long-reference.wav')
  const profiles = new VoiceProfileStore(context.root, context.repository, runtime, async () => '选中的讲话')
  try {
    await runCommand(runtime.get().config.ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=600:duration=42', '-af', "volume=enable='lt(t,33)+gt(t,40)':volume=0", source])
    const originalSha = createHash('sha256').update(readFileSync(source)).digest('hex')
    const draft = await profiles.importReference(source)
    assert.ok(draft.waveform && draft.waveform.length >= 100 && draft.waveform.length <= 1200)
    assert.ok(draft.waveform.every(peak => Number.isFinite(peak) && peak >= 0 && peak <= 1))
    assert.ok(Math.max(...draft.waveform.slice(0, Math.floor(draft.waveform.length / 2))) < 0.001)
    assert.ok(Math.max(...draft.waveform.slice(Math.floor(draft.waveform.length * 0.81), Math.floor(draft.waveform.length * 0.94))) > 0.05)
    const preview = await profiles.preview(draft.id, 34, 40)
    const audition = join(context.root, 'audition.wav')
    writeFileSync(audition, Buffer.from(preview.dataUrl.split(',')[1], 'base64'))
    assert.ok(Math.abs((await probeAudio(runtime.get().config.ffprobePath, audition)).duration - 6) < 0.02)
    for (const [start, end] of [[0, 2], [0, 31], [-1, 4], [40, 44], [8, 4], [NaN, 8]]) {
      await assert.rejects(async () => profiles.preview(draft.id, start, end), /3–30/)
    }
    const profile = await profiles.save({ draftId: draft.id, name: '干净片段', start: 34, end: 40 })
    const reference = profile.revisions[0]
    assert.deepEqual(reference.segment, { start: 34, end: 40 })
    assert.ok(Math.abs(reference.duration - 6) < 0.02)
    assert.equal(reference.transcript, '选中的讲话')
    assert.equal(reference.originalSha256, originalSha)
    assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'), originalSha)
  } finally { await profiles.dispose(); context.close() }
})

test('reference boundary movement preserves valid decimal selections and recording limits', async () => {
  const { referenceSelectionError, moveReferenceBoundary, shiftReferenceSelection } = await import('../src/shared/voice-reference')
  assert.equal(referenceSelectionError(42, 1.1, 4.1), null)
  assert.deepEqual(moveReferenceBoundary({ start: 0, end: 15 }, 'start', 20, 42), { start: 12, end: 15 })
  assert.deepEqual(moveReferenceBoundary({ start: 34, end: 40 }, 'end', 45, 42), { start: 34, end: 42 })
  assert.deepEqual(moveReferenceBoundary({ start: 34, end: 40 }, 'start', 0, 42), { start: 10, end: 40 })
  assert.deepEqual(moveReferenceBoundary({ start: 39, end: 42 }, 'end', 42.006, 42.006), { start: 39, end: 42.006 })
  assert.equal(referenceSelectionError(42, 39, 42.005), '请选择 3–30 秒的参考片段')
  assert.equal(referenceSelectionError(42, 0, 30.02), '请选择 3–30 秒的参考片段')
  const shifted = shiftReferenceSelection({ start: 39, end: 42 }, 1, 42.006)
  assert.ok(Math.abs(shifted.end - shifted.start - 3) < 0.000001)
  assert.equal(referenceSelectionError(42.006, shifted.start, shifted.end), null)
  assert.deepEqual(shiftReferenceSelection({ start: 3, end: 10 }, -10, 42), { start: 0, end: 7 })
})

test('generated assets can be trashed and restored', async () => {
  const context = fixture()
  try {
    const legacy = join(context.root, 'media', 'voiceover')
    mkdirSync(legacy, { recursive: true })
    const store = new VoiceAssetStore(context.root, context.repository)
    const folder = join(context.root, 'media', 'audio', 'voiceover', 'job')
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'raw.wav'), Buffer.alloc(48))
    const id = Number(context.db.prepare("INSERT INTO video_assets (title,type,file_path,metadata) VALUES ('生成','audio',?,?)").run('media/audio/voiceover/job/raw.wav', JSON.stringify({ source: 'voiceover', jobId: 'job' })).lastInsertRowid)
    store.trash(id)
    assert.equal(store.list(false).length, 0)
    assert.equal(store.list(true).length, 1)
    assert.throws(() => store.audio(id), /回收/)
    store.restore(id)
    assert.equal(store.list(false).length, 1)
    assert.equal(store.audio(id).mimeType, 'audio/wav')
  } finally { context.close() }
})

test('automatic transcription errors never persist a profile and can be retried without manual text', async () => {
  const context = fixture()
  const runtime = new VoiceRuntimeManager(context.root)
  const source = join(context.root, 'speech.wav')
  let fail = true
  const profiles = new VoiceProfileStore(context.root, context.repository, runtime, async () => {
    if (fail) throw new Error('识别模型不可用')
    return '自动识别成功'
  })
  try {
    await runCommand(runtime.get().config.ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=400:duration=8', source])
    const draft = await profiles.importReference(source)
    await assert.rejects(profiles.save({ draftId: draft.id, name: '自动音色' }), /识别模型不可用/)
    assert.equal(context.repository.profiles().length, 0)
    fail = false
    const profile = await profiles.save({ draftId: draft.id, name: '自动音色' })
    assert.equal(profile.revisions[0].transcript, '自动识别成功')
  } finally { await profiles.dispose(); context.close() }
})

test('changing a reference selection aborts recognition and never caches its late result', async () => {
  const context = fixture()
  const runtime = new VoiceRuntimeManager(context.root)
  const source = join(context.root, 'speech.wav')
  let calls = 0
  let firstSignal: AbortSignal | undefined
  let release: () => void = () => {}
  const profiles = new VoiceProfileStore(context.root, context.repository, runtime, async (_path, signal) => {
    calls++
    if (calls === 1) {
      firstSignal = signal
      await new Promise<void>(resolve => { release = resolve })
      return '过期结果'
    }
    return '当前片段'
  })
  try {
    await runCommand(runtime.get().config.ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=400:duration=8', source])
    const draft = await profiles.importReference(source)
    const stale = profiles.transcribe(draft.id, 0, 8)
    const rejection = assert.rejects(stale, /取消/)
    await waitUntil(() => Boolean(firstSignal))
    const current = profiles.transcribe(draft.id, 1, 7)
    assert.equal(firstSignal?.aborted, true)
    release()
    await rejection
    assert.equal((await current).transcript, '当前片段')
    assert.equal(existsSync(join(context.root, 'cache', 'voice-references', draft.id, 'transcript-0-8.json')), false)
  } finally { release(); await profiles.dispose(); context.close() }
})

test('local model queue serializes ASR and TTS, including cancellation during shutdown', async () => {
  const queue = new LocalVoiceQueue()
  const first = new AbortController()
  let release: () => void = () => {}
  const events: string[] = []
  const initial = queue.run(async () => {
    events.push('recognition')
    await new Promise<void>(resolve => { release = resolve })
  }, first.signal)
  const rejection = assert.rejects(initial, /取消/)
  await waitUntil(() => events.length === 1)
  const cancelled = new AbortController()
  const skipped = queue.run(async () => { events.push('must not run') }, cancelled.signal)
  const skippedRejection = assert.rejects(skipped, /取消/)
  cancelled.abort()
  const synthesis = queue.run(async () => { events.push('synthesis') }, new AbortController().signal)
  first.abort()
  await rejection
  await skippedRejection
  assert.deepEqual(events, ['recognition'], 'a cancelled caller must not release the active model slot early')
  release()
  await synthesis
  await queue.drain()
  assert.deepEqual(events, ['recognition', 'synthesis'])
})

test('cancelling before adapter startup reaches a terminal state', async () => {
  const context = fixture()
  let invoked = false
  const manager = new VoiceJobManager(context.repository, context.root, async () => { invoked = true; throw new Error('must not run') })
  try {
    const job = manager.create(request('early-cancel'))
    queueMicrotask(() => manager.cancel(job.id))
    await waitUntil(() => manager.get(job.id)?.state === 'cancelled')
    assert.equal(invoked, false)
  } finally { await manager.dispose(); context.close() }
})

test('Edge synthesis uses the current Microsoft endpoint and subscription key', async () => {
  const agent = new Agent()
  let target = ''
  agent.addRequest = (request) => {
    target = `https://${request.host}${request.path}`
    setImmediate(() => request.emit('error', new Error('handshake captured')))
  }
  const tts = new MsEdgeTTS({ agent })
  try {
    await assert.rejects(tts.setMetadata('zh-CN-XiaoxiaoNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3))
    const url = new URL(target)
    assert.equal(url.hostname, 'api.msedgeservices.com')
    assert.equal(url.pathname, '/tts/cognitiveservices/websocket/v1')
    assert.ok(url.searchParams.get('Ocp-Apim-Subscription-Key'))
    assert.equal(url.searchParams.has('TrustedClientToken'), false)
  } finally { tts.close(); agent.destroy() }
})

test('Edge rate limits offer a retry action without silently changing the voice engine', async () => {
  const context = fixture()
  const runtime = new VoiceRuntimeManager(context.root)
  const adapter = createEdgeAdapter(context.root, runtime, () => ({
    setMetadata: async () => { throw new Error('Edge TTS WebSocket error: Unexpected server response: 429') },
    close: () => {},
    toStream: () => { throw new Error('must not synthesize') },
  }))
  try {
    const job = context.repository.createJob(resolveVoiceRequest(request('edge-limit')))
    await assert.rejects(adapter(job, new AbortController().signal, () => {}), /EDGE_RATE_LIMITED:.*429.*稍后重试/)
  } finally { context.close() }
})

test('Edge connection cancellation releases a stalled metadata handshake', async () => {
  const context = fixture()
  const runtime = new VoiceRuntimeManager(context.root)
  let closed = false
  const adapter = createEdgeAdapter(context.root, runtime, () => ({
    setMetadata: () => new Promise<void>(() => {}),
    close: () => { closed = true },
    toStream: () => { throw new Error('must not synthesize') },
  }))
  try {
    const controller = new AbortController()
    const job = context.repository.createJob(resolveVoiceRequest(request('edge-cancel')))
    const pending = adapter(job, controller.signal, () => {})
    controller.abort()
    await assert.rejects(Promise.race([pending, delay(500).then(() => { throw new Error('cancel timed out') })]), /取消/)
    assert.equal(closed, true)
  } finally { context.close() }
})

test('silent reference segments cannot become reusable profiles', async () => {
  const context = fixture()
  const runtime = new VoiceRuntimeManager(context.root)
  const profiles = new VoiceProfileStore(context.root, context.repository, runtime)
  const { runCommand } = await import('../src/main/services/voiceover/process')
  try {
    const source = join(context.root, 'silence.wav')
    await runCommand(runtime.get().config.ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '4', source])
    const draft = await profiles.importReference(source)
    await assert.rejects(profiles.save({ draftId: draft.id, name: '静音', transcript: '你好', confirmed: true, start: 0, end: 4 }), /静音/)
    assert.equal(context.repository.profiles().length, 0)
  } finally { context.close() }
})

test('concurrent legacy migration registers one asset and backup relocates managed audio', async () => {
  const context = fixture()
  const runtime = new VoiceRuntimeManager(context.root)
  const { runCommand } = await import('../src/main/services/voiceover/process')
  const store = new VoiceAssetStore(context.root, context.repository)
  const destination = mkdtempSync(join(tmpdir(), 'voice-restored-'))
  try {
    mkdirSync(join(context.root, 'media', 'voiceover'), { recursive: true })
    await runCommand(runtime.get().config.ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', join(context.root, 'media', 'voiceover', 'old.mp3')])
    await Promise.all([store.migrateLegacy(runtime.get().config.ffprobePath), store.migrateLegacy(runtime.get().config.ffprobePath)])
    assert.equal(store.list().length, 1)
    mkdirSync(join(context.root, 'media', '.trash'), { recursive: true })
    writeFileSync(join(context.root, 'media', '.trash', 'discarded.wav'), 'not in backup')
    const backup = createBackup(context.root, join(destination, 'backups'))
    assert.ok(!backup.manifest.files.some(file => file.path.includes('.trash')))
    const target = join(destination, 'new data root')
    restoreBackup(backup.backupPath, target)
    const movedStore = new VoiceAssetStore(target, context.repository)
    assert.equal(movedStore.audio(store.list()[0].id).mimeType, 'audio/mpeg')
  } finally { context.close(); rmSync(destination, { recursive: true, force: true }) }
})

test('comparison rejects reused request IDs and both local engines share one execution slot', async () => {
  const context = fixture()
  let running = 0
  let maximum = 0
  const profile = context.repository.saveProfile({ name: '参考', transcript: '你好', referencePath: 'ref.wav', originalPath: 'original.wav', sha256: 'hash', duration: 8 })
  const manager = new VoiceJobManager(context.repository, context.root, async job => {
    running++; maximum = Math.max(running, maximum)
    await delay(20)
    const path = join(context.root, 'cache', 'voice-jobs', job.id, 'raw.wav')
    writeFileSync(path, Buffer.alloc(48))
    running--
    return { path, duration: 1, sampleRate: 24000 }
  })
  const inputs = ['voxcpm2', 'qwen3-tts'].map((engine, index) => ({ clientRequestId: `compare-${index}`, engine, text: '你好世界', profileId: profile.id, profileRevision: 1, options: { seed: 42 } }))
  try {
    assert.throws(() => manager.compare([inputs[0], { ...inputs[1], clientRequestId: inputs[0].clientRequestId }]), /请求 ID/)
    assert.throws(() => manager.compare([inputs[0], { ...inputs[1], options: { seed: 42, denoise: true } }]), /降噪设置/)
    assert.equal(manager.list().length, 0)
    const jobs = manager.compare(inputs)
    assert.throws(() => context.repository.deleteProfile(profile.id), /任务使用/)
    await waitUntil(() => jobs.every(job => manager.get(job.id)?.state === 'succeeded'))
    assert.equal(maximum, 1)
    assert.equal(jobs[0].request.comparisonGroupId, jobs[1].request.comparisonGroupId)
    assert.equal(manager.compare(inputs)[0].id, jobs[0].id)
  } finally { await manager.dispose(); context.close() }
})

test('asset transaction failures remove generated bundles without half-registered assets', async () => {
  const context = fixture()
  context.db.exec("CREATE TRIGGER reject_voice_asset BEFORE INSERT ON video_assets BEGIN SELECT RAISE(ABORT, 'disk transaction failure'); END")
  const manager = new VoiceJobManager(context.repository, context.root, async job => {
    const path = join(context.root, 'cache', 'voice-jobs', job.id, 'raw.wav')
    writeFileSync(path, Buffer.alloc(48))
    return { path, duration: 1, sampleRate: 24000 }
  })
  try {
    const job = manager.create(request('db-failure'))
    await waitUntil(() => manager.get(job.id)?.state === 'failed')
    assert.equal(context.db.prepare('SELECT count(*) AS count FROM video_assets').get().count, 0)
    assert.equal(existsSync(join(context.root, 'media', 'audio', 'voiceover', job.id)), false)
  } finally { await manager.dispose(); context.close() }
})

test('reference files and profile hashes survive a full database backup into another root', async () => {
  const context = fixture()
  const destination = mkdtempSync(join(tmpdir(), 'voice-backup-'))
  const { runCommand } = await import('../src/main/services/voiceover/process')
  const runtime = new VoiceRuntimeManager(context.root)
  const profiles = new VoiceProfileStore(context.root, context.repository, runtime)
  try {
    const source = join(context.root, 'recording.m4a')
    await runCommand(runtime.get().config.ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=4', source])
    const draft = await profiles.importReference(source)
    const profile = await profiles.save({ draftId: draft.id, name: '备份音色', transcript: '你好', confirmed: true, start: 0, end: 4 })
    mkdirSync(join(context.root, 'database'))
    await context.db.backup(join(context.root, 'database', 'dashboard.db'))
    const backup = createBackup(context.root, join(destination, 'backup'))
    const target = join(destination, 'another root')
    restoreBackup(backup.backupPath, target)
    const db = new Database(join(target, 'database', 'dashboard.db'))
    try {
      const repository = new VoiceRepository(db)
      const restored = repository.profile(profile.id)!
      const reference = restored.revisions[0]
      assert.equal(createHash('sha256').update(readFileSync(join(target, reference.referencePath))).digest('hex'), reference.sha256)
      assert.equal(new VoiceProfileStore(target, repository, new VoiceRuntimeManager(target)).audio(profile.id).mimeType, 'audio/wav')
    } finally { db.close() }
    const outside = join(destination, 'outside.wav')
    writeFileSync(outside, 'private')
    symlinkSync(outside, join(context.root, 'escape.wav'))
    assert.throws(() => managedPath(context.root, 'escape.wav'), /路径/)
  } finally { context.close(); rmSync(destination, { recursive: true, force: true }) }
})
