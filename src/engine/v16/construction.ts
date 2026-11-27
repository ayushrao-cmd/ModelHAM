import { eomonth } from '../dates'
import type { Inputs } from '../types'
import { YEAR } from './grid'
import { pim } from './indices'
import type { Day, Grid } from './types'

/**
 * V16 construction period, uses of funds (recon A §2–§4). Every series is per `g.periods` (37 construction + 7
 * post-COD at the sample), 0 where V16 has nothing. Funding draws, IDC, COD→1st-annuity interest, O&M and tax to the
 * 1st annuity, the DSR lines and the PSBG release date come from Task 6 (they need the draws, the operations P&L and
 * the outer fixed point); the D/E-dependent lines here take the converged D, E and release date as parameters.
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
 * PSBG release date `psbgRelease` ('CA Set'!J14, fractional day).
 */
export function constructionUses(i: Inputs, g: Grid, D: number, E: number, psbgRelease: Day): UseLines {
  const b = i.build, bid = i.deal.bidPrice, gw = b.gstWorks, gs = b.gstServices // GSTWorks; GSTFLC = GSTOthers
  const grant = grantSchedule(i, g), stl = stlSchedule(i, g, grant)
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
