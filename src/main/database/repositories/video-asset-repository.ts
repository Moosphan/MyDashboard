import type Database from 'better-sqlite3'
import { BaseRepository } from './base'

export interface VideoAssetRow {
  id: number
  title: string
  type: 'cover' | 'audio' | 'presentation' | 'other'
  file_path: string
  file_size: number | null
  file_format: string | null
  duration_seconds: number | null
  metadata: string
  tags: string
  status: 'ready' | 'processing' | 'draft'
  thumbnail_path: string | null
  created_at: string
  updated_at: string
}

export class VideoAssetRepository extends BaseRepository<VideoAssetRow> {
  constructor(db: Database.Database) {
    super(db, 'video_assets')
  }

  findByType(type: VideoAssetRow['type'], limit = 50): VideoAssetRow[] {
    return this.all<VideoAssetRow>(
      "SELECT * FROM video_assets WHERE type = ? AND json_extract(metadata, '$.trashedAt') IS NULL ORDER BY created_at DESC, id DESC LIMIT ?",
      type,
      limit,
    )
  }

  create(data: {
    title: string
    type: VideoAssetRow['type']
    file_path: string
    file_size?: number
    file_format?: string
    duration_seconds?: number
    tags?: string[]
    metadata?: Record<string, unknown>
  }): number {
    const result = this.run(
      `INSERT INTO video_assets (title, type, file_path, file_size, file_format, duration_seconds, tags, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      data.title,
      data.type,
      data.file_path,
      data.file_size ?? null,
      data.file_format ?? null,
      data.duration_seconds ?? null,
      JSON.stringify(data.tags ?? []),
      JSON.stringify(data.metadata ?? {}),
    )
    return Number(result.lastInsertRowid)
  }

  update(id: number, data: Partial<Omit<VideoAssetRow, 'id' | 'created_at' | 'updated_at'>>): boolean {
    const fields: string[] = []
    const values: unknown[] = []

    for (const [key, value] of Object.entries(data)) {
      if (!['title', 'type', 'file_path', 'file_size', 'file_format', 'duration_seconds', 'metadata', 'tags', 'status', 'thumbnail_path'].includes(key)) continue
      if (value !== undefined) {
        fields.push(`${key} = ?`)
        values.push(key === 'tags' && Array.isArray(value) ? JSON.stringify(value) : value)
      }
    }

    if (fields.length === 0) return false
    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)

    const result = this.run(`UPDATE video_assets SET ${fields.join(', ')} WHERE id = ?`, ...values)
    return result.changes > 0
  }
}
