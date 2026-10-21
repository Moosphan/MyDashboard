import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { EncryptedPortalStore } from '../src/main/services/toolbox/encrypted-store'

test('encrypted files restore values, reject corruption and never fall back to plaintext', () => {
  const directory = mkdtempSync(join(tmpdir(), 'toolbox-encryption-test-'))
  const file = join(directory, 'portal-cache.enc')
  const key = randomBytes(32)
  const encryption = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: (value: string) => {
      const nonce = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, nonce)
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
      return Buffer.concat([nonce, cipher.getAuthTag(), encrypted])
    },
    decryptString: (value: Buffer) => {
      const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12))
      decipher.setAuthTag(value.subarray(12, 28))
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8')
    },
  }
  try {
    const store = new EncryptedPortalStore(file, encryption, 'darwin')
    assert.equal(store.load(), null)
    const value = { cookies: [{ value: 'sensitive-test-token' }] }
    store.save(value)
    assert.equal(readFileSync(file).includes(Buffer.from('sensitive-test-token')), false)
    assert.deepEqual(new EncryptedPortalStore(file, encryption, 'darwin').load(), value)
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600)
    const unsupported = new EncryptedPortalStore(file, { ...encryption, getSelectedStorageBackend: () => 'basic_text' }, 'linux')
    assert.equal(unsupported.available, false)
    assert.equal(unsupported.load(), null)
    assert.throws(() => unsupported.save(value))
    const unavailable = new EncryptedPortalStore(file, { ...encryption, isEncryptionAvailable: () => false }, 'darwin')
    assert.equal(unavailable.available, false)
    assert.throws(() => unavailable.save(value))
    assert.deepEqual(store.load(), value)
    writeFileSync(file, 'corrupt encrypted data')
    assert.throws(() => store.load())
    store.clear()
    assert.equal(existsSync(file), false)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
