import type { CashResult } from './cash'
import type { MethodNote } from './types'

const num = (v16: number | null, consistent: number | null) =>
  ({ ...(v16 !== null && { v16Value: v16 }), ...(consistent !== null && { consistentValue: consistent }) })

/** Reproduced V16 quirks and generalised V16 hard-codes, in plain words; values where a consistent alternative exists. */
export function methodNotes(cash: CashResult): MethodNote[] {
  return [
    { id: 'B-Q5', text: 'Average DSCR divides all cash available for DSCR by debt service, using the full last repayment '
      + 'year although that year\'s DSCR uses half of it. Halving it in the average too gives the consistent value.',
      ...num(cash.dscrAvg, cash.dscrAvgConsistent) },
    { id: 'B-Q1', text: 'The half-yearly equity IRR spreads each year\'s equity cash over that year\'s annuity dates, so '
      + 'the COD year\'s small inflow (no annuity) is left out. Placing it on its year end gives the consistent value.',
      ...num(cash.irr.equityHalfYearly, cash.consistent.equityHalfYearly) },
    { id: 'B-Q6', text: 'The project IRR leaves out the DSR transfers, although the DSR funded at COD is part of the '
      + 'equity and debt drawn. Including them gives the consistent post-tax value.',
      ...num(cash.irr.projectPost, cash.consistent.projectPost) },
    { id: 'B-MA-COD', text: 'The equity IRR after the mobilisation-advance adjustment adds the advance balance of both '
      + 'periods in the COD month. It is 0 there unless the advance is still outstanding when construction ends.' },
    { id: 'A-PIM-APRIL', text: 'For a bid dated in April, V16\'s price index goes to zero (its first-year stub finds no '
      + 'year). The engine uses the stub year\'s own days, which is the same for any other bid month.' },
    { id: 'A-PSBG-SEARCH', text: 'V16 looks for the 30% project-cost point (performance guarantee release) in the first '
      + '25 months only. The engine looks in every month, falling back to one year after the appointed date; the same '
      + 'whenever the point falls within month 25.' },
    { id: 'B-CP-GST-ROW', text: 'V16 picks up construction GST input for FY27–FY30 only. The engine takes it in the '
      + 'year of each construction month, so a longer build keeps all of its GST credit.' },
    { id: 'B-CSR-END', text: 'IGAAP CSR is cut off by testing the previous year against the concession end, so the '
      + 'year right after the end would still pay CSR on the final year. Kept as V16 computes it.' },
  ]
}
