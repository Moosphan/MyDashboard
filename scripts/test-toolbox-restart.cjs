const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const electron = require('electron')

const temporaryUserData = mkdtempSync(join(tmpdir(), 'mydashboard-toolbox-restart-'))
try {
  for (const phase of ['--restart-write', '--restart-read']) {
    const result = spawnSync(electron, [resolve('scripts/test-toolbox-electron.cjs'), phase], {
      env: { ...process.env, TOOLBOX_TEST_USER_DATA: temporaryUserData },
      encoding: 'utf8',
      timeout: 30_000,
    })
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    assert.ifError(result.error)
    assert.equal(result.status, 0, phase + ' must succeed in its own Electron process')
  }
  console.log('PASS: separate Electron processes restore layout and discard usage snapshots')
} finally {
  rmSync(temporaryUserData, { recursive: true, force: true })
}
