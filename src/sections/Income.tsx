import { IncomeChart } from '../charts/IncomeChart'
import { DataTable } from '../components/DataTable'
import { InputGroup } from '../components/InputGroup'
import { omRates } from '../engine/v16/revenue'
import { fmt } from '../lib/format'
import { useResult } from '../state/useModel'
import { Panel, SectionLayout, Stats } from './SectionLayout'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function IncomeResults() {
  const r = useResult()
  const i = r.inputs, v = r.revenue
  const completion = sum(v.instalment), interest = sum(v.interest), om = sum(v.om), bonus = sum(v.bonus)
  const b = i.income.bankRates, rate = sum(b) / b.length + i.income.spread
  const ry = i.operations.resurfacingYears
  const basis = (y: number, rate: number) => rate === 0 ? 'None in the first year' : ry.includes(y) ? 'Resurfacing year'
    : rate === i.income.omBaseRate ? 'Base rate' : 'Before resurfacing'
  // Concession year y is paid on annuities 2y − 1 and 2y.
  const paidInYear = (y: number) => v.om[2 * y - 2] + (v.om[2 * y - 1] ?? 0)
  return <>
    <Stats items={[
      { label: 'Total completion payments', value: fmt.cr(completion), sub: `Base ${fmt.cr(r.kpis.completionBase)}: indexed bid less Construction Support` },
      { label: 'Annuity rate', value: fmt.pct(rate), sub: `${fmt.cr(interest)} interest on the balance, half the rate each half-year` },
      { label: 'Total O&M payments', value: fmt.cr(om), sub: `Over ${i.deal.operateYears} operating years, indexed` },
    ]} />
    <Panel><IncomeChart result={r} /></Panel>
    <Panel>
      <DataTable title="Income by annuity date" description="₹ Cr, half-yearly"
        columns={[{ label: 'Annuity' }, { label: 'Date' }, { label: 'Completion' }, { label: 'Interest' }, { label: 'O&M' }, { label: 'Bonus' }, { label: 'Total' }]}
        rows={v.dates.map((d, k) => [String(k + 1), fmt.date(d), v.instalment[k], v.interest[k], v.om[k], v.bonus[k],
          v.instalment[k] + v.interest[k] + v.om[k] + v.bonus[k]])}
        total={['Total', '', completion, interest, om, bonus, completion + interest + om + bonus]} className="max-h-96" />
    </Panel>
    <Panel>
      <DataTable title="O&M payment schedule" description="Rate as a share of Bid Price per operating year, from the pavement type and resurfacing years"
        columns={[{ label: 'Year' }, { label: 'Basis' }, { label: 'Rate', format: n => fmt.pct(n) }, { label: 'Payment (₹ Cr)' }]}
        rows={omRates(i).map((rt, k) => [String(k + 1), basis(k + 1, rt), rt, paidInYear(k + 1)])}
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
