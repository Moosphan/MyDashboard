import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import {
  copyFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { runMigrations } from '../src/main/database/migrations'
import { VideoWorkflowRepository } from '../src/main/database/repositories/video-workflow-repository'
import { WorkflowFiles } from '../src/main/services/video-workflow/files'
import { BilibiliCatbus, supportedCatbusNode } from '../src/main/services/video-workflow/catbus'
import { BilibiliPublishingService } from '../src/main/services/video-workflow/bilibili'
import type { BilibiliPublishRequest } from '../src/shared/bilibili-publishing'

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bilibili-publishing-'))
  const db = new Database(':memory:')
  runMigrations(db)
  const repository = new VideoWorkflowRepository(db)
  const files = new WorkflowFiles(root, repository)
  let project = repository.create('自动发布验证')
  const file = await files.write(project.id, 'fixture-media', '.mp4')
  const cover = await files.write(project.id, 'fixture-cover', '.png')
  const subtitles = await files.write(project.id, 'fixture-subtitles', '.srt')
  const payloads = {
    brief: { text: '审核内容', duration: 10 },
    copy: { text: '审核文案' },
    storyboard: {
      mode: 'template',
      template: 'technical',
      scenes: [{ id: 'one', title: '标题', body: '正文', layout: 'title' }],
    },
    narration: { scenes: [{ id: 'one', text: '口播' }] },
    audio: {
      tracks: [{ sceneId: 'one', text: '口播', file, duration: 10 }],
      file,
      subtitles,
      duration: 10,
    },
    roughcut: {
      file,
      cover,
      duration: 10,
      width: 1920,
      height: 1080,
      compositionFiles: [file],
      compositionNames: ['index.html'],
      manifestHash: 'fixture',
      checks: 'ok',
    },
    render: {
      file,
      cover,
      duration: 10,
      width: 1920,
      height: 1080,
      compositionFiles: [file],
      compositionNames: ['index.html'],
      manifestHash: 'fixture',
      checks: 'ok',
    },
    publish: {
      platforms: {
        bilibili: {
          title: '审核标题',
          description: '@not-a-file $(never execute)',
          tags: ['技术'],
        },
        douyin: { title: '另一平台', description: '', tags: [] },
      },
    },
  }
  for (const [stage, payload] of Object.entries(payloads)) {
    project = repository.save(
      project.id,
      stage as keyof typeof payloads,
      payload,
      project.revision,
      randomUUID(),
    )
    project = repository.approve(
      project.id,
      stage as keyof typeof payloads,
      project.stages[stage as keyof typeof payloads]!.id,
      project.revision,
      randomUUID(),
    )
  }
  const cli = join(root, 'fake-catbus.mjs')
  copyFileSync(join(import.meta.dirname, 'fixtures/catbus.mjs'), cli)
  const runtime = {
    nodePath: process.execPath,
    catbusPath: cli,
    codexPath: '',
    claudePath: '',
    hyperframesPath: '',
    ffmpegPath: '',
    ffprobePath: '',
  }
  const client = new BilibiliCatbus(root, runtime)
  const service = new BilibiliPublishingService(
    root,
    db,
    repository,
    files,
    () => runtime,
    () => {},
  )
  const request: BilibiliPublishRequest = {
    projectId: project.id,
    expectedRevision: project.revision,
    requestId: randomUUID(),
    accountUid: '123',
    category: '17',
    visibility: 'public',
    copyright: 'original',
  }
  const finish = async (id: string) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const record = service.list(project.id).find((item) => item.id === id)!
      if (!['queued', 'uploading', 'submitting'].includes(record.state)) return record
      await delay(20)
    }
    throw new Error('Publishing did not finish')
  }
  const close = async () => {
    await service.dispose()
    db.close()
    rmSync(root, { recursive: true, force: true })
  }
  return {
    root,
    db,
    repository,
    files,
    project,
    file,
    request,
    service,
    client,
    runtime,
    finish,
    close,
  }
}

test('requires the exact supported Node engine versions', () => {
  for (const version of ['22.22.2', '22.23.0', '24.15.0', '26.0.0', '27.0.0'])
    assert.equal(supportedCatbusNode(version), true)
  for (const version of ['20.19.0', '22.22.1', '23.0.0', '24.13.0', '25.0.0', 'invalid'])
    assert.equal(supportedCatbusNode(version), false)
})

test('submits frozen approved files and returns a reviewing receipt without changing stage history', async () => {
  const context = await fixture()
  try {
    const started = context.service.start(context.request)
    const record = await context.finish(started.id)
    assert.equal(record.state, 'reviewing')
    assert.equal(record.externalId, 'BV1xx411c7mD')
    assert.equal(record.snapshot.renderRevisionId, context.project.stages.render!.id)
    assert.equal(record.snapshot.video.sha256, context.file.sha256)
    assert.equal(record.snapshot.metadata.title, '审核标题')
    assert.equal(
      context.repository.get(context.project.id).history.length,
      context.project.history.length,
    )
    assert.equal(
      readFileSync(join(context.root, 'description'), 'utf8'),
      '@not-a-file $(never execute)',
    )
    const args = JSON.parse(readFileSync(join(context.root, 'calls'), 'utf8').trim())
    assert.equal(args[args.indexOf('--visibility') + 1], 'public')
    assert.equal(args[args.indexOf('--category') + 1], '17')
    assert.equal(args[args.indexOf('-a') + 1], 'mydashboard-bili')
    assert.equal(context.repository.get(context.project.id).publications.length, 0)
  } finally {
    await context.close()
  }
})

test('deduplicates requests and blocks the same intent even after submission', async () => {
  const context = await fixture()
  try {
    const first = context.service.start(context.request)
    assert.equal(context.service.start(context.request).id, first.id)
    assert.throws(() => context.service.start({ ...context.request, category: '18' }), /请求/)
    assert.equal(
      context.service.start({ ...context.request, requestId: randomUUID() }).id,
      first.id,
    )
    await context.finish(first.id)
    assert.equal(
      context.service.start({ ...context.request, requestId: randomUUID() }).id,
      first.id,
    )
    assert.equal(readFileSync(join(context.root, 'calls'), 'utf8').trim().split('\n').length, 1)
  } finally {
    await context.close()
  }
})

test('rejects stale approvals, missing categories, implicit visibility and invalid repost sources', async () => {
  const context = await fixture()
  try {
    assert.throws(() => context.service.start({ ...context.request, expectedRevision: 0 }), /更新/)
    assert.throws(() => context.service.start({ ...context.request, category: '' }), /分区/)
    assert.throws(
      () =>
        context.service.start({
          ...context.request,
          visibility: undefined,
        } as unknown as BilibiliPublishRequest),
      /可见/,
    )
    assert.throws(
      () => context.service.start({ ...context.request, copyright: 'repost', source: '' }),
      /来源/,
    )
    const changed = context.repository.save(
      context.project.id,
      'publish',
      context.project.stages.publish!.payload,
      context.project.revision,
      randomUUID(),
    )
    assert.throws(
      () => context.service.start({ ...context.request, expectedRevision: changed.revision }),
      /审核/,
    )
    assert.equal(context.service.list(context.project.id).length, 0)
  } finally {
    await context.close()
  }
})

test('rejects submission settings that differ from the reviewed AI metadata', async () => {
  const context = await fixture()
  try {
    const payload = structuredClone(
      context.project.stages.publish!.payload,
    ) as import('../src/shared/video-workflow').PublishPayload
    payload.platforms.bilibili.submission = {
      category: '17',
      categoryName: '父分区 / 测试分区',
      visibility: 'private',
      copyright: 'original',
      source: '',
    }
    let project = context.repository.save(
      context.project.id,
      'publish',
      payload,
      context.project.revision,
      randomUUID(),
    )
    project = context.repository.approve(
      project.id,
      'publish',
      project.stages.publish!.id,
      project.revision,
      randomUUID(),
    )
    const request = { ...context.request, expectedRevision: project.revision }
    assert.throws(() => context.service.start(request), /已审核资料不一致/)
    assert.equal(context.service.list(project.id).length, 0)
    const record = await context.finish(
      context.service.start({ ...request, visibility: 'private' }).id,
    )
    assert.equal(record.state, 'reviewing')
    assert.equal(record.snapshot.metadata.submission?.visibility, 'private')
  } finally {
    await context.close()
  }
})

test('stops before upload when account ownership or approved media changes', async () => {
  const context = await fixture()
  try {
    writeFileSync(join(context.root, 'mode'), 'wrong-account')
    const account = await context.finish(context.service.start(context.request).id)
    assert.equal(account.state, 'needs_auth')
    writeFileSync(join(context.root, 'mode'), '')
    writeFileSync(context.files.path(context.file), 'tampered')
    const changed = await context.finish(
      context.service.start({ ...context.request, requestId: randomUUID() }).id,
    )
    assert.equal(changed.state, 'failed')
    assert.equal(
      context.service.list(context.project.id).some((item) => item.externalId),
      false,
    )
  } finally {
    await context.close()
  }
})

test('preserves unknown outcomes and sanitized errors instead of automatically republishing', async () => {
  const context = await fixture()
  try {
    writeFileSync(join(context.root, 'mode'), 'network')
    const result = await context.finish(context.service.start(context.request).id)
    assert.equal(result.state, 'unknown')
    assert.throws(
      () =>
        context.service.start({
          ...context.request,
          visibility: 'private',
          requestId: randomUUID(),
        }),
      /待核查/,
    )
    assert.doesNotMatch(result.error ?? '', /SECRET|cookie=/)
    assert.equal(
      context.service.start({ ...context.request, requestId: randomUUID() }).id,
      result.id,
    )
    assert.equal(readFileSync(join(context.root, 'calls'), 'utf8').trim().split('\n').length, 1)
  } finally {
    await context.close()
  }
})

test('keeps the frozen submission when metadata changes while uploading and synchronizes exact BV', async () => {
  const context = await fixture()
  try {
    writeFileSync(join(context.root, 'mode'), 'slow')
    const started = context.service.start(context.request)
    while (!context.service.list(context.project.id).some((item) => item.state === 'uploading'))
      await delay(10)
    context.repository.save(
      context.project.id,
      'publish',
      {
        platforms: {
          bilibili: { title: '修改后的标题', description: '', tags: ['其他'] },
          douyin: { title: '其他平台', description: '', tags: [] },
        },
      },
      context.project.revision,
      randomUUID(),
    )
    const result = await context.finish(started.id)
    assert.equal(result.state, 'reviewing')
    assert.equal(result.snapshot.metadata.title, '审核标题')
    const refreshed = await context.service.refresh(context.project.id, started.id)
    assert.equal(refreshed.state, 'published')
    assert.equal(context.repository.get(context.project.id).stages.publish!.status, 'review')
  } finally {
    await context.close()
  }
})

test('restart recovery treats interrupted upload as unknown and does not submit again', async () => {
  const context = await fixture()
  try {
    writeFileSync(join(context.root, 'mode'), 'slow')
    const started = context.service.start(context.request)
    while (!context.service.list(context.project.id).some((item) => item.state === 'uploading'))
      await delay(10)
    await context.service.dispose()
    const restarted = new BilibiliPublishingService(
      context.root,
      context.db,
      context.repository,
      context.files,
      () => context.runtime,
      () => {},
    )
    assert.equal(restarted.list(context.project.id)[0].state, 'unknown')
    assert.equal(restarted.start({ ...context.request, requestId: randomUUID() }).id, started.id)
    await restarted.dispose()
  } finally {
    await context.close()
  }
})

test('rejects a parent category before uploading and permits an explicit corrected retry', async () => {
  const context = await fixture()
  try {
    const record = await context.finish(
      context.service.start({ ...context.request, category: '1' }).id,
    )
    assert.equal(record.state, 'failed')
    assert.match(record.error!, /子分区/)
    assert.equal(existsSync(join(context.root, 'calls')), false)
    assert.equal(
      (
        await context.finish(
          context.service.start({ ...context.request, requestId: randomUUID() }).id,
        )
      ).state,
      'reviewing',
    )
  } finally {
    await context.close()
  }
})

test('risk control requires explicit acknowledgement before a new attempt', async () => {
  const context = await fixture()
  try {
    writeFileSync(join(context.root, 'mode'), 'risk')
    const record = await context.finish(context.service.start(context.request).id)
    assert.equal(record.state, 'risk_control')
    assert.doesNotMatch(record.error!, /SECRET/)
    assert.equal(
      context.service.start({ ...context.request, requestId: randomUUID() }).id,
      record.id,
    )
    context.service.confirmNotSubmitted(context.project.id, record.id)
    writeFileSync(join(context.root, 'mode'), '')
    const retry = await context.finish(
      context.service.start({ ...context.request, requestId: randomUUID() }).id,
    )
    assert.notEqual(retry.id, record.id)
    assert.equal(retry.state, 'reviewing')
    assert.throws(() => context.service.confirmNotSubmitted(context.project.id, retry.id), /只有/)
  } finally {
    await context.close()
  }
})

test('malformed submission receipts remain unknown and exact-BV reconciliation checks ownership', async () => {
  const context = await fixture()
  try {
    writeFileSync(join(context.root, 'mode'), 'bad-receipt')
    const record = await context.finish(context.service.start(context.request).id)
    assert.equal(record.state, 'unknown')
    assert.equal(record.url, null)
    writeFileSync(join(context.root, 'mode'), 'wrong-owner')
    await assert.rejects(
      context.service.refresh(context.project.id, record.id, 'BV1xx411c7mD'),
      /不符/,
    )
    assert.equal(context.service.list(context.project.id)[0].state, 'unknown')
    writeFileSync(join(context.root, 'mode'), '')
    const reconciled = await context.service.refresh(
      context.project.id,
      record.id,
      'https://www.bilibili.com/video/BV1xx411c7mD',
    )
    assert.equal(reconciled.state, 'published')
    assert.equal(reconciled.externalId, 'BV1xx411c7mD')
    assert.equal(
      readdirSync(context.client.home).some((name) => name.startsWith('description-')),
      false,
    )
  } finally {
    await context.close()
  }
})

test('sends explicit private visibility and repost source without announcing public publication', async () => {
  const context = await fixture()
  try {
    const record = await context.finish(
      context.service.start({
        ...context.request,
        visibility: 'private',
        copyright: 'repost',
        source: '原作者许可来源',
      }).id,
    )
    assert.equal(record.state, 'reviewing')
    const args = JSON.parse(readFileSync(join(context.root, 'calls'), 'utf8').trim())
    assert.equal(args[args.indexOf('--visibility') + 1], 'private')
    assert.equal(args[args.indexOf('--source') + 1], '原作者许可来源')
    assert.equal((await context.service.refresh(context.project.id, record.id)).state, 'private')
  } finally {
    await context.close()
  }
})

test('cancels a queued submission before any upload starts', async () => {
  const context = await fixture()
  try {
    const record = context.service.start(context.request)
    const cancelled = await context.service.cancel(context.project.id, record.id)
    assert.equal(cancelled.state, 'cancelled')
    assert.equal(existsSync(join(context.root, 'calls')), false)
  } finally {
    await context.close()
  }
})

test('disconnect cancels QR login and removes isolated local credentials', async () => {
  const context = await fixture()
  try {
    assert.equal(context.service.connect().state, 'connecting')
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await context.service.connection()).qrCode) break
      await delay(20)
    }
    assert.ok((await context.service.connection()).qrCode?.startsWith('data:image/png;base64,'))
    assert.equal((await context.service.disconnect()).state, 'disconnected')
    assert.equal(existsSync(context.client.home), false)
    assert.equal(existsSync(context.files.path(context.file)), true)
  } finally {
    await context.close()
  }
})
