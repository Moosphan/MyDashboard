import { spawn } from 'node:child_process'
import { delimiter, dirname } from 'node:path'

export function workflowCommand(
  executable: string,
  args: string[],
  options: {
    cwd: string
    signal?: AbortSignal
    input?: string
    timeout?: number
    timeoutMessage?: string
    onOutput?: (text: string) => void
    onStderr?: (text: string) => void
    nodePath?: string
  },
): Promise<string> {
  if (!executable || executable.includes('\0'))
    return Promise.reject(new Error('请先配置可执行文件路径'))
  if (options.signal?.aborted) return Promise.reject(new Error('任务已取消'))
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: [
          options.nodePath ? dirname(options.nodePath) : '',
          dirname(executable),
          process.env.PATH ?? '',
        ]
          .filter(Boolean)
          .join(delimiter),
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        HYPERFRAMES_TELEMETRY_DISABLED: '1',
      },
    })
    let output = '',
      errors = '',
      failure: Error | undefined
    let force: ReturnType<typeof setTimeout> | undefined
    const kill = (signal: NodeJS.Signals) => {
      if (!child.pid) return
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, signal)
        else {
          const killer = spawn(
            'taskkill',
            ['/PID', String(child.pid), '/T', ...(signal === 'SIGKILL' ? ['/F'] : [])],
            { stdio: 'ignore', windowsHide: true },
          )
          killer.once('error', () => child.kill(signal))
        }
      } catch {
        return
      }
    }
    const stop = (error: Error) => {
      failure ??= error
      kill('SIGTERM')
      force ??= setTimeout(() => kill('SIGKILL'), 1500)
    }
    const abort = () => stop(new Error('任务已取消'))
    const timer = setTimeout(
      () => stop(new Error(options.timeoutMessage ?? '执行超时，请检查 CLI 登录、网络或本地模型')),
      options.timeout ?? 600000,
    )
    child.stdout.on('data', (data) => {
      output += data.toString()
      options.onOutput?.(data.toString())
      if (output.length > 4 * 1024 * 1024) stop(new Error('CLI 输出超出 4 MB 限制'))
    })
    child.stderr.on('data', (data) => {
      errors = (errors + data.toString()).slice(-8000)
      options.onStderr?.(data.toString())
    })
    child.stdin.on('error', () => {})
    child.stdin.end(options.input ?? '')
    child.once('error', (error) => {
      failure = error
    })
    child.once('close', (code, signal) => {
      if (failure || signal || code !== 0) kill('SIGKILL')
      clearTimeout(timer)
      clearTimeout(force)
      options.signal?.removeEventListener('abort', abort)
      if (failure)
        reject(
          new Error(
            `${failure.message}${errors && !options.signal?.aborted ? `\n${errors.trim()}` : ''}`,
          ),
        )
      else if (signal || code !== 0) {
        const reason = signal ? `CLI 被 ${signal} 信号终止` : `CLI 退出码 ${code ?? '未知'}`
        const capacityGuidance =
          /(?:codex\s+is\s+at\s+capacity|stream disconnected before completion[^\n]*capacity)/i.test(
            errors,
          )
            ? '\nCodex 服务暂时繁忙，本次生成没有返回结果；请稍后重试，或在执行环境切换 Claude Code CLI。'
            : ''
        const guidance =
          process.platform === 'darwin' && signal === 'SIGKILL'
            ? '\n若 macOS 提示此程序有害或已损坏，请停止使用该文件，在执行环境中选择可信来源重新安装的 CLI；不要关闭系统安全检查。'
            : ''
        reject(
          new Error(
            `${reason}${capacityGuidance}\n执行文件：${executable}${errors ? `\n${errors.trim()}` : ''}${guidance}`,
          ),
        )
      } else resolve(output)
    })
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) abort()
  })
}
