import { describe, it, expect } from 'vitest'
import { fyEnd, toDay } from '../dates'
import { row, rowRaw, inputsFor, fromSerial, expectSeries, expectClose, opsFor } from './golden'
import { buildGrid, daysInFy } from './grid'
import { runConstruction } from './construction'
import { runDebt } from './debt'

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const setup = (set: string) => {
  const i = inputsFor(set), g = buildGrid(i), c = runConstruction(i, g, opsFor(set))
  return { i, g, c, d: runDebt(i, g, c) }
}
/** Non-empty leading cells of a Debt date row = the block's month count. */
const monthsIn = (set: string, r: number) => rowRaw(set, `Debt!${r}`).values.findIndex((v) => v === null)
/** Debt row cut to the block (V16's formulas run on to column GW past it). */
const debt = (set: string, r: number, f = (v: number) => v) =>
  ({ values: row(set, `Debt!${r}`).values.slice(0, monthsIn(set, r < 20 ? 5 : 21)).map(f) })

for (const set of ['sample', 'bid2400', 'epc105', 'build1460', 'equity30', 'rates50bp', 'equated']) {
  describe(`v16 debt: ${set}`, () => {
    const { g, d } = setup(set)
    const cod = d.months.filter((m) => m.phase === 'cod'), rep = d.months.filter((m) => m.phase === 'repayment')
    // Fin-IGAAP r213..r222 run from FY(COD) (column E), not from the statements' first FY.
    const k0 = g.fys.indexOf(fyEnd(g.cod))
    const block = (a: number[]) => a.slice(k0)

    it('COD → 1st annuity months: Debt rows 5, 14, 15, 17, 18', () => {
      expect(cod.length).toBe(monthsIn(set, 5))
      expectSeries(cod.map((m) => m.start), debt(set, 5, fromSerial), 0, 'start')
      expectSeries(cod.map((m) => m.opening), debt(set, 14), 1e-6, 'opening')
      expectSeries(cod.map((m) => m.addition), debt(set, 15), 1e-6, 'addition')
      expectSeries(cod.map((m) => m.closing), debt(set, 17), 1e-6, 'closing')
      expectSeries(cod.map((m) => m.interest), debt(set, 18), 1e-6, 'interest')
      expectSeries(cod.map((m) => m.rate), debt(set, 13), 1e-12, 'rate')
      expectClose(d.base, row(set, 'Debt!17').total, 1e-6, 'C17')
    })

    it('1st annuity → repayment end months: Debt rows 21, 22, 29, 30, 32, 33, 34', () => {
      expect(rep.length).toBe(monthsIn(set, 21))
      expectSeries(rep.map((m) => m.start), debt(set, 21, fromSerial), 0, 'start')
      expectSeries(rep.map((m) => m.end), debt(set, 22, fromSerial), 0, 'end')
      expectSeries(rep.map((m) => m.rate), debt(set, 29), 1e-12, 'rate')
      expectSeries(rep.map((m) => m.opening), debt(set, 30), 1e-6, 'opening')
      expectSeries(rep.map((m) => -m.repayment), debt(set, 32), 1e-6, 'repayment')
      expectSeries(rep.map((m) => m.closing), debt(set, 33), 1e-6, 'closing')
      expectSeries(rep.map((m) => m.interest), debt(set, 34), 1e-6, 'interest')
      expectClose(sum(rep.map((m) => m.interest)), row(set, 'Debt!34').total, 1e-6, 'C34')
    })

    it('principal per annuity DB r67 (repayment % × COP-MOF D75); repayment end DB!U12', () => {
      expectSeries(d.principal, { values: row(set, 'DB!67').values.slice(1, 1 + g.annuities.length) }, 1e-6, 'r67')
      expect(d.repaymentEnd).toBe(fromSerial(row(set, 'DB!12').values[18]))
    })

    it('per FY: Fin-IGAAP r218–r222 and totals D219, D220, D222', () => {
      expectSeries(block(d.opening), row(set, 'Fin-IGAAP!218'), 0.01, 'r218')
      expectSeries(block(d.addition), row(set, 'Fin-IGAAP!219'), 0.01, 'r219')
      expectSeries(block(d.repayment).map((v) => -v), row(set, 'Fin-IGAAP!220'), 0.01, 'r220')
      expectSeries(block(d.closing), row(set, 'Fin-IGAAP!221'), 0.01, 'r221')
      expectSeries(block(d.interest), row(set, 'Fin-IGAAP!222'), 0.01, 'r222')
      expectClose(sum(d.addition), row(set, 'Fin-IGAAP!219').total, 0.01, 'D219')
      expectClose(-sum(d.repayment), row(set, 'Fin-IGAAP!220').total, 0.01, 'D220')
      expectClose(sum(d.interest), row(set, 'Fin-IGAAP!222').total, 0.01, 'D222')
      expect(d.interest.slice(0, k0).every((v) => v === 0)).toBe(true)
    })

    it('BS senior debt Fin-IGAAP r47 every FY (construction balance before FY(COD))', () => {
      expectSeries(d.closing, row(set, 'Fin-IGAAP!47'), 0.01, 'r47')
    })

    it('leap FYs FY32 and FY36: 366-day interest to ₹0.01', () => {
      for (const iso of ['2032-03-31', '2036-03-31']) {
        const k = g.fys.indexOf(toDay(iso))
        expect(daysInFy(g.fys[k])).toBe(366)
        expectClose(d.interest[k], row(set, 'Fin-IGAAP!222').values[k - k0], 0.01, `interest ${iso}`)
      }
    })
  })
}

describe('v16 debt: sample targets (B §8)', () => {
  const { g, d } = setup('sample')
  const at = (iso: string) => g.fys.indexOf(toDay(iso))

  it('interest 692.2504353809427, repayment 990.2497264858371; closing FY30 951.6363501341834, FY31 960.5422346912624', () => {
    expectClose(sum(d.interest), 692.2504353809427, 1e-6, 'D222')
    expectClose(sum(d.repayment), 990.2497264858371, 1e-6, 'D220')
    expectClose(d.closing[at('2030-03-31')], 951.6363501341834, 1e-6, 'FY30')
    expectClose(d.closing[at('2031-03-31')], 960.5422346912624, 1e-6, 'FY31')
  })

  it('COD → annuity at 9.75%: 46.60827, Sep-30 at 9.5% on AVG(990.2497, 975.3960) × 16/365 (B-Q15)', () => {
    expectClose(sum(d.months.filter((m) => m.phase === 'cod').map((m) => m.interest)), 46.60827035066281, 1e-6, 'C18')
    const sep = d.months.find((m) => m.phase === 'repayment')!
    expect(sep.days).toBe(16)
    expectClose(sep.interest, (990.249726485837 + 975.3959805885495) / 2 * 16 / 365 * 0.095, 1e-8, 'D34')
  })

  it('a repayment month mid-month uses the whole-month average (Mar-31: 31 days on AVG(pre, post))', () => {
    const mar = d.months.find((m) => m.phase === 'repayment' && m.end === toDay('2031-03-31'))!
    expect(mar.days).toBe(31)
    expectClose(mar.repayment, 14.853745897287556, 1e-6, 'repay')
    expectClose(mar.interest, (mar.opening + mar.closing) / 2 * 31 / 365 * 0.095, 1e-12, 'interest')
  })
})
