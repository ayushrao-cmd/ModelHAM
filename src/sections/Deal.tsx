import { InputGroup } from '../components/InputGroup'
import { Timeline } from '../components/Timeline'
import { fmt } from '../lib/format'
import { useModel } from '../state/useModel'
import { CheckCard, Panel, SectionLayout, Stats } from './SectionLayout'

export function Deal() {
  const { active: r, checks } = useModel()
  const { bidPrice: bid, authorityEstimate: ae, buildDays, operateYears } = r.inputs.deal
  const vsAe = ae > 0 ? (bid - ae) / ae : null
  const check = (id: string) => checks.find(c => c.id === id)
  return (
    <SectionLayout id="deal"
      strip={<Panel><Timeline timeline={r.timeline} /></Panel>}
      inputs={<>{['Bid', 'Dates', 'Project'].map(g => <InputGroup key={g} section="deal" group={g} />)}</>}
      results={<>
        <Stats items={[
          { label: 'Bid vs Authority Estimate', value: vsAe == null ? '—' : `${vsAe > 0 ? '+' : ''}${fmt.pct(vsAe)}`,
            sub: `${fmt.cr(bid)} bid against ${fmt.cr(ae)}` },
          { label: 'Build period', value: `${fmt.num(buildDays, 0)} days`, sub: `${fmt.date(r.timeline.start)} to ${fmt.date(r.timeline.completion)}` },
          { label: 'Concession ends', value: fmt.date(r.timeline.end), sub: `After ${operateYears} years of operations` },
        ]} />
        <div className="grid gap-4 lg:grid-cols-2">
          <CheckCard check={check('financing-tieup')} value={fmt.cr(r.build.debt + r.build.equity)} />
          <CheckCard check={check('aps-trigger')} value={check('aps-trigger')?.pass ? 'Not required' : 'Required'} />
        </div>
      </>} />
  )
}
