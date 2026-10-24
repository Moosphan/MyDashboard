require('tsx/cjs')
const { app } = require('electron')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const {
  cpSync,
  copyFileSync,
  mkdtempSync,
  writeFileSync,
  chmodSync,
  readFileSync,
} = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { randomUUID } = require('node:crypto')
const { setTimeout: delay } = require('node:timers/promises')
const { VideoWorkflowService } = require('../src/main/services/video-workflow/service')
const { runMigrations } = require('../src/main/database/migrations')

app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  const root = mkdtempSync(join(tmpdir(), 'roughcut-motion-'))
  let service
  let database
  try {
    assert.ok(process.env.WORKFLOW_SEED_DIR, 'Set WORKFLOW_SEED_DIR to an isolated smoke fixture')
    assert.ok(
      process.env.WORKFLOW_HYPERFRAMES_PATH,
      'Set WORKFLOW_HYPERFRAMES_PATH to HyperFrames 0.8.181',
    )
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
      throw new Error('TTS must not run')
    })
    let state = service.repository.get(projectId)
    const original = structuredClone(state)
    const roughcut = original.stages.roughcut.payload
    const originalScene = original.stages.storyboard.payload.scenes[0]
    for (const stage of ['storyboard', 'narration', 'audio']) {
      const payload = structuredClone(state.stages[stage].payload)
      if (stage === 'storyboard') {
        payload.motionPolicy = { enabled: false, excludedSceneIds: [] }
        payload.scenes = payload.scenes.map((scene, index) => ({
          ...scene,
          id: `replacement-${index}`,
          title: `未应用的新画面 ${index}`,
          html: '<h2>新画面</h2>',
        }))
      } else if (stage === 'narration') {
        payload.scenes.forEach((scene, index) => {
          scene.id = `replacement-${index}`
        })
      } else {
        payload.duration *= 2
        payload.tracks.forEach((track, index) => {
          track.sceneId = `replacement-${index}`
          track.duration *= 2
        })
      }
      state = service.repository.save(state.id, stage, payload, state.revision, randomUUID())
      state = service.repository.approve(
        state.id,
        stage,
        state.stages[stage].id,
        state.revision,
        randomUUID(),
      )
    }
    const upstreamIds = ['storyboard', 'narration', 'audio'].map((stage) => state.stages[stage].id)
    const promptPath = join(root, 'motion-prompt.txt')
    const executable = join(root, 'motion-agent')
    const duration = Math.min(1, original.stages.audio.payload.tracks[0].duration / 2)
    const writeAgent = (result) => {
      writeFileSync(
        executable,
        '#!/usr/bin/env node\n' +
          `const fs=require('node:fs');let prompt='';process.stdin.on('data',chunk=>prompt+=chunk);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(promptPath)},prompt);fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify(result))});});`,
      )
      chmodSync(executable, 0o755)
    }
    writeAgent({
      summary: '仅调整原视频首镜标题入场时长',
      scenes: [
        {
          sceneId: originalScene.id,
          effects: [
            { selector: 'h1', start: 0, duration, keyframes: [{ opacity: 0 }, { opacity: 1 }] },
          ],
        },
      ],
    })
    service.runtime.set({
      codexPath: executable,
      hyperframesPath: process.env.WORKFLOW_HYPERFRAMES_PATH,
      ...(process.env.WORKFLOW_NODE_PATH ? { nodePath: process.env.WORKFLOW_NODE_PATH } : {}),
    })
    const waitJob = async (job) => {
      for (let attempt = 0; attempt < 600; attempt++) {
        const current = service.repository.job(job.id)
        if (current.state !== 'running') return current
        await delay(100)
      }
      throw new Error('Timed out waiting for roughcut motion job')
    }
    const planned = await waitJob(
      await service.generate({
        projectId,
        stage: 'roughcut',
        executor: 'codex',
        expectedRevision: state.revision,
        requestId: randomUUID(),
        modification: { sceneId: originalScene.id, at: 0, feedback: '只调整当前标题入场时长' },
      }),
    )
    assert.equal(planned.state, 'succeeded', planned.error)
    const prompt = readFileSync(promptPath, 'utf8')
    assert.ok(prompt.includes(originalScene.title))
    assert.doesNotMatch(prompt, /replacement-|未应用的新画面|以下要求是必须执行的数据/)
    const rendered = await waitJob(
      await service.generate({
        projectId,
        stage: 'roughcut',
        executor: 'template',
        expectedRevision: state.revision,
        requestId: randomUUID(),
        motionPlanJobId: planned.id,
      }),
    )
    assert.equal(rendered.state, 'succeeded', rendered.error)
    state = service.repository.get(projectId)
    const result = state.stages.roughcut.payload
    assert.equal(state.stages.roughcut.status, 'review')
    assert.equal(result.sourceStoryboard, roughcut.sourceStoryboard)
    assert.equal(result.sourceAudio, roughcut.sourceAudio)
    assert.equal(result.sourceNarration, roughcut.sourceNarration)
    assert.ok(Math.abs(result.duration - roughcut.duration) < 0.15)
    assert.deepEqual(result.motion.scenes.slice(1), roughcut.motion.scenes.slice(1))
    assert.equal(result.motion.scenes[0].effects[0].duration, duration)
    const html = readFileSync(
      await service.files.verify(
        projectId,
        result.compositionFiles[result.compositionNames.indexOf('index.html')],
      ),
      'utf8',
    )
    assert.ok(html.includes(originalScene.title))
    assert.doesNotMatch(html, /未应用的新画面/)
    assert.deepEqual(
      ['storyboard', 'narration', 'audio'].map((stage) => state.stages[stage].id),
      upstreamIds,
    )
    writeAgent({ requiresUpstream: true, reason: '本次要求新增 SVG 图形，原分镜没有对应元素' })
    const rejected = await waitJob(
      await service.generate({
        projectId,
        stage: 'roughcut',
        executor: 'codex',
        expectedRevision: state.revision,
        requestId: randomUUID(),
        modification: { sceneId: originalScene.id, at: 0, feedback: '添加新的 SVG 图形' },
      }),
    )
    assert.equal(rejected.state, 'failed')
    assert.match(rejected.error, /本次要求新增 SVG/)
    assert.equal(service.repository.get(projectId).stages.roughcut.id, state.stages.roughcut.id)
    console.log(
      'PASS: actual DOM target validation and roughcut render use preview sources; untouched scene motion and upstream versions are preserved; missing elements still require storyboard editing.',
      root,
    )
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    if (service) await service.dispose()
    if (database) database.close()
    app.quit()
  }
})
