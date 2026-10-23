import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import type { ReferenceDraft, VoiceProfile } from '@shared/voiceover'
import { referenceSelectionError } from '@shared/voice-reference'
import { voiceCall } from '../../hooks/useVoiceover'
import { VoiceNumber } from './VoiceEngineFields'
import { VoiceButton, VoiceInput, VoiceTextArea } from './VoiceControls'
import { VoiceReferenceTimeline } from './VoiceReferenceTimeline'

export function VoiceProfilePanel({ profiles, refresh, onPlay, onStopDraftAudio, onError, onSelect }: { profiles: VoiceProfile[]; refresh: () => Promise<void>; onPlay: (channel: string, ...args: unknown[]) => Promise<void>; onStopDraftAudio: () => void; onError: (message: string | null) => void; onSelect: (id: string) => void }) {
  const [draft, setDraft] = useState<ReferenceDraft | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [transcript, setTranscript] = useState('')
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(8)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [recognizing, setRecognizing] = useState(false)
  const [recognitionError, setRecognitionError] = useState<string | null>(null)
  const [recognizedRange, setRecognizedRange] = useState('')
  const [retry, setRetry] = useState(0)
  const [adjusting, setAdjusting] = useState(false)
  const range = draft ? `${draft.id}:${start}:${end}` : ''
  const selectionError = draft ? referenceSelectionError(draft.duration, start, end) : null

  useEffect(() => { onStopDraftAudio() }, [range, onStopDraftAudio])

  useEffect(() => {
    if (!range) return
    setTranscript(''); setRecognizedRange(''); setRecognitionError(null)
  }, [range])

  useEffect(() => {
    if (!draft) return
    let stale = false
    if (selectionError || adjusting || recognizedRange === range) { setRecognizing(false); return }
    setRecognizing(true); setRecognitionError(null)
    const timer = window.setTimeout(async () => {
      try {
        const result = await voiceCall<{ transcript: string }>('tts:transcribeReference', draft.id, start, end)
        if (!stale) { setTranscript(result.transcript); setRecognizedRange(range) }
      } catch (error) { if (!stale) setRecognitionError((error as Error).message) }
      finally { if (!stale) setRecognizing(false) }
    }, 500)
    return () => { stale = true; window.clearTimeout(timer) }
  }, [draft, start, end, retry, range, selectionError, adjusting, recognizedRange])

  const importReference = async () => {
    setBusy(true); onError(null)
    try {
      const result = await voiceCall<ReferenceDraft | null>('tts:importReference')
      if (result) { setDraft(result); setName(result.name); setStart(0); setEnd(Math.floor(Math.min(result.duration, 15) * 100) / 100); setTranscript(''); setEditing(null) }
    } catch (error) { onError((error as Error).message) }
    finally { setBusy(false) }
  }
  const save = async () => {
    setBusy(true); onError(null)
    try {
      const result = await voiceCall<VoiceProfile>('tts:saveProfile', { draftId: draft?.id, profileId: editing ?? undefined, name, transcript: !draft || recognizedRange === range ? transcript : undefined, start, end })
      await refresh(); setDraft(null); setEditing(null); onSelect(result.id)
    } catch (error) { onError((error as Error).message) }
    finally { setBusy(false) }
  }
  const remove = async (id: string) => {
    try { await voiceCall('tts:deleteProfile', id); await refresh() }
    catch (error) { onError((error as Error).message) }
  }
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3"><div><h4 className="text-[14px] font-medium">我的音色</h4><p className="text-[12px] text-on-surface-variant mt-1">导入一段录音，两个模型都能使用。</p></div><VoiceButton className="shrink-0" onClick={importReference} disabled={busy}><span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>{busy ? '处理中…' : '导入参考录音'}</VoiceButton></div>
    {(draft || editing) && <div className="space-y-4 border border-outline-variant/60 rounded-[12px] p-4">
      <VoiceInput label="音色名称" maxLength={80} value={name} onChange={event => setName(event.target.value)} />
      {draft && <>
        <div className="flex items-center justify-between gap-2"><p className="text-[12px] text-on-surface-variant">原录音 {draft.duration.toFixed(2)} 秒 · 建议选取 6–15 秒</p><VoiceButton className="voiceover-action-compact shrink-0" variant="ghost" disabled={busy || adjusting || Boolean(selectionError)} onClick={() => onPlay('tts:getDraftAudio', draft.id, start, end)}>试听选段</VoiceButton></div>
        <VoiceReferenceTimeline key={draft.id} draft={draft} selection={{ start, end }} disabled={busy} onChange={selection => { setStart(selection.start); setEnd(selection.end) }} onAdjustingChange={setAdjusting} />
        <div className="grid grid-cols-2 gap-3"><VoiceNumber label="起点（秒）" value={start} min={0} max={draft.duration} step={0.01} onChange={setStart} disabled={busy} /><VoiceNumber label="终点（秒）" value={end} min={0} max={draft.duration} step={0.01} onChange={setEnd} disabled={busy} /></div>
        {selectionError ? <p role="alert" className="text-[12px] text-error">{selectionError}</p> : <p className="text-[12px] text-on-surface-variant tabular-nums">已选 {start.toFixed(2)}–{end.toFixed(2)} 秒 · 共 {(end - start).toFixed(2)} 秒 · 保存后只用此片段克隆，原录音保留。</p>}
        {!selectionError && <div role="status" className={`rounded-[8px] px-3 py-2 text-[12px] flex items-center gap-2 ${recognitionError ? 'bg-error/5 text-error' : 'bg-surface-container-low text-on-surface-variant'}`}><span className="flex-1 min-w-0">{adjusting ? '正在调整选段，松开后自动识别…' : recognizing ? '正在后台识别参考片段，无需手动输入文字…' : recognitionError ? '自动识别未完成，可重试或展开文字校对。' : '参考文字已自动提取，可以直接保存。'}</span>{recognitionError && <VoiceButton variant="ghost" className="voiceover-action-compact" onClick={() => { setRecognizedRange(''); setRetry(value => value + 1) }}>重试</VoiceButton>}</div>}
      </>}
      <details className="voiceover-disclosure" open={recognitionError ? true : undefined}><summary>{draft ? '识别文字 · 可选校对' : '参考文字 · 可选编辑'}</summary>{recognitionError && <p className="text-error text-[12px] my-2 break-words">{recognitionError}</p>}<VoiceTextArea label="参考文字校对" hideLabel aria-label="参考文字校对" rows={3} maxLength={3000} disabled={recognizing} value={transcript} onChange={event => { setTranscript(event.target.value); setRecognizedRange(range) }} placeholder="系统自动识别后显示在这里，必要时可自行修改" /></details>
      <div className="flex gap-2"><VoiceButton onClick={save} disabled={busy || recognizing || adjusting || Boolean(selectionError) || !name.trim() || Boolean(draft && (recognizedRange !== range || !transcript.trim()))}>{recognizing ? '识别中…' : '保存音色'}</VoiceButton><VoiceButton variant="ghost" disabled={busy} onClick={() => { setDraft(null); setEditing(null); setRecognitionError(null); setRecognizing(false) }}>取消</VoiceButton></div>
    </div>}
    {profiles.length === 0 && !draft && <div className="text-center py-10 px-5 rounded-[12px] border border-dashed border-outline-variant/60 text-on-surface-variant"><span className="material-symbols-outlined text-[32px] text-primary/60" aria-hidden="true">record_voice_over</span><p className="mt-2 text-[14px]">创建你的第一个声音</p><p className="mt-1 text-[12px]">选择清晰、无背景音乐的录音，参考文字会自动提取。</p></div>}
    {profiles.map(profile => { const reference = profile.revisions.find(item => item.revision === profile.currentRevision)!; return <div key={profile.id} className="flex items-center gap-2 rounded-[12px] border border-outline-variant/60 p-3"><span className="material-symbols-outlined text-primary/70 text-[24px]" aria-hidden="true">account_circle</span><div className="flex-1 min-w-0"><strong className="text-[13px] font-medium block truncate" title={profile.name}>{profile.name}</strong><p className="text-[12px] text-on-surface-variant">{reference.duration.toFixed(2)} 秒 · v{profile.currentRevision}</p></div><VoiceButton className="voiceover-action-compact" variant="ghost" onClick={() => onPlay('tts:getProfileAudio', profile.id)}>试听</VoiceButton><VoiceButton className="voiceover-action-compact" variant="secondary" onClick={() => onSelect(profile.id)}>使用</VoiceButton><VoiceButton className="voiceover-action-compact" variant="ghost" onClick={() => { setEditing(profile.id); setDraft(null); setName(profile.name); setTranscript(reference.transcript); setRecognitionError(null); setRecognizing(false) }}>编辑</VoiceButton><VoiceButton className="voiceover-action-compact" variant="ghost" onClick={() => setDeleting(profile.id)}>移除</VoiceButton></div> })}
    <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="移除音色？" description="此音色将不再用于新任务，已生成的音频会保留。运行中的任务需先取消。" confirmText="移除音色" variant="danger" onConfirm={() => { if (deleting) void remove(deleting) }} />
  </div>
}
