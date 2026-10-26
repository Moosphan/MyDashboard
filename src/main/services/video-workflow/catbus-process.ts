import { spawn } from 'node:child_process'
import { delimiter, dirname } from 'node:path'

export function catbusProcess(
  node: string,
  entry: string,
  args: string[],
  home: string,
  signal?: AbortSignal,
  progress?: (text: string) => void,
  preload?: string,
) {
  return new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('CANCELLED'))
    const child = spawn(node, [...(preload ? ['--import', preload] : []), entry, ...args], {
      shell: false,
      detached: process.platform !== 'win32',
      windowsHide: true,
      cwd: dirname(home),
      env: {
        ...process.env,
        CATBUS_HOME: home,
        PATH: [dirname(node), process.env.PATH ?? ''].join(delimiter),
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = '',
      stderr = '',
      phase = '',
      failure: Error | undefined
    let force: ReturnType<typeof setTimeout> | undefined
    const kill = (hard: boolean) => {
      if (!child.pid) return
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, hard ? 'SIGKILL' : 'SIGTERM')
        else {
          const killer = spawn(
            'taskkill',
            ['/PID', String(child.pid), '/T', ...(hard ? ['/F'] : [])],
            { stdio: 'ignore', windowsHide: true },
          )
          killer.once('error', () => child.kill(hard ? 'SIGKILL' : 'SIGTERM'))
        }
      } catch {}
    }
    const stop = (reason: string) => {
      failure ??= new Error(reason)
      kill(false)
      force ??= setTimeout(() => kill(true), 1500)
    }
    const abort = () => stop('CANCELLED')
    const timer = setTimeout(
      () => stop('TIMEOUT'),
      args.includes('publish') ? 30 * 60_000 : args.includes('login') ? 5 * 60_000 : 45_000,
    )
    child.stdout.on('data', (data) => {
      if (!failure) stdout += data.toString()
      if (stdout.length > 2 * 1024 * 1024) stop('OUTPUT_LIMIT')
    })
    child.stderr.on('data', (data) => {
      stderr = (stderr + data.toString()).slice(-1000)
      const match = [...stderr.matchAll(/上传 (\d+)\/(\d+)/g)].at(-1)
      if (match) {
        const next = `已上传 ${match[1]} / ${match[2]} 个分片`
        if (next !== phase) {
          phase = next
          progress?.(next)
        }
      }
    })
    child.once('error', () => {
      failure = new Error('PROCESS')
    })
    child.once('close', (code, terminated) => {
      clearTimeout(timer)
      clearTimeout(force)
      signal?.removeEventListener('abort', abort)
      if (failure) reject(failure)
      else if (terminated) reject(new Error('PROCESS'))
      else resolve({ code, stdout })
    })
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}
