import type { Inputs } from './types'
import { runModel, type ModelResult } from './model'
import { getAt, setAt } from '../lib/path'

export interface TornadoBar { key: string; label: string; low: number | null; high: number | null; base: number | null }

const DEFAULT_PCT = 0.1 // +/-10% flex

// PIM indexes the completion cost and grant; the per-head rates inflate operating costs (insurance is 0 at the sample).
const INFLATION_LINES = ['maintenance', 'staff', 'electricity', 'insurance']
const OPS_COST_LINES = ['routine', 'electricity', 'financeLegal', 'staff', 'patrolRunning', 'ieFee', 'majorMaintenance']

// Each driver scales a set of numeric input paths together.
const DRIVERS: { key: string; label: string; paths: (i: Inputs) => string[] }[] = [
  { key: 'bidPrice', label: 'Bid Price', paths: () => ['deal.bidPrice'] },
  { key: 'epcFixed', label: 'EPC cost', paths: () => ['build.epcFixed'] },
  { key: 'bankRates', label: 'Annuity Rate', paths: i => i.income.bankRates.map((_, k) => `income.bankRates.${k}`) },
  { key: 'operateRate', label: 'Loan Rate – Operate', paths: () => ['capital.operateRate'] },
  { key: 'inflation', label: 'Inflation', paths: () => ['indexation.pim', ...INFLATION_LINES.map(l => `operations.inflation.${l}`)] },
  { key: 'opsCosts', label: 'Operating costs', paths: () => OPS_COST_LINES.map(l => `operations.${l}`) },
]

export function tornado(i: Inputs, metric: (r: ModelResult) => number | null, pct = DEFAULT_PCT): TornadoBar[] {
  const base = metric(runModel(i))
  const at = (paths: string[], f: number) =>
    metric(runModel(paths.reduce((acc, p) => setAt(acc, p, (getAt(i, p) as number) * f), i)))
  const spread = (b: TornadoBar) => (b.low == null || b.high == null ? 0 : Math.abs(b.high - b.low))
  return DRIVERS.map(d => {
    const paths = d.paths(i)
    return { key: d.key, label: d.label, low: at(paths, 1 - pct), high: at(paths, 1 + pct), base }
  }).sort((a, b) => spread(b) - spread(a))
}
