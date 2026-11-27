import { useMemo } from 'react'
import { ResultsGate } from '../components/ResultsGate'
import { buildIgaap } from '../engine/v16/statements/igaap'
import { fmt } from '../lib/format'
import { useResult } from '../state/useModel'
import { Panel, SectionHeader } from './SectionLayout'

// ponytail: temporary body until the IGAAP | IndAS StatementsView (with drill-down) is wired in; P&L rows only.
const cell = (v: number) => (Number.isFinite(v) ? (Math.abs(v) < 0.005 ? '–' : v < 0 ? `(${fmt.num(-v)})` : fmt.num(v)) : '')

function StatementsBody() {
  const r = useResult()
  const s = useMemo(() => buildIgaap(r), [r])
  const pl = s.statements.find(x => x.key === 'pl')!
  return (
    <Panel>
      <h2 className="text-sm font-medium">{pl.title}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">₹ Cr, financial years ending 31 March, as the original workbook</p>
      <div role="region" aria-label={pl.title} tabIndex={0} className="mt-2 overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px] tabular-nums">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 border-b bg-card py-2 pr-3 text-left text-xs font-medium text-muted-foreground">Line</th>
              <th scope="col" className="border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">Total</th>
              {s.years.map(y => <th key={y} scope="col" className="whitespace-nowrap border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">{fmt.fy(y)}</th>)}
            </tr>
          </thead>
          <tbody>
            {pl.rows.map(row => (
              <tr key={row.id} className={row.kind === 'line' ? undefined : 'font-semibold'}>
                <th scope="row" className="sticky left-0 min-w-[15rem] bg-card py-1.5 pr-3 text-left font-[inherit]">{row.num ? `${row.num} ` : ''}{row.label}</th>
                <td className="whitespace-nowrap px-3 py-1.5 text-right">{cell(row.total)}</td>
                {row.values.map((v, k) => <td key={k} className="whitespace-nowrap px-3 py-1.5 text-right">{cell(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

export function Statements() {
  return (
    <div className="space-y-6">
      <SectionHeader id="statements" />
      <ResultsGate><StatementsBody /></ResultsGate>
    </div>
  )
}
