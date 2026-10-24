require('tsx/cjs')
const { app } = require('electron')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { cpSync, copyFileSync, mkdtempSync, writeFileSync, chmodSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { randomUUID } = require('node:crypto')
const { setTimeout: delay } = require('node:timers/promises')
const { VideoWorkflowService } = require('../src/main/services/video-workflow/service')
const { defaultMotion } = require('../src/main/services/video-workflow/motion')
const { runMigrations } = require('../src/main/database/migrations')

app.on('window-all-closed', () => {})
app
  .whenReady()
  .then(async () => {
    const root = mkdtempSync(join(tmpdir(), 'cancel-keep-roughcut-'))
    let service
    let database
    try {
      if (!process.env.WORKFLOW_SEED_DIR)
        throw new Error('Set WORKFLOW_SEED_DIR to an isolated smoke fixture')
      copyFileSync(join(process.env.WORKFLOW_SEED_DIR, 'workflow.db'), join(root, 'workflow.db'))
      cpSync(join(process.env.WORKFLOW_SEED_DIR, 'media'), join(root, 'media'), { recursive: true })
      database = new Database(join(root, 'workflow.db'))
      runMigrations(database)
      const projectId = database.prepare('SELECT id FROM video_projects LIMIT 1').get().id
      database
        .prepare(
          "DELETE FROM video_workflow_revisions WHERE project_id=? AND stage='brief' AND version>1 AND approved_at IS NULL",
        )
        .run(projectId)
      database
        .prepare(
          "UPDATE video_workflow_revisions SET status='approved' WHERE project_id=? AND approved_at IS NOT NULL",
        )
        .run(projectId)
      service = new VideoWorkflowService(root, database, () => {
        throw new Error('Must reuse existing audio')
      })
      if (!process.env.WORKFLOW_HYPERFRAMES_PATH)
        throw new Error('Set WORKFLOW_HYPERFRAMES_PATH to HyperFrames 0.8.181 executable or .mjs')
      const configured = {
        hyperframesPath: process.env.WORKFLOW_HYPERFRAMES_PATH,
        ...(process.env.WORKFLOW_NODE_PATH ? { nodePath: process.env.WORKFLOW_NODE_PATH } : {}),
      }
      const trap = join(root, 'forbidden-agent')
      writeFileSync(trap, '#!/bin/sh\necho Agent-must-not-run >&2\nexit 77\n')
      chmodSync(trap, 0o755)
      service.runtime.set({ ...configured, codexPath: trap, claudePath: trap })
      let project = service.repository.get(projectId)
      const originalAudio = project.stages.audio.payload
      const originalRoughcut = project.stages.roughcut
      const payloads = Object.fromEntries(
        ['brief', 'copy', 'storyboard', 'narration', 'audio'].map((stage) => [
          stage,
          project.stages[stage].payload,
        ]),
      )
      payloads.brief = { ...payloads.brief, text: payloads.brief.text + '\n全片每页必须有 MG 动画' }
      payloads.storyboard = {
        ...payloads.storyboard,
        scenes: payloads.storyboard.scenes.map((scene) => ({
          ...scene,
          title: scene.title + '（尚未应用的新分镜）',
        })),
      }
      payloads.audio = { ...payloads.audio, duration: payloads.audio.duration + 7 }
      for (const stage of ['brief', 'copy', 'storyboard', 'narration', 'audio']) {
        project = service.repository.save(
          projectId,
          stage,
          payloads[stage],
          project.revision,
          randomUUID(),
        )
        project = service.repository.approve(
          projectId,
          stage,
          project.stages[stage].id,
          project.revision,
          randomUUID(),
        )
      }
      const proposal = service.repository.startJob(
        projectId,
        'roughcut',
        project.revision,
        randomUUID(),
        'codex',
        'pending-cancel-test',
      )
      service.repository.markMotionJob(proposal.id)
      service.repository.finishMotionPlan(proposal.id, defaultMotion(project))
      const inputIds = ['brief', 'copy', 'storyboard', 'narration', 'audio'].map(
        (stage) => project.stages[stage].id,
      )
      const waitJob = async (job) => {
        let previousPhase
        for (let attempt = 0; attempt < 1200; attempt++) {
          const current = service.repository.job(job.id)
          if (current.phase !== previousPhase) {
            console.log(current.stage, current.phase)
            previousPhase = current.phase
          }
          if (current.state !== 'running') {
            assert.equal(current.state, 'succeeded', current.error)
            return current
          }
          await delay(250)
        }
        throw new Error('Timed out rendering retained fixture')
      }
      assert.equal(project.stages.roughcut.status, 'stale')
      const currentAudio = project.stages.audio.payload
      service.runtime.set({ hyperframesPath: trap })
      project = await service.discardMotionPlans(projectId, project.revision)
      assert.equal(project.stages.roughcut.status, 'review')
      assert.equal(project.stages.roughcut.id, originalRoughcut.id)
      assert.equal(project.stages.roughcut.version, originalRoughcut.version)
      assert.deepEqual(project.stages.roughcut.payload, originalRoughcut.payload)
      assert.equal(service.repository.job(proposal.id).state, 'cancelled')
      assert.deepEqual(project.stages.audio.payload, currentAudio)
      assert.deepEqual(
        ['brief', 'copy', 'storyboard', 'narration', 'audio'].map(
          (stage) => project.stages[stage].id,
        ),
        inputIds,
      )
      await assert.rejects(
        service.generate({
          projectId,
          stage: 'render',
          executor: 'template',
          expectedRevision: project.revision,
          requestId: randomUUID(),
        }),
        /审核/,
      )
      project = await service.approve(
        projectId,
        'roughcut',
        project.stages.roughcut.id,
        project.revision,
        randomUUID(),
        'Fixture reviewed',
      )
      service.runtime.set(configured)
      const finalJob = await service.generate({
        projectId,
        stage: 'render',
        executor: 'template',
        expectedRevision: project.revision,
        requestId: randomUUID(),
      })
      await waitJob(finalJob)
      project = service.repository.get(projectId)
      assert.ok(
        Math.abs(project.stages.render.payload.duration - originalRoughcut.payload.duration) < 0.15,
      )
      assert.notEqual(project.stages.audio.payload.duration, originalAudio.duration)
      assert.equal(
        project.stages.render.payload.sourceStoryboard,
        originalRoughcut.payload.sourceStoryboard,
      )
      assert.equal(project.stages.render.payload.sourceAudio, originalRoughcut.payload.sourceAudio)
      assert.equal(
        project.stages.render.payload.sourceNarration,
        originalRoughcut.payload.sourceNarration,
      )
      assert.equal(
        project.stages.render.payload.manifestHash,
        project.stages.roughcut.payload.manifestHash,
      )
      assert.deepEqual(project.stages.audio.payload, currentAudio)
      console.log(
        'PASS: cancel plan → same roughcut ID/files/version → manual review → actual final with original sources/duration; no roughcut regeneration or Agent/TTS:',
        root,
      )
    } finally {
      if (service) await service.dispose()
      if (database) database.close()
    }
  })
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
