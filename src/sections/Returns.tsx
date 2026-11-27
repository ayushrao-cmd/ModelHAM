import { useEffect, useState } from 'react'
import { DscrChart } from '../charts/DscrChart'
import { EquityWaterfallChart } from '../charts/EquityWaterfallChart'
import { TornadoChart } from '../charts/TornadoChart'
import { DataTable } from '../components/DataTable'
import { InputGroup } from '../components/InputGroup'
import type { ModelResult } from '../engine/model'
import { type TornadoBar, tornado } from '../engine/sensitivity'
import type { Inputs } from '../engine/types'
import { fmt } from '../lib/format'
import { useStore } from '../state/store'
import { ResultsGate } from '../components/ResultsGate'
import { useModel, useResult } from '../state/useModel'
import { Panel, SectionLayout, Segmented } from './SectionLayout'

type Metric = 'equityIrr' | 'dscrMin'
const TORNADO_SETTLE_MS = 400 // after the last edit
const METRICS: Record<Metric, { label: string; get(r: ModelResult): number | null; format(n: number | null): string }> = {
  equityIrr: { label: 'Equity IRR', get: r => r.kpis.equityIrr, format: n => fmt.pct(n) },
  dscrMin: { label: 'Min DSCR', get: r => r.kpis.dscrMin, format: fmt.x },
}

/** Every IRR the original reports (Fin-IGAAP IRR block), headline first. */
export const IRRS: [string, (x: ModelResult) => number | null][] = [
  ['Equity, post-tax (half-yearly)', x => x.kpis.equityIrr], ['Equity, pre-tax (half-yearly)', x => x.kpis.equityIrrPre],
  ['Equity, post-tax (annual)', x => x.kpis.equityIrrAnnualPost], ['Equity, pre-tax (annual)', x => x.kpis.equityIrrAnnualPre],
  ['Equity, post-tax, mobilisation-advance adjusted', x => x.kpis.equityIrrMobAdj],
  ['Equity, pre-tax, mobilisation-advance adjusted', x => x.cash.irr.equityMobAdjPre],
  ['Project, pre-tax (annual)', x => x.kpis.projectIrrPre], ['Project, post-tax (annual)', x => x.kpis.projectIrrPost],
]

/** IRR table; the Base column only when another scenario is active and the base is complete. */
function IrrTable() {
  const r = useResult()
  const { base } = useModel()
  const isBase = useStore(s => s.activeId === s.baseId)
  const showBase = !isBase && base
  const irr = (n: number | null) => n ?? '—'
  return (
    <Panel>
      <DataTable title="Internal rates of return" description="As the original workbook: project IRRs on annual flows; the headline equity IRR on half-yearly annuity dates (XIRR). A dash: no IRR exists for these flows."
        columns={[{ label: 'Return' }, { label: 'IRR', format: n => fmt.pct(n) }, ...(showBase ? [{ label: 'Base', format: (n: number) => fmt.pct(n) }] : [])]}
        rows={IRRS.map(([l, f]) => [l, irr(f(r)), ...(showBase ? [irr(f(showBase))] : [])])} />
    </Panel>
  )
}

function ReturnsResults() {
  const r = useResult()
  const [metric, setMetric] = useState<Metric>('equityIrr')
  // 13 model runs (about a second): only once the inputs or the metric have settled, so typing stays responsive.
  // Until then the previous bars stay, marked as updating.
  const [done, setDone] = useState<{ for: Inputs; metric: Metric; bars: TornadoBar[] } | null>(null)
  useEffect(() => {
    if (done?.for === r.inputs && done.metric === metric) return
    const t = setTimeout(() => setDone({ for: r.inputs, metric, bars: tornado(r.inputs, METRICS[metric].get) }), TORNADO_SETTLE_MS)
    return () => clearTimeout(t)
  }, [r.inputs, metric, done])
  const stale = !done || done.for !== r.inputs || done.metric !== metric
  return <>
    <Panel><DscrChart result={r} /></Panel>
    <Panel><EquityWaterfallChart result={r} /></Panel>
    <Panel>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold leading-6">What moves the result</h2>
        <Segmented label="Sensitivity metric" value={metric} onChange={setMetric}
          options={(Object.keys(METRICS) as Metric[]).map(m => ({ value: m, label: METRICS[m].label }))} />
      </div>
      <div aria-busy={stale} className={stale ? 'opacity-60 motion-safe:transition-opacity' : undefined}>
        {done && done.metric === metric ? <TornadoChart bars={done.bars} format={METRICS[metric].format} />
          : <p role="status" className="py-10 text-center text-sm text-muted-foreground">Working out the sensitivities…</p>}
      </div>
    </Panel>
  </>
}

export function Returns() {
  return (
    <SectionLayout id="returns"
      inputs={<>
        <ResultsGate quiet><IrrTable /></ResultsGate>
        <InputGroup section="returns" group="Targets" />
      </>}
      results={<ReturnsResults />} />
  )
}
