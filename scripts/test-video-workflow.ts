import test from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { runMigrations } from '../src/main/database/migrations'
import { VideoWorkflowRepository } from '../src/main/database/repositories/video-workflow-repository'
import {
  validatePayload,
  splitNarration,
  stageValue,
  type AudioProgress,
  validateMotionPlan,
} from '../src/shared/video-workflow'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkflowFiles } from '../src/main/services/video-workflow/files'
import { workflowCommand } from '../src/main/services/video-workflow/process'
import { publicIPv4 } from '../src/main/services/video-workflow/references'
import {
  parseAgentJson,
  runAgent,
  WorkflowRuntimeManager,
} from '../src/main/services/video-workflow/cli'
import {
  assertHyperframesCheck,
  assertRenderRuntime,
  hyperframesDocument,
} from '../src/main/services/video-workflow/render'
import {
  agentPrompt,
  safeStoryboardDocument,
  sceneHtml,
  templateStoryboard,
  styleTemplateReference,
} from '../src/main/services/video-workflow/storyboard'
import { mediaRange, workflowMediaResponse } from '../src/main/services/video-workflow/media'
import { VideoWorkflowService } from '../src/main/services/video-workflow/service'
import { VoiceoverService } from '../src/main/services/voiceover/voiceover-service'
import { createWorkflowAudio } from '../src/main/services/video-workflow/audio'
import {
  defaultMotion,
  mergeMotion,
  motionPrompt,
} from '../src/main/services/video-workflow/motion'

function fixture() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  const repository = new VideoWorkflowRepository(db)
  const project = repository.create('演示项目')
  return { db, repository, project }
}

test('motion plans accept only finite scene-local declarative animations', () => {
  const input = {
    summary: '标题渐入，角色轻弹',
    feedback: '让元素动起来',
    at: 0,
    scenes: [
      {
        sceneId: 'one',
        effects: [
          {
            selector: 'h1',
            start: 0,
            duration: 0.6,
            keyframes: [
              { opacity: 0, translate: '0px 24px' },
              { opacity: 1, translate: '0px 0px' },
            ],
          },
        ],
      },
    ],
  }
  const plan = validateMotionPlan(input, [{ id: 'one', duration: 2 }])
  assert.equal(plan.scenes[0].effects[0].keyframes[0].opacity, 0)
  for (const selector of [
    '#scene-1 .eyes i:nth-child(2)',
    'h1 > span, .mascot .letter',
    '.foot.left + .foot.right',
    ':is(.eyebrow, .tag)',
  ]) {
    const selected = validateMotionPlan(
      {
        ...input,
        scenes: [{ sceneId: 'one', effects: [{ ...input.scenes[0].effects[0], selector }] }],
      },
      [{ id: 'one', duration: 2 }],
    )
    assert.equal(selected.scenes[0].effects[0].selector, selector)
  }
  assert.throws(
    () =>
      validateMotionPlan({ ...input, scenes: [{ sceneId: 'other', effects: [] }] }, [
        { id: 'one', duration: 2 },
      ]),
    /分镜/,
  )
  for (const changes of [
    { duration: Infinity },
    { start: -1 },
    { duration: 3 },
    { selector: 'body,script' },
    { keyframes: [{ transform: 'url(https://example.com)' }, { opacity: 1 }] },
    { keyframes: [{ opacity: 2 }, { opacity: 1 }] },
    { iterations: -1 },
  ]) {
    assert.throws(() =>
      validateMotionPlan(
        {
          ...input,
          scenes: [{ sceneId: 'one', effects: [{ ...input.scenes[0].effects[0], ...changes }] }],
        },
        [{ id: 'one', duration: 2 }],
      ),
    )
  }
})

test('scene transitions are validated and rendered across a real boundary without moving narration', () => {
  const { db, state } = visualFixture()
  try {
    const base = defaultMotion(state)
    const effects = base.scenes[1].effects
    for (const type of ['crossfade', 'slide-left', 'slide-up', 'wipe-left']) {
      const plan = validateMotionPlan(
        { ...base, scenes: [{ sceneId: 'two', effects, transition: { type, duration: 0.4 } }] },
        [
          { id: 'one', duration: 2 },
          { id: 'two', duration: 2 },
        ],
      )
      assert.equal(plan.scenes[0].transition?.type, type)
      const merged = mergeMotion(state, plan)
      const html = hyperframesDocument(
        state,
        ['<div id="scene-0">One</div>', '<div id="scene-1">Two</div>'],
        merged,
      )
      assert.match(html, /id="clip-0" data-start="0\.000000" data-duration="2\.400000"/)
      assert.match(html, /id="clip-1" data-start="2\.000000" data-duration="2\.000000"/)
      assert.match(html, /id="narration"[^>]*data-duration="4\.000000"/)
      const animations: {
        id: string
        frames: unknown
        options: { delay: number; duration: number }
      }[] = []
      const node = (id: string) => ({
        querySelectorAll: () => [],
        animate: (frames: unknown, options: { delay: number; duration: number }) => {
          animations.push({ id, frames, options })
          return { pause() {} }
        },
      })
      runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)![1], {
        document: { getElementById: node },
      })
      const entering = animations.find((item) => item.id === 'scene-enter-1')!
      assert.ok(entering, `${type} must animate an inner scene wrapper`)
      assert.equal(entering.options.delay, 2000)
      assert.equal(entering.options.duration, 400)
      assert.notDeepEqual((entering.frames as unknown[])[0], (entering.frames as unknown[])[1])
      assert.ok(animations.every((item) => !item.id.startsWith('clip-')))
      if (type.startsWith('slide-')) {
        assert.equal(animations.find((item) => item.id === 'scene-exit-0')!.options.delay, 2000)
      }
    }
    for (const transition of [
      { type: 'script', duration: 0.4 },
      { type: 'crossfade', duration: Infinity },
      { type: 'slide-left', duration: -1 },
      { type: 'crossfade', duration: 1.5 },
    ]) {
      assert.throws(
        () =>
          validateMotionPlan({ ...base, scenes: [{ sceneId: 'two', effects, transition }] }, [
            { id: 'one', duration: 2 },
            { id: 'two', duration: 2 },
          ]),
        /转场/,
      )
    }
    assert.throws(
      () =>
        validateMotionPlan(
          {
            ...base,
            scenes: [{ ...base.scenes[0], transition: { type: 'crossfade', duration: 0.4 } }],
          },
          [
            { id: 'one', duration: 2 },
            { id: 'two', duration: 2 },
          ],
        ),
      /首镜/,
    )
  } finally {
    db.close()
  }
})

function visualFixture() {
  const fixtureData = fixture()
  const { repository } = fixtureData
  let state = fixtureData.project
  const file = {
    id: randomUUID(),
    path: `media/video-workflow/${state.id}/source.png`,
    sha256: 'a'.repeat(64),
    size: 1,
    mime: 'image/png',
  }
  const render = {
    file,
    cover: file,
    duration: 4,
    width: 1920,
    height: 1080,
    compositionFiles: [file],
    compositionNames: ['frame-0.png'],
    manifestHash: 'a'.repeat(64),
    checks: 'verified',
  }
  const payloads = {
    brief: { text: '验证动效修改', duration: 4 },
    copy: { text: '两镜新内容' },
    storyboard: {
      mode: 'template',
      template: 'technical',
      scenes: [
        { id: 'one', title: '第一镜', body: '说明一', layout: 'title' },
        { id: 'two', title: '第二镜', body: '说明二', layout: 'split' },
      ],
    },
    narration: {
      scenes: [
        { id: 'one', text: '第一段口播' },
        { id: 'two', text: '第二段口播' },
      ],
    },
    audio: {
      file,
      subtitles: file,
      duration: 4,
      tracks: [
        { sceneId: 'one', file, duration: 2, text: '第一段口播' },
        { sceneId: 'two', file, duration: 2, text: '第二段口播' },
      ],
    },
  }
  for (const stage of ['brief', 'copy', 'storyboard', 'narration', 'audio'] as const) {
    state = repository.save(state.id, stage, payloads[stage], state.revision, randomUUID())
    state = repository.approve(
      state.id,
      stage,
      state.stages[stage]!.id,
      state.revision,
      randomUUID(),
    )
  }
  return { ...fixtureData, state, render }
}

test('motion proposals persist without changing approvals, then a new roughcut only invalidates downstream stages', () => {
  const { db, repository, state: initial, render } = visualFixture()
  try {
    let state = repository.save(initial.id, 'roughcut', render, initial.revision, randomUUID())
    state = repository.approve(
      state.id,
      'roughcut',
      state.stages.roughcut!.id,
      state.revision,
      randomUUID(),
    )
    state = repository.save(state.id, 'render', render, state.revision, randomUUID())
    state = repository.approve(
      state.id,
      'render',
      state.stages.render!.id,
      state.revision,
      randomUUID(),
    )
    const originalAudio = state.stages.audio!.id
    const job = repository.startJob(state.id, 'roughcut', state.revision, randomUUID(), 'codex')
    repository.markMotionJob(job.id)
    const plan = {
      ...defaultMotion(state),
      sceneId: 'one',
      scenes: [defaultMotion(state).scenes[0]],
    }
    repository.finishMotionPlan(job.id, plan)
    assert.equal(repository.get(state.id).revision, state.revision)
    assert.equal(repository.get(state.id).stages.roughcut!.status, 'approved')
    assert.deepEqual(
      new VideoWorkflowRepository(db).motionPlan(state.id, job.id, state.revision).scenes,
      plan.scenes,
    )
    const merged = mergeMotion(state, plan)
    assert.equal(merged.scenes.length, 2)
    assert.ok(motionPrompt(state, '标题轻弹', 1, 'one').includes('第一段口播') === false)
    state = repository.save(
      state.id,
      'roughcut',
      { ...render, motion: merged },
      state.revision,
      randomUUID(),
    )
    assert.equal(state.stages.audio!.id, originalAudio)
    assert.equal(state.stages.audio!.status, 'approved')
    assert.equal(state.stages.roughcut!.version, 2)
    assert.equal(state.stages.roughcut!.status, 'review')
    assert.equal(state.stages.render!.status, 'stale')
    assert.throws(() => repository.motionPlan(state.id, job.id, state.revision), /过期/)
    assert.equal(state.history.filter((revision) => revision.stage === 'roughcut').length, 2)
  } finally {
    db.close()
  }
})

test('style templates require an approved current final and freeze multi-scene visual and motion references', () => {
  const { db, repository, state: initial, render } = visualFixture()
  try {
    assert.throws(() => repository.saveTemplate(initial.id, initial.revision, '样式', ''), /审核/)
    let state = repository.save(
      initial.id,
      'roughcut',
      { ...render, motion: defaultMotion(initial) },
      initial.revision,
      randomUUID(),
    )
    state = repository.approve(
      state.id,
      'roughcut',
      state.stages.roughcut!.id,
      state.revision,
      randomUUID(),
    )
    state = repository.save(
      state.id,
      'render',
      { ...render, motion: stageValue(state, 'roughcut')!.motion },
      state.revision,
      randomUUID(),
    )
    assert.throws(() => repository.saveTemplate(state.id, state.revision, '样式', ''), /审核/)
    state = repository.approve(
      state.id,
      'render',
      state.stages.render!.id,
      state.revision,
      randomUUID(),
    )
    const saved = repository.saveTemplate(state.id, state.revision, '技术风格', '轻弹标题')
    assert.equal(saved.storyboard.scenes.length, 2)
    assert.equal(saved.motion!.scenes.length, 2)
    const reference = styleTemplateReference(saved)
    assert.ok(reference.includes('#0e1923') && reference.includes('split'))
    assert.equal((saved as unknown as Record<string, unknown>).narration, undefined)
    assert.equal(repository.get(state.id).revision, state.revision)
    state = repository.save(state.id, 'copy', { text: '新内容' }, state.revision, randomUUID())
    assert.throws(() => repository.saveTemplate(state.id, state.revision, '新样式', ''), /审核/)
    assert.equal(
      new VideoWorkflowRepository(db).template(saved.id).storyboard.scenes[0].title,
      '第一镜',
    )
  } finally {
    db.close()
  }
})

test('saved styles guide Agent storyboard generation with new approved copy and preserve the template selection', async () => {
  const { db, repository, state: initial, render } = visualFixture()
  const root = mkdtempSync(join(tmpdir(), 'workflow-style-'))
  const service = new VideoWorkflowService(root, db, () => {
    throw new Error('No voice synthesis during storyboard creation')
  })
  try {
    let source = repository.save(initial.id, 'roughcut', render, initial.revision, randomUUID())
    source = repository.approve(
      source.id,
      'roughcut',
      source.stages.roughcut!.id,
      source.revision,
      randomUUID(),
    )
    source = repository.save(source.id, 'render', render, source.revision, randomUUID())
    source = repository.approve(
      source.id,
      'render',
      source.stages.render!.id,
      source.revision,
      randomUUID(),
    )
    const template = repository.saveTemplate(
      source.id,
      source.revision,
      '统一技术风格',
      '深色背景，清晰层次',
    )
    let target = repository.create('全新的主题')
    target = repository.save(
      target.id,
      'brief',
      { text: '新项目介绍', duration: 30 },
      target.revision,
      randomUUID(),
    )
    target = repository.approve(
      target.id,
      'brief',
      target.stages.brief!.id,
      target.revision,
      randomUUID(),
    )
    target = repository.save(
      target.id,
      'copy',
      { text: '介绍新项目的协作功能' },
      target.revision,
      randomUUID(),
    )
    target = repository.approve(
      target.id,
      'copy',
      target.stages.copy!.id,
      target.revision,
      randomUUID(),
    )
    const output = {
      mode: 'agent',
      template: 'technical',
      scenes: [
        {
          id: 'new-one',
          title: '协作功能',
          body: '新内容',
          layout: 'split',
          html: '<h1>协作功能</h1>',
        },
      ],
    }
    const script = join(root, 'fake-codex'),
      capture = join(root, 'prompt.txt')
    writeFileSync(
      script,
      `#!/usr/bin/env node\nconst fs=require('node:fs');let prompt='';process.stdin.on('data',chunk=>prompt+=chunk);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(capture)},prompt);fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify(output))});});\n`,
    )
    chmodSync(script, 0o755)
    service.runtime.set({ codexPath: script })
    const job = await service.generate({
      projectId: target.id,
      stage: 'storyboard',
      executor: 'codex',
      expectedRevision: target.revision,
      requestId: randomUUID(),
      settings: { mode: 'agent', template: 'technical', styleTemplateId: template.id },
    })
    for (let attempt = 0; attempt < 100 && repository.job(job.id)!.state === 'running'; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(repository.job(job.id)!.state, 'succeeded', repository.job(job.id)!.error ?? '')
    const prompt = readFileSync(capture, 'utf8')
    assert.ok(
      prompt.includes('介绍新项目的协作功能') &&
        prompt.includes('统一技术风格') &&
        prompt.includes('#0e1923'),
    )
    const result = repository.get(target.id)
    assert.equal(stageValue(result, 'storyboard')!.styleTemplateId, template.id)
    assert.equal(result.stages.storyboard!.status, 'review')
    assert.equal(result.stages.narration, undefined)
  } finally {
    await service.dispose()
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('audio publishes durable playable segments before later segments fail or are cancelled', async () => {
  for (const outcome of ['failed', 'cancelled', 'interrupted', 'succeeded'] as const) {
    const { db, repository, project } = fixture()
    const root = mkdtempSync(join(tmpdir(), 'workflow-progress-'))
    const voice = new VoiceoverService(root, db, join(root, 'worker.py'))
    const files = new WorkflowFiles(root, repository)
    const runtime = new WorkflowRuntimeManager(root).get()
    const controller = new AbortController()
    let snapshots = 0
    let state = project
    try {
      const payloads = {
        brief: { text: '逐段配音', duration: 60 },
        copy: { text: '第一段与第二段。' },
        storyboard: {
          mode: 'template',
          template: 'technical',
          scenes: [
            { id: 'one', title: '第一镜', body: '说明', layout: 'title' },
            { id: 'two', title: '第二镜', body: '说明', layout: 'title' },
          ],
        },
        narration: {
          scenes: [
            { id: 'one', text: '第一段。' },
            { id: 'two', text: '第二段。' },
          ],
        },
      }
      for (const stage of ['brief', 'copy', 'storyboard', 'narration'] as const) {
        state = repository.save(project.id, stage, payloads[stage], state.revision, randomUUID())
        state = repository.approve(
          project.id,
          stage,
          state.stages[stage]!.id,
          state.revision,
          randomUUID(),
        )
      }
      const job = repository.startJob(
        project.id,
        'audio',
        state.revision,
        randomUUID(),
        'manual-audio',
      )
      const source = join(root, 'source.wav')
      await workflowCommand(
        runtime.ffmpegPath,
        ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', source],
        { cwd: root, signal: controller.signal, timeout: 10000 },
      )
      const pending = createWorkflowAudio({
        project: state,
        job,
        voice: { engine: 'edge', voiceId: 'zh-CN-XiaoxiaoNeural', options: {} },
        service: voice,
        files,
        runtime,
        cwd: join(root, 'job'),
        signal: controller.signal,
        phase: () => {},
        imports: [source, outcome === 'failed' ? join(root, 'missing.wav') : source],
        progress: async (progress: AudioProgress) => {
          repository.updateAudioProgress(job.id, progress)
          snapshots++
          const saved = new VideoWorkflowRepository(db).get(project.id)
          assert.equal(saved.stages.audio, undefined, 'partial audio must never become reviewable')
          assert.equal(saved.jobs[0].state, 'running')
          assert.equal(saved.jobs[0].audioProgress?.tracks.length, snapshots)
          assert.equal(progress.total, 2)
          await files.verify(project.id, progress.tracks.at(-1)!.file)
          assert.equal(
            workflowMediaResponse(
              files,
              progress.tracks[0].file,
              new Request('http://localhost/audio'),
            ).status,
            200,
          )
          if (outcome === 'cancelled') controller.abort()
        },
      })
      if (outcome === 'failed' || outcome === 'cancelled') {
        await assert.rejects(pending)
        repository.updateJob(job.id, { state: outcome })
        assert.equal(snapshots, 1)
      } else {
        const result = await pending
        assert.equal(snapshots, 2)
        if (outcome === 'interrupted') repository.recover()
        else {
          state = repository.finishJob(job.id, result)
          assert.equal(state.stages.audio?.status, 'review')
          assert.equal(state.stages.roughcut, undefined)
        }
      }
      const persisted = new VideoWorkflowRepository(db).job(job.id)!
      assert.equal(persisted.state, outcome)
      assert.equal(persisted.audioProgress?.tracks.length, snapshots)
      assert.throws(() => repository.updateAudioProgress(job.id, { tracks: [], total: 2 }), /结束/)
    } finally {
      await voice.dispose()
      db.close()
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('workflow clone audio checks the cold local runtime before creating voice jobs', async () => {
  const { db, repository, project } = fixture()
  const root = mkdtempSync(join(tmpdir(), 'workflow-cold-voice-'))
  const service = new VoiceoverService(root, db, join(root, 'worker.py'))
  const files = new WorkflowFiles(root, repository)
  const workflow = new VideoWorkflowService(root, db, () => service)
  const phases: string[] = []
  let checks = 0
  service.runtime.check = async () => {
    checks++
    throw new Error('MODEL_MISSING: 环境检测确认模型缺失')
  }
  try {
    const state = {
      ...project,
      stages: {
        narration: {
          id: 'narration',
          stage: 'narration' as const,
          version: 1,
          payload: { scenes: [{ id: 'scene-1', text: '测试口播。' }] },
          dependencies: '',
          status: 'approved' as const,
          createdAt: new Date().toISOString(),
          approvedAt: new Date().toISOString(),
          note: '',
        },
      },
    }
    for (const engine of ['voxcpm2', 'qwen3-tts'] as const) {
      await assert.rejects(
        createWorkflowAudio({
          project: state,
          job: {
            id: engine,
            projectId: project.id,
            stage: 'audio',
            requestId: engine,
            expectedRevision: 1,
            executor: 'template',
            state: 'running',
            phase: '',
            error: null,
            createdAt: '',
            updatedAt: '',
          },
          voice: { engine, profileId: 'profile', profileRevision: 1, options: {} },
          service,
          files,
          runtime: workflow.runtime.get(),
          cwd: root,
          signal: new AbortController().signal,
          phase: (message) => phases.push(message),
        }),
        /MODEL_MISSING/,
      )
    }
    assert.equal(checks, 2)
    assert.ok(phases.some((phase) => phase.includes('检测本地配音')))
    assert.equal(
      (db.prepare('SELECT count(*) AS count FROM voice_jobs').get() as { count: number }).count,
      0,
    )
  } finally {
    await workflow.dispose()
    await service.dispose()
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('AI narration uses approved copy and storyboard and stays awaiting human review', async () => {
  const { db, repository, project } = fixture()
  const root = mkdtempSync(join(tmpdir(), 'video-narration-'))
  const service = new VideoWorkflowService(root, db, () => {
    throw new Error('Narration generation must not invoke voice synthesis')
  })
  try {
    let state = repository.save(
      project.id,
      'brief',
      { text: '解释审核门禁', duration: 60 },
      project.revision,
      randomUUID(),
    )
    state = repository.approve(
      project.id,
      'brief',
      state.stages.brief!.id,
      state.revision,
      randomUUID(),
    )
    state = repository.save(
      project.id,
      'copy',
      { text: '事实先核实，画面再审核，最终人工确认口播。' },
      state.revision,
      randomUUID(),
    )
    state = repository.approve(
      project.id,
      'copy',
      state.stages.copy!.id,
      state.revision,
      randomUUID(),
    )
    state = repository.save(
      project.id,
      'storyboard',
      {
        mode: 'template',
        template: 'technical',
        scenes: [
          { id: 'opening', title: '为何审核', body: '事实准确', layout: 'title' },
          { id: 'closing', title: '如何确认', body: '逐步确认', layout: 'steps' },
        ],
      },
      state.revision,
      randomUUID(),
    )
    await assert.rejects(
      service.generate({
        projectId: project.id,
        stage: 'narration',
        executor: 'codex',
        expectedRevision: state.revision,
        requestId: randomUUID(),
      }),
      /审核/,
    )
    state = repository.approve(
      project.id,
      'storyboard',
      state.stages.storyboard!.id,
      state.revision,
      randomUUID(),
    )
    const prompt = agentPrompt(state, 'narration', {}, '')
    assert.ok(prompt.includes(stageValue(state, 'copy')!.text))
    assert.ok(prompt.includes('事实准确') && prompt.includes('逐步确认'))
    assert.ok(prompt.includes('不得新增、遗漏、合并或调整分镜顺序'))
    assert.ok(
      !prompt.includes('HTML 为无脚本'),
      'Narration instructions must focus on speech rather than HTML authoring',
    )
    const script = join(root, 'fake-codex')
    const capture = join(root, 'prompt.txt')
    const result = {
      scenes: [
        {
          id: 'opening',
          text: '先核实内容中的事实，让每个观点都有依据。',
          pronunciation: '观点后略停顿',
        },
        { id: 'closing', text: '再逐镜检查画面，最后由你确认口播。' },
      ],
    }
    writeFileSync(
      script,
      `#!/usr/bin/env node\nconst fs=require('node:fs');let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(capture)},input);fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify(result))});});\n`,
    )
    chmodSync(script, 0o755)
    service.runtime.set({ codexPath: script })
    const job = await service.generate({
      projectId: project.id,
      stage: 'narration',
      executor: 'codex',
      expectedRevision: state.revision,
      requestId: randomUUID(),
    })
    for (let attempt = 0; attempt < 100 && repository.job(job.id)?.state === 'running'; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(repository.job(job.id)?.state, 'succeeded', repository.job(job.id)?.error ?? '')
    assert.equal(readFileSync(capture, 'utf8'), prompt)
    const generated = repository.get(project.id)
    assert.equal(generated.stages.narration?.status, 'review')
    assert.deepEqual(generated.stages.narration?.payload, result)
    assert.equal(generated.stages.audio, undefined)
  } finally {
    await service.dispose()
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('generation and saves require the preceding exact revision to be approved', () => {
  const { db, repository, project } = fixture()
  assert.throws(
    () => repository.save(project.id, 'copy', { text: '内容' }, project.revision, randomUUID()),
    /审核/,
  )
  const draft = repository.save(
    project.id,
    'brief',
    { text: '介绍产品的核心功能', duration: 120 },
    project.revision,
    'brief-save',
  )
  assert.equal(draft.stages.brief?.status, 'review')
  assert.throws(
    () => repository.startJob(project.id, 'copy', draft.revision, 'generate', 'codex'),
    /审核/,
  )
  const approved = repository.approve(
    project.id,
    'brief',
    draft.stages.brief!.id,
    draft.revision,
    'brief-approve',
  )
  assert.equal(approved.stages.brief?.status, 'approved')
  const job = repository.startJob(project.id, 'copy', approved.revision, 'generate', 'codex')
  const completed = repository.finishJob(job.id, { text: '新的文案' })
  assert.equal(completed.stages.copy?.status, 'review')
  assert.equal(completed.stages.storyboard, undefined)
  db.close()
})

test('upstream changes invalidate approvals and reject late generation results', () => {
  const { db, repository, project } = fixture()
  let state = repository.save(
    project.id,
    'brief',
    { text: '主题', duration: 60 },
    project.revision,
    'save',
  )
  state = repository.approve(project.id, 'brief', state.stages.brief!.id, state.revision, 'approve')
  state = repository.save(project.id, 'copy', { text: '旧文案' }, state.revision, 'copy')
  state = repository.approve(
    project.id,
    'copy',
    state.stages.copy!.id,
    state.revision,
    'copy-approve',
  )
  const job = repository.startJob(project.id, 'storyboard', state.revision, 'job', 'codex')
  state = repository.save(
    project.id,
    'brief',
    { text: '改了主题', duration: 60 },
    state.revision,
    'edit',
  )
  assert.equal(state.stages.copy!.status, 'stale')
  assert.throws(
    () =>
      repository.finishJob(job.id, {
        mode: 'template',
        template: 'technical',
        scenes: [{ id: 'scene-1', title: '首页', body: '说明', layout: 'title' }],
      }),
    /过期/,
  )
  assert.throws(
    () =>
      repository.approve(
        project.id,
        'copy',
        state.stages.copy!.id,
        state.revision,
        'stale-approve',
      ),
    /审核|过期/,
  )
  assert.equal(
    repository.get(project.id).history.filter((item) => item.stage === 'brief').length,
    2,
  )
  db.close()
})

test('CAS prevents lost writes and identical request IDs are idempotent', () => {
  const { db, repository, project } = fixture()
  const payload = { text: '主题', duration: 100 }
  const saved = repository.save(project.id, 'brief', payload, project.revision, 'same')
  assert.equal(
    repository.save(project.id, 'brief', payload, project.revision, 'same').revision,
    saved.revision,
  )
  assert.throws(
    () =>
      repository.save(
        project.id,
        'brief',
        { ...payload, text: '另一份' },
        project.revision,
        'other',
      ),
    /刷新/,
  )
  assert.throws(
    () =>
      repository.save(project.id, 'brief', { ...payload, text: '另一份' }, saved.revision, 'same'),
    /请求/,
  )
  assert.throws(
    () => repository.approve(project.id, 'brief', 'wrong', saved.revision, 'wrong-approve'),
    /版本/,
  )
  db.close()
})

test('job cancellation and restart recovery never register a successful revision', () => {
  const { db, repository, project } = fixture()
  let state = repository.save(
    project.id,
    'brief',
    { text: '主题', duration: 100 },
    project.revision,
    'save',
  )
  state = repository.approve(project.id, 'brief', state.stages.brief!.id, state.revision, 'approve')
  const job = repository.startJob(project.id, 'copy', state.revision, 'job', 'codex')
  repository.updateJob(job.id, { state: 'cancelled', phase: '已取消' })
  assert.throws(() => repository.finishJob(job.id, { text: '迟到结果' }), /取消|结束/)
  assert.equal(repository.get(project.id).stages.copy, undefined)
  repository.startJob(project.id, 'copy', state.revision, 'job2', 'codex')
  repository.recover()
  assert.equal(repository.get(project.id).jobs[0].state, 'interrupted')
  db.close()
})

test('payload validation rejects duplicate scene IDs, unsafe references and missing narration alignment', () => {
  assert.deepEqual(
    validatePayload('brief', {
      text: '主题',
      duration: 120,
      audience: ' 开发者 ',
      references: ' 官方文档 ',
    }),
    { text: '主题', duration: 120, audience: '开发者', references: '官方文档' },
  )
  assert.throws(
    () => validatePayload('brief', { text: '主题', duration: 120, audience: [] }),
    /目标受众/,
  )
  assert.deepEqual(
    validatePayload('narration', {
      scenes: [{ id: 'scene-1', text: '正文', pronunciation: ' API 逐字母读 ' }],
    }),
    { scenes: [{ id: 'scene-1', text: '正文', pronunciation: 'API 逐字母读' }] },
  )
  assert.throws(() => validatePayload('brief', { text: '主题', duration: 301 }), /300/)
  assert.throws(
    () =>
      validatePayload('storyboard', {
        mode: 'agent',
        template: 'technical',
        references: ['file:///etc/passwd'],
        scenes: [{ id: 'x', title: '标题', body: '正文', layout: 'title' }],
      }),
    /链接/,
  )
  assert.throws(
    () =>
      validatePayload('storyboard', {
        mode: 'template',
        template: 'technical',
        scenes: [
          { id: 'x', title: '标题', body: '正文', layout: 'title' },
          { id: 'x', title: '重复', body: '正文', layout: 'split' },
        ],
      }),
    /重复/,
  )
  const chunks = splitNarration('这是第一句。'.repeat(120))
  assert.ok(chunks.every((chunk) => Array.from(chunk).length <= 300 && chunk.trim()))
  assert.equal(chunks.join(''), '这是第一句。'.repeat(120))
})

test('narration must preserve approved scene order and identity', () => {
  const { db, repository, project } = fixture()
  let state = repository.save(
    project.id,
    'brief',
    { text: '主题', duration: 100 },
    project.revision,
    randomUUID(),
  )
  state = repository.approve(
    project.id,
    'brief',
    state.stages.brief!.id,
    state.revision,
    randomUUID(),
  )
  state = repository.save(project.id, 'copy', { text: '主题内容' }, state.revision, randomUUID())
  state = repository.approve(
    project.id,
    'copy',
    state.stages.copy!.id,
    state.revision,
    randomUUID(),
  )
  state = repository.save(
    project.id,
    'storyboard',
    {
      mode: 'template',
      template: 'technical',
      scenes: [
        { id: 'first', title: '开场', body: '介绍', layout: 'title' },
        { id: 'second', title: '原理', body: '解释', layout: 'split' },
      ],
    },
    state.revision,
    randomUUID(),
  )
  state = repository.approve(
    project.id,
    'storyboard',
    state.stages.storyboard!.id,
    state.revision,
    randomUUID(),
  )
  assert.throws(
    () =>
      repository.save(
        project.id,
        'narration',
        {
          scenes: [
            { id: 'second', text: '内容' },
            { id: 'first', text: '内容' },
          ],
        },
        state.revision,
        randomUUID(),
      ),
    /顺序/,
  )
  assert.throws(
    () =>
      repository.save(
        project.id,
        'narration',
        { scenes: [{ id: 'first', text: '内容' }] },
        state.revision,
        randomUUID(),
      ),
    /顺序/,
  )
  db.close()
})

test('managed files are copied, project scoped and protected against content tampering', async () => {
  const { db, repository, project } = fixture()
  const root = mkdtempSync(join(tmpdir(), 'video-files-'))
  try {
    const files = new WorkflowFiles(root, repository),
      source = join(root, 'input.html')
    writeFileSync(source, '<h1>Original</h1>')
    const file = await files.import(project.id, source)
    writeFileSync(source, '<h1>Changed source</h1>')
    assert.equal(files.text(file), '<h1>Original</h1>')
    await files.verify(project.id, file)
    const other = repository.create('另一个项目')
    await assert.rejects(files.verify(other.id, file), /不属于/)
    writeFileSync(files.path(file), '<h1>Tampered</h1>')
    await assert.rejects(files.verify(project.id, file), /修改/)
  } finally {
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('reference fetch address validation excludes local, private, metadata and reserved addresses', () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.1.1',
    '192.168.0.1',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    '198.18.0.1',
  ])
    assert.equal(publicIPv4(address), false, address)
  assert.equal(publicIPv4('8.8.8.8'), true)
})

test('agent JSON parsing supports Codex plain output and Claude envelopes, rejecting prose', () => {
  assert.deepEqual(parseAgentJson('{"text":"hello"}'), { text: 'hello' })
  assert.deepEqual(parseAgentJson('{"result":"```json\\n{\\"text\\":\\"hello\\"}\\n```"}'), {
    text: 'hello',
  })
  assert.throws(() => parseAgentJson('Here is your script: hello'), /JSON/)
})

test('HTML preview removes active elements and applies a no-network no-script policy', () => {
  const html = safeStoryboardDocument(
    '<script>alert(1)</script><iframe src="https://evil.test"></iframe><h1 onclick="x()">标题</h1>',
  )
  assert.ok(html.includes("script-src 'none'"))
  assert.ok(html.includes("connect-src 'none'"))
  assert.ok(!html.includes('<script>') && !html.includes('<iframe') && !html.includes('onclick'))
  assert.notEqual(
    sceneHtml({ id: 'a', title: '标题', body: '内容', layout: 'title' }, 'technical'),
    sceneHtml({ id: 'b', title: '标题', body: '内容', layout: 'comparison' }, 'technical'),
  )
})

test('HyperFrames must actually execute browser checks with nonzero samples', () => {
  assert.throws(
    () => assertHyperframesCheck({ ok: true, browserSkipped: true, layout: { samples: [] } }),
    /样本/,
  )
  assert.throws(
    () => assertHyperframesCheck({ ok: true, browserSkipped: false, layout: { samples: [] } }),
    /样本/,
  )
  assert.doesNotThrow(() =>
    assertHyperframesCheck({ ok: true, browserSkipped: false, layout: { samples: [0, 1] } }),
  )
})

test('render preflight identifies missing HyperFrames and Node before a render job starts', () => {
  const runtime = new WorkflowRuntimeManager(tmpdir()).get()
  assert.throws(
    () => assertRenderRuntime({ ...runtime, hyperframesPath: '' }),
    /HyperFrames.*执行环境/,
  )
  assert.throws(
    () =>
      assertRenderRuntime({ ...runtime, hyperframesPath: '/cli/hyperframes.mjs', nodePath: '' }),
    /Node.js.*执行环境/,
  )
  assert.throws(
    () => assertRenderRuntime({ ...runtime, hyperframesPath: '/cli/hyperframes', ffmpegPath: '' }),
    /FFmpeg.*执行环境/,
  )
  assert.doesNotThrow(() =>
    assertRenderRuntime({ ...runtime, hyperframesPath: '/cli/hyperframes.mjs' }),
  )
})

test('process signal termination reports the signal and executable instead of a null exit code', async () => {
  await assert.rejects(
    workflowCommand(process.execPath, ['-e', "process.kill(process.pid, 'SIGKILL')"], {
      cwd: tmpdir(),
    }),
    (error: Error) => {
      assert.match(error.message, /SIGKILL/)
      assert.ok(error.message.includes(process.execPath))
      assert.ok(!error.message.includes('退出码 null'))
      return true
    },
  )
})

test('process signal termination preserves stderr diagnostics', async () => {
  await assert.rejects(
    workflowCommand(
      process.execPath,
      ['-e', "process.stderr.write('agent diagnostic',()=>process.kill(process.pid,'SIGTERM'))"],
      { cwd: tmpdir() },
    ),
    (error: Error) => {
      assert.match(error.message, /SIGTERM/)
      assert.match(error.message, /agent diagnostic/)
      return true
    },
  )
})

test('process cancellation terminates the process and its child group', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workflow-process-'))
  const signal = new AbortController()
  try {
    const pidFile = join(root, 'pid.txt')
    const script = `const {spawn}=require('node:child_process');const fs=require('node:fs');process.on('SIGTERM',()=>{});const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pidFile)},String(child.pid));setInterval(()=>{},1000)`
    const pending = workflowCommand(process.execPath, ['-e', script], {
      cwd: root,
      signal: signal.signal,
    })
    const rejection = assert.rejects(pending, /取消/)
    const { setTimeout: delay } = await import('node:timers/promises')
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        readFileSync(pidFile)
        break
      } catch {
        await delay(20)
      }
    }
    const pid = Number(readFileSync(pidFile, 'utf8'))
    signal.abort()
    await rejection
    await delay(100)
    assert.throws(() => process.kill(pid, 0))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('CLI adapters pass prompts through stdin, preserve spaces in executable paths and parse output envelopes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-cli-'))
  try {
    const executable = join(root, 'fake agent')
    writeFileSync(
      executable,
      `#!/usr/bin/env node\nconst fs=require('node:fs');let prompt='';process.stdin.on('data',chunk=>prompt+=chunk);process.stdin.on('end',()=>{if(!prompt.includes('标题'))process.exit(2);const output=JSON.stringify({text:'通过'});const index=process.argv.indexOf('--output-last-message');if(index>=0){if(!process.argv.includes('read-only'))process.exit(3);fs.writeFileSync(process.argv[index+1],output)}else{if(process.argv[process.argv.indexOf('--tools')+1]!=='')process.exit(4);process.stdout.write(JSON.stringify({result:output}))}})`,
    )
    chmodSync(executable, 0o700)
    const config = {
      ...new WorkflowRuntimeManager(root).get(),
      codexPath: executable,
      claudePath: executable,
    }
    for (const executor of ['codex', 'claude'] as const)
      assert.deepEqual(
        await runAgent(
          executor,
          config,
          root,
          '标题包含 $() 与 ` 字符，不应执行',
          new AbortController().signal,
        ),
        { text: '通过' },
      )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('media protocol handles byte ranges, suffixes, HEAD and unsatisfiable requests without buffering the whole video', async () => {
  assert.deepEqual(mediaRange('bytes=20-', 100), { status: 206, start: 20, end: 99 })
  assert.deepEqual(mediaRange('bytes=-10', 100), { status: 206, start: 90, end: 99 })
  assert.deepEqual(mediaRange('bytes=20-999', 100), { status: 206, start: 20, end: 99 })
  for (const range of ['bytes=100-', 'bytes=10-2', 'bytes=-0', 'bytes=1-2,4-5', 'bytes=-'])
    assert.equal(mediaRange(range, 100).status, 416)
  const { db, repository, project } = fixture(),
    root = mkdtempSync(join(tmpdir(), 'video-range-'))
  try {
    const files = new WorkflowFiles(root, repository),
      file = await files.write(project.id, Buffer.alloc(1000, 42), '.mp4')
    const response = workflowMediaResponse(
      files,
      file,
      new Request('http://test', { headers: { range: 'bytes=50-99' } }),
    )
    assert.equal(response.status, 206)
    assert.equal(response.headers.get('Content-Range'), 'bytes 50-99/1000')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.alloc(50, 42))
    const head = workflowMediaResponse(files, file, new Request('http://test', { method: 'HEAD' }))
    assert.equal(head.headers.get('Content-Length'), '1000')
    assert.equal((await head.arrayBuffer()).byteLength, 0)
  } finally {
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('editable reference and tag separators preserve input, then normalize at the save boundary', () => {
  const storyboard = validatePayload('storyboard', {
    mode: 'agent',
    template: 'technical',
    references: [' https://example.com ', ''],
    scenes: [{ id: 'first', title: '标题', body: '正文', layout: 'title' }],
  })
  assert.deepEqual(storyboard.references, ['https://example.com'])
  const metadata = { title: '标题', description: '', tags: ['技术', ' 工作流', ''] }
  assert.deepEqual(
    validatePayload('publish', { platforms: { bilibili: metadata, douyin: metadata } }).platforms
      .bilibili.tags,
    ['技术', '工作流'],
  )
})

test('template planning splits long paragraphs into distinct layouts without dropping text', () => {
  const { db, repository, project } = fixture()
  project.stages.copy = {
    id: 'copy',
    stage: 'copy',
    version: 1,
    status: 'approved',
    payload: { text: '# 核心观点\n' + '完整的内容。'.repeat(100) },
    dependencies: '',
    createdAt: '',
    approvedAt: '',
    note: '',
  }
  const result = templateStoryboard(project, { template: 'technical' })
  assert.ok(result.scenes.length > 2)
  assert.equal(result.scenes.map((scene) => scene.body).join(''), '完整的内容。'.repeat(100))
  assert.ok(new Set(result.scenes.map((scene) => scene.layout)).size > 1)
  assert.equal(repository.get(project.id).stages.copy, undefined)
  db.close()
})
