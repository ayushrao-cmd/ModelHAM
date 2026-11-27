import { costLines } from '../charts/data'
import { DataTable } from '../components/DataTable'
import { InputGroup } from '../components/InputGroup'
import { fmt } from '../lib/format'
import { useResult } from '../state/useModel'
import { Panel, SectionLayout, Stats } from './SectionLayout'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function BuildResults() {
  const r = useResult()
  const rows = costLines(r), tpc = r.kpis.totalProjectCost
  const gst = sum(rows.map(u => u.gst))
  const epc = sum(rows.filter(u => u.key.startsWith('epc')).map(u => u.gross))
  return <>
    <Stats items={[
      { label: 'Total project cost', value: fmt.cr(tpc), sub: 'Build and COD to first annuity, incl. GST' },
      { label: 'EPC incl. GST', value: fmt.cr(epc), sub: `${fmt.pct(epc / tpc)} of total cost` },
      { label: 'GST input credit', value: fmt.cr(gst), sub: 'Set off against output GST' },
    ]} />
    <Panel>
      <DataTable title="Uses of funds" description="₹ Cr, build period and COD to the first annuity. Patrol rental and finance & legal follow from the build days."
        columns={[{ label: 'Use' }, { label: 'Net' }, { label: 'GST' }, { label: 'Total' }, { label: 'Share', format: n => fmt.pct(n) }]}
        rows={rows.map(u => [u.label, u.gross - u.gst, u.gst, u.gross, u.gross / tpc])}
        total={['Total', tpc - gst, gst, tpc, 1]} />
    </Panel>
  </>
}

export function Build() {
  return (
    <SectionLayout id="build"
      inputs={<>{['Hard costs', 'Soft costs'].map(g => <InputGroup key={g} section="build" group={g} />)}</>}
      results={<BuildResults />} />
  )
}
