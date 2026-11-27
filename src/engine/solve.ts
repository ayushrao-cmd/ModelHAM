import type { Inputs } from './types'
import { runModel } from './model'
import { setAt } from '../lib/path'
import { fmt } from '../lib/format'

export type SolveResult =
  | { ok: true; bidPrice: number; equityIrr: number; runs: number }
  | { ok: false; reason: string; runs: number }

const MAX_RUNS = 40        // hard cap on runModel calls (~10 ms each), including range-end evaluations
const BID_TOL = 0.01       // stop when the bid interval is narrower than ₹0.01 Cr
const IRR_TOL = 1e-6       // ...or the equity IRR is within 1e-6 of target
const RANGE_LO = 0.5       // default search range: 0.5x current bid
const RANGE_HI = 1.5       // ...to 1.5x current bid

export function solveBidPrice(i: Inputs, target: number, range?: [number, number], maxRuns = MAX_RUNS): SolveResult {
  let [lo, hi] = range ?? [i.deal.bidPrice * RANGE_LO, i.deal.bidPrice * RANGE_HI]
  let runs = 0
  // Equity IRR rises with bid; null (no IRR) is treated as -Infinity.
  const f = (bid: number) => {
    runs++
    return runModel(setAt(i, 'deal.bidPrice', bid)).kpis.equityIrr ?? -Infinity
  }
  const fLo = f(lo), fHi = f(hi)
  if (!(fLo <= target && target <= fHi))
    return { ok: false, reason: `Target equity IRR not reachable between ${fmt.cr(lo)} and ${fmt.cr(hi)}`, runs }
  let mid = lo, fMid = fLo
  while (hi - lo >= BID_TOL) {
    if (runs >= maxRuns) return { ok: false, reason: `Solver did not converge within ${maxRuns} runs`, runs }
    mid = (lo + hi) / 2
    fMid = f(mid)
    if (Math.abs(fMid - target) < IRR_TOL) break
    if (fMid < target) lo = mid; else hi = mid
  }
  return { ok: true, bidPrice: mid, equityIrr: fMid, runs }
}
