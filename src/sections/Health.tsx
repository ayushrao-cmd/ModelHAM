import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CheckIcon, RANK, status } from '../app/CommandPalette'
import { go, hashParam, useRoute } from '../app/router'
import { SECTIONS } from '../app/sections'
import type { Check } from '../engine/health'
import { fieldById } from '../fields'
import { useStore } from '../state/store'
import { FillProgress } from '../components/ResultsGate'
import { useModel } from '../state/useModel'
import { SectionHeader, Segmented } from './SectionLayout'

/** Navigate to a check's field (in the field's own section), or to its section when it names no field. */
export const jumpTo = (c: Check) => go((c.fieldId && fieldById(c.fieldId)?.section) || c.section, c.fieldId)

const MAX_NAMED = 3 // a flip toast names this many checks, then counts the rest
/** "2 checks changed: X now failing, Y now passing", or null when no check present in both runs flipped. */
export function flipSummary(prev: Map<string, boolean>, checks: Check[]): string | null {
  const flipped = checks.filter(c => prev.has(c.id) && prev.get(c.id) !== c.pass)
  if (!flipped.length) return null
  const named = flipped.slice(0, MAX_NAMED).map(c => `${c.title} now ${c.pass ? 'passing' : 'failing'}`)
  const more = flipped.length > MAX_NAMED ? `, and ${flipped.length - MAX_NAMED} more` : ''
  return `${flipped.length} check${flipped.length === 1 ? '' : 's'} changed: ${named.join(', ')}${more}`
}

const FLIP_SETTLE_MS = 800 // a burst of edits (typing) toasts once, this long after the last change

/**
 * Mounted once in the shell: one toast per settled burst of edits that flips any check, compared with the state before
 * the burst, so partial values mid-typing don't toast. Switching scenarios is not an edit, so it resets the baseline.
 * While the scenario has empty fields its Required checks don't toast; filling the last one toasts once that results are live.
 */
export function CheckFlipToasts() {
  const { checks, active } = useModel()
  const activeId = useStore(s => s.activeId)
  const projectId = useStore(s => s.projectId)
  const scope = `${projectId}/${activeId}`
  const complete = active !== null
  const settled = useRef<{ scope: string; complete: boolean; pass: Map<string, boolean> } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    clearTimeout(timer.current)
    const p = settled.current, now = { scope, complete, pass: new Map(checks.map(c => [c.id, c.pass])) }
    if (!p || p.scope !== scope || !complete) { settled.current = now; return }
    if (!p.complete) { settled.current = now; toast.success('All fields filled — results are live'); return }
    timer.current = setTimeout(() => {
      settled.current = now
      const msg = flipSummary(p.pass, checks)
      if (!msg) return
      const worse = checks.some(c => p.pass.get(c.id) === true && !c.pass)
      if (worse) toast.warning(msg); else toast.success(msg)
    }, FLIP_SETTLE_MS)
  }, [checks, scope, complete])
  useEffect(() => () => clearTimeout(timer.current), [])
  return null
}

type Filter = 'all' | 'error' | 'warning' | 'info' | 'passed'
const matches = (c: Check, f: Filter) => f === 'all' || (f === 'passed' ? c.pass : !c.pass && c.severity === f)

/** Share of checks passing as a ring; the track is a lighter step of the same hue as the fill. */
function ScoreRing({ passed, total, tone }: { passed: number; total: number; tone: string }) {
  const R = 42, C = 2 * Math.PI * R, share = total ? passed / total : 1
  return (
    <div className={cn('relative size-28 shrink-0', tone)}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth="8" />
        <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${share * C} ${C}`} className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-300" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground">
        <span className="text-xl font-semibold tabular-nums">{passed}/{total}</span>
        <span className="text-xs text-muted-foreground">passed</span>
      </div>
    </div>
  )
}

function CheckRow({ c }: { c: Check }) {
  const field = c.fieldId ? fieldById(c.fieldId) : undefined
  return (
    <li className="flex items-start gap-2 px-4 py-3 sm:gap-3 sm:px-5">
      <div className="flex min-w-0 flex-1 gap-3">
        <span className="mt-0.5 shrink-0 [&>svg]:size-4"><CheckIcon c={c} /></span>
        <div className="min-w-0">
          <p className={cn('text-sm font-medium leading-5', c.pass && 'text-muted-foreground')}>
            <span className="sr-only">{status(c)}: </span>{c.title}
          </p>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{c.message}</p>
        </div>
      </div>
      {field && (
        <Button variant="ghost" size="sm" className="-mr-2 h-8 shrink-0 px-2 text-xs" onClick={() => jumpTo(c)} aria-label={`Go to field: ${field.label}`}>
          <span className="hidden sm:inline">Go to field</span><ArrowRight className="size-4 sm:size-3.5" aria-hidden="true" />
        </Button>
      )}
    </li>
  )
}

/** `#/health?section=notes`: the method notes, the original workbook's quirks the model reproduces. */
export const NOTES = 'notes'

export function Health() {
  const { checks: all, score, missing } = useModel()
  const { param } = useRoute()
  const checks = all.filter(c => c.group !== 'notes'), methodNotes = all.filter(c => c.group === 'notes')
  const withChecks = SECTIONS.filter(s => checks.some(c => c.section === s.id))
  const fromHash = param('section')
  const routeSection = withChecks.some(s => s.id === fromHash) || (fromHash === NOTES && methodNotes.length) ? fromHash! : 'all'
  const [section, setSection] = useState(routeSection)
  useEffect(() => setSection(routeSection), [routeSection]) // a later deep link wins
  // Any navigation re-reads the filter, so the plain section link (no ?section=) shows all sections again.
  useEffect(() => {
    const sync = () => { const s = hashParam(window.location.hash, 'section'); setSection(SECTIONS.some(x => x.id === s) || s === NOTES ? s! : 'all') }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  const [filter, setFilter] = useState<Filter>('all')

  const pickSection = (v: string) => {
    setSection(v)
    // Keep the link shareable without a hashchange (which would move focus to the page heading).
    history.replaceState(null, '', v === 'all' ? '#/health' : `#/health?section=${v}`)
  }

  const inSection = section === NOTES ? [] : checks.filter(c => section === 'all' || c.section === section)
  const showNotes = methodNotes.length > 0 && (section === 'all' || section === NOTES) && (filter === 'all' || filter === 'info')
  const count = (f: Filter) => inSection.filter(c => matches(c, f)).length
  // Failing first (errors, warnings, notes), then passing; stable within each, so FIELDS order holds.
  const shown = inSection.filter(c => matches(c, filter)).sort((a, b) => Number(a.pass) - Number(b.pass) || RANK[a.severity] - RANK[b.severity])
  const notes = checks.filter(c => !c.pass && c.severity === 'info').length
  const tone = score.errors ? 'text-destructive' : score.warnings ? 'text-warning' : 'text-success'
  const FILTERS: [Filter, string][] = [['all', 'All'], ['error', 'Errors'], ['warning', 'Warnings'], ['info', 'Info'], ['passed', 'Passed']]

  return (
    <div className="space-y-6">
      <SectionHeader id="health" />
      <Card className="flex flex-col items-center gap-5 p-5 shadow-card sm:flex-row sm:gap-8">
        <ScoreRing passed={score.passed} total={score.total} tone={tone} />
        <dl className="grid w-full grid-cols-3 gap-4 sm:w-auto sm:gap-10">
          {[['Errors', score.errors, 'text-destructive'], ['Warnings', score.warnings, 'text-warning'], ['Notes', notes, 'text-foreground']].map(([l, n, t]) => (
            <div key={l as string}>
              <dt className="text-[13px] text-muted-foreground">{l}</dt>
              <dd className={cn('mt-1 text-2xl font-semibold tabular-nums', n ? t : 'text-foreground')}>{n}</dd>
            </div>
          ))}
        </dl>
        {missing.paths.length ? (
          <div className="w-full sm:ml-auto sm:max-w-xs">
            <FillProgress missing={missing} />
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground">Model checks run once every input has a value.</p>
          </div>
        ) : (
          <p className="text-[13px] leading-5 text-muted-foreground sm:ml-auto sm:max-w-xs">
            Errors make the model wrong or unbankable; warnings need a look; notes are for information.
          </p>
        )}
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented label="Show checks" value={filter} onChange={setFilter}
          options={FILTERS.map(([v, l]) => ({ value: v, label: <>{l}<span className="tabular-nums text-muted-foreground">{count(v)}</span></>, name: `${l} ${count(v)}` }))} />
        <Select value={section} onValueChange={pickSection}>
          <SelectTrigger aria-label="Section" className="h-9 w-full bg-card sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {withChecks.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            {methodNotes.length > 0 && <SelectItem value={NOTES}>Method notes</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {shown.length || showNotes ? withChecks.map(s => {
        const mine = shown.filter(c => c.section === s.id)
        if (!mine.length) return null
        return (
          <section key={s.id} aria-label={`${s.label} checks`}>
            <h2 className="mb-2 flex items-baseline gap-2 text-[15px] font-semibold">
              {s.label}<span className="text-[13px] font-normal tabular-nums text-muted-foreground">{mine.length}</span>
            </h2>
            <Card className="overflow-hidden shadow-card">
              <ul className="divide-y">{mine.map(c => <CheckRow key={c.id} c={c} />)}</ul>
            </Card>
          </section>
        )
      }) : (
        <p role="status" className="rounded-lg border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">
          No checks match these filters.
        </p>
      )}
      {showNotes && (
        <section id="method-notes" aria-label="Method notes">
          <h2 className="mb-1 flex items-baseline gap-2 text-[15px] font-semibold">
            Method notes<span className="text-[13px] font-normal tabular-nums text-muted-foreground">{methodNotes.length}</span>
          </h2>
          <p className="mb-2 max-w-3xl text-[13px] leading-5 text-muted-foreground">
            The numbers follow the original workbook's method, quirks included. Each note is one the model reproduces, or a
            fixed cell of the original it generalises, with the consistent alternative where it matters. Not counted as checks.
          </p>
          <Card className="overflow-hidden shadow-card">
            <ul className="divide-y">{methodNotes.map(c => <CheckRow key={c.id} c={c} />)}</ul>
          </Card>
        </section>
      )}
    </div>
  )
}
