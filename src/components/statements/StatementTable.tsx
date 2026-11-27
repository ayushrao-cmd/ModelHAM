import { useId, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Day } from '../../engine/dates'
import { type Cell, toCsv } from '../../lib/export'
import { fmt } from '../../lib/format'

// ponytail: the plan's shared shapes, declared here until src/engine/v16/types.ts exports them; swap this block for
// `export type { Row, Statement, StatementSet } from '../../engine/v16/types'` then (structurally identical).
export interface Row { id: string; label: string; values: number[]; total: number
  kind: 'header' | 'line' | 'subtotal' | 'total' | 'check'; children?: Row[]; formula?: string; source?: string }
export interface Statement { key: 'pl' | 'bs' | 'cf' | 'dscr' | 'irr'; title: string; rows: Row[] }
export interface StatementSet { standard: 'igaap' | 'indas'; years: Day[]; statements: Statement[]
  checks: { bs: number[]; cash: number[] } }

const MAX_DEPTH = 3 // children nest at most three levels below a statement line
const NIL = 0.005 // ₹ Cr; below this a value displays as ₹0.00, so it reads as a dash
/** Accounting style: negatives in parentheses, nil as a dash (as the existing StatementTable). */
const acct = (v: number) => (Math.abs(v) < NIL ? '–' : v < 0 ? `(${fmt.num(-v)})` : fmt.num(v))
/** V16 numbering: "pl.A.1" -> "A.1". */
const number = (st: Statement, id: string) => id.replace(new RegExp(`^${st.key}[.:_/-]`), '')

/** The statement as CSV, every child row included and indented by depth, whatever is expanded on screen. */
export function statementCsv(st: Statement, years: Day[]): string {
  const out: Cell[][] = []
  const walk = (rows: Row[], depth: number) => {
    for (const r of rows) {
      out.push([number(st, r.id), '  '.repeat(depth) + r.label, depth, ...r.values, r.total])
      if (r.children) walk(r.children, depth + 1)
    }
  }
  walk(st.rows, 0)
  return toCsv(['No.', 'Line', 'Depth', ...years.map(fmt.fy), 'Total'], out)
}

/**
 * One statement: sticky numbered labels, a column per FY plus Total, scrolling sideways inside its own region.
 * A line with children has a chevron button that expands them inline; selecting any line shows its formula and
 * source in the side panel.
 */
export function StatementTable({ statement: st, years }: { statement: Statement; years: Day[] }) {
  const id = useId()
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [selected, setSelected] = useState<Row | null>(null)
  const toggle = (r: Row) => setOpen(s => { const n = new Set(s); if (!n.delete(r.id)) n.add(r.id); return n })

  const lines: { row: Row; depth: number }[] = []
  const walk = (rows: Row[], depth: number) => {
    for (const row of rows) {
      lines.push({ row, depth })
      if (row.children?.length && depth < MAX_DEPTH && open.has(row.id)) walk(row.children, depth + 1)
    }
  }
  walk(st.rows, 0)

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0">
        <h2 id={id} className="text-sm font-medium">{st.title}</h2>
        <p className="mb-2 mt-0.5 text-xs text-muted-foreground">₹ Cr, financial years ending 31 March</p>
        <div role="region" aria-labelledby={id} tabIndex={0} className="overflow-x-auto rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <table className="w-full border-separate border-spacing-0 text-[13px] tabular-nums">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 border-b bg-card py-2 pr-3 text-left text-xs font-medium text-muted-foreground">
                  <span className="sr-only">Line</span>
                </th>
                {years.map(y => <th key={y} scope="col" className="whitespace-nowrap border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">{fmt.fy(y)}</th>)}
                <th scope="col" className="whitespace-nowrap border-b border-l px-3 py-2 text-right text-xs font-medium text-muted-foreground last:pr-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ row: r, depth }) => {
                const header = r.kind === 'header'
                const strong = r.kind === 'subtotal' || r.kind === 'total'
                const parent = !!r.children?.length && depth < MAX_DEPTH
                const expanded = open.has(r.id)
                const rule = cn(strong && depth === 0 && 'border-t border-foreground/25',
                  r.kind === 'total' && depth === 0 && 'border-b-[3px] border-double border-b-foreground/40',
                  r.kind === 'check' && (r.values.some(v => Math.abs(v) >= NIL) ? 'text-destructive' : 'text-muted-foreground'),
                  depth > 0 && 'text-muted-foreground')
                const picked = selected?.id === r.id
                const label = <>
                  <span className="mr-2 inline-block min-w-[2.25rem] shrink-0 text-xs font-normal text-muted-foreground">{number(st, r.id)}</span>{' '}
                  <span>{r.label}</span>
                </>
                return (
                  <tr key={r.id} className={cn('hover:[&>*]:bg-muted', (strong || header) && 'font-semibold')}>
                    <th scope="row" style={{ paddingLeft: `${depth * 1.25}rem` }}
                      className={cn('sticky left-0 min-w-[10rem] max-w-[18rem] bg-card pr-3 text-left leading-5 sm:min-w-[17rem]',
                        header ? 'pb-1 pt-4 text-xs' : 'py-1', strong || header ? 'font-semibold' : 'font-normal', rule,
                        picked && 'shadow-[inset_3px_0_0_hsl(var(--primary))]')}>
                      {header ? <span className="flex">{label}</span> : (
                        <button type="button" aria-expanded={parent ? expanded : undefined} onClick={() => { if (parent) toggle(r); setSelected(r) }}
                          className="flex w-full items-start rounded-sm py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <ChevronRight aria-hidden="true" className={cn('mr-1 mt-0.5 size-4 shrink-0 transition-transform', !parent && 'invisible', expanded && 'rotate-90')} />
                          {label}
                        </button>
                      )}
                    </th>
                    {[...r.values, r.total].map((v, k) => (
                      <td key={k} className={cn('whitespace-nowrap px-3 py-1.5 text-right last:pr-1', k === r.values.length && 'border-l', rule, picked && 'bg-primary/[0.06]')}>
                        {header ? '' : acct(v)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <aside aria-label="Line detail" aria-live="polite" className="h-fit rounded-md border bg-muted/40 p-4 text-[13px] leading-5 lg:sticky lg:top-4">
        {selected ? <>
          <p className="text-xs text-muted-foreground">{number(st, selected.id)}</p>
          <h3 className="font-medium">{selected.label}</h3>
          <dl className="mt-3 space-y-3">
            <div><dt className="text-xs text-muted-foreground">How it is calculated</dt><dd>{selected.formula ?? 'No formula recorded for this line.'}</dd></div>
            {selected.source && <div><dt className="text-xs text-muted-foreground">Source</dt><dd className="break-words">{selected.source}</dd></div>}
          </dl>
        </> : <p className="text-muted-foreground">Select a line to see how it is calculated and where it comes from.</p>}
      </aside>
    </div>
  )
}
