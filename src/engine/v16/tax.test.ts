import { describe, it, expect } from 'vitest'
import { addMonths, fyEnd } from '../dates'
import { row, inputsFor, expectSeries, expectClose, opsFor } from './golden'
import { buildGrid } from './grid'
import { grantSchedule, runConstruction } from './construction'
import { runRevenue } from './revenue'
import { runOpex } from './opex'
import { runDebt } from './debt'
import { runFunds } from './funds'
import { runGst } from './gst'
import { CAPITALISED_ROWS, bookDepreciation, capitalisedCost, csr, igaapProfit, runTax, taxDepreciation } from './tax'

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const neg = (a: number[]) => a.map((v) => -v)
const TOL = 1e-5 // plan: ₹0.01 Cr per FY cell; opex carries ~1e-6 into PBT, the rest match to ~1e-8

/** Funds take tax (−Fin-IGAAP r35) and cash for DSCR (r136) from golden until Task 13 closes the loops. */
const setup = (set: string) => {
  const i = inputsFor(set), g = buildGrid(i), c = runConstruction(i, g, opsFor(set))
  const rev = runRevenue(i, g, c), opex = runOpex(i, g, sum(grantSchedule(i, g).pim)), debt = runDebt(i, g, c)
  const funds = runFunds(i, g, c, rev, opex, debt, neg(row(set, 'Fin-IGAAP!35').values), row(set, 'Fin-IGAAP!136').values)
  const gst = runGst(g, c, rev, opex)
  const cap = capitalisedCost(c, g), book = bookDepreciation(cap, rev, g), itDep = taxDepreciation(cap, g, i)
  const pl = igaapProfit(g, rev, opex, debt, gst, funds, book.depreciation)
  const tax = runTax(i, g, pl.pbt, book.depreciation, itDep.depreciation)
  return { i, g, c, cap, book, itDep, pl, tax }
}

for (const set of ['sample', 'bid2400', 'epc105', 'build1460', 'equity30', 'rates50bp', 'equated']) {
  describe(`v16 tax: ${set}`, () => {
    const { i, g, cap, book, itDep, pl, tax } = setup(set)
    const r = (n: number) => row(set, `Fin-IGAAP!${n}`)
    const ind = (n: number) => row(set, `Fin-INDAS!${n}`)

    it('capitalised cost ex-GST: COP-MOF rows 322–342 and 345 by period', () => {
      for (const [n, key] of Object.entries(CAPITALISED_ROWS))
        expectSeries(cap.lines[key], row(set, `COP-MOF!${n}`), TOL, `COP-MOF r${n} ${key}`)
      for (const n of [324, 336, 337, 340, 341]) expect(row(set, `COP-MOF!${n}`).values.every((v) => v === 0)).toBe(true)
      expectSeries(cap.total, row(set, 'COP-MOF!345'), TOL, 'r345')
      expectClose(sum(cap.total), row(set, 'COP-MOF!345').total, TOL, 'G345')
    })

    it('intangible additions: Fin-IGAAP r239 by FY and D239', () => {
      expectSeries(cap.additions, r(239), TOL, 'r239')
      expectClose(sum(cap.additions), r(239).total, TOL, 'D239')
      if (set === 'sample') expectClose(sum(cap.additions), 1047.307348908053, 1e-6, 'D239 sample')
    })

    it('book depreciation: rows 238–241', () => {
      expectSeries(book.opening, r(238), TOL, 'r238')
      expectSeries(book.addition, r(239), TOL, 'r239')
      expectSeries(neg(book.depreciation), r(240), TOL, 'r240')
      expectSeries(book.closing, r(241), TOL, 'r241')
      expectClose(-sum(book.depreciation), r(240).total, TOL, 'D240')
      if (set === 'sample') {
        expectClose(book.depreciation[4], 69.33940929933236, 1e-6, 'FY31')
        expectClose(book.depreciation[9], 91.02138615845504, 1e-6, 'FY36')
      }
    })

    it('income-tax depreciation (SLM): rows 246–250', () => {
      expectSeries(g.fys.map(() => itDep.rate), { values: r(246).values.slice(0, g.fys.length) }, 1e-12, 'r246')
      expectSeries(itDep.opening, r(247), TOL, 'r247')
      expectSeries(itDep.addition, r(248), TOL, 'r248')
      expectSeries(neg(itDep.depreciation), r(249), TOL, 'r249')
      expectSeries(itDep.closing, r(250), TOL, 'r250')
      expectClose(-sum(itDep.depreciation), r(249).total, TOL, 'D249')
    })

    it('PBT before CSR = Fin-IGAAP r33 (and r13 total revenue, r262 = r405)', () => {
      expectSeries(pl.turnover, r(13), TOL, 'r13')
      expectSeries(pl.pbt, r(33), TOL, 'r33')
      expectSeries(pl.pbt, r(262), TOL, 'r262')
      expectSeries(pl.pbt, r(405), TOL, 'r405')
      expectClose(sum(pl.pbt), r(33).total, TOL, 'D33')
    })

    it('tax: rows 262–268 and P&L r35', () => {
      expectSeries(tax.pbt, r(262), TOL, 'r262')
      expectSeries(tax.bookDep, r(263), TOL, 'r263')
      expectSeries(neg(tax.taxDep), r(264), TOL, 'r264')
      expectSeries(tax.pbtIt, r(265), TOL, 'r265')
      expectSeries(tax.lossesBf, r(266), TOL, 'r266')
      expectSeries(tax.taxable, r(267), TOL, 'r267')
      expectSeries(tax.tax, r(268), TOL, 'r268')
      expectSeries(neg(tax.tax), r(35), TOL, 'r35')
      expectClose(sum(tax.tax), r(268).total, TOL, 'D268')
      if (set === 'sample') {
        expectClose(tax.rate, 0.25168, 1e-15, 'taxrate')
        expectClose(sum(tax.tax), 272.79759448017876, 1e-5, 'D268 sample (V16 cached value)')
      }
    })

    it('losses ledger: rows 270–273', () => {
      expectSeries(tax.lossOpening, r(270), TOL, 'r270')
      expectSeries(tax.lossForYear, r(271), TOL, 'r271')
      expectSeries(tax.profitForYear, r(272), TOL, 'r272')
      expectSeries(tax.lossCarried, r(273), TOL, 'r273')
      expectClose(sum(tax.profitForYear), r(272).total, TOL, 'D272')
    })

    it('IGAAP CSR: rows 399–407 and P&L r34', () => {
      // Net worth (r40 + r42..r46, excl. USL r41) and PAT (r36) need the statements (Task 14): from golden here.
      const netWorth = g.fys.map((_, k) => [40, 42, 43, 44, 45, 46].reduce((s, n) => s + r(n).values[k], 0))
      const out = csr(i, g, pl.pbt, netWorth, pl.turnover, r(36).values, 'igaap')
      expectSeries(out.netWorthTest, r(400), 0, 'r400')
      expectSeries(out.turnoverTest, r(401), 0, 'r401')
      expectSeries(out.profitTest, r(402), 0, 'r402')
      expectSeries(out.applicable, r(403), 0, 'r403')
      expectSeries(out.amount, r(406), TOL, 'r406')
      expectSeries(neg(out.amount), r(34), TOL, 'r34')
      expectClose(-sum(out.amount), r(34).total, TOL, 'D34')
      if (set === 'sample') expectClose(sum(out.amount), 17.889480588730393, 1e-6, 'D406 sample')
    })

    it('IndAS CSR: Fin-INDAS rows 389–395 and P&L r47 from golden IndAS PBT (r394), quirk B-Q12', () => {
      // IndAS PBT, net worth (r53 + r55..r59), turnover (r14) and PAT (r49) need the IndAS statements (Task 15).
      const netWorth = g.fys.map((_, k) => [53, 55, 56, 57, 58, 59].reduce((s, n) => s + ind(n).values[k], 0))
      const out = csr(i, g, ind(394).values, netWorth, ind(14).values, ind(49).values, 'indas')
      expectSeries(out.netWorthTest, ind(389), 0, 'r389')
      expectSeries(out.turnoverTest, ind(390), 0, 'r390')
      expectSeries(out.profitTest, ind(391), 0, 'r391')
      expectSeries(out.applicable, ind(392), 0, 'r392')
      expectSeries(out.amount, ind(395), TOL, 'r395')
      expectSeries(neg(out.amount), ind(47), TOL, 'r47')
      expectClose(-sum(out.amount), ind(47).total, TOL, 'D47')
      if (set === 'sample') expectClose(sum(out.amount), 22.402864782136117, 1e-6, 'D395 sample')
    })
  })
}

describe('v16 tax: unit', () => {
  const i = inputsFor('sample'), g = buildGrid(i), n = g.fys.length

  it('quirk B-Q7: a loss year counts its own loss in the b/f loss; tax floored at 0', () => {
    const pbt = g.fys.map((_, k) => (k === 3 ? -10 : k === 4 ? 4 : k === 5 ? 20 : 0))
    const t = runTax(i, g, pbt, g.fys.map(() => 0), g.fys.map(() => 0))
    expect(t.lossesBf[3]).toBe(-10) // opening 0 + this year's −10
    expect(t.lossCarried[3]).toBe(-10)
    expect(t.lossesBf[4]).toBe(-10); expect(t.taxable[4]).toBe(0); expect(t.lossCarried[4]).toBe(-6)
    expect(t.lossesBf[5]).toBe(-6); expectClose(t.taxable[5], 14, 1e-12); expect(t.lossCarried[5]).toBe(0)
    expectClose(t.tax[5], 14 * 0.25168, 1e-12)
  })

  it('CSR: average of up to 3 prior FYs incl. losses, floored at 0, off when csr.on is false', () => {
    const pbt = g.fys.map((_, k) => [0, -30, 10, 50, 50][k] ?? 50)
    const pat = g.fys.map(() => 10)
    const out = csr(i, g, pbt, g.fys.map(() => 0), g.fys.map(() => 0), pat, 'igaap')
    expect(out.amount[0]).toBe(0) // first FY: hard 0 tests
    expect(out.amount[1]).toBe(0) // avg(0) × 2%
    expect(out.amount[2]).toBe(0) // avg(0, −30) < 0 → 0
    expectClose(out.amount[4], 0.02 * (-30 + 10 + 50) / 3, 1e-12)
    expectClose(out.amount[n - 1], 0.02 * 50, 1e-12)
    expect(out.averagePbt.slice(0, 3)).toEqual([0, 0, -15]) // first FY none; then avg(0), avg(0, −30)
    expectClose(out.averagePbt[4], (-30 + 10 + 50) / 3, 1e-12)
    const off = csr({ ...i, csr: { ...i.csr, on: false } }, g, pbt, pat, pat, pat, 'igaap')
    expect(off.amount.every((v) => v === 0)).toBe(true)
  })

  it('CSR end check: IGAAP 0 once the previous FY is past the concession-end FY; IndAS never (quirk B-Q12)', () => {
    const last = g.fys[n - 1]
    expect(last).toBe(fyEnd(g.concessionEnd))
    const ext = { ...g, fys: [...g.fys, addMonths(last, 12), addMonths(last, 24)] } // FY46, FY47
    const pbt = ext.fys.map(() => 50), pat = ext.fys.map(() => 10), z = ext.fys.map(() => 0)
    const igaap = csr(i, ext, pbt, z, z, pat, 'igaap').amount, indas = csr(i, ext, pbt, z, z, pat, 'indas').amount
    expectClose(igaap[n], 1, 1e-12) // FY46: E399 = FY45 = DB!N16, not > N16, so V16 still charges it
    expect(igaap[n + 1]).toBe(0)    // FY47: E399 = FY46 > N16
    expectClose(indas[n], 1, 1e-12); expectClose(indas[n + 1], 1, 1e-12)
    expect(igaap.slice(0, n)).toEqual(indas.slice(0, n))
  })
})
