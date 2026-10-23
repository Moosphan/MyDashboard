import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useId, type ReactNode } from 'react'
import { VoiceInput } from './VoiceControls'

export function VoiceSelect({ label, value, onChange, options, placeholder = '请选择', action }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; placeholder?: string; action?: ReactNode }) {
  const id = useId()
  return <div className="voiceover-field-group">
    <div className="voiceover-field-label"><label htmlFor={id}>{label}</label>{action}</div>
    <Select value={value} onValueChange={onChange}><SelectTrigger id={id} size="sm" className="voiceover-field [&>span:first-child]:truncate [&>span:last-child]:rotate-90" aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="voiceover-menu max-h-64">{options.map(option => <SelectItem className="voiceover-menu-item" key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
    </Select></div>
}

export function VoiceNumber({ label, value, onChange, min, max, step = 1, disabled }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; disabled?: boolean }) {
  return <VoiceInput label={label} type="number" value={value} onChange={event => onChange(Number(event.target.value))} min={min} max={max} step={step} disabled={disabled} />
}
