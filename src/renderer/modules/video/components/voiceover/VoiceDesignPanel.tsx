import { useEffect, useState } from 'react'
import type { VoiceJob, VoiceProfile } from '@shared/voiceover'
import { VOICE_DESIGN_PRESETS, type VoiceDesignPlan } from '@shared/voice-design'
import {
  buildVoiceDesignDescription,
  VOICE_DESIGN_TRAITS,
  VOICE_CHARACTER_RECIPES,
  VOICE_EMOTIONS,
  VOICE_EMOTION_PRESETS,
  type VoiceDesignTraits,
  type VoiceEmotionLevels,
} from '@shared/voice-design-controls'
import { voiceCall } from '../../hooks/useVoiceover'
import { VoiceSelect, VoiceNumber } from './VoiceEngineFields'
import {
  VoiceButton,
  VoiceInput,
  VoiceTextArea,
  VoiceRadioGroup,
  VoiceSlider,
} from './VoiceControls'

export function VoiceDesignPanel({
  description,
  onDescription,
  seed,
  onSeed,
  tempo,
  onTempo,
  steps,
  onSteps,
  cfg,
  onCfg,
  gainDb,
  onGainDb,
  ready,
  reason,
  submitting,
  jobs,
  onPlay,
  onPreview,
  onConfigure,
  onSavedProfile,
  onError,
}: {
  description: string
  onDescription: (value: string) => void
  seed: string
  onSeed: (value: string) => void
  tempo: number
  onTempo: (value: number) => void
  steps: 10 | 20
  onSteps: (value: 10 | 20) => void
  cfg: number
  onCfg: (value: number) => void
  gainDb: number
  onGainDb: (value: number) => void
  ready: boolean
  reason: string
  submitting: boolean
  jobs: VoiceJob[]
  onPlay: (channel: string, id: string | number) => void
  onPreview: () => void
  onConfigure: () => void
  onSavedProfile: (profile: VoiceProfile) => void
  onError: (message: string) => void
}) {
  const [plans, setPlans] = useState<VoiceDesignPlan[]>(VOICE_DESIGN_PRESETS)
  const [selected, setSelected] = useState(VOICE_DESIGN_PRESETS[0].id)
  const [name, setName] = useState('我的设计声音')
  const [selectedTraits, setSelectedTraits] = useState<VoiceDesignTraits>({})
  const [emotions, setEmotions] = useState<VoiceEmotionLevels>({})
  const [recipeId, setRecipeId] = useState('custom')
  const [emotionId, setEmotionId] = useState('custom')
  const [extra, setExtra] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    void voiceCall<VoiceDesignPlan[]>('tts:listVoiceDesigns')
      .then(setPlans)
      .catch((error) => onError(error.message))
  }, [onError])
  const plan = plans.find((item) => item.id === selected)
  const originalPlan = Boolean(
    plan &&
    plan.description === description &&
    plan.seed === Number(seed) &&
    tempo === (plan.tempo ?? 1),
  )
  const latest = jobs.find(
    (job) =>
      job.state === 'succeeded' &&
      job.request.voiceDesign === description.trim() &&
      job.assetId &&
      job.request.options.seed === Number(seed) &&
      job.request.options.steps === steps &&
      job.request.options.cfg === cfg &&
      job.request.options.gainDb === gainDb &&
      (job.request.options.designTempo ?? 1) === tempo,
  )
  const applyTraits = (
    nextTraits: VoiceDesignTraits,
    nextEmotions: VoiceEmotionLevels,
    nextExtra: string,
  ) => {
    setSelectedTraits(nextTraits)
    setEmotions(nextEmotions)
    setExtra(nextExtra)
    setSelected('custom')
    onDescription(buildVoiceDesignDescription(nextTraits, nextEmotions, nextExtra))
    setNotice('特征已自动写入声音描述。请生成试听样本确认当前效果。')
  }
  const validSeed =
    seed.trim() !== '' &&
    Number.isInteger(Number(seed)) &&
    Number(seed) >= 0 &&
    Number(seed) <= 4294967295
  const validDescription =
    description.trim().length > 0 && Array.from(description.trim()).length <= 600
  const validTempo = Number.isFinite(tempo) && tempo >= 0.7 && tempo <= 1.3
  const selectBuiltinVoice = async () => {
    if (busy || !plan?.builtin || !originalPlan) return
    setBusy(true)
    try {
      const profile = await voiceCall<VoiceProfile>('tts:useVoiceDesignPreset', plan.id)
      onSavedProfile(profile)
      setNotice('已加入我的音色，可在声音克隆及视频工作流中直接选择。')
    } catch (error) {
      onError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const save = async (asProfile: boolean) => {
    if (busy) return
    setBusy(true)
    setNotice('')
    try {
      if (asProfile && latest) {
        const profile = await voiceCall<VoiceProfile>('tts:saveDesignedProfile', latest.id, name)
        onSavedProfile(profile)
        setNotice('已保存到“我的音色”，可在声音克隆及视频工作流中选择。')
      } else {
        const saved = await voiceCall<VoiceDesignPlan>('tts:saveVoiceDesign', {
          name,
          description,
          seed: Number(seed),
          tempo,
        })
        setPlans(await voiceCall<VoiceDesignPlan[]>('tts:listVoiceDesigns'))
        setSelected(saved.id)
        setNotice('方案已保存，下次打开仍可选择。')
      }
    } catch (error) {
      onError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3" data-voice-design>
      <div className="grid grid-cols-2 gap-4">
        <VoiceSelect
          label="声音方案"
          value={originalPlan ? selected : 'custom'}
          options={[
            { value: 'custom', label: '自定义 · 当前设计' },
            ...plans.map((item) => ({
              value: item.id,
              label: `${item.name}${item.builtin ? ' · 内置' : ''}`,
            })),
          ]}
          onChange={(id) => {
            const next = plans.find((item) => item.id === id)
            if (next) {
              setSelected(id)
              onDescription(next.description)
              onSeed(String(next.seed))
              onTempo(next.tempo ?? 1)
              setSelectedTraits({})
              setEmotions({})
              setExtra('')
              setRecipeId('custom')
              setEmotionId('custom')
              setName(next.name)
              setNotice('')
            }
          }}
        />
        <div className="flex items-end">
          <VoiceButton
            variant="secondary"
            disabled={!plan?.builtin || !originalPlan}
            onClick={() => {
              if (plan?.builtin) onPlay('tts:getVoiceDesignSample', plan.id)
            }}
          >
            试听内置声音
          </VoiceButton>
        </div>
      </div>
      <VoiceTextArea
        label="声音描述"
        trailing={`${Array.from(description).length}/600`}
        data-design-description
        value={description}
        maxLength={600}
        rows={3}
        onChange={(event) => {
          onDescription(event.target.value)
          setSelected('custom')
          setSelectedTraits({})
          setEmotions({})
          setExtra('')
          setRecipeId('custom')
          setEmotionId('custom')
          setNotice('')
        }}
        placeholder="描述性别、年龄感、音色、情绪、语速与口音，例如：成熟温暖的男声，吐字清晰，平稳地讲述历史。"
      />
      <p className="text-[12px] leading-5 text-on-surface-variant">
        VoxCPM2
        直接根据文字造声，无需参考录音。描述控制属于风格引导，实际声音请试听确认；相同种子有助于复现，跨段统一音色建议先保存为“我的音色”。内置试听展示原始方案。生成
        3–30
        秒的完整短句后可保存为“我的音色”。修改后请点“生成试听样本”，原始内置样音不会随描述变化。
      </p>
      <details className="voiceover-disclosure border-b border-outline-variant/30 pb-2">
        <summary>细化声音特征</summary>
        <p className="mt-2 text-[12px] leading-5 text-on-surface-variant">
          选择配方或修改特征会自动重组上方声音描述；补充要求请写在本栏。特征与情绪强度均为描述引导，实际语速可在下方独立调节。
        </p>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <VoiceSelect
            label="声线配方"
            value={recipeId}
            options={[
              { value: 'custom', label: '自由组合' },
              ...VOICE_CHARACTER_RECIPES.map((item) => ({ value: item.id, label: item.name })),
            ]}
            onChange={(id) => {
              const recipe = VOICE_CHARACTER_RECIPES.find((item) => item.id === id)
              setRecipeId(id)
              if (recipe) {
                setEmotionId('custom')
                applyTraits(recipe.traits, recipe.emotions, extra)
              }
            }}
          />
          <VoiceSelect
            label="情绪组合"
            value={emotionId}
            options={[
              { value: 'custom', label: '自由调节' },
              ...VOICE_EMOTION_PRESETS.map((item) => ({ value: item.id, label: item.name })),
            ]}
            onChange={(id) => {
              setEmotionId(id)
              const preset = VOICE_EMOTION_PRESETS.find((item) => item.id === id)
              if (preset) applyTraits(selectedTraits, preset.levels, extra)
            }}
          />
          {VOICE_DESIGN_TRAITS.map((trait) => (
            <VoiceSelect
              key={trait.label}
              label={trait.label}
              value={selectedTraits[trait.id] ?? 'unspecified'}
              options={[
                { value: 'unspecified', label: '不指定' },
                ...trait.values.map(([value, label]) => ({ value, label })),
              ]}
              onChange={(value) => {
                setRecipeId('custom')
                applyTraits(
                  { ...selectedTraits, [trait.id]: value === 'unspecified' ? undefined : value },
                  emotions,
                  extra,
                )
              }}
            />
          ))}
        </div>
        <p className="mt-3 text-[12px] text-on-surface-variant">
          情绪强度：0 不指定 · 1 轻微 · 2 明显 · 3
          强烈。多个情绪可组合，避免同时拉满互相冲突的情绪。
        </p>
        <div className="grid grid-cols-2 gap-3 mt-2">
          {VOICE_EMOTIONS.map((emotion) => (
            <VoiceSlider
              key={emotion.id}
              label={`${emotion.label}强度`}
              value={emotions[emotion.id] ?? 0}
              min={0}
              max={3}
              onChange={(value) => {
                setEmotionId('custom')
                applyTraits(selectedTraits, { ...emotions, [emotion.id]: value }, extra)
              }}
            />
          ))}
        </div>
        <div className="mt-3 space-y-3">
          <VoiceTextArea
            label="补充风格要求"
            value={extra}
            maxLength={200}
            rows={2}
            onChange={(event) => applyTraits(selectedTraits, emotions, event.target.value)}
            placeholder="例如：句尾收束自然，重点处略作停顿，不要播音腔。"
          />
        </div>
      </details>
      <div className="grid grid-cols-2 gap-3">
        <VoiceNumber
          label="造声实际语速（倍）"
          value={tempo}
          min={0.7}
          max={1.3}
          step={0.05}
          onChange={onTempo}
        />
        <div className="flex items-end">
          <VoiceButton
            variant="secondary"
            onClick={() => {
              const values = crypto.getRandomValues(new Uint32Array(1))
              const next = values[0] === Number(seed) ? (values[0] + 1) >>> 0 : values[0]
              onSeed(String(next))
              setSelected('custom')
              setNotice('已更换随机种子。描述保持不变，请生成新样本比较声音。')
            }}
          >
            换个声音（新种子）
          </VoiceButton>
        </div>
      </div>
      <p className="text-[12px] text-on-surface-variant">
        实际语速 0.7–1.3 倍，生成后调整时长并保留音高；1 倍保持模型原速。
      </p>
      <details className="voiceover-disclosure border-b border-outline-variant/30 pb-2">
        <summary>生成参数</summary>
        <div className="py-3">
          <VoiceRadioGroup
            compact
            label="造声生成质量"
            value={String(steps)}
            onChange={(value) => onSteps(Number(value) as 10 | 20)}
            options={[
              { value: '20', label: '精细 · 20 步' },
              { value: '10', label: '快速 · 10 步' },
            ]}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <VoiceInput
            label="造声随机种子"
            type="number"
            value={seed}
            min={0}
            max={4294967295}
            onChange={(event) => onSeed(event.target.value)}
          />
          <VoiceNumber
            label="采样引导 CFG"
            value={cfg}
            min={1}
            max={3}
            step={0.1}
            onChange={onCfg}
          />
          <VoiceNumber
            label="造声增益（dB）"
            value={gainDb}
            min={-12}
            max={6}
            onChange={onGainDb}
          />
        </div>
      </details>
      <VoiceInput
        label="声音方案名称"
        value={name}
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {plan?.builtin && originalPlan && (
          <VoiceButton
            variant="secondary"
            disabled={busy}
            onClick={() => void selectBuiltinVoice()}
          >
            使用内置音色
          </VoiceButton>
        )}
        <VoiceButton
          variant="secondary"
          disabled={submitting || !ready || !validDescription || !validSeed || !validTempo}
          onClick={onPreview}
        >
          {submitting ? '提交中…' : '生成试听样本'}
        </VoiceButton>
        <VoiceButton
          variant="ghost"
          disabled={busy || !name.trim() || !validDescription || !validSeed || !validTempo}
          onClick={() => void save(false)}
        >
          保存声音方案
        </VoiceButton>
        {latest && (
          <>
            <VoiceButton
              variant="ghost"
              onClick={() => onPlay('video:getAudioDataById', latest.assetId!)}
            >
              试听最近生成
            </VoiceButton>
            <VoiceButton
              variant="ghost"
              disabled={busy || !name.trim()}
              onClick={() => void save(true)}
            >
              保存为我的音色
            </VoiceButton>
          </>
        )}
      </div>
      {notice && (
        <p role="status" className="text-[12px] text-on-surface-variant">
          {notice}
        </p>
      )}
      {!validSeed && <p className="text-[12px] text-error">请设置 0–4294967295 的整数种子。</p>}
      {!validTempo && <p className="text-[12px] text-error">请设置 0.7–1.3 倍的实际语速。</p>}
      {Array.from(description.trim()).length > 600 && (
        <p className="text-[12px] text-error">
          声音描述超过 600 字符，请减少特征、情绪或补充要求。
        </p>
      )}
      {!ready && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 text-[12px] text-on-surface-variant"
        >
          <span>{reason}</span>
          <VoiceButton variant="ghost" onClick={onConfigure}>
            配置模型
          </VoiceButton>
        </div>
      )}
    </div>
  )
}
