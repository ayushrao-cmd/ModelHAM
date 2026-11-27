import type { Inputs } from '../types'
import { runCash, dscrRows, type CashResult } from './cash'
import { grantSchedule, runConstruction, type ConstructionResult } from './construction'
import { runDebt, type DebtResult } from './debt'
import { codInterestDsr, runFunds, type FundsResult } from './funds'
import { buildGrid } from './grid'
import { runGst, type GstResult } from './gst'
import { methodNotes } from './notes'
import { runOpex, type OpexResult } from './opex'
import { runRevenue, toFy, type RevenueResult } from './revenue'
import { bookDepreciation, capitalisedCost, csr, igaapProfit, runTax, taxDepreciation, type CapitalisedCost,
  type Depreciation, type TaxResult } from './tax'
import type { Grid, MethodNote, V16Kpis } from './types'

/** IGAAP P&L below EBITDA as the KPIs need it (Fin-IGAAP r13, r33–r36, CSR net worth r40 + r42..r46), per FY. The
 *  statements themselves are built from this result in `statements/igaap.ts`. */
export interface IgaapProfit { turnover: number[]; pbt: number[]; csr: number[]; pat: number[]; netWorth: number[] }

export interface V16Result {
  inputs: Inputs; grid: Grid; construction: ConstructionResult; revenue: RevenueResult; opex: OpexResult
  debt: DebtResult; funds: FundsResult; gst: GstResult; capitalised: CapitalisedCost; bookDep: Depreciation
  taxDep: Depreciation & { rate: number }; tax: TaxResult; igaap: IgaapProfit; cash: CashResult
  kpis: V16Kpis; notes: MethodNote[]
  /** Both fixed points within tolerance; `iterations` = construction outer + funds ↔ tax iterations. */
  converged: boolean; iterations: number
  /** Per loop, for Health. */
  loops: { construction: { converged: boolean; iterations: number }; tax: { converged: boolean; iterations: number } }
}

// Funds ↔ tax ↔ cash for DSCR fixed point; V16 relies on Excel iteration (100 × 0.001).
const TAX_MAX = 50, TAX_TOL = 1e-9

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const maxDiff = (a: number[], b: number[]) => a.reduce((m, v, k) => Math.max(m, Math.abs(v - (b[k] ?? 0))), 0)

/** CSR, PAT and net worth from PBT before CSR and tax. CSR_t tests PAT and net worth of t−1, so each pass fixes one
 *  more FY; bounded by the FY count. */
function afterTax(i: Inputs, g: Grid, c: ConstructionResult, turnover: number[], pbt: number[], tax: number[]): IgaapProfit {
  const n = g.fys.length
  let s = 0
  const shareCapital = toFy(c.months.map((m) => m.equityShareCapital), g.periods.map((p) => p.end), g).map((v) => (s += v))
  let amount = Array<number>(n).fill(0), pat: number[] = [], netWorth: number[] = []
  for (let pass = 0; pass <= n; pass++) {
    let reserves = 0
    pat = pbt.map((v, k) => v - amount[k] - tax[k])
    netWorth = pat.map((v, k) => shareCapital[k] + (reserves += v)) // r40 + r42 (r43..r46 are 0 in V16)
    const next = csr(i, g, pbt, netWorth, turnover, pat, 'igaap').amount
    if (maxDiff(next, amount) === 0) break
    amount = next
  }
  return { turnover, pbt, csr: amount, pat, netWorth }
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
export function runV16(i: Inputs): V16Result {
  const g = buildGrid(i)
  const opex = runOpex(i, g, sum(grantSchedule(i, g).pim))
  const c = runConstruction(i, g, { postCodOpex: opex.postCodOpex,
    interestDsr: (cc) => codInterestDsr(i, g, runDebt(i, g, cc)) })
  const debt = runDebt(i, g, c), rev = runRevenue(i, g, c), gst = runGst(g, c, rev, opex)
  const cap = capitalisedCost(c, g), book = bookDepreciation(cap, rev, g), taxDep = taxDepreciation(cap, g, i)

  let taxByFy = g.fys.map(() => 0), cfads = g.fys.map(() => 0), converged = false, iterations = 0
  let funds: FundsResult, tax: TaxResult, igaap: IgaapProfit
  do {
    iterations++
    funds = runFunds(i, g, c, rev, opex, debt, taxByFy, cfads)
    const pl = igaapProfit(g, rev, opex, debt, gst, funds, book.depreciation)
    tax = runTax(i, g, pl.pbt, book.depreciation, taxDep.depreciation)
    igaap = afterTax(i, g, c, pl.turnover, pl.pbt, tax.tax)
    const next = dscrRows(g, debt, funds, gst, book.depreciation, igaap.pat).cfads
    converged = maxDiff(tax.tax, taxByFy) < TAX_TOL && maxDiff(next, cfads) < TAX_TOL
    taxByFy = tax.tax; cfads = next
  } while (!converged && iterations < TAX_MAX)

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
    taxDep, tax, igaap, cash, kpis, notes: methodNotes(cash), converged: c.converged && converged,
    iterations: c.iterations + iterations,
    loops: { construction: { converged: c.converged, iterations: c.iterations }, tax: { converged, iterations } } }
}
