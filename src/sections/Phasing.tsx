import { useMemo } from 'react'
import { phasingRows, type PhasingRow } from '../charts/data'
import { DrawdownChart } from '../charts/DrawdownChart'
import { SCurveChart } from '../charts/SCurveChart'
import { shortMonth } from '../charts/theme'
import { DataTable } from '../components/DataTable'
import { InputGroup } from '../components/InputGroup'
import { toIso } from '../engine/dates'
import { fmt } from '../lib/format'
import { useResult } from '../state/useModel'
import { Panel, SectionLayout, Stats } from './SectionLayout'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const pct = (n: number) => fmt.pct(n)
const month = (d: number) => shortMonth(toIso(d))

function PhasingResults() {
  const r = useResult()
  const all = useMemo(() => phasingRows(r), [r])
  const rows = all.filter(x => x.kind === 'construction')
  if (!rows.length) return <Panel><p className="text-sm text-muted-foreground">No build months: set Build Days on Deal & Timeline.</p></Panel>
  const peak = rows.reduce((a, x) => (x.totalCost > a.totalCost ? x : a))
  const receipts = rows.filter(x => x.support > 0)
  const total = (f: (x: PhasingRow) => number) => sum(rows.map(f))
  const tot = (f: (x: PhasingRow) => number) => sum(all.map(f))
  const last = rows[rows.length - 1], end = all[all.length - 1]
  return <>
    <Stats items={[
      { label: 'Build period', value: `${rows.length} months`, sub: `${fmt.num(total(x => x.days), 0)} days, ${month(rows[0].day)} to ${month(last.day)}` },
      { label: 'Peak monthly cost', value: fmt.cr(peak.totalCost), sub: `${fmt.date(peak.day)}, incl. GST and interest` },
      { label: 'Construction Support', value: fmt.cr(total(x => x.support)), sub: `${receipts.length} receipts, incl. GST` },
    ]} />
    <Panel><SCurveChart rows={all} /></Panel>
    <Panel><DrawdownChart result={r} /></Panel>
    <Panel>
      <DataTable title="Construction Support receipts" description="₹ Cr incl. GST and the price index, received in the month each tranche's physical progress is reached"
        columns={[{ label: 'Month' }, { label: 'Physical progress', format: pct }, { label: 'Received' }]}
        rows={receipts.map(x => [fmt.date(x.day), x.cumPhysical, x.support])}
        total={['Total', '', total(x => x.support)]} />
    </Panel>
    <Panel>
      <DataTable title="Monthly construction schedule" className="max-h-[32rem]"
        description="₹ Cr incl. GST (of which GST shown). Months after COD up to the first annuity carry interest, O&M and the DSR. Financial progress is the share of EPC spent."
        columns={[{ label: 'Month' }, { label: 'Days', format: n => fmt.num(n, 0) }, { label: 'EPC fixed' }, { label: 'EPC variable' },
          { label: 'Other uses' }, { label: 'Of which GST' }, { label: 'Interest' }, { label: 'Total cost' }, { label: 'Cumulative cost' },
          { label: 'Physical', format: pct }, { label: 'Cum. physical', format: pct }, { label: 'Cum. financial', format: pct },
          { label: 'Support' }, { label: 'Equity' }, { label: 'Debt' }, { label: 'Closing debt' }, { label: 'Milestone' }]}
        rows={all.map(x => [`${month(x.day)}${x.kind === 'postCod' ? ' (after COD)' : ''}`, x.days, x.epcFixed, x.epcVariable, x.otherUses,
          x.gst, x.interest, x.totalCost, x.cumCost, x.physical, x.cumPhysical, x.cumFinancial, x.support, x.equity, x.debt, x.closingDebt,
          x.milestones.map(m => `${m.label}: needs ${fmt.pct(m.physical, 0)} physical, ${fmt.pct(m.financial, 0)} financial`).join('; ')])}
        total={['Total', tot(x => x.days), tot(x => x.epcFixed), tot(x => x.epcVariable), tot(x => x.otherUses), tot(x => x.gst),
          tot(x => x.interest), tot(x => x.totalCost), end.cumCost, tot(x => x.physical), end.cumPhysical, end.cumFinancial,
          tot(x => x.support), tot(x => x.equity), tot(x => x.debt), end.closingDebt, '']} />
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
