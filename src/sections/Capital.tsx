import { DebtChart } from '../charts/DebtChart'
import { SourcesUsesChart } from '../charts/SourcesUsesChart'
import { InputGroup } from '../components/InputGroup'
import { fmt } from '../lib/format'
import { useModel, useResult } from '../state/useModel'
import { CheckCard, Panel, SectionLayout, Stats } from './SectionLayout'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const max = (xs: number[]) => Math.max(0, ...xs)

function Fund({ title, value, children }: { title: string; value: string; children: React.ReactNode }) {
  return (
    <Panel>
      <h2 className="text-[13px] font-medium text-muted-foreground">{title}</h2>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{children}</p>
    </Panel>
  )
}

function CapitalResults() {
  const r = useResult()
  const { checks } = useModel()
  const c = r.construction, k = r.kpis, f = r.funds, m = c.months, stl = c.uses.stl
  const support = sum(m.map(x => x.grant)), supportGst = sum(m.map(x => x.grantGst))
  const dsrAtCod = sum(m.map(x => x.dsrPrincipal + x.dsrInterest))
  const dsr = f.dsrInterest.closing.map((v, n) => v + f.dsrPrincipal.closing[n])
  const repaidAt = stl.repay.filter(v => v > 0).length
  return <>
    <Stats items={[
      { label: 'Senior debt', value: fmt.cr(c.debt), sub: `Debt / equity ${fmt.x(k.leverage)}` },
      { label: 'Equity', value: fmt.cr(c.equity), sub: `${fmt.cr(c.shareCapital)} share capital, ${fmt.cr(c.usl)} unsecured loan` },
      { label: 'Construction Support', value: fmt.cr(support), sub: `Price-indexed; plus ${fmt.cr(supportGst)} GST` },
    ]} />
    <div className="grid gap-4 lg:grid-cols-2">
      <CheckCard check={checks.find(x => x.id === 'loop-construction')} value={`${fmt.cr(c.idc)} interest during construction`} />
      <Fund title="Short-term loan (STL)" value={fmt.cr(sum(stl.draw))}>
        Drawn in two instalments early in the build and passed back to back to the EPC contractor as mobilisation advance;
        repaid from {repaidAt} Construction Support milestones. Peak balance {fmt.cr(max(stl.balance))}, interest{' '}
        {fmt.cr(sum(stl.interest))} (recovered from the EPC contractor).
      </Fund>
      <Fund title="Debt Service Reserve (DSR)" value={fmt.cr(dsrAtCod)}>
        Funded at COD from the project cost ({fmt.cr(sum(m.map(x => x.dsrInterest)))} interest, {fmt.cr(sum(m.map(x => x.dsrPrincipal)))} principal),
        then topped up to {fmt.num(r.inputs.funds.dsrInterestMonths, 0)} months' interest and the next {fmt.num(r.inputs.funds.dsrPrincipalInstalments, 0)} principal
        instalment(s) from cash. Peak {fmt.cr(max(dsr))}.
      </Fund>
      <Fund title="Funds for Expenses (FFE)" value={fmt.cr(max(f.ffe.closing))}>
        Peak balance: {fmt.num(f.ffeMonths, 2)} months of the next year's interest and O&M and the year's tax, held from the first
        payment lag. Funded at COD {fmt.cr(sum(f.ffe.funded))}.
      </Fund>
      <Fund title="Major Maintenance Reserve (MMR)" value={fmt.cr(max(f.mmr.closing))}>
        Peak balance: {fmt.pct(r.inputs.funds.mmrShare, 0)} of each resurfacing set aside in each of the {fmt.num(r.inputs.funds.mmrYears, 0)} years
        before it, then spent on it ({fmt.cr(sum(f.mmr.used))} over the concession).
      </Fund>
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
