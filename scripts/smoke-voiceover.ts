import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { cpSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runMigrations } from '../src/main/database/migrations'
import { VoiceoverService } from '../src/main/services/voiceover/voiceover-service'
import { VOICE_TERMINAL } from '../src/shared/voiceover'
import { runCommand } from '../src/main/services/voiceover/process'

async function main() {
  const reference = process.argv[2]
  const transcript = process.argv[3]
  const denoise = process.argv.includes('--denoise')
  if (!reference || !transcript) throw new Error('Usage: smoke-voiceover.ts reference.wav "accurate reference text"')
  const root = mkdtempSync(join(tmpdir(), 'MyDashboard Voice Smoke '))
  mkdirSync(join(root, 'database'))
  const db = new Database(join(root, 'database', 'dashboard.db'))
  runMigrations(db)
  const resourceRoot = join(root, 'Packaged Resources', 'voice-runtime')
  cpSync(resolve('resources/voice-runtime'), resourceRoot, { recursive: true, filter: source => !source.includes('__pycache__') })
  const service = new VoiceoverService(root, db, join(resourceRoot, 'worker.py'), job => console.log(job.request.engine, job.state, job.phase))
  try {
    const runtime = await service.runtime.check()
    console.log(JSON.stringify(runtime, null, 2))
    assert.ok(runtime.engines.voxcpm2.ready, runtime.engines.voxcpm2.reason)
    assert.ok(runtime.engines['qwen3-tts'].ready, runtime.engines['qwen3-tts'].reason)
    if (denoise) assert.ok(runtime.denoising?.ready, runtime.denoising?.reason)
    const draft = await service.profiles.importReference(resolve(reference))
    const profile = await service.profiles.save({ draftId: draft.id, name: '集成验证音色', transcript, confirmed: true, start: 0, end: draft.duration })
    const jobs = service.compare(['voxcpm2', 'qwen3-tts'].map(engine => ({ clientRequestId: randomUUID(), engine, profileId: profile.id, profileRevision: 1, text: '让创作更自由，让灵感成为作品。欢迎使用我的工作台。', options: { seed: 42, denoise } })))
    const deadline = Date.now() + 600000
    while (jobs.some(job => !VOICE_TERMINAL.includes(service.jobs.get(job.id)!.state)) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 500))
    const results = jobs.map(job => service.jobs.get(job.id)!)
    for (const job of results) {
      assert.equal(job.state, 'succeeded', job.error ?? job.phase)
      const asset = service.assets.asset(job.assetId!)
      const metadata = JSON.parse(asset.metadata)
      assert.equal(metadata.referenceSha256, profile.revisions[0].sha256)
      assert.equal(metadata.options.denoise, denoise)
      if (denoise) {
        assert.equal(metadata.referenceDenoising.model, 'iic/speech_zipenhancer_ans_multiloss_16k_base')
        assert.equal(metadata.referenceDenoising.sampleRate, 16000)
        assert.notEqual(metadata.referenceDenoising.sha256, metadata.referenceSha256)
      }
      assert.ok(metadata.model.revision)
      assert.notEqual(metadata.rawPath, asset.file_path)
      assert.ok(existsSync(join(root, metadata.rawPath)))
      assert.ok(asset.duration_seconds! > 1)
      assert.equal(service.assets.audio(asset.id).mimeType, 'audio/wav')
      await runCommand(runtime.config.ffmpegPath, ['-v', 'error', '-i', join(root, asset.file_path), '-f', 'null', '-'])
    }
    assert.equal(service.assets.list().length, 2)
    writeFileSync(join(root, 'smoke-results.json'), JSON.stringify(results, null, 2))
    console.log('VOICE_SMOKE_OK', root)
  } finally { await service.jobs.dispose(); db.close() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
