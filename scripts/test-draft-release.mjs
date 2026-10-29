import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareDraftRelease, uploadDraftAssets } from './upload-draft-release.mjs'

const environment = {
  GITHUB_REPOSITORY: 'owner/project',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_RUN_NUMBER: '65',
  GITHUB_RUN_ID: '12345',
  GITHUB_SERVER_URL: 'https://github.com',
}
const release = {
  id: 42,
  draft: true,
  tag_name: `ci-65-${'a'.repeat(12)}`,
  target_commitish: environment.GITHUB_SHA,
  html_url: 'https://github.com/owner/project/releases',
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'draft-release-'))
  for (const name of [
    'MyDashboard-0.1.0-arm64.dmg',
    'MyDashboard-0.1.0.dmg',
    'MyDashboard-0.1.0-arm64-mac.zip',
    'MyDashboard-0.1.0-mac.zip',
  ])
    writeFileSync(join(directory, name), 'installer ' + name)
  return { directory, close: () => rmSync(directory, { recursive: true, force: true }) }
}

test('creates one draft for the exact CI commit and reuses it on reruns', () => {
  let stored = []
  let creations = 0
  const run = (args, input) => {
    if (args.includes('POST')) {
      const body = JSON.parse(input)
      assert.equal(body.draft, true)
      assert.equal(body.target_commitish, environment.GITHUB_SHA)
      assert.equal(body.tag_name, release.tag_name)
      creations++
      stored = [release]
      return JSON.stringify(release)
    }
    assert.ok(args.includes('--paginate'))
    return JSON.stringify([stored])
  }
  assert.deepEqual(prepareDraftRelease(environment, run), release)
  assert.deepEqual(prepareDraftRelease(environment, run), release)
  assert.equal(creations, 1)
})

test('rejects pull requests, other refs and missing CI identity before any request', () => {
  for (const overrides of [
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REF: 'refs/heads/dev' },
    { GITHUB_SHA: 'main' },
    { GITHUB_RUN_ID: '' },
    { GITHUB_REPOSITORY: 'owner/project/extra' },
  ])
    assert.throws(() =>
      prepareDraftRelease({ ...environment, ...overrides }, () => {
        assert.fail('No API request allowed')
      }),
    )
})

test('never modifies a published release or a release targeting another commit', () => {
  for (const overrides of [{ draft: false }, { target_commitish: 'b'.repeat(40) }]) {
    assert.throws(
      () =>
        prepareDraftRelease(environment, () => JSON.stringify([[{ ...release, ...overrides }]])),
      /draft|commit/i,
    )
    const f = fixture()
    try {
      assert.throws(
        () =>
          uploadDraftAssets({ ...environment, DRAFT_RELEASE_ID: '42' }, f.directory, 'macos', () =>
            JSON.stringify({ ...release, ...overrides }),
          ),
        /draft|commit/i,
      )
    } finally {
      f.close()
    }
  }
})

test('uploads only mac installers and platform checksum to the guarded draft', () => {
  const f = fixture()
  writeFileSync(join(f.directory, 'credentials.env'), 'PRIVATE')
  writeFileSync(join(f.directory, 'MyDashboard-win.zip'), 'windows installer')
  const calls = []
  try {
    const result = uploadDraftAssets(
      { ...environment, DRAFT_RELEASE_ID: '42' },
      f.directory,
      'macos',
      (args) => {
        calls.push(args)
        return args[0] === 'api' ? JSON.stringify(release) : ''
      },
    )
    assert.equal(result.assets.length, 5)
    const upload = calls.find((args) => args[0] === 'release')
    assert.equal(upload[1], 'upload')
    assert.equal(upload[2], release.tag_name)
    assert.ok(upload.includes('--clobber'))
    assert.ok(!upload.some((arg) => arg.includes('credentials') || arg.includes('-win.zip')))
    assert.match(
      readFileSync(join(f.directory, 'SHA256SUMS-macos.txt'), 'utf8'),
      /^[a-f0-9]{64}  MyDashboard-/,
    )
    assert.equal(calls.filter((args) => args[0] === 'api').length, 2)
  } finally {
    f.close()
  }
})

test('missing architectures and symlink installers cannot be uploaded', () => {
  for (const mode of ['missing', 'symlink']) {
    const f = fixture()
    try {
      const path = join(f.directory, 'MyDashboard-0.1.0-arm64.dmg')
      rmSync(path)
      if (mode === 'symlink') symlinkSync(join(f.directory, 'MyDashboard-0.1.0.dmg'), path)
      assert.throws(
        () =>
          uploadDraftAssets(
            { ...environment, DRAFT_RELEASE_ID: '42' },
            f.directory,
            'macos',
            (args) => {
              assert.equal(args[0], 'api')
              return JSON.stringify(release)
            },
          ),
        /missing|regular/i,
      )
    } finally {
      f.close()
    }
  }
})

test('matches actual Windows and Linux builder names without mixing platform assets', () => {
  for (const [platform, names] of [
    ['windows', ['MyDashboard Setup 0.1.0.exe', 'MyDashboard-0.1.0-win.zip']],
    ['linux', ['MyDashboard-0.1.0.AppImage', 'my-dashboard_0.1.0_amd64.deb']],
  ]) {
    const f = fixture()
    try {
      for (const name of names) writeFileSync(join(f.directory, name), 'installer')
      const result = uploadDraftAssets(
        { ...environment, DRAFT_RELEASE_ID: '42' },
        f.directory,
        platform,
        (args) => (args[0] === 'api' ? JSON.stringify(release) : ''),
      )
      assert.equal(result.assets.length, 3)
      assert.deepEqual(
        result.assets.slice(0, 2),
        names.map((name) => join(f.directory, name)),
      )
    } finally {
      f.close()
    }
  }
})
