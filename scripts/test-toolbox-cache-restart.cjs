const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const electron = require('electron')

const directory = mkdtempSync(join(tmpdir(), 'mydashboard-toolbox-encrypted-'))
try {
  for (const phase of ['--write', '--read']) {
    const result = spawnSync(electron, [resolve('scripts/test-toolbox-cache-electron.cjs'), phase], { env: { ...process.env, TOOLBOX_TEST_USER_DATA: directory }, encoding: 'utf8', timeout: 30_000 })
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    assert.ifError(result.error)
    assert.equal(result.status, 0, phase + ' must pass in a separate Electron process')
  }
} finally { rmSync(directory, { recursive: true, force: true }) }
