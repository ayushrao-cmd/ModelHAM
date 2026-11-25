import { DrawdownChart } from '../charts/DrawdownChart'
import { MilestoneChart } from '../charts/MilestoneChart'
import { DataTable } from '../components/DataTable'
import { InputGroup } from '../components/InputGroup'
import { fmt } from '../lib/format'
import { useModel } from '../state/useModel'
import { Panel, SectionLayout, Stats } from './SectionLayout'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function Build() {
  const { active: r } = useModel()
  const b = r.build
  const net = sum(b.uses.map(u => u.net)), gst = sum(b.uses.map(u => u.gst))
  const epc = b.uses.filter(u => u.key.startsWith('epc')).reduce((a, u) => a + u.net + u.gst, 0)
  return (
    <SectionLayout id="build"
      inputs={<>{['Hard costs', 'Soft costs', 'Phasing', 'Build Milestones'].map(g => <InputGroup key={g} section="build" group={g} />)}</>}
      results={<>
        <Stats items={[
          { label: 'Total project cost', value: fmt.cr(b.totalUses), sub: 'All build-period uses incl. GST' },
          { label: 'EPC incl. GST', value: fmt.cr(epc), sub: `${fmt.pct(epc / b.totalUses)} of total cost` },
          { label: 'Net GST credit', value: fmt.cr(b.netGstCredit),
            sub: 'Recovered from Completion Payments' },
        ]} />
        <Panel>
          <DataTable title="Uses of funds" description="₹ Cr, build period"
            columns={[{ label: 'Use' }, { label: 'Net' }, { label: 'GST' }, { label: 'Total' }, { label: '% of total', format: n => fmt.pct(n) }]}
            rows={b.uses.map(u => [u.label, u.net, u.gst, u.net + u.gst, (u.net + u.gst) / b.totalUses])}
            total={['Total', net, gst, b.totalUses, 1]} />
        </Panel>
        <Panel><DrawdownChart result={r} /></Panel>
        <Panel><MilestoneChart result={r} /></Panel>
      </>} />
  )
}
