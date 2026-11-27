import { fyEnd } from '../../../dates'
import { annualIrr, halfYearly, halfYearlyXirr } from '../../cash'
import type { Row } from '../../types'
import { leaves, line, neg, sumFinite, subtotal, total, under } from '../row'
import type { Ctx } from './context'

/** 'Fin Set'!G61: the last repayment FY's cash available is halved × its repayments (r154). */
const HALF = 2

/** Fin-INDAS r140–r161 (C-statements §3.4): the DSCR built from IndAS cash flows (receipts less operating payments). */
export function dscr(x: Ctx, pl: Record<number, Row>, cf: Record<number, Row>): Row[] {
  const { r, fin } = x, none = { total: false as const }
  const v = (rows: Record<number, Row>, n: number) => rows[n].values
  const inflow = subtotal('dscr.r140', 'Cash Inflow from Operations', leaves('dscr.r140', [111, 112, 113, 114, 115].map((n) => cf[n])),
    { source: x.src(140), formula: 'Cash flow operating sources 1–5 (incl. the 60% instalments)' })
  const outflow = subtotal('dscr.r141', 'Cash Outflow on Operations', leaves('dscr.r141', [120, 121, 122, 123].map((n) => cf[n])),
    { source: x.src(141), formula: 'Operating expenses + interest + CSR + income tax paid' })
  const addInt = fin('dscr.r142', 'Add Interest Expense', neg(v(cf, 121)), 142, 'Interest paid added back')
  const gross = subtotal('dscr.r143', 'Gross Cash Accrual before Interest', leaves('dscr.r143', [inflow, outflow, addInt]),
    { source: x.src(143), formula: 'Inflow + outflow + interest' })
  const adj = [
    fin('dscr.r144', 'Funds for Expenses', v(cf, 131), 144, 'Cash flow 12 (funds for expenses movement)', { num: 'Add' }),
    fin('dscr.r145', 'Transfer From MMR Fund', r.funds.mmr.used, 145, 'Major maintenance paid from the MMR', { num: 'Add' }),
    fin('dscr.r146', 'GST Collection', v(cf, 117), 146, 'GST collected on instalments, interest and O&M', { num: 'Add' }),
    fin('dscr.r147', 'Repayment of Interim Debt', v(cf, 132), 147, 'Cash flow 13 (0: no interim debt in V16)', { num: 'Less' }),
    fin('dscr.r148', 'Transfer to MMR Fund', neg(r.funds.mmr.setAside), 148, 'MMR set aside in the FY', { num: 'Less' }),
    fin('dscr.r149', 'MM Expense', x.zero(), 149, '0: major-maintenance provisioning is off in V16', { num: 'Less' }),
    fin('dscr.r150', 'GST Input Paid', v(cf, 125), 150, 'Input GST paid on operating costs', { num: 'Less' }),
    fin('dscr.r151', 'GST payment to Government', v(cf, 126), 151, 'Cash GST paid after credit set-off', { num: 'Less' }),
  ]
  const cfads = total('dscr.B', 'Total Cash Available for DSCR', leaves('dscr.B', [gross, ...adj]),
    { num: 'B.', source: x.src(152), formula: 'Gross cash accrual + the fund, GST and MMR adjustments (post tax and CSR)' })
  const d = r.cash.dscrRows, u14 = fyEnd(r.debt.repaymentEnd)
  const count = fin('dscr.r153', 'No. of Repayments V. Annuities', d.repaymentsInFy, 153,
    'Annuities in the FY up to the last repayment date', { ...none, unit: 'count' })
  const annuityWise = fin('dscr.r154', 'Total Cash Available for DSCR -  Annuity Wise',
    cfads.values.map((c, k) => (r.grid.fys[k] === u14 ? c / HALF * d.repaymentsInFy[k] : c)), 154,
    'Cash available for DSCR; in the last repayment FY halved × the repayments in it (not zeroed after it, unlike IGAAP)')
  const rep = fin('dscr.r155', 'Senior Debt Repayment', neg(v(cf, 127)), 155, 'Cash flow 8, positive')
  const intr = fin('dscr.r156', 'Interest Expenses', neg(v(pl, 40)), 156, 'P&L C.4, positive')
  const service = subtotal('dscr.r157', 'Principal + Interest Repayment', leaves('dscr.r157', [rep, intr]),
    { source: x.src(157), formula: 'Repayment + interest' })
  // DSCR years as IGAAP: FY(1st annuity) to FY(last repayment).
  const window = r.cash.dscr.map((s) => s !== null)
  const ratio = fin('dscr.C', 'DSCR', annuityWise.values.map((a, k) => (window[k] ? a / service.values[k] : NaN)), 158,
    'Annuity-wise cash available / debt service, from the 1st-annuity FY to the last repayment FY',
    { num: 'C.', ...none, unit: 'ratio', additive: false, children: leaves('dscr.C', [annuityWise, service]) })
  const inWindow = (s: number[]) => s.map((a, k) => (window[k] ? a : NaN))
  const blank = Array<number>(x.n).fill(NaN), ratios = ratio.values.filter(Number.isFinite)
  const num = sumFinite(inWindow(cfads.values)), den = sumFinite(inWindow(service.values))
  const avg = fin('dscr.D', 'Average DSCR', blank, 159,
    'Σ cash available (not halved in the last FY, V16 quirk B-Q5) / Σ debt service over the DSCR years',
    { num: 'D.', total: den ? num / den : 0, unit: 'ratio', additive: false, children: [
      line('dscr.D.cfads', 'Total Cash Available for DSCR, DSCR years', inWindow(cfads.values),
        { formula: 'Cash available for DSCR in the DSCR years', source: 'Fin-INDAS!152, DSCR years' }),
      line('dscr.D.service', 'Principal + Interest Repayment, DSCR years', inWindow(service.values),
        { formula: 'Debt service in the DSCR years', source: 'Fin-INDAS!157, DSCR years' }),
    ] })
  const min = fin('dscr.E', 'Minimum DSCR', blank, 160, 'Lowest DSCR over the DSCR years',
    { num: 'E.', total: ratios.length ? Math.min(...ratios) : 0, unit: 'ratio' })
  const max = fin('dscr.F', 'Maximum DSCR', blank, 161, 'Highest DSCR over the DSCR years',
    { num: 'F.', total: ratios.length ? Math.max(...ratios) : 0, unit: 'ratio' })
  return [inflow, outflow, addInt, gross, ...adj, cfads, count, annuityWise, rep, intr, service, ratio, avg, min, max]
}

/** Fin-INDAS r170–r210 (C-statements §3.4): annual flows and IRRs, then the half-yearly equity XIRR (total only). */
export function irr(x: Ctx, pl: Record<number, Row>, cf: Record<number, Row>, dscrRows: Row[]): Row[] {
  const { r, n, fin, ig, copy } = x
  const flows = (id: string, label: string, values: number[], v16: number, formula: string, children?: Row[]) =>
    fin(id, label, values, v16, formula, { num: id.split('.')[1], ...(children && { children }) })
  const A = copy('irr.A', 171, ig(155), 'Equity and senior debt drawn (as IGAAP)', { num: 'A' })
  const B = copy('irr.B', 172, ig(156), 'Equity drawn (as IGAAP)', { num: 'B' })
  const D = flows('irr.D', 'Taxes', neg(pl[48].values), 175, 'Income tax added back')
  const E = flows('irr.E', 'Post Tax Cash Available for DSCR', dscrRows.find((d) => d.id === 'dscr.B')!.values, 176,
    'DSCR B. (IndAS cash available for DSCR)')
  const C = flows('irr.C', 'Pre Tax Cash Available for DSCR (D+E)', D.values.map((t, k) => t + E.values[k]), 174, 'D + E',
    leaves('irr.C', [D, E]))
  const rep = fin('irr.r177', 'Less - Senior Debt Repayment', cf[127].values, 177, 'Cash flow 8')
  const int = fin('irr.r178', 'Less - Interest Expenses', cf[121].values, 178, 'Interest paid (cash flow 2)')
  const dsr = fin('irr.r179', 'Cashflow +/(-) movement for DSR', cf[128].values, 179, 'Cash flow 9 (DSR created − / released +)')
  const eqParts = leaves('irr.r180', [E, rep, int, dsr])
  const eq = fin('irr.r180', 'Post Tax Cash Inflow for Equity', E.values.map((_, k) => sumFinite(eqParts.map((p) => p.values[k]))),
    180, 'E − repayment − interest ± DSR movement (= the change in IndAS cash; no distributions)', { children: eqParts })
  const sum2 = (a: Row, b: Row, c?: Row) => a.values.map((s, k) => s + b.values[k] + (c ? c.values[k] : 0))
  const F = flows('irr.F', 'Project Free Cashflow Pre Tax (A-C)', sum2(A, C), 181, 'A + C', leaves('irr.F', [A, C]))
  const G = flows('irr.G', 'Project Free Cashflow Post Tax (A-E)', sum2(A, E), 182, 'A + E', leaves('irr.G', [A, E]))
  const H = flows('irr.H', 'Equity Free Cashflow Pre Tax (B-D-E)', sum2(B, D, eq), 183, 'B + D + equity inflow',
    leaves('irr.H', [B, D, eq]))
  const I = flows('irr.I', 'Equity Free Cashflow Post Tax (B-E)', sum2(B, eq), 184, 'B + equity inflow', leaves('irr.I', [B, eq]))
  // IRR(FY flows), shown in the last FY column; D = the IRR. No root shows 0 (V16's IFERROR).
  const rate = (id: string, label: string, v16: number, of: Row) => {
    const values = Array<number>(n).fill(0), v = annualIrr(of.values) ?? 0
    values[n - 1] = v
    return fin(id, label, values, v16, `IRR of ${of.label} over the FY columns`,
      { total: v, unit: 'pct', additive: false, children: [under(id, of, false)] })
  }
  // Half-yearly block on the IGAAP date grid, with IndAS equity inflow and tax.
  const h = halfYearly(r.grid, r.construction, r.revenue, eq.values, D.values)
  const blank = () => Array<number>(n).fill(NaN), sum = sumFinite
  const hy = (id: string, num: string | undefined, label: string, v16: number, t: number, formula: string,
    unit: Row['unit'] = 'money') => fin(id, label, blank(), v16, formula, { total: t, unit, ...(num && { num }) })
  const drawn = (id: string, label: string, v16: number, from: number) =>
    hy(id, undefined, label, v16, -cf[from].total, 'Drawn at each construction month end (negative)')
  return [
    x.header('irr.r170', 'Cash Outflow', 170, 'I'), A, B, x.header('irr.r173', 'Cash Inflow', 173, 'II'), C, D, E,
    rep, int, dsr, eq, F, G, H, I,
    rate('irr.r185', 'Pre - Tax Project IRR', 185, F), rate('irr.r186', 'Post - Tax Project IRR', 186, G),
    rate('irr.r187', 'Pre - Tax Equity IRR', 187, H), rate('irr.r188', 'Post - Tax Equity IRR', 188, I),
    x.header('irr.HY', 'Equity IRR - Half yearly', 190), x.header('irr.HY.A', 'Cash Outflow -', 192, 'A.'),
    drawn('irr.HY.r193', 'Equity Share Capital', 193, 82), drawn('irr.HY.r194', "Promoter's USL", 194, 83),
    drawn('irr.HY.r195', 'Equity - IDC', 195, 84), drawn('irr.HY.r196', 'Equity - DSR', 196, 85),
    drawn('irr.HY.r197', 'Equity - Working Capital', 197, 86), drawn('irr.HY.r198', 'Equity - Contingency 22.1', 198, 87),
    hy('irr.HY.r199', undefined, 'Total Cash Outflow', 199, sum(h.outflow), 'Share capital + USL drawn, by month end'),
    x.header('irr.HY.B', 'Month Ends for Annuity Dates', 200, 'B.'),
    hy('irr.HY.r204', undefined, 'Total Cash Inflow', 204, sum(h.inflow),
      'Each FY\'s IndAS equity inflow split equally over its annuity month ends (an FY without one is dropped, V16 quirk B-Q1)'),
    hy('irr.HY.C', 'C.', 'Net Cashflow Post Tax', 205, sum(h.post), 'Inflow + outflow'),
    hy('irr.HY.r206', undefined, 'Add - Tax Expense', 206, sum(h.tax), 'Each FY\'s tax split over its annuity month ends'),
    hy('irr.HY.D', 'D.', 'Net Cashflow Pre Tax', 207, sum(h.pre), 'Post-tax flow + tax'),
    hy('irr.HY.E', 'E.', 'Post - Tax Equity IRR', 209, halfYearlyXirr(h, h.post) ?? 0, 'XIRR of the post-tax flows on their dates', 'pct'),
    hy('irr.HY.F', 'F.', 'Pre - Tax Equity IRR', 210, halfYearlyXirr(h, h.pre) ?? 0, 'XIRR of the pre-tax flows on their dates', 'pct'),
  ]
}
