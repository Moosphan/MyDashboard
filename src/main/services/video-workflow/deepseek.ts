import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { WorkflowRuntime } from '../../../shared/video-workflow'
import { workflowCommand } from './process'

export function parseDeepSeekJson(output: string, parse: (answer: string) => unknown): unknown {
  let completed = false
  let answer: string | undefined
  let started = false
  for (const line of output.split(/\r?\n/).filter((line) => line.trim())) {
    let event: Record<string, unknown>
    try {
      event = JSON.parse(line)
    } catch {
      throw new Error('DeepSeek 未返回有效 headless JSON 事件；请检查 Harness 版本，原版本已保留')
    }
    if (
      !event ||
      typeof event !== 'object' ||
      typeof event.type !== 'string' ||
      answer !== undefined
    )
      throw new Error('DeepSeek headless 事件顺序无效，原版本已保留')
    if (event.type === 'error') throw new Error('DeepSeek 执行失败，原版本已保留')
    if (event.type === 'session') {
      if (started) throw new Error('DeepSeek 返回了重复会话，原版本已保留')
      started = true
    } else if (event.type === 'status' && event.phase === 'turn_end') {
      completed = (event.reason as { kind?: unknown } | undefined)?.kind === 'completed'
    } else if (event.type === 'final') {
      if (!started || !completed || typeof event.text !== 'string' || !event.text.trim())
        throw new Error('DeepSeek 未完成本次创作，原版本已保留')
      answer = event.text
    }
  }
  if (answer === undefined) throw new Error('DeepSeek 未返回最终结果，原版本已保留')
  return parse(answer)
}

const contentOnlyPlugin = `export const name = 'mydashboard-content-only'
export const inject = ['tools', 'systemPrompt']
export function apply(ctx) {
  ctx.tools.guard(() => 'Video workflow content generation does not execute tools')
  ctx.on('system-prompt/assemble', async (assembly, context, next) => ({ ...await next(), tools: [] }))
}
`

function redactDeepSeekFailure(error: unknown): Error {
  return new Error(
    (error instanceof Error ? error.message : String(error))
      .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [已隐藏]')
      .replace(
        /((?:DEEPSEEK_API_KEY|api[_-]?key|access[_-]?token)\s*[=:]\s*)[^\s"',}]+/gi,
        '$1[已隐藏]',
      )
      .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[已隐藏]')
      .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/g, 'https://[已隐藏]@'),
  )
}

export async function runDeepSeek(
  runtime: WorkflowRuntime,
  cwd: string,
  prompt: string,
  signal: AbortSignal,
  timeout: number,
): Promise<string> {
  if (!runtime.deepseekPath) throw new Error('请先在执行环境配置 DeepSeek Harness（dsh）路径')
  const plugin = join(cwd, 'deepseek-content-only.mjs')
  const patch = join(cwd, 'deepseek-content-only.patch.yml')
  writeFileSync(plugin, contentOnlyPlugin, { mode: 0o600 })
  writeFileSync(
    patch,
    JSON.stringify([
      { id: 'sandbox-policy', config: { mode: 'read-only', workspaceRoot: cwd } },
      { id: 'approval', config: { policy: 'never' } },
      {
        id: 'permission',
        config: {
          defaultPreset: 'read-only',
          presets: { 'read-only': { sandbox: 'read-only', approval: 'never' } },
        },
      },
      { id: 'hmr', disabled: true },
      { id: 'session-title-llm', disabled: true },
      {
        insert: [
          {
            id: 'mydashboard-content-only',
            name: pathToFileURL(plugin).href,
            inject: ['tools', 'systemPrompt'],
          },
        ],
      },
    ]),
    { mode: 0o600 },
  )
  const script = /\.[cm]?js$/i.test(runtime.deepseekPath)
  try {
    return await workflowCommand(
      script ? runtime.nodePath : runtime.deepseekPath,
      [
        ...(script ? [runtime.deepseekPath] : []),
        '--profile',
        'headless',
        '--patch',
        patch,
        '--json',
        '-',
      ],
      {
        cwd,
        input: prompt,
        signal,
        timeout,
        timeoutMessage: `DeepSeek 创作执行超时（${Math.ceil(timeout / 60000)} 分钟），原版本已保留；可重试或切换执行器`,
        nodePath: runtime.nodePath,
      },
    )
  } catch (error) {
    throw redactDeepSeekFailure(error)
  }
}
