import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runMigrations } from '../src/main/database/migrations'
import { VoiceoverService } from '../src/main/services/voiceover/voiceover-service'
import { VOICE_TERMINAL } from '../src/shared/voiceover'

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'voice-design-smoke-'))
  const database = new Database(':memory:')
  runMigrations(database)
  const service = new VoiceoverService(
    root,
    database,
    resolve('resources/voice-runtime/worker.py'),
    (job) => console.log(job.state, job.phase),
  )
  try {
    const runtime = await service.runtime.ensureChecked()
    assert.ok(runtime.engines.voxcpm2.ready, runtime.engines.voxcpm2.reason)
    const job = await service.create({
      clientRequestId: randomUUID(),
      engine: 'voxcpm2',
      text: '清晨的风穿过山谷，故事从这里开始。让我们放慢脚步，听见历史的回声。',
      voiceDesign: '成熟男性，中低音，温暖醇厚，普通话清晰自然，语速舒缓，平和地讲述历史故事。',
      options: { seed: 12345, steps: 20, cfg: 2, denoise: false },
    })
    const deadline = Date.now() + 600000
    while (!VOICE_TERMINAL.includes(service.jobs.get(job.id)!.state) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 500))
    const result = service.jobs.get(job.id)!
    assert.equal(result.state, 'succeeded', result.error ?? result.phase)
    const asset = service.assets.asset(result.assetId!)
    assert.equal(JSON.parse(asset.metadata).mode, 'design')
    assert.equal(service.assets.audio(asset.id).mimeType, 'audio/wav')
    const profile = await service.saveDesignedProfile(job.id, '真实造声验证 · 固定音色')
    assert.equal(profile.revisions[0].transcript, job.request.text)
    assert.ok(profile.revisions[0].duration >= 3)
    assert.equal(service.profiles.audio(profile.id).mimeType, 'audio/wav')
    const plan = service.designs.save({
      name: '真实造声验证方案',
      description: job.request.voiceDesign!,
      seed: job.request.options.seed!,
    })
    assert.equal(plan.seed, 12345)
    writeFileSync(
      join(root, 'result.json'),
      JSON.stringify({ job: result, asset, profile, plan }, null, 2),
    )
    console.log('VOICE_DESIGN_SMOKE_OK', root)
  } finally {
    await service.dispose()
    database.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
