import { annualIrr } from '../../cash'
import { toFy } from '../../revenue'
import type { V16Result } from '../../types'

/**
 * The IndAS financial asset (Fin-INDAS r399–r413, C-statements §5), per FY, in V16's signs: `addition` the EPC cost
 * (r402, +), `grant` the 40% grant (r403, −), `receipt` the 60% completion-cost instalments (r404, −).
 */
export interface FinancialAsset {
  /** D400 "Goal Seek IRR" = D413 = IRR(60% receipts + grant − EPC cost) over the FY columns: the rate that brings the
   *  asset to 0 in the last FY. 0 where the IRR has no root (V16 #NUM!). */
  rate: number
  /** r401 (previous closing; 0 in the first FY, blank in V16), r405 = opening × rate (full year, nothing on the year's
   *  own movements), r406 closing = r401..r405. */
  opening: number[]; addition: number[]; grant: number[]; receipt: number[]; financeIncome: number[]; closing: number[]
}

export function financialAsset(r: V16Result): FinancialAsset {
  const g = r.grid, l = r.capitalised.lines
  // r402 = Σ_FY COP-MOF!348 = EPC fixed (r322) + EPC variable (r323), ex-GST.
  const addition = toFy(l.epcFixed.map((v, k) => v + l.epcVariable[k]), g.periods.map((p) => p.end), g)
  const grant = r.capitalised.grantByFy.map((v) => -v) // −Σ_FY DB!84 (with PIM, ex-GST)
  const receipt = toFy(r.revenue.instalment, r.revenue.dates, g).map((v) => -v) // −Σ_FY Revenue!14
  const rate = annualIrr(receipt.map((v, k) => -v - grant[k] - addition[k])) ?? 0 // r413 = r410 + r411 + r412
  const opening: number[] = [], financeIncome: number[] = [], closing: number[] = []
  addition.forEach((a, k) => {
    opening[k] = k ? closing[k - 1] : 0
    financeIncome[k] = opening[k] * rate
    closing[k] = opening[k] + a + grant[k] + receipt[k] + financeIncome[k]
  })
  return { rate, opening, addition, grant, receipt, financeIncome, closing }
}
