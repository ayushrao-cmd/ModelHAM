import { addMonths, eomonth, fyEnd } from '../dates'
import type { Inputs } from '../types'
import { YEAR, daysInFy } from './grid'
import type { Day, Grid } from './types'

/**
 * FY-end index from `start` (Inflation rows 32 and 36..44): the start FY is simple for the stub,
 * 1 + r × (FYend(start) − start + 1)/days in FY, then each later FY compounds by (1 + r × year factor), the year
 * factor (Inflation r10) being 1 except the concession-end FY, (N12 − FY start + 1)/days in FY (352/365 at the
 * sample). Runs to FY(concession end); FYs outside it are absent (V16's SUMIF/VLOOKUP then gives 0).
 * V16 divides the stub by the days of FY(bid date) (`H$9`); that equals FY(start) except for an April bid, where
 * V16's PIM row goes to 0 everywhere (H32 finds no stub FY). Generalised: the stub FY's own days.
 */
function fyChain(start: Day, rate: number, g: Grid): Map<Day, number> {
  const out = new Map<Day, number>()
  let f = fyEnd(start), v = 1 + rate * (f - start + 1) / daysInFy(f)
  out.set(f, v)
  for (let prev = f; (f = addMonths(prev, 12)) <= fyEnd(g.concessionEnd); prev = f) {
    v *= 1 + rate * (Math.min(f, g.concessionEnd) - prev) / daysInFy(f)
    out.set(f, v)
  }
  return out
}

/**
 * Per-head expense inflation index at each FY end of `g.fys` (Inflation!H36:AB44, recon B §3.2), from the bid
 * date (`DB!C12`). The whole FY's cost is priced at this FY-end value (B-Q10). Insurance passes rate 0 → 1.
 */
export function inflationIndex(_i: Inputs, g: Grid, rate: number): number[] {
  const m = fyChain(g.bid, rate, g)
  return g.fys.map((f) => m.get(f) ?? 0)
}

/**
 * PIM (price index multiple) at `indexation.pim` (Inflation r24 = '1. IO'!P6 + DB!L9 sensitivity, 0). Base date
 * EOMONTH(bid, −1) (Inflation!H7, DB!C76). 'Fin Set'!F36 "PIM on actual series" = "No" (the WPI/CPI actual-series
 * branch is not modelled) and E36 "inflation impact on grant" = 100%.
 * - `atFyEnd`: Inflation!H32:AB32 per FY of `g.fys` (1.030137 FY27 … 2.084010 FY45 at the sample).
 * - `at(day)`: O&M payment index, Revenue r37 = r33 × (1 + r35): PIM at the previous FY end
 *   (EDATE(FYend(day), −12)) × (1 + r × (day − that FY end)/365). V16 quirk B-Q10: simple within the FY on top of
 *   the previous FY-end PIM.
 * - `grantAt(day)`: grant tranche index, DB r81/100 = 1 + r × E36 × ROUND(day − EOMONTH(bid, −1), 0)/365 at the
 *   interpolated (fractional) milestone date. V16 quirk A-Q6: simple interest on rounded days, no compounding.
 */
export function pim(i: Inputs, g: Grid): { atFyEnd: number[]; at(day: Day): number; grantAt(day: Day): number } {
  const r = i.indexation.pim
  const base = eomonth(addMonths(g.bid, -1))
  const m = fyChain(base, r, g)
  const grantShare = 1 // 'Fin Set'!E36
  return {
    atFyEnd: g.fys.map((f) => m.get(f) ?? 0),
    at(day) {
      const prev = addMonths(fyEnd(day), -12)
      return (m.get(prev) ?? 0) * (1 + r * (day - prev) / YEAR)
    },
    grantAt: (day) => 1 + r * grantShare * Math.round(day - base) / YEAR,
  }
}
