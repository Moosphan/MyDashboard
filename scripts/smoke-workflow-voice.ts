import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { runMigrations } from '../src/main/database/migrations'
import { VoiceRepository } from '../src/main/database/repositories/voice-repository'
import { VoiceoverService } from '../src/main/services/voiceover/voiceover-service'
import { managedPath } from '../src/main/services/voiceover/media'
import { VideoWorkflowService } from '../src/main/services/video-workflow/service'
import { probeMedia } from '../src/main/services/video-workflow/audio'
import { stageValue, type VideoStage } from '../src/shared/video-workflow'

async function main() {
  const sourceRoot = process.argv[2]
  if (!sourceRoot) throw new Error('Usage: smoke-workflow-voice.ts <existing user-data directory>')
  const source = new Database(join(sourceRoot, 'database', 'dashboard.db'), { readonly: true })
  const profile =
    new VoiceRepository(source).profiles().find((item) => item.name === 'cloned-chinese') ??
    new VoiceRepository(source).profiles()[0]
  source.close()
  assert.ok(profile, 'A saved reference voice is required')
  const reference = profile.revisions.find((item) => item.revision === profile.currentRevision)!
  const root = mkdtempSync(join(tmpdir(), 'workflow-local-voice-'))
  console.log('Isolated artifacts:', root)
  mkdirSync(join(root, 'config'))
  copyFileSync(
    join(sourceRoot, 'config', 'voice-runtime.json'),
    join(root, 'config', 'voice-runtime.json'),
  )
  copyFileSync(
    join(sourceRoot, 'config', 'video-workflow.json'),
    join(root, 'config', 'video-workflow.json'),
  )
  for (const path of new Set([reference.referencePath, reference.originalPath])) {
    const destination = managedPath(root, path)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(managedPath(sourceRoot, path), destination)
  }
  const db = new Database(join(root, 'workflow.db'))
  runMigrations(db)
  const voice = new VoiceoverService(
    root,
    db,
    resolve('resources/voice-runtime/worker.py'),
    (job) => console.log('voice:', job.state, job.phase),
  )
  const service = new VideoWorkflowService(root, db, () => voice)
  try {
    const cloned = voice.repository.saveProfile({ ...reference, name: 'Isolated voice test' })
    assert.equal(
      voice.runtime.get().engines.voxcpm2.ready,
      false,
      'Start from a cold service without a manual environment check',
    )
    let project = service.repository.create('本地配音冷启动回归（测试数据）')
    const saveAndApprove = async (stage: VideoStage, payload: unknown) => {
      project = await service.save(project.id, stage, payload, project.revision, randomUUID())
      project = await service.approve(
        project.id,
        stage,
        project.stages[stage]!.id,
        project.revision,
        randomUUID(),
        'isolated smoke fixture',
      )
    }
    await saveAndApprove('brief', { text: '验证分段配音自动检测本地环境与降噪。', duration: 20 })
    await saveAndApprove('copy', { text: '先配音，再检查音画同步。' })
    await saveAndApprove('storyboard', {
      mode: 'template',
      template: 'technical',
      scenes: [
        { id: 'scene-1', title: '第一镜', body: '配音测试', layout: 'title' },
        { id: 'scene-2', title: '第二镜', body: '音画同步', layout: 'summary' },
      ],
    })
    await saveAndApprove('narration', {
      scenes: [
        { id: 'scene-1', text: '你好，这是第一镜的配音测试。' },
        { id: 'scene-2', text: '接下来确认音画同步。' },
      ],
    })
    const job = await service.generate({
      projectId: project.id,
      stage: 'audio',
      executor: 'template',
      expectedRevision: project.revision,
      requestId: randomUUID(),
      voice: {
        engine: 'voxcpm2',
        profileId: cloned.id,
        profileRevision: cloned.currentRevision,
        options: { steps: 20, cfg: 2, gainDb: 0, denoise: true, seed: 42 },
      },
    })
    let previous = ''
    const deadline = Date.now() + 600000
    while (Date.now() < deadline) {
      const current = service.repository.job(job.id)!
      if (current.phase !== previous) {
        console.log('workflow:', current.state, current.phase)
        previous = current.phase
      }
      if (current.state !== 'running') break
      await delay(500)
    }
    const finished = service.repository.job(job.id)!
    assert.equal(finished.state, 'succeeded', finished.error ?? finished.phase)
    project = service.repository.get(project.id)
    const audio = stageValue(project, 'audio')!
    assert.equal(project.stages.audio!.status, 'review')
    assert.equal(project.stages.roughcut, undefined)
    assert.equal(audio.tracks.length, 2)
    assert.deepEqual(
      audio.tracks.map((track) => track.sceneId),
      ['scene-1', 'scene-2'],
    )
    await probeMedia(
      service.runtime.get(),
      await service.files.verify(project.id, audio.file),
      root,
    )
    await service.files.verify(project.id, audio.subtitles)
    assert.equal(voice.runtime.get().engines.voxcpm2.ready, true)
    console.log(
      'PASS: cold runtime, real VoxCPM2 + denoising, two scene tracks, merged WAV, subtitles, awaiting review',
      { root, duration: audio.duration },
    )
  } finally {
    await service.dispose()
    await voice.dispose()
    db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
