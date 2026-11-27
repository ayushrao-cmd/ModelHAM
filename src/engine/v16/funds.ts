import { addMonths, fyEnd } from '../dates'
import type { Inputs } from '../types'
import type { ConstructionResult } from './construction'
import type { DebtResult } from './debt'
import { halfYearEnd } from './debt'
import { YEAR, daysInFy } from './grid'
import type { OpexResult } from './opex'
import type { RevenueResult } from './revenue'
import type { Day, Grid } from './types'

/** One fund ledger per FY of `g.fys`: opening + funded (from the project cost) + set aside (created +/released −)
 *  − used = closing; `used` positive (the sheet's utilisation rows are negative). */
export interface Ledger {
  opening: number[]; funded: number[]; setAside: number[]; used: number[]; closing: number[]
  /** Interest at the FD rate. V16 accrues it on the consolidated FFE (r296), not on the three FFE sub-ledgers (0). */
  interest: number[]
}
export interface FundsResult {
  /** Fin-IGAAP r282–288 (BS r58). */
  mmr: Ledger
  /** r283: the FY end in a year with MM spend (0 otherwise). */
  mmrExpenditureYear: Day[]
  /** r290–296 consolidated (BS r59) = r298–303 interest + r305–310 O&M + r312–317 tax. */
  ffe: Ledger; ffeInterest: Ledger; ffeOm: Ledger; ffeTax: Ledger
  /** H280: months of next-FY expense held. */
  ffeMonths: number
  /** r320, r321 requirements; r322 annuities in the FY; r328 cash available for DSCR − debt service. */
  dsrPrincipalRequired: number[]; dsrInterestRequired: number[]; annuitiesInFy: number[]; fundsAvailable: number[]
  /** r330–334 and r346–350 (BS r57 = closing of both). */
  dsrInterest: Ledger; dsrPrincipal: Ledger
  /** r335 (= r344) and r351 funds available C/F; r336, r352 shortfall. */
  dsrInterestCarried: number[]; dsrInterestShortfall: number[]; dsrPrincipalCarried: number[]; dsrPrincipalShortfall: number[]
  /** Fin-IGAAP r12 = r296 + r288 + r334 + r350. */
  interestOnFunds: number[]
}

/** 'Fin Set'!D49 months a year; F42 rounding digits. */
const MONTHS = 12, DIGITS = 4

/** Excel YEARFRAC basis 0 (US 30/360). */
function yearFrac360(a: Day, b: Day): number {
  const da = new Date(a * 86_400_000), db = new Date(b * 86_400_000)
  const lastFeb = (t: Date) => t.getUTCMonth() === 1 && new Date(Date.UTC(t.getUTCFullYear(), 2, 1) - 86_400_000).getUTCDate() === t.getUTCDate()
  let d1 = da.getUTCDate(), d2 = db.getUTCDate()
  if (lastFeb(da) && lastFeb(db)) d2 = 30
  if (lastFeb(da)) d1 = 30
  if (d2 === 31 && d1 >= 30) d2 = 30
  if (d1 === 31) d1 = 30
  return ((db.getUTCFullYear() - da.getUTCFullYear()) * 360 + (db.getUTCMonth() - da.getUTCMonth()) * 30 + d2 - d1) / 360
}

/**
 * Funds and reserves (recon B §4, B-G11…G14): MMR, Funds for Expenses (three ledgers), DSR (interest and principal
 * ledgers), and interest on them at the FD rate (B §4.4).
 * Circular inputs, taken as parameters until Task 13 closes the loops (tests source them from golden):
 * - `taxByFy`: income tax per FY, positive (−Fin-IGAAP r35), for the FFE tax ledger;
 * - `cashForDscr`: Fin-IGAAP r136, total cash available for DSCR (PAT + depreciation + interest + FFE/MMR/GST
 *   flows), which caps the DSR top-ups; debt service r141 is taken from `debt`.
 */
export function runFunds(i: Inputs, g: Grid, c: ConstructionResult, rev: RevenueResult, opex: OpexResult,
  debt: DebtResult, taxByFy: number[], cashForDscr: number[]): FundsResult {
  const fd = i.funds.fdRate, n = g.fys.length, perFy = () => g.fys.map(() => 0)
  const at = new Map(g.fys.map((f, k) => [f, k]))
  const last = n - 1 // Fin-IGAAP E3 = DB!N16: the next column is blank
  const k16 = fyEnd(g.firstAnnuity), u14 = fyEnd(debt.repaymentEnd)
  const avg = (a: number, b: number) => (a + b) / 2

  // ---- MMR (r282–288, DB r91–95) ----
  // r285 = SUMIF(DB r91, FY, DB r95); DB r91 starts at DB!J16 = FY(COD). r286 = −DB r93 = −MM ex GST in its FY.
  // V16 quirk B-Q8: DB!F94:R94 are typed-in 20%s against fixed FY columns and r95 picks fixed FY pairs ($I$93+$J$93,
  // $O$93+$P$93). Generalised: each MM cycle (a run of FYs with MM spend) sets aside mmrShare × the MM of its first two
  // FYs in each of the `mmrYears` FYs ending with its 2nd FY (FY32–FY36 and FY38–FY42 at the sample, and FY33–FY37 /
  // FY39–FY43 at build1460, which is what V16's columns give there too since they count from FY(COD)).
  // ponytail: a 3rd consecutive MM FY is not reserved for; unreachable with one MM concession year per cycle.
  // note: kept as V16 computes them, candidates for Health warnings (Task 17): a cycle in concession years 1–3 clips
  // the window at FY(COD), so fewer than `mmrYears` set-asides; mmrShare × mmrYears ≠ 1 leaves a residual (or a
  // negative balance) after the MM spend.
  const mm = opex.majorMaintenance, kCod = at.get(fyEnd(g.cod)) ?? n
  const mmrSet = perFy()
  for (let k = kCod; k < n; k++) {
    if (!(mm[k] > 0) || (k > kCod && mm[k - 1] > 0)) continue // not the start of a cycle
    const end = k + 1 < n && mm[k + 1] > 0 ? k + 1 : k
    const amount = i.funds.mmrShare * (mm[k] + (end > k ? mm[end] : 0))
    for (let j = Math.max(kCod, end - i.funds.mmrYears + 1); j <= end; j++) mmrSet[j] += amount
  }
  const mmrUsed = g.fys.map((_, k) => (k >= kCod && mm[k] > 0 ? mm[k] : 0))
  const mmr = roll(perFy(), mmrSet, mmrUsed, g.opFactorCod.map((f) => fd * f))
  const mmrExpenditureYear = g.fys.map((f, k) => (mmrUsed[k] > 0 ? f : 0))

  // ---- Funds for Expenses (r277–317) ----
  // H280 = DB!H72/365 × 12 − MIN(G279, G280); G27x = ROUND(YEARFRAC(annuity, its FY end) × 12, 4); G280 only when
  // FY(K16) has 2 annuities (E277). DB!H72 = K13 + K14 = the first-payment lag (as opex's COP O&M funding).
  // `funds.ffeDays` is left unused (Task 17 hides it): V16 has no separate input. No annuity → nothing subtracted
  // (H280's MIN = 0 branch).
  const dates = rev.dates
  const firstFy = dates.filter((d) => fyEnd(d) === k16).length
  const held = dates.slice(0, firstFy >= 2 ? 2 : 1)
    .map((d) => Math.round(yearFrac360(d, fyEnd(d)) * MONTHS * 10 ** DIGITS) / 10 ** DIGITS)
  const ffeMonths = i.income.firstPaymentLagDays / YEAR * MONTHS - (held.length ? Math.min(...held) : 0)
  // Closing r303/r310/r317 = the cost /12 × H280, 0 before FY(K16) and in the last FY.
  const hold = (k: number, cost: number) => (g.fys[k] < k16 || k === last ? 0 : cost / MONTHS * ffeMonths)
  const byPeriodFy = (pick: (k: number) => number) => {
    const out = perFy()
    g.periods.forEach((p, k) => { const j = at.get(p.fy); if (j !== undefined) out[j] += pick(k) })
    return out
  }
  const omExMm = opex.total.map((v, k) => v - mm[k]) // r309 = Σ(r15:r20, r22): all heads but MM
  const plug = (funded: number[], used: number[], closing: number[]): Ledger => {
    const l = blank(n)
    for (let k = 0, open = 0; k < n; k++) { // r301 = −(used + COP − closing + opening), sheet signs
      l.opening[k] = open; l.funded[k] = funded[k]; l.used[k] = used[k]; l.closing[k] = closing[k]
      l.setAside[k] = closing[k] + used[k] - funded[k] - open
      open = closing[k]
    }
    return l
  }
  // r300 = SUMIF(COP-MOF r11, FY, r33 + r35): COD → 1st annuity interest (r35 interim debt is 0 in V16).
  const ffeInterest = plug(byPeriodFy((k) => c.months[k].postCodInterest), debt.interest,
    g.fys.map((_, k) => hold(k, debt.interest[k + 1] ?? 0)))
  // r307 = SUMIF(COP-MOF r38): O&M COD → 1st annuity incl. GST (V16 quirk B-Q9: the ledger uses ex-GST costs).
  const ffeOm = plug(byPeriodFy((k) => c.months[k].opex), omExMm, g.fys.map((_, k) => hold(k, omExMm[k + 1] ?? 0)))
  // r314 = COP-MOF r39 ('Fin Set'!I30 = "No"): 0.
  // V16 quirk B-Q2: r317 holds the *same* FY's tax, while the interest and O&M ledgers hold the next FY's.
  const ffeTax = plug(perFy(), taxByFy.slice(0, n), g.fys.map((_, k) => hold(k, taxByFy[k] ?? 0)))
  const ffe = blank(n)
  for (const l of [ffeInterest, ffeOm, ffeTax])
    for (const key of ['opening', 'funded', 'setAside', 'used', 'closing'] as const) l[key].forEach((v, k) => (ffe[key][k] += v))
  ffe.interest = ffe.opening.map((o, k) => avg(o, ffe.closing[k]) * fd * g.opFactorCod[k]) // r296

  // ---- DSR (r319–354, DB!C55:F57) ----
  const annuitiesInFy = g.fys.map((f) => dates.filter((d) => fyEnd(d) === f).length) // r322
  // r320: Σ DB r67 of annuities m+1 .. m+C57, m = SUMIF(DB r62 half-year end, FY, annuity no.) (the annuity in the
  // FY's 2nd half), for T14 ≤ FY ≤ U14 (T14 = FY(1st annuity + 1)).
  const t12 = g.firstAnnuity + 1, t14 = fyEnd(t12)
  const dsrPrincipalRequired = g.fys.map((f) => {
    if (f < t14 || f > u14) return 0
    const m = dates.reduce((s, d, j) => s + (halfYearEnd(d) === f ? j + 1 : 0), 0)
    let s = 0
    // Bounded by the schedule: DB r67 is 0 past it.
    for (let j = m + 1; j <= Math.min(m + i.funds.dsrPrincipalInstalments, debt.principal.length); j++) s += debt.principal[j - 1]
    return s
  })
  // r321 = next FY's P&L interest /12 × C56 months, for FY ≥ K16 and next FY ≤ U14.
  const nextFy = (k: number) => addMonths(g.fys[k], 12)
  const dsrInterestRequired = g.fys.map((f, k) =>
    f >= k16 && k < last && nextFy(k) <= u14 ? (debt.interest[k + 1] ?? 0) / MONTHS * i.funds.dsrInterestMonths : 0)
  // r328 = r136 − r141 (debt service = interest + principal) where the FY has an annuity.
  const fundsAvailable = g.fys.map((_, k) =>
    annuitiesInFy[k] > 0 ? (cashForDscr[k] ?? 0) - debt.interest[k] - debt.repayment[k] : 0)

  // Funded from the project cost at DB!I16 = FY(construction end) (COP-MOF r41/r42 in the last construction month).
  // V16 quirk B-Q3: H331's first branch SUMIFS on 'Fin-IGAAP' r213 = K12 + 1 never matches (r213 holds the COD and
  // 1-April FY starts), so it is the FY after FY(K16): its interest / its months (12) × D56, i.e. ½ × FY32's interest
  // at the sample, not the 6 months after the 1st annuity. 0 when that FY is past the debt grid (V16: #DIV/0!).
  const kI16 = at.get(fyEnd(g.constructionEnd)), k16i = at.get(k16)
  const codInterest = perFy(), codPrincipal = perFy()
  if (kI16 !== undefined) {
    if (k16i !== undefined && k16i + 1 < n && g.fys[k16i + 1] <= u14)
      codInterest[kI16] = debt.interest[k16i + 1] / MONTHS * i.funds.dsrInterestMonths
    // r347 = Σ DB r67 of annuities ≤ D57.
    codPrincipal[kI16] = debt.principal.slice(0, i.funds.dsrPrincipalInstalments).reduce((s, v) => s + v, 0)
  }
  // r334/r350 factor. V16 quirk B-Q4: FY(T12) uses DB!T13 (from the day after the 1st annuity) and FY(U12) DB!U13,
  // although the fund exists from COD; other FYs the COD op factor (FY30 0.0356).
  const t13 = (t14 - t12 + 1) / daysInFy(t14), u13 = 1 - (u14 - debt.repaymentEnd + 1) / daysInFy(u14)
  const dsrRate = g.fys.map((f, k) => fd * (f === t14 ? t13 : f === u14 ? u13 : g.opFactorCod[k]))
  const active = (k: number) => g.fys[k] >= k16 // × IF(FY ≥ DB!S14), S14 = FY(S12) = FY(1st annuity)

  // r332 = MIN(MAX(r328, 0), r321 − opening − COP): top-ups capped by the cash available, releases unlimited.
  // r335 = r328 + opening + COP − r321 (= r344, carried to the principal ledger); r348 likewise on r344 and r320.
  const dsrInterest = blank(n), dsrPrincipal = blank(n)
  const dsrInterestCarried = perFy(), dsrPrincipalCarried = perFy()
  for (let k = 0, oi = 0, op = 0; k < n; k++) {
    const li = dsrInterest, lp = dsrPrincipal
    li.opening[k] = oi; li.funded[k] = codInterest[k]
    li.setAside[k] = active(k) ? Math.min(Math.max(fundsAvailable[k], 0), dsrInterestRequired[k] - oi - codInterest[k]) : 0
    li.closing[k] = oi = oi + codInterest[k] + li.setAside[k]
    li.interest[k] = avg(li.opening[k], li.closing[k]) * dsrRate[k]
    const carried = dsrInterestCarried[k] = fundsAvailable[k] + li.opening[k] + codInterest[k] - dsrInterestRequired[k]
    lp.opening[k] = op; lp.funded[k] = codPrincipal[k]
    lp.setAside[k] = active(k) ? Math.min(Math.max(carried, 0), dsrPrincipalRequired[k] - op - codPrincipal[k]) : 0
    lp.closing[k] = op = op + codPrincipal[k] + lp.setAside[k]
    lp.interest[k] = avg(lp.opening[k], lp.closing[k]) * dsrRate[k]
    dsrPrincipalCarried[k] = carried + lp.opening[k] + codPrincipal[k] - dsrPrincipalRequired[k]
  }
  // ponytail: compliance rows r325–327, r329, r337–338, r341–343, r345, r353–354 (DB!A68/A69 checks) are not modelled;
  // they feed no number. Add them with the Health checks if wanted.

  const interestOnFunds = g.fys.map((_, k) =>
    ffe.interest[k] + mmr.interest[k] + dsrInterest.interest[k] + dsrPrincipal.interest[k])
  return { mmr, mmrExpenditureYear, ffe, ffeInterest, ffeOm, ffeTax, ffeMonths, dsrPrincipalRequired,
    dsrInterestRequired, annuitiesInFy, fundsAvailable, dsrInterest, dsrPrincipal, dsrInterestCarried,
    dsrInterestShortfall: dsrInterestCarried.map((v) => Math.min(v, 0)), dsrPrincipalCarried,
    dsrPrincipalShortfall: dsrPrincipalCarried.map((v) => Math.min(v, 0)), interestOnFunds }
}

function blank(n: number): Ledger {
  const z = () => Array<number>(n).fill(0)
  return { opening: z(), funded: z(), setAside: z(), used: z(), closing: z(), interest: z() }
}

/** opening + set aside − used = closing, interest = AVERAGE(open, close) × rate[k]. */
function roll(funded: number[], setAside: number[], used: number[], rate: number[]): Ledger {
  const l = blank(funded.length)
  for (let k = 0, open = 0; k < funded.length; k++) {
    l.opening[k] = open; l.funded[k] = funded[k]; l.setAside[k] = setAside[k]; l.used[k] = used[k]
    l.closing[k] = open = open + funded[k] + setAside[k] - used[k]
    l.interest[k] = (l.opening[k] + l.closing[k]) / 2 * rate[k]
  }
  return l
}
