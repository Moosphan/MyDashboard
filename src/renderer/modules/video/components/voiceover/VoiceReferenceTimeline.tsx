import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { ReferenceDraft } from '@shared/voiceover'
import { moveReferenceBoundary, referenceSelectionError, shiftReferenceSelection, type ReferenceSelection } from '@shared/voice-reference'
import { VoiceButton } from './VoiceControls'

function time(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
}

export function VoiceReferenceTimeline({ draft, selection, disabled, onChange, onAdjustingChange }: {
  draft: ReferenceDraft
  selection: ReferenceSelection
  disabled: boolean
  onChange: (selection: ReferenceSelection) => void
  onAdjustingChange: (adjusting: boolean) => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ boundary: 'start' | 'end' | 'segment'; position: number; selection: ReferenceSelection } | null>(null)
  const [view, setView] = useState({ start: 0, end: draft.duration })
  const span = view.end - view.start
  const percentage = (value: number) => (value - view.start) / span * 100
  const from = Math.max(0, percentage(selection.start))
  const to = Math.min(100, percentage(selection.end))
  const peaks = draft.waveform ?? []
  const maximum = Math.max(0.01, ...peaks)
  const first = Math.floor(view.start / draft.duration * peaks.length)
  const last = Math.ceil(view.end / draft.duration * peaks.length)
  const valid = !referenceSelectionError(draft.duration, selection.start, selection.end)

  const position = (event: PointerEvent) => {
    const bounds = track.current!.getBoundingClientRect()
    return Math.max(0, Math.min(draft.duration, view.start + (event.clientX - bounds.left) / bounds.width * span))
  }
  const begin = (event: PointerEvent<HTMLDivElement>, boundary: 'start' | 'end' | 'segment') => {
    if (disabled || !valid || event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { boundary, position: position(event), selection }
    onAdjustingChange(true)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active) return
    if (active.boundary === 'segment') {
      onChange(shiftReferenceSelection(active.selection, position(event) - active.position, draft.duration))
    } else onChange(moveReferenceBoundary(selection, active.boundary, position(event), draft.duration))
  }
  const finish = () => {
    if (!drag.current) return
    drag.current = null
    onAdjustingChange(false)
  }
  const keyboard = (event: KeyboardEvent, boundary: 'start' | 'end') => {
    if (disabled || !valid) return
    let value = selection[boundary]
    const increment = event.shiftKey ? 1 : 0.1
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') value -= increment
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') value += increment
    else if (event.key === 'Home') value = 0
    else if (event.key === 'End') value = draft.duration
    else return
    event.preventDefault()
    onChange(moveReferenceBoundary(selection, boundary, value, draft.duration))
  }
  const zoom = (factor: number) => {
    const nextSpan = Math.min(draft.duration, Math.max(6, selection.end - selection.start, span * factor))
    const start = Math.max(0, Math.min(draft.duration - nextSpan, (selection.start + selection.end - nextSpan) / 2))
    setView({ start, end: start + nextSpan })
  }

  return <div className="voice-reference-timeline" aria-label="参考录音裁剪">
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <span className="text-[12px] font-medium">截取参考片段</span>
      <div className="flex gap-1"><VoiceButton variant="ghost" disabled={disabled || span <= Math.max(6, selection.end - selection.start)} onClick={() => zoom(0.5)}>放大时间轴</VoiceButton><VoiceButton variant="ghost" disabled={disabled || span >= draft.duration} onClick={() => zoom(2)}>缩小时间轴</VoiceButton></div>
    </div>
    <p id={`trim-help-${draft.id}`} className="text-[12px] text-on-surface-variant">拖动两端截取，拖动选区可平移；方向键微调，Shift 加速。保留连续清晰讲话，避开杂音与长停顿。</p>
    <div className="voice-reference-track" ref={track} data-testid="voice-reference-waveform">
      <svg className="voice-reference-waveform" viewBox="0 0 1000 80" preserveAspectRatio="none" role="img" aria-label="原录音音量波形">
        <line x1="0" y1="40" x2="1000" y2="40" className="voice-reference-baseline" />
        {peaks.slice(first, last).map((peak, index) => {
          const horizontal = ((first + index + 0.5) / peaks.length * draft.duration - view.start) / span * 1000
          const height = Math.max(0.5, Math.sqrt(peak / maximum) * 35)
          return <line key={first + index} x1={horizontal} x2={horizontal} y1={40 - height} y2={40 + height} />
        })}
      </svg>
      {valid && <>
        <div className="voice-reference-mask" style={{ left: 0, width: `${Math.min(100, from)}%` }} />
        <div className="voice-reference-mask" style={{ left: `${Math.max(0, to)}%`, right: 0 }} />
        <div className="voice-reference-selection" style={{ left: `${from}%`, width: `${Math.max(0, to - from)}%` }} onPointerDown={event => begin(event, 'segment')} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />
        {(['start', 'end'] as const).map(boundary => percentage(selection[boundary]) >= 0 && percentage(selection[boundary]) <= 100 && <div
          key={boundary} role="slider" tabIndex={disabled ? -1 : 0} aria-label={boundary === 'start' ? '选段起点' : '选段终点'} aria-disabled={disabled}
          aria-describedby={`trim-help-${draft.id}`} aria-valuemin={boundary === 'start' ? Math.max(0, selection.end - 30) : selection.start + 3}
          aria-valuemax={boundary === 'start' ? selection.end - 3 : Math.min(draft.duration, selection.start + 30)} aria-valuenow={selection[boundary]} aria-valuetext={`${selection[boundary].toFixed(2)} 秒`}
          className="voice-reference-handle" style={{ left: `${percentage(selection[boundary])}%` }}
          onKeyDown={event => keyboard(event, boundary)} onPointerDown={event => begin(event, boundary)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
        ><span aria-hidden="true">Ⅱ</span></div>)}
      </>}
    </div>
    <div className="voice-reference-ticks" aria-hidden="true">{[0, 1, 2, 3, 4].map(tick => <span key={tick}>{time(view.start + span * tick / 4)}</span>)}</div>
    {!peaks.length && <p role="status" className="text-[12px] text-on-surface-variant">此录音未提供波形，可用起止时间选段或重新导入。</p>}
  </div>
}
