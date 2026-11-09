import type Database from 'better-sqlite3'
import { compareFinalRender } from '../../../shared/video-render-comparison'
import { createHash, randomUUID } from 'node:crypto'
import {
  VIDEO_STAGES,
  stageUnlocked,
  workflowDependencies,
  validatePayload,
  type VideoProject,
  type VideoStage,
  type WorkflowRevision,
  type WorkflowJob,
  type PublicationRecord,
  type WorkflowFile,
  type VideoPlatform,
  type PlatformMetadata,
  type AudioProgress,
  type MotionPlan,
  type VideoStyleTemplate,
  stageValue,
  videoFrame,
  renderSourceProject,
  validateMotionPlan,
  type WorkflowOperation,
  type StagePayloads,
  type VideoProjectSummary,
  type WorkflowHistoryPage,
  inferVideoFormat,
  audioSourceRevisions,
  isVideoRenderEngine,
  type VideoRenderEngine,
} from '../../../shared/video-workflow'

function sceneChanges(
  stage: VideoStage,
  before: WorkflowRevision['payload'] | undefined,
  after: WorkflowRevision['payload'],
): NonNullable<WorkflowOperation['changes']> {
  if (stage !== 'storyboard' && stage !== 'narration') return []
  const previous = (before as StagePayloads['storyboard' | 'narration'] | undefined)?.scenes ?? []
  const current = (after as StagePayloads['storyboard' | 'narration']).scenes
  const changes: NonNullable<WorkflowOperation['changes']> = []
  for (const sceneId of new Set([...previous, ...current].map((scene) => scene.id))) {
    const source = previous.find((scene) => scene.id === sceneId)
    const result = current.find((scene) => scene.id === sceneId)
    const title =
      result && 'title' in result
        ? result.title
        : source && 'title' in source
          ? source.title
          : sceneId
    const fields =
      !source || !result
        ? ['scene']
        : stage === 'storyboard'
          ? ['title', 'body', 'layout', 'html', 'requirements', 'motion', 'materialFallback']
          : ['text', 'pronunciation']
    for (const field of fields) {
      const value = (scene: typeof source) =>
        field === 'scene'
          ? JSON.stringify(scene ?? null)
          : field === 'motion' || field === 'materialFallback'
            ? JSON.stringify(
                (scene as unknown as Record<string, unknown> | undefined)?.[field] ?? null,
              )
            : String((scene as unknown as Record<string, unknown> | undefined)?.[field] ?? '')
      const oldValue = value(source),
        newValue = value(result)
      if (oldValue !== newValue)
        changes.push({ sceneId, title, field, before: oldValue, after: newValue })
    }
  }
  if (previous.map((scene) => scene.id).join() !== current.map((scene) => scene.id).join())
    changes.push({
      sceneId: 'order',
      title: '分镜顺序',
      field: 'order',
      before: previous.map((scene) => scene.id).join(' → '),
      after: current.map((scene) => scene.id).join(' → '),
    })
  return changes
}

export function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
interface ProjectRow {
  id: string
  title: string
  revision: number
  archived: number
  created_at: string
  updated_at: string
}
interface RevisionRow {
  id: string
  stage: VideoStage
  version: number
  payload: string
  dependencies: string
  status: WorkflowRevision['status']
  approved_at: string | null
  note: string
  created_at: string
}
interface JobRow {
  id: string
  project_id: string
  stage: VideoStage
  request_id: string
  expected_revision: number
  executor: string
  render_engine: VideoRenderEngine | null
  input_fingerprint: string
  state: WorkflowJob['state']
  phase: string
  error: string | null
  audio_progress: string | null
  kind: 'generation' | 'motion-plan'
  motion_plan: string | null
  operation: string | null
  created_at: string
  updated_at: string
}
interface PublicationRow {
  id: string
  platform: VideoPlatform
  revision_id: string
  metadata: string
  export_path: string
  url: string | null
  created_at: string
  published_at: string | null
}

export class VideoWorkflowRepository {
  constructor(readonly db: Database.Database) {}
  create(title: string): VideoProject {
    if (typeof title !== 'string' || !title.trim() || title.length > 120)
      throw new Error('项目名称需为 1–120 字')
    const id = randomUUID(),
      now = new Date().toISOString()
    this.db
      .prepare('INSERT INTO video_projects(id,title,created_at,updated_at) VALUES(?,?,?,?)')
      .run(id, title.trim(), now, now)
    return this.get(id)
  }
  completeVideoImport(id: string, value: unknown, requestId: string, requestValue: unknown) {
    return this.db.transaction(() => {
      const project = this.current(id, 1)
      if (project.history.length) throw new Error('仅新项目可以导入外部成片')
      const render = validatePayload('render', value)
      if (!render.imported) throw new Error('缺少外部成片导入来源')
      if (this.request(id, requestId, requestValue)) return this.get(id)
      const renderId = randomUUID(),
        now = new Date().toISOString()
      this.db
        .prepare(
          'INSERT INTO video_workflow_revisions(id,project_id,stage,version,payload,dependencies,status,approved_at,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          renderId,
          id,
          'render',
          1,
          JSON.stringify(render),
          fingerprint([]),
          'approved',
          now,
          '用户导入外部成品视频，跳过创作阶段；发布资料仍需审核',
          now,
        )
      const publish = validatePayload('publish', {
        platforms: {
          bilibili: {
            title: project.title.slice(0, 80),
            description: render.imported.description.slice(0, 2000),
            tags: [],
          },
          douyin: {
            title: project.title.slice(0, 30),
            description: render.imported.description.slice(0, 2000),
            tags: [],
          },
        },
      })
      this.db
        .prepare(
          'INSERT INTO video_workflow_revisions(id,project_id,stage,version,payload,dependencies,status,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .run(
          randomUUID(),
          id,
          'publish',
          1,
          JSON.stringify(publish),
          fingerprint([renderId]),
          'review',
          '基于外部成片创建，等待人工审核',
          now,
        )
      this.bump(id)
      return this.get(id)
    })()
  }
  discardIncompleteImport(id: string) {
    this.db.transaction(() => {
      const project = this.current(id, 1)
      if (project.history.length || project.jobs.length) throw new Error('不能移除已完成的项目')
      this.db.prepare('DELETE FROM video_workflow_files WHERE project_id=?').run(id)
      this.db.prepare('DELETE FROM video_projects WHERE id=?').run(id)
    })()
  }
  list(archived = false): VideoProject[] {
    return (
      this.db
        .prepare(
          'SELECT id FROM video_projects WHERE archived=? ORDER BY updated_at DESC,rowid DESC',
        )
        .all(archived ? 1 : 0) as { id: string }[]
    ).map((row) => this.get(row.id))
  }
  listSummaries(archived = false): VideoProjectSummary[] {
    return this.summaryRows('p.archived=?', archived ? 1 : 0)
  }
  summary(id: string): VideoProjectSummary | null {
    return this.summaryRows('p.id=?', id)[0] ?? null
  }
  private summaryRows(where: string, value: string | number): VideoProjectSummary[] {
    const rows = this.db
      .prepare(
        `
      SELECT p.*, p.rowid AS sort_order,
        json_object(${VIDEO_STAGES.map((stage) => `'${stage}',(SELECT status FROM video_workflow_revisions WHERE project_id=p.id AND stage='${stage}' ORDER BY rowid DESC LIMIT 1)`).join(',')}) AS statuses,
        EXISTS(SELECT 1 FROM video_workflow_jobs j WHERE j.project_id=p.id AND j.state='running') AS running,
        (SELECT json_object('id',id,'imported',json_extract(payload,'$.imported') IS NOT NULL,'width',json_extract(payload,'$.width'),'height',json_extract(payload,'$.height'),'duration',json_extract(payload,'$.duration'),'cover',json_extract(payload,'$.cover')) FROM video_workflow_revisions WHERE project_id=p.id AND stage='render' ORDER BY rowid DESC LIMIT 1) AS render,
        (SELECT json_object('file',json_extract(payload,'$.platforms.bilibili.cover.file'),'sourceRenderId',json_extract(payload,'$.platforms.bilibili.cover.sourceRenderId')) FROM video_workflow_revisions WHERE project_id=p.id AND stage='publish' ORDER BY rowid DESC LIMIT 1) AS publication_cover,
        (SELECT json_extract(payload,'$.cover') FROM video_workflow_revisions WHERE project_id=p.id AND stage='roughcut' ORDER BY rowid DESC LIMIT 1) AS rough_cover,
        (SELECT json_extract(payload,'$.duration') FROM video_workflow_revisions WHERE project_id=p.id AND stage='audio' ORDER BY rowid DESC LIMIT 1) AS audio_duration,
        (SELECT json_object('text',json_extract(payload,'$.text'),'duration',json_extract(payload,'$.duration'),'format',json_extract(payload,'$.format')) FROM video_workflow_revisions WHERE project_id=p.id AND stage='brief' ORDER BY rowid DESC LIMIT 1) AS brief,
        (SELECT json_object('text',json_extract(payload,'$.text'),'requirements',json_extract(payload,'$.requirements')) FROM video_workflow_revisions WHERE project_id=p.id AND stage='copy' ORDER BY rowid DESC LIMIT 1) AS copy,
        (SELECT json_object('title',json_extract(payload,'$.scenes[0].title'),'referenceText',json_extract(payload,'$.referenceText')) FROM video_workflow_revisions WHERE project_id=p.id AND stage='storyboard' ORDER BY rowid DESC LIMIT 1) AS storyboard
      FROM video_projects p WHERE ${where} ORDER BY p.updated_at DESC,p.rowid DESC
    `,
      )
      .all(value) as (ProjectRow & {
      sort_order: number
      statuses: string
      running: number
      render: string | null
      publication_cover: string | null
      rough_cover: string | null
      audio_duration: number | null
      brief: string | null
      copy: string | null
      storyboard: string | null
    })[]
    return rows.map((row) => {
      const stages = Object.fromEntries(
        Object.entries(JSON.parse(row.statuses ?? '{}')).filter(([, status]) => status !== null),
      ) as VideoProjectSummary['stages']
      const render = JSON.parse(row.render ?? 'null') as {
        id: string
        imported: boolean
        width: number
        height: number
        duration: number
        cover?: WorkflowFile
      } | null
      const publicationCover = JSON.parse(row.publication_cover ?? 'null') as {
        file?: WorkflowFile
        sourceRenderId?: string
      } | null
      const brief = JSON.parse(row.brief ?? 'null')
      const copy = JSON.parse(row.copy ?? 'null')
      const storyboard = JSON.parse(row.storyboard ?? 'null')
      const format = render?.imported
        ? render.width < render.height
          ? 'portrait'
          : 'landscape'
        : inferVideoFormat(brief?.format, [
            storyboard?.referenceText,
            brief?.text,
            copy?.requirements,
            copy?.text,
          ])
      return {
        id: row.id,
        title: row.title,
        revision: row.revision,
        archived: Boolean(row.archived),
        updatedAt: row.updated_at,
        sortOrder: row.sort_order,
        stages,
        nextStage: render?.imported
          ? 'publish'
          : (VIDEO_STAGES.find((stage) => stages[stage] !== 'approved') ?? 'publish'),
        approvedCount: Object.values(stages).filter((status) => status === 'approved').length,
        imported: Boolean(render?.imported),
        format,
        duration: render?.duration ?? row.audio_duration ?? brief?.duration ?? undefined,
        width: render?.width,
        height: render?.height,
        cover:
          (render && publicationCover?.sourceRenderId === render.id
            ? publicationCover.file
            : undefined) ??
          render?.cover ??
          JSON.parse(row.rough_cover ?? 'null') ??
          undefined,
        placeholderTitle: storyboard?.title ?? undefined,
        running: Boolean(row.running),
      }
    })
  }
  historyPage(
    id: string,
    stage?: VideoStage,
    cursor?: number | null,
    limit = 20,
  ): WorkflowHistoryPage {
    if (stage !== undefined && !VIDEO_STAGES.includes(stage)) throw new Error('无效阶段')
    const count = Math.max(1, Math.min(50, Number.isInteger(limit) ? limit : 20))
    const rows = this.db
      .prepare(
        `SELECT rowid AS cursor,id,stage,version,dependencies,status,approved_at,note,created_at FROM video_workflow_revisions WHERE project_id=? ${stage ? 'AND stage=?' : ''} ${cursor ? 'AND rowid<?' : ''} ORDER BY rowid DESC LIMIT ?`,
      )
      .all(id, ...(stage ? [stage] : []), ...(cursor ? [cursor] : []), count + 1) as (Omit<
      RevisionRow,
      'payload'
    > & { cursor: number })[]
    return {
      items: rows.slice(0, count).map((row) => ({
        id: row.id,
        stage: row.stage,
        version: row.version,
        dependencies: row.dependencies,
        status: row.status,
        approvedAt: row.approved_at,
        note: row.note,
        createdAt: row.created_at,
      })),
      nextCursor: rows.length > count ? rows[count - 1].cursor : null,
    }
  }
  revision(id: string, revisionId: string): WorkflowRevision {
    const row = this.db
      .prepare('SELECT * FROM video_workflow_revisions WHERE project_id=? AND id=?')
      .get(id, revisionId) as RevisionRow | undefined
    if (!row) throw new Error('历史版本不存在')
    return this.mapRevision(row)
  }
  revisionContext(id: string, revisionId: string): WorkflowRevision[] {
    const revision = this.revision(id, revisionId)
    const result = [revision]
    if (revision.stage === 'audio') {
      for (const stage of VIDEO_STAGES.slice(0, 4)) {
        const row = this.db
          .prepare(
            'SELECT * FROM video_workflow_revisions WHERE project_id=? AND stage=? AND rowid<(SELECT rowid FROM video_workflow_revisions WHERE id=? AND project_id=?) ORDER BY rowid DESC LIMIT 1',
          )
          .get(id, stage, revisionId, id) as RevisionRow | undefined
        if (row) result.push(this.mapRevision(row))
      }
    }
    if (revision.stage === 'render' || revision.stage === 'roughcut') {
      const render = revision.payload as StagePayloads['render']
      for (const source of [
        render.sourceStoryboard,
        render.sourceNarration,
        render.sourceAudio,
        render.sourceRoughcut,
      ])
        if (source && !result.some((item) => item.id === source))
          result.push(this.revision(id, source))
      if (revision.stage === 'render' && !render.sourceRoughcut) {
        const rows = this.db
          .prepare(
            "SELECT * FROM video_workflow_revisions WHERE project_id=? AND stage='roughcut' AND created_at<=? AND json_extract(payload,'$.manifestHash')=? ORDER BY version DESC",
          )
          .iterate(id, revision.createdAt, render.manifestHash)
        for (const value of rows) {
          const candidate = this.mapRevision(value as RevisionRow)
          if (compareFinalRender({ history: [candidate] }, revision).source) {
            result.push(candidate)
            break
          }
        }
      }
    }
    return result
  }
  historyAssets(id: string, kind: 'cover' | 'music') {
    if (kind !== 'cover' && kind !== 'music') throw new Error('无效历史素材')
    const stage = kind === 'cover' ? 'publish' : 'render'
    const path = kind === 'cover' ? '$.platforms.bilibili.cover' : '$.music'
    return this.db
      .prepare(
        'SELECT version,json_extract(payload,?) AS value FROM video_workflow_revisions WHERE project_id=? AND stage=? AND json_extract(payload,?) IS NOT NULL ORDER BY version DESC',
      )
      .all(path, id, stage, path)
      .map((row) => {
        const item = row as { version: number; value: string }
        return { version: item.version, value: JSON.parse(item.value) }
      })
  }
  detail(id: string): VideoProject {
    return this.get(id, false)
  }
  compact(project: VideoProject): VideoProject {
    const revisions = new Set(Object.values(project.stages).map((revision) => revision.id))
    for (const revision of [project.stages.roughcut, project.stages.render]) {
      const render = revision?.payload as StagePayloads['render'] | undefined
      for (const source of [
        render?.sourceStoryboard,
        render?.sourceAudio,
        render?.sourceNarration,
        render?.sourceRoughcut,
      ])
        if (source) revisions.add(source)
    }
    if (project.stages.render) {
      const source = compareFinalRender(project, project.stages.render).source
      if (source) revisions.add(source.id)
    }
    if (project.stages.audio)
      for (const source of audioSourceRevisions(project, project.stages.audio) ?? [])
        revisions.add(source.id)
    return { ...project, history: project.history.filter((revision) => revisions.has(revision.id)) }
  }
  private mapRevision(item: RevisionRow): WorkflowRevision {
    return {
      id: item.id,
      stage: item.stage,
      version: item.version,
      payload: JSON.parse(item.payload),
      dependencies: item.dependencies,
      status: item.status,
      approvedAt: item.approved_at,
      note: item.note,
      createdAt: item.created_at,
    }
  }
  get(id: string, includeHistory = true): VideoProject {
    const row = this.db.prepare('SELECT * FROM video_projects WHERE id=?').get(id) as
      | ProjectRow
      | undefined
    if (!row) throw new Error('视频项目不存在')
    const history = (
      this.db
        .prepare(
          includeHistory
            ? 'SELECT * FROM video_workflow_revisions WHERE project_id=? ORDER BY rowid DESC'
            : 'SELECT * FROM video_workflow_revisions WHERE rowid IN (SELECT MAX(rowid) FROM video_workflow_revisions WHERE project_id=? GROUP BY stage) ORDER BY rowid DESC',
        )
        .all(id) as RevisionRow[]
    ).map((item) => ({
      id: item.id,
      stage: item.stage,
      version: item.version,
      payload: JSON.parse(item.payload),
      dependencies: item.dependencies,
      status: item.status,
      approvedAt: item.approved_at,
      note: item.note,
      createdAt: item.created_at,
    }))
    const stages: VideoProject['stages'] = {}
    for (const revision of history) if (!stages[revision.stage]) stages[revision.stage] = revision
    if (!includeHistory) {
      const sourceIds = new Set<string>()
      for (const revision of [stages.roughcut, stages.render]) {
        const payload = revision?.payload as StagePayloads['render'] | undefined
        for (const source of [
          payload?.sourceStoryboard,
          payload?.sourceNarration,
          payload?.sourceAudio,
          payload?.sourceRoughcut,
        ])
          if (source) sourceIds.add(source)
      }
      for (const source of sourceIds)
        if (!history.some((revision) => revision.id === source)) {
          const row = this.db
            .prepare('SELECT * FROM video_workflow_revisions WHERE project_id=? AND id=?')
            .get(id, source) as RevisionRow | undefined
          if (row) history.push(this.mapRevision(row))
        }
      if (stages.render)
        for (const revision of this.revisionContext(id, stages.render.id))
          if (!history.some((item) => item.id === revision.id)) history.push(revision)
      if (stages.audio)
        for (const revision of this.revisionContext(id, stages.audio.id))
          if (!history.some((item) => item.id === revision.id)) history.push(revision)
      if (history.length) {
        const order = this.db
          .prepare(
            `SELECT id,rowid AS position FROM video_workflow_revisions WHERE project_id=? AND id IN (${history.map(() => '?').join(',')})`,
          )
          .all(id, ...history.map((revision) => revision.id)) as { id: string; position: number }[]
        const positions = new Map(order.map((row) => [row.id, row.position]))
        history.sort((left, right) => positions.get(right.id)! - positions.get(left.id)!)
      }
    }
    return {
      id: row.id,
      title: row.title,
      revision: row.revision,
      archived: Boolean(row.archived),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      stages,
      history,
      jobs: (
        this.db
          .prepare(
            'SELECT * FROM video_workflow_jobs WHERE project_id=? ORDER BY rowid DESC LIMIT 100',
          )
          .all(id) as JobRow[]
      ).map((item) => this.mapJob(item)),
      publications: (
        this.db
          .prepare(
            'SELECT * FROM video_workflow_publications WHERE project_id=? ORDER BY rowid DESC',
          )
          .all(id) as PublicationRow[]
      ).map((item) => ({
        id: item.id,
        platform: item.platform,
        revisionId: item.revision_id,
        metadata: JSON.parse(item.metadata),
        exportPath: item.export_path,
        url: item.url,
        createdAt: item.created_at,
        publishedAt: item.published_at,
      })),
    }
  }
  private current(id: string, expected: number) {
    const project = this.get(id)
    if (project.archived) throw new Error('项目已归档，请先恢复')
    if (project.revision !== expected) throw new Error('项目已更新，请刷新后重试')
    return project
  }
  private dependencies(project: VideoProject, stage: VideoStage) {
    if (!stageUnlocked(project, stage)) throw new Error('前置步骤尚未审核通过或已经过期')
    return fingerprint(workflowDependencies(project, stage).map((item) => project.stages[item]!.id))
  }
  private request(id: string, requestId: string, value: unknown) {
    if (typeof requestId !== 'string' || !requestId || requestId.length > 120)
      throw new Error('缺少请求 ID')
    const hash = fingerprint(value)
    const previous = this.db
      .prepare('SELECT * FROM video_workflow_requests WHERE request_id=?')
      .get(requestId) as { project_id: string; fingerprint: string } | undefined
    if (previous) {
      if (previous.project_id !== id || previous.fingerprint !== hash)
        throw new Error('请求 ID 已用于不同操作')
      return true
    }
    this.db.prepare('INSERT INTO video_workflow_requests VALUES(?,?,?)').run(requestId, id, hash)
    return false
  }
  private bump(id: string) {
    this.db
      .prepare('UPDATE video_projects SET revision=revision+1, updated_at=? WHERE id=?')
      .run(new Date().toISOString(), id)
  }
  save(
    id: string,
    stage: VideoStage,
    value: unknown,
    expected: number,
    requestId: string,
    note = '',
    recordEdit = true,
  ): VideoProject {
    return this.db.transaction(() => {
      const payload = validatePayload(stage, value)
      if (
        (stage === 'render' || stage === 'roughcut') &&
        (payload as StagePayloads['render']).imported
      )
        throw new Error('外部成片只能通过专用导入流程创建')
      if (this.request(id, requestId, ['save', stage, payload])) return this.get(id)
      const project = this.current(id, expected)
      const dependencies = this.dependencies(project, stage)
      if (stage === 'roughcut' || stage === 'render') {
        const rendered = payload as StagePayloads['roughcut']
        const source = rendered.sourceStoryboard
          ? (project.history.find(
              (item) => item.id === rendered.sourceStoryboard && item.stage === 'storyboard',
            )?.payload as StagePayloads['storyboard'] | undefined)
          : stageValue(project, 'storyboard')
        const frame = videoFrame(source?.format)
        if (!source || rendered.width !== frame.width || rendered.height !== frame.height)
          throw new Error('冻结工程画幅与来源分镜不一致，请重新生成粗剪')
      }
      if (
        (stage === 'roughcut' || stage === 'render') &&
        (payload as { motion?: MotionPlan }).motion
      ) {
        const source = payload as StagePayloads['roughcut']
        const storyboard = (
          source.sourceStoryboard
            ? project.history.find(
                (item) => item.id === source.sourceStoryboard && item.stage === 'storyboard',
              )?.payload
            : project.stages.storyboard?.payload
        ) as StagePayloads['storyboard'] | undefined
        const audio = (
          source.sourceAudio
            ? project.history.find(
                (item) => item.id === source.sourceAudio && item.stage === 'audio',
              )?.payload
            : project.stages.audio?.payload
        ) as StagePayloads['audio'] | undefined
        if (!storyboard || !audio) throw new Error('冻结工程的来源分镜或配音版本不存在')
        validateMotionPlan(
          (payload as { motion: MotionPlan }).motion,
          storyboard.scenes.map((scene) => ({
            id: scene.id,
            duration: audio.tracks
              .filter((track) => track.sceneId === scene.id)
              .reduce((total, track) => total + track.duration, 0),
          })),
          { allowEmpty: true },
        )
      }
      if (stage === 'narration') {
        const storyboard = project.stages.storyboard!.payload as { scenes: { id: string }[] }
        const narration = payload as { scenes: { id: string }[] }
        if (
          storyboard.scenes.map((scene) => scene.id).join() !==
          narration.scenes.map((scene) => scene.id).join()
        )
          throw new Error('口播必须逐镜对应已审核分镜，顺序和 ID 均需一致')
      }
      const version = (project.stages[stage]?.version ?? 0) + 1
      this.db
        .prepare(
          'INSERT INTO video_workflow_revisions(id,project_id,stage,version,payload,dependencies,status,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .run(
          randomUUID(),
          id,
          stage,
          version,
          JSON.stringify(payload),
          dependencies,
          'review',
          note.slice(0, 2000),
          new Date().toISOString(),
        )
      for (const dependent of VIDEO_STAGES.slice(VIDEO_STAGES.indexOf(stage) + 1))
        this.db
          .prepare(
            "UPDATE video_workflow_revisions SET status='stale' WHERE project_id=? AND stage=?",
          )
          .run(id, dependent)
      if (recordEdit && stage === 'storyboard' && project.stages.storyboard) {
        const changes = sceneChanges(stage, project.stages.storyboard.payload, payload)
        if (changes.length) {
          const sceneIds = [...new Set(changes.map((change) => change.sceneId))]
          const operation: WorkflowOperation = {
            action: changes.every(
              (change) => change.field === 'materialFallback' && change.after !== 'null',
            )
              ? 'accept-illustration'
              : 'scene-edit',
            ...(sceneIds.length === 1
              ? {
                  sceneId: sceneIds[0],
                  sceneTitle: changes[0].title,
                  sceneNumber:
                    (payload as StagePayloads['storyboard']).scenes.findIndex(
                      (scene) => scene.id === sceneIds[0],
                    ) + 1 || undefined,
                }
              : {}),
            sourceVersion: project.stages.storyboard.version,
            resultVersion: version,
            changes,
          }
          const now = new Date().toISOString()
          this.db
            .prepare(
              'INSERT INTO video_workflow_jobs(id,project_id,stage,request_id,expected_revision,executor,input_fingerprint,state,phase,operation,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
            )
            .run(
              randomUUID(),
              id,
              stage,
              `edit:${requestId}`,
              expected,
              'manual-edit',
              fingerprint(payload),
              'succeeded',
              '分镜修改已保存，等待人工审核',
              JSON.stringify(operation),
              now,
              now,
            )
        }
      }
      this.bump(id)
      return this.get(id)
    })()
  }
  approve(
    id: string,
    stage: VideoStage,
    revisionId: string,
    expected: number,
    requestId: string,
    note = '',
  ): VideoProject {
    return this.db.transaction(() => {
      if (this.request(id, requestId, ['approve', stage, revisionId])) return this.get(id)
      const project = this.current(id, expected),
        current = project.stages[stage]
      if (!current || current.id !== revisionId) throw new Error('审核版本已发生变化，请重新检查')
      if (current.status === 'stale' || current.dependencies !== this.dependencies(project, stage))
        throw new Error('前置审核已过期，请重新生成或保存')
      this.db
        .prepare(
          "UPDATE video_workflow_revisions SET status='approved',approved_at=?,note=? WHERE id=?",
        )
        .run(new Date().toISOString(), note.slice(0, 2000), revisionId)
      this.bump(id)
      return this.get(id)
    })()
  }
  archive(id: string, archived: boolean, expected: number) {
    return this.db.transaction(() => {
      const project = this.get(id)
      if (project.revision !== expected) throw new Error('请刷新项目')
      if (project.jobs.some((job) => job.state === 'running'))
        throw new Error('请先取消运行中的任务')
      this.db.prepare('UPDATE video_projects SET archived=? WHERE id=?').run(archived ? 1 : 0, id)
      this.bump(id)
      return this.get(id)
    })()
  }
  startJob(
    id: string,
    stage: VideoStage,
    expected: number,
    requestId: string,
    executor: string,
    inputFingerprint = '',
    operation?: WorkflowOperation,
    renderEngine?: VideoRenderEngine,
  ): WorkflowJob {
    if (
      renderEngine !== undefined &&
      (!['roughcut', 'render'].includes(stage) || !isVideoRenderEngine(renderEngine))
    )
      throw new Error('任务合成引擎无效')
    return this.db.transaction(() => {
      const previous = this.db
        .prepare('SELECT * FROM video_workflow_jobs WHERE request_id=?')
        .get(requestId) as JobRow | undefined
      if (previous) {
        if (
          previous.project_id !== id ||
          previous.stage !== stage ||
          previous.executor !== executor ||
          (previous.render_engine ?? undefined) !== renderEngine ||
          previous.input_fingerprint !== inputFingerprint
        )
          throw new Error('请求 ID 已用于其他任务')
        return this.mapJob(previous)
      }
      const project = this.current(id, expected)
      this.dependencies(project, stage)
      if (project.jobs.some((job) => job.state === 'running'))
        throw new Error('项目已有运行中的任务，请等待或取消')
      const jobId = randomUUID(),
        now = new Date().toISOString()
      this.db
        .prepare(
          'INSERT INTO video_workflow_jobs(id,project_id,stage,request_id,expected_revision,executor,input_fingerprint,state,phase,error,created_at,updated_at,operation,render_engine) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          jobId,
          id,
          stage,
          requestId,
          expected,
          executor,
          inputFingerprint,
          'running',
          '准备任务',
          null,
          now,
          now,
          operation ? JSON.stringify(operation) : null,
          renderEngine ?? null,
        )
      return this.job(jobId)!
    })()
  }
  private mapJob(row: JobRow): WorkflowJob {
    return {
      id: row.id,
      projectId: row.project_id,
      stage: row.stage,
      requestId: row.request_id,
      expectedRevision: row.expected_revision,
      executor: row.executor,
      ...(row.render_engine ? { renderEngine: row.render_engine } : {}),
      state: row.state,
      phase: row.phase,
      error: row.error,
      ...(row.audio_progress ? { audioProgress: JSON.parse(row.audio_progress) } : {}),
      kind: row.kind,
      ...(row.motion_plan ? { motionPlan: JSON.parse(row.motion_plan) } : {}),
      ...(row.operation ? { operation: JSON.parse(row.operation) } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
  job(id: string) {
    const row = this.db.prepare('SELECT * FROM video_workflow_jobs WHERE id=?').get(id) as
      | JobRow
      | undefined
    return row ? this.mapJob(row) : undefined
  }
  updateJob(id: string, value: Partial<Pick<WorkflowJob, 'state' | 'phase' | 'error'>>) {
    const job = this.job(id)
    if (!job) throw new Error('任务不存在')
    const next = { ...job, ...value }
    this.db
      .prepare('UPDATE video_workflow_jobs SET state=?,phase=?,error=?,updated_at=? WHERE id=?')
      .run(next.state, next.phase, next.error, new Date().toISOString(), id)
    return this.job(id)!
  }
  updateAudioProgress(id: string, progress: AudioProgress) {
    const job = this.job(id)
    if (!job || job.state !== 'running' || job.stage !== 'audio') throw new Error('配音任务已结束')
    if (this.get(job.projectId).revision !== job.expectedRevision) throw new Error('输入已过期')
    this.db
      .prepare('UPDATE video_workflow_jobs SET audio_progress=?,updated_at=? WHERE id=?')
      .run(JSON.stringify(progress), new Date().toISOString(), id)
  }
  markMotionJob(id: string) {
    this.db
      .prepare("UPDATE video_workflow_jobs SET kind='motion-plan' WHERE id=? AND state='running'")
      .run(id)
  }
  finishMotionPlan(id: string, value: MotionPlan) {
    const job = this.job(id)
    if (!job || job.state !== 'running' || job.kind !== 'motion-plan')
      throw new Error('修改计划任务已结束')
    const project = renderSourceProject(this.current(job.projectId, job.expectedRevision))
    const scenes = stageValue(project, 'storyboard')!.scenes.map((scene) => ({
      id: scene.id,
      duration: stageValue(project, 'audio')!
        .tracks.filter((track) => track.sceneId === scene.id)
        .reduce((total, track) => total + track.duration, 0),
    }))
    const plan = validateMotionPlan(value, scenes)
    this.db
      .prepare(
        "UPDATE video_workflow_jobs SET motion_plan=?,state='succeeded',phase='修改计划已生成，等待确认',updated_at=? WHERE id=?",
      )
      .run(JSON.stringify(plan), new Date().toISOString(), id)
    return this.job(id)!
  }
  motionPlan(projectId: string, id: string, expected: number) {
    const job = this.job(id)
    this.current(projectId, expected)
    if (
      !job ||
      job.projectId !== projectId ||
      job.expectedRevision !== expected ||
      job.kind !== 'motion-plan' ||
      job.state !== 'succeeded' ||
      !job.motionPlan
    )
      throw new Error('修改计划已过期或不属于当前项目，请重新提出修改')
    return job.motionPlan
  }
  discardMotionPlans(projectId: string, expected: number) {
    return this.db.transaction(() => {
      const project = this.current(projectId, expected)
      if (project.jobs.some((job) => job.state === 'running'))
        throw new Error('请先等待或取消正在执行的任务')
      this.db
        .prepare(
          "UPDATE video_workflow_jobs SET state='cancelled',phase='已放弃修改计划，保留原视频与历史',updated_at=? WHERE project_id=? AND kind='motion-plan' AND state<>'cancelled'",
        )
        .run(new Date().toISOString(), projectId)
      const roughcut = project.stages.roughcut
      if (roughcut?.status === 'stale' && stageUnlocked(project, 'roughcut')) {
        const now = new Date().toISOString()
        this.db
          .prepare(
            "UPDATE video_workflow_revisions SET status='review',dependencies=?,approved_at=NULL,note=? WHERE id=?",
          )
          .run(
            this.dependencies(project, 'roughcut'),
            '已取消修改计划，沿用原粗剪的画面、配音、字幕和时长，等待重新审核；后续上游修改未应用到此视频',
            roughcut.id,
          )
        this.db
          .prepare(
            "UPDATE video_workflow_revisions SET status='stale' WHERE project_id=? AND stage IN ('render','publish')",
          )
          .run(projectId)
        this.db
          .prepare(
            'INSERT INTO video_workflow_jobs(id,project_id,stage,request_id,expected_revision,executor,input_fingerprint,state,phase,operation,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            randomUUID(),
            projectId,
            'roughcut',
            `retain-roughcut:${projectId}:${expected}`,
            expected,
            'reuse-roughcut',
            fingerprint(roughcut.payload),
            'succeeded',
            `修改计划已取消，保留粗剪 v${roughcut.version}，等待审核；未重新合成视频`,
            JSON.stringify({
              action: 'reuse-roughcut',
              sourceVersion: roughcut.version,
              resultVersion: roughcut.version,
            } satisfies WorkflowOperation),
            now,
            now,
          )
        this.bump(projectId)
      }
      return this.get(projectId)
    })()
  }
  templates(): VideoStyleTemplate[] {
    const rows = this.db
      .prepare('SELECT * FROM video_style_templates ORDER BY created_at DESC,rowid DESC')
      .all() as {
      id: string
      name: string
      description: string
      source_project_id: string
      source_revision_id: string
      payload: string
      created_at: string
    }[]
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      sourceProjectId: row.source_project_id,
      sourceRevisionId: row.source_revision_id,
      createdAt: row.created_at,
      version: 1,
      ...JSON.parse(row.payload),
    }))
  }
  template(id: string) {
    const template = this.templates().find((item) => item.id === id)
    if (!template) throw new Error('风格模板不存在')
    return template
  }
  saveTemplate(projectId: string, expected: number, name: string, description: string) {
    const project = this.current(projectId, expected)
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 80 ||
      typeof description !== 'string' ||
      description.length > 1000
    )
      throw new Error('模板名称需为1–80字，描述最多1000字')
    if (project.stages.render?.status !== 'approved' || !stageUnlocked(project, 'render'))
      throw new Error('请先审核通过当前正片，再保存模板')
    const render = stageValue(project, 'render')!
    const storyboard = stageValue(project, 'storyboard')!
    const id = randomUUID()
    this.db.prepare('INSERT INTO video_style_templates VALUES(?,?,?,?,?,?,?)').run(
      id,
      name.trim(),
      description.trim(),
      projectId,
      project.stages.render.id,
      JSON.stringify({
        storyboard: { mode: 'agent', template: storyboard.template, scenes: storyboard.scenes },
        cover: render.cover,
        ...(render.motion ? { motion: render.motion } : {}),
      }),
      new Date().toISOString(),
    )
    return this.template(id)
  }
  finishJob(id: string, payload: unknown): VideoProject {
    const job = this.job(id)
    if (!job || job.state !== 'running') throw new Error('任务已取消或结束')
    if (this.get(job.projectId).revision !== job.expectedRevision) {
      this.updateJob(id, { state: 'stale', phase: '输入已过期，结果未应用' })
      throw new Error('输入已过期，请重新生成')
    }
    return this.db.transaction(() => {
      const previous = this.get(job.projectId).stages[job.stage]
      const result = this.save(
        job.projectId,
        job.stage,
        payload,
        job.expectedRevision,
        `job:${id}`,
        job.operation?.action === 'reuse-narration'
          ? `沿用口播 v${job.operation.sourceVersion}，关联当前已审核分镜`
          : job.operation?.action === 'reuse-audio'
            ? `从分段配音 v${job.operation.sourceVersion} 切换`
            : job.operation?.sceneId
              ? `由 ${job.executor} 仅修改 ${job.operation.sceneTitle ?? job.operation.sceneId}`
              : `由 ${job.executor} 生成`,
        false,
      )
      if (job.operation) {
        const revision = result.stages[job.stage]!
        this.db.prepare('UPDATE video_workflow_jobs SET operation=? WHERE id=?').run(
          JSON.stringify({
            ...job.operation,
            resultVersion: revision.version,
            changes: sceneChanges(job.stage, previous?.payload, revision.payload),
          }),
          id,
        )
      }
      this.updateJob(id, { state: 'succeeded', phase: '已完成，等待人工审核' })
      return { ...result, jobs: this.get(job.projectId).jobs }
    })()
  }
  recover() {
    this.db
      .prepare(
        "UPDATE video_workflow_jobs SET state='interrupted',phase='应用退出，任务已中断',updated_at=? WHERE state='running'",
      )
      .run(new Date().toISOString())
  }
  registerFile(projectId: string, file: WorkflowFile) {
    this.db
      .prepare('INSERT INTO video_workflow_files VALUES(?,?,?,?,?,?)')
      .run(file.id, projectId, file.path, file.sha256, file.size, file.mime)
    return file
  }
  file(projectId: string, id: string) {
    return this.db
      .prepare(
        'SELECT id,path,sha256,size,mime FROM video_workflow_files WHERE project_id=? AND id=?',
      )
      .get(projectId, id) as WorkflowFile | undefined
  }
  publication(
    projectId: string,
    platform: VideoPlatform,
    revisionId: string,
    metadata: PlatformMetadata,
    exportPath: string,
  ): PublicationRecord {
    const project = this.get(projectId)
    if (
      project.stages.publish?.status !== 'approved' ||
      project.stages.publish.id !== revisionId ||
      !stageUnlocked(project, 'publish')
    )
      throw new Error('发布信息或成片审核已过期')
    const id = randomUUID()
    this.db
      .prepare(
        'INSERT INTO video_workflow_publications(id,project_id,platform,revision_id,metadata,export_path,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        id,
        projectId,
        platform,
        revisionId,
        JSON.stringify(metadata),
        exportPath,
        new Date().toISOString(),
      )
    return this.get(projectId).publications.find((item) => item.id === id)!
  }
  receipt(projectId: string, id: string, url: string) {
    const publication = this.get(projectId).publications.find((item) => item.id === id)
    if (!publication) throw new Error('发布包不存在')
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new Error('请输入有效发布链接')
    }
    const domains =
      publication.platform === 'bilibili'
        ? ['bilibili.com', 'b23.tv']
        : ['douyin.com', 'iesdouyin.com']
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      !domains.some(
        (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
      )
    )
      throw new Error('请填写对应平台的 HTTPS 链接')
    this.db
      .prepare('UPDATE video_workflow_publications SET url=?,published_at=? WHERE id=?')
      .run(parsed.href, new Date().toISOString(), id)
    return this.get(projectId)
  }
}
