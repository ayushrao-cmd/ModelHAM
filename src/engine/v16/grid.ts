import { addMonths, eomonth, fyEnd, isIsoDate, toDay } from '../dates'
import type { Inputs } from '../types'
import type { ConcessionYear, Day, Grid, Period } from './types'

/** 'Fin Set'!C49: the fixed year basis. */
export const YEAR = 365

/** Excel's calendar, 1900-01-01 .. 9999-12-31 (also keeps EDATE/EOMONTH inside JS Date's range). */
const MIN_DAY = toDay('1900-01-01'), MAX_DAY = toDay('9999-12-31')

/** Days in the FY ending `fy` (31 March): 365 or 366 ('Fin Set'!F49:BK49). */
export const daysInFy = (fy: Day): number => fy - addMonths(fy, -12)

/**
 * V16 time grid (recon A §1, B §1, C §1).
 * Dates, DB row 12: LOA = bid + award days, CA = LOA + agreement days, appointed date (G12) = CA + start days,
 * construction end I12 = AD + build days − 1, COD J12 = I12 + 1, 1st annuity K12 = COD + K13 (first-payment lag,
 * 180), concession end N12 = EDATE(I12, 12 × operation years).
 */
export function buildGrid(i: Inputs): Grid {
  const { deal } = i
  const bid = toDay(deal.bidDate)
  const appointed = bid + deal.daysToAward + deal.daysToAgreement + deal.daysToStart
  const constructionEnd = appointed + deal.buildDays - 1
  const cod = constructionEnd + 1
  const firstAnnuity = cod + i.income.firstPaymentLagDays
  const concessionEnd = addMonths(constructionEnd, 12 * deal.operateYears)
  // Every loop below advances a real date to a real end date, so it ends only if those dates are real: a bad bid date
  // (blank, or a non-date such as 2026-02-30) or a non-finite day count throws here instead of looping forever.
  if (!isIsoDate(deal.bidDate)) throw new Error(`v16 grid: invalid bid date "${deal.bidDate}"`)
  if (![appointed, constructionEnd, firstAnnuity, concessionEnd].every((d) => d >= MIN_DAY && d <= MAX_DAY))
    throw new Error('v16 grid: invalid or out-of-range date (a day count or the operation years is not a finite number)')

  // COP-MOF r7/r8/r12/r13: calendar-month slices, construction capped at I12, then post-COD capped at K12.
  // (H8's `H7 <= DB!$I$11` compares a date with a text label, so it is always TRUE in Excel.)
  const periods: Period[] = []
  for (let s = appointed; ; ) {
    const construction = s <= constructionEnd
    const end = Math.min(eomonth(s), construction ? constructionEnd : firstAnnuity)
    // V16 quirk A-Q2: the period ending on the 1st annuity counts end − start (the annuity day is excluded),
    // so the last post-COD period has 14 days at the sample.
    const days = construction || end !== firstAnnuity ? end - s + 1 : end - s
    periods.push({ start: s, end, days, kind: construction ? 'construction' : 'postCod', fy: fyEnd(end) })
    if (end >= firstAnnuity) break
    s = end + 1
  }

  // Revenue r4: EDATE(prev, K13/Month = 6) from K12; ponytail: V16 spaces by K13/30 months (K13 is a hard-coded 180
  // there), generalised to the HAM half-year so a different first-payment lag does not change the spacing.
  // V16 quirk B-Q14: the last annuity is the concession end (18-Mar-2045), not the EDATE date (15-Mar-2045).
  const n = 2 * deal.operateYears // V16 hard-codes 30 (Revenue G4: IF(G10=30, ...))
  const annuities: Day[] = []
  for (let k = 1, d = firstAnnuity; k <= n; k++) {
    annuities.push(k === n ? concessionEnd : d)
    if (annuities[k - 1] === concessionEnd) break // Revenue G4: IF(F4=DB!$N$12, "")
    d = addMonths(d, 6)
  }

  // Fin-IGAAP r3: FY(appointed) .. FY(concession end). V16's IGAAP E3 is 0 unless the bid date equals a hard-coded
  // 2026-07-08 (Fin-IGAAP!A5); generalised to IndAS's E3 = DB!G16.
  const fys: Day[] = []
  for (let f = fyEnd(appointed); f <= fyEnd(concessionEnd); f = addMonths(f, 12)) fys.push(f)
  const fyDays = fys.map(daysInFy)
  const at = new Map(fys.map((f, k) => [f, k]))
  const perFy = () => fys.map(() => 0)

  // O&M Cost J4..J9: concession years from COD, each EDATE(start, 12) − 1 capped at N12; K4 stops at N12.
  const concessionYears: ConcessionYear[] = []
  for (let s = cod; ; ) {
    const end = Math.min(addMonths(s, 12) - 1, concessionEnd)
    concessionYears.push({ start: s, end, share: (fyEnd(s) - s + 1) / daysInFy(fyEnd(s)) })
    if (end + 1 >= concessionEnd) break
    s = end + 1
  }

  // Fin-IGAAP r5 = Σ O&M Cost J12: share to FY(start) + complement to FY(end).
  // V16 quirk B-Q11: the complement is 1 − share, not a day count, so leap FYs give 0.999903 / 1.000097 and FY45
  // 0.964481 (vs DB!N19 0.964384).
  const opFactorCod = perFy()
  for (const y of concessionYears) {
    const a = at.get(fyEnd(y.start)), b = at.get(fyEnd(y.end))
    if (a !== undefined) opFactorCod[a] += y.share
    if (b !== undefined) opFactorCod[b] += 1 - y.share
  }

  // Fin-IGAAP r4: 0 outside [K16, N16]; K16: (K16 − K12)/365 (DB!K19); N16: 1 − (N16 − N12)/365 (DB!N19); else 1.
  const k16 = fyEnd(firstAnnuity), n16 = fyEnd(concessionEnd)
  const opFactorAnnuity = fys.map((f) =>
    f < k16 || f > n16 ? 0 : f === k16 ? (k16 - firstAnnuity) / YEAR : f === n16 ? 1 - (n16 - concessionEnd) / YEAR : 1)

  // Fin-INDAS r4: construction days in the FY / days in the FY.
  const constructionFactor = perFy()
  for (const p of periods) {
    const k = at.get(p.fy)
    if (p.kind === 'construction' && k !== undefined) constructionFactor[k] += p.days
  }
  constructionFactor.forEach((v, k) => (constructionFactor[k] = v / fyDays[k]))

  return { bid, appointed, constructionEnd, cod, firstAnnuity, concessionEnd, periods, annuities, fys, fyDays,
    concessionYears, opFactorCod, opFactorAnnuity, constructionFactor }
}
