import { InputGroup } from '../components/InputGroup'
import { Timeline } from '../components/Timeline'
import { fmt } from '../lib/format'
import { useModel, useResult } from '../state/useModel'
import { CheckCard, Panel, SectionLayout, Stats } from './SectionLayout'

function DealStrip() {
  const r = useResult()
  const { projectName, authorityName, lengthKm } = r.inputs.deal
  return (
    <Panel>
      <p className="mb-4 text-sm"><span className="font-medium">{projectName}</span>
        <span className="text-muted-foreground"> · {authorityName} · {fmt.num(lengthKm, 2)} km</span></p>
      <Timeline timeline={r.timeline} />
    </Panel>
  )
}

function DealResults() {
  const r = useResult()
  const { checks } = useModel()
  const { bidPrice: bid, authorityEstimate: ae, buildDays, operateYears, lengthKm } = r.inputs.deal
  const vsAe = ae > 0 ? (bid - ae) / ae : null
  const check = (id: string) => checks.find(c => c.id === id)
  return <>
    <Stats items={[
      { label: 'Bid vs Authority Estimate', value: vsAe == null ? '—' : `${vsAe > 0 ? '+' : ''}${fmt.pct(vsAe)}`,
        sub: `${fmt.cr(bid)} bid against ${fmt.cr(ae)}${lengthKm > 0 ? `; ${fmt.cr(bid / lengthKm)} per km over ${fmt.num(lengthKm, 2)} km` : ''}` },
      { label: 'Build period', value: `${fmt.num(buildDays, 0)} days`, sub: `${fmt.date(r.timeline.start)} to ${fmt.date(r.timeline.completion)}` },
      { label: 'Concession ends', value: fmt.date(r.timeline.end), sub: `After ${operateYears} years of operations` },
    ]} />
    <div className="grid gap-4 lg:grid-cols-2">
      <CheckCard check={check('financing-tieup')} value={fmt.cr(r.build.debt + r.build.equity)} />
      <CheckCard check={check('aps-trigger')} value={check('aps-trigger')?.pass ? 'Not required' : 'Required'} />
    </div>
  </>
}

export function Deal() {
  return (
    <SectionLayout id="deal" strip={<DealStrip />}
      inputs={<>{['Bid', 'Dates', 'Project'].map(g => <InputGroup key={g} section="deal" group={g} />)}</>}
      results={<DealResults />} />
  )
}
