import { addMonths, fyEnd } from '../../../dates'
import { toFy } from '../../revenue'
import type { Row } from '../../types'
import { add, cumulative, leaves, line, neg, subtotal, total, under } from '../row'
import { byRow, fmtDate, src, type Ctx } from './context'

/** Fin-IGAAP r6–r36 (C-statements §2.1, §4.2–§4.4). `rows` in V16 order; `at` by V16 row for the other statements. */
export function profitAndLoss(x: Ctx): { rows: Row[]; at: Record<number, Row> } {
  const { r, n, byAnnuity, fin } = x, rev = r.revenue, o = r.opex, f = r.funds, t = r.tax, cd = r.igaap.csrDetail
  const constant = (v: number) => Array<number>(n).fill(v)

  // A. Revenue → each instalment / interest / O&M payment on its annuity date (Revenue r48, r49, r51).
  const byDate = (id: string, s: number[], what: string, v16: string) => rev.dates.map((d, j) =>
    line(`${id}.a${j + 1}`, `Annuity ${j + 1}, ${fmtDate(d)}`, x.at(s[j], d),
      { formula: `${what} on annuity date ${j + 1}, in the FY of that date`, source: `${v16}, annuity ${j + 1}` }))
  const a1 = fin('pl.A.1', 'Receipt from Authority-60% of Completion Cost', byAnnuity(rev.instalment), 8,
    'Completion-cost instalments received in the FY: instalment % × the completion-cost base (completion cost on COD '
    + 'less the grant with PIM)', { num: 'A.1', children: byDate('pl.A.1', rev.instalment, 'Instalment', 'Revenue!48') })
  const a2 = fin('pl.A.2', 'Receipt from Authority-Interest Payments', byAnnuity(rev.interest), 9,
    'Interest on the reducing completion-cost balance, bank rate + spread per half-year, received in the FY',
    { num: 'A.2', children: byDate('pl.A.2', rev.interest, 'Interest', 'Revenue!49') })
  const a3 = fin('pl.A.3', 'Receipt from Authority-O&M Payments', byAnnuity(rev.om), 10,
    'O&M payments received in the FY: the year\'s O&M rate × bid price / 2, indexed to the payment date',
    { num: 'A.3', children: byDate('pl.A.3', rev.om, 'O&M payment', 'Revenue!51') })
  const a4 = fin('pl.A.4', 'Bonus from Early Completion', byAnnuity(rev.bonus), 11,
    'Early-completion bonus, paid with the first instalment', { num: 'A.4' })
  const a5 = fin('pl.A.5', 'Interest Accrued on Funds', f.interestOnFunds, 12,
    'Interest at the FD rate on the average balance of each fund', { num: 'A.5', children: [
      fin('pl.A.5.ffe', 'Funds for Expenses', f.ffe.interest, 296, 'Average of opening and closing × FD rate × COD factor'),
      fin('pl.A.5.mmr', 'Major Maintenance Reserve', f.mmr.interest, 288, 'Average of opening and closing × FD rate × COD factor'),
      fin('pl.A.5.dsri', 'DSR - interest ledger', f.dsrInterest.interest, 334, 'Average of opening and closing × FD rate × DSR factor'),
      fin('pl.A.5.dsrp', 'DSR - principal ledger', f.dsrPrincipal.interest, 350, 'Average of opening and closing × FD rate × DSR factor'),
    ] })
  const revenue = subtotal('pl.r13', 'Total Revenue', [a1, a2, a3, a4, a5].map((c) => under('pl.r13', c)),
    { source: src(13), formula: 'A.1 + A.2 + A.3 + A.4 + A.5' })

  // B. Operational cost: one line per O&M Cost head, the FY's cost at that FY end's index (sheet order: B.7 above B.6).
  const head = (id: string, num: string, label: string, s: number[], v16: number, what: string) =>
    fin(id, label, neg(s), v16, `${what}: concession-year cost split into the FY, at the FY-end inflation index`, { num })
  const b = [
    head('pl.B.1', 'B.1', 'IE Fee', o.ieFee, 15, 'Independent engineer fee'),
    head('pl.B.2', 'B.2', 'SPV Manpower', o.spvManpower, 16, 'SPV staff cost'),
    head('pl.B.3', 'B.3', 'SPV OH', o.spvOverhead, 17, 'SPV overheads (IMV running and admin charges)'),
    head('pl.B.4', 'B.4', 'Finance, Legal & Compliance Cost', o.financeLegal, 18, 'Finance, legal and compliance cost, to the last repayment'),
    head('pl.B.5', 'B.5', 'Insurance', o.insurance, 19, 'Insurance on the EPC cost'),
    head('pl.B.7', 'B.7', 'Routine Maintenance', o.routineMaintenance, 20, 'Routine maintenance'),
    head('pl.B.6', 'B.6', 'Major Maintenance', o.majorMaintenance, 21, 'Major maintenance (resurfacing) in its years'),
    head('pl.B.8', 'B.8', 'Electricity', o.electricity, 22, 'Electricity'),
    fin('pl.B.9', 'Provision for Major Maintenance', x.zero(), 23, '0: major-maintenance provisioning is off in V16', { num: 'B.9' }),
    fin('pl.B.10', 'Charged to P&L-Excess Input GST & Payment', neg(r.gst.writeOff), 24,
      'GST credit left unused at the end of the concession, written off', { num: 'B.10' }),
  ]
  const expense = subtotal('pl.r25', 'Total Expense', b.map((c) => under('pl.r25', c)),
    { source: src(25), formula: 'B.1 to B.10' })
  const ebidta = total('pl.C', 'EBIDTA', leaves('pl.C', [revenue, expense]),
    { num: 'C.', source: src(26), formula: 'Total Revenue + Total Expense' })

  // C. Interest → the Debt sheet's monthly interest by half-year (Apr–Sep, Oct–Mar).
  const dm = r.debt.months, firstHalf = (d: number) => fyEnd(d) === fyEnd(addMonths(d, 6)) // Apr–Sep
  const half = (h1: boolean) => neg(toFy(dm.map((m) => (firstHalf(m.end) === h1 ? m.interest : 0)), dm.map((m) => m.end), r.grid))
  const c1 = fin('pl.C.1', 'Less -  Interest -Senior Debt', neg(r.debt.interest.slice(0, n)), 27,
    'Senior-debt interest after COD (interest before COD is capitalised as IDC): average balance × rate × days',
    { num: 'C.1', children: [
      line('pl.C.1.h1', 'April to September', half(true), { formula: 'Monthly interest for months ending April–September', source: 'Debt!18 + Debt!34' }),
      line('pl.C.1.h2', 'October to March', half(false), { formula: 'Monthly interest for months ending October–March', source: 'Debt!18 + Debt!34' }),
    ] })
  const c2 = fin('pl.C.2', 'Less -  Interest - Equity - USL', x.zero(), 28, '0: the unsecured loan is interest-free', { num: 'C.2' })
  const c3 = fin('pl.C.3', 'Less -  Interest - Interim Debt', x.zero(), 29, '0: no interim debt in V16', { num: 'C.3' })
  const interest = subtotal('pl.r30', 'Total Interest', [c1, c2, c3].map((c) => under('pl.r30', c)),
    { source: src(30), formula: 'C.1 + C.2 + C.3' })
  const ebdta = total('pl.D', 'EBDTA', leaves('pl.D', [ebidta, interest]),
    { num: 'D.', source: src(31), formula: 'EBIDTA + Total Interest' })

  // D.1 → cumulative intangible additions × the FY's share of lifetime Authority receipts (A.1–A.4).
  const receipts = add(a1.values, a2.values, a3.values, a4.values), lifetime = receipts.reduce((s, v) => s + v, 0)
  const d1 = fin('pl.D.1', 'Less -  Depreciation as per Books', neg(r.bookDep.depreciation), 32,
    'Revenue-based amortisation: cumulative intangible additions × this FY\'s Authority receipts / lifetime receipts',
    { num: 'D.1', additive: false, children: [
      line('pl.D.1.base', 'Cumulative intangible additions', cumulative(r.capitalised.additions),
        { total: false, formula: 'Σ intangible additions to date (all made by COD)', source: 'Σ Fin-IGAAP!239 to date' }),
      line('pl.D.1.fy', 'Authority receipts in the FY (A.1 to A.4)', receipts,
        { formula: 'Completion instalments + interest + O&M payments + bonus', source: 'Fin-IGAAP!8:11' }),
      line('pl.D.1.life', 'Lifetime Authority receipts', constant(lifetime),
        { total: false, formula: 'Σ of A.1 to A.4 over the concession', source: 'Fin-IGAAP!D8:D11' }),
    ] })
  const pbt = total('pl.E', 'Profit Before Tax', leaves('pl.E', [ebdta, d1]),
    { num: 'E.', source: src(33), formula: 'EBDTA + D.1' })

  // E.1 → previous-FY tests, average PBT of the 3 preceding FYs × rate (C §4.4).
  const flag = (id: string, label: string, s: number[], v16: number, what: string) =>
    fin(`pl.E.1.${id}`, label, s, v16, `1 if the previous FY's ${what}`, { total: false, unit: 'count' })
  const csrChildren = [
    flag('nw', 'Net Worth', cd.netWorthTest, 400, `net worth (share capital + reserves) > ${r.inputs.csr.netWorth}`),
    flag('to', 'Turnover', cd.turnoverTest, 401, `total revenue > ${r.inputs.csr.turnover}`),
    flag('np', 'Net Profit', cd.profitTest, 402, `PAT > ${r.inputs.csr.profit}`),
    fin('pl.E.1.app', 'CSR Expenditure Applicability', cd.applicable, 403, '1 if any of the three tests holds',
      { total: 0, unit: 'count' }), // V16's D403 is a typed 0
    line('pl.E.1.avg', 'Average PBT of the 3 preceding FYs', cd.averagePbt,
      { total: false, formula: 'AVERAGE of PBT (E.) in up to 3 preceding FYs, losses included', source: 'AVERAGE of Fin-IGAAP!405, 3 preceding FYs' }),
    line('pl.E.1.rate', 'CSR rate', constant(r.inputs.csr.rate), { total: false, unit: 'pct', formula: 'CSR share of average PBT', source: "'Fin Set'!L11" }),
    fin('pl.E.1.amt', 'CSR Expenditure', cd.amount, 406, 'Applicability × MAX(rate × average PBT, 0)'),
  ]
  const e1 = fin('pl.E.1', 'Less- CSR', neg(r.igaap.csr), 34,
    'CSR: 2% of the average PBT of the 3 preceding FYs, when the previous FY passes a net-worth, turnover or profit test',
    { num: 'E.1', additive: false, children: csrChildren })

  // E.2 → the tax working r262–r268 (C §4.3).
  const taxChildren = [
    fin('pl.E.2.pbt', 'PBT as per Companies Act', t.pbt, 262, 'Profit before tax (E.), before CSR'),
    fin('pl.E.2.book', 'Add - Depreciation as per Companies Act', t.bookDep, 263, 'Book depreciation (D.1) added back'),
    fin('pl.E.2.it', 'Less - Depreciation as per Income Tax Act', neg(t.taxDep), 264,
      'Straight line over the tax life on cumulative additions × the COD operation factor'),
    fin('pl.E.2.pbtit', 'PBT as per Income Tax Act', t.pbtIt, 265, 'PBT + book depreciation − tax depreciation'),
    fin('pl.E.2.bf', 'Less - Brought Forward Losses', t.lossesBf, 266, 'Losses carried forward, including this year\'s loss'),
    fin('pl.E.2.taxable', 'PBT for Tax Calculation', t.taxable, 267, 'MAX(PBT as per Income Tax Act + b/f losses, 0)'),
    line('pl.E.2.rate', 'Tax rate', constant(t.rate), { total: false, unit: 'pct', formula: 'Base rate × (1 + surcharge) × (1 + cess)', source: "'Fin Set'!B11" }),
    fin('pl.E.2.tax', `Less - Tax @ ${(t.rate * 100).toFixed(3)} %`, t.tax, 268, 'Taxable profit × tax rate, paid in the same FY'),
  ]
  const e2 = fin('pl.E.2', 'Less- Income Tax', neg(t.tax), 35, 'Current tax on taxable profit after loss set-off; no MAT, no deferred tax',
    { num: 'E.2', additive: false, children: taxChildren })
  const pat = total('pl.F', 'Profit after tax', leaves('pl.F', [pbt, e1, e2]),
    { num: 'F.', source: src(36), formula: 'PBT + E.1 + E.2' })

  const rows = [
    x.header('pl.A', 'Revenue', 7, 'A.'), a1, a2, a3, a4, a5, revenue,
    x.header('pl.B', 'Operational Cost', 14, 'B.'), ...b, expense, ebidta, c1, c2, c3, interest, ebdta, d1, pbt, e1, e2, pat,
  ]
  return { rows, at: byRow(rows) }
}
