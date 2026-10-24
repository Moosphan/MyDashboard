import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { delimiter, dirname, isAbsolute, join } from 'node:path'
import { homedir } from 'node:os'
import type { WorkflowRuntime } from '../../../shared/video-workflow'
import { workflowCommand } from './process'
import { BilibiliCatbus } from './catbus'

function findExecutable(name: string) {
  const versions = join(homedir(), '.nvm', 'versions', 'node')
  const directories = [
    ...(process.env.PATH ?? '').split(delimiter),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    ...(existsSync(versions)
      ? readdirSync(versions)
          .sort((first, second) => second.localeCompare(first, undefined, { numeric: true }))
          .map((version) => join(versions, version, 'bin'))
      : []),
  ]
  return (
    directories.map((directory) => join(directory, name)).find((path) => existsSync(path)) ?? ''
  )
}
export class WorkflowRuntimeManager {
  private path: string
  constructor(root: string) {
    this.path = join(root, 'config', 'video-workflow.json')
  }
  get(): WorkflowRuntime {
    const defaults: WorkflowRuntime = {
      nodePath: findExecutable('node'),
      catbusPath: findExecutable('catbus'),
      codexPath: findExecutable('codex'),
      claudePath: findExecutable('claude'),
      hyperframesPath: findExecutable('hyperframes'),
      ffmpegPath: findExecutable('ffmpeg'),
      ffprobePath: findExecutable('ffprobe'),
    }
    if (!existsSync(this.path)) return defaults
    try {
      return { ...defaults, ...JSON.parse(readFileSync(this.path, 'utf8')) }
    } catch {
      throw new Error('工作流运行配置损坏，请重新配置')
    }
  }
  set(value: unknown) {
    if (!value || typeof value !== 'object') throw new Error('无效运行配置')
    const next = { ...this.get() }
    for (const key of Object.keys(next) as (keyof WorkflowRuntime)[]) {
      const path = (value as Record<string, unknown>)[key]
      if (path !== undefined) {
        if (
          typeof path !== 'string' ||
          path.length > 2000 ||
          (path && (!isAbsolute(path) || !existsSync(path)))
        )
          throw new Error(`${key} 需要已存在的绝对路径`)
        next[key] = path
      }
    }
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(`${this.path}.tmp`, JSON.stringify(next, null, 2))
    renameSync(`${this.path}.tmp`, this.path)
    return next
  }
  async check(cwd: string) {
    const config = this.get()
    const checks: { key: keyof WorkflowRuntime; ok: boolean; detail: string }[] = await Promise.all(
      (
        [
          'nodePath',
          'codexPath',
          'claudePath',
          'hyperframesPath',
          'ffmpegPath',
          'ffprobePath',
        ] as const
      ).map(async (key) => {
        try {
          const output = await workflowCommand(
            config[key].endsWith('.mjs') ? config.nodePath : config[key],
            [
              ...(config[key].endsWith('.mjs') ? [config[key]] : []),
              key === 'ffmpegPath' || key === 'ffprobePath' ? '-version' : '--version',
            ],
            { cwd, timeout: 15000, nodePath: config.nodePath },
          )
          return { key, ok: true, detail: output.trim().split('\n')[0] }
        } catch (error) {
          return { key, ok: false, detail: (error as Error).message }
        }
      }),
    )
    try {
      await new BilibiliCatbus(cwd, config).check()
      checks.push({ key: 'catbusPath', ok: true, detail: 'Catbus 0.2.1 · Node 版本兼容' })
    } catch (error) {
      checks.push({ key: 'catbusPath', ok: false, detail: (error as Error).message })
    }
    return checks
  }
}
export function parseAgentJson(output: string): unknown {
  let text = output.trim()
  try {
    const envelope = JSON.parse(text)
    if (typeof envelope.result === 'string') text = envelope.result.trim()
    else if (envelope.is_error) throw new Error('Agent 返回执行错误')
    else return envelope
  } catch (error) {
    if ((error as Error).message === 'Agent 返回执行错误') throw error
  }
  text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Agent 未返回有效 JSON；请重试，或使用导出任务后人工导入')
  }
}
export async function runAgent(
  executor: 'codex' | 'claude',
  runtime: WorkflowRuntime,
  cwd: string,
  prompt: string,
  signal: AbortSignal,
): Promise<unknown> {
  if (prompt.length > 200000)
    throw new Error('创作输入超过 200000 字符，请精简分镜正文、HTML 或参考材料后重试')
  const output = join(cwd, 'agent-result.txt')
  if (executor === 'codex') {
    await workflowCommand(
      runtime.codexPath,
      [
        'exec',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--ephemeral',
        '--output-last-message',
        output,
        '-',
      ],
      { cwd, input: prompt, signal, timeout: 900000, nodePath: runtime.nodePath },
    )
    if (!existsSync(output)) throw new Error('Codex 未生成结果，请检查 CLI 版本与登录状态')
    return parseAgentJson(readFileSync(output, 'utf8'))
  }
  return parseAgentJson(
    await workflowCommand(
      runtime.claudePath,
      ['--print', '--output-format', 'json', '--tools', '', '--no-session-persistence'],
      { cwd, input: prompt, signal, timeout: 900000, nodePath: runtime.nodePath },
    ),
  )
}
