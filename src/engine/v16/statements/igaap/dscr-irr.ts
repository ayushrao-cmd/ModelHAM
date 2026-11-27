import type { Row } from '../../types'
import { leaves, line, neg, sumFinite, subtotal, total, under } from '../row'
import { src, type Ctx } from './context'

/** Fin-IGAAP r123–r145 (C-statements §2.4). */
export function dscr(x: Ctx): Row[] {
  const { r, fin } = x, c = r.cash, d = c.dscrRows, none = { total: false as const }
  const pat = fin('dscr.r124', 'Profit After Tax', d.pat, 124, 'P&L F.')
  const dep = fin('dscr.r125', 'Add: Depreciation as per Books', d.bookDep, 125, 'P&L D.1 added back')
  const int = fin('dscr.r126', 'Add: Interest Expenses', d.interest, 126, 'P&L total interest added back')
  const accruals = subtotal('dscr.r127', 'Cash Accruals excluding Interest', leaves('dscr.r127', [pat, dep, int]),
    { source: src(127), formula: 'PAT + depreciation + interest' })
  const adj = [
    fin('dscr.r128', 'Transfer to/from Funds for Expenses', d.ffeTransfer, 128, 'Cash flow B.7 (funds for expenses movement)', { num: 'Add' }),
    fin('dscr.r129', 'Transfer From MMR Fund', d.mmrRelease, 129, 'Major maintenance paid from the MMR', { num: 'Add' }),
    fin('dscr.r130', 'Output GST on Revenues', d.outputGst, 130, 'GST collected on instalments, interest and O&M', { num: 'Add' }),
    fin('dscr.r131', 'Interim Debt', x.zero(), 131, '0: no interim debt in V16', { num: 'Less' }),
    fin('dscr.r132', 'GST Input', neg(d.inputGst), 132, 'Input GST paid on operating costs', { num: 'Less' }),
    fin('dscr.r133', 'GST payment to Government', neg(d.gstPaid), 133, 'Cash GST paid after credit set-off', { num: 'Less' }),
    fin('dscr.r134', 'Major Maintenance Expense', x.zero(), 134, '0: major-maintenance provisioning is off in V16', { num: 'Less' }),
    fin('dscr.r135', 'Transfer to MMR Fund', neg(d.mmrSetAside), 135, 'MMR set aside in the FY', { num: 'Less' }),
  ]
  const cfads = total('dscr.B', 'Total Cash Available for DSCR', leaves('dscr.B', [accruals, ...adj]),
    { num: 'B.', ...none, source: src(136), formula: 'Cash accruals + the fund, GST and MMR adjustments (post tax, before DSR movements)' })
  const count = fin('dscr.r137', 'No. of Repayments V. Annuities', d.repaymentsInFy, 137,
    'Annuities in the FY up to the last repayment date', { ...none, unit: 'count' })
  const annuityWise = fin('dscr.r138', 'Total Cash Available for DSCR -  Annuity Wise', d.cfadsAnnuity, 138,
    'Cash available for DSCR; in the last repayment FY halved × the repayments in it; 0 after', none)
  const rep = fin('dscr.r139', 'Senior Debt Repayment', d.repayment, 139, 'Cash flow B.3, positive')
  const intr = fin('dscr.r140', 'Interest Expenses', d.interest, 140, 'P&L total interest, positive')
  const service = subtotal('dscr.r141', 'Principal + Interest Repayment', leaves('dscr.r141', [rep, intr]),
    { source: src(141), formula: 'Repayment + interest' })
  const ratio = fin('dscr.C', 'DSCR', c.dscr.map((v) => v ?? NaN), 142,
    'Annuity-wise cash available / debt service, from the 1st-annuity FY to the last repayment FY',
    { num: 'C.', ...none, unit: 'ratio', additive: false, children: leaves('dscr.C', [annuityWise, service]) })
  const window = c.dscr.map((v) => v !== null)
  const inWindow = (s: number[]) => s.map((v, k) => (window[k] ? v : NaN))
  const blank = Array<number>(x.n).fill(NaN)
  const avg = fin('dscr.D', 'Average DSCR', blank, 143,
    'Σ cash available (not halved in the last FY, V16 quirk B-Q5) / Σ debt service over the DSCR years',
    { num: 'D.', total: c.dscrAvg ?? 0, unit: 'ratio', additive: false, children: [
      line('dscr.D.cfads', 'Total Cash Available for DSCR, DSCR years', inWindow(c.cfads),
        { formula: 'Cash available for DSCR in the DSCR years', source: 'Fin-IGAAP!136, DSCR years' }),
      line('dscr.D.service', 'Principal + Interest Repayment, DSCR years', inWindow(d.debtService),
        { formula: 'Debt service in the DSCR years', source: 'Fin-IGAAP!141, DSCR years' }),
    ] })
  const min = fin('dscr.E', 'Minimum DSCR', blank, 144, 'Lowest DSCR over the DSCR years', { num: 'E.', total: c.dscrMin ?? 0, unit: 'ratio' })
  const max = fin('dscr.F', 'Maximum DSCR', blank, 145, 'Highest DSCR over the DSCR years', { num: 'F.', total: c.dscrMax ?? 0, unit: 'ratio' })
  return [pat, dep, int, accruals, ...adj, cfads, count, annuityWise, rep, intr, service, ratio, avg, min, max]
}

/** Fin-IGAAP r147–r208 (C-statements §2.5): annual flows and IRRs, then the half-yearly equity XIRR blocks (total only:
 *  their columns are a date grid, not FYs). */
export function irr(x: Ctx, cf: Record<number, Row>): Row[] {
  const { r, n, fin } = x, c = r.cash, a = c.annual, h = c.equityFlows
  const flows = (id: string, label: string, values: number[], v16: number, formula: string, children?: Row[]) =>
    fin(id, label, values, v16, formula, { num: id.split('.')[1], ...(children && { children }) })
  const drawn = (id: string, rows: number[]) => rows.map((k) => fin(`${id}.cf${k}`, cf[k].label, neg(cf[k].values), k,
    'Drawn in the FY (cash flow statement)', { flip: true }))
  const A = flows('irr.A', 'Total Cash Outflow', a.projectOutflow, 155, 'Equity and senior debt drawn', drawn('irr.A', [69, 70, 75]))
  const B = flows('irr.B', 'Total Equity Outflow', a.equityOutflow, 156, 'Equity drawn', drawn('irr.B', [69, 70]))
  const D = flows('irr.D', 'Taxes', a.tax, 159, 'Income tax added back')
  const E = flows('irr.E', 'Post Tax Cash Available for DSCR', c.cfads, 160, 'DSCR B. (cash available for DSCR)')
  const C = flows('irr.C', 'Pre Tax Cash Available for DSCR (D+E)', a.cfadsPre, 158, 'D + E', leaves('irr.C', [D, E]))
  const rep = fin('irr.r161', 'Less - Senior Debt Repayment', neg(a.repayment), 161, 'Cash flow B.3')
  const int = fin('irr.r162', 'Less - Interest Expenses', neg(a.interest), 162, 'P&L total interest')
  const dsr = fin('irr.r163', 'Cashflow +/(-) movement for DSR', a.dsrMovement, 163, 'Cash flow B.4 (DSR created − / released +)')
  const eq = fin('irr.r164', 'Post Tax Cash Inflow for Equity', a.equityInflow, 164,
    'E − repayment − interest ± DSR movement (= the change in cash; no distributions)', { children: leaves('irr.r164', [E, rep, int, dsr]) })
  const F = flows('irr.F', 'Project Free Cashflow Pre Tax (A-C)', c.projectFlows.pre, 165, 'A + C', leaves('irr.F', [A, C]))
  const G = flows('irr.G', 'Project Free Cashflow Post Tax (A-E)', c.projectFlows.post, 166, 'A + E', leaves('irr.G', [A, E]))
  const H = flows('irr.H', 'Equity Free Cashflow Pre Tax (B-D-E)', a.equityPre, 167, 'B + D + equity inflow', leaves('irr.H', [B, D, eq]))
  const I = flows('irr.I', 'Equity Free Cashflow Post Tax (B-E)', a.equityPost, 168, 'B + equity inflow', leaves('irr.I', [B, eq]))
  // IRR(FY flows), shown in the last FY column; D = Σ = the IRR. null (no root) shows 0 as V16's IFERROR.
  const rate = (id: string, label: string, v: number | null, v16: number, of: Row) => {
    const values = Array<number>(n).fill(0)
    values[n - 1] = v ?? 0
    return fin(id, label, values, v16, `IRR of ${of.label} over the FY columns`, { unit: 'pct', additive: false, children: [under(id, of, false)] })
  }
  const sum = (s: number[]) => sumFinite(s), blank = () => Array<number>(n).fill(NaN)
  const hy = (id: string, num: string | undefined, label: string, v16: number, t: number, formula: string,
    unit: Row['unit'] = 'money') => fin(id, label, blank(), v16, formula, { total: t, unit, ...(num && { num }) })
  return [
    x.header('irr.r154', 'Cash Outflow', 154, 'I'), A, B, x.header('irr.r157', 'Cash Inflow', 157, 'II'), C, D, E, rep, int, dsr, eq,
    F, G, H, I,
    rate('irr.r169', 'Pre - Tax Project IRR', c.irr.projectPre, 169, F),
    rate('irr.r170', 'Post - Tax Project IRR', c.irr.projectPost, 170, G),
    rate('irr.r171', 'Pre - Tax Equity IRR', c.irr.equityAnnualPre, 171, H),
    rate('irr.r172', 'Post - Tax Equity IRR', c.irr.equityAnnualPost, 172, I),
    x.header('irr.HY', 'Equity IRR - Half yearly', 174),
    x.header('irr.HY.A', 'Cash Outflow -', 176, 'A.'),
    hy('irr.HY.r177', undefined, 'Total Equity Outflow', 177, sum(h.outflow), 'Equity drawn at each construction month end'),
    hy('irr.HY.r184', undefined, 'Total Cash Outflow', 184, sum(h.outflow), 'Share capital + USL drawn, by month end'),
    x.header('irr.HY.B', 'Month Ends for Annuity Dates', 185, 'B.'),
    hy('irr.HY.r189', undefined, 'Total Cash Inflow', 189, sum(h.inflow),
      'Each FY\'s equity inflow split equally over its annuity month ends (an FY without one is dropped, V16 quirk B-Q1)'),
    hy('irr.HY.C', 'C.', 'Net Cashflow Post Tax', 190, sum(h.post), 'Inflow + outflow'),
    hy('irr.HY.r191', undefined, 'Add - Tax Expense', 191, sum(h.tax), 'Each FY\'s tax split over its annuity month ends'),
    hy('irr.HY.D', 'D.', 'Net Cashflow Pre Tax', 192, sum(h.pre), 'Post-tax flow + tax'),
    hy('irr.HY.E', 'E.', 'Post - Tax Equity IRR', 194, c.irr.equityHalfYearly ?? 0, 'XIRR of the post-tax flows on their dates', 'pct'),
    hy('irr.HY.F', 'F.', 'Pre - Tax Equity IRR', 195, c.irr.equityHalfYearlyPre ?? 0, 'XIRR of the pre-tax flows on their dates', 'pct'),
    x.header('irr.MA', 'Equity IRR - Post Adjustment of Mobilization Advance to EPC Balance', 197),
    fin('irr.MA.A', 'Mob Advance Balance', blank(), 199, 'Mobilisation advance with the EPC contractor at each month end',
      { num: 'A', total: false }),
    fin('irr.MA.B', 'Total Equity Invested (Cumulative)', blank(), 200, 'Equity drawn to date', { num: 'B', total: false }),
    hy('irr.MA.C', 'C', 'Actual Equity Invested (A-B)', 201, sum(h.mobAdjusted), 'Equity drawn net of the advance balance held'),
    hy('irr.MA.D', 'D.', 'Total Cash Inflow', 202, sum(h.inflow), 'As the half-yearly block'),
    hy('irr.MA.E', 'E.', 'Net Cash Flow Post Tax', 203, sum(h.mobPost), 'Inflow + adjusted equity invested'),
    hy('irr.MA.F', 'F.', 'Add Tax Expense', 204, sum(h.tax), 'As the half-yearly block'),
    hy('irr.MA.G', 'G.', 'Net Cashflow Pre Tax', 205, sum(h.mobPre), 'Post-tax flow + tax'),
    hy('irr.MA.H', 'H.', 'Post - Tax Equity IRR', 207, c.irr.equityMobAdj ?? 0, 'XIRR of the adjusted post-tax flows', 'pct'),
    hy('irr.MA.I', 'I.', 'Pre - Tax Equity IRR', 208, c.irr.equityMobAdjPre ?? 0, 'XIRR of the adjusted pre-tax flows', 'pct'),
  ]
}
