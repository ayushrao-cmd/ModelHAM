import { afterTax } from '../../model'
import { CAPITALISED_ROWS, type CapitalisedKey } from '../../tax'
import type { IgaapProfit, Row } from '../../types'
import { CAPITALISED_LABELS } from '../igaap/cf'
import { byRow, fmtDate } from '../igaap/context'
import { add, leaves, line, neg, subtotal, total, under } from '../row'
import type { Ctx } from './context'
import type { FinancialAsset } from './fa'

const ROW = Object.fromEntries(Object.entries(CAPITALISED_ROWS).map(([v16, key]) => [key, +v16])) as
  Record<CapitalisedKey, keyof typeof CAPITALISED_ROWS>

/** Fin-INDAS r8–r49 (C-statements §3.1, §5). `rows` in V16 order; `at` by V16 row; `profit` the IndAS CSR working. */
export function profitAndLoss(x: Ctx, fa: FinancialAsset): { rows: Row[]; at: Record<number, Row>; profit: IgaapProfit } {
  const { r, n, fin, ig, copy } = x, cap = r.capitalised.lines
  const constant = (v: number) => Array<number>(n).fill(v)
  /** One child per construction month with a non-zero amount, in the FY of the month's end. */
  const byMonth = (id: string, s: number[], what: string, v16: string) => r.grid.periods.flatMap((p, k) => (s[k]
    ? [line(`${id}.m${k + 1}`, `Month ending ${fmtDate(p.end)}`, x.at(s[k], p.end),
      { formula: `${what} in the month, in the FY of its end`, source: `${v16}, month ${k + 1}` })] : []))

  // A.1 notional income → construction revenue (= EPC cost, by month) + financing income on the financial asset.
  const epc = cap.epcFixed.map((v, k) => v + cap.epcVariable[k])
  const a1Parts = [
    fin('pl.A.1.r402', 'Construction Cost', fa.addition, 402,
      'Notional construction revenue at zero margin: EPC fixed + variable cost ex-GST in the FY',
      { children: byMonth('pl.A.1.r402', epc, 'EPC fixed + variable cost ex-GST', 'COP-MOF!322 + COP-MOF!323') }),
    fin('pl.A.1.r405', 'Financing Income', fa.financeIncome, 405,
      `Opening financial asset × ${(fa.rate * 100).toFixed(4)} % (the IRR of 60% receipts + grant − EPC cost)`),
  ]
  const a1 = fin('pl.A.1', 'Notional Income as per IndAS', add(...a1Parts.map((c) => c.values)), 9,
    'Construction revenue (= EPC cost) + financing income on the financial asset; the 60% instalments reduce the asset',
    { num: 'A.1.', children: a1Parts })
  const a = [a1,
    copy('pl.A.2', 10, ig(9), 'Same as IGAAP A.2', { num: 'A.2' }),
    copy('pl.A.3', 11, ig(10), 'Same as IGAAP A.3', { num: 'A.3' }),
    copy('pl.A.4', 12, ig(11), 'Same as IGAAP A.4', { num: 'A.4' }),
    copy('pl.A.5', 13, ig(12), 'Same as IGAAP A.5', { num: 'A.5' }),
  ]
  const revenue = subtotal('pl.r14', 'Total Revenue', a.map((c) => under('pl.r14', c)),
    { source: x.src(14), formula: 'A.1 to A.5 (the 60% receipts are not revenue)' })

  // B.1–B.9: construction-period costs expensed, ex-GST, by COP-MOF use line (COP-MOF r348..r359).
  const cp = (id: string, num: string, label: string, v16: number, keys: CapitalisedKey[], formula: string) => {
    const parts = keys.map((k) => line(`${id}.${k}`, CAPITALISED_LABELS[ROW[k]], neg(x.byPeriod(cap[k])),
      { formula: 'Cost of this use line ex-GST, Σ of its construction months in the FY', source: `COP-MOF!${ROW[k]} by FY` }))
    return fin(id, label, add(...parts.map((c) => c.values)), v16, formula, { num, ...(keys.length > 1 && { children: parts }) })
  }
  const b = [
    cp('pl.B.1', 'B.1.', 'Construction Cost', 16, ['epcFixed', 'epcVariable'], 'EPC fixed + variable cost ex-GST, expensed'),
    fin('pl.B.2', 'Interest on Mobilization Advance to Authority', x.zero(), 17, '0: V16 takes an STL instead', { num: 'B.2.' }),
    cp('pl.B.3', 'B.3.', 'Interest on Mobilization Advance from  EPC', 18, ['maInterestFromEpc'],
      'Interest recovered from the EPC contractor on the mobilisation advance (a credit; offsets C.2)'),
    cp('pl.B.4', 'B.4.', 'IMV Capital Cost', 19, ['imvCapital'], 'IMV capital cost ex-GST, expensed'),
    cp('pl.B.5', 'B.5.', 'Pre Operative Expenses', 20, ['preBid', 'spvFormation'], 'Pre-bid and SPV formation cost ex-GST'),
    cp('pl.B.6', 'B.6.', 'IE Fee', 21, ['ieFee'], 'Construction-period IE fee ex-GST'),
    cp('pl.B.7', 'B.7.', 'IMV Vehicle Rental', 22, ['spvManpower', 'admin', 'imvRental'],
      'SPV manpower + administration + IMV rental ex-GST (V16 labels it IMV Vehicle Rental)'),
    cp('pl.B.8', 'B.8.', 'Finance & Legal Expenses', 23, ['fundRaising', 'financeLegal', 'psbgCommission'],
      'Fund raising + finance, legal & compliance + PSBG commission ex-GST'),
    cp('pl.B.9', 'B.9.', 'Contingency', 24, ['contingency'], 'Contingency ex-GST, expensed'),
    ...[15, 16, 17, 18, 19, 20, 21, 22, 23, 24].map((v16, j) =>
      copy(`pl.B.${10 + j}`, 25 + j, ig(v16), `Same as IGAAP ${ig(v16).num}`, { num: `B.${10 + j}.` })),
  ]
  const expense = subtotal('pl.r35', 'Total Expense', b.map((c) => under('pl.r35', c)),
    { source: x.src(35), formula: 'B.1 to B.19' })
  const ebidta = total('pl.C', 'EBIDTA', leaves('pl.C', [revenue, expense]),
    { num: 'C.', source: x.src(36), formula: 'Total Revenue + Total Expense' })

  // C.1–C.3: construction-period interest expensed (IDC, STL); C.4 the operation-period interest as IGAAP.
  const idc = cap.idc
  const c = [
    fin('pl.C.1', 'Less -  Interest -Senior Debt', neg(x.byPeriod(idc)), 37,
      'Interest during construction, expensed (IGAAP capitalises it)',
      { num: 'C.1.', children: byMonth('pl.C.1', neg(idc), 'IDC on the average senior-debt balance', 'COP-MOF!338') }),
    fin('pl.C.2', 'Less -  Interest -STL', neg(x.byPeriod(cap.stlInterest)), 38, 'Short-term loan interest, expensed',
      { num: 'C.2.' }),
    fin('pl.C.3', 'Less -  Interest - Interim Debt', x.zero(), 39, '0: no interim debt in V16', { num: 'C.3.' }),
    copy('pl.C.4', 40, ig(27), 'Same as IGAAP C.1: senior-debt interest after COD', { num: 'C.4.' }),
  ]
  const c5 = fin('pl.C.5', 'Less -  Interest - Equity - USL', Array<number>(n).fill(NaN), 41,
    'Blank in V16: the unsecured loan is interest-free', { num: 'C.5.' })
  const c6 = fin('pl.C.6', 'Less -  Interest - Interim Debt', x.zero(), 42, '0: no interim debt in V16', { num: 'C.6.' })
  const interest = subtotal('pl.r43', 'Total Interest', [...c, c6].map((p) => under('pl.r43', p)),
    { source: x.src(43), formula: 'C.1 to C.6 (C.5 blank)' })
  const ebdta = total('pl.D', 'EBDTA', leaves('pl.D', [ebidta, interest]),
    { num: 'D.', source: x.src(44), formula: 'EBIDTA + Total Interest' })
  const dep = fin('pl.r45', 'Less -  Depreciation as per Books', x.zero(), 45,
    '0: nothing is depreciated; the financial asset replaces the intangible')
  const pbt = total('pl.E', 'Profit Before Tax', leaves('pl.E', [ebdta, dep]),
    { num: 'E.', source: x.src(46), formula: 'EBDTA + depreciation (0)' })

  // CSR on IndAS figures (PBT, turnover incl. notional income, PAT, net worth = share capital + IndAS reserves).
  const tax = r.tax.tax
  const { profit } = afterTax(r.inputs, r.grid, r.construction, revenue.values, pbt.values, tax, 'indas')
  const cd = profit.csrDetail
  const flag = (id: string, label: string, s: number[], v16: number, what: string) =>
    fin(`pl.r47.${id}`, label, s, v16, `1 if the previous FY's ${what}`, { unit: 'count' })
  const csr = fin('pl.r47', 'Less- CSR', neg(profit.csr), 47,
    'CSR as IGAAP on IndAS figures: 2% of the average IndAS PBT of the 3 preceding FYs, when the previous FY passes a '
    + 'net-worth, turnover or profit test (never cut off by date: V16 quirk B-Q12)', { additive: false, children: [
      flag('nw', 'Net worth', cd.netWorthTest, 389, `net worth (share capital + IndAS reserves) > ${r.inputs.csr.netWorth}`),
      flag('to', 'Turnover', cd.turnoverTest, 390, `total revenue (incl. notional income) > ${r.inputs.csr.turnover}`),
      flag('np', 'Net Profit (PAT)', cd.profitTest, 391, `IndAS PAT > ${r.inputs.csr.profit}`),
      fin('pl.r47.app', 'Applicability', cd.applicable, 392, '1 if any of the three tests holds', { unit: 'count' }),
      fin('pl.r47.pbt', 'Profit Before Tax', pbt.values, 394, 'IndAS PBT (E.)'),
      line('pl.r47.avg', 'Average PBT of the 3 preceding FYs', cd.averagePbt, { total: false,
        formula: 'AVERAGE of IndAS PBT in up to 3 preceding FYs, losses included', source: 'AVERAGE of Fin-INDAS!394, 3 preceding FYs' }),
      line('pl.r47.rate', 'CSR rate', constant(r.inputs.csr.rate), { total: false, unit: 'pct', formula: 'CSR share of average PBT', source: "'Fin Set'!L11" }),
      fin('pl.r47.amt', 'CSR Expenditure', cd.amount, 395, 'Applicability × MAX(rate × average PBT, 0)'),
    ] })
  const taxation = copy('pl.r48', 48, ig(35), 'IGAAP current tax copied (−Fin-IGAAP!268); no deferred tax',
    { label: 'Less- Taxation' })
  const pat = total('pl.F', 'Profit after tax', leaves('pl.F', [pbt, csr, taxation]),
    { num: 'F.', source: x.src(49), formula: 'PBT + CSR + taxation' })

  const rows = [x.header('pl.A', 'Revenue', 8, 'A.'), ...a, revenue, x.header('pl.B', 'Operational Cost', 15, 'B.'), ...b,
    expense, ebidta, ...c, c5, c6, interest, ebdta, dep, pbt, csr, taxation, pat]
  return { rows, at: byRow(rows), profit }
}
