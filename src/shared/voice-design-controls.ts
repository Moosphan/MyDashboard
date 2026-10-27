export const VOICE_DESIGN_TRAITS = [
  {
    id: 'gender',
    label: '声音性别',
    values: [
      ['female', '女性', '女性声线'],
      ['male', '男性', '男性声线'],
      ['androgynous', '中性', '中性声线，性别特征不突出'],
    ],
  },
  {
    id: 'age',
    label: '声音年龄感',
    values: [
      ['girl', '少女感', '少女感，声音轻盈青涩，发声纤细'],
      ['boy', '少年感', '少年感，声音清透青涩，尚未完全成熟'],
      ['young', '青年', '青年感，声音有朝气'],
      ['adult', '成年', '成年感，声音自然稳健'],
      ['mature', '成熟', '成熟感，声音厚实稳重'],
      ['elder', '年长', '年长感，带岁月感和轻微沧桑'],
    ],
  },
  {
    id: 'pitch',
    label: '音高倾向',
    values: [
      ['high', '纤细高音', '音高偏高，纤细轻盈'],
      ['bright', '中高音', '中高音区，明亮清透'],
      ['mid', '中音', '自然中音区'],
      ['low', '中低音', '中低音区，低沉有磁性'],
      ['bass', '深沉低音', '深沉低音，厚重而有力量'],
    ],
  },
  {
    id: 'texture',
    label: '音色质感',
    values: [
      ['soft', '软糯绵柔', '音色软糯绵柔，咬字轻柔圆润，句尾轻轻收住'],
      ['sweet', '甜美清透', '音色甜美清透，轻盈灵动'],
      ['clear', '清澈明亮', '音色清澈明亮，轮廓鲜明'],
      ['warm', '温暖醇厚', '音色温暖醇厚，圆润饱满'],
      ['cool', '清冷疏离', '音色清冷通透，带距离感'],
      ['husky', '低哑颗粒', '音色低哑，带细微沙质颗粒感'],
      ['crisp', '干净利落', '音色干净利落，声音边缘清晰'],
      ['airy', '轻盈空灵', '音色轻盈空灵，带通透的空气感'],
    ],
  },
  {
    id: 'breath',
    label: '气声与发声',
    values: [
      ['clean', '实声清晰', '以清晰实声发声，气声很少'],
      ['light', '轻微气声', '掺入轻微气声，呼吸轻柔可闻'],
      ['breathy', '明显气声', '以明显但清晰的气声轻声说话'],
      ['whisper', '贴耳轻语', '贴耳轻语，气息柔软，保持每个字可辨'],
    ],
  },
  {
    id: 'resonance',
    label: '共鸣位置',
    values: [
      ['head', '轻盈头腔', '头腔共鸣轻盈，声音位置偏高'],
      ['balanced', '自然均衡', '自然均衡的口腔共鸣'],
      ['chest', '浑厚胸腔', '胸腔共鸣明显，低频厚实'],
      ['nasal', '轻微鼻腔', '带轻微鼻腔共鸣，语气娇憨'],
    ],
  },
  {
    id: 'articulation',
    label: '咬字方式',
    values: [
      ['soft', '轻柔圆润', '咬字轻柔圆润，辅音边缘柔和'],
      ['precise', '清晰准确', '咬字清晰准确，字音完整'],
      ['casual', '松弛口语', '像日常对话一样松弛自然'],
      ['strong', '有力顿挫', '咬字有力，重音和顿挫鲜明'],
    ],
  },
  {
    id: 'delivery',
    label: '角色与表演',
    values: [
      ['natural', '日常自然', '自然日常对话，避免播音腔'],
      ['anime', '动漫软音', '动漫角色式软音，轻柔可爱，语尾灵动，保持自然可懂'],
      ['idol', '元气动漫', '元气动漫角色，活泼明快，语调跳跃'],
      ['narrator', '纪录片旁白', '纪录片旁白，稳重克制，叙事有层次'],
      ['host', '明快主持', '主持人口吻，精神饱满，重点鲜明'],
      ['drama', '戏剧对白', '戏剧角色对白，语气起伏与重音鲜明'],
    ],
  },
  {
    id: 'pace',
    label: '韵律与停顿',
    values: [
      ['slow', '舒缓留白', '韵律舒缓，句间停顿充分，句尾缓缓收束'],
      ['flow', '自然连贯', '节奏自然流畅，停顿符合语义'],
      ['bouncy', '轻快跳跃', '节奏轻快跳跃，短句弹性明显'],
      ['dramatic', '起伏顿挫', '节奏变化鲜明，重点前略停顿，重音突出'],
    ],
  },
  {
    id: 'language',
    label: '语言与口音',
    values: [
      ['mandarin', '标准普通话', '标准普通话'],
      ['english', '自然英语', '自然英语发音'],
      ['sichuan', '四川口音', '带四川口音的中文'],
      ['cantonese', '粤语', '粤语发音'],
      ['northeast', '东北口音', '带东北口音的中文'],
    ],
  },
] as const

export type VoiceDesignTraitId = (typeof VOICE_DESIGN_TRAITS)[number]['id']
export type VoiceDesignTraits = Partial<Record<VoiceDesignTraitId, string>>

export const VOICE_EMOTIONS = [
  { id: 'happy', label: '开心', prompt: '愉悦开心，语气带笑意，语调轻扬' },
  { id: 'angry', label: '生气', prompt: '生气不满，辅音有力，重音紧促' },
  { id: 'sad', label: '难过', prompt: '难过低落，句尾下沉，语气低回' },
  { id: 'afraid', label: '害怕', prompt: '害怕紧张，气息略不稳，迟疑停顿' },
  { id: 'disgusted', label: '厌恶', prompt: '厌恶嫌弃，语气疏离，收尾短促' },
  { id: 'melancholic', label: '忧郁', prompt: '忧郁惆怅，声音绵长，情绪内收' },
  { id: 'surprised', label: '惊讶', prompt: '惊讶好奇，语调明显上扬，重音抬起' },
  { id: 'calm', label: '平静', prompt: '平静放松，气息稳定，语气克制' },
] as const
export type VoiceEmotionId = (typeof VOICE_EMOTIONS)[number]['id']
export type VoiceEmotionLevels = Partial<Record<VoiceEmotionId, number>>

export const VOICE_EMOTION_PRESETS: { id: string; name: string; levels: VoiceEmotionLevels }[] = [
  { id: 'neutral', name: '平静自然', levels: { calm: 2 } },
  { id: 'tender', name: '温柔贴耳', levels: { happy: 1, calm: 2 } },
  { id: 'happy', name: '开心带笑', levels: { happy: 2, surprised: 1 } },
  { id: 'excited', name: '兴奋雀跃', levels: { happy: 3, surprised: 2 } },
  { id: 'shy', name: '害羞怯生', levels: { happy: 1, afraid: 1, surprised: 1 } },
  { id: 'sad', name: '低落难过', levels: { sad: 2, melancholic: 1 } },
  { id: 'sleepy', name: '困倦慵懒', levels: { melancholic: 1, calm: 3 } },
  { id: 'curious', name: '好奇探问', levels: { happy: 1, surprised: 2 } },
  { id: 'proud', name: '自信得意', levels: { happy: 2, calm: 1 } },
  { id: 'wronged', name: '委屈欲言', levels: { sad: 2, afraid: 1, melancholic: 1 } },
]

export const VOICE_CHARACTER_RECIPES: {
  id: string
  name: string
  traits: VoiceDesignTraits
  emotions: VoiceEmotionLevels
}[] = [
  {
    id: 'anime-soft',
    name: '少女 · 动漫软音',
    traits: {
      gender: 'female',
      age: 'girl',
      pitch: 'high',
      texture: 'soft',
      breath: 'light',
      resonance: 'head',
      articulation: 'soft',
      delivery: 'anime',
      pace: 'slow',
      language: 'mandarin',
    },
    emotions: { happy: 1, calm: 2 },
  },
  {
    id: 'shy-girl',
    name: '少女 · 害羞轻语',
    traits: {
      gender: 'female',
      age: 'girl',
      pitch: 'bright',
      texture: 'sweet',
      breath: 'whisper',
      resonance: 'nasal',
      articulation: 'soft',
      delivery: 'anime',
      pace: 'slow',
      language: 'mandarin',
    },
    emotions: { happy: 1, afraid: 1 },
  },
  {
    id: 'energetic-girl',
    name: '少女 · 元气活泼',
    traits: {
      gender: 'female',
      age: 'girl',
      pitch: 'high',
      texture: 'clear',
      breath: 'clean',
      resonance: 'head',
      articulation: 'precise',
      delivery: 'idol',
      pace: 'bouncy',
      language: 'mandarin',
    },
    emotions: { happy: 3, surprised: 2 },
  },
  {
    id: 'clear-boy',
    name: '少年 · 清透明朗',
    traits: {
      gender: 'male',
      age: 'boy',
      pitch: 'bright',
      texture: 'clear',
      breath: 'clean',
      articulation: 'casual',
      delivery: 'natural',
      pace: 'flow',
      language: 'mandarin',
    },
    emotions: { happy: 1 },
  },
  {
    id: 'cool-woman',
    name: '成女 · 清冷知性',
    traits: {
      gender: 'female',
      age: 'adult',
      pitch: 'mid',
      texture: 'cool',
      breath: 'clean',
      resonance: 'balanced',
      articulation: 'precise',
      delivery: 'natural',
      pace: 'flow',
      language: 'mandarin',
    },
    emotions: { calm: 2 },
  },
  {
    id: 'mature-narrator',
    name: '成熟男声 · 浑厚旁白',
    traits: {
      gender: 'male',
      age: 'mature',
      pitch: 'bass',
      texture: 'warm',
      breath: 'clean',
      resonance: 'chest',
      articulation: 'strong',
      delivery: 'narrator',
      pace: 'slow',
      language: 'mandarin',
    },
    emotions: { calm: 2 },
  },
  {
    id: 'elder-story',
    name: '年长男声 · 沙哑讲述',
    traits: {
      gender: 'male',
      age: 'elder',
      pitch: 'low',
      texture: 'husky',
      resonance: 'chest',
      articulation: 'casual',
      delivery: 'natural',
      pace: 'slow',
      language: 'mandarin',
    },
    emotions: { melancholic: 1, calm: 1 },
  },
]

export function buildVoiceDesignDescription(
  traits: VoiceDesignTraits,
  emotions: VoiceEmotionLevels,
  extra: string,
): string {
  const phrases: string[] = []
  for (const trait of VOICE_DESIGN_TRAITS) {
    const choice = trait.values.find((item) => item[0] === traits[trait.id])
    if (choice) phrases.push(choice[2])
  }
  const intensities = ['', '轻微', '明显', '强烈']
  for (const emotion of VOICE_EMOTIONS) {
    const level = emotions[emotion.id] ?? 0
    if (Number.isInteger(level) && level >= 1 && level <= 3)
      phrases.push(`${intensities[level]}的${emotion.prompt}`)
  }
  if (extra.trim()) phrases.push(extra.trim().replace(/[。；，]+$/, ''))
  return phrases.length ? `${phrases.join('；')}。` : ''
}
