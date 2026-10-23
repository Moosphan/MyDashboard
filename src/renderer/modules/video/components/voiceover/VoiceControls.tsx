import { forwardRef, useId, type CSSProperties, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const VoiceButton = forwardRef<HTMLButtonElement, ButtonProps>(({ className, ...props }, ref) => (
  <Button ref={ref} size="sm" className={cn('voiceover-action', className)} {...props} />
))
VoiceButton.displayName = 'VoiceButton'

export function VoiceInput({ label, className, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return <div className="voiceover-field-group">
    <label htmlFor={inputId} className="voiceover-field-label">{label}</label>
    <input id={inputId} className={cn('voiceover-field', className)} {...props} />
  </div>
}

export function VoiceTextArea({ label, trailing, hideLabel, className, id, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; trailing?: ReactNode; hideLabel?: boolean }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return <div className="voiceover-field-group">
    <div className={hideLabel ? 'sr-only' : 'voiceover-field-label'}><label htmlFor={inputId}>{label}</label>{trailing}</div>
    <textarea id={inputId} className={cn('voiceover-field voiceover-textarea', className)} {...props} />
  </div>
}

export function VoiceRadioGroup({ label, value, onChange, options, compact = false }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; compact?: boolean }) {
  const name = useId()
  return <fieldset aria-label={label} className={compact ? 'voiceover-choice-group' : 'voiceover-radio-group'}>
    {options.map(option => <label key={option.value} className={compact ? 'voiceover-choice' : 'voiceover-radio'}>
      <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
      {compact && <span className="material-symbols-outlined voiceover-choice-check" aria-hidden="true">check</span>}
      <span>{option.label}</span>
    </label>)}
  </fieldset>
}

export function VoiceSlider({ label, value, onChange, min, max, unit = '' }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; unit?: string }) {
  const id = useId()
  const display = `${value > 0 ? '+' : ''}${value}${unit}`
  return <div className="voiceover-slider-group">
    <div className="voiceover-field-label"><label htmlFor={id}>{label}</label><output htmlFor={id} className="voiceover-value">{display}</output></div>
    <input id={id} type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))} aria-valuetext={display} className="voiceover-slider" style={{ '--voiceover-progress': `${(value - min) / (max - min) * 100}%` } as CSSProperties} />
  </div>
}
