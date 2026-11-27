import { CAPITALISED_ROWS } from '../../tax'
import type { Row } from '../../types'
import { add, leaves, line, neg, subtotal, total, under } from '../row'
import { byRow, src, type Ctx } from './context'

/** COP-MOF r322..r342 labels (V16's text), for the capitalised cost by line. */
export const CAPITALISED_LABELS: Record<keyof typeof CAPITALISED_ROWS, string> = {
  322: 'EPC Cost - Fixed', 323: 'EPC Cost - Variable', 325: 'IMV Capital Cost', 326: 'Prebid Expenses Cost',
  327: 'SPV Formation Cost', 328: 'IE Fee', 329: 'SPV Manpower', 330: 'Administrative Cost', 331: 'Fund Raising Cost',
  332: 'Finance Legal & Compliance Cost', 333: 'IMV Vehicle Rental', 334: 'Contingency', 335: 'PSBG Commission',
  338: 'Interest - Construction Period', 339: 'Interest - STL', 342: 'Interest on Mobilization Advance from EPC',
}

/** Capitalised cost (COP-MOF r345) by line, by FY, `sign` × ex-GST cost. */
export function capitalisedByLine(x: Ctx, id: string, sign: 1 | -1): Row[] {
  return Object.entries(CAPITALISED_ROWS).map(([v16, key]) => line(`${id}.${key}`,
    CAPITALISED_LABELS[+v16 as keyof typeof CAPITALISED_ROWS], x.byPeriod(x.r.capitalised.lines[key]).map((v) => sign * v),
    { formula: 'Cost of this use line ex-GST, Σ of its construction months in the FY', source: `COP-MOF!${v16} by FY` }))
}

/** Fin-IGAAP r66–r121 (C-statements §2.3). `at` by V16 row for the BS, DSCR and IRR. */
export function cashFlow(x: Ctx, pl: Record<number, Row>): { rows: Row[]; at: Record<number, Row> } {
  const { r, fin, byPeriod } = x, c = r.cash, m = r.construction.months, f = r.funds, gst = r.gst, gr = r.construction.uses.grant
  const v = (n: number) => c.lines[n] ?? x.zero()
  /** A CF line equal to a P&L line: its drill-down too. */
  const fromPl = (id: string, num: string, n: number, p: number, formula: string, label = pl[p].label) =>
    fin(id, label, pl[p].values, n, formula, { num, additive: pl[p].additive,
      children: pl[p].children?.map((ch) => under(id, ch)) })
  const off = (id: string, num: string, n: number, label: string, why: string) => fin(id, label, x.zero(), n, `0: ${why}`, { num })
  // Grant base and PIM part by tranche date (DB r85, r86); a tranche never reached (no date) carries 0.
  const tranches = (s: number[]) => s.reduce((acc, val, j) => (gr.crossing[j] == null ? acc
    : add(acc, x.at(val, gr.crossing[j]!))), x.zero())
  const draws = (construction: boolean) =>
    byPeriod(m.map((p, j) => ((r.grid.periods[j].kind === 'construction') === construction ? p.debtDraw : 0)))

  const sources = [
    fin('cf.A.1', 'Equity Share Capital', v(69), 69,
      'Share capital drawn in the FY (COP-MOF r95 by month; share capital is drawn before USL)', { num: '1' }),
    fin('cf.A.2', 'Equity - USL', v(70), 70, 'Unsecured loan from the promoter drawn in the FY (COP-MOF r96 by month)', { num: '2' }),
    off('cf.A.3', '3', 71, 'Equity - IDC', 'no separate IDC equity in V16'),
    off('cf.A.4', '4', 72, 'Equity - DSR', 'no separate DSR equity in V16'),
    off('cf.A.5', '5', 73, 'Equity - Working Capital', 'no separate working-capital equity in V16'),
    off('cf.A.6', '6', 74, 'Equity - Contingency', 'no separate contingency equity in V16'),
    fin('cf.A.7', 'Senior Debt', v(75), 75, 'Senior debt drawn in the FY, including the draw between COD and the 1st annuity',
      { num: '7', children: [
        line('cf.A.7.cp', 'Construction months', draws(true),
          { formula: 'Debt drawn in construction months', source: 'COP-MOF!215 by FY' }),
        line('cf.A.7.cod', 'COD to 1st annuity', draws(false),
          { formula: 'Debt drawn after COD, to the 1st annuity', source: 'COP-MOF!215 by FY' }),
      ] }),
    fin('cf.A.8', 'Short Term Loan', v(76), 76,
      'Short-term loan drawn (10% of bid, two instalments; COP-MOF r155), passed to the EPC contractor', { num: '8' }),
    off('cf.A.9', '9', 77, 'Mobilization Advance from Authority', 'V16 takes an STL instead of the Authority advance'),
    fin('cf.A.10', 'Mobilization Advance recovered from EPC', v(78), 78,
      'Advance recovered from EPC bills at grant milestones 1–8 (COP-MOF r168)', { num: '10' }),
    fin('cf.A.11', 'Grant Received from Authority', v(79), 79,
      'Construction support (40% of bid in 10 tranches) with PIM, ex-GST, in the FY of each tranche', { num: '11', children: [
        line('cf.A.11.base', 'Grant (Without PIM)', tranches(gr.amount.map((a, j) => a - gr.pim[j])),
          { formula: 'Bid price × 40% / 10 per tranche, on its crossing date', source: 'DB!85 by DB!78' }),
        line('cf.A.11.pim', 'PIM on Grant', tranches(gr.pim), { formula: 'Price-index uplift on each tranche', source: 'DB!86 by DB!78' }),
      ] }),
    fin('cf.A.12', 'GST Output Collected - CP', v(80), 80, 'GST on the grant: grant × GST on works (GST ledger r377)', { num: '12' }),
    off('cf.A.13', '13', 81, 'Interim Debt', 'no interim debt in V16'),
  ]
  const applications = [
    fin('cf.A.14', 'Construction Cost (Intangible Asset)', v(83), 83, 'Total cost to be capitalised (ex-GST, incl. IDC), by line',
      { num: '14', children: capitalisedByLine(x, 'cf.A.14', -1) }),
    fin('cf.A.15', 'GST Input Paid', v(84), 84,
      'GST paid on construction costs, carried as GST credit (COP-MOF r277 by month; GST ledger r366)', { num: '15' }),
    fin('cf.A.16', 'Repayment of STL', v(85), 85, 'STL repaid at grant milestones 1–8 (COP-MOF r156)', { num: '16' }),
    fin('cf.A.17', 'Mobilization Advance to EPC', v(86), 86,
      'STL passed to the EPC contractor as mobilisation advance (COP-MOF r167)', { num: '17' }),
    off('cf.A.18', '18', 87, 'Mobilization Advance Repaid to Authority', 'no Authority advance in V16'),
    fin('cf.A.19', 'Fund for Expenses', v(88), 88, 'Funds for expenses funded from the project cost (COD to 1st annuity interest and O&M)',
      { num: '19', children: [
        fin('cf.A.19.int', 'Interest ledger', neg(f.ffeInterest.funded), 300, 'Funded through COP', { flip: true }),
        fin('cf.A.19.om', 'O&M ledger', neg(f.ffeOm.funded), 307, 'Funded through COP', { flip: true }),
        fin('cf.A.19.tax', 'Taxation ledger', neg(f.ffeTax.funded), 314, 'Funded through COP', { flip: true }),
      ] }),
    fin('cf.A.20', 'DSR Fund', v(89), 89, 'DSR funded from the project cost at COD', { num: '20', children: [
      fin('cf.A.20.int', 'Interest DSR', neg(f.dsrInterest.funded), 331, 'Funded from project cost', { flip: true }),
      fin('cf.A.20.pri', 'Principal DSR', neg(f.dsrPrincipal.funded), 347, 'Funded from project cost', { flip: true }),
    ] }),
    off('cf.A.21', '21', 90, 'PSBG/MABG/ASPBG Margin Deposit', 'the EPC contractor provides the guarantees in V16'),
    off('cf.A.22', '22', 91, 'Interim Debt', 'no interim debt in V16'),
  ]

  const opSources = [
    fromPl('cf.B.src.A.1', '1', 95, 8, 'Same as P&L A.1 (received in cash)'),
    fromPl('cf.B.src.A.2', '2', 96, 9, 'Same as P&L A.2'),
    fromPl('cf.B.src.A.3', '3', 97, 10, 'Same as P&L A.3'),
    fromPl('cf.B.src.A.4', '4', 98, 11, 'Same as P&L A.4'),
    fromPl('cf.B.src.A.5', '5', 99, 12, 'Same as P&L A.5 (interest on funds treated as received in cash)'),
  ]
  const otherSources = [fin('cf.B.src.B.1', 'GST Output Collected - OP', v(101), 101, 'GST on instalments, interest and O&M payments',
    { num: '1', children: [
      fin('cf.B.src.B.1.inst', 'GST on Annuity', gst.outputInstalment, 378, 'A.1 × GST on works'),
      fin('cf.B.src.B.1.int', 'GST on Interest on Annuity', gst.outputInterest, 379, 'A.2 × GST on works'),
      fin('cf.B.src.B.1.om', 'GST on O&M Payments', gst.outputOm, 380, 'A.3 × GST on services'),
    ] })]
  const opex = fin('cf.B.app.A.1', 'Operation Period Expenses', v(104), 104, 'B.1 to B.8 (cash opex; excludes B.9, B.10)',
    { num: '1', children: [15, 16, 17, 18, 19, 20, 21, 22].map((p) => under('cf.B.app.A.1', pl[p])) })
  const opApps = [opex,
    fin('cf.B.app.A.2', 'Interest Expenses', v(105), 105, 'Total interest (C.1 to C.3)',
      { num: '2', children: [27, 28, 29].map((p) => under('cf.B.app.A.2', pl[p])) }),
    fromPl('cf.B.app.A.3', '3', 106, 34, 'Same as P&L E.1 (paid in the year)', 'CSR'),
    fromPl('cf.B.app.A.4', '4', 107, 35, 'Same as P&L E.2 (tax paid in the year it is charged)', 'Income Tax'),
  ]
  const o = gst.inputOps
  const otherApps = [
    fin('cf.B.app.B.1', 'GST Input Paid', v(109), 109, 'GST paid on O&M, routine and major maintenance, electricity', { num: '1', children: [
      fin('cf.B.app.B.1.om', 'GST on O&M Expenses', neg(o.om), 367, 'GST on IE fee, FLC, insurance', { flip: true }),
      fin('cf.B.app.B.1.rm', 'GST on RM', neg(o.rm), 368, 'GST on routine maintenance', { flip: true }),
      fin('cf.B.app.B.1.mm', 'GST on MM', neg(o.mm), 369, 'GST on major maintenance', { flip: true }),
      fin('cf.B.app.B.1.el', 'GST on Electricity', neg(o.electricity), 370, 'GST on electricity', { flip: true }),
    ] }),
    fin('cf.B.app.B.2', 'GST payment to Government', v(110), 110, 'Output GST less the input credit set off against it', { num: '2', children: [
      fin('cf.B.app.B.2.out', 'Output GST Collected', neg(gst.output), 381, 'GST on grant, instalments, interest and O&M', { flip: true }),
      fin('cf.B.app.B.2.used', 'GST Credit Available', add(gst.creditUsedCp, gst.creditUsedOps), 384,
        'Input credit set off: MIN(credit available, output)', { flip: true }),
    ] }),
    fin('cf.B.app.B.3', 'Repayment of Senior Debt', v(111), 111,
      'Senior-debt instalments in the FY: repayment % × debt at the 1st annuity (debt schedule r220)', { num: '3' }),
    fin('cf.B.app.B.4', 'Transfer to/from DSR Fund (Including Funded from COP)', v(112), 112,
      'DSR created (−) or released (+) in the FY', { num: '4', children: [
        fin('cf.B.app.B.4.int', 'Interest DSR: created/(released)', neg(f.dsrInterest.setAside), 332, 'Top-up capped by cash available', { flip: true }),
        fin('cf.B.app.B.4.pri', 'Principal DSR: created/(released)', neg(f.dsrPrincipal.setAside), 348, 'Top-up capped by cash available', { flip: true }),
      ] }),
    fin('cf.B.app.B.5', 'Transfer to/From MMR Fund', v(113), 113, 'MMR set aside (−) or used for major maintenance (+)', { num: '5', children: [
      fin('cf.B.app.B.5.set', 'Add: Fund Set Aside for Expenditure', neg(f.mmr.setAside), 285, 'Share of the coming major maintenance', { flip: true }),
      fin('cf.B.app.B.5.used', 'Less: Expenditure Incurred', f.mmr.used, 286, 'Major maintenance paid from the MMR', { flip: true }),
    ] }),
    off('cf.B.app.B.6', '6', 114, 'Major Maintenance Expense', 'major-maintenance provisioning is off in V16'),
    fin('cf.B.app.B.7', 'Transfer to/From Funds for Expenses', v(115), 115, 'Funds for expenses re-set (−) or used (+) in the FY',
      { num: '7', children: [
        fin('cf.B.app.B.7.set', 'Add :  Funds set aside to reserve', neg(f.ffe.setAside), 293, 'Closing requirement − funded − opening + used', { flip: true }),
        fin('cf.B.app.B.7.used', 'Less: Utilization towards expenditure', f.ffe.used, 294, 'Interest, O&M and tax paid from the fund', { flip: true }),
      ] }),
    off('cf.B.app.B.8', '8', 116, 'Repayment of Interim Debt', 'no interim debt in V16'),
  ]

  const inLines = [...sources, ...opSources, ...otherSources], outLines = [...applications, ...opApps, ...otherApps]
  const opening = fin('cf.C.r118', 'Opening Balance', c.opening, 118, 'Previous FY\'s closing cash',
    { total: c.opening[0] ?? 0 })
  const inflow = subtotal('cf.C.r119', 'Total Cash Inflow', leaves('cf.C.r119', inLines),
    { source: src(119), formula: 'Construction sources 1–13 + operation sources' })
  const outflow = subtotal('cf.C.r120', 'Total Cash outflow', leaves('cf.C.r120', outLines),
    { source: src(120), formula: 'Construction applications 14–22 + operation applications' })
  const closing = total('cf.C.r121', 'Closing Cash Balance', [under('cf.C.r121', opening, false), under('cf.C.r121', inflow),
    under('cf.C.r121', outflow)], { source: src(121), formula: 'Opening + inflow + outflow (= BS Cash in Bank)',
    total: opening.total + inflow.total + outflow.total })

  const h = x.header
  const rows = [
    h('cf.A', 'Construction Period', 67, 'A'), h('cf.A.src', 'Sources of Funds', 68), ...sources,
    h('cf.A.app', 'Applications of Funds', 82), ...applications,
    h('cf.B', 'Operation Period', 92, 'B'), h('cf.B.src', 'Sources of Funds', 93),
    h('cf.B.src.A', 'Operating Sources of Funds', 94, 'A'), ...opSources,
    h('cf.B.src.B', 'Other Sources of Funds', 100, 'B'), ...otherSources,
    h('cf.B.app', 'Applications of Funds', 102), h('cf.B.app.A', 'Operating Expenses', 103, 'A'), ...opApps,
    h('cf.B.app.B', 'Other Application of Funds', 108, 'B'), ...otherApps,
    h('cf.C', 'Cash Account', 117, 'C.'), opening, inflow, outflow, closing,
  ]
  return { rows, at: byRow(rows) }
}
