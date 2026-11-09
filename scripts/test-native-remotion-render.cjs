require('tsx/cjs')
const { app, nativeImage } = require('electron')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { randomUUID } = require('node:crypto')
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { execFileSync } = require('node:child_process')
const { runMigrations } = require('../src/main/database/migrations')
const { VideoWorkflowService } = require('../src/main/services/video-workflow/service')
const { WorkflowRuntimeManager } = require('../src/main/services/video-workflow/cli')
const { renderWorkflow } = require('../src/main/services/video-workflow/render')

const root = mkdtempSync(join(tmpdir(), 'native-remotion-render-'))
app.setPath('userData', join(root, 'electron'))
app.on('window-all-closed', () => {})
const deadline = setTimeout(() => app.exit(1), 300000)

app.whenReady().then(async () => {
  const db = new Database(join(root, 'workflow.db'))
  runMigrations(db)
  const service = new VideoWorkflowService(root, db, () => {
    throw new Error('Unexpected voice generation')
  })
  try {
    assert.ok(process.env.WORKFLOW_REMOTION_PATH, 'WORKFLOW_REMOTION_PATH is required')
    const runtime = {
      ...new WorkflowRuntimeManager(root).get(),
      remotionPath: resolve(process.env.WORKFLOW_REMOTION_PATH),
      hyperframesPath: '',
    }
    const ffmpeg = (args) =>
      execFileSync(runtime.ffmpegPath, ['-nostdin', '-v', 'error', '-y', ...args], {
        maxBuffer: 16 * 1024 * 1024,
      })
    const sources = {
      summary: 'Native SVG curve and nonlinear frame motion',
      files: [
        {
          name: 'visuals.tsx',
          content:
            "import React from 'react'; import {AbsoluteFill, Sequence} from 'remotion'; import First from './scene-0'; import Second from './scene-1'; export default function Visuals(props) { return <AbsoluteFill>{props.scenes.map((scene,index) => <Sequence key={scene.id} from={scene.from} durationInFrames={scene.durationInFrames}>{index === 0 ? <First/> : <Second/>}</Sequence>)}</AbsoluteFill> }",
        },
        {
          name: 'scene-0.tsx',
          content:
            "import React from 'react'; import {AbsoluteFill,useCurrentFrame} from 'remotion'; export default function Scene() { const frame = useCurrentFrame(); return <AbsoluteFill style={{background:'#123456'}}><svg width='100%' height='100%'><path d={`M 50 400 Q ${frame * frame} 20 700 400`} fill='none' stroke='#ffffff' strokeWidth='20'/><circle cx={100 + frame * frame * 2} cy='200' r='60' fill='#ff0000'/></svg></AbsoluteFill> }",
        },
        {
          name: 'scene-1.tsx',
          content:
            "import React from 'react'; import {AbsoluteFill} from 'remotion'; export default function Scene() { return <AbsoluteFill style={{background:'#165b43'}}/> }",
        },
      ],
    }
    const resultPath = join(root, 'agent-response.json')
    const promptPath = join(root, 'agent-prompt.txt')
    writeFileSync(resultPath, JSON.stringify(sources))
    const agent = join(root, 'agent')
    writeFileSync(
      agent,
      `#!/usr/bin/env node\nif(process.argv[2]==='mcp'){process.stdout.write('[]');process.exit(0)}const fs=require('node:fs');let input='';process.stdin.on('data',data=>input+=data);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(promptPath)},input);fs.copyFileSync(${JSON.stringify(resultPath)},process.argv[process.argv.indexOf('--output-last-message')+1]);});`,
    )
    chmodSync(agent, 0o700)
    service.runtime.set({ ...runtime, codexPath: agent })
    const waitJob = async (job) => {
      for (let attempt = 0; attempt < 2400; attempt++) {
        const latest = service.repository.job(job.id)
        if (latest.state !== 'running') {
          assert.equal(latest.state, 'succeeded', latest.error)
          return latest
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error('Native workflow timed out')
    }
    for (const format of ['landscape', 'portrait']) {
      let project = service.repository.create(`Native ${format}`)
      const save = (stage, payload) => {
        project = service.repository.save(
          project.id,
          stage,
          payload,
          project.revision,
          randomUUID(),
        )
        project = service.repository.approve(
          project.id,
          stage,
          project.stages[stage].id,
          project.revision,
          randomUUID(),
        )
      }
      save('brief', {
        text: 'Explain a moving task with native SVG and a nonlinear camera path',
        duration: 2,
        format,
      })
      save('copy', { text: 'Task enters the queue. Execution starts.' })
      save('storyboard', {
        mode: 'agent',
        template: 'technical',
        format,
        scenes: [
          {
            id: 'one',
            title: 'Queue',
            body: 'Task enters',
            layout: 'title',
            html: `<h1>Original static queue</h1><img src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>')}">`,
            visualDirection: 'Follow the task along a changing curve',
          },
          {
            id: 'two',
            title: 'Execution',
            body: 'Execution starts',
            layout: 'title',
            html: '<h1>Execution</h1>',
          },
        ],
      })
      save('narration', {
        scenes: [
          { id: 'one', text: 'Task enters' },
          { id: 'two', text: 'Execution starts' },
        ],
      })
      const audioPath = join(root, 'voice.wav')
      ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.6', audioPath])
      const audio = await service.files.import(project.id, audioPath)
      const subtitles = await service.files.write(
        project.id,
        '1\n00:00:00,000 --> 00:00:01,600\nTask enters\n',
        '.srt',
      )
      save('audio', {
        file: audio,
        subtitles,
        duration: 1.6,
        tracks: [
          { sceneId: 'one', file: audio, text: 'Task enters', duration: 0.8 },
          { sceneId: 'two', file: audio, text: 'Execution starts', duration: 0.8 },
        ],
      })
      const generate = async (extra) => {
        const job = await service.generate({
          projectId: project.id,
          expectedRevision: project.revision,
          requestId: randomUUID(),
          executor: 'template',
          stage: 'roughcut',
          renderEngine: 'remotion',
          ...extra,
        })
        await waitJob(job)
        project = service.repository.get(project.id)
      }
      await generate()
      let roughcut = project.stages.roughcut.payload
      assert.equal(project.stages.roughcut.status, 'review')
      assert.equal(JSON.parse(roughcut.checks).motionEngine, 'remotion-native')
      assert.ok(!roughcut.compositionNames.includes('index.html'))
      assert.ok(roughcut.compositionNames.includes('asset-0-0.svg'))
      assert.notEqual(
        roughcut.cover.sha256,
        roughcut.compositionFiles[roughcut.compositionNames.indexOf('reference-0.png')].sha256,
      )
      assert.match(readFileSync(promptPath, 'utf8'), /Follow the task along a changing curve/)
      const pixel = (time, x, y) => {
        const output = join(root, `${format}-${time}.png`)
        ffmpeg([
          '-ss',
          String(time),
          '-i',
          service.files.path(roughcut.file),
          '-frames:v',
          '1',
          output,
        ])
        const image = nativeImage.createFromPath(output)
        const bitmap = image.getBitmap()
        const offset = (y * image.getSize().width + x) * 4
        return [bitmap[offset + 2], bitmap[offset + 1], bitmap[offset]]
      }
      assert.ok(pixel(0.05, 100, 200)[0] > 200, 'Native circle missing')
      assert.ok(pixel(0.6, 100, 200)[0] < 100, 'Native nonlinear animation did not advance')
      assert.ok(pixel(1.1, 10, 10)[1] > 70, 'Second native scene missing')
      const original = roughcut
      writeFileSync(
        resultPath,
        JSON.stringify({
          summary: 'Change only queue scene',
          native: { instructions: 'Change the task color while keeping all other sources' },
          scenes: [{ sceneId: 'one', effects: [] }],
        }),
      )
      const planJob = await service.generate({
        projectId: project.id,
        expectedRevision: project.revision,
        requestId: randomUUID(),
        executor: 'codex',
        stage: 'roughcut',
        renderEngine: 'remotion',
        modification: { feedback: 'Change task color', at: 0.2, sceneId: 'one' },
      })
      const plan = await waitJob(planJob)
      assert.ok(plan.motionPlan.native)
      assert.equal(
        service.repository.get(project.id).stages.roughcut.id,
        project.stages.roughcut.id,
        'Planning changed the current video',
      )
      writeFileSync(
        resultPath,
        JSON.stringify({
          ...sources,
          files: sources.files.map((file) =>
            file.name === 'scene-0.tsx'
              ? { ...file, content: file.content.replace('#ff0000', '#ff8800') }
              : file,
          ),
        }),
      )
      await generate({ motionPlanJobId: plan.id })
      roughcut = project.stages.roughcut.payload
      const originalSecond =
        original.compositionFiles[original.compositionNames.indexOf('scene-1.tsx')]
      const nextSecond = roughcut.compositionFiles[roughcut.compositionNames.indexOf('scene-1.tsx')]
      assert.equal(originalSecond.sha256, nextSecond.sha256)
      assert.equal(
        project.stages.audio.id,
        project.history.find((revision) => revision.stage === 'audio').id,
      )
      project = service.repository.approve(
        project.id,
        'roughcut',
        project.stages.roughcut.id,
        project.revision,
        randomUUID(),
      )
      const musicPath = join(root, 'music.wav')
      ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=880:duration=3', musicPath])
      const music =
        format === 'landscape'
          ? {
              file: await service.files.import(project.id, musicPath),
              title: 'Native music regression',
              source: 'local',
              start: 0.2,
              duration: 1.1,
              volume: 0.3,
              playbackRate: 1.25,
            }
          : undefined
      const final = await renderWorkflow({
        project,
        files: service.files,
        runtime,
        cwd: join(root, `${format}-final`),
        final: true,
        music,
        signal: new AbortController().signal,
        phase: console.log,
        createNative: () => {
          throw new Error('Final must not invoke authoring')
        },
      })
      assert.equal(final.sourceRoughcut, project.stages.roughcut.id)
      if (!music) assert.equal(final.manifestHash, roughcut.manifestHash)
      for (const name of roughcut.compositionNames.filter((name) => name.endsWith('.tsx')))
        assert.equal(
          final.compositionFiles[final.compositionNames.indexOf(name)].sha256,
          roughcut.compositionFiles[roughcut.compositionNames.indexOf(name)].sha256,
        )
      const finalSettings = JSON.parse(
        readFileSync(
          service.files.path(
            final.compositionFiles[final.compositionNames.indexOf('composition.json')],
          ),
          'utf8',
        ),
      )
      if (music) assert.equal(finalSettings.music.volume, 0.3)
      const destination = join(root, `${format}-export`)
      mkdirSync(destination)
      const exported = await service.exportComposition(project.id, 'roughcut', destination)
      assert.match(readFileSync(join(exported, 'visuals.tsx'), 'utf8'), /Sequence/)
      assert.ok(readFileSync(join(exported, 'public/narration.wav')).length > 100)
      assert.ok(readFileSync(join(exported, 'public/asset-0-0.svg'), 'utf8').includes('<svg'))
      const priorId = project.stages.roughcut.id
      writeFileSync(resultPath, JSON.stringify({ blockers: ['Required asset is unavailable'] }))
      const failed = await service.generate({
        projectId: project.id,
        expectedRevision: project.revision,
        requestId: randomUUID(),
        executor: 'template',
        stage: 'roughcut',
        renderEngine: 'remotion',
      })
      for (
        let attempt = 0;
        attempt < 200 && service.repository.job(failed.id).state === 'running';
        attempt++
      )
        await new Promise((resolve) => setTimeout(resolve, 50))
      assert.equal(service.repository.job(failed.id).state, 'failed')
      assert.match(service.repository.job(failed.id).error, /Required asset is unavailable/)
      assert.equal(service.repository.get(project.id).stages.roughcut.id, priorId)
      writeFileSync(resultPath, JSON.stringify(sources))
      console.log(
        `PASS native ${format}: service authoring, nonlinear SVG, scene timing, plan confirmation, single-scene isolation, frozen final, export, failure preservation`,
      )
    }
    console.log(`Native render artifacts: ${root}`)
    clearTimeout(deadline)
    await service.dispose()
    db.close()
    app.exit(0)
  } catch (error) {
    console.error(error)
    clearTimeout(deadline)
    await service.dispose()
    db.close()
    app.exit(1)
  }
})
