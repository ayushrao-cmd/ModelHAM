import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { FieldDef } from '../../engine/types'
import { type Bounds, formatNumber, parseNumber } from './parse'

type Kind = FieldDef['kind']
const DEBOUNCE_MS = 150

/**
 * A local draft string over a stored number. Valid drafts commit after a short pause or on blur;
 * invalid drafts stay local with an error, so the model never sees them.
 */
function useNumberDraft(value: number, kind: Kind, { min, max }: Bounds, commit: (n: number) => void) {
  const bounds = { min, max }
  const [draft, setDraft] = useState(() => formatNumber(value, kind))
  const [error, setError] = useState<string | null>(null)
  const draftRef = useRef(draft)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const flush = useRef<(() => void) | null>(null)

  const show = (s: string) => { draftRef.current = s; setDraft(s) }
  const cancel = () => { clearTimeout(timer.current); flush.current = null }

  // The stored value changed elsewhere (reset, slider, scenario switch): show it, unless the draft already means it.
  useEffect(() => {
    const p = parseNumber(draftRef.current, kind, { min, max })
    if (p.ok && p.value === value) return
    cancel()
    show(formatNumber(value, kind))
    setError(null)
  }, [value, kind, min, max])

  // Do not drop a pending edit if the field unmounts inside the debounce window.
  useEffect(() => () => { clearTimeout(timer.current); flush.current?.() }, [])

  return {
    draft, error,
    onChange(raw: string) {
      show(raw)
      cancel()
      const p = parseNumber(raw, kind, bounds)
      setError(p.ok ? null : p.error)
      if (!p.ok || p.value === value) return
      flush.current = () => { flush.current = null; commit(p.value) }
      timer.current = setTimeout(() => flush.current?.(), DEBOUNCE_MS)
    },
    onBlur() {
      cancel()
      const p = parseNumber(draftRef.current, kind, bounds)
      if (!p.ok) return
      if (p.value !== value) commit(p.value)
      show(formatNumber(p.value, kind))
    },
  }
}

export const UNIT: Partial<Record<Kind, string>> = { money: '₹ Cr', percent: '%', percentList: '%', days: 'days', years: 'yrs' }
const PAD: Record<string, string> = { '₹ Cr': 'pr-12', '%': 'pr-7', days: 'pr-12', yrs: 'pr-10' }

export interface NumberFieldProps {
  id: string
  value: number
  kind: Kind
  /** FieldDef min/max: drafts outside them show an error and are never committed. */
  min?: number
  max?: number
  onCommit(n: number): void
  /** Ids of the field's own descriptions (help, check messages); the parse error is added here. */
  describedBy?: string
  /** A failing check on this field: 'error' or 'warning' tones the border. */
  tone?: 'error' | 'warning'
  /** Show the unit inside the input (off for compact list cells, whose header names the unit). */
  unit?: boolean
  className?: string
  'aria-label'?: string
}

export function NumberField({ id, value, kind, min, max, onCommit, describedBy, tone, unit = true, className, 'aria-label': ariaLabel }: NumberFieldProps) {
  const { draft, error, onChange, onBlur } = useNumberDraft(value, kind, { min, max }, onCommit)
  const u = unit ? UNIT[kind] : undefined
  const unitId = `${id}-unit`, errId = `${id}-parse`
  const ids = [u && unitId, error && errId, describedBy].filter(Boolean).join(' ') || undefined
  const bad = error ? 'error' : tone
  return (
    <div className={className}>
      <div className="relative">
        <Input id={id} inputMode="decimal" autoComplete="off" spellCheck={false} value={draft} aria-label={ariaLabel}
          aria-invalid={bad ? true : undefined} aria-describedby={ids}
          onChange={e => onChange(e.target.value)} onBlur={onBlur}
          className={cn('bg-card text-right tabular-nums', u && PAD[u],
            bad === 'error' && 'border-destructive focus-visible:ring-destructive',
            bad === 'warning' && 'border-warning focus-visible:ring-warning')} />
        {u && <span id={unitId} className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{u}</span>}
      </div>
      {/* Always mounted so screen readers announce the error as it appears. */}
      <p id={errId} aria-live="polite" className={cn('text-xs leading-4 text-destructive', error && 'mt-1')}>{error}</p>
    </div>
  )
}
