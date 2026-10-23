import { dirname, join } from 'node:path'
import type { VoiceRuntimeManager } from './runtime-manager'
import type { LocalVoiceQueue } from './local-voice-queue'
import { runCommand } from './process'

export type ReferenceTranscriber = (path: string, signal: AbortSignal) => Promise<string>

export function createReferenceTranscriber(worker: string, runtime: VoiceRuntimeManager, queue: LocalVoiceQueue): ReferenceTranscriber {
  return (path, signal) => queue.run(async () => {
    const state = runtime.get()
    if (!state.supported) throw new Error('自动识别目前需要 Apple Silicon macOS')
    const output = await runCommand(state.config.pythonPath, ['-B', '-u', join(dirname(worker), 'transcribe.py'), '--model', state.config.asrModelPath, '--audio', path], signal, 120000)
    const result = JSON.parse(output)
    if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('未识别到讲话，请选择清晰的参考片段或手动校对')
    return result.text.trim()
  }, signal)
}
