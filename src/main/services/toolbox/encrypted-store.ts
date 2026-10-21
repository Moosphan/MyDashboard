import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

interface EncryptionProvider {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
  getSelectedStorageBackend(): string
}

export class EncryptedPortalStore {
  readonly available: boolean

  constructor(private readonly path: string, private readonly encryption: EncryptionProvider, platform: NodeJS.Platform) {
    this.available = encryption.isEncryptionAvailable() && (platform !== 'linux' || ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(encryption.getSelectedStorageBackend()))
  }

  load(): unknown {
    if (!this.available) return null
    let encrypted: Buffer
    try { encrypted = readFileSync(this.path) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    return JSON.parse(this.encryption.decryptString(encrypted))
  }

  save(record: unknown): void {
    if (!this.available) throw new Error('系统加密存储不可用')
    const encrypted = this.encryption.encryptString(JSON.stringify(record))
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, encrypted, { mode: 0o600, flag: 'wx' })
      renameSync(temporary, this.path)
    } finally { rmSync(temporary, { force: true }) }
  }

  clear(): void {
    rmSync(this.path, { force: true })
  }
}
