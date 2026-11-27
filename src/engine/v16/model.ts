import type { Inputs } from '../types'
import { runCash, dscrRows } from './cash'
import { grantSchedule, runConstruction, type ConstructionResult } from './construction'
import { runDebt } from './debt'
import { codInterestDsr, runFunds, type FundsResult } from './funds'
import { buildGrid } from './grid'
import { runGst } from './gst'
import { methodNotes } from './notes'
import { runOpex } from './opex'
import { runRevenue, toFy } from './revenue'
import { bookDepreciation, capitalisedCost, csr, igaapProfit, runTax, taxDepreciation, type CsrResult, type TaxResult } from './tax'
import type { Grid, IgaapProfit, Loop, V16Kpis, V16Result } from './types'

export type { IgaapProfit, V16Result } from './types'

/** Iteration caps of the two fixed points (default 50 each); lower them to see a non-converged result. */
export interface V16Options { maxConstructionIterations?: number; maxTaxIterations?: number }

// Funds ↔ tax ↔ cash for DSCR fixed point; V16 relies on Excel iteration (100 × 0.001).
const LOOP_MAX = 50, TAX_TOL = 1e-9

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const maxDiff = (a: number[], b: number[]) => a.reduce((m, v, k) => Math.max(m, Math.abs(v - (b[k] ?? 0))), 0)

/** CSR, PAT and net worth from PBT before CSR and tax. CSR_t tests PAT and net worth of t−1, so each pass fixes one
 *  more FY; bounded by FY count + 1 passes. Also the IndAS statements' CSR (`standard` 'indas', on IndAS figures). */
export function afterTax(i: Inputs, g: Grid, c: ConstructionResult, turnover: number[], pbt: number[], tax: number[],
  standard: 'igaap' | 'indas' = 'igaap'): { profit: IgaapProfit; loop: Loop } {
  const n = g.fys.length
  let s = 0
  const shareCapital = toFy(c.months.map((m) => m.equityShareCapital), g.periods.map((p) => p.end), g).map((v) => (s += v))
  let amount = Array<number>(n).fill(0), pat: number[] = [], netWorth: number[] = [], converged = false, iterations = 0
  let detail: CsrResult | undefined
  while (!converged && iterations <= n) {
    iterations++
    let reserves = 0
    pat = pbt.map((v, k) => v - amount[k] - tax[k])
    netWorth = pat.map((v, k) => shareCapital[k] + (reserves += v)) // r40 + r42 (r43..r46 are 0 in V16)
    detail = csr(i, g, pbt, netWorth, turnover, pat, standard)
    converged = maxDiff(detail.amount, amount) === 0
    amount = detail.amount
  }
  if (!converged) pat = pbt.map((v, k) => v - amount[k] - tax[k]) // keep PAT consistent with the CSR returned
  return { profit: { turnover, pbt, csr: amount, pat, netWorth, csrDetail: detail! }, loop: { converged, iterations } }
}

/**
 * The V16 model end to end. Two capped fixed points:
 * 1. construction ↔ operations: the interest DSR funded at COD is ½ × FY32's senior-debt interest, which depends on the
 *    debt it helps fund; solved inside construction's outer loop. The post-COD O&M needs no loop (opex depends only on
 *    the grant schedule).
 * 2. funds ↔ tax: interest on funds is taxable, the expense fund holds the same FY's tax (B-Q2), and the DSR top-ups are
 *    capped by cash available for DSCR (r136), which is after tax and CSR.
 * Throws on invalid dates (`buildGrid`).
 */
export function runV16(i: Inputs, opts: V16Options = {}): V16Result {
  const { maxConstructionIterations = LOOP_MAX, maxTaxIterations = LOOP_MAX } = opts
  const g = buildGrid(i)
  const opex = runOpex(i, g, sum(grantSchedule(i, g).pim))
  const c = runConstruction(i, g, { postCodOpex: opex.postCodOpex,
    interestDsr: (cc) => codInterestDsr(i, g, runDebt(i, g, cc)) }, maxConstructionIterations)
  const debt = runDebt(i, g, c), rev = runRevenue(i, g, c), gst = runGst(g, c, rev, opex)
  const cap = capitalisedCost(c, g), book = bookDepreciation(cap, rev, g), taxDep = taxDepreciation(cap, g, i)

  let taxByFy = g.fys.map(() => 0), cfads = g.fys.map(() => 0), converged = false, iterations = 0
  let funds: FundsResult, tax: TaxResult, igaap: IgaapProfit, csrLoop: Loop
  do {
    iterations++
    funds = runFunds(i, g, c, rev, opex, debt, taxByFy, cfads)
    const pl = igaapProfit(g, rev, opex, debt, gst, funds, book.depreciation)
    tax = runTax(i, g, pl.pbt, book.depreciation, taxDep.depreciation)
    ;({ profit: igaap, loop: csrLoop } = afterTax(i, g, c, pl.turnover, pl.pbt, tax.tax))
    const next = dscrRows(g, debt, funds, gst, book.depreciation, igaap.pat).cfads
    converged = maxDiff(tax.tax, taxByFy) < TAX_TOL && maxDiff(next, cfads) < TAX_TOL
    taxByFy = tax.tax; cfads = next
  } while (!converged && iterations < maxTaxIterations)

  const cash = runCash(g, { c, rev, opex, debt, funds, gst, cap, bookDep: book.depreciation, tax: tax.tax,
    csr: igaap.csr, pat: igaap.pat })
  const kpis: V16Kpis = {
    projectIrrPre: cash.irr.projectPre, projectIrrPost: cash.irr.projectPost,
    equityIrr: cash.irr.equityHalfYearly, equityIrrPre: cash.irr.equityHalfYearlyPre,
    equityIrrAnnualPost: cash.irr.equityAnnualPost, equityIrrAnnualPre: cash.irr.equityAnnualPre,
    equityIrrMobAdj: cash.irr.equityMobAdj,
    dscrMin: cash.dscrMin, dscrAvg: cash.dscrAvg, dscrMax: cash.dscrMax,
    totalProjectCost: c.tpc, grant: sum(c.uses.grant.amount), debt: c.debt, equity: c.equity,
    leverage: c.equity > 0 ? c.debt / c.equity : 0, completionBase: rev.completionBase,
    omMargin: sum(rev.om) - sum(opex.total),
  }
  return { inputs: i, grid: g, construction: c, revenue: rev, opex, debt, funds, gst, capitalised: cap, bookDep: book,
    taxDep, tax, igaap, cash, kpis, notes: methodNotes(cash), converged: c.converged && converged && csrLoop.converged,
    iterations: c.iterations + iterations,
    loops: { construction: { converged: c.converged, iterations: c.iterations }, tax: { converged, iterations },
      csr: csrLoop } }
}
