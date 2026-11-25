import { IncomeChart } from '../charts/IncomeChart'
import { DataTable } from '../components/DataTable'
import { InputGroup } from '../components/InputGroup'
import { annuityRate, omSchedule } from '../engine/operations'
import { fmt } from '../lib/format'
import { useResult } from '../state/useModel'
import { Panel, SectionLayout, Stats } from './SectionLayout'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function IncomeResults() {
  const r = useResult()
  const i = r.inputs, ops = r.ops
  const completion = sum(ops.map(p => p.completionPayment)), interest = sum(ops.map(p => p.interestIncome)), om = sum(ops.map(p => p.omPayment))
  const ry = i.operations.resurfacingYears
  const basis = (y: number) => y === 1 ? 'None in the first year' : ry.includes(y) ? 'Resurfacing year' : ry.includes(y + 1) ? 'Year before resurfacing' : 'Base rate'
  return <>
    <Stats items={[
      { label: 'Total completion payments', value: fmt.cr(completion), sub: `Indexed base ${fmt.cr(r.kpis.completionCostBase)}` },
      { label: 'Annuity rate', value: fmt.pct(annuityRate(i)), sub: `${fmt.cr(interest)} interest on the balance` },
      { label: 'Total O&M payments', value: fmt.cr(om), sub: `Over ${i.deal.operateYears} operating years, indexed` },
    ]} />
    <Panel><IncomeChart result={r} /></Panel>
    <Panel>
      <DataTable title="Income by payment period" description="₹ Cr, half-yearly"
        columns={[{ label: 'Period' }, { label: 'Date' }, { label: 'Completion' }, { label: 'Interest' }, { label: 'O&M' }, { label: 'Total' }]}
        rows={ops.map(p => [String(p.n), fmt.date(p.day), p.completionPayment, p.interestIncome, p.omPayment,
          p.completionPayment + p.interestIncome + p.omPayment])}
        total={['Total', '', completion, interest, om, completion + interest + om]} className="max-h-96" />
    </Panel>
    <Panel>
      <DataTable title="O&M payment schedule" description="Rate as a share of Bid Price per operating year, derived from the pavement type and resurfacing years"
        columns={[{ label: 'Year' }, { label: 'Basis' }, { label: 'Rate', format: n => fmt.pct(n) }, { label: 'Payment (₹ Cr)' }]}
        rows={omSchedule(i).map((rate, k) => [String(k + 1), basis(k + 1), rate,
          sum(ops.filter(p => p.year === k + 1).map(p => p.omPayment))])}
        total={['Total', '', '', om]} />
    </Panel>
  </>
}

export function Income() {
  return (
    <SectionLayout id="income"
      inputs={<>{['Completion Payments', 'Annuity Rate', 'O&M Payments', 'Indexation'].map(g => <InputGroup key={g} section="income" group={g} />)}</>}
      results={<IncomeResults />} />
  )
}
