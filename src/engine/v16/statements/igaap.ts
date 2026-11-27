import type { StatementSet, V16Result } from '../types'
import { balanceSheet } from './igaap/bs'
import { cashFlow } from './igaap/cf'
import { context } from './igaap/context'
import { dscr, irr } from './igaap/dscr-irr'
import { profitAndLoss } from './igaap/pl'

/**
 * The V16 Fin-IGAAP statements (C-statements §2, §4, §6.1, §8): P&L, balance sheet, direct cash flow, DSCR and IRR,
 * with V16's rows, labels, numbering and signs, per FY of the grid plus V16's D total, each row drilling down to its
 * sources. Built from the engine result only; one module per statement under `igaap/`.
 */
export function buildIgaap(r: V16Result): StatementSet {
  const x = context(r)
  const pl = profitAndLoss(x), cf = cashFlow(x, pl.at), bs = balanceSheet(x, pl.at, cf.at)
  const check = (src: string) => bs.find((row) => row.source === src)!.values
  return {
    standard: 'igaap', years: r.grid.fys,
    statements: [
      { key: 'pl', title: 'Profit and Loss Statement, as per IGAAP', rows: pl.rows },
      { key: 'bs', title: 'Balance Sheet as per IGAAP', rows: bs },
      { key: 'cf', title: 'Cash Flow Statement as per Direct Method', rows: cf.rows },
      { key: 'dscr', title: 'Debt Service Coverage Ratio', rows: dscr(x) },
      { key: 'irr', title: 'PROJECT & EQUITY IRR', rows: irr(x, cf.at) },
    ],
    checks: { bs: check('Fin-IGAAP!63'), cash: check('Fin-IGAAP!64') },
  }
}
