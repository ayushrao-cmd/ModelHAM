import { cn } from '@/lib/utils'
import { DEFAULT_INPUTS } from '../../engine/defaults'
import type { FieldDef } from '../../engine/types'
import { fmt } from '../../lib/format'
import { getAt } from '../../lib/path'
import { NumberField } from './NumberField'

const SUM_TOL = 1e-6 // same tolerance as the health schedule checks
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** A compact strip of percent entries with a live total (or average, for lists that are rates, not shares). */
export function PercentListField({ def, domId, value, onCommit, describedBy, empty = [] }: {
  def: FieldDef; domId: string; value: number[]; onCommit(path: string, n: number): void; describedBy?: string; empty?: string[]
}) {
  const isEmpty = (k: number) => empty.includes(`${def.id}.${k}`)
  const filled = value.filter((_, k) => !isEmpty(k)), gaps = value.length - filled.length
  // ponytail: a list is a share schedule when its default totals 100% (repayment, installments); bank rates are averaged
  const isShare = Math.abs(sum(getAt(DEFAULT_INPUTS, def.id) as number[]) - 1) < SUM_TOL
  const total = sum(filled) // over the entered values only; empty cells hold no number
  const off = isShare && !gaps && Math.abs(total - 1) > SUM_TOL
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{value.length} entries, in %{gaps > 0 && `, ${gaps} empty`}</span>
        <span className={cn('rounded-sm border px-1.5 py-0.5 font-medium tabular-nums',
          !off ? 'text-foreground' : total < 1 ? 'border-warning/50 bg-warning/10 text-warning' : 'border-destructive/50 bg-destructive/10 text-destructive')}>
          {isShare ? `Σ ${fmt.pct(total)}` : `Avg ${fmt.pct(filled.length ? total / filled.length : null)}`}
          {off && <span className="sr-only">, must total 100.00%</span>}
        </span>
      </div>
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
        {value.map((v, k) => {
          const cell = k === 0 ? domId : `${domId}-${k}`
          return (
            <li key={k}>
              <label htmlFor={cell} className="block pb-0.5 text-[11px] leading-4 text-muted-foreground tabular-nums">
                <span className="sr-only">{def.label} entry </span>{k + 1}
              </label>
              <NumberField id={cell} kind="percent" unit={false} value={v} describedBy={describedBy} empty={isEmpty(k)}
                onCommit={n => onCommit(`${def.id}.${k}`, n)} className="[&_input]:h-8 [&_input]:px-2" />
            </li>
          )
        })}
      </ol>
    </div>
  )
}
