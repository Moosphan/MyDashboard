import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { workflowCommand } from '../src/main/services/video-workflow/process'
import {
  prepareImageRecovery,
  recoverImageDownload,
} from '../src/main/services/video-workflow/image2-recovery'

test('persists generated URL before the CLI download fails without leaking credentials', async () => {
  const root = mkdtempSync(join(tmpdir(), 'image2-recovery-'))
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        data: [{ url: 'https://images.example/cover.png?signature=private' }],
        private_key: 'AUTH_SECRET',
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const recovery = prepareImageRecovery(root, {
      projectId: 'project',
      renderId: 'render',
      publishId: 'publish',
    })
    const port = (server.address() as { port: number }).port
    const cli = join(root, 'fake-image-cli.mjs')
    writeFileSync(
      cli,
      `const r=await fetch('http://127.0.0.1:${port}/v1/images/edits',{method:'POST',headers:{Authorization:'Bearer AUTH_SECRET'}});await r.json();throw new Error('Failed to download generated image: timeout')`,
    )
    await assert.rejects(
      workflowCommand(
        process.env.IMAGE2_TEST_RUNTIME || process.execPath,
        ['--import', recovery.preload, cli],
        {
          cwd: root,
        },
      ),
      /Failed to download generated image/,
    )
    const record = JSON.parse(readFileSync(join(root, 'result.json'), 'utf8'))
    assert.equal(record.url, 'https://images.example/cover.png?signature=private')
    assert.equal(record.projectId, 'project')
    assert.equal(record.renderId, 'render')
    assert.equal(record.publishId, 'publish')
    assert.equal(statSync(join(root, 'result.json')).mode & 0o777, 0o600)
    assert.ok(!readFileSync(join(root, 'result.json'), 'utf8').includes('AUTH_SECRET'))
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    rmSync(root, { recursive: true, force: true })
  }
})

test('recovers the same returned URL through desktop networking without generating again', async () => {
  const root = mkdtempSync(join(tmpdir(), 'image2-recovery-'))
  try {
    const png = Buffer.from('89504e470d0a1a0a0000000000000000', 'hex')
    writeFileSync(
      join(root, 'result.json'),
      JSON.stringify({ url: 'https://images.example/cover.png' }),
    )
    let requests = 0
    const restored = await recoverImageDownload(
      root,
      async (url, options) => {
        requests++
        assert.equal(url, 'https://images.example/cover.png')
        assert.equal(options.credentials, 'omit')
        return new Response(png)
      },
      new AbortController().signal,
    )
    assert.equal(requests, 1)
    assert.deepEqual(readFileSync(restored!), png)
    assert.equal(
      await recoverImageDownload(
        root,
        async () => {
          throw new Error('Unexpected fetch')
        },
        new AbortController().signal,
      ),
      restored,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('keeps recovery record and partial bytes on failure, and never treats partial data as an image', async () => {
  const root = mkdtempSync(join(tmpdir(), 'image2-recovery-'))
  try {
    writeFileSync(
      join(root, 'result.json'),
      JSON.stringify({ url: 'https://images.example/cover.png' }),
    )
    await assert.rejects(
      recoverImageDownload(
        root,
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]))
              },
              pull(controller) {
                controller.error(new Error('network interrupted'))
              },
            }),
          ),
        new AbortController().signal,
      ),
      /network interrupted/,
    )
    assert.deepEqual([...readFileSync(join(root, 'download.part'))], [1, 2, 3])
    assert.ok(!readdirSync(root).includes('original.png'))
    assert.ok(readdirSync(root).includes('result.json'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
