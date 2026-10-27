import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { VOICE_DESIGN_PRESETS } from '../src/shared/voice-design'
import { resolveVoiceRequest, VOICE_MODELS } from '../src/shared/voiceover'
import { runVoiceWorker } from '../src/main/services/voiceover/python-adapter'

async function main() {
  const directory = resolve('resources/voice-design')
  const temporary = join(directory, '.generating')
  mkdirSync(temporary, { recursive: true })
  const model = VOICE_MODELS.voxcpm2
  const modelPath =
    process.argv[2] ??
    join(
      homedir(),
      '.cache/huggingface/hub',
      `models--${model.id.replace('/', '--')}`,
      'snapshots',
      model.revision,
    )
  const python = process.argv[3] ?? join(homedir(), '.cache/mydashboard-qwen3-tts/venv/bin/python')
  const samples = []
  try {
    for (const preset of VOICE_DESIGN_PRESETS) {
      console.log(`Generating ${preset.name}`)
      const request = resolveVoiceRequest({
        clientRequestId: randomUUID(),
        engine: 'voxcpm2',
        text: preset.sampleText,
        voiceDesign: preset.description,
        options: { seed: preset.seed, steps: 20, cfg: 2 },
      })
      const output = await runVoiceWorker(
        python,
        resolve('resources/voice-runtime/worker.py'),
        {
          ...request,
          jobId: randomUUID(),
          attemptId: randomUUID(),
          modelPath,
          outputPath: join(temporary, 'raw.wav'),
        },
        new AbortController().signal,
        console.log,
      )
      const filename = `${preset.id}.wav`
      renameSync(join(temporary, output.path), join(directory, filename))
      samples.push({
        ...preset,
        filename,
        duration: output.duration,
        sampleRate: output.sampleRate,
        sha256: createHash('sha256')
          .update(readFileSync(join(directory, filename)))
          .digest('hex'),
        model,
        options: request.options,
      })
      writeFileSync(join(directory, 'samples.json'), JSON.stringify(samples, null, 2))
      console.log(`Saved ${filename}: ${output.duration.toFixed(2)}s`)
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
