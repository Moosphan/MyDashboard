const assert = require('node:assert/strict')
const Module = require('node:module')
require('tsx/cjs')
const { createGuestResetRadarSnapshot } = require('../src/shared/reset-radar.ts')
let publicReads = 0
let databaseReads = 0
const cookieResolves = []
let deferCookies = false
const now = Date.now
let clock = now()
Date.now = () => clock
class Repository {
  constructor() { databaseReads++ }
  getAccountSnapshot() { return null }
  getRecent() { return [] }
  saveAccountSnapshot() {}
  addUsageSample() {}
}
const load = Module._load
Module._load = function(request, parent, isMain) {
  if (request === 'electron') return { session: { fromPartition: () => ({ cookies: { get: async () => deferCookies ? new Promise(resolve => { cookieResolves.push(resolve) }) : [] } }) } }
  if (request === '../../database/connection') return { getDatabase: () => ({}) }
  if (request === '../../database/repositories/reset-radar-repository') return { ResetRadarRepository: Repository }
  if (request === './public-signal') return { fetchPublicResetRadarSnapshot: async () => { publicReads++; return createGuestResetRadarSnapshot() } }
  if (request === '../notification-service') return { sendDedupedNotification: () => {} }
  if (request === './account-session') return { CHATGPT_SESSION_PARTITION: 'synthetic', waitForChatGPTSession: async read => { await read(); return 'signed_out' } }
  return load.call(this, request, parent, isMain)
}
const service = require('../src/main/services/reset-radar/reset-radar-service.ts')
Module._load = load
async function run() {
  try {
    await service.getResetRadarSnapshot()
    assert.equal(publicReads, 1)
    clock += 11 * 60_000
    service.ingestChatGPTAccountUsage({ rate_limit: { primary_window: { used_percent: 10 } } }, null)
    await service.getResetRadarSnapshot()
    assert.equal(publicReads, 2, 'account updates cannot extend public-source cache forever')
    deferCookies = true
    const controller = new AbortController()
    const before = databaseReads
    const pending = service.getResetRadarSnapshot(false, controller.signal)
    const rejected = assert.rejects(pending, /cancelled/)
    await new Promise(resolve => setImmediate(resolve))
    controller.abort()
    deferCookies = false
    cookieResolves.splice(0).forEach(resolve => resolve([]))
    await rejected
    assert.equal(databaseReads, before, 'cancelled cookie lookup cannot touch closed database')
    console.log('RADAR_LIFECYCLE_OK: independent public cache and cancelled cookie lookup avoids database')
  } finally { Date.now = now }
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
