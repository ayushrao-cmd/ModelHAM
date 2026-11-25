import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useRoute } from '../app/router'
import { fyData } from '../charts/data'
import { type Series, StatementChart } from '../charts/StatementChart'
import { SERIES } from '../charts/theme'
import { ResultsGate } from '../components/ResultsGate'
import { StatementTable } from '../components/StatementTable'
import { fyEnd } from '../engine/dates'
import { type Row, buildStatements, row } from '../engine/statements'
import { fmt } from '../lib/format'
import { useModel, useResult } from '../state/useModel'
import { Panel, SectionHeader, Stats } from './SectionLayout'

type Tab = 'is' | 'bs' | 'cf'
const TABS: Record<Tab, string> = { is: 'Income Statement', bs: 'Balance Sheet', cf: 'Cash Flow' }
const isTab = (v: string | null): v is Tab => v != null && v in TABS
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const TIE = 0.01 // ₹ Cr, as the Health statement checks

/** One-line result of a statement identity. */
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

const ASSETS: Series[] = [
  { key: 'cwip', name: 'Work-in-progress', color: SERIES[0] }, { key: 'projectAsset', name: 'Project asset', color: SERIES[1] },
  { key: 'gstReceivable', name: 'GST receivable', color: SERIES[2] }, { key: 'reserve', name: 'Debt Service Reserve', color: SERIES[3] },
  { key: 'workingCapital', name: 'Working capital', color: SERIES[4] }, { key: 'cash', name: 'Cash', color: SERIES[5] },
]

function StatementsBody({ tab, onTab }: { tab: Tab; onTab(t: Tab): void }) {
  const r = useResult()
  const { checks } = useModel()
  const s = useMemo(() => buildStatements(r), [r])
  const v = (rows: Row[], key: string) => row(rows, key).values
  const cod = s.years.indexOf(fyEnd(r.timeline.completion))
  const mark = cod >= 0 ? { index: cod, label: 'COD' } : undefined
  const bsCheck = checks.find(c => c.id === 'bs-balance'), cfCheck = checks.find(c => c.id === 'cf-reconcile')
  const ops = r.ops
  const tie = [
    [sum(v(s.is, 'revenue')), sum(ops.map(p => p.completionPayment + p.interestIncome + p.omPayment))],
    [-sum(v(s.is, 'tax')), sum(ops.map(p => p.tax))], [-sum(v(s.is, 'financeCost')), sum(ops.map(p => p.interest))],
  ].every(([a, b]) => Math.abs(a - b) <= TIE)
  const last = s.years.length - 1
  if (last < 0) return <Panel><p className="text-sm text-muted-foreground">No financial years to show: the model has no build months or payments.</p></Panel>
  return <>
    <Stats items={[
      { label: 'Revenue over the concession', value: fmt.cr(sum(v(s.is, 'revenue'))), sub: `${fmt.fy(s.years[0])} to ${fmt.fy(s.years[last])}` },
      { label: 'Profit after tax', value: fmt.cr(sum(v(s.is, 'pat'))), sub: `Distributions ${fmt.cr(-sum(v(s.cf, 'distributions')))}` },
      { label: 'Total assets at COD', value: cod >= 0 ? fmt.cr(v(s.bs, 'totalAssets')[cod]) : '—',
        sub: cod >= 0 ? `End of ${fmt.fy(s.years[cod])}, completion ${fmt.date(r.timeline.completion)}` : undefined },
    ]} />
    <Tabs value={tab} onValueChange={t => isTab(t) && onTab(t)}>
      <TabsList className="h-auto max-w-full flex-wrap justify-start">
        {(Object.keys(TABS) as Tab[]).map(t => <TabsTrigger key={t} value={t} className="data-[state=active]:bg-card">{TABS[t]}</TabsTrigger>)}
      </TabsList>
      <TabsContent value="is" className="mt-4 space-y-4">
        <Panel>
          <Banner pass={tie}>{tie ? 'Revenue, finance cost and tax tie to the operations schedule in total.'
            : 'Income statement totals do not tie to the operations schedule.'}</Banner>
          <StatementTable title="Income statement" years={s.years} rows={s.is} mark={mark} />
        </Panel>
        <Panel><StatementChart title="Revenue and profit after tax" data={fyData(s, s.is, ['revenue', 'pat'])}
          series={[{ key: 'revenue', name: 'Revenue', color: SERIES[0] }, { key: 'pat', name: 'Profit after tax', color: SERIES[1] }]} /></Panel>
      </TabsContent>
      <TabsContent value="bs" className="mt-4 space-y-4">
        <Panel>
          {bsCheck && <Banner pass={bsCheck.pass}>{bsCheck.message}</Banner>}
          <StatementTable title="Balance sheet" years={s.years} rows={s.bs} mark={mark} />
        </Panel>
        <Panel><StatementChart title="What the assets are" stacked data={fyData(s, s.bs, ASSETS.map(a => a.key))} series={ASSETS} /></Panel>
      </TabsContent>
      <TabsContent value="cf" className="mt-4 space-y-4">
        <Panel>
          {cfCheck && <Banner pass={cfCheck.pass}>{cfCheck.message}</Banner>}
          <StatementTable title="Cash flow statement" years={s.years} rows={s.cf} mark={mark} />
        </Panel>
        <Panel><StatementChart title="Net cash by activity" data={fyData(s, s.cf, ['cfo', 'cfi', 'cff'])}
          series={[{ key: 'cfo', name: 'Operating', color: SERIES[0] }, { key: 'cfi', name: 'Investing', color: SERIES[1] },
            { key: 'cff', name: 'Financing', color: SERIES[2] }]} /></Panel>
      </TabsContent>
    </Tabs>
    <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
      Simplified project accounts for evaluating the bid: not IGAAP or IndAS statements, and not certified. Build costs, including
      Interest During Build, are capitalised and amortised straight-line over the payment periods. Tax is current tax only; no
      deferred tax is recognised. Distributions pass Completion Payment cash to equity, so in early years they can exceed accounting
      profit and retained earnings turn negative.
    </p>
  </>
}

export function Statements() {
  const { param } = useRoute()
  const fromHash = param('tab')
  const routeTab: Tab = isTab(fromHash) ? fromHash : 'is'
  const [tab, setTab] = useState<Tab>(routeTab)
  useEffect(() => setTab(routeTab), [routeTab]) // a later deep link wins
  const pick = (t: Tab) => {
    setTab(t)
    history.replaceState(null, '', `#/statements?tab=${t}`) // shareable without a hashchange (which would refocus the heading)
  }
  return (
    <div className="space-y-6">
      <SectionHeader id="statements" />
      <ResultsGate><StatementsBody tab={tab} onTab={pick} /></ResultsGate>
    </div>
  )
}
