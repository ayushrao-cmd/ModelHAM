import { useEffect, useRef, useState } from 'react'
import { CircleAlert, Info, RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { claimFocus, useFocusRequest } from '../../app/router'
import { DEFAULT_INPUTS } from '../../engine/defaults'
import type { FieldDef } from '../../engine/types'
import { fieldById } from '../../fields'
import { fmt } from '../../lib/format'
import { getAt } from '../../lib/path'
import { referenceInputs, useStore } from '../../state/store'
import { useModel } from '../../state/useModel'
import { NumberField } from './NumberField'
import { formatNumber } from './parse'
import { PercentListField } from './PercentListField'
import { TableField } from './TableField'

export const domId = (id: string) => `field-${id.replace(/\./g, '-')}`
export const WIDE: FieldDef['kind'][] = ['text', 'percentList', 'milestoneList', 'trancheList']
const NUMERIC: FieldDef['kind'][] = ['money', 'percent', 'days', 'years', 'number']
const RANK = { error: 0, warning: 1, info: 2 }
// ponytail: inputs are plain JSON data, so string equality is deep equality
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)
const clean = (n: number) => Number(n.toPrecision(12))
const show = (def: FieldDef, v: unknown) => def.kind === 'years' ? `${v} years` : def.kind === 'days' ? `${v} days` : String(v)

/** Scroll to, focus and flash the field when a jump (palette, health, deep link) names it. */
function useJumpTarget(id: string, root: React.RefObject<HTMLDivElement>) {
  const n = useFocusRequest(s => s.n)
  useEffect(() => {
    const el = root.current
    if (!el || !claimFocus(id)) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    el.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
    const target = document.getElementById(domId(id))
    const control = target?.matches('input, button, select, textarea') ? target : target?.querySelector<HTMLElement>('input, button')
    control?.focus({ preventScroll: true })
    if (reduced) return
    el.classList.remove('field-flash')
    void el.offsetWidth // restart the animation on a repeat jump
    el.classList.add('field-flash')
  }, [id, n, root])
}

/** Key levers: a slider over ±50% of the default value, snapped to the field's step. */
function KeySlider({ def, value, onCommit, label }: { def: FieldDef; value: number; onCommit(n: number): void; label: string }) {
  const d = getAt(DEFAULT_INPUTS, def.id) as number
  const step = def.step ?? clean(10 ** Math.floor(Math.log10(Math.abs(d) || 1) - 1))
  let lo = clean(Math.floor((d * 0.5) / step) * step), hi = clean(Math.ceil((d * 1.5) / step) * step)
  if (def.min != null) lo = Math.max(lo, def.min)
  if (def.max != null) hi = Math.min(hi, def.max)
  lo = Math.min(lo, value); hi = Math.max(hi, value)
  const text = (n: number) => def.kind === 'money' ? `₹${formatNumber(n, 'money')} Cr` : def.kind === 'percent' ? fmt.pct(n) : formatNumber(n, def.kind)
  return (
    <div className="flex items-center gap-2 pt-1 text-[11px] tabular-nums text-muted-foreground">
      <span aria-hidden="true">{text(lo)}</span>
      <Slider min={lo} max={hi} step={step} value={[value]} onValueChange={([n]) => onCommit(clean(n))}
        aria-label={`Adjust ${label}`} aria-valuetext={text(value)} className="flex-1 py-1.5" />
      <span aria-hidden="true">{text(hi)}</span>
    </div>
  )
}

function DateField({ id, value, onCommit, ...aria }: { id: string; value: string; onCommit(v: string): void } & React.AriaAttributes) {
  // A partial date reads as '' from a native date input; keep it local so typing segments is not reverted.
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return <Input id={id} type="date" value={draft} className="bg-card tabular-nums" {...aria}
    onChange={e => { setDraft(e.target.value); if (e.target.value) onCommit(e.target.value) }} />
}

/** Renders any FieldDef by kind, with help, changed-vs-base reset, key-lever slider and check messages. */
/** `labelHidden`: the visible label repeats the card heading; it stays as the accessible name. */
export function Field({ id, className, labelHidden }: { id: string; className?: string; labelHidden?: boolean }) {
  const value = useStore(s => getAt((s.scenarios.find(x => x.id === s.activeId) ?? s.scenarios[0]).inputs, id))
  const baseValue = useStore(s => getAt(referenceInputs(s), id))
  const setInput = useStore(s => s.setInput)
  const resetField = useStore(s => s.resetField)
  const { checks } = useModel()
  const root = useRef<HTMLDivElement>(null)
  useJumpTarget(id, root)
  const def = fieldById(id)
  if (!def) throw new Error(`Unknown field: ${id}`)

  const dom = domId(id), labelId = `${dom}-label`, helpId = `${dom}-help`, msgId = `${dom}-msg`
  const failing = checks.filter(c => !c.pass && c.fieldId === id).sort((a, b) => RANK[a.severity] - RANK[b.severity])
  const worst = failing[0]?.severity
  const tone = worst === 'error' || worst === 'warning' ? worst : undefined
  const describedBy = [def.help && helpId, failing.length && msgId].filter(Boolean).join(' ') || undefined
  const aria = { 'aria-describedby': describedBy, 'aria-invalid': tone ? true : undefined } as const
  const changed = !same(value, baseValue)
  const isList = Array.isArray(value)
  const commit = (n: number) => setInput(id, n)
  const commitAt = (path: string, n: number) => setInput(path, n)
  const toneCls = tone === 'error' ? 'border-destructive' : tone === 'warning' ? 'border-warning' : undefined

  let control: React.ReactNode
  if (def.readOnly) // fixed by the concession agreement: shown, never edited
    control = <Input id={dom} readOnly value={show(def, value)} {...aria} className="bg-muted tabular-nums" />
  else if (NUMERIC.includes(def.kind) && !isList)
    control = <NumberField id={dom} value={value as number} kind={def.kind} min={def.min} max={def.max} onCommit={commit} describedBy={describedBy} tone={tone} />
  else if (def.kind === 'years') // a tuple, e.g. the two resurfacing years
    control = (
      <div role="group" aria-labelledby={labelId} {...aria} className="grid grid-cols-2 gap-2">
        {(value as number[]).map((v, k) => (
          <NumberField key={k} id={k ? `${dom}-${k}` : dom} value={v} kind="years" onCommit={n => commitAt(`${id}.${k}`, n)}
            describedBy={describedBy} tone={tone} aria-label={`${def.label}: ${k ? 'second' : 'first'}`} />
        ))}
      </div>
    )
  else if (def.kind === 'percentList')
    control = <div role="group" aria-labelledby={labelId} {...aria}><PercentListField def={def} domId={dom} value={value as number[]} onCommit={commitAt} describedBy={describedBy} /></div>
  else if (def.kind === 'milestoneList' || def.kind === 'trancheList')
    control = <div role="group" aria-labelledby={labelId} {...aria}><TableField def={def} domId={dom} value={value as Record<string, number>[]} onCommit={commitAt} describedBy={describedBy} /></div>
  else if (def.kind === 'select')
    control = (
      <Select value={value as string} onValueChange={v => setInput(id, v)}>
        <SelectTrigger id={dom} aria-labelledby={`${labelId} ${dom}`} {...aria} className={cn('bg-card', toneCls)}><SelectValue /></SelectTrigger>
        <SelectContent>{def.options?.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    )
  else if (def.kind === 'date')
    control = <DateField id={dom} value={value as string} onCommit={v => setInput(id, v)} {...aria} />
  else
    control = <Input id={dom} value={value as string} onChange={e => setInput(id, e.target.value)} {...aria} className={cn('bg-card', toneCls)} />

  const labelProps = isList ? { id: labelId } : { id: labelId, htmlFor: dom }
  const Label = isList ? 'span' : 'label'
  return (
    <div ref={root} data-field={id} className={cn('min-w-0 rounded-md', className)}
      onAnimationEnd={e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('field-flash') }}>
      <div className={cn('flex items-center gap-1.5', !(labelHidden && !changed) && 'min-h-7')}>
        <Label {...labelProps} className={cn('min-w-0 text-sm font-medium leading-5', labelHidden && 'sr-only')}>{def.label}</Label>
        {def.help && !labelHidden && (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Focusable, so the tooltip opens on keyboard focus as well as hover. */}
              <button type="button" aria-label={`Help: ${def.label}`}
                className="-m-1 shrink-0 rounded-sm p-1 text-muted-foreground hover:text-foreground">
                <Info className="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 bg-foreground text-background">{def.help}</TooltipContent>
          </Tooltip>
        )}
        {changed && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
        {changed && <span className="sr-only">Changed from base</span>}
        {changed && (
          <Button variant="ghost" size="icon" className="ml-auto size-7 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={`Reset ${def.label} to base`} title="Reset to base" onClick={() => resetField(id)}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
      {/* With the label hidden, a lone help icon would float under the card heading, so the help shows as text instead. */}
      {def.help && <p id={helpId} className={labelHidden ? 'm-0 text-xs leading-4 text-muted-foreground' : 'hidden'}>{def.help}</p>}
      <div className="mt-1">{control}</div>
      {def.key && NUMERIC.includes(def.kind) && !isList && <KeySlider def={def} value={value as number} onCommit={commit} label={def.label} />}
      {failing.length > 0 && (
        <div id={msgId} className="mt-1.5 space-y-1">
          {failing.map(c => {
            const Icon = c.severity === 'info' ? Info : c.severity === 'warning' ? TriangleAlert : CircleAlert
            return (
              <p key={c.id} className={cn('flex gap-1.5 text-xs leading-4',
                c.severity === 'error' ? 'text-destructive' : c.severity === 'warning' ? 'text-warning' : 'text-muted-foreground')}>
                <Icon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span><span className="sr-only">{c.severity === 'info' ? 'Note' : c.severity === 'warning' ? 'Warning' : 'Error'}: </span>{c.message}</span>
              </p>
            )
          })}
        </div>
      )}
    </div>
  )
}
