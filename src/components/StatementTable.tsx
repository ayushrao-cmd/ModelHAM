import { useId } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Day } from '../engine/dates'
import type { Row } from '../engine/statements'
import { copy, toCsv } from '../lib/export'
import { fmt } from '../lib/format'

const NIL = 0.005 // ₹ Cr; below this a value displays as ₹0.00, so it reads as a dash

/** Accounting style: negatives in parentheses, nil as a dash. */
const acct = (v: number) => (Math.abs(v) < NIL ? '–' : v < 0 ? `(${fmt.num(-v)})` : fmt.num(v))

/**
 * An annual statement: sticky line labels, one column per FY, subtotals bold over a hairline, totals over a hairline
 * with an accounting double rule beneath. Scrolls sideways inside its own container. `mark` tags one year's column (COD).
 */
export function StatementTable({ title, years, rows, mark }: { title: string; years: Day[]; rows: Row[]; mark?: { index: number; label: string } }) {
  const id = useId()
  const onCopy = async () => {
    const lines = rows.filter(r => r.style !== 'heading')
    const ok = await copy(toCsv(['₹ Cr', ...years.map(fmt.fy)], lines.map(r => [r.label, ...r.values])))
    if (ok) toast.success(`Copied ${title} as CSV`)
    else toast.error('Copy failed: your browser blocked clipboard access.')
  }
  const groups: { heading?: Row; rows: Row[] }[] = []
  for (const r of rows) {
    if (r.style === 'heading' || !groups.length) groups.push(r.style === 'heading' ? { heading: r, rows: [] } : { rows: [r] })
    else groups[groups.length - 1].rows.push(r)
  }
  const marked = (k: number) => mark?.index === k && 'bg-primary/[0.06]'
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 id={id} className="text-sm font-medium">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">₹ Cr, financial years ending 31 March</p>
        </div>
        <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 px-2 text-xs" onClick={onCopy}>
          <Copy className="size-3.5" aria-hidden="true" />Copy CSV
        </Button>
      </div>
      <div role="region" aria-labelledby={id} tabIndex={0} className="overflow-x-auto rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <table className="w-full border-separate border-spacing-0 text-[13px] tabular-nums">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 border-b bg-card py-2 pr-3 text-left text-xs font-medium text-muted-foreground">
                <span className="sr-only">Line</span>
              </th>
              {years.map((y, k) => (
                <th key={y} scope="col" className={cn('whitespace-nowrap border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground last:pr-1', marked(k))}>
                  {fmt.fy(y)}
                  {mark?.index === k && <span className="ml-1 rounded-sm bg-primary/10 px-1 text-[11px] font-medium text-primary">{mark.label}</span>}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g, n) => (
            // Each heading opens its own row group, so assistive tech announces "Liabilities" for its lines.
            <tbody key={g.heading?.key ?? n}>
              {g.heading && (
                <tr>
                  <th scope="rowgroup" className="sticky left-0 bg-card pb-1 pr-3 pt-4 text-left text-xs font-semibold text-foreground">{g.heading.label}</th>
                  {years.map((y, k) => <td key={y} className={cn('pt-4', marked(k))} />)}
                </tr>
              )}
              {g.rows.map(r => {
                const strong = r.style === 'subtotal' || r.style === 'total'
                const rule = cn(strong && 'border-t border-foreground/25', r.style === 'total' && 'border-b-[3px] border-double border-b-foreground/40',
                  r.key === 'check' && 'text-muted-foreground')
                return (
                  <tr key={r.key} className={cn('hover:[&>*]:bg-muted', strong && 'font-semibold')}>
                    <th scope="row" className={cn('sticky left-0 min-w-[8.5rem] max-w-[16rem] bg-card py-1.5 pr-3 text-left leading-5 sm:min-w-[15rem]', strong ? 'font-semibold' : 'font-normal', rule)}>
                      {r.label}
                    </th>
                    {r.values.map((v, k) => (
                      <td key={k} className={cn('whitespace-nowrap px-3 py-1.5 text-right last:pr-1', rule, marked(k))}>{acct(v)}</td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  )
}
