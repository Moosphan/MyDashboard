import { spawn } from 'node:child_process'

export function runCommand(executable: string, args: string[], signal?: AbortSignal, timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, env: { ...process.env, HF_HUB_OFFLINE: '1', TOKENIZERS_PARALLELISM: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let errors = ''
    let failure: Error | null = null
    let force: ReturnType<typeof setTimeout> | undefined
    const stop = (error: Error) => {
      failure ??= error
      child.kill('SIGTERM')
      force ??= setTimeout(() => child.kill('SIGKILL'), 3000)
    }
    const abort = () => stop(new Error('任务已取消'))
    const timer = setTimeout(() => stop(new Error('命令执行超时')), timeoutMs)
    child.stdout.on('data', data => {
      output += data.toString()
      if (output.length > 2 * 1024 * 1024) stop(new Error('输出超出限制'))
    })
    child.stderr.on('data', data => { errors = (errors + data.toString()).slice(-4000) })
    child.on('error', error => { failure = error })
    child.on('close', code => {
      clearTimeout(timer)
      clearTimeout(force)
      signal?.removeEventListener('abort', abort)
      if (failure) reject(failure)
      else if (code !== 0) reject(new Error(errors || `命令退出：${code}`))
      else resolve(output)
    })
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}
