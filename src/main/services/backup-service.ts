import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, normalize, resolve } from 'node:path'

const BACKUP_PATHS = ['database/dashboard.db', 'articles', 'notes', 'drafts', 'media']

export interface BackupManifestFile {
  path: string
  size: number
  sha256: string
}

export interface BackupManifest {
  formatVersion: 1
  createdAt: string
  files: BackupManifestFile[]
}

export interface BackupResult {
  backupPath: string
  manifest: BackupManifest
}

function hashFile(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function listFiles(rootPath: string, relativePath: string): string[] {
  const fullPath = join(rootPath, relativePath)
  if (!existsSync(fullPath)) return []
  if (statSync(fullPath).isFile()) return [relativePath]

  return readdirSync(fullPath, { withFileTypes: true })
    .filter(entry => entry.name !== '.trash')
    .flatMap((entry) => listFiles(rootPath, join(relativePath, entry.name)))
}

function ensureSafeRelativePath(filePath: string): void {
  const normalizedPath = normalize(filePath)
  if (
    !filePath ||
    filePath.includes('\0') ||
    filePath.startsWith('/') ||
    normalizedPath !== filePath ||
    normalizedPath === '..' ||
    normalizedPath.startsWith('../') ||
    normalizedPath.startsWith('..\\')
  ) {
    throw new Error(`Unsafe backup path: ${filePath}`)
  }
}

function copyPayload(sourceRoot: string, backupRoot: string, filePath: string): void {
  const sourcePath = join(sourceRoot, filePath)
  const destinationPath = join(backupRoot, filePath)
  mkdirSync(resolve(destinationPath, '..'), { recursive: true })
  copyFileSync(sourcePath, destinationPath)
}

export function createBackup(
  sourceRoot: string,
  destinationRoot: string,
  options: { now?: Date } = {},
): BackupResult {
  const createdAt = (options.now ?? new Date()).toISOString()
  const backupName = `mydashboard-backup-${createdAt.replace(/[-:.TZ]/g, '')}`
  const backupPath = join(destinationRoot, backupName)
  mkdirSync(backupPath, { recursive: true })

  const paths = Array.from(new Set(BACKUP_PATHS.flatMap((path) => listFiles(sourceRoot, path)))).sort()
  const files = paths.map((path): BackupManifestFile => ({
    path,
    size: statSync(join(sourceRoot, path)).size,
    sha256: hashFile(join(sourceRoot, path)),
  }))
  const manifest: BackupManifest = { formatVersion: 1, createdAt, files }

  for (const file of files) copyPayload(sourceRoot, backupPath, file.path)
  writeFileSync(join(backupPath, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  return { backupPath, manifest }
}

export function validateBackup(backupPath: string): BackupManifest {
  const manifestPath = join(backupPath, 'manifest.json')
  if (!existsSync(manifestPath)) throw new Error('Backup manifest is missing')

  let manifest: BackupManifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BackupManifest
  } catch {
    throw new Error('Backup manifest is invalid')
  }

  if (manifest.formatVersion !== 1 || !Array.isArray(manifest.files) || typeof manifest.createdAt !== 'string') {
    throw new Error('Backup manifest is invalid')
  }

  const seen = new Set<string>()
  for (const file of manifest.files) {
    if (!file || typeof file.path !== 'string' || seen.has(file.path)) throw new Error('Backup manifest is invalid')
    ensureSafeRelativePath(file.path)
    seen.add(file.path)
    const filePath = join(backupPath, file.path)
    if (!existsSync(filePath) || !statSync(filePath).isFile()) throw new Error(`Backup file is missing: ${file.path}`)
    if (statSync(filePath).size !== file.size || hashFile(filePath) !== file.sha256) {
      throw new Error(`Backup file hash mismatch: ${file.path}`)
    }
  }

  return manifest
}

export function restoreBackup(backupPath: string, targetRoot: string): BackupManifest {
  const manifest = validateBackup(backupPath)
  for (const file of manifest.files) copyPayload(backupPath, targetRoot, file.path)
  return manifest
}
