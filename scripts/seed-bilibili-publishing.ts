import Database from 'better-sqlite3'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runMigrations } from '../src/main/database/migrations'
import { VideoWorkflowRepository } from '../src/main/database/repositories/video-workflow-repository'
import { WorkflowFiles } from '../src/main/services/video-workflow/files'
import type { StagePayloads, VideoStage } from '../src/shared/video-workflow'

async function seed() {
  const root = process.argv[2]
  mkdirSync(join(root, 'database'), { recursive: true })
  const db = new Database(join(root, 'database/dashboard.db'))
  runMigrations(db)
  const repository = new VideoWorkflowRepository(db)
  const files = new WorkflowFiles(root, repository)
  let project = repository.create('B 站自动发布验证')
  const videoPath = join(root, 'preview.mp4')
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x2c2640:s=640x360:d=2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    videoPath,
  ])
  const file = await files.write(project.id, readFileSync(videoPath), '.mp4')
  rmSync(videoPath)
  const cover = await files.write(
    project.id,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64',
    ),
    '.png',
  )
  const subtitles = await files.write(
    project.id,
    '1\n00:00:00,000 --> 00:00:01,000\n口播\n',
    '.srt',
  )
  const render = {
    file,
    cover,
    duration: 10,
    width: 1920,
    height: 1080,
    compositionFiles: [file],
    compositionNames: ['index.html'],
    manifestHash: 'fixture',
    checks: 'ok',
  }
  const payloads: StagePayloads = {
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
    roughcut: render,
    render,
    publish: {
      platforms: {
        bilibili: { title: '审核标题', description: '一键投稿测试资料', tags: ['技术'] },
        douyin: { title: '抖音资料', description: '', tags: [] },
      },
    },
  }
  for (const stage of Object.keys(payloads) as VideoStage[]) {
    project = repository.save(project.id, stage, payloads[stage], project.revision, randomUUID())
    project = repository.approve(
      project.id,
      stage,
      project.stages[stage]!.id,
      project.revision,
      randomUUID(),
    )
  }
  writeFileSync(join(root, 'seed-project.json'), JSON.stringify(project))
  mkdirSync(join(root, 'config'), { recursive: true })
  writeFileSync(
    join(root, 'config/video-workflow.json'),
    JSON.stringify({
      nodePath: process.argv[3],
      catbusPath: join(import.meta.dirname, 'fixtures/catbus.mjs'),
    }),
  )
  writeFileSync(join(root, 'mode'), 'signed-out')
  db.close()
}
void seed().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
