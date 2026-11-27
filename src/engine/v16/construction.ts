import { addMonths, eomonth } from '../dates'
import type { Inputs } from '../types'
import { YEAR, daysInFy } from './grid'
import { pim } from './indices'
import type { Day, Grid } from './types'

/**
 * V16 construction period (recon A §2–§5). Every series is per `g.periods` (37 construction + 7 post-COD at the
 * sample), 0 where V16 has nothing. `constructionUses` takes D, E and the PSBG release date as parameters;
 * `runConstruction` adds the draws, IDC, COD→1st-annuity interest and O&M, the DSR lines, and solves D/E/PSBG in one
 * outer fixed point.
 */

/** Lines of COP-MOF r15..r45 modelled here. V16 rows 17 (EPC 22(2), 'Fin Set'!K30 = "No"), 29/30/36/44/45
 *  (authority MA, APSBG), 34/35 (interim debt, DB!E53 = 0), 39 ('Fin Set'!I30 = "No") and 43 (PSBG margin,
 *  'Fin Set'!B8 = "EPC Contractor") are switched off in V16 and not modelled. */
export type UseKey = 'epcFixed' | 'epcVariable' | 'imvCapital' | 'preBid' | 'spvFormation' | 'ieFee' | 'spvManpower'
  | 'admin' | 'fundRaising' | 'financeLegal' | 'imvRental' | 'contingency' | 'psbgCommission' | 'stlInterest'
  | 'maInterestFromEpc' | 'netGstPayable'
/** `gross` = COP-MOF use row (incl. GST); `gst` = its input credit (COP-MOF r246..r276). */
export interface UseLine { gross: number[]; gst: number[] }
export interface UseLines {
  lines: Record<UseKey, UseLine>
  /** Σ gross of `lines` per period (COP-MOF r46 less the Task 6 lines). */
  total: number[]
  /** GST credit ledger r286..r290: ITC on costs, credit used against the grant GST (r282), closing credit. */
  itc: { available: number[]; used: number[]; closing: number[] }
  grant: GrantSchedule
  stl: StlSchedule
}
export interface GrantSchedule {
  /** Per tranche: construction period index of the crossing (0-based; −1 if never reached), interpolated
   *  crossing day (fractional, DB!D76:M76), amount with PIM (DB r84), its GST, PIM part (DB r86). */
  month: number[]; crossing: Day[]; amount: number[]; gst: number[]; pim: number[]
  /** Per period: grant received (COP-MOF r101 = r210) and GST on it (r102 = r281). */
  received: number[]; receivedGst: number[]
}
/** Per period, COP-MOF r155 (draw), −r156 (repay, positive), r157 (closing balance), r161 (interest). */
export interface StlSchedule { draw: number[]; repay: number[]; balance: number[]; interest: number[] }

/** V16 quirk A-Q10: grant thresholds are compared on a float cumulative sum; ε keeps a cum of 0.7999…96 crossing. */
const EPS = 1e-9
// V16: 'Fin Set'!B20 / E20 LIE fee, one-off 0.05 + 0.02 per bi-monthly report.
const LIE_FIXED = 0.05, LIE_PER_REPORT = 0.02
// V16: 'Fin Set'!H20 / I20 security trustee, 0.02 one-off + 0.02 a year.
const TRUSTEE_FIXED = 0.02, TRUSTEE_ANNUAL = 0.02
// V16: 'Fin Set'!E33 = 2 STL instalments, L33 = 30 and M33 = 60 days.
const STL_INSTALMENTS = 2, STL_DAYS_1 = 30, STL_DAYS_2 = 60

const zeros = (g: Grid) => g.periods.map(() => 0)
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const isMarch31 = (d: Day) => { const t = new Date(d * 86_400_000); return t.getUTCMonth() === 2 && t.getUTCDate() === 31 }

/** Construction period count of 31-March month-ends ('EPC Phasing'!D114). */
const fyEndCount = (g: Grid) => g.periods.filter((p) => p.kind === 'construction' && isMarch31(p.end)).length

/** Costs V16 derives from build days (controller ruling; '1. IO'!J11 and 'Fin Set'!B26:L26). */
export function derivedCosts(i: Inputs, g: Grid): { financeLegal: number; patrolRental: number } {
  const years = i.deal.buildDays / YEAR
  const lie = LIE_FIXED + LIE_PER_REPORT * Math.round(years * 12 / 2) // MROUND(…, 1), bi-monthly reports
  const trustee = TRUSTEE_FIXED + TRUSTEE_ANNUAL * years
  // V16 quirk A-Q8: annual fees × the count of 31-March month-ends in construction, not × years.
  return { financeLegal: i.build.flcOneOff + lie + trustee + i.build.flcAnnual * fyEndCount(g),
    patrolRental: i.build.patrolRentalPerMonth * 12 * years }
}

/** Physical progress = EPC fixed phasing per period ('EPC Phasing' r40 by 'Fin Set'!B30). */
export function epcPhasing(i: Inputs, g: Grid): number[] {
  const b = i.build, days = i.deal.buildDays
  // 'EPC Phasing' r37 Schedule-G: linear in days inside each milestone segment. ponytail: V16 has no S-curve; the
  // old engine's 'sCurve' option maps to V16's only other curve.
  const schedG = (t: number) => {
    let d0 = 0, p0 = 0
    for (const m of i.milestones) {
      if (t <= m.day) return p0 + (m.physical - p0) * (t - d0) / (m.day - d0)
      d0 = m.day; p0 = m.physical
    }
    return p0
  }
  let elapsed = 0
  return g.periods.map((p, k) => {
    if (p.kind !== 'construction') return 0
    const t0 = elapsed; elapsed += p.days
    // V16 quirk A-Q1: manual phasing is by month index (36 entries), so month 37 gets 0 and the 12-day month 1 a full share.
    if (b.phasing === 'manual') return b.manualPhasing[k] ?? 0
    if (b.phasing === 'equated') return p.days / days
    return schedG(elapsed) - schedG(t0)
  })
}

/** Construction Support: 10 tranches crossed on cumulative physical progress, PIM-indexed (A §4). */
export function grantSchedule(i: Inputs, g: Grid): GrantSchedule {
  const phys = epcPhasing(i, g), t = i.support.tranches
  const base = i.deal.bidPrice * i.support.pctOfBid / t.length // DB r85
  const month = t.map(() => -1), crossing = t.map(() => NaN)
  let cum = 0
  g.periods.forEach((p, k) => {
    if (p.kind !== 'construction') return
    cum += phys[k]
    t.forEach((tr, j) => {
      if (month[j] >= 0 || cum < tr.progress - EPS) return
      month[j] = k
      // COP-MOF r199: previous column end + linear interpolation inside the month (fractional day). V16 sums
      // H:AQ (36 columns) into DB!D76; generalised to every construction month.
      crossing[j] = p.start - 1 + (phys[k] - (cum - tr.progress)) / phys[k] * p.days
    })
  })
  const idx = pim(i, g)
  // DB r84 = BPC × 40%/10 × (1 + PIM × ROUND(days from EOMONTH(bid, −1))/365) (V16 quirk A-Q6, in grantAt).
  // ponytail: a tranche never reached gets 0 (V16 would index a 0 date); unreachable with phasing summing to 1.
  const amount = crossing.map((c) => (Number.isNaN(c) ? 0 : base * idx.grantAt(c)))
  const pimPart = amount.map((a) => (a ? a - base : 0))
  const gst = amount.map((a) => a * i.build.gstWorks)
  // r210: tranches whose EOMONTH(crossing) = EOMONTH(period end), while the period starts by DB!M76 (the 10th
  // tranche date; generalised to the last crossing). r281 (GST) matches the month end without that guard.
  const last = Math.max(...crossing.filter((c) => !Number.isNaN(c)))
  const inMonth = (end: Day, of: number[]) => sum(of.filter((_, j) => eomonth(crossing[j]) === eomonth(end)))
  return { month, crossing, amount, gst, pim: pimPart,
    received: g.periods.map((p) => (p.start <= last ? inMonth(p.end, amount) : 0)),
    receivedGst: g.periods.map((p) => inMonth(p.end, gst)) }
}

/** STL from the bank, passed back-to-back to the EPC contractor as mobilisation advance (A §3, 'Fin Set'!B33 = "STL"). */
export function stlSchedule(i: Inputs, g: Grid, grant: GrantSchedule): StlSchedule {
  const total = i.stl.pctOfBid * i.deal.bidPrice // DB!C73 + D73 (× 1 + 'Fin Set'!F11 = 0)
  const first = total / STL_INSTALMENTS
  // V16 quirk A-Q4: instalment 2 is AD + L33 + M33 (90 days), M33 being added on top of L33.
  const d1 = eomonth(g.appointed + STL_DAYS_1), d2 = eomonth(g.appointed + STL_DAYS_1 + STL_DAYS_2)
  const out: StlSchedule = { draw: zeros(g), repay: zeros(g), balance: zeros(g), interest: zeros(g) }
  let open = 0
  g.periods.forEach((p, k) => {
    // r155: IF(end = EOMONTH(date 1), C73, IF(end = EOMONTH(date 2), D73)); DB!D73 = total − C73.
    const draw = p.end === d1 ? first : p.end === d2 ? total - first : 0
    // r156: 'Fin Set'!C39:L39 (12.5% at milestones 1..8) × total, in the period ending EOMONTH(crossing).
    const repay = sum(grant.crossing.map((c, j) =>
      j < i.stl.repayMilestones && eomonth(c) === p.end ? i.stl.repayShare * total : 0))
    const close = open + draw - repay
    // r161: average balance × CP rate (DB!C52) / 365 × construction days (r12; 0 after COD).
    const interest = (open + close) / 2 * i.capital.buildRate / YEAR * (p.kind === 'construction' ? p.days : 0)
    out.draw[k] = draw; out.repay[k] = repay; out.balance[k] = close; out.interest[k] = interest
    open = close
  })
  return out
}

/**
 * COP-MOF r15..r45 (gross, GST) by period at the given senior debt `D` (COP-MOF D75), total equity `E` (D70) and
 * PSBG release date `psbgRelease` ('CA Set'!J14, fractional day). `grant` and `stl` do not depend on them, so the
 * outer loop passes them in once.
 */
export function constructionUses(i: Inputs, g: Grid, D: number, E: number, psbgRelease: Day,
  grant = grantSchedule(i, g), stl = stlSchedule(i, g, grant)): UseLines {
  const b = i.build, bid = i.deal.bidPrice, gw = b.gstWorks, gs = b.gstServices // GSTWorks; GSTFLC = GSTOthers
  const cons = g.periods.map((p) => p.kind === 'construction')
  const lastK = cons.lastIndexOf(true)
  const fyEnds = fyEndCount(g)

  // 'EPC Phasing' r80..r85 expense phasing tags (construction columns only).
  const tag = (f: (k: number) => number) => g.periods.map((_, k) => (cons[k] ? f(k) : 0))
  const firstMonth = tag((k) => +(g.periods[k].end === eomonth(g.appointed))) // r80 First Month = r83 FC Date
  const lastMonth = tag((k) => +(k === lastK)) // r81
  const secondLast = tag((k) => +(k === lastK - 1)) // r85
  const equated = tag((k) => g.periods[k].days / i.deal.buildDays) // r82: days / (DB!I13 + I14)
  const fyEnd = tag((k) => (isMarch31(g.periods[k].end) ? 1 / fyEnds : 0)) // r84
  const line = (share: number[], net: number, rate: number): UseLine =>
    ({ gross: share.map((s) => s * net * (1 + rate)), gst: share.map((s) => s * net * rate) })
  const neg = (l: UseLine): UseLine => ({ gross: l.gross.map((v) => -v), gst: l.gst.map((v) => -v) })

  // r16: DB r86 (PIM on grant) × (1 + GSTWorks) in the period whose end = EOMONTH(crossing) ('Fin Set'!C30 = "Yes").
  const pimAt = g.periods.map((p) => sum(grant.pim.filter((_, j) => eomonth(grant.crossing[j]) === p.end)))
  const epcVariable = line(pimAt, 1, gw)
  const { financeLegal, patrolRental } = derivedCosts(i, g)

  // r28: 'Fin Set'!M26 = 1.5% × PSBG ('CA Set'!F14 = 5% BPC + APSBG 0) × (J14 − AD + 1)/365 ('Fin Set'!C8 = "SPV"),
  // phased by (MIN(end, J14) − start + 1) over the periods starting by J14.
  // V16 quirk A-Q3: the phasing denominator is J14 − AD (no +1), so the phased total is (J14−AD+1)/(J14−AD) × M26.
  const j14 = psbgRelease
  const m26 = b.perfSecurityCommissionPa * b.perfSecurityPctOfBid * bid * (j14 - g.appointed + 1) / YEAR
  const psbgShare = g.periods.map((p) => (p.start <= j14 ? (Math.min(p.end, j14) - p.start + 1) / (j14 - g.appointed) : 0))

  // r32 = −r162 (STL interest paid monthly); r37 = r174 = r162, interest on the MA recovered from the EPC
  // contractor back-to-back ('Fin Set'!F33 "Back to Back", H33 "EPC Contractor"), so r32 + r37 = 0.
  const stlInterest = line(stl.interest, 1, 0)

  const lines: Omit<Record<UseKey, UseLine>, 'netGstPayable'> = {
    epcFixed: line(epcPhasing(i, g), b.epcFixed, gw), // r15 = r179: phase × DB!C32
    epcVariable,
    imvCapital: line(secondLast, b.patrolCapital, 0), // r18 '1. IO'!F11
    preBid: line(firstMonth, b.preBid * (1 + b.preBidMiscPct), gs), // r19 'Fin Set'!J17 = G17 × (1 + H17)
    spvFormation: line(firstMonth, b.spvFormationPctOfShareCapital * E * i.capital.shareCapitalPct, 0), // r20 × E90
    ieFee: line(equated, b.ieFeePctOfBid * bid, gs), // r21
    spvManpower: line(equated, b.spvManpower, 0), // r22
    admin: line(equated, b.adminPctOfEpc * (b.epcFixed + sum(grant.pim)), 0), // r23: DB!E30 = EPC fixed + variable net
    fundRaising: line(firstMonth, b.fundRaisingPctOfDebt * D, gs), // r24 × COP-MOF D75
    financeLegal: line(fyEnd, financeLegal, gs), // r25 DB!N30
    imvRental: line(equated, patrolRental, gs), // r26 '1. IO'!J11
    contingency: line(lastMonth, b.contingency, 0), // r27
    psbgCommission: line(psbgShare, m26, gs),
    stlInterest,
    maInterestFromEpc: neg(stlInterest),
  }

  // GST credit ledger (r286..r290) against the output GST on the grant (r279..r284): credit used (r282) =
  // MIN(opening + ITC, output) in construction, closing = opening + ITC − output; r40 = −r283 = output − used.
  const available = g.periods.map((_, k) => sum(Object.values(lines).map((l) => l.gst[k])))
  const used = zeros(g), closing = zeros(g), payable = zeros(g)
  let open = 0
  g.periods.forEach((_, k) => {
    const out = grant.receivedGst[k]
    used[k] = cons[k] ? Math.min(open + available[k], out) : 0
    payable[k] = out - used[k]
    closing[k] = open = open + available[k] - out
  })
  const all = { ...lines, netGstPayable: line(payable, 1, 0) }
  const total = g.periods.map((_, k) => sum(Object.values(all).map((l) => l.gross[k])))
  return { lines: all, total, itc: { available, used, closing }, grant, stl }
}

// V16: 'CA Set'!C14 = 30% of BPC (PSBG release criterion 1), D14 = 1 year after AD (criterion 2).
const PSBG_TPC_SHARE = 0.3, PSBG_YEARS = 1
// V16 quirk A-Q5: "Equity for STL" is the hard-coded DB!G48 10% of upfront equity, not '1. IO'!E16 (25%).
const STL_EQUITY_SHARE = 0.1
// Outer fixed point (G66, J14) and inner per-month interest solve; V16 relies on Excel iteration (100 × 0.001).
const OUTER_MAX = 50, OUTER_TOL = 1e-9, INNER_MAX = 100, INNER_TOL = 1e-12

/** From the operations modules: Fin-IGAAP D331 interest DSR and COP-MOF r314 O&M COD → 1st annuity by period. The
 *  interest DSR depends on the debt this funds (½ × FY32's interest at the sample), so it may be given as a function of
 *  the construction result: it is then solved in the same outer fixed point (`model.ts`). */
export interface ConstructionOps { interestDsr: number | ((c: ConstructionResult) => number); postCodOpex: number[] }

/** One COP-MOF column. Uses are gross of GST; draws and balances per A §5. */
export interface ConstructionMonth {
  epcFixed: number; epcVariable: number; psbgCommission: number; fundRaising: number; spvFormation: number
  stlDraw: number; stlRepay: number; stlInterest: number; stlBalance: number
  /** r31 IDC (construction) and r33 interest COD → 1st annuity, both on the average senior-debt balance. */
  idc: number; postCodInterest: number
  /** r38 O&M COD → 1st annuity; r41/r42 DSR, funded in the last construction month. */
  opex: number; dsrPrincipal: number; dsrInterest: number
  /** r46 TPC; r66 cumulative funds required after grant. */
  tpc: number; required: number
  grant: number; grantGst: number; gstInput: number
  /** r72 upfront 1 (STL), r71 upfront (r72 + r73), r74 deferred; r90 share capital, r91 USL (r90 + r91 = r71 + r74). */
  equityStl: number; equityUpfront: number; equityDeferred: number; equityShareCapital: number; equityUsl: number
  /** r75 senior-debt draw, r217 closing balance. */
  debtDraw: number; debtBalance: number
}
export interface ConstructionResult {
  months: ConstructionMonth[]; uses: UseLines
  /** G46, G66, D70, D71, D75, D90, D91, G31, G33. */
  tpc: number; fundsRequired: number; equity: number; upfrontEquity: number; debt: number; shareCapital: number
  usl: number; idc: number; postCodInterest: number
  /** 'CA Set'!J14 (fractional day). */
  psbgRelease: Day
  converged: boolean; iterations: number
}

/**
 * Same-month deferred equity x (H74) and senior debt y (H75), each using the other (A §5 steps 4–5):
 * x = MIN(Erem, MAX((ΣD<t + y + STL_t) × e/(1−e) − ΣE, 0)), y = MIN(headroom, MAX(gap − x, 0)). x = f(h(x)) with f
 * nondecreasing and h nonincreasing, so the fixed point is unique; bisection covers every branch (the interior one is
 * recon's closed form e·(ΣE + ΣD + gap + STL) − ΣE).
 */
function split(gap: number, eCum: number, dCum: number, stl: number, eRem: number, headroom: number, e: number) {
  const f = (y: number) => Math.min(eRem, Math.max((dCum + y + stl) * e / (1 - e) - eCum, 0))
  const h = (x: number) => Math.min(headroom, Math.max(gap - x, 0))
  let x = eRem // H74's MIN(MAX(Erem), …): Erem is not floored at 0
  if (eRem > 0 && f(h(0)) <= 0) x = 0
  else if (eRem > 0 && f(h(eRem)) < eRem) {
    let lo = 0, hi = eRem
    for (let n = 0; n < 200 && hi - lo > 1e-13 * Math.max(1, hi); n++) {
      const m = (lo + hi) / 2
      if (f(h(m)) > m) lo = m; else hi = m
    }
    x = (lo + hi) / 2
  }
  return { x, y: h(x) }
}

/** COP-MOF r46..r91 walk at a given G66 (which sets D70, D71, D75, D90) with the uses built from it. */
function fund(i: Inputs, g: Grid, u: UseLines, ops: { interestDsr: number; postCodOpex: number[] }, g66: number) {
  const c = i.capital, e = c.equityPct
  const E = g66 * e, D = g66 * (1 - e), upfront = E * c.upfrontEquityPct, sc = E * c.shareCapitalPct
  // r41 = Fin-IGAAP D347: repayments of the first `dsrPrincipalInstalments` annuities (DB!D57) × D75.
  const dsrPrincipal = D * sum(c.repayment.slice(0, i.funds.dsrPrincipalInstalments))
  let req = 0, stlEq = 0, up = 0, def = 0, dCum = 0, scCum = 0
  const months = g.periods.map((p, k): ConstructionMonth => {
    const cons = p.kind === 'construction'
    const last = p.end === g.constructionEnd // H8 = DB!I12
    const opex = cons ? 0 : ops.postCodOpex[k] ?? 0
    const dsrInterest = last ? ops.interestDsr : 0, dsrP = last ? dsrPrincipal : 0
    // r53..r58 (MA and STL in/out, back-to-back) net to 0; r61..r64 (equity-funded items) are off in V16.
    const base = u.total[k] + opex + dsrP + dsrInterest - u.grant.received[k] - u.grant.receivedGst[k]
    // r222/r229: AVERAGE(opening, closing) × rate × days; IDC on /365 (r12), COD→annuity on FY days (r13).
    // V16 quirk A-Q7: after COD the rate stays the CP rate (DB!C52; 'Fin Set'!H30 = "No").
    const rateDays = c.buildRate * (cons ? p.days / YEAR : p.days / daysInFy(p.fy))
    const stl = u.stl.balance[k]
    const s72 = p.end === eomonth(g.appointed) ? upfront * STL_EQUITY_SHARE : 0 // H8 = DB!G18
    let interest = 0, r = 0, s73 = 0, x = 0, y = 0
    // Inner solve (A-G12): the closing balance includes this month's draw, which also funds this month's interest.
    for (let n = 0; n < INNER_MAX; n++) {
      r = req + base + interest
      const u72 = stlEq + s72
      s73 = Math.min(Math.max(upfront - u72 - up, 0), Math.max(r - u72 - up, 0)) // "Staggered" (DB!E49)
      const eCum = u72 + up + s73 + def
      // A-G13: H75 headroom D75 − ΣD + Σr55 + Σr56 = D75 − ΣD − STL balance. V16 quirk A-Q9: the STL balance also
      // counts as debt in the deferred-equity test, so deferred equity starts later.
      ;({ x, y } = split(Math.max(r - eCum - dCum, 0), eCum, dCum, stl, E - eCum, Math.max(D - dCum - stl, 0), e))
      const next = (2 * dCum + y) / 2 * rateDays
      const done = Math.abs(next - interest) < INNER_TOL
      interest = next
      if (done) break
    }
    req = r; stlEq += s72; up += s73; def += x
    const eq = s72 + s73 + x
    const shareCap = Math.min(eq, sc - scCum) // H90: share capital first, USL after (A-G18)
    scCum += shareCap; dCum += y
    const l = u.lines
    return {
      epcFixed: l.epcFixed.gross[k], epcVariable: l.epcVariable.gross[k], psbgCommission: l.psbgCommission.gross[k],
      fundRaising: l.fundRaising.gross[k], spvFormation: l.spvFormation.gross[k],
      stlDraw: u.stl.draw[k], stlRepay: u.stl.repay[k], stlInterest: u.stl.interest[k], stlBalance: stl,
      idc: cons ? interest : 0, postCodInterest: cons ? 0 : interest, opex, dsrPrincipal: dsrP, dsrInterest,
      tpc: u.total[k] + interest + opex + dsrP + dsrInterest, required: r,
      grant: u.grant.received[k], grantGst: u.grant.receivedGst[k], gstInput: u.itc.available[k],
      equityStl: s72, equityUpfront: s72 + s73, equityDeferred: x, equityShareCapital: shareCap, equityUsl: eq - shareCap,
      debtDraw: y, debtBalance: dCum,
    }
  })
  return { months, E, D, upfront }
}

/**
 * 'CA Set'!J14 = MIN(H14, EDATE(AD, 12 × D14)). H14 = COP-MOF r295: the first period where cumulative TPC (less the
 * margins r43:r45, 0 in V16) reaches 30% of BPC, interpolated inside the month on construction days (r293–r295).
 */
function psbgReleaseDate(i: Inputs, g: Grid, months: ConstructionMonth[]): Day {
  const bid = i.deal.bidPrice, criterion2 = addMonths(g.appointed, 12 * PSBG_YEARS)
  let cum = 0
  // V16 quirk/hard-code: 'CA Set'!H14 = SUM('COP-MOF'!H295:AF295) reads months 1–25 only, so a crossing after month
  // 25 (or none) gives H14 = 0 and J14 = MIN(0, I14) = day 0, and no PSBG commission. Generalised: every period is
  // searched and with no crossing criterion 2 applies; identical whenever the crossing is within month 25.
  for (let k = 0; k < months.length; k++) {
    const prev = cum / bid
    cum += months[k].tpc
    if (cum < PSBG_TPC_SHARE * bid) continue
    const p = g.periods[k], days = p.kind === 'construction' ? p.days : 0, now = cum / bid
    // r295 = r12 − (r293 − 30%)/(r293 − previous r293) × r12 + previous end. Month 1's "previous end" is V16's blank
    // G8; generalised to the day before AD.
    return Math.min(days - (now - PSBG_TPC_SHARE) / (now - prev) * days + p.start - 1, criterion2)
  }
  return criterion2
}

/**
 * Construction funding (A §5) with one outer fixed point (A-G20) over G66 (→ D75, D70, D90: fund raising r24, SPV
 * formation r20, principal DSR r41, upfront equity), the PSBG release date J14 (→ r28) and, when `ops.interestDsr` is a
 * function, the interest DSR r42; IDC, COD→annuity interest and the H74↔H75 split are solved inside each month. Stops
 * after `maxIterations` with `converged: false`.
 */
export function runConstruction(i: Inputs, g: Grid, ops: ConstructionOps, maxIterations = OUTER_MAX): ConstructionResult {
  const dsrOf = typeof ops.interestDsr === 'function' ? ops.interestDsr : undefined
  let g66 = 0, psbg = addMonths(g.appointed, 12 * PSBG_YEARS), converged = false, iterations = 0
  let dsr = typeof ops.interestDsr === 'number' ? ops.interestDsr : 0
  const grant = grantSchedule(i, g), stl = stlSchedule(i, g, grant)
  let r: ConstructionResult
  do {
    iterations++
    const u = constructionUses(i, g, g66 * (1 - i.capital.equityPct), g66 * i.capital.equityPct, psbg, grant, stl)
    const f = fund(i, g, u, { interestDsr: dsr, postCodOpex: ops.postCodOpex }, g66)
    const m = f.months, tot = (k: keyof ConstructionMonth) => sum(m.map((x) => x[k] as number))
    r = { months: m, uses: u, tpc: tot('tpc'), fundsRequired: m[m.length - 1].required, equity: f.E,
      upfrontEquity: f.upfront, debt: f.D, shareCapital: tot('equityShareCapital'), usl: tot('equityUsl'),
      idc: tot('idc'), postCodInterest: tot('postCodInterest'), psbgRelease: psbg, converged, iterations }
    const nextG66 = r.fundsRequired, nextPsbg = psbgReleaseDate(i, g, m)
    // The interest DSR is ~ proportional to the debt, and `r` was built at this pass's D, one step behind nextG66;
    // scaling by the debt ratio removes that lag (18 → 12 passes at the sample). The ratio is 1 at the fixed point.
    const nextDsr = dsrOf ? dsrOf(r) * (f.D > 0 ? nextG66 * (1 - i.capital.equityPct) / f.D : 1) : dsr
    converged = Math.abs(nextG66 - g66) < OUTER_TOL && Math.abs(nextPsbg - psbg) < OUTER_TOL
      && Math.abs(nextDsr - dsr) < OUTER_TOL
    g66 = nextG66; psbg = nextPsbg; dsr = nextDsr
  } while (!converged && iterations < maxIterations && Number.isFinite(g66))
  return { ...r, converged, iterations }
}
