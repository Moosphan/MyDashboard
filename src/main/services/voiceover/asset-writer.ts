import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative } from 'node:path'
import { VoiceRepository } from '../../database/repositories/voice-repository'
import { VideoAssetRepository, type VideoAssetRow } from '../../database/repositories/video-asset-repository'
import { managedPath, readAudioData } from './media'
import { probeAudio } from './profile-store'

export class VoiceAssetStore {
  private migration: Promise<void> | null = null
  constructor(private root: string, private repository: VoiceRepository) {}

  list(trashed = false) {
    const rows = this.repository.db.prepare("SELECT * FROM video_assets WHERE type='audio' AND json_extract(metadata, '$.source') IN ('voiceover', 'legacy-voiceover') ORDER BY created_at DESC, id DESC").all() as VideoAssetRow[]
    return rows.filter(row => Boolean(JSON.parse(row.metadata).trashedAt) === trashed)
  }

  asset(id: number): VideoAssetRow {
    const row = new VideoAssetRepository(this.repository.db).findById(id)
    if (!row || row.type !== 'audio') throw new Error('音频素材不存在')
    return row
  }

  audio(id: number) {
    const asset = this.asset(id)
    if (JSON.parse(asset.metadata).trashedAt) throw new Error('音频已在回收区')
    return readAudioData(this.root, asset.file_path)
  }

  trash(id: number) {
    const asset = this.asset(id)
    const metadata = JSON.parse(asset.metadata)
    if (metadata.trashedAt) return
    if (metadata.source !== 'voiceover' && metadata.source !== 'legacy-voiceover') throw new Error('仅能回收受管生成音频')
    const original = managedPath(this.root, asset.file_path)
    const bundle = metadata.source === 'voiceover' && original.startsWith(join(this.root, 'media', 'audio', 'voiceover') + '/')
    const trash = managedPath(this.root, bundle ? `media/.trash/voice/${id}/${basename(original)}` : `media/.trash/voice/${id}${extname(original)}`)
    const moveFrom = bundle ? dirname(original) : original
    const moveTo = bundle ? dirname(trash) : trash
    mkdirSync(dirname(moveTo), { recursive: true })
    if (!existsSync(moveFrom)) throw new Error('音频文件不存在')
    renameSync(moveFrom, moveTo)
    try {
      new VideoAssetRepository(this.repository.db).update(id, { file_path: relative(this.root, trash), metadata: JSON.stringify({ ...metadata, trashBundle: bundle, trashedAt: new Date().toISOString(), originalPath: asset.file_path }) })
    } catch (error) { if (existsSync(moveTo)) renameSync(moveTo, moveFrom); throw error }
  }

  restore(id: number) {
    const asset = this.asset(id)
    const metadata = JSON.parse(asset.metadata)
    if (!metadata.trashedAt) return
    const original = managedPath(this.root, metadata.originalPath)
    const trash = managedPath(this.root, asset.file_path)
    const moveTo = metadata.trashBundle ? dirname(original) : original
    const moveFrom = metadata.trashBundle ? dirname(trash) : trash
    if (existsSync(moveTo)) throw new Error('原位置已有文件，无法覆盖')
    mkdirSync(dirname(moveTo), { recursive: true })
    renameSync(moveFrom, moveTo)
    const rest = { ...metadata }
    delete rest.trashedAt
    delete rest.originalPath
    delete rest.trashBundle
    try { new VideoAssetRepository(this.repository.db).update(id, { file_path: metadata.originalPath, metadata: JSON.stringify(rest) }) }
    catch (error) { renameSync(moveTo, moveFrom); throw error }
  }

  migrateLegacy(ffprobe: string): Promise<void> {
    this.migration ??= this.performLegacyMigration(ffprobe).finally(() => { this.migration = null })
    return this.migration
  }

  private async performLegacyMigration(ffprobe: string) {
    const directory = join(this.root, 'media', 'voiceover')
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !['.mp3', '.wav'].includes(extname(entry.name))) continue
      const path = join(directory, entry.name)
      const relativePath = relative(this.root, path)
      if (this.repository.db.prepare('SELECT id FROM video_assets WHERE file_path IN (?,?)').get(path, relativePath)) continue
      try {
        const info = await probeAudio(ffprobe, path)
        const hash = createHash('sha256').update(readFileSync(path)).digest('hex')
        const existing = this.list(true).concat(this.list()).some(asset => JSON.parse(asset.metadata).legacySha256 === hash)
        if (existing) continue
        new VideoAssetRepository(this.repository.db).create({ title: basename(path), type: 'audio', file_path: relativePath, file_format: extname(path).slice(1).toUpperCase(), file_size: statSync(path).size, duration_seconds: info.duration, tags: ['voiceover'], metadata: { schemaVersion: 1, source: 'legacy-voiceover', legacySha256: hash } })
      } catch { continue }
    }
  }
}
