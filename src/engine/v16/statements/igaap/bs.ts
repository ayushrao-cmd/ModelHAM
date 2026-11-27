import type { Row } from '../../types'
import { add, check, cumulative, line, neg, previous, total, under } from '../row'
import { capitalisedByLine } from './cf'
import { src, type Ctx } from './context'

/**
 * Fin-IGAAP r38–r64 (C-statements §2.2), closing balances at FY end (no D total). Each line drills down to its
 * roll-forward (§6.1): opening (the previous closing) + the year's movements = the line (the closing).
 */
export function balanceSheet(x: Ctx, pl: Record<number, Row>, cf: Record<number, Row>): Row[] {
  const { r, n } = x, m = r.construction.months, f = r.funds, gst = r.gst, bd = r.bookDep
  const none = { total: false as const }
  /** A movement (a flow: D total = Σ) or, with `none`, a balance. */
  const fin = (id: string, label: string, values: number[], v16: number, formula: string, o: { flip?: boolean; total?: false } = {}) =>
    x.fin(id, label, values, v16, formula, o)
  /** Opening = previous FY's closing of `v16`. */
  const opening = (id: string, closing: number[], v16: number) => line(`${id}.open`, 'Opening balance', previous(closing),
    { ...none, formula: 'Previous FY\'s closing balance', source: `Fin-IGAAP!${v16}, previous FY` })
  /** A movement equal to a CF line (`flip` for an asset: a CF application − is an increase +). */
  const move = (id: string, label: string, cfRow: number, flip = false) =>
    fin(`${id}.cf${cfRow}`, label, flip ? neg(cf[cfRow].values) : cf[cfRow].values, cfRow, `Cash flow row ${cfRow} in the FY`, { flip })
  /** A balance line with its roll-forward children. */
  const bal = (id: string, num: string, label: string, closing: number[], v16: number, formula: string, moves: Row[], open?: Row) =>
    x.fin(id, label, closing, v16, formula, { num, ...none, children: [open ?? opening(id, closing, v16), ...moves] })
  // V16 reads the balance at the period ending on the FY end (SUMIF on COP-MOF r8).
  const atFyEnd = (s: number[]) => { const b = new Map(r.grid.periods.map((p, k) => [p.end, s[k]])); return r.grid.fys.map((d) => b.get(d) ?? 0) }
  const stl = atFyEnd(m.map((v) => v.stlBalance))
  const zero = (id: string, num: string, label: string, v16: number, why: string, moves: Row[]) =>
    bal(id, num, label, x.zero(), v16, `0: ${why}`, moves)

  const liabilities = [
    bal('bs.A.1', 'A.1', 'Equity Share Capital', cumulative(cf[69].values), 40, 'Share capital drawn to date',
      [move('bs.A.1', 'Drawn in the FY', 69)]),
    bal('bs.A.2', 'A.2', 'Equity - USL', cumulative(cf[70].values), 41, 'Unsecured loan drawn to date', [move('bs.A.2', 'Drawn in the FY', 70)]),
    bal('bs.A.3', 'A.3', 'Reserves & Surplus', cumulative(pl[36].values), 42, 'Profit after tax to date (no dividends)',
      [x.fin('bs.A.3.pat', 'Profit after tax', pl[36].values, 36, 'P&L F. for the FY')]),
    zero('bs.A.4', 'A.4', 'Equity - IDC', 43, 'no separate IDC equity in V16', [move('bs.A.4', 'Drawn in the FY', 71)]),
    zero('bs.A.5', 'A.5', 'Equity - DSR', 44, 'no separate DSR equity in V16', [move('bs.A.5', 'Drawn in the FY', 72)]),
    zero('bs.A.6', 'A.6', 'Equity - Working Capital', 45, 'no separate working-capital equity in V16', [move('bs.A.6', 'Drawn in the FY', 73)]),
    zero('bs.A.7', 'A.7', 'Equity - Contingency', 46, 'no separate contingency equity in V16', [move('bs.A.7', 'Drawn in the FY', 74)]),
    bal('bs.A.8', 'A.8', 'Senior Debt', r.debt.closing, 47,
      'Before the COD year the construction balance at the FY-end month, then the annual debt schedule closing',
      [move('bs.A.8', 'Drawn in the FY', 75), move('bs.A.8', 'Repaid in the FY', 111)]),
    bal('bs.A.9', 'A.9', 'Short Term Debt', stl, 48, 'STL balance at the FY-end month',
      [move('bs.A.9', 'Drawn in the FY', 76), move('bs.A.9', 'Repaid in the FY', 85)]),
    zero('bs.A.10', 'A.10', 'Mobilization Advance from Authority', 49, 'V16 takes an STL instead',
      [move('bs.A.10', 'Received in the FY', 77), move('bs.A.10', 'Repaid in the FY', 87)]),
    zero('bs.A.11', 'A.11', 'Long Term Provision - MM', 50, 'major-maintenance provisioning is off in V16', [
      fin('bs.A.11.cr', 'Provision Created', x.zero(), 394, '0'), fin('bs.A.11.mm', 'MM Expense', x.zero(), 395, '0')]),
    zero('bs.A.12', 'A.12', 'Interim Debt', 51, 'no interim debt in V16', [move('bs.A.12', 'Drawn in the FY', 81),
      move('bs.A.12', 'Repaid in the FY (construction)', 91), move('bs.A.12', 'Repaid in the FY (operation)', 116)]),
  ]
  const liab = total('bs.r52', 'Total Liabilities', liabilities.map((c) => under('bs.r52', c)),
    { ...none, source: src(52), formula: 'A.1 to A.12' })

  const dsr = add(f.dsrInterest.closing, f.dsrPrincipal.closing)
  const assets = [
    bal('bs.B.1', 'B.1', 'Intangible Asset', bd.closing, 54, 'Cumulative additions less cumulative book amortisation', [
      x.fin('bs.B.1.add', 'Addition', bd.addition, 239, 'Capitalised construction cost by line, less the grant with PIM',
        { children: [...capitalisedByLine(x, 'bs.B.1.add', 1), line('bs.B.1.add.grant', 'Less: Grant (with PIM)',
          neg(r.capitalised.grantByFy), { formula: 'Grant with PIM ex-GST, in the FY of each tranche', source: 'DB!84 by DB!78' })] }),
      fin('bs.B.1.dep', 'Depreciation', neg(bd.depreciation), 240, 'Book amortisation (P&L D.1)'),
    ], fin('bs.B.1.open', 'Opening Balance', bd.opening, 238, 'Previous FY\'s closing balance', none)),
    bal('bs.B.2', 'B.2', 'GST Credit', gst.creditClosing, 55, 'GST input credit not yet set off against output GST', [
      fin('bs.B.2.cp', 'GST on CP Period Expenses', gst.inputCp, 366, 'Input GST on construction costs'),
      fin('bs.B.2.om', 'GST on O&M Expenses', gst.inputOps.om, 367, 'Input GST on IE fee, FLC, insurance'),
      fin('bs.B.2.rm', 'GST on RM', gst.inputOps.rm, 368, 'Input GST on routine maintenance'),
      fin('bs.B.2.mm', 'GST on MM', gst.inputOps.mm, 369, 'Input GST on major maintenance'),
      fin('bs.B.2.el', 'GST on Electricity', gst.inputOps.electricity, 370, 'Input GST on electricity'),
      fin('bs.B.2.used', 'GST Credit Utilized', neg(add(gst.creditUsedCp, gst.creditUsedOps)), 371, 'Set off against output GST'),
      fin('bs.B.2.wo', 'GST Written Off to Profit & Loss Account', neg(gst.writeOff), 372, 'Credit left at the concession end'),
    ], fin('bs.B.2.open', 'Opening GST Credit', gst.creditOpening, 365, 'Previous FY\'s closing credit', none)),
    bal('bs.B.3', 'B.3', 'Mobilization Advance to EPC Contractor', stl, 56,
      'Advance with the EPC contractor at the FY-end month (back-to-back with the STL)',
      [move('bs.B.3', 'Paid in the FY', 86, true), move('bs.B.3', 'Recovered in the FY', 78, true)]),
    bal('bs.B.4', 'B.4', 'DSR Fund', dsr, 57, 'Interest DSR + principal DSR closing balances',
      [move('bs.B.4', 'Funded from project cost', 89, true), move('bs.B.4', 'Created/(released)', 112, true)]),
    bal('bs.B.5', 'B.5', 'MMR Fund', f.mmr.closing, 58, 'Major maintenance reserve closing balance', [
      fin('bs.B.5.set', 'Add: Fund Set Aside for Expenditure', f.mmr.setAside, 285, 'Share of the coming major maintenance'),
      fin('bs.B.5.used', 'Less: Expenditure Incurred', neg(f.mmr.used), 286, 'Major maintenance paid from the MMR'),
    ], fin('bs.B.5.open', 'Opening Balance', f.mmr.opening, 284, 'Previous FY\'s closing balance', none)),
    bal('bs.B.6', 'B.6', 'Funds for Expenses', f.ffe.closing, 59, 'Interest + O&M + tax expense-fund closing balances', [
      fin('bs.B.6.cop', 'Add :Funded through COP', f.ffe.funded, 292, 'Funded from the project cost'),
      fin('bs.B.6.set', 'Add :  Funds set aside to reserve', f.ffe.setAside, 293, 'Closing requirement − funded − opening + used'),
      fin('bs.B.6.used', 'Less: Utilization towards expenditure', neg(f.ffe.used), 294, 'Interest, O&M and tax paid from the fund'),
    ], fin('bs.B.6.open', 'Opening Balance', f.ffe.opening, 291, 'Previous FY\'s closing balance', none)),
    zero('bs.B.7', 'B.7', 'PSBG/MABG/ASPBG Margin Deposit', 60, 'the EPC contractor provides the guarantees in V16',
      [move('bs.B.7', 'Deposited in the FY', 90, true)]),
    bal('bs.B.8', 'B.8', 'Cash in Bank', r.cash.closing, 61, 'Closing cash of the cash flow statement (no distributions)', [
      fin('bs.B.8.in', 'Total Cash Inflow', cf[119].values, 119, 'All cash sources in the FY'),
      fin('bs.B.8.out', 'Total Cash outflow', cf[120].values, 120, 'All cash applications in the FY'),
    ], fin('bs.B.8.open', 'Opening Balance', r.cash.opening, 118, 'Previous FY\'s closing cash', none)),
  ]
  const ast = total('bs.r62', 'Total Assets', assets.map((c) => under('bs.r62', c)), { ...none, source: src(62), formula: 'B.1 to B.8' })
  const round4 = (v: number) => Math.round(v * 1e4) / 1e4 || 0 // V16 ROUND(…, 4); `|| 0` turns −0 into 0
  return [
    x.header('bs.A', 'LIABILITIES', 39, 'A.'), ...liabilities, liab, x.header('bs.B', 'ASSETS', 53, 'B.'), ...assets, ast,
    check('bs.r63', 'BS Check', liab.values.map((v, k) => round4(v - ast.values[k])),
      { source: src(63), formula: 'Total Liabilities − Total Assets, rounded to 4 places; 0 every FY' }),
    check('bs.r64', 'Cash Balance Check', r.cash.closing.slice(0, n).map((v) => +(round4(v) < 0)),
      { source: src(64), formula: '1 where cash in bank is below 0' }),
  ]
}
