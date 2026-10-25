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
  stageUnlocked,
  type AudioProgress,
  validateMotionPlan,
  storyboardMotionReadiness,
  storyboardReviewBlockReason,
  retainMaterialFallback,
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
  reusableFrameFiles,
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
import { resolveVoiceRequest } from '../src/shared/voiceover'
import { createWorkflowAudio, workflowVoiceSeed } from '../src/main/services/video-workflow/audio'
import {
  defaultMotion,
  extractMotionRequirements,
  hasExplicitMotionRequirements,
  mergeMotion,
  motionPrompt,
  shouldGenerateInitialMotion,
  storyboardMotionPlan,
} from '../src/main/services/video-workflow/motion'
import {
  renderSceneTimeline,
  renderSceneAtTime,
} from '../src/renderer/modules/video/workflow/render-timeline'
import { compareFinalRender } from '../src/shared/video-render-comparison'

test('final render comparison binds to its frozen source instead of the newest roughcut', () => {
  const { db, state, render } = visualFixture()
  try {
    const roughcut = {
      ...state.stages.audio!,
      id: 'rough-source',
      stage: 'roughcut' as const,
      version: 2,
      createdAt: '2026-10-24T10:00:00.000Z',
      payload: {
        ...render,
        manifestHash: 'b'.repeat(64),
        renderProfile: { quality: 'looks' as const, fps: 30 },
        sourceAudio: 'original-audio',
      },
    }
    const final = {
      ...roughcut,
      id: 'final',
      stage: 'render' as const,
      version: 1,
      createdAt: '2026-10-24T11:00:00.000Z',
      payload: {
        ...roughcut.payload,
        file: { ...render.file, size: 2048, sha256: 'e'.repeat(64) },
        renderProfile: { quality: 'delivery' as const, fps: 30 },
        sourceRoughcut: roughcut.id,
      },
    }
    const newer = {
      ...roughcut,
      id: 'new-roughcut',
      version: 3,
      createdAt: '2026-10-24T12:00:00.000Z',
      payload: { ...roughcut.payload, manifestHash: 'c'.repeat(64) },
    }
    const project = {
      ...state,
      history: [newer, final, roughcut, ...state.history],
      stages: { ...state.stages, roughcut: newer, render: final },
    }
    const comparison = compareFinalRender(project, final)
    assert.equal(comparison.source?.id, roughcut.id)
    assert.equal(comparison.sourceMatch, 'recorded')
    assert.equal(comparison.sameComposition, true)
    assert.equal(comparison.qualityChange, 'delivery')
    assert.equal(comparison.sameFile, false)
    assert.equal(comparison.durationDelta, 0)
    assert.equal(comparison.sizeDelta, 2047)
    const validated = validatePayload('render', final.payload)
    assert.deepEqual(validated.renderProfile, final.payload.renderProfile)
    assert.equal(validated.sourceRoughcut, roughcut.id)
    assert.throws(
      () =>
        validatePayload('render', {
          ...final.payload,
          renderProfile: { quality: 'invented', fps: 30 },
        }),
      /渲染参数/,
    )
    const legacy = {
      ...final,
      payload: { ...final.payload, renderProfile: undefined, sourceRoughcut: undefined },
    }
    assert.equal(compareFinalRender(project, legacy).sourceMatch, 'matched')
    assert.equal(compareFinalRender(project, legacy).qualityChange, 'unknown')
    const missing = { ...legacy, payload: { ...legacy.payload, manifestHash: 'd'.repeat(64) } }
    assert.equal(compareFinalRender(project, missing).source, undefined)
    assert.equal(compareFinalRender(project, missing).sameComposition, undefined)
    const badSource = { ...final, payload: { ...final.payload, sourceRoughcut: 'missing' } }
    assert.equal(compareFinalRender(project, badSource).source, undefined)
    const sameFile = { ...final, payload: { ...final.payload, file: roughcut.payload.file } }
    assert.equal(compareFinalRender(project, sameFile).sameFile, true)
    assert.equal(compareFinalRender(project, sameFile).qualityChange, 'same-file')
    const sameQuality = {
      ...final,
      payload: { ...final.payload, renderProfile: { quality: 'looks' as const, fps: 30 as const } },
    }
    assert.equal(compareFinalRender(project, sameQuality).qualityChange, 'unchanged')
    const changed = {
      ...final,
      payload: { ...final.payload, manifestHash: 'f'.repeat(64), duration: 4.1 },
    }
    assert.equal(compareFinalRender(project, changed).sameComposition, false)
    assert.ok(Math.abs(compareFinalRender(project, changed).durationDelta! - 0.1) < 0.0001)
    const anotherAudio = { ...legacy, payload: { ...legacy.payload, sourceAudio: 'another-audio' } }
    assert.equal(compareFinalRender(project, anotherAudio).source, undefined)
  } finally {
    db.close()
  }
})

test('scene selection seeks to the first rendered frame and survives browser time precision', () => {
  const durations = [
    11.3795, 14.176458, 16.48, 16.97425, 16.269333, 15.36, 15.390667, 18.24, 19.76, 14.96, 13.76,
    16.96, 17.294, 15.84, 16.4, 12.8,
  ]
  const scenes = durations.map((_, index) => ({ id: `scene-${index + 1}` }))
  const tracks = durations.flatMap((duration, index) => [
    { sceneId: scenes[index].id, duration: duration / 3 },
    { sceneId: scenes[index].id, duration: (duration * 2) / 3 },
  ])
  const timeline = renderSceneTimeline(scenes, tracks)
  for (const [index, item] of timeline.entries()) {
    const browserTime = Math.floor(item.seek * 1e6) / 1e6
    assert.equal(renderSceneAtTime(timeline, browserTime), index)
    assert.ok(item.seek >= item.start - 1e-6)
    assert.ok(item.seek - item.start < 1 / 30)
    assert.equal(renderSceneAtTime(timeline, item.start - 0.01), Math.max(0, index - 1))
  }
  assert.equal(renderSceneAtTime(timeline, 252.067), 15)
  assert.equal(renderSceneAtTime(timeline, 0), 0)
})

test('local animation edits do not reimpose unrelated historical MG requirements', () => {
  const { db, state } = visualFixture()
  try {
    stageValue(state, 'brief')!.text = '每页都要有 MG 动画，第二镜必须添加真实录屏。'
    stageValue(state, 'storyboard')!.scenes[1].html =
      '<!-- MG：缺失的新旧标题交替 --><h1>第二镜</h1>'
    const prompt = motionPrompt(state, '只让第一镜标题慢一点入场', 0, 'one')
    assert.doesNotMatch(prompt, /以下要求是必须执行的数据/)
    assert.doesNotMatch(prompt, /缺失的新旧标题交替/)
    assert.match(prompt, /历史创作要求仅作背景/)
    assert.match(prompt, /不得因未涉及的历史要求返回 requiresUpstream/)
    assert.match(prompt, /若本次修改需要新增或替换文字、HTML 元素、图形或素材/)
  } finally {
    db.close()
  }
})

test('animation edits and persisted plans use the preview video sources after upstream changes', () => {
  const { db, repository, state: original, render } = visualFixture()
  try {
    let state = repository.save(
      original.id,
      'roughcut',
      {
        ...render,
        sourceStoryboard: original.stages.storyboard!.id,
        sourceAudio: original.stages.audio!.id,
        sourceNarration: original.stages.narration!.id,
      },
      original.revision,
      randomUUID(),
    )
    for (const stage of ['storyboard', 'narration', 'audio'] as const) {
      const payload = structuredClone(stageValue(original, stage)!)
      if ('scenes' in payload) {
        payload.scenes.forEach((scene, index) => {
          scene.id = `replacement-${index}`
        })
      } else {
        payload.tracks.forEach((track, index) => {
          track.sceneId = `replacement-${index}`
        })
      }
      state = repository.save(state.id, stage, payload, state.revision, randomUUID())
      state = repository.approve(
        state.id,
        stage,
        state.stages[stage]!.id,
        state.revision,
        randomUUID(),
      )
    }
    const prompt = motionPrompt(state, '标题入场慢一点', 0, 'one')
    assert.match(prompt, /"id":"one","duration":2/)
    assert.doesNotMatch(prompt, /replacement-/)
    const job = repository.startJob(state.id, 'roughcut', state.revision, randomUUID(), 'codex')
    repository.markMotionJob(job.id)
    repository.finishMotionPlan(job.id, {
      ...defaultMotion(original),
      sceneId: 'one',
      scenes: [defaultMotion(original).scenes[0]],
    })
    assert.equal(repository.motionPlan(state.id, job.id, state.revision).scenes[0].sceneId, 'one')
    assert.equal(repository.get(state.id).stages.audio!.id, state.stages.audio!.id)
  } finally {
    db.close()
  }
})

function fixture() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  const repository = new VideoWorkflowRepository(db)
  const project = repository.create('演示项目')
  return { db, repository, project }
}

test('directional scaling from storyboard MG plans validates and compiles to real WAAPI scale', () => {
  const plan = validateMotionPlan(
    {
      at: 0,
      feedback: '验证方向缩放',
      summary: '连接线沿横轴展开，柱状图沿纵轴增长',
      scenes: [
        {
          sceneId: 'one',
          effects: [
            {
              selector: '#line',
              start: 0,
              duration: 0.5,
              keyframes: [
                { scaleX: 0, scaleY: 1 },
                { scaleX: 1, scaleY: 1 },
              ],
            },
          ],
        },
      ],
    },
    [{ id: 'one', duration: 2 }],
  )
  assert.deepEqual(plan.scenes[0].effects[0].keyframes, [
    { scaleX: 0, scaleY: 1 },
    { scaleX: 1, scaleY: 1 },
  ])
  const { db, state } = visualFixture()
  const document = hyperframesDocument(state, ['<div id="line">line</div>'], {
    ...plan,
    scenes: [{ ...plan.scenes[0], sceneId: stageValue(state, 'storyboard')!.scenes[0].id }],
  })
  assert.match(document, /"scale":"0 1"/)
  assert.match(document, /"scale":"1 1"/)
  assert.doesNotMatch(document, /"scaleX":/)
  for (const keyframes of [
    [{ scaleX: -1 }, { scaleX: 1 }],
    [{ scaleY: 0 }, { scaleY: Infinity }],
    [
      { scale: 0, scaleX: 0 },
      { scale: 1, scaleX: 1 },
    ],
  ])
    assert.throws(() =>
      validateMotionPlan(
        {
          at: 0,
          feedback: '验证方向缩放',
          summary: 'invalid',
          scenes: [
            {
              sceneId: 'one',
              effects: [{ selector: '#line', start: 0, duration: 0.5, keyframes }],
            },
          ],
        },
        [{ id: 'one', duration: 2 }],
      ),
    )
  db.close()
})

test('storyboard motion declarations survive persistence and bind to measured narration durations', () => {
  const { db, state } = visualFixture()
  try {
    const original = stageValue(state, 'storyboard')!
    const storyboard = validatePayload('storyboard', {
      ...original,
      scenes: original.scenes.map((scene) => ({
        ...scene,
        motion: {
          summary: '横向连接线展开',
          blockers: [],
          effects: [
            {
              selector: 'h1',
              start: 0.1,
              duration: 0.4,
              keyframes: [{ scaleX: 0 }, { scaleX: 1 }],
            },
          ],
        },
      })),
    })
    assert.equal(storyboard.scenes[0].motion?.summary, '横向连接线展开')
    assert.deepEqual(storyboardMotionReadiness(storyboard), {
      total: original.scenes.length,
      planned: original.scenes.length,
      unplanned: [],
      blockers: [],
    })
    const project = {
      ...state,
      stages: { ...state.stages, storyboard: { ...state.stages.storyboard!, payload: storyboard } },
    }
    const plan = storyboardMotionPlan(project)!
    const duration = stageValue(state, 'audio')!
      .tracks.filter((track) => track.sceneId === original.scenes[0].id)
      .reduce((sum, track) => sum + track.duration, 0)
    assert.equal(plan.scenes[0].effects[0].start, duration * 0.1)
    assert.equal(plan.scenes[0].effects[0].duration, duration * 0.4)
    const missing = {
      ...storyboard,
      scenes: storyboard.scenes.map((scene, index) =>
        index === 0
          ? { ...scene, motion: { ...scene.motion!, blockers: ['尚未取得真实投稿封面'] } }
          : scene,
      ),
    }
    assert.equal(storyboardMotionReadiness(missing).blockers[0].message, '尚未取得真实投稿封面')
    assert.throws(
      () =>
        storyboardMotionPlan({
          ...project,
          stages: {
            ...project.stages,
            storyboard: { ...project.stages.storyboard, payload: missing },
          },
        }),
      /真实投稿封面/,
    )
    assert.equal(
      storyboardMotionPlan(state),
      undefined,
      'legacy comment-only storyboards must not be reported as prepared',
    )
  } finally {
    db.close()
  }
})

test('storyboard prompt and motion planner share directional capabilities and require materialized targets', () => {
  const { db, state } = visualFixture()
  try {
    const prompt = agentPrompt(
      state,
      'storyboard',
      { motionPolicy: { enabled: true, excludedSceneIds: ['scene-2'] } },
      '',
    )
    assert.match(prompt, /scaleX/)
    assert.match(prompt, /0–1.*归一化/)
    assert.match(prompt, /blockers/)
    assert.match(prompt, /内置 MG 规则.*所有未排除/)
    assert.match(prompt, /scene-2/)
    assert.match(motionPrompt(state, '', 0), /scaleX/)
  } finally {
    db.close()
  }
})

test('storyboard MG policy persists and exclusions prevent fallback effects', () => {
  const { db, state } = visualFixture()
  try {
    const original = stageValue(state, 'storyboard')!
    const ids = original.scenes.map((scene) => scene.id)
    const motion = {
      summary: '对象展开',
      blockers: [],
      effects: [
        { selector: 'h1', start: 0, duration: 0.3, keyframes: [{ scaleX: 0 }, { scaleX: 1 }] },
      ],
    }
    const storyboard = validatePayload('storyboard', {
      ...original,
      motionPolicy: { enabled: true, excludedSceneIds: [ids[1]] },
      scenes: original.scenes.map((scene, index) => ({
        ...scene,
        motion: index ? { ...motion, blockers: ['未取得封面'] } : motion,
      })),
    })
    assert.deepEqual(storyboard.motionPolicy, { enabled: true, excludedSceneIds: [ids[1]] })
    assert.equal(storyboardMotionReadiness(storyboard).planned, 1)
    assert.deepEqual(storyboardMotionReadiness(storyboard).blockers, [])
    const project = {
      ...state,
      stages: { ...state.stages, storyboard: { ...state.stages.storyboard!, payload: storyboard } },
    }
    const plan = storyboardMotionPlan(project)!
    assert.deepEqual(
      plan.scenes.map((scene) => scene.sceneId),
      [ids[0]],
    )
    assert.deepEqual(
      mergeMotion(project, plan).scenes.find((scene) => scene.sceneId === ids[1])?.effects,
      [],
    )
    assert.throws(
      () => mergeMotion(project, { ...plan, scenes: [{ ...plan.scenes[0], sceneId: ids[1] }] }),
      /已排除/,
    )
    for (const policy of [
      { enabled: false, excludedSceneIds: [] },
      { enabled: true, excludedSceneIds: ids },
    ]) {
      const disabled = {
        ...project,
        stages: {
          ...project.stages,
          storyboard: {
            ...project.stages.storyboard,
            payload: { ...storyboard, motionPolicy: policy },
          },
        },
      }
      assert.deepEqual(storyboardMotionPlan(disabled)!.scenes, [])
      assert.ok(defaultMotion(disabled).scenes.every((scene) => !scene.effects.length))
      assert.ok(
        mergeMotion(disabled, storyboardMotionPlan(disabled)!).scenes.every(
          (scene) => !scene.effects.length,
        ),
      )
      assert.throws(() => mergeMotion(disabled, plan), /关闭|已排除/)
    }
    assert.throws(
      () =>
        validatePayload('storyboard', {
          ...original,
          motionPolicy: { enabled: 'yes', excludedSceneIds: [] },
        }),
      /MG/,
    )
    assert.throws(
      () =>
        validatePayload('storyboard', {
          ...original,
          motionPolicy: { enabled: true, excludedSceneIds: [7] },
        }),
      /MG/,
    )
    const missing = {
      ...project,
      stages: {
        ...project.stages,
        storyboard: {
          ...project.stages.storyboard,
          payload: { ...storyboard, scenes: original.scenes },
        },
      },
    }
    assert.throws(() => storyboardMotionPlan(missing), /分镜.*未.*计划/)
    const offPrompt = agentPrompt(
      state,
      'storyboard',
      { motionPolicy: { enabled: false, excludedSceneIds: [] } },
      '',
    )
    assert.match(offPrompt, /MG 已关闭/)
  } finally {
    db.close()
  }
})

test('storyboard approval catches missing MG before roughcut and keeps existing speech versions', async () => {
  const { db, repository, state: initial } = visualFixture()
  const root = mkdtempSync(join(tmpdir(), 'workflow-mg-approval-'))
  const service = new VideoWorkflowService(root, db, () => {
    throw new Error('Must not synthesize')
  })
  try {
    const storyboard = stageValue(initial, 'storyboard')!
    let state = repository.save(
      initial.id,
      'storyboard',
      { ...storyboard, motionPolicy: { enabled: true, excludedSceneIds: [] } },
      initial.revision,
      randomUUID(),
    )
    assert.deepEqual(stageValue(state, 'narration'), stageValue(initial, 'narration'))
    assert.deepEqual(stageValue(state, 'audio'), stageValue(initial, 'audio'))
    await assert.rejects(
      service.approve(
        state.id,
        'storyboard',
        state.stages.storyboard!.id,
        state.revision,
        randomUUID(),
        '',
      ),
      /未生成 MG 计划/,
    )
    assert.equal(repository.get(state.id).stages.storyboard!.status, 'review')
    state = repository.save(
      state.id,
      'storyboard',
      { ...storyboard, motionPolicy: { enabled: false, excludedSceneIds: ['one'] } },
      state.revision,
      randomUUID(),
    )
    const approved = await service.approve(
      state.id,
      'storyboard',
      state.stages.storyboard!.id,
      state.revision,
      randomUUID(),
      '',
    )
    assert.deepEqual(stageValue(approved, 'storyboard')!.motionPolicy, {
      enabled: false,
      excludedSceneIds: ['one'],
    })
    assert.equal(approved.stages.storyboard!.status, 'approved')
    assert.equal(approved.history.filter((revision) => revision.stage === 'storyboard').length, 3)
  } finally {
    await service.dispose()
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})

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
    {
      keyframes: [
        { opacity: 1, scale: 1 },
        { scale: 1, opacity: 1 },
      ],
    },
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

test('motion requirements are extracted from explicit brief text and storyboard MG comments', () => {
  const { db, state } = visualFixture()
  const project = {
    ...state,
    stages: {
      ...state.stages,
      brief: {
        ...state.stages.brief!,
        payload: {
          ...stageValue(state, 'brief')!,
          text: '每页都要有 MG 动画，标题和要点分步出现。',
        },
      },
      storyboard: {
        ...state.stages.storyboard!,
        payload: {
          ...stageValue(state, 'storyboard')!,
          scenes: stageValue(state, 'storyboard')!.scenes.map((scene, index) => ({
            ...scene,
            html: `<!-- MG规划：${index === 0 ? '署名先出现，再展开标题' : '要点逐项进入'} -->${sceneHtml(scene, 'technical')}`,
          })),
        },
      },
    },
  }
  const requirements = extractMotionRequirements(project)
  assert.equal(hasExplicitMotionRequirements(project), true)
  assert.match(requirements, /每页都要有 MG 动画/)
  assert.match(requirements, /MG规划：署名先出现，再展开标题/)
  assert.equal(hasExplicitMotionRequirements(state), false)
  db.close()
})

test('initial motion prompt carries explicit requirements and requires every scene', () => {
  const { db, state, render } = visualFixture()
  const project = {
    ...state,
    stages: {
      ...state.stages,
      brief: {
        ...state.stages.brief!,
        payload: { ...stageValue(state, 'brief')!, text: '每页都要有 MG 动画。' },
      },
      storyboard: {
        ...state.stages.storyboard!,
        payload: {
          ...stageValue(state, 'storyboard')!,
          scenes: stageValue(state, 'storyboard')!.scenes.map((scene) => ({
            ...scene,
            html: `<!-- MG规划：${scene.title} 逐项入场 -->${sceneHtml(scene, 'technical')}`,
          })),
        },
      },
    },
  }
  const prompt = motionPrompt(project, '', 0, undefined, { initial: true })
  assert.match(prompt, /每页都要有 MG 动画/)
  assert.match(prompt, /MG规划：第一镜 逐项入场/)
  assert.match(prompt, /每一个分镜都必须返回至少一项动效/)
  assert.match(prompt, /不得忽略简报、文案或 HTML 注释中的动效要求/)
  assert.equal(shouldGenerateInitialMotion(project), true)
  assert.equal(shouldGenerateInitialMotion(state), false)
  const current = {
    ...project,
    stages: {
      ...project.stages,
      roughcut: {
        ...state.stages.audio!,
        stage: 'roughcut' as const,
        payload: {
          ...render,
          sourceStoryboard: state.stages.storyboard!.id,
          motion: { ...defaultMotion(state), feedback: '用户确认的逐镜动效' },
        },
      },
    },
  }
  assert.equal(
    shouldGenerateInitialMotion(current),
    false,
    'audio-only regeneration must retain the confirmed motion',
  )
  assert.equal(
    shouldGenerateInitialMotion({
      ...current,
      stages: {
        ...current.stages,
        storyboard: { ...current.stages.storyboard!, id: 'new-storyboard' },
      },
    }),
    true,
  )
  assert.equal(
    shouldGenerateInitialMotion({
      ...current,
      stages: {
        ...current.stages,
        roughcut: {
          ...current.stages.roughcut!,
          payload: {
            ...render,
            sourceStoryboard: state.stages.storyboard!.id,
            motion: defaultMotion(state),
          },
        },
      },
    }),
    true,
    'existing default-only videos must receive requested MG',
  )
  db.close()
})

test('explicit MG requests invoke the motion Agent before roughcut rendering and never fall back on failure', async () => {
  const { db, repository, project } = fixture()
  const root = mkdtempSync(join(tmpdir(), 'workflow-mg-required-'))
  const service = new VideoWorkflowService(root, db, () => {
    throw new Error('No synthesis')
  })
  try {
    const audioFile = await service.files.write(project.id, 'fixture audio', '.wav')
    const subtitles = await service.files.write(project.id, 'fixture subtitles', '.srt')
    let state = project
    const payloads = {
      brief: { text: '每页都需要 MG 动画。', duration: 10 },
      copy: { text: '说明原理' },
      storyboard: {
        mode: 'agent',
        template: 'technical',
        scenes: [
          {
            id: 'one',
            title: '原理',
            body: '解释',
            layout: 'title',
            html: '<!-- MG规划：标题先入场，再展开原理 --><h1>原理</h1>',
          },
          { id: 'two', title: '总结', body: '结论', layout: 'summary' },
        ],
      },
      narration: {
        scenes: [
          { id: 'one', text: '说明原理。' },
          { id: 'two', text: '总结结论。' },
        ],
      },
      audio: {
        file: audioFile,
        subtitles,
        duration: 4,
        tracks: [
          { sceneId: 'one', file: audioFile, duration: 2, text: '说明原理。' },
          { sceneId: 'two', file: audioFile, duration: 2, text: '总结结论。' },
        ],
      },
    }
    for (const stage of ['brief', 'copy', 'storyboard', 'narration', 'audio'] as const) {
      state = repository.save(project.id, stage, payloads[stage], state.revision, randomUUID())
      state = repository.approve(
        project.id,
        stage,
        state.stages[stage]!.id,
        state.revision,
        randomUUID(),
      )
    }
    const capture = join(root, 'initial-motion.txt')
    const script = join(root, 'motion-codex')
    writeFileSync(
      script,
      `#!/usr/bin/env node\nconst fs=require('node:fs');let prompt='';process.stdin.on('data',chunk=>prompt+=chunk);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(capture)},prompt);fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],JSON.stringify({requiresUpstream:true,reason:'需要增加图形后再编排 MG'}));});\n`,
    )
    chmodSync(script, 0o755)
    service.runtime.set({ codexPath: script, claudePath: '' })
    const request = {
      projectId: project.id,
      stage: 'roughcut' as const,
      expectedRevision: state.revision,
      requestId: randomUUID(),
      executor: 'template' as const,
    }
    const job = await service.generate(request)
    for (let attempt = 0; attempt < 100 && repository.job(job.id)!.state === 'running'; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 20))
    assert.match(repository.job(job.id)!.error ?? '', /需要增加图形后再编排 MG/)
    assert.match(readFileSync(capture, 'utf8'), /每页都需要 MG 动画/)
    assert.match(readFileSync(capture, 'utf8'), /标题先入场，再展开原理/)
    assert.equal(repository.get(project.id).stages.roughcut, undefined)
    writeFileSync(
      script,
      `#!/usr/bin/env node\nconst fs=require('node:fs');process.stdin.resume();process.stdin.on('end',()=>fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify({ summary: '只返回首镜', scenes: [defaultMotion(state).scenes[0]] }))}));\n`,
    )
    const incomplete = await service.generate({ ...request, requestId: randomUUID() })
    for (
      let attempt = 0;
      attempt < 100 && repository.job(incomplete.id)!.state === 'running';
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 20))
    assert.match(repository.job(incomplete.id)!.error ?? '', /必须覆盖所有分镜/)
    assert.equal(repository.get(project.id).stages.roughcut, undefined)
    service.runtime.set({ codexPath: '', claudePath: '' })
    await assert.rejects(
      service.generate({ ...request, requestId: randomUUID() }),
      /MG.*Codex.*Claude/,
    )
  } finally {
    await service.dispose()
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('compiled compositions declare scene-local fonts without changing their typography', () => {
  const { db, state } = visualFixture()
  try {
    const markup = ['<div style="font-family: \'Songti SC\', serif">宋体标题</div>', '<p>正文</p>']
    const html = hyperframesDocument(state, markup, defaultMotion(state), [
      'Songti SC',
      'songti sc',
      'Georgia',
      'serif',
      'system-ui',
    ])
    assert.match(html, /@font-face\{font-family:"Songti SC";src:local\("Songti SC"\)\}/)
    assert.match(html, /@font-face\{font-family:"Georgia";src:local\("Georgia"\)\}/)
    assert.equal((html.match(/@font-face\{font-family:"Songti SC"/g) ?? []).length, 1)
    assert.doesNotMatch(html, /@font-face\{font-family:"(?:serif|system-ui)"/)
    assert.ok(html.includes(markup[0]))
    const escaped = hyperframesDocument(state, markup, defaultMotion(state), [
      '</style><script>alert(1)</script>',
    ])
    assert.equal((escaped.match(/<script>/g) ?? []).length, 1)
  } finally {
    db.close()
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

test('material fallback is explicit, scoped to unchanged content and never waives motion failures', () => {
  const { db, state } = visualFixture()
  try {
    const original = stageValue(state, 'storyboard')!
    const gap = '实物图片尚未取得；当前为已标注的原创示意图'
    const technical = '缺少独立动画元素，选择器无法匹配'
    const storyboard = validatePayload('storyboard', {
      ...original,
      scenes: original.scenes.map((scene) => ({
        ...scene,
        motion: { summary: '待补齐', effects: [], blockers: [gap, technical] },
      })),
    })
    assert.equal(storyboardReviewBlockReason(storyboard), '因 2 处素材缺口、2 处动效缺口无法审核')
    const accepted = validatePayload('storyboard', {
      ...storyboard,
      scenes: storyboard.scenes.map((scene) => ({
        ...scene,
        materialFallback: { acceptedAt: new Date().toISOString(), blockers: [gap] },
      })),
    })
    assert.equal(storyboardMotionReadiness(accepted).blockers.length, 2)
    assert.equal(storyboardReviewBlockReason(accepted), '因 2 处动效缺口无法审核')
    assert.deepEqual(accepted.scenes[0].motion?.blockers, [gap, technical])
    assert.deepEqual(retainMaterialFallback(accepted, accepted), accepted)
    const changed = {
      ...accepted,
      scenes: accepted.scenes.map((scene) => ({ ...scene, html: '<p>新画面</p>' })),
    }
    assert.equal(retainMaterialFallback(accepted, changed).scenes[0].materialFallback, undefined)
    assert.equal(retainMaterialFallback(storyboard, accepted).scenes[0].materialFallback, undefined)
    assert.throws(
      () =>
        validatePayload('storyboard', {
          ...accepted,
          scenes: [
            {
              ...accepted.scenes[0],
              materialFallback: { acceptedAt: new Date().toISOString(), blockers: [technical] },
            },
          ],
        }),
      /素材降级/,
    )
  } finally {
    db.close()
  }
})

test('reuses frozen storyboard frames when only the audio revision changes', () => {
  const { db, repository, state: initial, render } = visualFixture()
  try {
    const motion = defaultMotion(initial)
    let state = repository.save(
      initial.id,
      'roughcut',
      {
        ...render,
        compositionFiles: [render.compositionFiles[0], render.compositionFiles[0]],
        compositionNames: ['frame-0.png', 'frame-1.png'],
        motion,
        sourceStoryboard: initial.stages.storyboard!.id,
        sourceAudio: initial.stages.audio!.id,
        sourceNarration: initial.stages.narration!.id,
      },
      initial.revision,
      randomUUID(),
    )
    const frames = reusableFrameFiles(state, 2, motion)
    assert.deepEqual(frames, [render.compositionFiles[0], render.compositionFiles[0]])

    const audio = stageValue(state, 'audio')!
    state = repository.save(
      state.id,
      'audio',
      {
        ...audio,
        duration: audio.duration + 0.2,
        tracks: audio.tracks.map((track, index) =>
          index === 1 ? { ...track, duration: track.duration + 0.2 } : track,
        ),
      },
      state.revision,
      randomUUID(),
    )
    assert.equal(state.stages.roughcut!.status, 'stale')
    assert.deepEqual(reusableFrameFiles(state, 2, motion), frames)
    assert.equal(reusableFrameFiles(state, 2, undefined), undefined)
  } finally {
    db.close()
  }
})

test('rejects plain roughcut regeneration while a motion plan awaits confirmation', async () => {
  const { db, repository, state: initial } = visualFixture()
  const root = mkdtempSync(join(tmpdir(), 'workflow-motion-guard-'))
  const service = new VideoWorkflowService(root, db, () => {
    throw new Error('No voice synthesis during roughcut generation')
  })
  try {
    const planJob = repository.startJob(
      initial.id,
      'roughcut',
      initial.revision,
      randomUUID(),
      'codex',
    )
    repository.markMotionJob(planJob.id)
    repository.finishMotionPlan(planJob.id, defaultMotion(initial))
    const current = repository.get(initial.id)
    await assert.rejects(
      () =>
        service.generate({
          projectId: current.id,
          stage: 'roughcut',
          expectedRevision: current.revision,
          requestId: randomUUID(),
          executor: 'template',
        }),
      /存在待确认的动效计划，请点击确认计划，生成粗剪/,
    )
  } finally {
    await service.dispose()
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})

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

test('discarding expired and pending motion plans preserves media, approvals and project inputs', async () => {
  const { db, repository, state: initial } = visualFixture()
  const root = mkdtempSync(join(tmpdir(), 'workflow-discard-plan-'))
  const service = new VideoWorkflowService(root, db, () => {
    throw new Error('No synthesis')
  })
  try {
    const job = repository.startJob(
      initial.id,
      'roughcut',
      initial.revision,
      randomUUID(),
      'codex',
      'plan',
    )
    repository.markMotionJob(job.id)
    repository.finishMotionPlan(job.id, defaultMotion(initial))
    const before = repository.get(initial.id)
    const result = await service.discardMotionPlans(initial.id, before.revision)
    assert.equal(result.revision, before.revision)
    assert.deepEqual(result.stages, before.stages)
    assert.equal(repository.job(job.id)!.state, 'cancelled')
    assert.ok(repository.job(job.id)!.motionPlan, 'History must retain the abandoned proposal')
    assert.throws(() => repository.motionPlan(initial.id, job.id, before.revision), /过期/)
    await service.discardMotionPlans(initial.id, before.revision)
    await assert.rejects(service.discardMotionPlans(initial.id, before.revision - 1), /更新/)
    const running = repository.startJob(
      initial.id,
      'audio',
      before.revision,
      randomUUID(),
      'template',
      'running',
    )
    await assert.rejects(service.discardMotionPlans(initial.id, before.revision), /运行|执行|等待/)
    repository.updateJob(running.id, { state: 'cancelled', phase: 'fixture cleanup' })
  } finally {
    await service.dispose()
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('cancelling a motion plan restores the same frozen roughcut for review without regenerating media', () => {
  const { db, repository, state: initial, render } = visualFixture()
  try {
    let state = repository.save(
      initial.id,
      'roughcut',
      {
        ...render,
        sourceStoryboard: initial.stages.storyboard!.id,
        sourceAudio: initial.stages.audio!.id,
        sourceNarration: initial.stages.narration!.id,
        motion: defaultMotion(initial),
      },
      initial.revision,
      randomUUID(),
    )
    const previous = state.stages.roughcut!
    const proposal = repository.startJob(
      state.id,
      'roughcut',
      state.revision,
      randomUUID(),
      'codex',
    )
    repository.markMotionJob(proposal.id)
    repository.finishMotionPlan(proposal.id, defaultMotion(state))
    const audio = stageValue(state, 'audio')!
    state = repository.save(
      state.id,
      'audio',
      {
        ...audio,
        duration: 0.6,
        tracks: audio.tracks.map((track) => ({ ...track, duration: 0.3 })),
      },
      state.revision,
      randomUUID(),
    )
    state = repository.approve(
      state.id,
      'audio',
      state.stages.audio!.id,
      state.revision,
      randomUUID(),
    )
    assert.equal(state.stages.roughcut!.status, 'stale')
    const currentAudio = state.stages.audio!
    state = repository.discardMotionPlans(state.id, state.revision)
    assert.equal(state.stages.roughcut!.status, 'review')
    assert.equal(state.stages.roughcut!.id, previous.id)
    assert.equal(state.stages.roughcut!.version, previous.version)
    assert.deepEqual(state.stages.roughcut!.payload, previous.payload)
    assert.deepEqual(state.stages.audio, currentAudio)
    assert.equal(state.jobs.find((job) => job.id === proposal.id)!.state, 'cancelled')
    assert.equal(state.jobs[0].operation?.action, 'reuse-roughcut')
    assert.equal(stageUnlocked(state, 'render'), false)
    const recoveredRevision = state.revision
    assert.equal(
      repository.discardMotionPlans(state.id, state.revision).revision,
      recoveredRevision,
    )
    state = repository.approve(
      state.id,
      'roughcut',
      state.stages.roughcut!.id,
      state.revision,
      randomUUID(),
    )
    assert.equal(state.stages.roughcut!.status, 'approved')
    assert.equal(stageUnlocked(state, 'render'), true)
    state = repository.save(state.id, 'render', previous.payload, state.revision, randomUUID())
    assert.deepEqual(state.stages.render!.payload, previous.payload)
    assert.deepEqual(state.stages.audio, currentAudio)
    state = repository.save(state.id, 'audio', audio, state.revision, randomUUID())
    assert.equal(state.stages.roughcut!.status, 'stale')
    assert.throws(
      () => repository.approve(state.id, 'roughcut', previous.id, state.revision, randomUUID()),
      /前置|审核|过期/,
    )
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

test('AI storyboard modification updates only the requested scene and leaves a review revision', async () => {
  const { db, repository, state: initial } = visualFixture()
  const root = mkdtempSync(join(tmpdir(), 'workflow-storyboard-edit-'))
  const service = new VideoWorkflowService(root, db, () => {
    throw new Error('No voice synthesis during storyboard modification')
  })
  try {
    const output = {
      mode: 'agent',
      template: 'technical',
      scenes: [
        {
          id: 'one',
          title: '修改后的第一镜',
          body: '将问题拆成三步说明',
          layout: 'steps',
          html: '<h1>修改后的第一镜</h1>',
        },
      ],
    }
    const script = join(root, 'fake-codex')
    const capture = join(root, 'prompt.txt')
    writeFileSync(
      script,
      `#!/usr/bin/env node\nconst fs=require('node:fs');let prompt='';process.stdin.on('data',chunk=>prompt+=chunk);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(capture)},prompt);fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify(output))});});\n`,
    )
    chmodSync(script, 0o755)
    service.runtime.set({ codexPath: script })
    const job = await service.generate({
      projectId: initial.id,
      stage: 'storyboard',
      executor: 'codex',
      expectedRevision: initial.revision,
      requestId: randomUUID(),
      settings: { mode: 'agent', template: 'technical' },
      sceneId: 'one',
      storyboardModification: {
        sceneId: 'one',
        feedback: '把第一镜改成三步卡片，保留原有事实和口播。',
      },
    })
    for (let attempt = 0; attempt < 100 && repository.job(job.id)!.state === 'running'; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(repository.job(job.id)!.state, 'succeeded', repository.job(job.id)!.error ?? '')
    const result = repository.get(initial.id)
    const storyboard = stageValue(result, 'storyboard')!
    assert.equal(result.stages.storyboard!.status, 'review')
    assert.equal(storyboard.scenes.find((scene) => scene.id === 'one')!.title, '修改后的第一镜')
    assert.equal(storyboard.scenes.find((scene) => scene.id === 'two')!.title, '第二镜')
    assert.equal(storyboard.scenes[0].requirements, '把第一镜改成三步卡片，保留原有事实和口播。')
    assert.match(extractMotionRequirements(result), /把第一镜改成三步卡片/)
    assert.ok(readFileSync(capture, 'utf8').includes('把第一镜改成三步卡片'))
    const revisedScene = storyboard.scenes[0]
    writeFileSync(
      script,
      `#!/usr/bin/env node\nconst fs=require('node:fs');process.stdin.resume();process.stdin.on('end',()=>fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify({ ...storyboard, scenes: [revisedScene] }))}));\n`,
    )
    const noChange = await service.generate({
      projectId: initial.id,
      stage: 'storyboard',
      executor: 'codex',
      expectedRevision: result.revision,
      requestId: randomUUID(),
      sceneId: 'one',
      storyboardModification: { sceneId: 'one', feedback: '把卡片排版改为左右两栏。' },
    })
    for (
      let attempt = 0;
      attempt < 100 && repository.job(noChange.id)!.state === 'running';
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(repository.job(noChange.id)!.state, 'failed')
    assert.match(repository.job(noChange.id)!.error ?? '', /没有.*修改/)
    assert.equal(repository.get(initial.id).stages.storyboard!.id, result.stages.storyboard!.id)
    const latestFeedback = '保留原有事实和口播。'
    writeFileSync(
      script,
      `#!/usr/bin/env node\nconst fs=require('node:fs');process.stdin.resume();process.stdin.on('end',()=>fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify({ ...storyboard, scenes: [{ ...revisedScene, title: '再次调整的标题' }] }))}));\n`,
    )
    const latest = await service.generate({
      projectId: initial.id,
      stage: 'storyboard',
      executor: 'codex',
      expectedRevision: result.revision,
      requestId: randomUUID(),
      sceneId: 'one',
      storyboardModification: { sceneId: 'one', feedback: latestFeedback },
    })
    for (
      let attempt = 0;
      attempt < 100 && repository.job(latest.id)!.state === 'running';
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(repository.job(latest.id)!.state, 'succeeded')
    assert.equal(
      stageValue(repository.get(initial.id), 'storyboard')!.scenes[0].requirements,
      revisedScene.requirements + '\n' + latestFeedback,
    )
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

test('workflow cloning derives stable per-segment seeds and keeps voice configuration frozen', async () => {
  for (const engine of ['qwen3-tts', 'voxcpm2'] as const) {
    for (const seed of [undefined, 0, 42]) {
      const { db, repository, project } = fixture()
      const root = mkdtempSync(join(tmpdir(), 'workflow-frozen-voice-'))
      const service = new VoiceoverService(root, db, join(root, 'worker.py'))
      const files = new WorkflowFiles(root, repository)
      const runtime = new WorkflowRuntimeManager(root).get()
      const voice = {
        engine,
        profileId: 'original-profile',
        profileRevision: 1,
        options: seed === undefined ? {} : { seed },
      }
      const captured: ReturnType<typeof resolveVoiceRequest>[] = []
      service.runtime.check = async () => service.runtime.get()
      try {
        const source = join(root, 'source.wav')
        await workflowCommand(
          runtime.ffmpegPath,
          ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.1', source],
          { cwd: root, timeout: 10000 },
        )
        const assetId = Number(
          db
            .prepare(
              "INSERT INTO video_assets (title,type,file_path) VALUES ('fixture','audio','source.wav')",
            )
            .run().lastInsertRowid,
        )
        service.create = async (input) => {
          const request = resolveVoiceRequest(input)
          captured.push(request)
          return {
            ...service.repository.createJob(request),
            state: 'succeeded',
            assetId,
          }
        }
        const state = {
          ...project,
          stages: {
            narration: {
              id: 'narration',
              stage: 'narration' as const,
              version: 1,
              payload: {
                scenes: [
                  { id: 'one', text: '这是需要分成多段生成的口播。'.repeat(30) },
                  { id: 'two', text: '第二镜也要沿用相同音色参数。' },
                ],
              },
              dependencies: '',
              status: 'approved' as const,
              createdAt: '',
              approvedAt: '',
              note: '',
            },
          },
        }
        const result = await createWorkflowAudio({
          project: state,
          job: {
            id: randomUUID(),
            projectId: project.id,
            stage: 'audio',
            expectedRevision: project.revision,
            requestId: randomUUID(),
            executor: 'template',
            state: 'running',
            phase: '',
            error: null,
            createdAt: '',
            updatedAt: '',
          },
          voice,
          service,
          files,
          runtime,
          cwd: join(root, 'job'),
          signal: new AbortController().signal,
          phase: () => {},
          progress: () => {
            voice.profileId = 'edited-during-generation'
            voice.profileRevision = 2
            voice.options.seed = 99
          },
        })
        assert.ok(captured.length >= 3, 'covers both chunk and scene boundaries')
        assert.equal(new Set(captured.map((request) => request.options.seed)).size, captured.length)
        assert.ok(captured.every((request) => Number.isInteger(request.options.seed)))
        assert.ok(captured.every((request) => request.profileId === 'original-profile'))
        assert.ok(captured.every((request) => request.profileRevision === 1))
        assert.equal(captured[0].options.seed, workflowVoiceSeed(seed ?? 42, 0, captured[0].text))
        assert.equal(
          captured.at(-1)!.options.seed,
          workflowVoiceSeed(seed ?? 42, captured.length - 1, captured.at(-1)!.text),
        )
        assert.equal(result.voice?.options.seed, seed ?? 42)
        assert.equal(result.voice?.profileId, 'original-profile')
        assert.notEqual(result.voice?.options, voice.options)
      } finally {
        await service.dispose()
        db.close()
        rmSync(root, { recursive: true, force: true })
      }
    }
  }
})

test('single-track regeneration replaces only the selected chunk and preserves the previous version on failure', async () => {
  for (const outcome of ['succeeded', 'failed', 'cancelled'] as const) {
    const { db, repository, state: initial, render } = visualFixture()
    const root = mkdtempSync(join(tmpdir(), 'workflow-single-track-'))
    const voiceover = new VoiceoverService(root, db, join(root, 'worker.py'))
    const service = new VideoWorkflowService(root, db, () => voiceover)
    const runtime = service.runtime.get()
    const captured: ReturnType<typeof resolveVoiceRequest>[] = []
    voiceover.runtime.check = async () => voiceover.runtime.get()
    try {
      const source = join(root, 'source.wav')
      const replacement = join(root, 'replacement.wav')
      for (const [path, duration] of [
        [source, 0.15],
        [replacement, 0.35],
      ] as const) {
        await workflowCommand(
          runtime.ffmpegPath,
          [
            '-v',
            'error',
            '-f',
            'lavfi',
            '-i',
            `sine=frequency=440:duration=${duration}`,
            '-ar',
            '48000',
            path,
          ],
          { cwd: root, timeout: 10000 },
        )
      }
      const tracks = await Promise.all(
        ['第一镜上半句。', '第一镜下半句。', '第二镜口播。'].map(async (text, index) => ({
          sceneId: index < 2 ? 'one' : 'two',
          text,
          duration: 0.15,
          file: await service.files.import(initial.id, source),
        })),
      )
      let state = repository.save(
        initial.id,
        'audio',
        {
          tracks,
          file: await service.files.import(initial.id, source),
          subtitles: await service.files.write(initial.id, 'original subtitles', '.srt'),
          duration: 0.45,
        },
        initial.revision,
        randomUUID(),
      )
      state = repository.approve(
        state.id,
        'audio',
        state.stages.audio!.id,
        state.revision,
        randomUUID(),
      )
      state = repository.save(state.id, 'roughcut', render, state.revision, randomUUID())
      state = repository.approve(
        state.id,
        'roughcut',
        state.stages.roughcut!.id,
        state.revision,
        randomUUID(),
      )
      const originalRevision = state.stages.audio!.id
      const originalAudio = state.stages.audio!.payload
      const assetId = Number(
        db
          .prepare(
            "INSERT INTO video_assets (title,type,file_path) VALUES ('replacement','audio','replacement.wav')",
          )
          .run().lastInsertRowid,
      )
      voiceover.create = async (input) => {
        const request = resolveVoiceRequest(input)
        captured.push(request)
        if (outcome === 'failed') throw new Error('fixture generation failure')
        const job = voiceover.repository.createJob(request)
        return outcome === 'cancelled' ? job : { ...job, state: 'succeeded', assetId }
      }
      const request = {
        projectId: state.id,
        stage: 'audio' as const,
        expectedRevision: state.revision,
        requestId: randomUUID(),
        executor: 'template' as const,
        audioTrackId: tracks[1].file.id,
        voice: {
          engine: 'voxcpm2' as const,
          profileId: 'frozen-profile',
          profileRevision: 1,
          options: { seed: 7, promptPauseMs: 500 },
        },
      }
      await assert.rejects(service.generate({ ...request, audioTrackId: 'missing' }), /有效片段/)
      await assert.rejects(
        service.generate({ ...request, stage: 'copy', executor: 'codex' }),
        /配音阶段/,
      )
      await assert.rejects(service.generate(request, [source]), /有效片段/)
      const job = await service.generate(request)
      if (outcome !== 'failed')
        await assert.rejects(service.generate({ ...request, requestId: randomUUID() }), /运行/)
      if (outcome === 'cancelled') {
        for (let attempt = 0; attempt < 100 && !captured.length; attempt++)
          await new Promise((resolve) => setTimeout(resolve, 10))
        await service.cancel(job.id)
      }
      for (let attempt = 0; attempt < 150 && repository.job(job.id)?.state === 'running'; attempt++)
        await new Promise((resolve) => setTimeout(resolve, 20))
      assert.equal(repository.job(job.id)?.state, outcome)
      state = repository.get(state.id)
      assert.equal(captured.length, 1, 'only the selected chunk calls the voice engine')
      assert.equal(captured[0].text, tracks[1].text)
      assert.equal(captured[0].options.seed, workflowVoiceSeed(7, 1, tracks[1].text, job.id))
      assert.equal(captured[0].options.promptPauseMs, 500)
      if (outcome !== 'succeeded') {
        assert.equal(state.stages.audio!.id, originalRevision)
        assert.deepEqual(state.stages.audio!.payload, originalAudio)
        assert.equal(state.stages.roughcut!.status, 'approved')
      } else {
        const audio = stageValue(state, 'audio')!
        assert.notEqual(state.stages.audio!.id, originalRevision)
        assert.equal(state.stages.audio!.status, 'review')
        assert.equal(state.stages.roughcut!.status, 'stale')
        assert.deepEqual(audio.tracks[0], tracks[0])
        assert.deepEqual(audio.tracks[2], tracks[2])
        assert.notEqual(audio.tracks[1].file.id, tracks[1].file.id)
        assert.equal(audio.tracks[1].sceneId, 'one')
        assert.equal(audio.tracks[1].text, tracks[1].text)
        assert.ok(Math.abs(audio.duration - 0.65) < 0.01)
        assert.ok(Math.abs(audio.tracks[1].duration - 0.35) < 0.01)
        assert.ok(service.files.text(audio.subtitles).includes('00:00:00,500'))
        assert.ok(state.history.some((revision) => revision.id === originalRevision))
      }
    } finally {
      await service.dispose()
      await voiceover.dispose()
      db.close()
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('unchanged narration allows direct approval of stale audio with file validation and a new revision', async () => {
  const { db, repository, state: initial } = visualFixture()
  const root = mkdtempSync(join(tmpdir(), 'workflow-reuse-audio-'))
  const service = new VideoWorkflowService(root, db, () => {
    throw new Error('Reusing audio must not load a voice engine')
  })
  try {
    const file = await service.files.write(initial.id, 'existing verified audio', '.wav')
    const original = stageValue(initial, 'audio')!
    let state = repository.save(
      initial.id,
      'audio',
      {
        ...original,
        file,
        subtitles: file,
        tracks: original.tracks.map((track) => ({ ...track, file })),
      },
      initial.revision,
      randomUUID(),
    )
    state = repository.approve(
      state.id,
      'audio',
      state.stages.audio!.id,
      state.revision,
      randomUUID(),
    )
    const originalId = state.stages.audio!.id
    const originalPayload = stageValue(state, 'audio')!
    const storyboard = stageValue(state, 'storyboard')!
    state = repository.save(
      state.id,
      'storyboard',
      {
        ...storyboard,
        scenes: storyboard.scenes.map((scene, index) =>
          index === 0 ? { ...scene, body: '仅画面内容变化' } : scene,
        ),
      },
      state.revision,
      randomUUID(),
    )
    state = repository.approve(
      state.id,
      'storyboard',
      state.stages.storyboard!.id,
      state.revision,
      randomUUID(),
    )
    state = repository.save(
      state.id,
      'narration',
      stageValue(state, 'narration'),
      state.revision,
      randomUUID(),
    )
    state = repository.approve(
      state.id,
      'narration',
      state.stages.narration!.id,
      state.revision,
      randomUUID(),
    )
    assert.equal(state.stages.audio!.status, 'stale')
    writeFileSync(service.files.path(file), 'tampered audio')
    await assert.rejects(
      service.approve(state.id, 'audio', originalId, state.revision, randomUUID(), ''),
      /文件丢失或内容被修改/,
    )
    assert.equal(repository.get(state.id).revision, state.revision)
    writeFileSync(service.files.path(file), 'existing verified audio')
    db.prepare('UPDATE video_workflow_revisions SET dependencies=? WHERE id=?').run(
      'unverified-source',
      originalId,
    )
    await assert.rejects(
      service.approve(state.id, 'audio', originalId, state.revision, randomUUID(), ''),
      /来源无法核实/,
    )
    db.prepare('UPDATE video_workflow_revisions SET dependencies=? WHERE id=?').run(
      state.stages.audio!.dependencies,
      originalId,
    )
    const approval = randomUUID()
    const approved = await service.approve(
      state.id,
      'audio',
      originalId,
      state.revision,
      approval,
      '确认沿用',
    )
    assert.equal(approved.stages.audio!.status, 'approved')
    assert.notEqual(approved.stages.audio!.id, originalId)
    assert.deepEqual(stageValue(approved, 'audio'), originalPayload)
    assert.equal(approved.history.find((revision) => revision.id === originalId)!.status, 'stale')
    assert.equal(approved.jobs[0].operation?.action, 'reuse-audio')
    const retry = await service.approve(
      state.id,
      'audio',
      originalId,
      state.revision,
      approval,
      '确认沿用',
    )
    assert.equal(retry.stages.audio!.id, approved.stages.audio!.id)
    state = repository.save(
      approved.id,
      'narration',
      {
        scenes: stageValue(approved, 'narration')!.scenes.map((scene, index) =>
          index === 0 ? { ...scene, text: '口播正文已经变化' } : scene,
        ),
      },
      approved.revision,
      randomUUID(),
    )
    state = repository.approve(
      state.id,
      'narration',
      state.stages.narration!.id,
      state.revision,
      randomUUID(),
    )
    await assert.rejects(
      service.approve(state.id, 'audio', state.stages.audio!.id, state.revision, randomUUID(), ''),
      /口播.*变化|口播.*不一致/,
    )
    await assert.rejects(
      service.restoreAudioVersion(state.id, originalId, state.revision, randomUUID()),
      /口播.*变化|口播.*不一致/,
    )
    for (const scenes of [
      stageValue(approved, 'narration')!.scenes.map((scene, index) =>
        index === 0 ? { ...scene, pronunciation: '读音已改变' } : scene,
      ),
    ]) {
      state = repository.save(state.id, 'narration', { scenes }, state.revision, randomUUID())
      state = repository.approve(
        state.id,
        'narration',
        state.stages.narration!.id,
        state.revision,
        randomUUID(),
      )
      await assert.rejects(
        service.approve(
          state.id,
          'audio',
          state.stages.audio!.id,
          state.revision,
          randomUUID(),
          '',
        ),
        /口播.*变化|口播.*不一致/,
      )
    }
  } finally {
    await service.dispose()
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('audio history lists timestamped versions and safely restores a matching previous version', async () => {
  const { db, repository, state: initial } = visualFixture()
  const root = mkdtempSync(join(tmpdir(), 'workflow-audio-history-'))
  const voiceover = new VoiceoverService(root, db, join(root, 'worker.py'))
  const service = new VideoWorkflowService(root, db, () => voiceover)
  try {
    const runtime = service.runtime.get()
    const sourceA = join(root, 'audio-a.wav')
    const sourceB = join(root, 'audio-b.wav')
    for (const [path, frequency] of [
      [sourceA, 440],
      [sourceB, 660],
    ] as const) {
      await workflowCommand(
        runtime.ffmpegPath,
        ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=0.2`, path],
        { cwd: root, timeout: 10000 },
      )
    }
    const fileA = await service.files.import(initial.id, sourceA)
    const fileB = await service.files.import(initial.id, sourceB)
    const first = stageValue(initial, 'audio')!
    let state = repository.save(
      initial.id,
      'audio',
      {
        ...first,
        file: fileA,
        subtitles: fileA,
        tracks: first.tracks.map((track) => ({ ...track, file: fileA })),
      },
      initial.revision,
      randomUUID(),
    )
    state = repository.approve(
      state.id,
      'audio',
      state.stages.audio!.id,
      state.revision,
      randomUUID(),
    )
    const previousId = state.stages.audio!.id
    const previousPayload = state.stages.audio!.payload
    state = repository.save(
      state.id,
      'audio',
      {
        ...previousPayload,
        file: fileB,
        subtitles: fileB,
        tracks: previousPayload.tracks.map((track) => ({ ...track, file: fileB })),
      },
      state.revision,
      randomUUID(),
    )
    assert.equal(state.stages.audio!.version, 3)
    const restored = await service.restoreAudioVersion(
      state.id,
      previousId,
      state.revision,
      randomUUID(),
    )
    assert.equal(restored.stages.audio!.version, 4)
    assert.equal(restored.stages.audio!.status, 'review')
    assert.deepEqual(restored.stages.audio!.payload, previousPayload)
    assert.ok(restored.history.find((revision) => revision.id === previousId)?.createdAt)
    assert.equal(restored.stages.audio!.note, `从分段配音 v2 切换`)
  } finally {
    await service.dispose()
    await voiceover.dispose()
    db.close()
    rmSync(root, { recursive: true, force: true })
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

test('AI copy uses approved brief and revision feedback, preserves history and retains text on failure or cancel', async () => {
  const { db, repository, project } = fixture()
  const root = mkdtempSync(join(tmpdir(), 'video-copy-'))
  const service = new VideoWorkflowService(root, db, () => {
    throw new Error('Copy generation must not invoke voice synthesis')
  })
  try {
    let state = repository.save(
      project.id,
      'brief',
      {
        text: '讲清人工审核流程',
        audience: '开发者',
        duration: 120,
        references: '已核实的项目文档',
      },
      project.revision,
      randomUUID(),
    )
    const input = () => ({
      projectId: state.id,
      stage: 'copy' as const,
      executor: 'codex' as const,
      expectedRevision: state.revision,
      requestId: randomUUID(),
      copyFeedback: '保留核心观点，开头先讲一个具体案例',
    })
    await assert.rejects(service.generate(input()), /审核/)
    state = repository.approve(
      state.id,
      'brief',
      state.stages.brief!.id,
      state.revision,
      randomUUID(),
    )
    const script = join(root, 'fake-codex')
    const capture = join(root, 'prompt.txt')
    const response = join(root, 'response.json')
    writeFileSync(
      script,
      `#!/usr/bin/env node\nconst fs=require('node:fs');let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(capture)},input);setTimeout(()=>fs.copyFileSync(${JSON.stringify(response)},process.argv[process.argv.indexOf('--output-last-message')+1]),200);});\n`,
    )
    chmodSync(script, 0o755)
    service.runtime.set({ codexPath: script })
    const wait = async (id: string) => {
      for (let attempt = 0; attempt < 100 && repository.job(id)?.state === 'running'; attempt++)
        await new Promise((resolve) => setTimeout(resolve, 30))
      return repository.job(id)!
    }
    writeFileSync(response, JSON.stringify({ text: '# 初稿\n先审核，再推进。' }))
    const first = await service.generate(input())
    assert.equal((await wait(first.id)).state, 'succeeded')
    for (const phrase of ['讲清人工审核流程', '开发者', '已核实的项目文档', '开头先讲一个具体案例'])
      assert.ok(readFileSync(capture, 'utf8').includes(phrase), phrase)
    state = repository.get(state.id)
    assert.equal(state.stages.copy!.status, 'review')
    assert.equal(state.stages.storyboard, undefined)
    const original = state.stages.copy!.id
    state = repository.approve(state.id, 'copy', original, state.revision, randomUUID())
    state = repository.save(
      state.id,
      'storyboard',
      {
        mode: 'template',
        template: 'technical',
        scenes: [{ id: 'one', title: '审核', body: '逐步确认', layout: 'title' }],
      },
      state.revision,
      randomUUID(),
    )
    state = repository.approve(
      state.id,
      'storyboard',
      state.stages.storyboard!.id,
      state.revision,
      randomUUID(),
    )
    writeFileSync(response, JSON.stringify({ text: '# 修改稿\n从一次审核案例说起。' }))
    const second = await service.generate(input())
    assert.equal((await wait(second.id)).state, 'succeeded')
    assert.ok(readFileSync(capture, 'utf8').includes('# 初稿'))
    state = repository.get(state.id)
    assert.equal(state.stages.copy!.version, 2)
    assert.match(stageValue(state, 'copy')!.requirements ?? '', /开头先讲一个具体案例/)
    assert.equal(state.stages.copy!.status, 'review')
    assert.equal(state.stages.storyboard!.status, 'stale')
    assert.ok(state.history.some((item) => item.id === original))
    const current = state.stages.copy!.id
    const exported = await service.exportTask(input(), root)
    for (const phrase of ['开头先讲一个具体案例', '# 修改稿'])
      assert.ok(readFileSync(join(exported, 'task.md'), 'utf8').includes(phrase), phrase)
    for (const invalid of ['长'.repeat(5001), 123]) {
      await assert.rejects(
        service.generate(Object.assign(input(), { copyFeedback: invalid })),
        /5000|文本/,
      )
      await assert.rejects(
        service.exportTask(Object.assign(input(), { copyFeedback: invalid }), root),
        /5000|文本/,
      )
    }
    writeFileSync(response, JSON.stringify({ text: '' }))
    const failed = await service.generate(input())
    assert.equal((await wait(failed.id)).state, 'failed')
    assert.equal(repository.get(state.id).stages.copy!.id, current)
    const cancelled = await service.generate(input())
    await service.cancel(cancelled.id)
    assert.equal(repository.job(cancelled.id)!.state, 'cancelled')
    assert.equal(repository.get(state.id).stages.copy!.id, current)
  } finally {
    await service.dispose()
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('visual scene edits can reuse saved narration without invoking an agent or voice synthesis', async () => {
  const { db, repository, state: initial } = visualFixture()
  const root = mkdtempSync(join(tmpdir(), 'workflow-reuse-narration-'))
  const service = new VideoWorkflowService(root, db, () => {
    throw new Error('Must not synthesize voice')
  })
  try {
    const original = stageValue(initial, 'narration')!
    const storyboard = stageValue(initial, 'storyboard')!
    let state = repository.save(
      initial.id,
      'storyboard',
      {
        ...storyboard,
        scenes: storyboard.scenes.map((scene, index) =>
          index === 0 ? { ...scene, body: '新的视觉表现' } : scene,
        ),
      },
      initial.revision,
      randomUUID(),
    )
    assert.equal(state.stages.narration!.status, 'stale')
    await assert.rejects(
      service.generate({
        projectId: state.id,
        stage: 'narration',
        executor: 'template',
        reuseNarration: true,
        expectedRevision: state.revision,
        requestId: randomUUID(),
      }),
      /审核/,
    )
    state = repository.approve(
      state.id,
      'storyboard',
      state.stages.storyboard!.id,
      state.revision,
      randomUUID(),
    )
    const job = await service.generate({
      projectId: state.id,
      stage: 'narration',
      executor: 'template',
      reuseNarration: true,
      expectedRevision: state.revision,
      requestId: randomUUID(),
    })
    for (let attempt = 0; attempt < 100 && repository.job(job.id)?.state === 'running'; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(repository.job(job.id)?.state, 'succeeded', repository.job(job.id)?.error ?? '')
    state = repository.get(state.id)
    assert.deepEqual(stageValue(state, 'narration'), original)
    assert.equal(state.stages.narration!.status, 'review')
    assert.equal(state.stages.narration!.version, initial.stages.narration!.version + 1)
    assert.equal(repository.job(job.id)!.operation?.action, 'reuse-narration')
    state = repository.save(
      state.id,
      'storyboard',
      {
        ...storyboard,
        scenes: [...storyboard.scenes].reverse(),
      },
      state.revision,
      randomUUID(),
    )
    state = repository.approve(
      state.id,
      'storyboard',
      state.stages.storyboard!.id,
      state.revision,
      randomUUID(),
    )
    await assert.rejects(
      service.generate({
        projectId: state.id,
        stage: 'narration',
        executor: 'template',
        reuseNarration: true,
        expectedRevision: state.revision,
        requestId: randomUUID(),
      }),
      /数量或顺序/,
    )
  } finally {
    await service.dispose()
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('single-scene narration regenerates only the target and rejects out-of-scope results', async () => {
  const { db, repository, state: initial } = visualFixture()
  const root = mkdtempSync(join(tmpdir(), 'workflow-scene-narration-'))
  const service = new VideoWorkflowService(root, db, () => {
    throw new Error('No voice synthesis')
  })
  try {
    const original = stageValue(initial, 'narration')!
    const script = join(root, 'fake-codex')
    const capture = join(root, 'prompt.txt')
    const result = { scenes: [{ id: 'one', text: '仅更新第一镜的口播', pronunciation: '略停顿' }] }
    const configureResult = (value: unknown) => {
      writeFileSync(
        script,
        `#!/usr/bin/env node\nconst fs=require('node:fs');let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(capture)},input);fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify(value))});});\n`,
      )
      chmodSync(script, 0o755)
    }
    configureResult(result)
    service.runtime.set({ codexPath: script })
    const storyboard = stageValue(initial, 'storyboard')!
    let source = repository.save(
      initial.id,
      'storyboard',
      {
        ...storyboard,
        scenes: storyboard.scenes.map((scene, index) =>
          index === 0 ? { ...scene, body: '第一页新内容' } : scene,
        ),
      },
      initial.revision,
      randomUUID(),
    )
    source = repository.approve(
      source.id,
      'storyboard',
      source.stages.storyboard!.id,
      source.revision,
      randomUUID(),
    )
    assert.equal(source.stages.narration!.status, 'stale')
    const job = await service.generate({
      projectId: initial.id,
      stage: 'narration',
      executor: 'codex',
      sceneId: 'one',
      expectedRevision: source.revision,
      requestId: randomUUID(),
    })
    for (let attempt = 0; attempt < 100 && repository.job(job.id)?.state === 'running'; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(repository.job(job.id)?.state, 'succeeded', repository.job(job.id)?.error ?? '')
    let state = repository.get(initial.id)
    assert.deepEqual(stageValue(state, 'narration')!.scenes, [result.scenes[0], original.scenes[1]])
    assert.match(readFileSync(capture, 'utf8'), /仅生成 ID=one/)
    assert.equal(repository.job(job.id)!.operation?.sceneId, 'one')
    assert.equal(repository.job(job.id)!.operation?.resultVersion, state.stages.narration!.version)
    assert.ok(
      repository
        .job(job.id)!
        .operation?.changes?.some(
          (change) =>
            change.field === 'text' &&
            change.before === original.scenes[0].text &&
            change.after === result.scenes[0].text,
        ),
    )
    configureResult({ scenes: [{ id: 'two', text: '错误目标' }] })
    const failed = await service.generate({
      projectId: state.id,
      stage: 'narration',
      executor: 'codex',
      sceneId: 'one',
      expectedRevision: state.revision,
      requestId: randomUUID(),
    })
    for (
      let attempt = 0;
      attempt < 100 && repository.job(failed.id)?.state === 'running';
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(repository.job(failed.id)?.state, 'failed')
    assert.deepEqual(
      stageValue(repository.get(state.id), 'narration'),
      stageValue(state, 'narration'),
    )
    await assert.rejects(
      service.generate({
        projectId: state.id,
        stage: 'narration',
        executor: 'codex',
        sceneId: 'missing',
        expectedRevision: state.revision,
        requestId: randomUUID(),
      }),
      /分镜/,
    )
  } finally {
    await service.dispose()
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('manual storyboard edits persist scene-level before/after operations without duplicate records', () => {
  const { db, repository, state: initial } = visualFixture()
  try {
    const storyboard = stageValue(initial, 'storyboard')!
    const changed = {
      ...storyboard,
      scenes: storyboard.scenes.map((scene, index) =>
        index === 0 ? { ...scene, title: '新的第一页标题' } : scene,
      ),
    }
    const request = randomUUID()
    const state = repository.save(initial.id, 'storyboard', changed, initial.revision, request)
    const operation = state.jobs[0]?.operation
    assert.equal(operation?.action, 'scene-edit')
    assert.equal(operation?.sceneId, 'one')
    assert.equal(operation?.sourceVersion, initial.stages.storyboard!.version)
    assert.equal(operation?.resultVersion, state.stages.storyboard!.version)
    assert.deepEqual(operation?.changes, [
      {
        sceneId: 'one',
        title: '新的第一页标题',
        field: 'title',
        before: storyboard.scenes[0].title,
        after: '新的第一页标题',
      },
    ])
    assert.equal(
      repository.save(initial.id, 'storyboard', changed, initial.revision, request).jobs.length,
      state.jobs.length,
    )
  } finally {
    db.close()
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

test('AI publishing regenerates one platform from approved content and preserves other metadata and history', async () => {
  const { db, repository, project } = fixture()
  const root = mkdtempSync(join(tmpdir(), 'video-publish-'))
  const service = new VideoWorkflowService(root, db, () => {
    throw new Error('Publishing must not synthesize audio or render video')
  })
  try {
    let state = project
    const file = await service.files.write(project.id, 'publish test media', '.png')
    const render = {
      file,
      cover: file,
      duration: 4,
      width: 1920,
      height: 1080,
      compositionFiles: [file],
      compositionNames: ['index.html'],
      manifestHash: 'a'.repeat(64),
      checks: 'verified',
    }
    const payloads = {
      brief: { text: '向开发者介绍审核流程', duration: 4 },
      copy: { text: '先检查内容，再确认画面。' },
      storyboard: {
        mode: 'template',
        template: 'technical',
        scenes: [{ id: 'opening', title: '人工审核', body: '逐步确认', layout: 'title' }],
      },
      narration: { scenes: [{ id: 'opening', text: '每一步都需要你确认。' }] },
      audio: {
        file,
        subtitles: file,
        duration: 4,
        tracks: [{ sceneId: 'opening', file, duration: 4, text: '每一步都需要你确认。' }],
      },
      roughcut: render,
      render,
    }
    const generate = () =>
      service.generate({
        projectId: state.id,
        stage: 'publish',
        executor: 'codex',
        expectedRevision: state.revision,
        requestId: randomUUID(),
        publication: { platform: 'douyin', feedback: '标题用问题切入，结合 AI 视频创作话题' },
      })
    await assert.rejects(generate(), /审核/)
    for (const stage of [
      'brief',
      'copy',
      'storyboard',
      'narration',
      'audio',
      'roughcut',
      'render',
    ] as const) {
      state = repository.save(state.id, stage, payloads[stage], state.revision, randomUUID())
      state = repository.approve(
        state.id,
        stage,
        state.stages[stage]!.id,
        state.revision,
        randomUUID(),
      )
    }
    const original = {
      platforms: {
        bilibili: { title: '保留的 B 站标题', description: '人工写好的简介', tags: ['工作流'] },
        douyin: { title: '旧标题', description: '旧简介', tags: ['审核'] },
      },
    }
    state = repository.save(state.id, 'publish', original, state.revision, randomUUID())
    state = repository.approve(
      state.id,
      'publish',
      state.stages.publish!.id,
      state.revision,
      randomUUID(),
    )
    const previous = state.stages.publish!.id
    const script = join(root, 'fake-codex')
    const capture = join(root, 'prompt.txt')
    const response = join(root, 'response.json')
    writeFileSync(
      script,
      `#!/usr/bin/env node\nconst fs=require('node:fs');let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(capture)},input);fs.copyFileSync(${JSON.stringify(response)},process.argv[process.argv.indexOf('--output-last-message')+1]);});\n`,
    )
    chmodSync(script, 0o755)
    service.runtime.set({ codexPath: script })
    const wait = async (id: string) => {
      for (let attempt = 0; attempt < 100 && repository.job(id)?.state === 'running'; attempt++)
        await new Promise((resolve) => setTimeout(resolve, 30))
      return repository.job(id)!
    }
    const metadata = {
      title: 'AI 做视频，为什么要逐步审核？',
      description: '结合实际流程理解人工审核。',
      tags: ['AI视频', '内容创作'],
    }
    writeFileSync(response, JSON.stringify(metadata))
    const first = await generate()
    assert.equal((await wait(first.id)).state, 'succeeded', repository.job(first.id)?.error ?? '')
    const prompt = readFileSync(capture, 'utf8')
    for (const phrase of [
      '先检查内容，再确认画面',
      '人工审核',
      '每一步都需要你确认',
      '标题用问题切入',
      '30',
      '实时热点',
    ])
      assert.ok(prompt.includes(phrase), phrase)
    state = repository.get(state.id)
    assert.equal(state.stages.publish!.status, 'review')
    assert.equal(state.stages.render!.status, 'approved')
    assert.deepEqual(stageValue(state, 'publish')!.platforms.bilibili, original.platforms.bilibili)
    assert.deepEqual(stageValue(state, 'publish')!.platforms.douyin, metadata)
    assert.ok(state.history.some((item) => item.id === previous))
    const exported = await service.exportTask(
      {
        projectId: state.id,
        stage: 'publish',
        executor: 'codex',
        expectedRevision: state.revision,
        requestId: randomUUID(),
        publication: { platform: 'douyin', feedback: '再简洁一点' },
      },
      root,
    )
    assert.ok(readFileSync(join(exported, 'task.md'), 'utf8').includes('再简洁一点'))
    assert.doesNotThrow(() =>
      validatePayload(
        'publish',
        JSON.parse(readFileSync(join(exported, 'result.example.json'), 'utf8')),
      ),
    )
    writeFileSync(response, JSON.stringify({ ...metadata, title: 'AI 视频如何把好审核关？' }))
    const second = await generate()
    assert.equal((await wait(second.id)).state, 'succeeded')
    state = repository.get(state.id)
    assert.equal(state.stages.publish!.version, 3)
    assert.equal(stageValue(state, 'publish')!.platforms.douyin.title, 'AI 视频如何把好审核关？')
    const beforeFailure = state.stages.publish!.id
    writeFileSync(response, JSON.stringify({ ...metadata, title: '长'.repeat(31) }))
    const invalid = await generate()
    assert.equal((await wait(invalid.id)).state, 'failed')
    assert.match(repository.job(invalid.id)!.error!, /30/)
    assert.equal(repository.get(state.id).stages.publish!.id, beforeFailure)
    await assert.rejects(
      service.generate({
        projectId: state.id,
        stage: 'publish',
        executor: 'codex',
        expectedRevision: state.revision,
        requestId: randomUUID(),
        publication: { platform: 'unknown' as 'douyin' },
      }),
      /平台/,
    )
    await assert.rejects(
      service.generate({
        projectId: state.id,
        stage: 'publish',
        executor: 'codex',
        expectedRevision: state.revision,
        requestId: randomUUID(),
        publication: { platform: 'bilibili', feedback: '长'.repeat(5001) },
      }),
      /5000/,
    )
    const retainedDouyin = stageValue(repository.get(state.id), 'publish')!.platforms.douyin
    const bilibili = {
      title: 'Bilibili 标题'.repeat(4),
      description: '面向开发者的完整介绍',
      tags: ['开发者'],
    }
    writeFileSync(response, JSON.stringify(bilibili))
    const biliJob = await service.generate({
      projectId: state.id,
      stage: 'publish',
      executor: 'codex',
      expectedRevision: state.revision,
      requestId: randomUUID(),
      publication: { platform: 'bilibili' },
    })
    assert.equal((await wait(biliJob.id)).state, 'succeeded')
    assert.ok(readFileSync(capture, 'utf8').includes('80 字符'))
    assert.deepEqual(stageValue(repository.get(state.id), 'publish')!.platforms.bilibili, bilibili)
    assert.deepEqual(
      stageValue(repository.get(state.id), 'publish')!.platforms.douyin,
      retainedDouyin,
    )
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
