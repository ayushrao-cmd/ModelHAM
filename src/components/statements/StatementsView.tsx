import { useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { copy } from '../../lib/export'
import { ties } from '../../engine/health'
import { fmt } from '../../lib/format'
import { Segmented } from '../../sections/SectionLayout'
import { type Statement, type StatementSet, StatementTable, statementCsv } from './StatementTable'

export type Standard = StatementSet['standard']
export type StatementTab = Statement['key']
const STANDARDS: Record<Standard, string> = { igaap: 'IGAAP', indas: 'IndAS' }
const TABS: Record<StatementTab, string> = { pl: 'P&L', bs: 'Balance Sheet', cf: 'Cash Flow', dscr: 'DSCR', irr: 'IRR' }
const has = <K extends string>(o: Record<K, string>, v: string | null | undefined): v is K =>
  v != null && Object.prototype.hasOwnProperty.call(o, v) // Object.hasOwn needs ES2022 lib

/** One-line result of a statement identity (as in sections/Statements). */
function Banner({ pass, children }: { pass: boolean; children: ReactNode }) {
  const Icon = pass ? CircleCheck : CircleAlert
  return (
    <p role="status" className={cn('mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-[13px] leading-5',
      pass ? 'border-success/30 bg-success/[0.07] text-foreground' : 'border-destructive/40 bg-destructive/10 text-destructive')}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', pass ? 'text-success' : 'text-destructive')} aria-hidden="true" />
      <span><span className="sr-only">{pass ? 'Passes: ' : 'Fails: '}</span>{children}</span>
    </p>
  )
}

/** The balance-sheet check (liabilities − assets) and the cash check (1 where cash < 0), per FY; the other statements
 *  carry no identity of their own. A NaN or missing year fails. */
function Check({ set, tab }: { set: StatementSet; tab: StatementTab }) {
  if (tab !== 'bs' && tab !== 'cf') return null
  const gaps = tab === 'bs' ? set.checks.bs : set.checks.cash
  const k = set.years.findIndex((_, n) => !ties(gaps[n]))
  if (k < 0) return <Banner pass>{tab === 'bs' ? 'Balances in every year.' : 'Cash is non-negative in every year.'}</Banner>
  const fy = fmt.fy(set.years[k]), g = gaps[k]
  if (tab === 'cf') return <Banner pass={false}>Cash is negative in {fy}.</Banner>
  const by = Number.isFinite(g) ? ` by ${g < 0 ? `(${fmt.cr(-g)})` : fmt.cr(g)}` : ''
  return <Banner pass={false}>Out of balance in {fy}{by}.</Banner>
}

/**
 * IGAAP | IndAS switch, the five statement tabs, each with its check banner, drill-down table and CSV copy.
 * `standard` and `tab` take raw URL values (`?std=`, `?tab=`); unknown ones fall back to IGAAP and P&L. Without them it
 * keeps its own state; `onChange` reports every switch so the parent can write the URL.
 */
export function StatementsView({ sets, standard, tab, onChange }: {
  sets: Record<Standard, StatementSet>; standard?: string | null; tab?: string | null
  onChange?(next: { standard: Standard; tab: StatementTab }): void
}) {
  const [own, setOwn] = useState<{ standard: Standard; tab: StatementTab }>({ standard: 'igaap', tab: 'pl' })
  const std: Standard = has(STANDARDS, standard) ? standard : standard == null ? own.standard : 'igaap'
  const cur: StatementTab = has(TABS, tab) ? tab : tab == null ? own.tab : 'pl'
  const set = sets[std]
  const go = (next: { standard: Standard; tab: StatementTab }) => { setOwn(next); onChange?.(next) }
  const st = set.statements.find(s => s.key === cur)

  const onCopy = async () => {
    if (!st) return
    const ok = await copy(statementCsv(st, set.years))
    if (ok) toast.success(`Copied ${STANDARDS[std]} ${st.title} as CSV`)
    else toast.error('Copy failed: your browser blocked clipboard access.')
  }

  return (
    <Tabs value={cur} onValueChange={t => has(TABS, t) && go({ standard: std, tab: t })} className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Accounting standard" value={std} onChange={s => go({ standard: s, tab: cur })}
          options={(Object.keys(STANDARDS) as Standard[]).map(s => ({ value: s, label: STANDARDS[s] }))} />
        <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 px-2 text-xs" onClick={onCopy} disabled={!st}>
          <Copy className="size-3.5" aria-hidden="true" />Copy CSV
        </Button>
      </div>
      <TabsList className="mt-3 h-auto max-w-full flex-wrap justify-start">
        {(Object.keys(TABS) as StatementTab[]).map(t => <TabsTrigger key={t} value={t} className="data-[state=active]:bg-card">{TABS[t]}</TabsTrigger>)}
      </TabsList>
      {(Object.keys(TABS) as StatementTab[]).map(t => (
        // Radix mounts only the active panel's children; one panel per tab keeps each trigger's aria-controls valid.
        <TabsContent key={t} value={t} className="mt-4">
          <Check set={set} tab={t} />
          {st ? <StatementTable key={`${std}-${t}`} statement={st} years={set.years} />
            : <p className="text-sm text-muted-foreground">No {TABS[t]} statement under {STANDARDS[std]}.</p>}
        </TabsContent>
      ))}
    </Tabs>
  )
}
