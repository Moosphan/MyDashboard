import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolveVoiceRequest } from '../../../shared/voiceover'
import { VOICE_DESIGN_PRESETS, type VoiceDesignPlan } from '../../../shared/voice-design'

export class VoiceDesignStore {
  private path: string
  constructor(root: string) {
    const directory = join(root, 'voice-design')
    mkdirSync(directory, { recursive: true })
    this.path = join(directory, 'plans.json')
  }

  list(): VoiceDesignPlan[] {
    const custom: VoiceDesignPlan[] = existsSync(this.path)
      ? JSON.parse(readFileSync(this.path, 'utf8'))
      : []
    return [...VOICE_DESIGN_PRESETS, ...custom]
  }

  save(input: {
    name: string
    description: string
    seed: number
    tempo?: number
  }): VoiceDesignPlan {
    if (
      !input ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.trim().length > 60
    )
      throw new Error('声音方案名称须为 1–60 字符')
    const request = resolveVoiceRequest({
      clientRequestId: 'validate-plan',
      engine: 'voxcpm2',
      text: '试听',
      voiceDesign: input.description,
      options: { seed: input.seed, designTempo: input.tempo ?? 1 },
    })
    const custom = this.list().filter((item) => !item.builtin)
    if (custom.length >= 100) throw new Error('最多保存 100 个声音方案')
    const plan = {
      id: randomUUID(),
      name: input.name.trim(),
      description: request.voiceDesign!,
      seed: request.options.seed!,
      tempo: request.options.designTempo!,
      builtin: false,
    }
    const temporary = `${this.path}.${randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify([...custom, plan], null, 2), { mode: 0o600 })
    renameSync(temporary, this.path)
    return plan
  }
}
