import { describe, it, expect } from 'vitest'
import { row, inputsFor, fromSerial, expectSeries, expectClose, opsFor } from './golden'
import { buildGrid } from './grid'
import { runConstruction } from './construction'
import { omRates, runRevenue, toFy } from './revenue'

const setup = (set: string) => {
  const i = inputsFor(set), g = buildGrid(i)
  return { i, g, c: runConstruction(i, g, opsFor(set)) }
}
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
/** Revenue F…AI = annuity 1…30 (value index 1…30; index 0 is column E). */
const perAnnuity = (set: string, r: number) => ({ values: row(set, `Revenue!${r}`).values.slice(1, 31) })

for (const set of ['sample', 'bid2400', 'epc105', 'build1460', 'equity30', 'rates50bp', 'equated']) {
  describe(`v16 revenue: ${set}`, () => {
    const { i, g, c } = setup(set)
    const r = runRevenue(i, g, c)
    const fy = (s: number[]) => toFy(s, r.dates, g)

    it('completion base Revenue!D14 = DB!C83 − C84', () => {
      expectClose(r.completionBase, row(set, 'Revenue!14').total, 1e-9, 'D14')
    })

    it('FY sums: Fin-IGAAP rows 8 (instalments), 9 (interest), 10 (O&M), 11 (bonus)', () => {
      expectSeries(fy(r.instalment), row(set, 'Fin-IGAAP!8'), 0.01, 'r8')
      expectSeries(fy(r.interest), row(set, 'Fin-IGAAP!9'), 0.01, 'r9')
      expectSeries(fy(r.om), row(set, 'Fin-IGAAP!10'), 0.01, 'r10')
      expectSeries(fy(r.bonus), row(set, 'Fin-IGAAP!11'), 0.01, 'r11')
      expectClose(sum(r.instalment), row(set, 'Fin-IGAAP!8').total, 0.01, 'D8')
      expectClose(sum(r.interest), row(set, 'Fin-IGAAP!9').total, 0.01, 'D9')
      expectClose(sum(r.om), row(set, 'Fin-IGAAP!10').total, 0.01, 'D10')
    })

    it('GST on revenue: Fin-IGAAP rows 378 (instalment), 379 (interest, B-Q13), 380 (O&M) by FY', () => {
      expectSeries(fy(r.gstInstalment), row(set, 'Fin-IGAAP!378'), 0.01, 'r378')
      expectSeries(fy(r.gstInterest), row(set, 'Fin-IGAAP!379'), 0.01, 'r379')
      expectSeries(fy(r.gstOm), row(set, 'Fin-IGAAP!380'), 0.01, 'r380')
    })
  })
}

describe('v16 revenue: sample per annuity (Revenue F…AI)', () => {
  const { i, g, c } = setup('sample')
  const r = runRevenue(i, g, c)

  it('totals 1480.7145205479455 / 1281.406377767277 / 366.0214524353887', () => {
    expectClose(r.completionBase, 1480.7145205479455, 1e-9, 'base')
    expectClose(sum(r.instalment), 1480.7145205479455, 1e-9, 'instalments')
    expectClose(sum(r.interest), 1281.406377767277, 1e-9, 'interest')
    expectClose(sum(r.om), 366.0214524353887, 1e-9, 'om')
    expect(sum(r.bonus)).toBe(0)
  })

  it('dates r4 (last = concession end, B-Q14), instalment r14, opening r17, interest r24, bonus r29', () => {
    expect(r.dates).toEqual(perAnnuity('sample', 4).values.map(fromSerial))
    expectSeries(r.instalment, perAnnuity('sample', 14), 1e-9, 'r14')
    expectSeries(r.opening, perAnnuity('sample', 17), 1e-9, 'r17')
    expectSeries(r.interest, perAnnuity('sample', 24), 1e-9, 'r24')
    expectSeries(r.bonus, perAnnuity('sample', 29), 1e-9, 'r29')
  })

  it('O&M: unindexed r44, index on payment date r37, payment r45', () => {
    expectSeries(r.omUnindexed, perAnnuity('sample', 44), 1e-9, 'r44')
    expectSeries(r.omIndex, perAnnuity('sample', 37), 1e-9, 'r37')
    expectSeries(r.om, perAnnuity('sample', 45), 1e-9, 'r45')
    expectClose(r.omIndex[29], 2.0840097959516504, 1e-12, 'annuity 30 index (352 days)')
  })

  it("O&M rates 'CA Set' r29 (perpetual) and r28 (flexible)", () => {
    expect(omRates(i)).toEqual([0, 0.004, 0.004, 0.004, 0.006, 0.024, 0.004, 0.004, 0.004, 0.004, 0.006, 0.024,
      0.004, 0.004, 0.004])
    expect(omRates({ ...i, deal: { ...i.deal, pavement: 'flexible' } })).toEqual([0, 0.004, 0.004, 0.004, 0.008,
      0.024, 0.004, 0.004, 0.004, 0.004, 0.008, 0.024, 0.004, 0.004, 0.004])
    // layering in years 8 and 14: no layer in the 4 prior years → pre-layer rate in years 5–7 and 12–13
    expect(omRates({ ...i, operations: { ...i.operations, resurfacingYears: [8, 14] } })).toEqual([0, 0.004, 0.004,
      0.004, 0.006, 0.006, 0.006, 0.024, 0.004, 0.004, 0.004, 0.004, 0.006, 0.024, 0.004])
  })

  it('bonus (Revenue E27:F29): ≥ 30 days early → days/30 × BPC × 60% × 0.5%, paid with annuity 1', () => {
    const b = runRevenue(i, g, c, 60).bonus
    expectClose(b[0], 60 / 30 * 2250 * 0.6 * 0.005, 1e-12, 'bonus')
    expect(sum(b.slice(1))).toBe(0)
    expect(sum(runRevenue(i, g, c, 29).bonus)).toBe(0)
  })

  it('toFy sums dated values into the FY grid and drops dates outside it', () => {
    expect(toFy([1, 2, 4], [g.fys[0], g.fys[0] - 400, g.fys[1] + 5000 * 365], g)).toEqual(
      g.fys.map((_, k) => (k === 0 ? 1 : 0)))
  })
})
