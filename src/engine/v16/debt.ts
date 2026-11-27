import { addMonths, eomonth, fyEnd } from '../dates'
import type { Inputs } from '../types'
import type { ConstructionResult } from './construction'
import { daysInFy } from './grid'
import type { Day, Grid } from './types'

/** One Debt-sheet column: rows 5–18 (`cod`, COD → 1st annuity) or rows 21–34 (`repayment`, 1st annuity → DB!U12). */
export interface DebtMonth {
  phase: 'cod' | 'repayment'
  start: Day; end: Day
  /** Interest days: end − start + 1, except the COD block's month ending on the 1st annuity (end − start). */
  days: number; rate: number
  /** `repayment` positive (Debt r32 is negative). */
  opening: number; addition: number; repayment: number; closing: number; interest: number
}
export interface DebtResult {
  months: DebtMonth[]
  /** Repayment base COP-MOF D75 (= Debt!C17, the balance at the 1st annuity, once construction has converged). */
  base: number
  /** DB!U12: the annuity date of the last instalment. */
  repaymentEnd: Day
  /** DB r67 per annuity of `g.annuities`: repayment % × D75 (0 past the schedule). */
  principal: number[]
  /** Per FY of `g.fys`: Fin-IGAAP r218..r222 from FY(COD) (0 before); `repayment` positive. `closing` is the BS line
   *  r47: before FY(COD) the construction balance at the period ending on the FY end (COP-MOF r217), then r221. */
  opening: number[]; addition: number[]; repayment: number[]; closing: number[]; interest: number[]
}

/** DB!D62: half-year end of a date (31 Mar for Oct–Mar, 30 Sep for Apr–Sep). */
const halfYearEnd = (d: Day) => {
  const m = new Date(d * 86_400_000).getUTCMonth()
  return m >= 3 && m <= 8 ? eomonth(addMonths(fyEnd(d), -6)) : fyEnd(d)
}

/** Senior debt in operations (recon B §8, B-G10) on V16's monthly Debt grid. */
export function runDebt(i: Inputs, g: Grid, c: ConstructionResult): DebtResult {
  const months: DebtMonth[] = []

  // Rows 5–18 are COP-MOF's post-COD periods (D5 = DB!R12 + 1 = COD, same slicing to K12, A-Q2 day count): opening
  // D14 = r217 at construction end, additions D15 = r215, interest = r229 on AVERAGE(open, close) × days / FY days at
  // the CP rate (V16 quirk A-Q7: 'Fin Set'!H30 = "No" keeps 9.75% after COD), all from the construction result.
  g.periods.forEach((p, k) => {
    if (p.kind !== 'postCod') return
    const m = c.months[k]
    months.push({ phase: 'cod', start: p.start, end: p.end, days: p.days, rate: i.capital.buildRate,
      opening: m.debtBalance - m.debtDraw, addition: m.debtDraw, repayment: 0, closing: m.debtBalance,
      interest: m.postCodInterest })
  })

  // DB r60: EDATE chain from K12 every K13/'Fin Set'!B49 = 6 months while ≤ N18 (no B-Q14 swap of the last date).
  const db: Day[] = []
  for (let d = g.firstAnnuity; d <= eomonth(g.concessionEnd); d = addMonths(d, 6)) db.push(d)
  const rep = i.capital.repayment
  const principal = g.annuities.map((_, n) => (rep[n] ?? 0) * c.debt) // DB r67 = r65 × 'COP-MOF'!D75
  // DB!U12 = SUMIF(annuity no., '1. IO'!K3, r60); K3 (25) generalised to the schedule's length.
  const repaymentEnd = db[rep.length - 1]

  // Rows 21–34: calendar months from K12 (that day included) to U12.
  // ponytail: r31 additions (COP-MOF draws in a period *starting* on the month start) are 0 unless the 1st annuity is
  // the 1st of a month (a 0-day post-COD period); not modelled.
  let open = months.length ? months[months.length - 1].closing : c.months[c.months.length - 1].debtBalance // D30 = C17
  for (let s = g.firstAnnuity; ; ) {
    const end = Math.min(eomonth(s), repaymentEnd), fy = fyEnd(end)
    // r32: instalments whose annuity month end (DB r61) is this month's end.
    const repayment = db.reduce((a, d, n) => a + (eomonth(d) === eomonth(end) ? principal[n] ?? 0 : 0), 0)
    // r27 + r28: the CP rate only where a COP-MOF period ends on this month's end (a 1-day first month when K12 is a
    // month end); after K12 SUMIF(DB r62 half-year end, FY end, DB r64 = '1. IO'!H16 + DB!J9 sensitivity 0).
    const rate = (end === g.firstAnnuity ? i.capital.buildRate : 0)
      + (end > g.firstAnnuity ? i.capital.operateRate * db.filter((d) => halfYearEnd(d) === fy).length : 0)
    const closing = open - repayment, days = end - s + 1
    // V16 quirk B-Q15: a repayment month charges AVERAGE(pre, post repayment) over the whole month.
    months.push({ phase: 'repayment', start: s, end, days, rate, opening: open, addition: 0, repayment, closing,
      interest: (open + closing) / 2 * days / daysInFy(fy) * rate })
    open = closing
    if (end >= repaymentEnd) break
    s = end + 1
  }

  // Fin-IGAAP r218..r222: SUMIF of the monthly rows on FY(end); r218 starts at the COD opening and rolls forward.
  const at = new Map(g.fys.map((f, k) => [f, k])), perFy = () => g.fys.map(() => 0)
  const addition = perFy(), repayment = perFy(), interest = perFy(), opening = perFy(), closing = perFy()
  for (const m of months) {
    const k = at.get(fyEnd(m.end))
    if (k === undefined) continue
    addition[k] += m.addition; repayment[k] += m.repayment; interest[k] += m.interest
  }
  const k0 = at.get(fyEnd(g.cod)) ?? g.fys.length
  let bal = months[0]?.opening ?? 0
  g.fys.forEach((f, k) => {
    if (k < k0) { // r47: E3 < DB!J16 → SUMIF(COP-MOF r8 period end, FY end, r217)
      closing[k] = c.months.reduce((a, m, j) => a + (g.periods[j].end === f ? m.debtBalance : 0), 0)
      return
    }
    opening[k] = bal
    closing[k] = bal = bal + addition[k] - repayment[k]
  })
  return { months, base: c.debt, repaymentEnd, principal, opening, addition, repayment, closing, interest }
}
