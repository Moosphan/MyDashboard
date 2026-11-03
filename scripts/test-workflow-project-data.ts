import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { runMigrations } from '../src/main/database/migrations'
import { VideoWorkflowRepository } from '../src/main/database/repositories/video-workflow-repository'
import { canReuseAudio } from '../src/shared/video-workflow'

function fixture() {
  const db = new Database(':memory:')
  runMigrations(db)
  return { db, repository: new VideoWorkflowRepository(db) }
}

test('summary response excludes payloads and is independent of historical HTML growth', () => {
  const { db, repository } = fixture()
  try {
    const project = repository.create('Synthetic project')
    const insert = db.prepare(
      'INSERT INTO video_workflow_revisions(id,project_id,stage,version,payload,dependencies,status,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    insert.run(
      randomUUID(),
      project.id,
      'brief',
      1,
      JSON.stringify({ text: '竖版视频', duration: 60 }),
      '',
      'approved',
      '',
      new Date().toISOString(),
    )
    const initial = repository.listSummaries()
    assert.equal(initial[0].format, 'portrait')
    assert.equal(initial[0].nextStage, 'copy')
    assert.equal(initial[0].approvedCount, 1)
    let bytes = 0
    for (let version = 1; version <= 60; version++) {
      insert.run(
        randomUUID(),
        project.id,
        'storyboard',
        version,
        JSON.stringify({ scenes: [{ title: 'Synthetic scene', html: 'x'.repeat(100000) }] }),
        '',
        'review',
        '',
        new Date().toISOString(),
      )
      if (version === 1) bytes = JSON.stringify(repository.listSummaries()).length
    }
    const summary = repository.listSummaries()[0]
    assert.equal(summary.placeholderTitle, 'Synthetic scene')
    assert.equal(summary.stages.storyboard, 'review')
    assert.equal(summary.nextStage, 'copy')
    assert.ok(JSON.stringify(summary).length < 1000)
    assert.equal(JSON.stringify(repository.listSummaries()).length, bytes)
    console.log(
      JSON.stringify({
        benchmark: 'synthetic-video-summary',
        historyVersions: 60,
        historyHtmlBytes: 6000000,
        summaryBytes: bytes,
      }),
    )
    assert.ok(!JSON.stringify(summary).includes('html'))
    assert.equal(repository.summary(project.id)?.id, project.id)
    const detail = repository.detail(project.id)
    assert.equal(detail.history.length, 2)
    assert.equal(repository.get(project.id).history.length, 61)
    const page = repository.historyPage(project.id, undefined, undefined, 10)
    assert.equal(page.items.length, 10)
    assert.ok(page.nextCursor)
    const next = repository.historyPage(project.id, undefined, page.nextCursor, 10)
    assert.equal(next.items.length, 10)
    assert.ok(!next.items.some((item) => page.items.some((first) => first.id === item.id)))
  } finally {
    db.close()
  }
})

test('compact detail preserves frozen render references while history pages omit payloads', () => {
  const { db, repository } = fixture()
  try {
    const project = repository.create('Synthetic frozen sources')
    const insert = db.prepare(
      'INSERT INTO video_workflow_revisions(id,project_id,stage,version,payload,dependencies,status,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    const source = randomUUID(),
      latest = randomUUID(),
      rough = randomUUID(),
      render = randomUUID()
    insert.run(
      source,
      project.id,
      'storyboard',
      1,
      JSON.stringify({ scenes: [{ title: 'Frozen', html: 'old' }] }),
      '',
      'approved',
      '',
      '2026-10-01',
    )
    insert.run(
      latest,
      project.id,
      'storyboard',
      2,
      JSON.stringify({ scenes: [{ title: 'Current', html: 'new' }] }),
      '',
      'review',
      '',
      '2026-10-02',
    )
    const payload = {
      sourceStoryboard: source,
      compositionFiles: [],
      compositionNames: [],
      manifestHash: 'synthetic',
      file: { sha256: 'synthetic' },
    }
    insert.run(
      rough,
      project.id,
      'roughcut',
      1,
      JSON.stringify(payload),
      '',
      'approved',
      '',
      '2026-10-03',
    )
    insert.run(
      render,
      project.id,
      'render',
      1,
      JSON.stringify({ ...payload, sourceRoughcut: rough }),
      '',
      'approved',
      '',
      '2026-10-04',
    )
    const detail = repository.detail(project.id)
    assert.equal(detail.stages.storyboard?.id, latest)
    assert.ok(detail.history.some((item) => item.id === source))
    assert.ok(detail.history.some((item) => item.id === rough))
    assert.deepEqual(repository.compact(repository.get(project.id)), detail)
    assert.ok(repository.historyPage(project.id).items.every((item) => !('payload' in item)))
    assert.equal(
      repository.revisionContext(project.id, render).find((item) => item.id === source)?.payload
        .scenes[0].title,
      'Frozen',
    )
  } finally {
    db.close()
  }
})

test('summary preserves import, archive, duration and latest stage semantics', () => {
  const { db, repository } = fixture()
  try {
    const project = repository.create('Synthetic import')
    db.prepare(
      'INSERT INTO video_workflow_revisions(id,project_id,stage,version,payload,dependencies,status,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    ).run(
      randomUUID(),
      project.id,
      'render',
      1,
      JSON.stringify({
        imported: { description: 'Synthetic' },
        width: 720,
        height: 1280,
        duration: 12,
        cover: { id: 'cover' },
      }),
      '',
      'approved',
      '',
      new Date().toISOString(),
    )
    const summary = repository.summary(project.id)!
    assert.equal(summary.imported, true)
    assert.equal(summary.format, 'portrait')
    assert.equal(summary.width, 720)
    assert.equal(summary.duration, 12)
    assert.equal(summary.nextStage, 'publish')
    db.prepare('UPDATE video_projects SET archived=1 WHERE id=?').run(project.id)
    assert.equal(repository.listSummaries().length, 0)
    assert.equal(repository.listSummaries(true)[0].id, project.id)
    assert.equal(repository.summary('missing'), null)
  } finally {
    db.close()
  }
})

test('compact detail retains the original audio inputs for reuse checks', () => {
  const { db, repository } = fixture()
  try {
    const project = repository.create('Synthetic audio sources')
    const insert = db.prepare(
      'INSERT INTO video_workflow_revisions(id,project_id,stage,version,payload,dependencies,status,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    for (const stage of ['brief', 'copy', 'storyboard', 'narration'])
      insert.run(
        randomUUID(),
        project.id,
        stage,
        1,
        JSON.stringify(
          stage === 'narration' ? { scenes: [{ id: 'scene', text: 'Synthetic voice' }] } : {},
        ),
        '',
        'approved',
        '',
        '2026-10-01',
      )
    const audioId = randomUUID()
    insert.run(audioId, project.id, 'audio', 1, '{}', '', 'stale', '', '2026-10-02')
    insert.run(randomUUID(), project.id, 'storyboard', 2, '{}', '', 'approved', '', '2026-10-03')
    const detail = repository.detail(project.id)
    assert.equal(canReuseAudio(detail, detail.stages.audio), true)
    assert.equal(
      canReuseAudio(repository.compact(repository.get(project.id)), detail.stages.audio),
      true,
    )
    assert.equal(repository.revisionContext(project.id, audioId).length, 5)
  } finally {
    db.close()
  }
})

test('summary and compact detail agree on latest row rather than greatest version', () => {
  const { db, repository } = fixture()
  try {
    const project = repository.create('Synthetic legacy ordering')
    const insert = db.prepare(
      'INSERT INTO video_workflow_revisions(id,project_id,stage,version,payload,dependencies,status,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    insert.run(randomUUID(), project.id, 'brief', 9, '{}', '', 'approved', '', '2026-10-01')
    const latest = randomUUID()
    insert.run(latest, project.id, 'brief', 2, '{}', '', 'review', '', '2026-10-02')
    assert.equal(repository.summary(project.id)?.stages.brief, 'review')
    assert.equal(repository.detail(project.id).stages.brief?.id, latest)
    assert.equal(repository.get(project.id).stages.brief?.id, latest)
  } finally {
    db.close()
  }
})
