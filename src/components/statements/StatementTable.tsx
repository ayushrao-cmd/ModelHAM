import { useId, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Day } from '../../engine/dates'
import type { Row, Statement } from '../../engine/v16/types'
import { type Cell, toCsv } from '../../lib/export'
import { fmt } from '../../lib/format'

export type { Row, Statement, StatementSet } from '../../engine/v16/types'

const MAX_DEPTH = 3 // children nest at most three levels below a statement line (Row contract); screen and CSV alike
/** ₹ Cr. Below this an amount shows as ₹0.00, so as a dash; the check rows and banners use the same tie. */
export const TIE = 0.005

/** Accounting style: negatives in parentheses, nil as a dash. */
export const acct = (v: number) => (Math.abs(v) < TIE ? '–' : v < 0 ? `(${fmt.num(-v)})` : fmt.num(v))
/** One cell by the row's unit; NaN (V16 blank) is an empty cell. */
export function cellText(v: number, unit: Row['unit']): string {
  if (Number.isNaN(v)) return ''
  if (unit === 'money') return acct(v)
  if (v === 0) return '–'
  if (unit === 'ratio') return fmt.x(v)
  if (unit === 'pct') return fmt.pct(v)
  if (unit === 'count') return fmt.num(v, 0)
  return fmt.date(v)
}

/** Rows in display order with their depth, descending into children (to MAX_DEPTH) where `open(row)`. */
function flatten(rows: Row[], open: (r: Row) => boolean, depth = 0, out: { row: Row; depth: number }[] = []) {
  for (const row of rows) {
    out.push({ row, depth })
    if (row.children?.length && depth < MAX_DEPTH && open(row)) flatten(row.children, open, depth + 1, out)
  }
  return out
}
const holds = (r: Row, id: string): boolean => !!r.children?.some(c => c.id === id || holds(c, id))
const failing = (r: Row) => r.values.some(v => !(Math.abs(v) < TIE))

/** The statement as CSV, every row the screen can show (to MAX_DEPTH) indented by depth, whatever is expanded. */
export function statementCsv(st: Statement, years: Day[]): string {
  const out: Cell[][] = flatten(st.rows, () => true).map(({ row: r, depth }) =>
    [r.num ?? '', '  '.repeat(depth) + r.label, depth, ...r.values, r.total])
  return toCsv(['No.', 'Line', 'Depth', ...years.map(fmt.fy), 'Total'], out)
}

// Opaque backgrounds on every cell (the sticky label sits over scrolled cells); the selection tint is layered on top.
const PICKED = 'bg-card [background-image:linear-gradient(hsl(var(--primary)/0.08),hsl(var(--primary)/0.08))]'
const HOVER = 'bg-card group-hover:bg-muted'
const FOCUS = 'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * One statement: sticky numbered labels, a column per FY plus Total, scrolling sideways inside its own region.
 * A line with children has a chevron button that expands them inline; the label button selects the line, and the
 * side panel shows its formula and source. Escape clears the selection.
 */
export function StatementTable({ statement: st, years }: { statement: Statement; years: Day[] }) {
  const id = useId()
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const toggle = (r: Row) => {
    setOpen(s => { const n = new Set(s); if (!n.delete(r.id)) n.add(r.id); return n })
    if (open.has(r.id) && selectedId && holds(r, selectedId)) setSelectedId(null) // collapsing hides the selection
  }
  const lines = flatten(st.rows, r => open.has(r.id))
  const selected = lines.find(l => l.row.id === selectedId)?.row ?? null

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]"
      onKeyDown={e => { if (e.key === 'Escape' && selectedId) setSelectedId(null) }}>
      <div className="min-w-0">
        <h2 id={id} className="text-sm font-medium">{st.title}</h2>
        <p className="mb-2 mt-0.5 text-xs text-muted-foreground">₹ Cr, financial years ending 31 March</p>
        <div role="region" aria-labelledby={id} tabIndex={0} className={cn('overflow-x-auto', FOCUS)}>
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
                const picked = selectedId === r.id
                const bg = picked ? PICKED : HOVER
                const rule = cn(strong && depth === 0 && 'border-t border-foreground/25',
                  r.kind === 'total' && depth === 0 && 'border-b-[3px] border-double border-b-foreground/40',
                  r.kind === 'check' && (failing(r) ? 'text-destructive' : 'text-muted-foreground'),
                  depth > 0 && 'text-muted-foreground')
                const label = <>
                  <span className="mr-2 inline-block min-w-[2.25rem] shrink-0 text-xs font-normal text-muted-foreground">{r.num ?? ''}</span>{' '}
                  <span>{r.label}</span>
                </>
                return (
                  <tr key={r.id} className={cn('group', (strong || header) && 'font-semibold')}>
                    <th scope="row" style={{ paddingLeft: `${depth * 1.25}rem` }}
                      className={cn('sticky left-0 min-w-[10rem] max-w-[18rem] pr-3 text-left leading-5 sm:min-w-[17rem]',
                        header ? 'pb-1 pt-4 text-xs' : 'py-1', strong || header ? 'font-semibold' : 'font-normal', rule, bg,
                        picked && 'shadow-[inset_3px_0_0_hsl(var(--primary))]')}>
                      <span className="flex items-start">
                        {parent ? (
                          <button type="button" aria-expanded={expanded} aria-label={`Breakdown of ${r.label}`} onClick={() => toggle(r)}
                            className={cn('mr-1 mt-0.5 shrink-0 text-muted-foreground hover:text-foreground', FOCUS)}>
                            <ChevronRight aria-hidden="true" className={cn('size-4 motion-safe:transition-transform', expanded && 'rotate-90')} />
                          </button>
                        ) : <span aria-hidden="true" className="mr-1 size-4 shrink-0" />}
                        {header ? <span className="flex py-0.5">{label}</span> : (
                          <button type="button" aria-pressed={picked} onClick={() => setSelectedId(picked ? null : r.id)}
                            className={cn('flex min-w-0 flex-1 items-start py-0.5 text-left', FOCUS)}>
                            {label}
                          </button>
                        )}
                      </span>
                    </th>
                    {[...r.values, r.total].map((v, k) => (
                      <td key={k} className={cn('whitespace-nowrap px-3 py-1.5 text-right last:pr-1', k === r.values.length && 'border-l', rule, bg)}>
                        {cellText(v, r.unit)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <aside aria-label="Line detail" className="h-fit rounded-md border bg-muted/40 p-4 text-[13px] leading-5 lg:sticky lg:top-4">
        {selected ? <>
          {selected.num && <p className="text-xs text-muted-foreground">{selected.num}</p>}
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
