import { useRef, useState } from 'react'
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { FieldDef } from '../engine/types'
import { FIELDS } from '../fields'
import { fmt } from '../lib/format'
import { getAt, setAt } from '../lib/path'
import { type Scenario, useStore } from '../state/store'
import { resultFor } from '../state/useModel'
import { KPIS, kpiDelta } from './Overview'
import { Panel, SectionHeader } from './SectionLayout'

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const KEY_LABEL: Record<string, string> = { day: 'day', physical: 'physical', financial: 'financial', progress: 'progress', shareOfBid: 'weight' }

/** One value as its field kind displays it. List elements are percentages, except milestone days and resurfacing years. */
function show(f: FieldDef, v: unknown, key?: string): string {
  if (v === undefined) return '—'
  if (typeof v === 'string') return f.kind === 'date' ? fmt.date(v) : f.options?.find(o => o.value === v)?.label ?? v
  if (typeof v === 'boolean') return v ? 'On' : 'Off'
  if (typeof v !== 'number') return String(v)
  if (key === 'day') return `Day ${fmt.num(v, 0)}`
  if (f.kind === 'money') return fmt.cr(v)
  if (f.kind === 'days') return `${fmt.num(v, 0)} days`
  if (f.kind === 'years') return `${fmt.num(v, 0)} years`
  if (f.kind === 'number') return fmt.num(v)
  return fmt.pct(v) // percent, and the elements of percent, milestone and tranche lists
}

type Values = Pick<Scenario, 'inputs' | 'empty'>
/** The scenario's inputs with every empty leaf removed (shown as '—'), so a neutral placeholder never displays. */
const withoutEmpty = (s: Values) => s.empty.reduce<unknown>((i, p) => setAt(i, p, undefined), s.inputs) as object

/** Every input that differs between two scenarios; lists compare element by element. */
export function diffInputs(sa: Values, sb: Values) {
  const out: { id: string; label: string; a: string; b: string }[] = []
  const a = withoutEmpty(sa), b = withoutEmpty(sb)
  for (const f of FIELDS) {
    const va = getAt(a, f.id), vb = getAt(b, f.id)
    if (same(va, vb)) continue
    if (!Array.isArray(va) || !Array.isArray(vb)) { out.push({ id: f.id, label: f.label, a: show(f, va), b: show(f, vb) }); continue }
    for (let k = 0; k < Math.max(va.length, vb.length); k++) {
      const ea: unknown = va[k], eb: unknown = vb[k]
      if (same(ea, eb)) continue
      const keys = isObj(ea) ? Object.keys(ea) : isObj(eb) ? Object.keys(eb) : null
      if (!keys) { out.push({ id: `${f.id}.${k}`, label: `${f.label} ${k + 1}`, a: show(f, ea), b: show(f, eb) }); continue }
      for (const key of keys) {
        const xa = isObj(ea) ? ea[key] : undefined, xb = isObj(eb) ? eb[key] : undefined
        if (!same(xa, xb)) out.push({ id: `${f.id}.${k}.${key}`, label: `${f.label} ${k + 1}, ${KEY_LABEL[key] ?? key}`, a: show(f, xa, key), b: show(f, xb, key) })
      }
    }
  }
  return out
}

function ScenarioRow({ s, onDelete }: { s: Scenario; onDelete(s: Scenario): void }) {
  const { activeId, baseId, scenarios, setActive, setBase, createScenario, renameScenario } = useStore()
  const [editing, setEditing] = useState(false)
  const cancelled = useRef(false) // Esc unmounts the input, and the browser blurs it on the way out: don't commit that blur
  const isActive = s.id === activeId, isBase = s.id === baseId
  const commit = (v: string) => { if (!cancelled.current) renameScenario(s.id, v); setEditing(false) }
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {editing ? (
          <Input autoFocus defaultValue={s.name} aria-label={`Rename ${s.name}`} className="h-8 max-w-xs bg-card"
            onBlur={e => commit(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(e.currentTarget.value); if (e.key === 'Escape') { cancelled.current = true; setEditing(false) } }} />
        ) : <span className="truncate text-sm font-medium">{s.name}</span>}
        {isActive && <Badge variant="outline" className="shrink-0 rounded-full border-primary/40 bg-primary/10 font-medium text-foreground">Active</Badge>}
        {isBase && <Badge variant="outline" className="shrink-0 rounded-full font-medium">Base</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {!isActive && <Button size="sm" variant="outline" className="h-8" onClick={() => setActive(s.id)}>Open<span className="sr-only"> {s.name}</span></Button>}
        {!isBase && <Button size="sm" variant="ghost" className="h-8" onClick={() => setBase(s.id)} aria-label={`Make ${s.name} the base`}>Make base</Button>}
        <Button size="icon" variant="ghost" className="size-8" title="Rename" aria-label={`Rename ${s.name}`} onClick={() => { cancelled.current = false; setEditing(true) }}><Pencil aria-hidden="true" /></Button>
        <Button size="icon" variant="ghost" className="size-8" title="Duplicate" aria-label={`Duplicate ${s.name}`}
          onClick={() => { createScenario(`${s.name} copy`, s.id); toast.success(`Duplicated ${s.name}`) }}><Copy aria-hidden="true" /></Button>
        <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" title="Delete" aria-label={`Delete ${s.name}`}
          disabled={scenarios.length === 1} onClick={() => onDelete(s)}><Trash2 aria-hidden="true" /></Button>
      </div>
    </li>
  )
}

function Picker({ label, value, onChange, scenarios }: { label: string; value: string; onChange(id: string): void; scenarios: Scenario[] }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span aria-hidden="true" className="text-sm font-medium">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="h-9 bg-card"><SelectValue /></SelectTrigger>
        <SelectContent>{scenarios.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}

const th = 'whitespace-nowrap border-b px-2 py-2 text-xs font-medium text-muted-foreground sm:px-3'
const td = 'border-b border-border/60 px-2 py-1.5 tabular-nums sm:px-3'
const num = 'whitespace-nowrap text-right'

function Compare({ scenarios }: { scenarios: Scenario[] }) {
  const { baseId, activeId, compareId, setCompare } = useStore()
  const has = (id?: string | null) => scenarios.some(s => s.id === id)
  const [pickedA, setA] = useState(baseId)
  const a = has(pickedA) ? pickedA : baseId
  const want = compareId ?? activeId
  const b = has(want) && want !== a ? want : (scenarios.find(s => s.id !== a)?.id ?? a)
  const A = scenarios.find(s => s.id === a)!, B = scenarios.find(s => s.id === b)!
  const ra = resultFor(A), rb = resultFor(B)
  const diffs = diffInputs(A, B)
  return (
    <Panel className="space-y-5">
      <h2 className="text-[15px] font-semibold leading-6">Compare</h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Picker label="Scenario A" value={a} onChange={setA} scenarios={scenarios} />
        <Picker label="Scenario B" value={b} onChange={setCompare} scenarios={scenarios} />
      </div>
      {a === b ? <p className="text-sm text-muted-foreground">Pick two different scenarios.</p> : <>
        <div role="region" aria-label="Results comparison" tabIndex={0} className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <caption className="mb-2 text-left text-sm font-medium">Results</caption>
            <thead><tr>
              <th scope="col" className={cn(th, 'pl-0 text-left')}>Metric</th>
              <th scope="col" className={cn(th, 'text-right')}>{A.name}</th>
              <th scope="col" className={cn(th, 'text-right')}>{B.name}</th>
              <th scope="col" className={cn(th, 'text-right')}>B − A</th>
            </tr></thead>
            <tbody>{KPIS.map(k => {
              const va = ra && k.get(ra), vb = rb && k.get(rb), d = ra && rb ? kpiDelta(vb, va) : undefined
              const tone = d == null || Math.abs(d) < 1e-9 ? 'text-muted-foreground' : (d > 0) === (k.good === 'up') ? 'text-success' : 'text-destructive'
              return (
                <tr key={k.key}>
                  <th scope="row" className={cn(td, 'min-w-28 pl-0 text-left font-normal')}>{k.label}</th>
                  <td className={cn(td, num, !ra && 'text-muted-foreground')}>{ra ? k.format(va) : 'Incomplete'}</td>
                  <td className={cn(td, num, !rb && 'text-muted-foreground')}>{rb ? k.format(vb) : 'Incomplete'}</td>
                  <td className={cn(td, num, 'font-medium', tone)}>{d == null ? '—' : Math.abs(d) < 1e-9 ? 'Same' : k.formatDelta(d)}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
        <div role="region" aria-label="Input differences" tabIndex={0} className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <caption className="mb-2 text-left text-sm font-medium">
              Inputs that differ <span className="font-normal text-muted-foreground">({diffs.length})</span>
            </caption>
            <thead><tr>
              <th scope="col" className={cn(th, 'pl-0 text-left')}>Input</th>
              <th scope="col" className={cn(th, 'text-right')}>{A.name}</th>
              <th scope="col" className={cn(th, 'text-right')}>{B.name}</th>
            </tr></thead>
            <tbody>
              {diffs.map(d => (
                <tr key={d.id}>
                  <th scope="row" className={cn(td, 'pl-0 text-left font-normal')}>{d.label}</th>
                  <td className={cn(td, num)}>{d.a}</td>
                  <td className={cn(td, num, 'font-medium')}>{d.b}</td>
                </tr>
              ))}
              {!diffs.length && <tr><td colSpan={3} className="py-3 text-muted-foreground">Every input is the same.</td></tr>}
            </tbody>
          </table>
        </div>
      </>}
    </Panel>
  )
}

export function Scenarios() {
  const { scenarios, baseId, createScenario, setActive, deleteScenario } = useStore()
  const [deleting, setDeleting] = useState<Scenario | null>(null)
  const create = () => {
    const id = createScenario(`Scenario ${scenarios.length + 1}`, baseId)
    setActive(id)
    toast.success('Created a copy of the base scenario and opened it')
  }
  return (
    <div className="space-y-6">
      <SectionHeader id="scenarios" />
      <Panel className="p-0">
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 className="text-[15px] font-semibold leading-6">Saved scenarios</h2>
          <Button size="sm" onClick={create}><Plus aria-hidden="true" />New scenario</Button>
        </div>
        <ul className="divide-y border-t">{scenarios.map(s => <ScenarioRow key={s.id} s={s} onDelete={setDeleting} />)}</ul>
      </Panel>
      {scenarios.length > 1 ? <Compare scenarios={scenarios} /> : (
        <p className="rounded-lg border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">
          Create a second scenario to compare it with the base.
        </p>
      )}
      <Dialog open={!!deleting} onOpenChange={o => { if (!o) setDeleting(null) }}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Delete {deleting?.name}?</DialogTitle>
          <DialogDescription>Its inputs are removed from this browser. Export it first to keep a copy.</DialogDescription>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleting) { deleteScenario(deleting.id); toast.success(`Deleted ${deleting.name}`) } setDeleting(null) }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
