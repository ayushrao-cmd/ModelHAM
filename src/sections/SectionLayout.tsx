import { useEffect, useRef, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { hrefFor, parseHash, useFocusRequest } from '../app/router'
import { sectionMeta } from '../app/sections'
import type { Check } from '../engine/health'
import type { SectionId } from '../engine/types'
import { ResultsGate } from '../components/ResultsGate'
import { useModel } from '../state/useModel'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const fieldMounted = (id: string) => [...document.querySelectorAll('[data-field]')].some(el => el.getAttribute('data-field') === id)

/** Failing errors and warnings in this section, as a chip linking to Health. */
function HealthChip({ id }: { id: SectionId }) {
  const mine = useModel().checks.filter(c => c.section === id)
  if (!mine.length) return null
  const errors = mine.filter(c => !c.pass && c.severity === 'error').length
  const warnings = mine.filter(c => !c.pass && c.severity === 'warning').length
  const tone = errors ? 'destructive' : warnings ? 'warning' : 'success'
  const Icon = errors ? CircleAlert : warnings ? TriangleAlert : CircleCheck
  const text = errors || warnings ? [errors && plural(errors, 'error'), warnings && plural(warnings, 'warning')].filter(Boolean).join(', ')
    : mine.length === 1 ? 'Check passes' : `All ${mine.length} checks pass`
  return (
    <a href={`${hrefFor('health')}?section=${id}`} className={cn('inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
      tone === 'destructive' && 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15',
      tone === 'warning' && 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15',
      tone === 'success' && 'border-success/40 bg-success/10 text-success hover:bg-success/15')}>
      <Icon className="size-3.5" aria-hidden="true" />{text}<span className="sr-only">, open Health</span>
    </a>
  )
}

/** Title, one-line description and health summary. Takes focus on navigation, and when a jump names a field that isn't mounted. */
export function SectionHeader({ id }: { id: SectionId }) {
  const s = sectionMeta(id)
  const h1 = useRef<HTMLHeadingElement>(null)
  const n = useFocusRequest(r => r.n)
  useEffect(() => {
    document.title = `${s.label} · Milestone`
    const { focus } = parseHash(window.location.hash)
    // Field effects run after this one, but every field is already in the DOM, so a missing target is known now.
    if (focus) { if (!fieldMounted(focus)) h1.current?.focus({ preventScroll: true }); return }
    if (document.activeElement && document.activeElement !== document.body) h1.current?.focus({ preventScroll: true })
  }, [s, n])
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-2xl">
        <h1 ref={h1} tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none sm:text-[28px] sm:leading-9">{s.label}</h1>
        <p className="mt-1.5 text-[15px] leading-6 text-muted-foreground">{s.description}</p>
      </div>
      <HealthChip id={id} />
    </header>
  )
}

/**
 * Header, an optional full-width strip, then inputs (5/12) beside results (7/12) from 1280px; stacked below.
 * Strip and results are results: pass elements whose components read useResult(); they render only for a complete scenario.
 */
export function SectionLayout({ id, strip, inputs, results }: { id: SectionId; strip?: ReactNode; inputs: ReactNode; results: ReactNode }) {
  return (
    <div className="space-y-6">
      <SectionHeader id={id} />
      {strip && <ResultsGate quiet>{strip}</ResultsGate>}
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-5">{inputs}</div>
        <div className="min-w-0 space-y-4 xl:col-span-7"><ResultsGate>{results}</ResultsGate></div>
      </div>
    </div>
  )
}

/** A results surface: hairline card with padding. */
export const Panel = ({ children, className }: { children: ReactNode; className?: string }) =>
  <Card className={cn('min-w-0 p-5 shadow-card', className)}>{children}</Card>

export interface StatItem { label: string; value: string; sub?: string }
/** A row of KPI tiles. */
export function Stats({ items }: { items: StatItem[] }) {
  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border shadow-card min-[480px]:grid-cols-2 sm:grid-cols-3">
      {items.map(s => (
        <div key={s.label} className="flex flex-col bg-card px-5 py-4">
          <dt className="text-[13px] text-muted-foreground">{s.label}</dt>
          <dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{s.value}</dd>
          {s.sub && <dd className="mt-0.5 text-xs leading-4 text-muted-foreground">{s.sub}</dd>}
        </div>
      ))}
    </dl>
  )
}

const TONE = { ok: 'text-success', error: 'text-destructive', warning: 'text-warning', info: 'text-primary' }
const STATUS = { ok: 'Passes', error: 'Fails', warning: 'Warning', info: 'Note' }

/** A result derived from a health check: status colour and icon, a headline value and the check's message. */
export function CheckCard({ check, value }: { check?: Check; value: string }) {
  if (!check) return null
  const tone = check.pass ? 'ok' : check.severity
  const Icon = tone === 'ok' ? CircleCheck : tone === 'error' ? CircleAlert : tone === 'warning' ? TriangleAlert : Info
  return (
    <Panel className={cn('border-l-[3px]', tone === 'ok' ? 'border-l-success' : tone === 'error' ? 'border-l-destructive'
      : tone === 'warning' ? 'border-l-warning' : 'border-l-primary')}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[13px] font-medium text-muted-foreground">{check.title}</h2>
        <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs font-medium', TONE[tone])}>
          <Icon className="size-3.5" aria-hidden="true" />{STATUS[tone]}
        </span>
      </div>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{check.message}</p>
    </Panel>
  )
}

/** A row of toggle buttons, one pressed. Wraps on narrow screens rather than scrolling. */
export function Segmented<T extends string>({ label, value, options, onChange, className }: {
  label: string; value: T; options: { value: NoInfer<T>; label: ReactNode; name?: string }[]; onChange(v: NoInfer<T>): void; className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1', className)}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} aria-label={o.name} onClick={() => onChange(o.value)}
          className={cn('inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            o.value === value ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
