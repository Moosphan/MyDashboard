import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  renameSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] })
}

function identity(env) {
  if (
    !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) ||
    env.GITHUB_REF !== 'refs/heads/main'
  )
    throw new Error('Draft uploads require a trusted main build')
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY || '') ||
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') ||
    !/^\d+$/.test(env.GITHUB_RUN_NUMBER || '') ||
    !/^\d+$/.test(env.GITHUB_RUN_ID || '')
  )
    throw new Error('Missing or invalid CI identity')
  return {
    repo: env.GITHUB_REPOSITORY,
    commit: env.GITHUB_SHA,
    tag: `ci-${env.GITHUB_RUN_NUMBER}-${env.GITHUB_SHA.slice(0, 12)}`,
  }
}

function guard(release, source) {
  if (release.draft !== true)
    throw new Error('Refusing to modify a release that is no longer a draft')
  if (release.target_commitish !== source.commit || release.tag_name !== source.tag)
    throw new Error('Draft release commit or tag does not match this build')
  if (!Number.isSafeInteger(release.id) || release.id <= 0) throw new Error('Invalid release ID')
  return release
}

export function prepareDraftRelease(env, run = gh) {
  const source = identity(env)
  const pages = JSON.parse(run(['api', `repos/${source.repo}/releases`, '--paginate', '--slurp']))
  const existing = pages.flat().find((release) => release.tag_name === source.tag)
  if (existing) return guard(existing, source)
  const body = {
    tag_name: source.tag,
    target_commitish: source.commit,
    draft: true,
    name: `MyDashboard CI #${env.GITHUB_RUN_NUMBER} (${source.commit.slice(0, 7)})`,
    body: `Internal CI build. This release must remain a draft.\n\nCommit: ${source.commit}\nBuild: https://github.com/${source.repo}/actions/runs/${env.GITHUB_RUN_ID}\n\nInstallers are unsigned. macOS builds are not notarized by Apple. Each platform includes SHA-256 checksums.`,
  }
  return guard(
    JSON.parse(
      run(
        ['api', `repos/${source.repo}/releases`, '--method', 'POST', '--input', '-'],
        JSON.stringify(body),
      ),
    ),
    source,
  )
}

export function uploadDraftAssets(env, directory, platform, run = gh) {
  const source = identity(env)
  if (!/^\d+$/.test(env.DRAFT_RELEASE_ID || '')) throw new Error('Missing draft release ID')
  const endpoint = `repos/${source.repo}/releases/${env.DRAFT_RELEASE_ID}`
  guard(JSON.parse(run(['api', endpoint])), source)
  const patterns = {
    macos: [
      /^MyDashboard-[\d.]+-arm64\.dmg$/,
      /^MyDashboard-[\d.]+\.dmg$/,
      /^MyDashboard-[\d.]+-arm64-mac\.zip$/,
      /^MyDashboard-[\d.]+-mac\.zip$/,
    ],
    windows: [/^MyDashboard.*\.exe$/, /^MyDashboard.*-win\.zip$/],
    linux: [/^MyDashboard.*\.AppImage$/, /^my-dashboard.*\.deb$/],
  }[platform]
  if (!patterns) throw new Error('Invalid platform')
  const names = readdirSync(directory)
  const assets = patterns.map((pattern) => {
    const matches = names.filter((name) => pattern.test(name))
    if (matches.length !== 1)
      throw new Error(`Missing or ambiguous ${platform} installer: ${pattern}`)
    const file = join(directory, matches[0])
    const stat = lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || !stat.size)
      throw new Error('Installer must be a non-empty regular file')
    // GitHub replaces spaces in asset filenames with dots. Normalize first so
    // the checksum manifest uses the exact filenames users will download.
    const normalized = join(directory, matches[0].replaceAll(' ', '.'))
    if (normalized !== file) {
      if (existsSync(normalized)) throw new Error('Installer filename collision')
      renameSync(file, normalized)
    }
    return normalized
  })
  const checksum = join(directory, `SHA256SUMS-${platform}.txt`)
  writeFileSync(
    checksum,
    assets
      .map(
        (file) =>
          `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${file.slice(directory.length + 1)}\n`,
      )
      .join(''),
  )
  assets.push(checksum)
  // Check again immediately before mutation. Never call release edit or publish.
  guard(JSON.parse(run(['api', endpoint])), source)
  run(['release', 'upload', source.tag, ...assets, '--repo', source.repo, '--clobber'])
  return { assets }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'prepare') {
      const release = prepareDraftRelease(process.env)
      console.log(JSON.stringify({ id: release.id, url: release.html_url }))
    } else if (process.argv[2] === 'upload') {
      const result = uploadDraftAssets(
        process.env,
        resolve(process.argv[4] || 'dist'),
        process.argv[3],
      )
      console.log(
        `Uploaded ${result.assets.length} assets to draft release ${process.env.DRAFT_RELEASE_ID}`,
      )
    } else
      throw new Error('Usage: upload-draft-release.mjs prepare | upload <platform> [directory]')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
