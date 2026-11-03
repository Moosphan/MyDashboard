const { mkdtempSync, readFileSync, rmSync, openSync, closeSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { spawn } = require('node:child_process')
const { createDailyRuntime } = require('./daily-runtime.cjs')

async function run() {
  const root = resolve(__dirname, '..')
  const directory = mkdtempSync(join(tmpdir(), 'synthetic-daily-benchmark-'))
  const release = createDailyRuntime({ root }).active()
  const { createServer } = await import('vite')
  const react = (await import('@vitejs/plugin-react')).default
  const server = await createServer({ configFile: false, root: join(root, 'src/renderer'), plugins: [react()], resolve: { alias: { '@': join(root, 'src/renderer'), '@shared': join(root, 'src/shared'), '@root': root } }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' })
  await server.listen()
  const url = `http://127.0.0.1:${server.httpServer.address().port}`
  const results = { built: [], development: [] }
  try {
    for (let sample = 0; sample < 3; sample++) for (const mode of ['built', 'development']) {
      const output = join(directory, mode + sample + '.json')
      const log = openSync(join(directory, mode + sample + '.log'), 'w')
      const env = { ...process.env, MYDASHBOARD_USER_DATA: join(directory, mode + sample), DAILY_FIXTURE_RELEASE: release.directory, DAILY_FIXTURE_READY: output, DAILY_BENCHMARK: '1' }
      delete env.MYDASHBOARD_DAILY_CONTROL
      delete env.ELECTRON_RENDERER_URL
      if (mode === 'development') env.ELECTRON_RENDERER_URL = url
      const child = spawn(require('electron'), [join(__dirname, 'fixtures/daily-runtime-app.cjs')], { cwd: root, env, stdio: ['ignore', log, log] })
      closeSync(log)
      await new Promise((done, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error('Synthetic benchmark timed out')) }, 60000)
        child.once('exit', code => {
          clearTimeout(timer)
          if (code === 0) done()
          else { writeFileSync(join(root, '.daily-runtime/benchmark-failure.log'), readFileSync(join(directory, mode + sample + '.log'))); reject(new Error('Synthetic benchmark failed')) }
        })
      })
      results[mode].push(JSON.parse(readFileSync(output)))
    }
    const aggregate = {}
    for (const [mode, samples] of Object.entries(results)) aggregate[mode] = Object.fromEntries(Object.keys(samples[0]).map(key => [key, Math.round(samples.map(sample => sample[key]).sort((left, right) => left-right)[1] * 10) / 10]))
    console.log(JSON.stringify({ benchmark: 'synthetic-empty-profile', samples: 3, metrics: 'median; renderer cold first sample, later shared Vite cache; no strict speed ratio', aggregate }))
  } finally { await server.close(); rmSync(directory, { recursive: true, force: true }) }
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
