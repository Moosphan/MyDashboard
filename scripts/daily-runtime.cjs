const { createHash, randomUUID } = require('node:crypto')
const { spawn, spawnSync } = require('node:child_process')
const { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync, statSync, realpathSync, cpSync, symlinkSync, openSync, closeSync } = require('node:fs')
const { join, resolve, dirname } = require('node:path')
const net = require('node:net')
const { tmpdir } = require('node:os')
const { setTimeout: delay } = require('node:timers/promises')

function fingerprint(root) {
  const hash = createHash('sha256')
  const visit = relative => {
    const path = join(root, relative)
    if (!existsSync(path)) return
    if (statSync(path).isDirectory()) {
      for (const name of readdirSync(path).sort()) {
        if (name !== '__pycache__' && !name.endsWith('.pyc')) visit(join(relative, name))
      }
    } else {
      hash.update(relative.replaceAll('\\', '/'))
      hash.update(readFileSync(path))
    }
  }
  for (const path of ['src', 'assets', 'resources/voice-runtime', 'resources/voice-design', 'feature.config.ts', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'tsconfig.main.json', 'tsconfig.web.json', 'electron.vite.config.ts', 'electron.vite.config.js', 'tailwind.config.ts', 'tailwind.config.js', 'postcss.config.js']) visit(path)
  return hash.digest('hex')
}

function requestControl(record, command) {
  return new Promise(resolveRequest => {
    const socket = net.createConnection(record.endpoint)
    let response = ''
    const finish = result => { socket.destroy(); resolveRequest(result) }
    socket.setTimeout(1500, () => finish(false))
    socket.on('error', () => finish(false))
    socket.on('connect', () => socket.write(JSON.stringify({ token: record.token, command }) + '\n'))
    socket.on('data', chunk => {
      response += chunk.toString()
      if (response.includes('\n')) finish(response.trim() === 'ok')
    })
    socket.on('end', () => finish(false))
  })
}

function retireDevelopment(root) {
  if (process.platform !== 'darwin') return
  const plist = join(root, '.dev-logs/com.dorck.hulkdash.dev.plist')
  if (!existsSync(plist)) return
  const checked = spawnSync('/usr/libexec/PlistBuddy', ['-c', 'Print :WorkingDirectory', plist], { encoding: 'utf8' })
  if (checked.status !== 0 || !existsSync(checked.stdout.trim()) || realpathSync(checked.stdout.trim()) !== root) return
  const loaded = spawnSync('launchctl', ['print', `gui/${process.getuid()}/com.dorck.hulkdash.dev`], { encoding: 'utf8' })
  if (loaded.status === 0) {
    const loadedPath = loaded.stdout.match(/^\s*path = (.+)$/m)?.[1]
    if (!loadedPath || !existsSync(loadedPath) || realpathSync(loadedPath) !== realpathSync(plist)) return
  }
  spawnSync('launchctl', ['bootout', `gui/${process.getuid()}`, plist], { stdio: 'ignore' })
}

function createDailyRuntime(options) {
  const root = realpathSync(options.root)
  const state = join(root, '.daily-runtime')
  const recordPath = join(state, 'running.json')
  const activePath = join(state, 'active.json')
  const control = options.control || requestControl
  mkdirSync(join(state, 'releases'), { recursive: true })
  const read = path => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
  const atomic = (path, value) => {
    const temporary = path + '.' + randomUUID()
    writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 })
    renameSync(temporary, path)
  }
  const record = () => {
    const value = read(recordPath)
    if (value && value.root !== root) throw new Error('Control record belongs to another checkout')
    return value
  }
  const processExists = value => {
    if (!Number.isInteger(value?.pid) || value.pid <= 0) return false
    try { process.kill(value.pid, 0); return true } catch (error) { return error.code === 'EPERM' }
  }
  const active = () => {
    const value = read(activePath)
    if (!value || !/^[a-f0-9-]+$/.test(value.id)) return null
    return { ...value, directory: join(state, 'releases', value.id) }
  }
  const locked = async action => {
    const lock = join(state, 'operation.lock')
    let handle
    try { handle = openSync(lock, 'wx') } catch { throw new Error('Another daily runtime command is active; after confirming no command is running, remove .daily-runtime/operation.lock and retry') }
    try { return await action() } finally { closeSync(handle); rmSync(lock, { force: true }) }
  }
  const build = async () => {
    const id = randomUUID()
    const directory = join(state, 'releases', id)
    mkdirSync(directory)
    const before = fingerprint(root)
    try {
      if (options.build) await options.build(directory)
      else {
        const binary = join(dirname(require.resolve('electron-vite/package.json')), 'bin/electron-vite.js')
        const result = spawnSync(process.execPath, [binary, 'build'], {
          cwd: root, stdio: 'inherit', env: { ...process.env, MYDASHBOARD_BUILD_OUT: join(directory, 'out') },
        })
        if (result.status !== 0) throw new Error('Daily build failed; previous active release retained')
        const sourcePackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
        writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: sourcePackage.name, version: sourcePackage.version, main: './out/main/index.js' }))
        symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
        for (const resource of ['voice-runtime', 'voice-design']) cpSync(join(root, 'resources', resource), join(directory, 'resources', resource), { recursive: true, filter: path => !path.includes('__pycache__') })
      }
      for (const file of ['main/index.js', 'preload/index.js', 'renderer/index.html']) {
        if (!existsSync(join(directory, 'out', file))) throw new Error('Daily build has incomplete output')
      }
      if (fingerprint(root) !== before) throw new Error('Sources changed during build; previous active release retained')
      atomic(activePath, { id, fingerprint: before })
      return active()
    } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error }
  }
  const stop = async () => {
    const current = record()
    if (!current) return
    if (await control(current, 'status')) {
      if (!await control(current, 'stop')) throw new Error('Application did not accept stop request')
      for (let attempt = 0; attempt < 150; attempt++) {
        if (!await control(current, 'status')) break
        if (attempt === 149) throw new Error('Application is still shutting down; no process was forcibly terminated')
        await delay(100)
      }
    } else if (processExists(current)) throw new Error('Application is not responding; its process and control record were preserved')
    for (let attempt = 0; processExists(current); attempt++) {
      if (attempt === 150) throw new Error('Application has not exited; no process was forcibly terminated')
      await delay(100)
    }
    rmSync(recordPath, { force: true })
  }
  const start = async () => {
    const release = active()
    if (!release) throw new Error('Run pnpm daily:build before starting')
    if (release.fingerprint !== fingerprint(root)) throw new Error('Sources changed; run pnpm daily:build before starting')
    const current = record()
    if (current && await control(current, 'status')) {
      if (current.release !== release.id) throw new Error('A previous release is running; use pnpm daily:restart')
      await control(current, 'focus')
      return
    }
    if (processExists(current)) throw new Error('Application is not responding; its process and control record were preserved')
    await (options.retireDevelopment || retireDevelopment)(root)
    const token = randomUUID()
    const endpointId = createHash('sha256').update(root).digest('hex').slice(0, 16)
    const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\mydashboard-${endpointId}` : join(tmpdir(), `mydashboard-${endpointId}.sock`)
    if (process.platform !== 'win32') rmSync(endpoint, { force: true })
    const next = { root, token, endpoint, release: release.id }
    atomic(recordPath, next)
    try {
      if (options.launch) await options.launch(release.directory, recordPath)
      else {
        const log = openSync(join(state, 'application.log'), 'a', 0o600)
        const env = { ...process.env, MYDASHBOARD_DAILY_CONTROL: recordPath }
        delete env.ELECTRON_RENDERER_URL
        delete env.ELECTRON_RUN_AS_NODE
        const child = spawn(require('electron'), [release.directory], { cwd: root, detached: true, stdio: ['ignore', log, log], env })
        closeSync(log)
        atomic(recordPath, { ...next, ...(child.pid ? { pid: child.pid } : {}) })
        let launchError
        child.once('error', error => { launchError = error })
        child.unref()
        for (let attempt = 0; attempt < 150; attempt++) {
          if (launchError) throw launchError
          if (await control(next, 'status')) return
          await delay(100)
        }
        throw new Error('Daily application did not start; another mode may already own this user profile')
      }
    } catch (error) {
      if (!processExists(read(recordPath))) rmSync(recordPath, { force: true })
      throw error
    }
  }
  return { active, build: () => locked(build), start: () => locked(start), stop: () => locked(stop), restart: () => locked(async () => { await stop(); await start() }) }
}

module.exports = { createDailyRuntime, fingerprint, requestControl }
if (require.main === module) {
  const runtime = createDailyRuntime({ root: resolve(__dirname, '..') })
  const action = process.argv[2]
  if (!['build', 'start', 'stop', 'restart'].includes(action)) {
    console.error('Usage: node scripts/daily-runtime.cjs build|start|stop|restart')
    process.exitCode = 1
  } else runtime[action]().then(() => console.log(`Daily ${action} complete`)).catch(error => { console.error(error.message); process.exitCode = 1 })
}
