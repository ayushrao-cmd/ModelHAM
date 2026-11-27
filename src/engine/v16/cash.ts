import { addMonths, eomonth, fyEnd } from '../dates'
import { xirr } from '../finance'
import type { ConstructionResult } from './construction'
import type { DebtResult } from './debt'
import type { FundsResult, Ledger } from './funds'
import type { GstResult } from './gst'
import type { OpexResult } from './opex'
import { toFy, type RevenueResult } from './revenue'
import type { CapitalisedCost } from './tax'
import type { Day, Grid } from './types'

/**
 * Cash account, DSCR and IRRs (recon B §9, B-G18…G20; C §2.3–§2.5, Fin-IGAAP r66–r208). Per FY of `g.fys` in the
 * sheet's signs (sources +, applications −) unless noted; the half-yearly block is on its own date grid (r175).
 */
export interface DscrRows {
  /** r124 PAT, r125 book depreciation, r126 interest, r127 cash accruals. */
  pat: number[]; bookDep: number[]; interest: number[]; accruals: number[]
  /** r128 (= CF r115), r129 MMR release (MM spend), r130 output GST on revenues. */
  ffeTransfer: number[]; mmrRelease: number[]; outputGst: number[]
  /** Positive here; the sheet's r132, r133, r135 are their negatives. */
  inputGst: number[]; gstPaid: number[]; mmrSetAside: number[]
  /** r137 repayments in the FY, r138 cash for DSCR annuity-wise, r139 principal, r141 principal + interest. */
  repaymentsInFy: number[]; cfadsAnnuity: number[]; repayment: number[]; debtService: number[]
}
export interface CashResult {
  /** CF statement lines by Fin-IGAAP row (r69..r116; rows that are 0 in V16 omitted). */
  lines: Record<number, number[]>
  /** r118 opening, r119 inflow, r120 outflow (negative), r121 closing (= BS r61 Cash in Bank). */
  opening: number[]; inflow: number[]; outflow: number[]; closing: number[]
  /** r136 total cash available for DSCR (post-tax CFADS incl. the FFE movement, excl. the DSR movement). */
  cfads: number[]
  dscrRows: DscrRows
  /** r142 for FY(1st annuity) ≤ FY ≤ FY(repayment end), else null; D143..D145. */
  dscr: (number | null)[]; dscrAvg: number | null; dscrMin: number | null; dscrMax: number | null
  /** D143 with the annuity-wise r138 in the numerator too (the consistent alternative to B-Q5). */
  dscrAvgConsistent: number | null
  /** r155 −(equity + debt drawn), r156 −equity, r158 pre-tax cash, r159 tax, r161/r162 principal/interest (positive),
   *  r163 DSR movement (= r112), r164 post-tax equity inflow, r167/r168 equity flows. */
  annual: { projectOutflow: number[]; equityOutflow: number[]; cfadsPre: number[]; tax: number[]; repayment: number[]
    interest: number[]; dsrMovement: number[]; equityInflow: number[]; equityPre: number[]; equityPost: number[] }
  /** r165 / r166. */
  projectFlows: { pre: number[]; post: number[] }
  /** Half-yearly block on r175 `dates`: r184 outflow, r189 inflow, r190 post, r191 tax, r192 pre; mobilisation-advance
   *  adjusted r199 balance, r201 equity invested, r203 post, r205 pre. */
  equityFlows: { dates: Day[]; outflow: number[]; inflow: number[]; post: number[]; tax: number[]; pre: number[]
    mobBalance: number[]; mobAdjusted: number[]; mobPost: number[]; mobPre: number[] }
  /** D169..D172, D194/D195, D207/D208; null where V16's IFERROR gives 0 (no root). */
  irr: { projectPre: number | null; projectPost: number | null; equityAnnualPre: number | null
    equityAnnualPost: number | null; equityHalfYearly: number | null; equityHalfYearlyPre: number | null
    equityMobAdj: number | null; equityMobAdjPre: number | null }
}

/** 'Fin Set'!G61 Half; F42 rounding digits (r193 start test). */
const HALF = 2, DIGITS = 4

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const add = (...a: number[][]) => a[0].map((_, k) => a.reduce((s, x) => s + (x[k] ?? 0), 0))
const neg = (a: number[]) => a.map((v) => -v)
/** CF transfer to/from a fund: opening + funded − closing (r112, r113, r115). */
const transfer = (l: Ledger) => l.opening.map((o, k) => o + l.funded[k] - l.closing[k])

/** Annual IRR (Excel IRR on FY columns): XIRR on 365-day steps is the same equation. */
const irr = (v: number[]) => xirr(v.map((amount, k) => ({ day: 365 * k, amount })))

/** Fin-IGAAP r124..r141: cash available for DSCR from PAT (B §9.4). Used inside the funds ↔ tax loop as well. */
export function dscrRows(g: Grid, debt: DebtResult, funds: FundsResult, gst: GstResult, bookDep: number[],
  pat: number[]): DscrRows & { cfads: number[] } {
  const interest = debt.interest.slice(0, g.fys.length)
  const accruals = add(pat, bookDep, interest)
  const ffeTransfer = transfer(funds.ffe), mmrRelease = funds.mmr.used, mmrSetAside = funds.mmr.setAside
  const outputGst = add(gst.outputInstalment, gst.outputInterest, gst.outputOm)
  const o = gst.inputOps, inputGst = add(o.om, o.rm, o.mm, o.electricity), gstPaid = gst.paidToGovt
  // r131 interim debt and r134 MM provision path are 0 in V16 ('DB!E53 = 0', 'Fin Set'!B36 = "No").
  const cfads = g.fys.map((_, k) => accruals[k] + ffeTransfer[k] + mmrRelease[k] + outputGst[k] - inputGst[k]
    - gstPaid[k] - mmrSetAside[k])
  // r137 = COUNTIFS(DB r63 annuity FY = FY, DB r60 date ≤ U12); r138 halves the last repayment FY.
  const u14 = fyEnd(debt.repaymentEnd)
  const repaymentsInFy = g.fys.map((f) => g.annuities.filter((d) => fyEnd(d) === f && d <= debt.repaymentEnd).length)
  const cfadsAnnuity = g.fys.map((f, k) => (f > u14 ? 0 : f === u14 ? cfads[k] / HALF * repaymentsInFy[k] : cfads[k]))
  const repayment = debt.repayment.slice(0, g.fys.length)
  return { pat, bookDep, interest, accruals, ffeTransfer, mmrRelease, outputGst, inputGst, gstPaid, mmrSetAside,
    repaymentsInFy, cfadsAnnuity, repayment, debtService: add(repayment, interest), cfads }
}

export interface CashInputs {
  c: ConstructionResult; rev: RevenueResult; opex: OpexResult; debt: DebtResult; funds: FundsResult; gst: GstResult
  cap: CapitalisedCost; bookDep: number[]; tax: number[]; csr: number[]; pat: number[]
}

export function runCash(g: Grid, x: CashInputs): CashResult {
  const { c, rev, opex, debt, funds, gst, cap, tax, csr } = x
  const n = g.fys.length, ends = g.periods.map((p) => p.end), m = c.months
  const byPeriod = (f: (k: number) => number) => toFy(m.map((_, k) => f(k)), ends, g)
  const byAnnuity = (s: number[]) => toFy(s, rev.dates, g)
  const equity = byPeriod((k) => m[k].equityShareCapital + m[k].equityUsl)
  const debtDraw = byPeriod((k) => m[k].debtDraw)
  const stlDraw = byPeriod((k) => m[k].stlDraw), stlRepay = byPeriod((k) => m[k].stlRepay)
  const d = dscrRows(g, debt, funds, gst, x.bookDep, x.pat), cfads = d.cfads
  const dsrTransfer = add(transfer(funds.dsrInterest), transfer(funds.dsrPrincipal))

  // C §2.3. The STL is passed back-to-back to the EPC contractor as mobilisation advance (COP-MOF r167 = r155 draw,
  // r168 = r156 repayment), so r76/r86 and r78/r85 carry the same amounts.
  const sources: Record<number, number[]> = {
    69: byPeriod((k) => m[k].equityShareCapital), 70: byPeriod((k) => m[k].equityUsl), 75: debtDraw, 76: stlDraw,
    78: stlRepay, 79: cap.grantByFy, 80: gst.outputGrant,
    95: byAnnuity(rev.instalment), 96: byAnnuity(rev.interest), 97: byAnnuity(rev.om), 98: byAnnuity(rev.bonus),
    99: funds.interestOnFunds, 101: d.outputGst,
  }
  const uses: Record<number, number[]> = {
    83: neg(cap.costByFy), 84: neg(gst.inputCp), 85: neg(stlRepay), 86: neg(stlDraw), 88: neg(funds.ffe.funded),
    89: neg(add(funds.dsrInterest.funded, funds.dsrPrincipal.funded)),
    104: neg(opex.total), 105: neg(d.interest), 106: neg(csr), 107: neg(tax), 109: neg(d.inputGst),
    110: neg(d.gstPaid), 111: neg(d.repayment), 112: dsrTransfer, 113: transfer(funds.mmr), 115: d.ffeTransfer,
  }
  const inflow = add(...Object.values(sources)), outflow = add(...Object.values(uses))
  const opening = Array<number>(n).fill(0), closing = Array<number>(n).fill(0)
  for (let k = 0; k < n; k++) {
    opening[k] = k ? closing[k - 1] : 0
    closing[k] = opening[k] + inflow[k] + outflow[k]
  }

  // C §2.4: DSCR for S14 = FY(1st annuity) ≤ FY ≤ U14 = FY(repayment end); null where debt service is 0 (V16 #DIV/0!).
  const s14 = fyEnd(g.firstAnnuity), u14 = fyEnd(debt.repaymentEnd)
  const window = g.fys.map((f) => f >= s14 && f <= u14)
  const dscr = g.fys.map((_, k) => (window[k] && d.debtService[k] ? d.cfadsAnnuity[k] / d.debtService[k] : null))
  const ratios = dscr.filter((v): v is number => v !== null)
  const inWindow = (s: number[]) => sum(s.filter((_, k) => window[k]))
  const service = inWindow(d.debtService)
  // V16 quirk B-Q5: D143 averages Σ r136 (unscaled last FY) over Σ r141, while the FY DSCR r142 uses the halved r138.
  const dscrAvg = service ? inWindow(cfads) / service : null
  const dscrAvgConsistent = service ? inWindow(d.cfadsAnnuity) / service : null

  // C §2.5 annual block (r153 = FY columns; generalised to g.fys).
  const taxPos = tax.slice(0, n), projectOutflow = neg(add(equity, debtDraw)), equityOutflow = neg(equity)
  const cfadsPre = add(cfads, taxPos)
  // r164 = r160 + r161 + r162 + r163 (= Δ cash in bank).
  const equityInflow = g.fys.map((_, k) => cfads[k] - d.repayment[k] - d.interest[k] + dsrTransfer[k])
  // V16 quirk B-Q6: the project IRR ignores the DSR transfers (r163), although the DSR funding sits in the drawn equity
  // and debt; the expense-fund transfers do come back through r136.
  const projectFlows = { pre: add(projectOutflow, cfadsPre), post: add(projectOutflow, cfads) }
  const equityPre = add(equityOutflow, taxPos, equityInflow), equityPost = add(equityOutflow, equityInflow)

  const equityFlows = halfYearly(g, c, rev, equityInflow, taxPos)
  const from = (s: number[]) => { // r193: XIRR from the first column whose equity outflow rounds to non-zero
    const j = equityFlows.outflow.findIndex((v) => Math.round(v * 10 ** DIGITS) !== 0)
    return j < 0 ? null : xirr(s.slice(j).map((amount, k) => ({ day: equityFlows.dates[j + k], amount })))
  }
  return { lines: { ...sources, ...uses }, opening, inflow, outflow, closing, cfads, dscrRows: d, dscr, dscrAvg,
    dscrMin: ratios.length ? Math.min(...ratios) : null, dscrMax: ratios.length ? Math.max(...ratios) : null,
    dscrAvgConsistent,
    annual: { projectOutflow, equityOutflow, cfadsPre, tax: taxPos, repayment: d.repayment, interest: d.interest,
      dsrMovement: dsrTransfer, equityInflow, equityPre, equityPost },
    projectFlows,
    equityFlows,
    irr: { projectPre: irr(projectFlows.pre), projectPost: irr(projectFlows.post), equityAnnualPre: irr(equityPre),
      equityAnnualPost: irr(equityPost), equityHalfYearly: from(equityFlows.post), equityHalfYearlyPre: from(equityFlows.pre),
      equityMobAdj: from(equityFlows.mobPost), equityMobAdjPre: from(equityFlows.mobPre) } }
}

/** EOMONTH(d, 6) for a month end d. */
const sixMonthsOn = (d: Day) => eomonth(addMonths(d + 1, 5))

/**
 * Fin-IGAAP r174–r208. Dates r175: the bid date, its month end (≤ I18), month ends to K18 = EOMONTH(1st annuity),
 * then every 6 months, capped at N18 = EOMONTH(concession end). Equity outflows sit on the COP-MOF month ends (r9,
 * SUMIF r177); each FY's r164 / r159 is split equally over the annuity month ends in that FY (r185–r189).
 */
function halfYearly(g: Grid, c: ConstructionResult, rev: RevenueResult, equityInflow: number[], tax: number[]):
  CashResult['equityFlows'] {
  const k18 = eomonth(g.firstAnnuity), n18 = eomonth(g.concessionEnd)
  const dates: Day[] = [g.bid, eomonth(g.bid)]
  // Bounded: dates strictly increase (each step ≥ 1 month) and stop at N18; the cap guards a non-finite N18.
  for (let n = 0, prev = dates[1]; prev < n18 && n < 12 * 400; n++) {
    const next = eomonth(prev + 1) // G175: EOMONTH(prev, 1) while ≤ K18
    prev = next <= k18 ? next : prev === k18 ? sixMonthsOn(prev) : Math.min(sixMonthsOn(prev), n18)
    dates.push(prev)
  }
  const at = new Map(dates.map((x, k) => [x, k])), z = () => dates.map(() => 0)
  const outflow = z(), mobBalance = z()
  c.months.forEach((m, k) => { // r184 / r199: SUMIF on COP-MOF r9 = EOMONTH(period end); the COD month has 2 periods
    const j = at.get(eomonth(g.periods[k].end))
    if (j === undefined) return
    outflow[j] -= m.equityShareCapital + m.equityUsl
    mobBalance[j] += m.stlBalance // r169 MA to EPC closing = the STL balance (back-to-back)
  })
  // r185–r188: annuity month ends on the grid, their FY and the count per FY.
  const annuityEnds = new Set(rev.dates.map(eomonth))
  const fyOf = dates.map((x) => (annuityEnds.has(x) ? fyEnd(x) : NaN))
  const count = new Map<Day, number>()
  for (const f of fyOf) if (!Number.isNaN(f)) count.set(f, (count.get(f) ?? 0) + 1)
  const fyAt = new Map(g.fys.map((f, k) => [f, k]))
  // V16 quirk B-Q1: an FY with no annuity month end (FY(COD), 0.0587 at the sample) has nowhere to land: dropped.
  const split = (s: number[]) => fyOf.map((f) => (Number.isNaN(f) ? 0 : (s[fyAt.get(f) ?? -1] ?? 0) / count.get(f)!))
  const inflow = split(equityInflow), taxH = split(tax)
  const post = add(inflow, outflow), pre = add(post, taxH)
  // r200 cumulative equity; r201: E = MIN(E199 + E200, 0), F = MIN(F199 + F200, 0) × (−F199 ≥ F200), then Δ199 + Δ200.
  let cum = 0
  const invested = outflow.map((v) => (cum += v))
  const mobAdjusted = dates.map((_, k) => k === 0 ? Math.min(mobBalance[0] + invested[0], 0)
    : k === 1 ? Math.min(mobBalance[1] + invested[1], 0) * (-mobBalance[1] < invested[1] ? 0 : 1)
    : mobBalance[k] - mobBalance[k - 1] + invested[k] - invested[k - 1])
  const mobPost = add(inflow, mobAdjusted), mobPre = add(mobPost, taxH)
  return { dates, outflow, inflow, post, tax: taxH, pre, mobBalance, mobAdjusted, mobPost, mobPre }
}
