import { app } from 'electron'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { runMigrations } from '../src/main/database/migrations'
import { VideoWorkflowService } from '../src/main/services/video-workflow/service'
import { VoiceoverService } from '../src/main/services/voiceover/voiceover-service'
import { workflowCommand } from '../src/main/services/video-workflow/process'
import { stageValue, type VideoStage } from '../src/shared/video-workflow'
import { prepareMotionScene } from '../src/main/services/video-workflow/motion'

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-workflow-smoke-'))
  console.log('Smoke artifacts:', root)
  const db = new Database(join(root, 'workflow.db'))
  runMigrations(db)
  const voice = new VoiceoverService(
    root,
    db,
    join(__dirname, '../resources/voice-runtime/worker.py'),
  )
  const service = new VideoWorkflowService(root, db, () => voice)
  try {
    if (!process.env.WORKFLOW_HYPERFRAMES_PATH)
      throw new Error('Set WORKFLOW_HYPERFRAMES_PATH to HyperFrames 0.8.181 executable or .mjs')
    service.runtime.set({
      hyperframesPath: process.env.WORKFLOW_HYPERFRAMES_PATH,
      ...(process.env.WORKFLOW_NODE_PATH ? { nodePath: process.env.WORKFLOW_NODE_PATH } : {}),
    })
    const runtime = service.runtime.get()
    const prepared = await prepareMotionScene(
      '<style>body{background:#123456}#title{color:white}.clip{padding:20px}</style><script>throw new Error("untrusted script executed")</script><h1 class="clip" id="title" onclick="alert(1)">Safe title</h1><svg><defs><linearGradient id="gradient"></linearGradient></defs><rect fill="url(#gradient)"></rect></svg>',
      'test-scene',
      ['#title', '.clip'],
      new AbortController().signal,
    )
    assert.deepEqual(prepared.counts, [1, 1])
    assert.equal(prepared.selectors[0], '[data-hf-id="test-scene-element-0"]')
    assert.ok(prepared.html.includes('url(#test-scene-node-1)'))
    assert.ok(!prepared.html.includes('<script') && !prepared.html.includes('onclick'))
    assert.ok(prepared.html.includes('motion-source-clip') && prepared.html.includes(':scope'))
    const fontScene = await prepareMotionScene(
      '<style>body{--heading-font:"Songti SC";font-family:Georgia,"Songti SC",serif}h1{font-family:var(--heading-font)}.unused{font-family:"Aptos",sans-serif}p{font:italic 32px "Times New Roman"}</style><h1>宋体标题</h1><p style="font-family:Menlo,monospace">代码</p>',
      'font-scene',
      ['h1'],
      new AbortController().signal,
    )
    for (const family of ['Songti SC', 'Georgia', 'Aptos', 'Times New Roman', 'Menlo'])
      assert.ok(fontScene.fontFamilies.includes(family), `Missing scene font: ${family}`)
    const selectorHtml =
      '<style>.hidden{display:none}</style><section id="scene-1"><h1><span>Title</span></h1><div class="eyes"><i>Left</i><i>Right</i></div><div class="foot left">Left</div><div class="foot right">Right</div><p class="hidden">Hidden</p></section>'
    const selectors = [
      '#scene-1 .eyes i:nth-child(2)',
      'h1 > span, .eyes i:first-child',
      '.foot.left + .foot.right',
    ]
    const selected = await prepareMotionScene(
      selectorHtml,
      'css-scene',
      selectors,
      new AbortController().signal,
    )
    assert.deepEqual(selected.counts, [1, 2, 1])
    assert.ok(selected.selectors.every((selector) => selector.includes('[data-hf-id=')))
    for (const [selector, message] of [
      ['.missing', /missing.*没有匹配/],
      ['.hidden', /hidden.*不可见/],
      ['h1[', /h1\[.*语法无效/],
      ['section, .hidden', /不可见/],
    ] as const) {
      await assert.rejects(
        prepareMotionScene(selectorHtml, 'css-invalid', [selector], new AbortController().signal),
        message,
      )
    }
    let project = service.repository.create('工作流真实合成验证（合成音频）')
    const saveAndApprove = async (stage: VideoStage, payload: unknown) => {
      project = await service.save(project.id, stage, payload, project.revision, randomUUID())
      project = await service.approve(
        project.id,
        stage,
        project.stages[stage]!.id,
        project.revision,
        randomUUID(),
        '自动化测试数据',
      )
    }
    await saveAndApprove('brief', { text: '验证两镜视频闭环；测试数据，不发布', duration: 10 })
    await saveAndApprove('copy', {
      text: '# 从想法到成片\n每个步骤都由你确认。\n\n# 不同分镜，不同布局\n统一视觉，多样表达。',
    })
    await saveAndApprove('storyboard', {
      mode: 'template',
      template: 'technical',
      scenes: [
        {
          id: 'scene-1',
          title: '从想法，到成片',
          body: '每个步骤，都由你确认。',
          layout: 'title',
          html: '<style>body{background:#0e1923;color:#f1f6ff;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}section{padding:100px 120px}h1{font-size:108px}p{font-size:36px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}</style><section><h1>从想法，到成片</h1><p>每个步骤，都由你确认。</p></section>',
        },
        { id: 'scene-2', title: '统一视觉，多样表达', body: '独立分镜\n人工审核', layout: 'split' },
      ],
    })
    await saveAndApprove('narration', {
      scenes: [
        { id: 'scene-1', text: '从想法到成片。' },
        { id: 'scene-2', text: '不同布局，统一表达。' },
      ],
    })
    const sources = [join(root, '01.wav'), join(root, '02.wav')]
    for (const [index, source] of sources.entries())
      await workflowCommand(
        runtime.ffmpegPath,
        [
          '-nostdin',
          '-y',
          '-f',
          'lavfi',
          '-i',
          `sine=frequency=${440 + index * 110}:duration=2`,
          '-ar',
          '48000',
          '-ac',
          '1',
          source,
        ],
        { cwd: root },
      )
    const generate = async (stage: VideoStage, imports?: string[]) => {
      const job = await service.generate(
        {
          projectId: project.id,
          stage,
          expectedRevision: project.revision,
          requestId: randomUUID(),
          executor: 'template',
        },
        imports,
      )
      let previous = ''
      for (let attempt = 0; attempt < 1200; attempt++) {
        const current = service.repository.job(job.id)!
        if (current.phase !== previous) {
          console.log(stage, current.state, current.phase)
          previous = current.phase
        }
        if (current.state !== 'running') {
          assert.equal(current.state, 'succeeded', current.error ?? current.phase)
          project = service.repository.get(project.id)
          break
        }
        await delay(500)
      }
      assert.equal(service.repository.job(job.id)!.state, 'succeeded')
      assert.equal(project.stages[stage]!.status, 'review')
      project = await service.approve(
        project.id,
        stage,
        project.stages[stage]!.id,
        project.revision,
        randomUUID(),
        'Smoke verified',
      )
    }
    await generate('audio', sources)
    assert.ok(Math.abs(stageValue(project, 'audio')!.duration - 4) < 0.01)
    if (process.env.WORKFLOW_MG_REQUIREMENTS_SMOKE === '1') {
      const storyboard = stageValue(project, 'storyboard')!
      await saveAndApprove('storyboard', {
        ...storyboard,
        scenes: storyboard.scenes.map((scene) => ({
          ...scene,
          requirements: '每页 MG 动画，标题先出现，说明文字再出现。',
        })),
      })
      await saveAndApprove('narration', stageValue(project, 'narration'))
      project = service.repository.save(
        project.id,
        'audio',
        stageValue(project, 'audio'),
        project.revision,
        randomUUID(),
      )
      project = await service.approve(
        project.id,
        'audio',
        project.stages.audio!.id,
        project.revision,
        randomUUID(),
        '自动化测试数据',
      )
      const fakeAgent = join(root, 'initial-mg-codex')
      const plan = {
        summary: '每镜标题先上移渐入，说明文字随后缩放渐入。',
        scenes: storyboard.scenes.map((scene) => ({
          sceneId: scene.id,
          effects: [
            {
              selector: 'h1',
              start: 0,
              duration: 0.6,
              keyframes: [
                { opacity: 0, translate: '0px 40px' },
                { opacity: 1, translate: '0px 0px' },
              ],
            },
            {
              selector: 'p',
              start: 0.6,
              duration: 0.5,
              keyframes: [
                { opacity: 0, scale: 0.8 },
                { opacity: 1, scale: 1 },
              ],
            },
          ],
        })),
      }
      writeFileSync(
        fakeAgent,
        `#!${runtime.nodePath}\nconst fs=require('node:fs');let prompt='';process.stdin.on('data',chunk=>prompt+=chunk);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(join(root, 'initial-mg-prompt.txt'))},prompt);fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify(plan))});});\n`,
      )
      chmodSync(fakeAgent, 0o755)
      service.runtime.set({ codexPath: fakeAgent })
    }
    await generate('roughcut')
    if (process.env.WORKFLOW_MG_REQUIREMENTS_SMOKE === '1') {
      const roughcut = stageValue(project, 'roughcut')!
      assert.ok(roughcut.motion?.scenes.every((scene) => scene.effects.length === 2))
      assert.match(readFileSync(join(root, 'initial-mg-prompt.txt'), 'utf8'), /每页 MG 动画/)
      const composition = service.files.text(
        roughcut.compositionFiles[roughcut.compositionNames.indexOf('index.html')],
      )
      assert.match(composition, /0px 40px/)
      assert.match(composition, /"delay":0.6/)
      assert.match(composition, /data-hf-id/)
      const videoPath = await service.files.verify(project.id, roughcut.file)
      const frames = await workflowCommand(
        runtime.ffmpegPath,
        [
          '-v',
          'error',
          '-i',
          videoPath,
          '-an',
          '-vf',
          "select='eq(n,3)+eq(n,27)'",
          '-vsync',
          '0',
          '-f',
          'framemd5',
          '-',
        ],
        { cwd: root, timeout: 15000 },
      )
      const hashes = frames
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split(',').at(-1)!.trim())
      assert.equal(hashes.length, 2)
      assert.notEqual(hashes[0], hashes[1], 'rendered early and settled MG frames must differ')
      console.log(
        'PASS: persisted MG requirements → initial Agent plan → real multi-element animated roughcut',
      )
    }
    await generate('render')
    assert.equal(stageValue(project, 'render')!.motion?.scenes.length, 2)
    assert.equal(stageValue(project, 'render')!.sourceRoughcut, project.stages.roughcut!.id)
    assert.deepEqual(stageValue(project, 'render')!.renderProfile, { quality: 'delivery', fps: 30 })
    assert.deepEqual(stageValue(project, 'roughcut')!.renderProfile, { quality: 'looks', fps: 30 })
    const exported = await service.exportComposition(project.id, 'render', root)
    assert.ok(readFileSync(join(exported, 'index.html'), 'utf8').includes('element.animate'))
    const style = await service.saveTemplate(
      project.id,
      project.revision,
      '技术讲解测试模板',
      '多镜版式与入场动效',
    )
    assert.equal(style.storyboard.scenes.length, 2)
    assert.equal(style.motion?.scenes.length, 2)
    if (process.env.WORKFLOW_MOTION_REVIEW_SMOKE === '1') {
      const fakeAgent = join(root, 'fake-codex')
      const plan = {
        summary: '第一镜标题旋转轻弹入场',
        scenes: [
          {
            sceneId: 'scene-1',
            effects: [
              {
                selector: 'h1:nth-of-type(1)',
                start: 0,
                duration: 0.8,
                keyframes: [
                  { opacity: 0, scale: 0.8, rotate: '-5deg' },
                  { opacity: 1, scale: 1.05, rotate: '2deg' },
                  { opacity: 1, scale: 1, rotate: '0deg' },
                ],
              },
            ],
          },
        ],
      }
      writeFileSync(
        fakeAgent,
        `#!${runtime.nodePath}\nconst fs=require('node:fs');let prompt='';process.stdin.on('data',chunk=>prompt+=chunk);process.stdin.on('end',()=>{fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify(plan))})});\n`,
      )
      chmodSync(fakeAgent, 0o755)
      service.runtime.set({ codexPath: fakeAgent })
      const before = project
      const proposal = await service.generate({
        projectId: project.id,
        stage: 'roughcut',
        expectedRevision: project.revision,
        requestId: randomUUID(),
        executor: 'codex',
        modification: { feedback: '第一镜标题旋转轻弹入场', at: 0.4, sceneId: 'scene-1' },
      })
      const waitJob = async (id: string) => {
        for (let attempt = 0; attempt < 400; attempt++) {
          const job = service.repository.job(id)!
          if (job.state !== 'running') {
            assert.equal(job.state, 'succeeded', job.error ?? job.phase)
            return
          }
          await delay(250)
        }
        throw new Error('Motion job timed out')
      }
      await waitJob(proposal.id)
      project = service.repository.get(project.id)
      assert.equal(project.revision, before.revision)
      assert.equal(project.stages.roughcut!.id, before.stages.roughcut!.id)
      const revisionJob = await service.generate({
        projectId: project.id,
        stage: 'roughcut',
        expectedRevision: project.revision,
        requestId: randomUUID(),
        executor: 'template',
        motionPlanJobId: proposal.id,
      })
      await waitJob(revisionJob.id)
      project = service.repository.get(project.id)
      assert.equal(project.stages.roughcut!.version, 2)
      assert.equal(project.stages.audio!.id, before.stages.audio!.id)
      assert.equal(project.stages.render!.status, 'stale')
      assert.equal(stageValue(project, 'roughcut')!.motion!.scenes.length, 2)
      assert.deepEqual(stageValue(project, 'roughcut')!.motion!.scenes[1].transition, {
        type: 'crossfade',
        duration: 0.4,
      })
      project = await service.approve(
        project.id,
        'roughcut',
        project.stages.roughcut!.id,
        project.revision,
        randomUUID(),
        'Motion verified',
      )
      await generate('render')
      console.log(
        'PASS: motion feedback → persisted plan → confirmation → real roughcut v2 → reused audio → final v2',
      )
    }
    assert.equal(
      stageValue(project, 'roughcut')!.manifestHash,
      stageValue(project, 'render')!.manifestHash,
    )
    await saveAndApprove('publish', {
      platforms: {
        bilibili: { title: '验证视频', description: '测试，不上传', tags: ['测试'] },
        douyin: { title: '验证视频', description: '测试，不上传', tags: ['测试'] },
      },
    })
    const bilibili = await service.exportPublication(project.id, 'bilibili', root)
    const douyin = await service.exportPublication(project.id, 'douyin', root)
    assert.ok(existsSync(join(bilibili, 'video.mp4')) && existsSync(join(douyin, 'video.mp4')))
    assert.equal(
      JSON.parse(readFileSync(join(bilibili, 'manifest.json'), 'utf8')).videoSha256,
      JSON.parse(readFileSync(join(douyin, 'manifest.json'), 'utf8')).videoSha256,
    )
    project = service.repository.get(project.id)
    const record = project.publications.find((item) => item.platform === 'bilibili')!
    assert.throws(
      () => service.repository.receipt(project.id, record.id, 'https://www.douyin.com/video/123'),
      /对应平台/,
    )
    service.repository.receipt(project.id, record.id, 'https://www.bilibili.com/video/BV1test')
    project = service.repository.get(project.id)
    assert.ok(project.publications.find((item) => item.id === record.id)!.publishedAt)
    project = await service.save(
      project.id,
      'brief',
      { text: '修改上游后需重新审核', duration: 10 },
      project.revision,
      randomUUID(),
    )
    await assert.rejects(service.exportPublication(project.id, 'bilibili', root), /审核/)
    assert.equal(project.publications.length, 2)
    console.log(
      'PASS: audio → real HyperFrames roughcut → final render → two publishing packages → receipts → invalidation',
    )
    await service.dispose()
    await voice.dispose()
    db.close()
    app.exit(0)
  } catch (error) {
    console.error(error)
    await service.dispose()
    await voice.dispose()
    db.close()
    app.exit(1)
  }
})
