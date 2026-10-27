import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runMigrations } from '../src/main/database/migrations'
import { VoiceoverService } from '../src/main/services/voiceover/voiceover-service'
import { VOICE_TERMINAL } from '../src/shared/voiceover'
import {
  buildVoiceDesignDescription,
  VOICE_CHARACTER_RECIPES,
} from '../src/shared/voice-design-controls'
import { managedPath } from '../src/main/services/voiceover/media'

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'voice-design-contrasts-'))
  const database = new Database(':memory:')
  runMigrations(database)
  const service = new VoiceoverService(
    root,
    database,
    resolve('resources/voice-runtime/worker.py'),
    (job) => console.log(job.state, job.phase),
  )
  const results = []
  try {
    for (const id of ['anime-soft', 'mature-narrator']) {
      const recipe = VOICE_CHARACTER_RECIPES.find((item) => item.id === id)!
      const voiceDesign = buildVoiceDesignDescription(recipe.traits, recipe.emotions, '')
      const job = await service.create({
        clientRequestId: randomUUID(),
        engine: 'voxcpm2',
        text: '你好，今天我们一起听一个新的故事。',
        voiceDesign,
        options: { seed: 23456, cfg: 2, steps: 20, designTempo: id === 'anime-soft' ? 0.85 : 1 },
      })
      const deadline = Date.now() + 600000
      while (!VOICE_TERMINAL.includes(service.jobs.get(job.id)!.state) && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 500))
      const result = service.jobs.get(job.id)!
      assert.equal(result.state, 'succeeded', result.error ?? result.phase)
      const asset = service.assets.asset(result.assetId!)
      const metadata = JSON.parse(asset.metadata)
      assert.equal(metadata.voiceDesign, voiceDesign)
      assert.equal(metadata.options.seed, 23456)
      results.push({
        id,
        voiceDesign,
        path: managedPath(root, asset.file_path),
        rawPath: managedPath(root, metadata.rawPath),
        duration: asset.duration_seconds,
        options: metadata.options,
      })
      writeFileSync(join(root, 'results.json'), JSON.stringify(results, null, 2))
    }
    console.log('VOICE_DESIGN_CONTRASTS_OK', join(root, 'results.json'))
  } finally {
    await service.dispose()
    database.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
