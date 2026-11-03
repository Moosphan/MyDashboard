const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { createDailyRuntime } = require('./daily-runtime.cjs')

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-daily-runtime-'))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src/example.ts'), 'export const synthetic = 1')
  let failBuild = false
  let launches = 0
  let running = false
  const commands = []
  const runtime = createDailyRuntime({
    root,
    build: async directory => {
      if (failBuild) throw new Error('synthetic build failure')
      for (const file of ['main/index.js', 'preload/index.js', 'renderer/index.html']) {
        const path = join(directory, 'out', file)
        mkdirSync(require('node:path').dirname(path), { recursive: true })
        writeFileSync(path, 'synthetic build')
      }
    },
    launch: async () => { launches++; running = true },
    control: async (_record, command) => {
      commands.push(command)
      if (!running) return false
      if (command === 'stop') running = false
      return true
    },
    retireDevelopment: async () => {},
  })
  return { root, runtime, commands, launches: () => launches, fail: () => { failBuild = true } }
}

test('failed build keeps last active immutable release', async () => {
  const item = fixture()
  try {
    const first = await item.runtime.build()
    item.fail()
    await assert.rejects(item.runtime.build(), /synthetic build failure/)
    assert.equal(item.runtime.active().id, first.id)
    assert.ok(existsSync(join(first.directory, 'out/main/index.js')))
  } finally { rmSync(item.root, { recursive: true, force: true }) }
})

test('start coalesces existing process and rejects stale sources until rebuilt', async () => {
  const item = fixture()
  try {
    await item.runtime.build()
    await item.runtime.start()
    await item.runtime.start()
    assert.equal(item.launches(), 1)
    writeFileSync(join(item.root, 'src/example.ts'), 'export const synthetic = 2')
    await assert.rejects(item.runtime.start(), /daily:build/)
    await item.runtime.build()
    await item.runtime.restart()
    assert.equal(item.launches(), 2)
    assert.ok(item.commands.includes('stop'))
    await item.runtime.stop()
    await item.runtime.stop()
  } finally { rmSync(item.root, { recursive: true, force: true }) }
})

test('foreign checkout control record is never contacted', async () => {
  const item = fixture()
  try {
    await item.runtime.build()
    writeFileSync(join(item.root, '.daily-runtime/running.json'), JSON.stringify({ root: 'foreign-checkout', token: 'synthetic' }))
    await assert.rejects(item.runtime.stop(), /checkout/)
    assert.equal(item.commands.length, 0)
    assert.equal(JSON.parse(readFileSync(join(item.root, '.daily-runtime/running.json'))).root, 'foreign-checkout')
  } finally { rmSync(item.root, { recursive: true, force: true }) }
})

test('unresponsive live process is retained without killing or replacing its record', async () => {
  const item = fixture()
  try {
    await item.runtime.build()
    writeFileSync(join(item.root, '.daily-runtime/running.json'), JSON.stringify({ root: require('node:fs').realpathSync(item.root), pid: process.pid }))
    await assert.rejects(item.runtime.stop(), /not responding/)
    assert.ok(existsSync(join(item.root, '.daily-runtime/running.json')))
  } finally { rmSync(item.root, { recursive: true, force: true }) }
})
