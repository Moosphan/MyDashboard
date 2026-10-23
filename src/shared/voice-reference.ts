export interface ReferenceSelection { start: number; end: number }

export function referenceSelectionError(duration: number, start: number, end: number): string | null {
  return !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration + 0.000001 || end - start < 3 - 0.000001 || end - start > 30 + 0.000001
    ? '请选择 3–30 秒的参考片段'
    : null
}

export function moveReferenceBoundary(selection: ReferenceSelection, boundary: 'start' | 'end', value: number, duration: number): ReferenceSelection {
  const rounded = Math.round(value * 100) / 100
  const minimum = boundary === 'start' ? Math.max(0, selection.end - 30) : selection.start + 3
  const maximum = boundary === 'start' ? selection.end - 3 : Math.min(duration, selection.start + 30)
  return { ...selection, [boundary]: Math.max(minimum, Math.min(maximum, rounded)) }
}

export function shiftReferenceSelection(selection: ReferenceSelection, offset: number, duration: number): ReferenceSelection {
  const length = selection.end - selection.start
  const roundedStart = Math.round((selection.start + offset) * 100) / 100
  const start = Math.max(0, Math.min(duration - length, roundedStart))
  return { start, end: Math.min(duration, start + length) }
}
