import type { StatementSet, V16Result } from '../types'
import { balanceSheet } from './indas/bs'
import { cashFlow } from './indas/cf'
import { context } from './indas/context'
import { dscr, irr } from './indas/dscr-irr'
import { financialAsset } from './indas/fa'
import { profitAndLoss } from './indas/pl'

export { financialAsset, type FinancialAsset } from './indas/fa'

/**
 * The V16 Fin-INDAS statements (C-statements §3, §5, §6.2, §8): P&L, balance sheet, cash flow, DSCR and IRR with
 * V16's rows, labels, numbering and signs. The financial-asset model: notional construction revenue = EPC cost (zero
 * margin) plus financing income, construction-period costs, IDC and STL interest expensed, no depreciation, IGAAP tax
 * copied (no deferred tax), CSR on IndAS figures. Lines both standards share copy the IGAAP rows and their drill-down.
 */
export function buildIndas(r: V16Result): StatementSet {
  const x = context(r), fa = financialAsset(r)
  const pl = profitAndLoss(x, fa), cf = cashFlow(x, pl.at), bs = balanceSheet(x, pl.at, cf.at, fa), d = dscr(x, pl.at, cf.at)
  const check = (src: string) => bs.find((row) => row.source === src)!.values
  return {
    standard: 'indas', years: r.grid.fys,
    statements: [
      { key: 'pl', title: 'Profit and Loss Statement, as per IndAS', rows: pl.rows },
      { key: 'bs', title: 'Balance Sheet as per IndAS', rows: bs },
      { key: 'cf', title: 'Cash Flow Statement', rows: cf.rows },
      { key: 'dscr', title: 'Debt Service Coverage Ratio', rows: d },
      { key: 'irr', title: 'PROJECT & EQUITY IRR', rows: irr(x, pl.at, cf.at, d) },
    ],
    checks: { bs: check('Fin-INDAS!76'), cash: check('Fin-INDAS!77') },
  }
}
