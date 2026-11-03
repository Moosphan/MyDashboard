const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, openSync, closeSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { spawn } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const { createDailyRuntime, requestControl } = require('./daily-runtime.cjs')

const root = resolve(__dirname, '..')
const runtime = createDailyRuntime({ root })
const release = runtime.active()
assert.ok(release)
const fixture = mkdtempSync(join(tmpdir(), 'synthetic-daily-electron-'))
const profile = join(fixture, 'profile')
const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\synthetic-daily-${process.pid}` : join(tmpdir(), `synthetic-daily-${process.pid}.sock`)
const record = { root: require('node:fs').realpathSync(root), token: require('node:crypto').randomUUID(), endpoint }
const recordPath = join(fixture, 'control.json')
writeFileSync(recordPath, JSON.stringify(record))
const children = new Set()
async function launch(name) {
  const ready = join(fixture, name + '.json')
  const log = openSync(join(fixture, name + '.log'), 'w')
  const child = spawn(require('electron'), [join(__dirname, 'fixtures/daily-runtime-app.cjs')], {
    cwd: root, env: { ...process.env, MYDASHBOARD_USER_DATA: profile, MYDASHBOARD_DAILY_CONTROL: recordPath, DAILY_FIXTURE_RELEASE: release.directory, DAILY_FIXTURE_READY: ready }, stdio: ['ignore', log, log],
  })
  closeSync(log)
  children.add(child)
  child.once('exit', () => children.delete(child))
  for (let attempt = 0; attempt < 200; attempt++) {
    if (existsSync(ready)) return child
    if (child.exitCode !== null) throw new Error('Synthetic daily app exited before readiness')
    await delay(100)
  }
  throw new Error('Synthetic daily app readiness timed out')
}
async function stop(child) {
  assert.equal(await requestControl(record, 'stop'), true)
  for (let attempt = 0; attempt < 200 && child.exitCode === null; attempt++) await delay(50)
  assert.equal(child.exitCode, 0)
}
async function run() {
  try {
    const first = await launch('first')
    assert.equal(await requestControl(record, 'status'), true)
    const duplicate = spawn(require('electron'), [join(__dirname, 'fixtures/daily-runtime-app.cjs')], {
      cwd: root, env: { ...process.env, MYDASHBOARD_USER_DATA: profile, DAILY_FIXTURE_RELEASE: release.directory }, stdio: 'ignore',
    })
    await new Promise((resolveExit, reject) => {
      const timer = setTimeout(() => { duplicate.kill(); reject(new Error('Duplicate instance did not exit')) }, 10000)
      duplicate.once('exit', code => { clearTimeout(timer); assert.equal(code, 0); resolveExit() })
    })
    assert.equal(await requestControl(record, 'status'), true)
    await stop(first)
    const second = await launch('second')
    assert.equal(JSON.parse(readFileSync(join(fixture, 'second.json'))).restored, true)
    await stop(second)
    console.log('DAILY_ELECTRON_OK: local-file home, single instance, graceful process restart and draft persistence')
  } finally {
    for (const child of children) child.kill('SIGTERM')
    rmSync(endpoint, { force: true })
    rmSync(fixture, { recursive: true, force: true })
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
