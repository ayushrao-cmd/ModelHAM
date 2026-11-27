import { fyEnd } from '../dates'
import type { Inputs } from '../types'
import type { ConstructionResult } from './construction'
import { pim } from './indices'
import type { Day, Grid } from './types'

/** Revenue sheet (recon B §2). Every series is per annuity of `g.annuities` (Revenue F…AI); FY sums via `toFy`. */
export interface RevenueResult {
  /** Revenue!D14 = DB!C83 − C84: completion cost on COD less the grant with PIM. */
  completionBase: number
  dates: Day[]
  /** r17 opening balance, r14 instalment (Fin-IGAAP r8), r24 interest (r9), r29 bonus (r11). */
  opening: number[]; instalment: number[]; interest: number[]; bonus: number[]
  /** r44 unindexed, r37 index on the payment date, r45 payment (Fin-IGAAP r10). */
  omUnindexed: number[]; omIndex: number[]; om: number[]
  /** Fin-IGAAP r378..r380 per annuity (V16 applies the rate to the FY sums; same thing). */
  gstInstalment: number[]; gstInterest: number[]; gstOm: number[]
}

// 'Fin Set'!G61 Half = 2; 'Fin Set'!B49 Month = 30.
const HALF = 2, MONTH = 30
// 'CA Set'!F17 / G17 / H17: bonus if ≥ 30 days early, 60% × 0.5% of BPC per month early.
const BONUS_MIN_DAYS = 30, BONUS_SHARE = 0.6, BONUS_RATE = 0.005

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)

/** Sums dated values into the FY grid ('Fin-IGAAP' SUMIF on FY end); dates outside `g.fys` are dropped. */
export function toFy(series: number[], dates: Day[], g: Grid): number[] {
  const out = g.fys.map(() => 0), at = new Map(g.fys.map((f, k) => [f, k]))
  series.forEach((v, k) => {
    const j = at.get(fyEnd(dates[k]))
    if (j !== undefined) out[j] += v
  })
  return out
}

/**
 * O&M payment rate per concession year, 'CA Set' r29 (flexible perpetual, pre-layer D25) or r28 (flexible, E25),
 * picked by HLOOKUP on the pavement ('CA Set'!E11 = "No"). Year 1 0; years 2–4 base (hard-coded cells D:F); from
 * year 5: a layering year (C11, D11) → layer rate, else base if one of the 4 prior years was a layering year, else
 * the pre-layer rate; after the 2nd layering year, base. V16 has 15 columns; generalised to `operateYears`.
 */
export function omRates(i: Inputs): number[] {
  const inc = i.income, [l1, l2] = i.operations.resurfacingYears
  const pre = i.deal.pavement === 'flexible' ? inc.omPreResurfacingFlexible : inc.omPreResurfacingPerpetual
  const rates: number[] = []
  for (let y = 1; y <= i.deal.operateYears; y++) {
    if (y === 1) rates.push(0)
    else if (y <= 4) rates.push(inc.omBaseRate)
    else if (y > l2) rates.push(inc.omBaseRate)
    else if (y === l1 || y === l2) rates.push(inc.omResurfacingRate)
    else rates.push(rates.slice(y - 5, y - 1).includes(inc.omResurfacingRate) ? inc.omBaseRate : pre)
  }
  return rates
}

/**
 * Completion payments, interest on the outstanding balance, O&M payments, bonus and GST on them (B §2, B-G3…G6).
 * `earlyDays` = DB!H12 − I12 (scheduled − actual completion); V16's I14 shift is a hard-coded 0 with no input, so
 * the bonus is 0 unless a caller passes it.
 */
export function runRevenue(i: Inputs, g: Grid, c: ConstructionResult, earlyDays = 0): RevenueResult {
  const bid = i.deal.bidPrice, idx = pim(i, g), grant = c.uses.grant
  // DB r82/r83: completion cost % per milestone = increment of the grant thresholds ('CA Set' C20:L20), the
  // completion column N82 = 1 − Σ, each × BPC × PIM at the milestone date (D81 = 1 + r × ROUND(days)/365, the
  // grant index, V16 quirk A-Q6), completion at the construction end N76 = I12. DB!C84 = Σ grant with PIM.
  // A tranche never crossed (phasing short of it) is indexed at completion: its share is paid with the completion cost.
  let prev = 0, cost = 0
  i.support.tranches.forEach((t, j) => {
    cost += (t.progress - prev) * bid * idx.grantAt(grant.crossing[j] ?? g.constructionEnd)
    prev = t.progress
  })
  cost += (1 - prev) * bid * idx.grantAt(g.constructionEnd)
  const completionBase = cost - sum(grant.amount)

  // Revenue F22 = 'Fin Set'!K45 (AVERAGE of the bank rates + spread) + DB!K9 (0); F23 = F22/Half: flat per
  // half-year, no day count, on the balance before the instalment (F24 = F23 × F17).
  const b = i.income.bankRates, rate = (sum(b) / b.length + i.income.spread) / HALF
  const yearly = omRates(i).map((r) => r * bid) // r42
  const dates = g.annuities
  const opening: number[] = [], instalment: number[] = [], interest: number[] = []
  let bal = completionBase
  dates.forEach((_, k) => {
    opening.push(bal)
    instalment.push((i.income.installments[k] ?? 0) * completionBase) // r14 = r13 × D14
    interest.push(rate * bal)
    bal -= instalment[k]
  })

  // r44 = annual amount of year ROUNDUP(n/2) / Half; r37 = PIM(prev FY end) × (1 + r × days/365) (V16 quirk B-Q10).
  // V16 quirk B-Q14: the last annuity is the concession end, so its index accrues 352 days at the sample.
  const omUnindexed = dates.map((_, k) => (yearly[Math.ceil((k + 1) / 2) - 1] ?? 0) / HALF)
  const omIndex = dates.map((d) => idx.at(d))
  const om = omUnindexed.map((v, k) => v * omIndex[k])

  // r27/r28: "Yes" if ≥ 30 days early; (days/Month) × BPC × 60% × 0.5%. r29: paid on the first annuity whose earlier
  // instalments sum to 0 and whose instalment is > 1 (₹ Cr), i.e. annuity 1.
  const bonusAmount = earlyDays >= BONUS_MIN_DAYS ? earlyDays / MONTH * bid * BONUS_SHARE * BONUS_RATE : 0
  const first = instalment.findIndex((v, k) => v > 1 && sum(instalment.slice(0, k)) === 0)
  const bonus = dates.map((_, k) => (k === first ? bonusAmount : 0))

  // Fin-IGAAP r378 = r8 × GSTWorks, r380 = r10 × GSTOthers; no GST row for the bonus (r11).
  // V16 quirk B-Q13: r379 charges GSTWorks on the interest on annuities too.
  const gw = i.build.gstWorks, go = i.build.gstServices
  return { completionBase, dates, opening, instalment, interest, bonus, omUnindexed, omIndex, om,
    gstInstalment: instalment.map((v) => v * gw), gstInterest: interest.map((v) => v * gw),
    gstOm: om.map((v) => v * go) }
}
