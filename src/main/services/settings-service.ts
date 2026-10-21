import { ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { IPC_CHANNELS, DEFAULT_SETTINGS } from '@shared/constants'
import { getAbsolutePath } from './file-service'
import { encryptSecret, decryptSecret } from './secret-crypto'

const SENSITIVE_FIELDS = [
  'integrations.githubToken',
  'integrations.notionToken',
  'integrations.claudeApiKey',
]

function getSettingsPath(): string {
  return getAbsolutePath('config/settings.json')
}

/**
 * Walk each `SENSITIVE_FIELDS` dotted path and apply `transform` to the leaf
 * value when present and non-empty. Returns a shallow copy; the input is never
 * mutated.
 */
function transformSensitiveFields(
  settings: Record<string, unknown>,
  transform: (value: string) => string,
): Record<string, unknown> {
  const result = { ...settings }
  for (const field of SENSITIVE_FIELDS) {
    const segments = field.split('.')
    let obj: Record<string, unknown> = result
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]
      if (typeof obj[segment] !== 'object' || obj[segment] === null) {
        obj[segment] = {}
      }
      obj = obj[segment] as Record<string, unknown>
    }
    const leaf = segments[segments.length - 1]
    if (typeof obj[leaf] === 'string' && obj[leaf]) {
      obj[leaf] = transform(obj[leaf])
    }
  }
  return result
}

function readSettingsFile(): Record<string, unknown> {
  const path = getSettingsPath()
  if (!existsSync(path)) {
    return { ...DEFAULT_SETTINGS }
  }
  try {
    const content = readFileSync(path, 'utf-8')
    const settings = JSON.parse(content)
    // `?? value` only narrows the type — a non-empty string never decrypts to null.
    return transformSensitiveFields(settings, (value) => decryptSecret(value) ?? value)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function writeSettingsFile(settings: Record<string, unknown>): void {
  const path = getSettingsPath()
  const encrypted = transformSensitiveFields(settings, encryptSecret)
  writeFileSync(path, JSON.stringify(encrypted, null, 2), 'utf-8')
}

export function getStoredSetting(key: string): unknown {
  return readSettingsFile()[key]
}

export function setStoredSetting(key: string, value: unknown): void {
  const settings = readSettingsFile()
  settings[key] = value
  writeSettingsFile(settings)
}

export function registerSettingsIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
    try {
      const settings = readSettingsFile()
      return { success: true, data: settings }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, key: string) => {
    try {
      const settings = readSettingsFile()
      return { success: true, data: settings[key] }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    (_event, key: string, value: unknown) => {
      try {
        const settings = readSettingsFile()
        settings[key] = value
        writeSettingsFile(settings)
        return { success: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    },
  )
}
