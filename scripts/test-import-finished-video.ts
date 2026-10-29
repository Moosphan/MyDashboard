import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import {
  copyFileSync,
  ftruncateSync,
  closeSync,
  openSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runMigrations } from '../src/main/database/migrations'
import { VideoWorkflowService } from '../src/main/services/video-workflow/service'
import { workflowCommand } from '../src/main/services/video-workflow/process'
import { stageUnlocked, stageValue, validatePayload } from '../src/shared/video-workflow'
import { publicationPrompt } from '../src/main/services/video-workflow/publish'
import { coverPrompt } from '../src/main/services/video-workflow/covers'
import { setTimeout as delay } from 'node:timers/promises'

async function fixture(width = 360, height = 640) {
  const root = mkdtempSync(join(tmpdir(), 'finished-video-'))
  const db = new Database(':memory:')
  runMigrations(db)
  const service = new VideoWorkflowService(root, db, () => {
    throw new Error('No voice generation expected')
  })
  service.runtime.set({
    ...service.runtime.get(),
    ffmpegPath: '/opt/homebrew/bin/ffmpeg',
    ffprobePath: '/opt/homebrew/bin/ffprobe',
  })
  const source = join(root, 'external.mp4')
  await workflowCommand(
    '/opt/homebrew/bin/ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `color=c=blue:s=${width}x${height}:d=0.8`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      source,
    ],
    { cwd: root },
  )
  return {
    root,
    db,
    service,
    source,
    close: async () => {
      await service.dispose()
      db.close()
      rmSync(root, { recursive: true, force: true })
    },
  }
}

test('imports external portrait and square videos without fake creation stages and retains exact media', async () => {
  for (const [width, height] of [
    [360, 640],
    [384, 384],
  ]) {
    const f = await fixture(width, height)
    try {
      const request = randomUUID()
      let project = await f.service.importFinishedVideo(
        '外部 AI 作品',
        f.source,
        '蓝色动画，介绍城市交通。',
        request,
      )
      assert.deepEqual(Object.keys(project.stages).sort(), ['publish', 'render'])
      assert.equal(project.stages.render?.status, 'approved')
      assert.equal(project.stages.publish?.status, 'review')
      assert.equal(project.jobs.length, 0)
      assert.equal(stageUnlocked(project, 'publish'), true)
      for (const stage of [
        'brief',
        'copy',
        'storyboard',
        'narration',
        'audio',
        'roughcut',
        'render',
      ] as const)
        assert.equal(stageUnlocked(project, stage), false)
      const render = stageValue(project, 'render')!
      assert.equal(render.width, width)
      assert.equal(render.height, height)
      assert.ok(render.duration > 0 && render.duration < 2)
      assert.equal(render.imported?.description, '蓝色动画，介绍城市交通。')
      assert.deepEqual(readFileSync(f.service.files.path(render.file)), readFileSync(f.source))
      assert.equal(
        readFileSync(f.service.files.path(render.cover)).subarray(1, 4).toString(),
        'PNG',
      )
      assert.deepEqual(render.compositionFiles, [])
      assert.equal(
        (
          await f.service.importFinishedVideo(
            '外部 AI 作品',
            f.source,
            '蓝色动画，介绍城市交通。',
            request,
          )
        ).id,
        project.id,
      )
      assert.equal(f.service.repository.list().length, 1)
      assert.throws(
        () =>
          f.service.douyinPublishing.start({
            projectId: project.id,
            expectedRevision: project.revision,
            requestId: randomUUID(),
            accountUid: 'MS4wLjABAAAA_test_123',
            category: '',
            visibility: 'public',
            copyright: 'original',
          }),
        /审核/,
      )
      const prompt = publicationPrompt(project, { platform: 'douyin' })
      assert.match(prompt, /蓝色动画，介绍城市交通/)
      assert.match(prompt, /未.*观看|不.*观看/)
      assert.match(coverPrompt(project, { method: 'code' }), /蓝色动画，介绍城市交通/)
      project = await f.service.save(
        project.id,
        'publish',
        {
          platforms: {
            ...stageValue(project, 'publish')!.platforms,
            douyin: { title: '城市交通', description: '用户审核的简介', tags: ['交通'] },
          },
        },
        project.revision,
        randomUUID(),
      )
      project = await f.service.approve(
        project.id,
        'publish',
        project.stages.publish!.id,
        project.revision,
        randomUUID(),
        '已核对原视频',
      )
      assert.equal(project.stages.publish?.status, 'approved')
      const directory = await f.service.exportPublication(project.id, 'douyin', f.root)
      assert.ok(readdirSync(directory).includes('video.mp4'))
      assert.ok(!readdirSync(directory).includes('subtitles.srt'))
      assert.match(readFileSync(join(directory, 'README.txt'), 'utf8'), /未.*独立字幕/)
      await assert.rejects(
        f.service.save(
          project.id,
          'brief',
          { text: '不能回退成生成项目', duration: 10 },
          project.revision,
          randomUUID(),
        ),
        /外部成片/,
      )
      assert.throws(
        () =>
          f.service.repository.save(project.id, 'render', render, project.revision, randomUUID()),
        /导入/,
      )
      assert.equal(f.service.repository.get(project.id).stages.publish?.status, 'approved')
      project = await f.service.repository.archive(project.id, true, project.revision)
      assert.equal(stageUnlocked(project, 'publish'), false)
    } finally {
      await f.close()
    }
  }
})

test('invalid imports leave no orphan projects or managed files and cannot spoof a generated render', async () => {
  const f = await fixture()
  try {
    const invalid = join(f.root, 'invalid.mp4')
    writeFileSync(invalid, 'not a video')
    const link = join(f.root, 'link.mp4')
    symlinkSync(f.source, link)
    for (const path of [invalid, link, join(f.root, 'missing.mp4')]) {
      await assert.rejects(f.service.importFinishedVideo('无效素材', path, '', randomUUID()))
      assert.equal(f.service.repository.list().length, 0)
      assert.deepEqual(readdirSync(join(f.root, 'media/video-workflow')), [])
    }
    await assert.rejects(f.service.importFinishedVideo('', f.source, '', randomUUID()), /名称/)
    await assert.rejects(
      f.service.importFinishedVideo('超长说明', f.source, 'x'.repeat(5001), randomUUID()),
      /5000/,
    )
    const oversized = join(f.root, 'oversized.mp4')
    const descriptor = openSync(oversized, 'w')
    ftruncateSync(descriptor, 1024 ** 3 + 1)
    closeSync(descriptor)
    await assert.rejects(
      f.service.importFinishedVideo('过大视频', oversized, '', randomUUID()),
      /1 GB/,
    )
    const unsupported = join(f.root, 'unsupported.mp4')
    await workflowCommand(
      '/opt/homebrew/bin/ffmpeg',
      ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=32x32:d=0.1', '-c:v', 'mpeg4', unsupported],
      { cwd: f.root },
    )
    await assert.rejects(
      f.service.importFinishedVideo('不支持的编码', unsupported, '', randomUUID()),
      /H.264/,
    )
    assert.equal(f.service.repository.list().length, 0)
    const generated = f.service.repository.create('正常工作流')
    assert.equal(stageUnlocked(generated, 'publish'), false)
    assert.throws(() => validatePayload('render', { imported: {}, width: 360, height: 640 }), /./)
  } finally {
    await f.close()
  }
})

test('deduplicates concurrent imports and restarts, while cleaning up failures after project creation', async () => {
  const f = await fixture()
  try {
    const originalImport = f.service.files.import.bind(f.service.files)
    let copies = 0
    f.service.files.import = async (...args) => {
      if (++copies === 2) throw new Error('模拟封面写入失败')
      return originalImport(...args)
    }
    await assert.rejects(
      f.service.importFinishedVideo('失败后重试', f.source, '', randomUUID()),
      /封面写入失败/,
    )
    assert.equal(f.service.repository.list().length, 0)
    assert.deepEqual(readdirSync(join(f.root, 'media/video-workflow')), [])
    assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM video_workflow_files').get().count, 0)
    f.service.files.import = originalImport
    const request = randomUUID()
    const [first, second] = await Promise.all([
      f.service.importFinishedVideo('同一请求', f.source, '', request),
      f.service.importFinishedVideo('同一请求', f.source, '', request),
    ])
    assert.equal(first.id, second.id)
    await assert.rejects(
      f.service.importFinishedVideo('不同请求内容', f.source, '', request),
      /请求 ID/,
    )
    await f.service.dispose()
    const reopened = new VideoWorkflowService(f.root, f.db, () => {
      throw new Error('No voice expected')
    })
    try {
      const restored = await reopened.importFinishedVideo('同一请求', f.source, '', request)
      assert.equal(restored.id, first.id)
      assert.equal(stageUnlocked(restored, 'publish'), true)
      assert.equal(reopened.repository.list().length, 1)
    } finally {
      await reopened.dispose()
    }
  } finally {
    await f.close()
  }
})

test('submits the frozen imported video through both existing platform publishing services using a local CLI fixture', async () => {
  const f = await fixture()
  try {
    const cli = join(f.root, 'dist/cli/main.mjs')
    mkdirSync(join(f.root, 'dist/cli'), { recursive: true })
    copyFileSync(join(import.meta.dirname, 'fixtures/catbus.mjs'), cli)
    f.service.runtime.set({
      ...f.service.runtime.get(),
      nodePath: process.execPath,
      catbusPath: cli,
    })
    let project = await f.service.importFinishedVideo(
      '外部成片投稿',
      f.source,
      '内容说明',
      randomUUID(),
    )
    project = await f.service.save(
      project.id,
      'publish',
      {
        platforms: {
          bilibili: { title: '审核标题', description: '导入成片资料', tags: ['交通'] },
          douyin: { title: '另一平台', description: '导入成片资料', tags: [] },
        },
      },
      project.revision,
      randomUUID(),
    )
    project = await f.service.approve(
      project.id,
      'publish',
      project.stages.publish!.id,
      project.revision,
      randomUUID(),
    )
    for (const platform of ['bilibili', 'douyin'] as const) {
      const publishing = platform === 'bilibili' ? f.service.publishing : f.service.douyinPublishing
      const started = publishing.start({
        projectId: project.id,
        expectedRevision: project.revision,
        requestId: randomUUID(),
        accountUid: platform === 'bilibili' ? '123' : 'MS4wLjABAAAA_test_123',
        category: platform === 'bilibili' ? '17' : '',
        visibility: 'public',
        copyright: 'original',
      })
      let record = started
      for (
        let attempt = 0;
        attempt < 200 && ['queued', 'uploading', 'submitting'].includes(record.state);
        attempt++
      ) {
        await delay(30)
        record = publishing.list(project.id).find((item) => item.id === started.id)!
      }
      assert.equal(record.state, 'reviewing', record.error ?? undefined)
      assert.equal(record.snapshot.renderRevisionId, project.stages.render!.id)
      assert.equal(record.snapshot.video.sha256, stageValue(project, 'render')!.file.sha256)
      assert.ok(record.url)
    }
    assert.equal(readFileSync(join(f.root, 'calls'), 'utf8').trim().split('\n').length, 2)
    assert.deepEqual(
      readFileSync(f.service.files.path(stageValue(project, 'render')!.file)),
      readFileSync(f.source),
    )
  } finally {
    await f.close()
  }
})
