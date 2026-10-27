export interface VoiceDesignPlan {
  id: string
  name: string
  description: string
  seed: number
  tempo?: number
  builtin: boolean
  sampleText?: string
}

export const VOICE_DESIGN_SAMPLE_TEXT = '让声音带你走进故事，在文字之间，听见细节，也听见新的灵感。'

export const VOICE_DESIGN_PRESETS: VoiceDesignPlan[] = [
  {
    id: 'historian',
    name: '砚声 · 历史旁白',
    description:
      '成熟男性，中低音，温暖醇厚而有共鸣，普通话清晰标准，语速舒缓，叙事沉稳克制，句尾自然收束，适合历史纪录片。',
    seed: 1042,
    builtin: true,
    sampleText: VOICE_DESIGN_SAMPLE_TEXT,
  },
  {
    id: 'storyteller',
    name: '听澜 · 温柔讲述',
    description:
      '成年女性，中音，温柔自然，声音柔和清澈，普通话标准，语速适中偏慢，亲切而有叙事感，呼吸轻盈，情绪平和，避免夸张表演。',
    seed: 2048,
    builtin: true,
    sampleText: VOICE_DESIGN_SAMPLE_TEXT,
  },
  {
    id: 'explainer',
    name: '知行 · 清晰解说',
    description:
      '年轻成年男性，中音偏明亮，干净利落，普通话标准，吐字准确，节奏轻快但不急促，充满好奇心，适合科技与知识讲解。',
    seed: 3096,
    builtin: true,
    sampleText: VOICE_DESIGN_SAMPLE_TEXT,
  },
  {
    id: 'bright',
    name: '晴语 · 活力主持',
    description:
      '年轻成年女性，明亮清爽的中高音，普通话标准，语调轻盈活泼，语速适中偏快，带自然微笑和积极情绪，清晰有感染力，避免尖锐或幼态。',
    seed: 4096,
    builtin: true,
    sampleText: VOICE_DESIGN_SAMPLE_TEXT,
  },
]
