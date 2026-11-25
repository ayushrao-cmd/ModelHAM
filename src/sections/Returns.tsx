import { useMemo, useState } from 'react'
import { DscrChart } from '../charts/DscrChart'
import { EquityWaterfallChart } from '../charts/EquityWaterfallChart'
import { TornadoChart } from '../charts/TornadoChart'
import { DataTable } from '../components/DataTable'
import { InputGroup } from '../components/InputGroup'
import type { ModelResult } from '../engine/model'
import { tornado } from '../engine/sensitivity'
import { fmt } from '../lib/format'
import { useStore } from '../state/store'
import { useModel } from '../state/useModel'
import { Panel, SectionLayout, Segmented } from './SectionLayout'

type Metric = 'equityIrr' | 'dscrMin'
const METRICS: Record<Metric, { label: string; get(r: ModelResult): number | null; format(n: number | null): string }> = {
  equityIrr: { label: 'Equity IRR', get: r => r.kpis.equityIrr, format: n => fmt.pct(n) },
  dscrMin: { label: 'Min DSCR', get: r => r.kpis.dscrMin, format: fmt.x },
}

export function Returns() {
  const { active: r, base } = useModel()
  const isBase = useStore(s => s.activeId === s.baseId)
  const [metric, setMetric] = useState<Metric>('equityIrr')
  // 13 model runs: only when the inputs or the metric change.
  const bars = useMemo(() => tornado(r.inputs, METRICS[metric].get), [r.inputs, metric])
  const irr = (n: number | null) => n ?? '—'
  const rows: [string, (x: ModelResult) => number | null][] = [
    ['Project pre-tax', x => x.kpis.projectIrrPre], ['Project post-tax', x => x.kpis.projectIrrPost], ['Equity', x => x.kpis.equityIrr]]
  return (
    <SectionLayout id="returns"
      inputs={<>
        <Panel>
          <DataTable title="Internal rates of return" description="XIRR on dated cash flows: project flows before and after tax, and equity draws against equity cash."
            columns={[{ label: 'Return' }, { label: 'IRR', format: n => fmt.pct(n) }, ...(isBase ? [] : [{ label: 'Base', format: (n: number) => fmt.pct(n) }])]}
            rows={rows.map(([l, f]) => [l, irr(f(r)), ...(isBase ? [] : [irr(f(base))])])} />
        </Panel>
        <InputGroup section="returns" group="Targets" />
      </>}
      results={<>
        <Panel><DscrChart result={r} /></Panel>
        <Panel><EquityWaterfallChart result={r} /></Panel>
        <Panel>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold leading-6">What moves the result</h2>
            <Segmented label="Sensitivity metric" value={metric} onChange={setMetric}
              options={(Object.keys(METRICS) as Metric[]).map(m => ({ value: m, label: METRICS[m].label }))} />
          </div>
          <TornadoChart bars={bars} format={METRICS[metric].format} />
        </Panel>
      </>} />
  )
}
