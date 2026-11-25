import { useMemo } from 'react'
import { DrawdownChart } from '../charts/DrawdownChart'
import { SCurveChart } from '../charts/SCurveChart'
import { shortMonth } from '../charts/theme'
import { DataTable } from '../components/DataTable'
import { InputGroup } from '../components/InputGroup'
import { toIso } from '../engine/dates'
import { buildPhasing } from '../engine/statements'
import { fmt } from '../lib/format'
import { useResult } from '../state/useModel'
import { Panel, SectionLayout, Stats } from './SectionLayout'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const pct = (n: number) => fmt.pct(n)
const month = (d: number) => shortMonth(toIso(d))

function PhasingResults() {
  const r = useResult()
  const rows = useMemo(() => buildPhasing(r), [r])
  if (!rows.length) return <Panel><p className="text-sm text-muted-foreground">No build months: set Build Days on Deal & Timeline.</p></Panel>
  const peak = rows.reduce((a, x) => (x.totalCost > a.totalCost ? x : a))
  const receipts = rows.filter(x => x.support > 0)
  const total = (f: (x: (typeof rows)[number]) => number) => sum(rows.map(f))
  const last = rows[rows.length - 1]
  return <>
    <Stats items={[
      { label: 'Build period', value: `${rows.length} months`, sub: `${fmt.num(total(x => x.days), 0)} days, ${month(rows[0].day)} to ${month(last.day)}` },
      { label: 'Peak monthly cost', value: fmt.cr(peak.totalCost), sub: `${fmt.date(peak.day)}, incl. GST and interest` },
      { label: 'Construction Support', value: fmt.cr(total(x => x.support)), sub: `${receipts.length} receipts, incl. GST` },
    ]} />
    <Panel><SCurveChart rows={rows} /></Panel>
    <Panel><DrawdownChart result={r} /></Panel>
    <Panel>
      <DataTable title="Construction Support receipts" description="₹ Cr incl. GST, paid in the first month reaching each tranche's physical progress"
        columns={[{ label: 'Month' }, { label: 'Physical progress', format: pct }, { label: 'Received' }]}
        rows={receipts.map(x => [fmt.date(x.day), x.cumPhysical, x.support])}
        total={['Total', '', total(x => x.support)]} />
    </Panel>
    <Panel>
      <DataTable title="Monthly construction schedule" className="max-h-[32rem]"
        description="₹ Cr. EPC and other uses net of GST; total cost includes GST and Interest During Build. Financial progress is the share of EPC spent."
        columns={[{ label: 'Month' }, { label: 'Days', format: n => fmt.num(n, 0) }, { label: 'EPC fixed' }, { label: 'EPC variable' },
          { label: 'Other uses' }, { label: 'GST' }, { label: 'Interest' }, { label: 'Total cost' }, { label: 'Cumulative cost' },
          { label: 'Physical', format: pct }, { label: 'Cum. physical', format: pct }, { label: 'Cum. financial', format: pct },
          { label: 'Support' }, { label: 'Equity' }, { label: 'Debt' }, { label: 'Closing debt' }, { label: 'Cash carried' }, { label: 'Milestone' }]}
        rows={rows.map(x => [month(x.day), x.days, x.epcFixed, x.epcVariable, x.otherUses, x.gst, x.idc, x.totalCost, x.cumCost,
          x.physical, x.cumPhysical, x.cumFinancial, x.support, x.equity, x.debt, x.closingDebt, x.cash,
          x.milestones.map(m => `${m.label}: needs ${fmt.pct(m.physical, 0)} physical, ${fmt.pct(m.financial, 0)} financial`).join('; ')])}
        total={['Total', total(x => x.days), total(x => x.epcFixed), total(x => x.epcVariable), total(x => x.otherUses), total(x => x.gst),
          total(x => x.idc), total(x => x.totalCost), last.cumCost, total(x => x.physical), last.cumPhysical, last.cumFinancial,
          total(x => x.support), total(x => x.equity), total(x => x.debt), last.closingDebt, '', '']} />
    </Panel>
  </>
}

export function Phasing() {
  return (
    <SectionLayout id="phasing"
      inputs={<>{['Phasing', 'Build Milestones'].map(g => <InputGroup key={g} section="phasing" group={g} />)}</>}
      results={<PhasingResults />} />
  )
}
