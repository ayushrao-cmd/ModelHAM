import type { Row } from '../../types'
import { check, cumulative, line, previous, total, under } from '../row'
import type { Ctx } from './context'
import type { FinancialAsset } from './fa'

/**
 * Fin-INDAS r52–r77 (C-statements §3.2, §6.2), closing balances at FY end (no D total). As IGAAP except reserves (Σ
 * IndAS PAT), the financial asset in place of the intangible and IndAS cash; each line drills down to its roll-forward.
 */
export function balanceSheet(x: Ctx, pl: Record<number, Row>, cf: Record<number, Row>, fa: FinancialAsset): Row[] {
  const { fin, ig, copy } = x, none = { total: false as const }
  const same = (v16: number, igaap: number) => copy(`bs.r${v16}`, v16, ig(igaap), `Same as IGAAP ${ig(igaap).num}`)

  const reserves = cumulative(pl[49].values)
  const liabilities = [same(53, 40), same(54, 41),
    fin('bs.r55', 'Reserves & Surplus', reserves, 55, 'IndAS profit after tax to date (no dividends)', { ...none, children: [
      line('bs.r55.open', 'Opening balance', previous(reserves),
        { ...none, formula: 'Previous FY\'s closing balance', source: 'Fin-INDAS!55, previous FY' }),
      fin('bs.r55.pat', 'Profit after tax', pl[49].values, 49, 'P&L F. for the FY'),
    ] }),
    ...[56, 57, 58, 59, 60, 61, 62, 63, 64].map((v16) => same(v16, v16 - 13)),
  ]
  const liab = total('bs.r65', 'Total Liabilities', liabilities.map((c) => under('bs.r65', c)),
    { ...none, source: x.src(65), formula: 'Σ liabilities r53 to r64' })

  const assets = [
    fin('bs.r67', 'Financial Asset', fa.closing, 67,
      'Opening + EPC cost (notional revenue) − grant − 60% instalments + financing income; 0 at the last FY',
      { ...none, children: [
        fin('bs.r67.open', 'Opening Balance', fa.opening, 401, 'Previous FY\'s closing balance', none),
        fin('bs.r67.add', 'Construction Cost', fa.addition, 402, 'EPC fixed + variable cost ex-GST'),
        fin('bs.r67.grant', 'Grant From Authority - 40%', fa.grant, 403, 'Grant with PIM ex-GST, in the FY of each tranche'),
        fin('bs.r67.receipt', 'Annuity Payment - 60 %', fa.receipt, 404, 'Completion-cost instalments received in the FY'),
        fin('bs.r67.income', 'Financing Income', fa.financeIncome, 405, 'Opening balance × the financial-asset rate'),
      ] }),
    ...[68, 69, 70, 71, 72, 73].map((v16) => same(v16, v16 - 13)),
    fin('bs.r74', 'Cash in Bank', cf[137].values, 74, 'Closing cash of the IndAS cash flow (IGAAP cash less the extra CSR)',
      { ...none, children: [
        fin('bs.r74.open', 'Opening Balance', cf[134].values, 134, 'Previous FY\'s closing cash',
          { total: 0 }), // V16's D134 is a typed 0
        fin('bs.r74.in', 'Total Cash Inflow', cf[135].values, 135, 'All cash sources in the FY'),
        fin('bs.r74.out', 'Total Cash outflow', cf[136].values, 136, 'All cash applications in the FY'),
      ] }),
  ]
  const ast = total('bs.r75', 'Total Assets', assets.map((c) => under('bs.r75', c)),
    { ...none, source: x.src(75), formula: 'Σ assets r67 to r74' })
  const round4 = (v: number) => Math.round(v * 1e4) / 1e4 || 0 // V16 ROUND(…, 4); `|| 0` turns −0 into 0
  return [
    x.header('bs.A', 'LIABILITIES', 52, 'A.'), ...liabilities, liab, x.header('bs.B', 'ASSETS', 66, 'B.'), ...assets, ast,
    check('bs.r76', 'BS Check', liab.values.map((v, k) => round4(v - ast.values[k])),
      { source: x.src(76), formula: 'Total Liabilities − Total Assets, rounded to 4 places; 0 every FY' }),
    check('bs.r77', 'Cash Balance Check', cf[137].values.map((v) => +(round4(v) < 0)),
      { source: x.src(77), formula: '1 where cash in bank is below 0' }),
  ]
}
