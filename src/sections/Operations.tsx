import { DataTable } from '../components/DataTable'
import { InputGroup } from '../components/InputGroup'
import type { OpexHead } from '../engine/v16/opex'
import { fmt } from '../lib/format'
import { useModel, useResult } from '../state/useModel'
import { CheckCard, Panel, SectionLayout, Stats } from './SectionLayout'

const LINES: [OpexHead, string][] = [
  ['routineMaintenance', 'Routine maintenance'], ['majorMaintenance', 'Major maintenance'], ['spvManpower', 'SPV staff'],
  ['electricity', 'Electricity'], ['insurance', 'Insurance'], ['ieFee', 'Independent Engineer fee'],
  ['spvOverhead', 'Patrol running and SPV overhead'], ['financeLegal', 'Finance & legal'],
]
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function OperationsResults() {
  const r = useResult()
  const { checks } = useModel()
  const o = r.opex, i = r.inputs
  // Financial years with operating costs (COD year to the concession end), each cost split into FYs by the original.
  const years = r.grid.fys.flatMap((_, k) => (o.total[k] > 0 ? [k] : []))
  const total = sum(o.total), first = years.length > 1 ? years[1] : years[0]
  return <>
    <Stats items={[
      { label: 'Operating costs', value: fmt.cr(total), sub: `Over ${i.deal.operateYears} years, inflated, ex GST` },
      { label: 'First full-year costs', value: fmt.cr(first == null ? null : o.total[first]), sub: first == null ? undefined : fmt.fy(r.grid.fys[first]) },
      { label: 'Effective tax rate', value: fmt.pct(r.tax.rate), sub: 'Base rate with surcharge and cess' },
    ]} />
    <CheckCard check={checks.find(c => c.id === 'om-margin')} value={fmt.cr(r.kpis.omMargin)} />
    <Panel>
      <DataTable title="Operating costs by financial year" description="₹ Cr, ex GST, per FY ending 31 March; scroll sideways for later years"
        columns={[{ label: 'Cost line' }, ...years.map(k => ({ label: fmt.fy(r.grid.fys[k]) })), { label: 'Total' }]}
        rows={LINES.map(([key, label]) => [label, ...years.map(k => o[key][k]), sum(o[key])])}
        total={['Total', ...years.map(k => o.total[k]), total]} />
    </Panel>
  </>
}

export function Operations() {
  return (
    <SectionLayout id="operations"
      inputs={<>{['Running costs', 'Maintenance', 'Insurance', 'Inflation', 'Tax'].map(g => <InputGroup key={g} section="operations" group={g} />)}</>}
      results={<OperationsResults />} />
  )
}
