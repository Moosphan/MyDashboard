require('tsx/cjs')
const { app, nativeImage } = require('electron')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { randomUUID } = require('node:crypto')
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { spawnSync } = require('node:child_process')
const { runMigrations } = require('../src/main/database/migrations')
const {
  VideoWorkflowRepository,
} = require('../src/main/database/repositories/video-workflow-repository')
const { WorkflowFiles } = require('../src/main/services/video-workflow/files')
const { WorkflowRuntimeManager } = require('../src/main/services/video-workflow/cli')
const { renderWorkflow } = require('../src/main/services/video-workflow/render')
const { renderRemotion } = require('../src/main/services/video-workflow/remotion')
const { probeMedia } = require('../src/main/services/video-workflow/audio')
const { storyboardMotionPlan } = require('../src/main/services/video-workflow/motion')

const root = mkdtempSync(join(tmpdir(), 'remotion-workflow-'))
app.setPath('userData', join(root, 'electron'))
app.on('window-all-closed', () => {})
const deadline = setTimeout(() => {
  console.error('Remotion regression timed out')
  app.exit(1)
}, 300000)

app.whenReady().then(async () => {
  const db = new Database(join(root, 'workflow.db'))
  try {
    runMigrations(db)
    if (!process.env.WORKFLOW_REMOTION_PATH)
      throw new Error('Set WORKFLOW_REMOTION_PATH to the installed @remotion/cli/remotion-cli.js')
    const repository = new VideoWorkflowRepository(db)
    const files = new WorkflowFiles(root, repository)
    const runtime = {
      ...new WorkflowRuntimeManager(root).get(),
      hyperframesPath: '',
      remotionPath: resolve(process.env.WORKFLOW_REMOTION_PATH),
    }
    const ffmpeg = (args) => {
      const result = spawnSync(runtime.ffmpegPath, ['-nostdin', '-v', 'error', '-y', ...args], {
        maxBuffer: 8 * 1024 * 1024,
      })
      assert.equal(result.status, 0, result.stderr.toString())
      return result.stdout
    }
    const audioPath = join(root, 'voice.wav')
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.6', audioPath])
    const musicPath = join(root, 'music.wav')
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=880:duration=3', musicPath])
    for (const format of ['landscape', 'portrait']) {
      let project = repository.create(`Synthetic Remotion ${format}`)
      const save = (stage, payload) => {
        project = repository.save(project.id, stage, payload, project.revision, randomUUID())
        project = repository.approve(
          project.id,
          stage,
          project.stages[stage].id,
          project.revision,
          randomUUID(),
          'Synthetic regression',
        )
      }
      save('brief', { text: 'Synthetic render regression', duration: 2, format })
      save('copy', { text: 'Two synthetic scenes' })
      save('storyboard', {
        format,
        mode: 'agent',
        template: 'technical',
        motionPolicy: { enabled: true, excludedSceneIds: [] },
        scenes: [
          {
            id: 'one',
            title: 'One',
            body: 'One',
            layout: 'title',
            html: '<style>body{background:#123456}#box{position:absolute;left:100px;top:150px;width:400px;height:300px;background:#ff0000}</style><div id="box"></div>',
            motion: {
              summary: 'Reveal',
              blockers: [],
              effects: [
                {
                  selector: '#box',
                  start: 0,
                  duration: 0.8,
                  easing: 'linear',
                  keyframes: [
                    { opacity: 0, scaleX: 0.25 },
                    { opacity: 1, scaleX: 1 },
                  ],
                },
              ],
            },
          },
          {
            id: 'two',
            title: 'Two',
            body: 'Two',
            layout: 'title',
            html: '<style>body{background:#165b43}</style><h1 style="color:white">Second</h1>',
            motion: {
              summary: 'Title',
              blockers: [],
              effects: [
                {
                  selector: 'h1',
                  start: 0,
                  duration: 0.4,
                  keyframes: [{ opacity: 0 }, { opacity: 1 }],
                },
              ],
            },
          },
        ],
      })
      save('narration', {
        scenes: [
          { id: 'one', text: 'First caption' },
          { id: 'two', text: 'Second caption' },
        ],
      })
      const audio = await files.import(project.id, audioPath)
      const subtitlesPath = join(root, 'subtitles.srt')
      writeFileSync(subtitlesPath, '1\n00:00:00,000 --> 00:00:01,600\nSynthetic captions\n')
      const subtitles = await files.import(project.id, subtitlesPath)
      save('audio', {
        file: audio,
        subtitles,
        duration: 1.6,
        tracks: [
          { sceneId: 'one', text: 'First caption', file: audio, duration: 0.8 },
          { sceneId: 'two', text: 'Second caption', file: audio, duration: 0.8 },
        ],
      })
      const cwd = join(root, `${format}-roughcut`)
      mkdirSync(cwd)
      const roughcut = await renderWorkflow({
        project,
        files,
        runtime,
        cwd,
        final: false,
        renderEngine: 'remotion',
        motion: storyboardMotionPlan(project),
        signal: new AbortController().signal,
        phase: (message) => console.log(message),
      })
      assert.equal(roughcut.renderEngine, 'remotion')
      assert.ok(roughcut.compositionNames.includes('remotion.tsx'))
      assert.equal(JSON.parse(roughcut.checks).engine, 'remotion')
      const image = (time) => {
        const output = join(root, `${format}-${time}.png`)
        ffmpeg(['-ss', String(time), '-i', files.path(roughcut.file), '-frames:v', '1', output])
        return nativeImage.createFromPath(output)
      }
      const pixel = (image, x, y) => {
        const bitmap = image.getBitmap()
        const offset = (y * image.getSize().width + x) * 4
        return [bitmap[offset + 2], bitmap[offset + 1], bitmap[offset]]
      }
      const early = image(0.05),
        late = image(0.65),
        second = image(1.1)
      const earlyRed = pixel(early, 300, 250),
        lateRed = pixel(late, 300, 250)
      assert.ok(lateRed[0] > earlyRed[0] + 70, `Motion did not progress: ${earlyRed} -> ${lateRed}`)
      assert.ok(pixel(second, 10, 10)[1] > 70, 'Second scene was not shown')
      const caption = pixel(
        late,
        Math.floor(roughcut.width / 2),
        roughcut.height - (format === 'portrait' ? 200 : 48) - 3,
      )
      assert.ok(
        caption.every((value, index) => Math.abs(value - [16, 21, 33][index]) < 15),
        `Caption background missing: ${caption}`,
      )
      save('roughcut', roughcut)
      await assert.rejects(
        renderWorkflow({
          project,
          files,
          runtime,
          cwd: join(root, `${format}-invalid`),
          final: true,
          renderEngine: 'hyperframes',
          signal: new AbortController().signal,
          phase: () => {},
        }),
        /沿用粗剪/,
      )
      const musicFile = await files.import(project.id, musicPath)
      const final = await renderWorkflow({
        project,
        files,
        runtime,
        cwd: join(root, `${format}-final`),
        final: true,
        music: {
          file: musicFile,
          title: 'Synthetic music',
          source: 'local',
          start: 0.2,
          duration: 1.1,
          volume: 0.3,
          playbackRate: 1.25,
        },
        signal: new AbortController().signal,
        phase: (message) => console.log(message),
      })
      assert.equal(final.renderEngine, 'remotion')
      assert.equal(final.sourceRoughcut, project.stages.roughcut.id)
      assert.equal(final.sourceStoryboard, roughcut.sourceStoryboard)
      assert.equal(final.music.start, 0.2)
      const settingsIndex = final.compositionNames.indexOf('composition.json')
      const settings = JSON.parse(
        readFileSync(files.path(final.compositionFiles[settingsIndex]), 'utf8'),
      )
      assert.equal(settings.music.volume, 0.3)
      const probed = await probeMedia(runtime, files.path(final.file), root)
      assert.ok(probed.streams.some((stream) => stream.codec_type === 'audio'))
      const samples = ffmpeg([
        '-i',
        files.path(final.file),
        '-t',
        '1',
        '-ac',
        '1',
        '-ar',
        '8000',
        '-f',
        'f32le',
        '-',
      ])
      let energy = 0
      for (let offset = 0; offset < samples.length; offset += 4)
        energy += samples.readFloatLE(offset) ** 2
      assert.ok(energy > 0.1, 'Rendered audio is silent')
      const frequencyEnergy = (frequency) => {
        let cosine = 0,
          sine = 0
        const length = samples.length / 4
        for (let index = 0; index < length; index++) {
          const sample = samples.readFloatLE(index * 4)
          const phase = (2 * Math.PI * frequency * index) / 8000
          cosine += sample * Math.cos(phase)
          sine += sample * Math.sin(phase)
        }
        return Math.hypot(cosine, sine) / length
      }
      assert.ok(frequencyEnergy(440) > 0.02, 'Narration frequency missing')
      assert.ok(
        Math.max(frequencyEnergy(880), frequencyEnergy(1100)) > 0.003,
        'Applied music missing from mixed audio',
      )
      assert.ok(Math.abs(probed.duration - 1.6) < 0.15)
      const changedEntry = join(root, `${format}-tampered`)
      mkdirSync(changedEntry)
      writeFileSync(join(changedEntry, 'remotion.tsx'), 'throw new Error("untrusted")')
      await assert.rejects(
        renderRemotion(runtime, changedEntry, new AbortController().signal, false, () => {}),
        /可信模板/,
      )
      console.log(
        `PASS ${format}: real Remotion motion, scene timing, narration, captions, music, frozen final and entry protection`,
      )
    }
    console.log(`Synthetic artifacts: ${root}`)
    db.close()
    clearTimeout(deadline)
    app.exit(0)
  } catch (error) {
    console.error(error)
    console.error(`Synthetic artifacts: ${root}`)
    db.close()
    clearTimeout(deadline)
    app.exit(1)
  }
})
