import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { VoiceJob, VoiceJobState, VoiceProfile, VoiceProfileRevision, VoiceRequest } from '../../../shared/voiceover'
import { VOICE_TERMINAL } from '../../../shared/voiceover'

interface JobRow {
  id: string; request_json: string; state: VoiceJobState; phase: string; revision: number
  attempt_id: string; audio_asset_id: number | null; error: string | null
  elapsed_seconds: number | null; created_at: string; updated_at: string
}
interface ProfileRow { id: string; name: string; current_revision: number; revisions_json: string; deleted_at: string | null }

export class VoiceRepository {
  constructor(readonly db: Database.Database) {}

  listJobs(limit = 100): VoiceJob[] {
    return (this.db.prepare('SELECT * FROM voice_jobs ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit) as JobRow[]).map(row => this.jobFromRow(row))
  }

  job(id: string): VoiceJob | undefined {
    const row = this.db.prepare('SELECT * FROM voice_jobs WHERE id = ?').get(id) as JobRow | undefined
    return row ? this.jobFromRow(row) : undefined
  }

  byRequest(id: string): VoiceJob | undefined {
    const row = this.db.prepare('SELECT * FROM voice_jobs WHERE client_request_id = ?').get(id) as JobRow | undefined
    return row ? this.jobFromRow(row) : undefined
  }

  createJob(request: VoiceRequest): VoiceJob {
    const existing = this.byRequest(request.clientRequestId)
    if (existing) return existing
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.prepare('INSERT INTO voice_jobs (id,client_request_id,request_json,state,phase,attempt_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, request.clientRequestId, JSON.stringify(request), 'queued', '等待生成', randomUUID(), now, now)
    return this.job(id)!
  }

  updateJob(id: string, changes: Partial<Pick<VoiceJob, 'state' | 'phase' | 'assetId' | 'error' | 'elapsedSeconds'>>): VoiceJob {
    const fields = { state: 'state', phase: 'phase', assetId: 'audio_asset_id', error: 'error', elapsedSeconds: 'elapsed_seconds' } as const
    const entries = Object.entries(changes).filter(([key, value]) => key in fields && value !== undefined)
    if (entries.length) {
      this.db.prepare(`UPDATE voice_jobs SET ${entries.map(([key]) => `${fields[key as keyof typeof fields]} = ?`).join(', ')}, revision = revision + 1, updated_at = ? WHERE id = ?`)
        .run(...entries.map(([, value]) => value), new Date().toISOString(), id)
    }
    const result = this.job(id)
    if (!result) throw new Error('任务不存在')
    return result
  }

  recover(): void {
    this.db.prepare(`UPDATE voice_jobs SET state = 'interrupted', phase = '应用退出，任务已中断，可重新生成', revision = revision + 1 WHERE state NOT IN (${VOICE_TERMINAL.map(() => '?').join(',')})`).run(...VOICE_TERMINAL)
  }

  profiles(includeDeleted = false): VoiceProfile[] {
    return (this.db.prepare(`SELECT * FROM voice_profiles ${includeDeleted ? '' : 'WHERE deleted_at IS NULL'} ORDER BY updated_at DESC`).all() as ProfileRow[]).map(row => this.profileFromRow(row))
  }

  profile(id: string): VoiceProfile | undefined {
    const row = this.db.prepare('SELECT * FROM voice_profiles WHERE id = ?').get(id) as ProfileRow | undefined
    return row ? this.profileFromRow(row) : undefined
  }

  saveProfile(input: Omit<VoiceProfileRevision, 'revision'> & { id?: string; name: string }): VoiceProfile {
    const previous = input.id ? this.profile(input.id) : undefined
    if (input.id && (!previous || previous.deletedAt)) throw new Error('音色不存在')
    const id = previous?.id ?? randomUUID()
    const revision = (previous?.currentRevision ?? 0) + 1
    const { name, transcript, referencePath, originalPath, sha256, duration, originalSha256, segment, preprocessingVersion } = input
    const reference = { transcript, referencePath, originalPath, sha256, duration, originalSha256, segment, preprocessingVersion }
    const revisions = [...(previous?.revisions ?? []), { ...reference, revision }]
    const now = new Date().toISOString()
    this.db.prepare('INSERT INTO voice_profiles (id,name,current_revision,revisions_json,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,current_revision=excluded.current_revision,revisions_json=excluded.revisions_json,updated_at=excluded.updated_at')
      .run(id, name, revision, JSON.stringify(revisions), now, now)
    return this.profile(id)!
  }

  deleteProfile(id: string): void {
    const busy = this.listJobs(10000).some(job => job.request.profileId === id && !VOICE_TERMINAL.includes(job.state))
    if (busy) throw new Error('音色仍被任务使用，请先取消任务')
    this.db.prepare('UPDATE voice_profiles SET deleted_at = ?, updated_at = ? WHERE id = ?').run(new Date().toISOString(), new Date().toISOString(), id)
  }

  private profileFromRow(row: ProfileRow): VoiceProfile {
    return { id: row.id, name: row.name, currentRevision: row.current_revision, revisions: JSON.parse(row.revisions_json), deletedAt: row.deleted_at }
  }

  private jobFromRow(row: JobRow): VoiceJob {
    return { id: row.id, request: JSON.parse(row.request_json), state: row.state, phase: row.phase, revision: row.revision, attemptId: row.attempt_id, assetId: row.audio_asset_id, error: row.error, elapsedSeconds: row.elapsed_seconds ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at }
  }
}
