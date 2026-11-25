import { DebtChart } from '../charts/DebtChart'
import { SourcesUsesChart } from '../charts/SourcesUsesChart'
import { InputGroup } from '../components/InputGroup'
import { fmt } from '../lib/format'
import { useModel, useResult } from '../state/useModel'
import { CheckCard, Panel, SectionLayout, Stats } from './SectionLayout'

function CapitalResults() {
  const r = useResult()
  const { checks } = useModel()
  const b = r.build, k = r.kpis
  return <>
    <Stats items={[
      { label: 'Senior debt', value: fmt.cr(b.debt), sub: `Debt / equity ${fmt.x(k.leverage)}` },
      { label: 'Equity', value: fmt.cr(b.equity), sub: `${fmt.cr(b.shareCapital)} share capital, ${fmt.cr(b.promoterDebt)} promoter sub-debt` },
      { label: 'Construction Support', value: fmt.cr(b.support), sub: `Plus ${fmt.cr(b.supportGst)} GST` },
    ]} />
    <div className="grid gap-4 lg:grid-cols-2">
      <CheckCard check={checks.find(c => c.id === 'solver-converged')} value={`${fmt.cr(b.idc)} Interest During Build`} />
      <Panel>
        <h2 className="text-[13px] font-medium text-muted-foreground">Debt Service Reserve</h2>
        <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{fmt.cr(b.reserve)}</p>
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
          Funded at completion to cover the first payment's debt service, then held at the next period's principal and interest until the final payment.
        </p>
      </Panel>
    </div>
    <Panel><SourcesUsesChart result={r} /></Panel>
    <Panel><DebtChart result={r} /></Panel>
  </>
}

export function Capital() {
  return (
    <SectionLayout id="capital"
      inputs={<>{['Structure', 'Loan terms', 'Repayment'].map(g => <InputGroup key={g} section="capital" group={g} />)}</>}
      results={<CapitalResults />} />
  )
}
