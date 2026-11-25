import { useId } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { fmt } from '../lib/format'

export type Cell = string | number
export interface Column { label: string; format?: (n: number) => string }

const csvCell = (v: Cell) => (typeof v === 'number' ? String(Number(v.toFixed(6))) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const toCsv = (columns: Column[], rows: Cell[][]) => [columns.map(c => c.label), ...rows].map(r => r.map(csvCell).join(',')).join('\n')

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* no clipboard API or permission: fall back */ }
  const ta = Object.assign(document.createElement('textarea'), { value: text })
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;opacity:0'
  document.body.append(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { /* unsupported */ }
  ta.remove()
  return ok
}

/**
 * Compact table: right-aligned tabular numbers, sticky header and first column, and its own scroll container
 * so wide tables never scroll the page; pass a max-h class to make long ones scroll inside it. Numbers default to fmt.num (2 dp); CSV carries the raw values.
 */
export function DataTable({ title, description, columns, rows, total, className }: {
  title: string; description?: string; columns: Column[]; rows: Cell[][]; total?: Cell[]; className?: string
}) {
  const id = useId()
  // ponytail: an exact zero reads as a dash, Stripe-style; CSV keeps the 0
  const show = (v: Cell, k: number) => (typeof v !== 'number' ? v : v === 0 ? '–' : (columns[k].format ?? fmt.num)(v))
  const onCopy = async () => {
    const ok = await copy(toCsv(columns, total ? [...rows, total] : rows))
    if (ok) toast.success(`Copied ${title} as CSV`)
    else toast.error('Copy failed: your browser blocked clipboard access.')
  }
  // Row labels wrap on phones so the sticky label column leaves room for the numbers beside it.
  const cell = (v: Cell, k: number) => cn('px-3 py-1.5', typeof v === 'number' ? 'whitespace-nowrap text-right tabular-nums' : 'text-left',
    k === 0 ? 'sticky left-0 min-w-32 bg-card pl-0 sm:whitespace-nowrap' : 'whitespace-nowrap')
  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 id={id} className="text-sm font-medium">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 px-2 text-xs" onClick={onCopy}>
          <Copy className="size-3.5" aria-hidden="true" />Copy CSV
        </Button>
      </div>
      {/* Focusable so keyboard users can scroll it. */}
      <div role="region" aria-labelledby={id} tabIndex={0} className={cn('overflow-auto rounded-sm', className)}>
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {columns.map((c, k) => (
                <th key={c.label} scope="col" className={cn('sticky top-0 z-10 whitespace-nowrap border-b bg-card px-3 py-2 text-xs font-medium text-muted-foreground',
                  k === 0 ? 'left-0 z-20 pl-0 text-left' : 'text-right')}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="[&>*]:border-b [&>*]:border-border/60 hover:[&>*]:bg-muted">
                {r.map((v, k) => k === 0
                  ? <th key={k} scope="row" className={cn(cell(v, k), 'font-normal')}>{show(v, k)}</th>
                  : <td key={k} className={cell(v, k)}>{show(v, k)}</td>)}
              </tr>
            ))}
          </tbody>
          {total && (
            <tfoot>
              <tr className="font-semibold">
                {total.map((v, k) => k === 0
                  ? <th key={k} scope="row" className={cn(cell(v, k), 'sticky bottom-0 z-10 border-t bg-card')}>{show(v, k)}</th>
                  : <td key={k} className={cn(cell(v, k), 'sticky bottom-0 border-t bg-card')}>{show(v, k)}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}
