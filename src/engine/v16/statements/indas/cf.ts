import type { Row } from '../../types'
import { add, leaves, previous, subtotal, total, under } from '../row'
import { byRow } from '../igaap/context'
import type { Ctx } from './context'

/** Fin-INDAS r80–r137 (C-statements §3.3). As IGAAP except construction cost split into the expensed P&L lines (B.1 to
 *  B.9, IDC, STL interest) and IndAS CSR; `at` by V16 row for the BS, DSCR and IRR. */
export function cashFlow(x: Ctx, pl: Record<number, Row>): { rows: Row[]; at: Record<number, Row> } {
  const { fin, ig, copy } = x
  const same = (id: string, num: string, v16: number, igaap: number, label?: string) =>
    copy(id, v16, ig(igaap), `Same as IGAAP cash flow ${ig(igaap).num}`, { num, ...(label && { label }) })
  /** A CF line equal to P&L lines `rows` (one: its drill-down; several: the lines themselves). */
  const fromPl = (id: string, num: string, label: string, v16: number, rows: number[], formula: string) => {
    const one = rows.length === 1 ? pl[rows[0]] : undefined
    return fin(id, label, add(...rows.map((p) => pl[p].values)), v16, formula, { num, additive: one?.additive,
      children: one ? one.children?.map((c) => under(id, c)) : rows.map((p) => under(id, pl[p])) })
  }
  const zero = (id: string, num: string, label: string, v16: number, why: string) => fin(id, label, x.zero(), v16, `0: ${why}`, { num })

  const sources = [
    same('cf.A.1.1', '1', 82, 69), same('cf.A.1.2', '2.', 83, 70), same('cf.A.1.3', '3.', 84, 71),
    same('cf.A.1.4', '4.', 85, 72), same('cf.A.1.5', '5.', 86, 73), same('cf.A.1.6', '6.', 87, 74),
    same('cf.A.1.7', '7.', 88, 75), same('cf.A.1.8', '8.', 89, 76),
    same('cf.A.1.9', '9.', 90, 77, 'Mobilization Advance Received from Authority'),
    same('cf.A.1.10', '10.', 91, 78, 'Mobilization Advance Received back from EPC Contractor'),
    same('cf.A.1.11', '11.', 92, 79, 'Add - Grant Received'), same('cf.A.1.12', '12.', 93, 80, 'GST Output Collected'),
    same('cf.A.1.13', '13.', 94, 81),
  ]
  const applications = [
    fromPl('cf.A.2.1', '1.', 'Construction Period Cost', 96, [16, 17, 18, 19, 20, 21, 22, 23, 24],
      'P&L B.1 to B.9 (construction-period costs ex-GST; the EPC part builds the financial asset)'),
    same('cf.A.2.2', '2.', 97, 84), same('cf.A.2.3', '3.', 98, 85),
    same('cf.A.2.4', '4.', 99, 86, 'Mobilization Advance to EPC Contractor'),
    same('cf.A.2.5', '5.', 100, 87, 'Mobilization Advance repaid to the Authority'),
    same('cf.A.2.6', '6.', 101, 88), same('cf.A.2.7', '7.', 102, 89),
    fromPl('cf.A.2.8', '8.', 'Interest During Construction', 103, [37], 'P&L C.1 (IDC paid)'),
    fromPl('cf.A.2.9', '9.', 'Interest on STL', 104, [38], 'P&L C.2'),
    zero('cf.A.2.10', '10.', 'Additions in Fixed Assets', 105, 'no fixed assets under IndAS'),
    same('cf.A.2.11', '11.', 106, 90), same('cf.A.2.12', '12.', 107, 91),
  ]
  const opSources = [
    same('cf.B.1.A.1', '1', 111, 95, 'Receipt from Authority-60% of Completion Cost'),
    same('cf.B.1.A.2', '2.', 112, 96), same('cf.B.1.A.3', '3.', 113, 97), same('cf.B.1.A.4', '4.', 114, 98),
    same('cf.B.1.A.5', '5.', 115, 99),
  ]
  const otherSources = [same('cf.B.1.B.6', '6.', 117, 101, 'GST Output Collected')]
  const opApps = [
    fromPl('cf.B.2.A.1', '1', 'Operation Period Expenses', 120, [25, 26, 27, 28, 29, 30, 31, 32], 'P&L B.10 to B.17'),
    fromPl('cf.B.2.A.2', '2', 'Interest Expenses', 121, [40], 'P&L C.4 (C.5 and C.6 are 0)'),
    fromPl('cf.B.2.A.3', '3', 'CSR', 122, [47], 'Same as P&L IndAS CSR (paid in the year)'),
    fromPl('cf.B.2.A.4', '4', 'Income Tax', 123, [48], 'Same as P&L taxation (paid in the year it is charged)'),
  ]
  const otherApps = [109, 110, 111, 112, 113, 114, 115, 116].map((igaap, j) => same(`cf.B.2.B.${6 + j}`, `${6 + j}`, 125 + j, igaap))

  const inLines = [...sources, ...opSources, ...otherSources], outLines = [...applications, ...opApps, ...otherApps]
  const inflow = subtotal('cf.C.r135', 'Total Cash Inflow', leaves('cf.C.r135', inLines),
    { source: x.src(135), formula: 'Construction sources 1–13 + operation sources 1–6' })
  const outflow = subtotal('cf.C.r136', 'Total Cash outflow', leaves('cf.C.r136', outLines),
    { source: x.src(136), formula: 'Construction applications 1–12 + operation applications 1–13' })
  let cash = 0
  const closingValues = inflow.values.map((v, k) => (cash += v + outflow.values[k]))
  const opening = fin('cf.C.r134', 'Opening Balance', previous(closingValues), 134, 'Previous FY\'s closing cash',
    { total: 0 })
  const closing = total('cf.C.r137', 'Closing Cash Balance', [under('cf.C.r137', opening, false), under('cf.C.r137', inflow),
    under('cf.C.r137', outflow)], { source: x.src(137), formula: 'Opening + inflow + outflow (= BS Cash in Bank)',
    total: inflow.total + outflow.total })

  const h = x.header
  const rows = [
    h('cf.A', 'Construction Period', 80, 'A'), h('cf.A.1', 'Sources of Funds', 81, 'A.1'), ...sources,
    h('cf.A.2', 'Applications of Funds', 95, 'A.2'), ...applications,
    h('cf.B', 'Operation Period', 108, 'B'), h('cf.B.1', 'SOURCES OF CASH', 109, 'B.1'),
    h('cf.B.1.A', 'Operating Sources of Funds', 110, 'A'), ...opSources,
    h('cf.B.1.B', 'Other Sources of Funds', 116, 'B'), ...otherSources,
    h('cf.B.2', 'APPLICATION OF CASH', 118, 'B.2'), h('cf.B.2.A', 'Operating Expenses', 119, 'A'), ...opApps,
    h('cf.B.2.B', 'Other Application of Funds', 124, '5'), ...otherApps,
    h('cf.C', 'Cash Account', 133, 'C.'), opening, inflow, outflow, closing,
  ]
  return { rows, at: byRow(rows) }
}
