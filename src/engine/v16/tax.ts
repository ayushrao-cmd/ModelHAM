import { fyEnd } from '../dates'
import type { Inputs } from '../types'
import type { ConstructionResult, UseKey } from './construction'
import type { DebtResult } from './debt'
import type { FundsResult } from './funds'
import type { GstResult } from './gst'
import type { OpexResult } from './opex'
import { toFy, type RevenueResult } from './revenue'
import type { Grid } from './types'

/**
 * Depreciation, income tax and CSR (recon B §6, §7, B-G15…G17; C §4.1–§4.4). Per FY of `g.fys`, amounts positive
 * (the sheet's depreciation, tax and CSR rows are their negatives) unless noted.
 */

/** COP-MOF r322..r342 (ex-GST cost by line) that V16 capitalises, keyed by sheet row. Rows 324 (EPC 22(2)), 336/337
 *  (MABG/APSBG), 340 (interim debt) and 341 (MA to Authority) are 0 in V16 and not modelled (see `UseKey`). */
export const CAPITALISED_ROWS = {
  322: 'epcFixed', 323: 'epcVariable', 325: 'imvCapital', 326: 'preBid', 327: 'spvFormation', 328: 'ieFee',
  329: 'spvManpower', 330: 'admin', 331: 'fundRaising', 332: 'financeLegal', 333: 'imvRental', 334: 'contingency',
  335: 'psbgCommission', 338: 'idc', 339: 'stlInterest', 342: 'maInterestFromEpc',
} as const
export type CapitalisedKey = (typeof CAPITALISED_ROWS)[keyof typeof CAPITALISED_ROWS]

export interface CapitalisedCost {
  /** Per `g.periods`: COP-MOF r322..r342 = use line gross / (1 + its GST rate) (= gross − GST), r338 = IDC (r31). */
  lines: Record<CapitalisedKey, number[]>
  /** r345 per period: Σ lines. Excludes COD→1st-annuity interest (r33) and O&M (r38), net GST payable (r40), the
   *  DSR (r41/r42) and every GST credit. */
  total: number[]
  /** Per FY: Σ_FY r345, and the grant with PIM ex-GST (Σ_FY DB!D84:N84 on DB r78, the FY of each tranche date). */
  costByFy: number[]; grantByFy: number[]
  /** Fin-IGAAP r239 (= r248) intangible additions: costByFy − grantByFy. */
  additions: number[]
}

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const cumulative = (a: number[]) => { let s = 0; return a.map((v) => (s += v)) }

export function capitalisedCost(c: ConstructionResult, g: Grid): CapitalisedCost {
  const ends = g.periods.map((p) => p.end)
  const lines = {} as Record<CapitalisedKey, number[]>
  for (const key of Object.values(CAPITALISED_ROWS)) {
    const l = c.uses.lines[key as UseKey]
    lines[key] = key === 'idc' ? c.months.map((m) => m.idc) : l.gross.map((v, k) => v - l.gst[k])
  }
  const total = g.periods.map((_, k) => sum(Object.values(lines).map((l) => l[k])))
  const costByFy = toFy(total, ends, g)
  // 'Fin Set'!C30 = D30 = "Yes": the grant with PIM (DB r84). Unreached tranches carry 0 (and a NaN date).
  const gr = c.uses.grant, hit = gr.crossing.map((d, j) => (Number.isNaN(d) ? -1 : j)).filter((j) => j >= 0)
  const grantByFy = toFy(hit.map((j) => gr.amount[j]), hit.map((j) => gr.crossing[j]), g)
  return { lines, total, costByFy, grantByFy, additions: costByFy.map((v, k) => v - grantByFy[k]) }
}

/** An asset roll-forward: opening (previous closing) + addition − depreciation = closing. */
export interface Depreciation { opening: number[]; addition: number[]; depreciation: number[]; closing: number[] }

function rollForward(addition: number[], dep: (cumAdd: number, k: number) => number): Depreciation {
  const cum = cumulative(addition), opening: number[] = [], depreciation: number[] = [], closing: number[] = []
  addition.forEach((a, k) => {
    opening[k] = k ? closing[k - 1] : 0
    depreciation[k] = dep(cum[k], k)
    closing[k] = opening[k] + a - depreciation[k]
  })
  return { opening, addition, depreciation, closing }
}

/** Authority receipts per FY: Fin-IGAAP r8 + r9 + r10 + r11 (instalment, interest, O&M, bonus). */
const receipts = (rev: RevenueResult, g: Grid) =>
  toFy(rev.dates.map((_, k) => rev.instalment[k] + rev.interest[k] + rev.om[k] + rev.bonus[k]), rev.dates, g)

/** Companies Act amortisation, revenue-based (Fin-IGAAP r238–r241): E240 = −Σ additions to date / Σ(D8:D11) × Σ(E8:E11).
 *  Interest on funds (r12) is not in the share. */
export function bookDepreciation(cap: CapitalisedCost, rev: RevenueResult, g: Grid): Depreciation {
  const r = receipts(rev, g), total = sum(r)
  // No Authority receipts at all: V16 divides by Σ(D8:D11) = 0 (#DIV/0!); nothing is amortised here instead.
  if (!total) return rollForward(cap.additions, () => 0)
  return rollForward(cap.additions, (cum, k) => cum / total * r[k])
}

/** Income-tax Act depreciation, SLM ('Fin Set'!B42, rows 246–250): E249 = −1/life × Σ additions to date × E5 (op factor
 *  from COD). No cap at the balance: V16's Σ factor is exactly the life (B-Q11 complements), so it ends at 0. The WDV
 *  option (r252–r257) is unused in V16 and not modelled. */
export function taxDepreciation(cap: CapitalisedCost, g: Grid, i: Inputs): Depreciation & { rate: number } {
  const rate = 1 / i.tax.depLifeYears // 'Fin Set'!D42 = 1/'CA Set'!O8
  return { rate, ...rollForward(cap.additions, (cum, k) => rate * cum * g.opFactorCod[k]) }
}

/** IGAAP P&L to PBT before CSR: r13 total revenue (receipts + r12 interest on funds) and r33 = r13 + r25 + r30 + r32.
 *  r25 = opex heads + r24 excess GST written off (r23 MM provision and r21's r395 are 0: 'Fin Set'!B36 = "No");
 *  r30 = senior-debt interest (r28 USL and r29 interim debt are 0). */
export function igaapProfit(g: Grid, rev: RevenueResult, opex: OpexResult, debt: DebtResult, gst: GstResult,
  funds: FundsResult, bookDep: number[]): { turnover: number[]; pbt: number[] } {
  const turnover = receipts(rev, g).map((v, k) => v + funds.interestOnFunds[k])
  return { turnover,
    pbt: turnover.map((v, k) => v - opex.total[k] - gst.writeOff[k] - debt.interest[k] - bookDep[k]) }
}

export interface TaxResult {
  rate: number
  /** r262 PBT (before CSR), r263 + book dep, r264 − IT dep (positive here), r265 PBT as per IT Act. */
  pbt: number[]; bookDep: number[]; taxDep: number[]; pbtIt: number[]
  /** r266 b/f losses (≤ 0), r267 taxable, r268 tax. */
  lossesBf: number[]; taxable: number[]; tax: number[]
  /** r270 opening, r271 loss for the year (≤ 0), r272 profit for the year, r273 carried forward (≤ 0). */
  lossOpening: number[]; lossForYear: number[]; profitForYear: number[]; lossCarried: number[]
}

/**
 * Current tax (Fin-IGAAP r259–r273). `pbtBeforeCsr` includes interest on funds, which depends on this tax through the
 * FFE tax ledger: Task 13 iterates. CSR is not deductible. No expiry of losses, no MAT, paid in the same FY.
 */
export function runTax(i: Inputs, g: Grid, pbtBeforeCsr: number[], bookDep: number[], taxDep: number[]): TaxResult {
  const t = i.tax, rate = t.baseRate * (1 + t.surcharge) * (1 + t.cess) // 'Fin Set'!B11 taxrate
  const z = () => g.fys.map(() => 0)
  const r: TaxResult = { rate, pbt: pbtBeforeCsr.slice(0, g.fys.length), bookDep, taxDep, pbtIt: z(), lossesBf: z(),
    taxable: z(), tax: z(), lossOpening: z(), lossForYear: z(), profitForYear: z(), lossCarried: z() }
  g.fys.forEach((_, k) => {
    const pbtIt = r.pbt[k] + bookDep[k] - taxDep[k]
    const open = k ? r.lossCarried[k - 1] : 0, loss = Math.min(pbtIt, 0), profit = Math.max(pbtIt, 0)
    // V16 quirk B-Q7: the b/f loss E266 = opening + this year's loss (r270 + r271), not the opening alone. In a loss
    // year the current loss is thus in both r265 and r266; taxable = MAX(r265 + r266, 0) is 0 either way, so no tax effect.
    const bf = open + loss < 0 ? open + loss : 0
    const taxable = Math.max(pbtIt + bf, 0)
    r.pbtIt[k] = pbtIt; r.lossesBf[k] = bf; r.taxable[k] = taxable; r.tax[k] = taxable * rate
    r.lossOpening[k] = open; r.lossForYear[k] = loss; r.profitForYear[k] = profit
    r.lossCarried[k] = Math.min(open + loss + profit, 0)
  })
  return r
}

export interface CsrResult {
  /** Fin-IGAAP r400..r403 / Fin-INDAS r389..r392: 1 if the test on the previous FY holds (0 in the first FY). */
  netWorthTest: number[]; turnoverTest: number[]; profitTest: number[]; applicable: number[]
  /** r406 / r395: CSR expensed and paid in the FY (P&L r34 / IndAS r47 = −amount). */
  amount: number[]
}

/**
 * CSR (B §6, C §4.4), usable with either standard's figures: `pbt` before CSR (IGAAP r33, IndAS r46), `netWorth`
 * (share capital + reserves + equity rows 43–46, excl. USL), `turnover` (total revenue), `pat`. Each FY t tests FY t−1
 * (> 'Fin Set'!I11 / J11 / K11) and charges MAX(L11 × AVERAGE(PBT of the up-to-3 preceding FYs, incl. 0 and losses), 0).
 * CSR_t depends on PAT_{t−1} only, so a caller computing PAT from this CSR converges in one pass per FY.
 */
export function csr(i: Inputs, g: Grid, pbt: number[], netWorth: number[], turnover: number[], pat: number[],
  standard: 'igaap' | 'indas'): CsrResult {
  const s = i.csr, endFy = fyEnd(g.concessionEnd) // DB!N16
  const test = (a: number[], limit: number) => g.fys.map((_, k) => +(k > 0 && a[k - 1] > limit))
  const netWorthTest = test(netWorth, s.netWorth), turnoverTest = test(turnover, s.turnover), profitTest = test(pat, s.profit)
  const applicable = g.fys.map((_, k) => +(netWorthTest[k] + turnoverTest[k] + profitTest[k] >= 1))
  // IGAAP E406 × IF(E399 > DB!N16, 0, 1): 0 once the previous FY (E399 = EDATE(FY, −12)) is past the concession-end
  // FY, so the FY right after it still pays CSR on the last year (payment-year lag).
  // V16 quirk B-Q12: IndAS (Fin-INDAS!E395) tests E370, a GST cell (₹ Cr, never above a date serial), instead of the
  // year row, so IndAS CSR is never cut off by date.
  const cutOff = (k: number) => standard === 'igaap' && k > 0 && g.fys[k - 1] > endFy
  const amount = g.fys.map((_, k) => {
    if (!s.on || !applicable[k] || cutOff(k)) return 0 // 'Fin Set'!H11 switch (P&L r34)
    const prior = pbt.slice(Math.max(0, k - 3), k)
    return Math.max(sum(prior) / prior.length * s.rate, 0)
  })
  return { netWorthTest, turnoverTest, profitTest, applicable, amount }
}

