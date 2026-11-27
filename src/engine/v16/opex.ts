import { fyEnd } from '../dates'
import type { Inputs } from '../types'
import { YEAR, daysInFy } from './grid'
import { inflationIndex } from './indices'
import type { Grid } from './types'

export type OpexHead = 'ieFee' | 'spvManpower' | 'spvOverhead' | 'financeLegal' | 'insurance' | 'routineMaintenance'
  | 'majorMaintenance' | 'electricity'

/**
 * Operating costs (recon B §3). Per FY of `g.fys`, ex-GST and positive (Fin-IGAAP r15..r22 are their negatives):
 * concession-year base at bid-date prices → split across FYs (O&M Cost J6/J9) → × the FY-end index of its head.
 */
export interface OpexResult extends Record<OpexHead, number[]> {
  /** Fin-IGAAP r25 (r23 provision for MM and r24 excess GST are 0 / the GST module's). */
  total: number[]
  /** O&M Cost r77..r85 by head: r368 RM, r369 MM, r370 electricity, r367 = Σ the rest. */
  gst: Record<OpexHead, number[]>
  gstTotal: number[]
  /** COP-MOF r303..r313 per FY: (costs + GST) / (COD op factor × 365), the daily rate. */
  daily: number[]
  /** COP-MOF r314 per `g.periods`: O&M COD → 1st annuity incl. GST, `daily` × capped post-COD days (r302). */
  postCodOpex: number[]
}

/**
 * V16 cost heads (DB!C34:H45, O&M Cost rows 23–25 and 30–38). SPV OH = IMV running cost ('1. IO'!R13) + admin
 * charges (DB!E43 = E42 × D43, E42 a hard-coded 0, so 0). GST: DB!C40:H40 / O&M Cost H30:H32, hard-coded 0 on
 * manpower, IMV running and electricity, GSTFLC (= GSTOthers) on the rest. Insurance tag "No Inflation".
 */
/** `epcVariable` = DB!D30, EPC variable net of GST = Σ PIM on the grant (`grantSchedule(i, g).pim`), which needs no
 *  funding loop; it only sets the insurance base. */
export function runOpex(i: Inputs, g: Grid, epcVariable: number): OpexResult {
  const o = i.operations, inf = o.inflation, gs = i.build.gstServices
  const at = new Map(g.fys.map((f, k) => [f, k]))
  const perFy = () => g.fys.map(() => 0)

  // O&M Cost r30..r32: base of the concession year starting in the FY × J6 + base of the year ending in it × J9.
  // V16 quirk B-Q11: J9 = 1 − J6 (a complement, not a day count), so leap FYs get 0.999903 / 1.000097.
  const split = (base: (year: number) => number) => {
    const out = perFy()
    g.concessionYears.forEach((y, n) => {
      const a = at.get(fyEnd(y.start)), b = at.get(fyEnd(y.end))
      if (a !== undefined) out[a] += base(n + 1) * y.share
      if (b !== undefined) out[b] += base(n + 1) * (1 - y.share)
    })
    return out
  }

  // O&M Cost r33: FLC × J12 before the repayment-end FY (DB!U14), × DB!U13 in it, 0 after. U12 = annuity number
  // '1. IO'!K3 (25) = the repayment schedule length; U13 = 1 − (U14 − U12 + 1)/days in U14.
  const repayEnd = g.annuities[i.capital.repayment.length - 1], u14 = fyEnd(repayEnd)
  const u13 = 1 - (u14 - repayEnd + 1) / daysInFy(u14)
  const flcFactor = g.fys.map((f, k) => (f < u14 ? g.opFactorCod[k] : f === u14 ? u13 : 0))

  // DB!G43 = 'Fin Set'!L14 (J14 × (1 − K14) = 0.0014 × 2.15) × DB!E30 (EPC fixed + EPC variable net = Σ PIM on grant).
  const insurance = o.insuranceBaseRate * o.insuranceLoading * (i.build.epcFixed + epcVariable)
  const constant = (v: number) => g.opFactorCod.map((f) => v * f) // rows 34–38: DB row 43 × J12

  // ponytail: V16's '1. IO' row 11 holds RM per concession year and S13/T13 one MM amount per cycle; the site has one
  // routine and one MM amount. O&M Cost O24/U24 hard-code MM in years 6 and 12; generalised to resurfacingYears.
  // DB!H9/I9/L9 RM/MM/expense-inflation sensitivities are 0 in V16 and not modelled.
  // V16 quirk B-Q10: the whole FY's cost is priced at that FY's year-end index (O&M Cost J54 VLOOKUP on FY end).
  const priced = (base: number[], rate: number) => {
    const idx = inflationIndex(i, g, rate)
    return base.map((v, k) => v * idx[k])
  }
  const heads: Record<OpexHead, number[]> = {
    ieFee: priced(constant(o.ieFee), inf.maintenance),
    spvManpower: priced(constant(o.staff), inf.staff),
    spvOverhead: priced(constant(o.patrolRunning), inf.maintenance),
    financeLegal: priced(flcFactor.map((f) => o.financeLegal * f), inf.maintenance),
    insurance: priced(constant(insurance), inf.insurance), // 'Fin Set' tag "No Inflation" (0 at V16's inputs)
    routineMaintenance: priced(split(() => o.routine), inf.maintenance),
    // V16 has a separate MM inflation input ('1. IO'!T6, = RM 4.5%); the site has one maintenance rate.
    majorMaintenance: priced(split((y) => (o.resurfacingYears.includes(y) ? o.majorMaintenance : 0)), inf.maintenance),
    electricity: priced(split(() => o.electricity), inf.electricity),
  }
  const gstRate: Record<OpexHead, number> = { ieFee: gs, spvManpower: 0, spvOverhead: 0, financeLegal: gs,
    insurance: gs, routineMaintenance: gs, majorMaintenance: gs, electricity: 0 }
  const keys = Object.keys(heads) as OpexHead[]
  const gst = Object.fromEntries(keys.map((h) => [h, heads[h].map((v) => v * gstRate[h])])) as Record<OpexHead, number[]>
  const across = (r: Record<OpexHead, number[]>) => g.fys.map((_, k) => keys.reduce((s, h) => s + r[h][k], 0))
  const total = across(heads), gstTotal = across(gst)

  // COP-MOF r303..r313 = FY P&L line incl. GST / (Fin-IGAAP r5 × 'Fin Set'!C49) × r302; IFERROR → 0 on a 0 factor.
  // r302 = MIN(cumulative post-COD days r13, DB!H72 = K13 + K14) − previous cumulative; the post-COD days sum to
  // exactly the first-payment lag (A-Q2), so r302 = r13.
  // V16 quirk B-Q9: funded through COP incl. GST, while the expense fund ledger later uses ex-GST costs.
  const daily = g.fys.map((_, k) => (g.opFactorCod[k] ? (total[k] + gstTotal[k]) / (g.opFactorCod[k] * YEAR) : 0))
  // g.fys runs FY(appointed)..FY(concession end), so every post-COD period's FY is on the grid.
  const postCodOpex = g.periods.map((p) => (p.kind === 'postCod' ? daily[at.get(p.fy)!] * p.days : 0))

  return { ...heads, total, gst, gstTotal, daily, postCodOpex }
}
