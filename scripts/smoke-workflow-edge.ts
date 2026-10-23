import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { runMigrations } from '../src/main/database/migrations'
import { VoiceoverService } from '../src/main/services/voiceover/voiceover-service'
import { VideoWorkflowService } from '../src/main/services/video-workflow/service'
import { probeMedia } from '../src/main/services/video-workflow/audio'
import { stageValue, type VideoStage } from '../src/shared/video-workflow'

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'workflow-edge-'))
  console.log('Isolated artifacts:', root)
  const db = new Database(join(root, 'workflow.db'))
  runMigrations(db)
  const voice = new VoiceoverService(root, db, resolve('resources/voice-runtime/worker.py'))
  const observations: number[] = []
  const service = new VideoWorkflowService(
    root,
    db,
    () => voice,
    (id) => {
      const project = service.repository.get(id)
      const job = project.jobs[0]
      if (job?.state === 'running' && job.audioProgress?.tracks.length) {
        assert.equal(project.stages.audio, undefined)
        observations.push(job.audioProgress.tracks.length)
        console.log('Playable segments before completion:', job.audioProgress.tracks.length)
      }
    },
  )
  try {
    let project = service.repository.create('Edge 分段配音实测')
    const approve = async (stage: VideoStage, payload: unknown) => {
      project = await service.save(project.id, stage, payload, project.revision, randomUUID())
      project = await service.approve(
        project.id,
        stage,
        project.stages[stage]!.id,
        project.revision,
        randomUUID(),
        '',
      )
    }
    await approve('brief', { text: '验证 Edge 中文配音和逐段结果。', duration: 30 })
    await approve('copy', { text: 'Kotlin 的逆袭之路，从简洁的语言设计开始。第二段介绍协程。' })
    await approve('storyboard', {
      mode: 'template',
      template: 'technical',
      scenes: [
        { id: 'one', title: 'Kotlin 的逆袭之路', body: '语言设计', layout: 'title' },
        { id: 'two', title: '协程', body: '并发编程', layout: 'summary' },
      ],
    })
    await approve('narration', {
      scenes: [
        { id: 'one', text: 'Kotlin 的逆袭之路，从简洁的语言设计开始。' },
        { id: 'two', text: '协程让并发代码更容易阅读，也更方便维护。' },
      ],
    })
    const job = await service.generate({
      projectId: project.id,
      stage: 'audio',
      executor: 'template',
      expectedRevision: project.revision,
      requestId: randomUUID(),
      voice: { engine: 'edge', voiceId: 'zh-CN-XiaoxiaoNeural', options: {} },
    })
    const deadline = Date.now() + 90000
    while (service.repository.job(job.id)!.state === 'running' && Date.now() < deadline)
      await delay(100)
    const finished = service.repository.job(job.id)!
    assert.equal(finished.state, 'succeeded', finished.error ?? finished.phase)
    assert.ok(observations.includes(1))
    assert.ok(observations.includes(2))
    project = service.repository.get(project.id)
    const audio = stageValue(project, 'audio')!
    assert.equal(project.stages.audio!.status, 'review')
    assert.equal(project.stages.roughcut, undefined)
    for (const track of audio.tracks)
      await probeMedia(
        service.runtime.get(),
        await service.files.verify(project.id, track.file),
        root,
      )
    await probeMedia(
      service.runtime.get(),
      await service.files.verify(project.id, audio.file),
      root,
    )
    await service.files.verify(project.id, audio.subtitles)
    console.log(
      'PASS: real Edge Chinese synthesis, incremental notifications, playable tracks, merged WAV and subtitles, awaiting review',
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
