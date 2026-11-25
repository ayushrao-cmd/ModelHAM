import { DataTable } from '../components/DataTable'
import { InputGroup } from '../components/InputGroup'
import { opexForYear } from '../engine/operations'
import { fmt } from '../lib/format'
import { useModel } from '../state/useModel'
import { CheckCard, Panel, SectionLayout, Stats } from './SectionLayout'

const LINES = [
  ['routine', 'Routine maintenance'], ['majorMaintenance', 'Major maintenance'], ['staff', 'Staff'], ['electricity', 'Electricity'],
  ['insurance', 'Insurance'], ['ieFee', 'Independent Engineer fee'], ['patrolRunning', 'Patrol running'], ['financeLegal', 'Finance & legal'],
] as const
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function Operations() {
  const { active: r, checks } = useModel()
  const i = r.inputs, epcNet = i.build.epcFixed + r.build.epcVariable
  // Annual opex = the two half-year periods of each operating year, each costed at its payment date (as the engine does).
  const years = Array.from({ length: i.deal.operateYears }, (_, k) => r.ops.filter(p => p.year === k + 1)
    .map(p => opexForYear(i, p.year, p.day, epcNet))
    .reduce((acc, o) => Object.fromEntries(LINES.map(([key]) => [key, (acc[key] ?? 0) + o[key] / 2])) as Record<string, number>, {} as Record<string, number>))
  const lineTotal = (key: string) => sum(years.map(y => y[key] ?? 0))
  const yearTotal = (y: Record<string, number>) => sum(LINES.map(([key]) => y[key] ?? 0))
  const total = sum(years.map(yearTotal))
  const tx = i.tax, taxRate = tx.baseRate * (1 + tx.surcharge) * (1 + tx.cess)
  return (
    <SectionLayout id="operations"
      inputs={<>{['Running costs', 'Maintenance', 'Insurance', 'Inflation', 'Tax'].map(g => <InputGroup key={g} section="operations" group={g} />)}</>}
      results={<>
        <Stats items={[
          { label: 'Operating costs', value: fmt.cr(total), sub: `Over ${i.deal.operateYears} years, inflated` },
          { label: 'First-year costs', value: fmt.cr(years[0] ? yearTotal(years[0]) : null), sub: 'Operating year 1' },
          { label: 'Effective tax rate', value: fmt.pct(taxRate), sub: 'Base rate with surcharge and cess' },
        ]} />
        <CheckCard check={checks.find(c => c.id === 'om-margin')} value={fmt.cr(r.kpis.omMargin)} />
        <Panel>
          <DataTable title="Operating costs by year" description="₹ Cr per operating year; scroll sideways for later years"
            columns={[{ label: 'Cost line' }, ...years.map((_, k) => ({ label: `Y${k + 1}` })), { label: 'Total' }]}
            rows={LINES.map(([key, label]) => [label, ...years.map(y => y[key] ?? 0), lineTotal(key)])}
            total={['Total', ...years.map(yearTotal), total]} />
        </Panel>
      </>} />
  )
}
