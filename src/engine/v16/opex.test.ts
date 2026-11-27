import { describe, it, expect } from 'vitest'
import { row, inputsFor, expectSeries, expectClose, opsFor } from './golden'
import { buildGrid } from './grid'
import { runConstruction } from './construction'
import { runOpex, type OpexHead } from './opex'

const setup = (set: string) => {
  const i = inputsFor(set), g = buildGrid(i)
  return { i, g, c: runConstruction(i, g, opsFor(set)) }
}
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const neg = (a: number[]) => a.map((v) => -v)
/** Fin-IGAAP P&L rows (negative there; positive here). */
const HEAD_ROWS: [OpexHead, number][] = [['ieFee', 15], ['spvManpower', 16], ['spvOverhead', 17], ['financeLegal', 18],
  ['insurance', 19], ['routineMaintenance', 20], ['majorMaintenance', 21], ['electricity', 22]]

for (const set of ['sample', 'bid2400', 'epc105', 'build1460', 'equity30', 'rates50bp', 'equated']) {
  describe(`v16 opex: ${set}`, () => {
    const { i, g, c } = setup(set)
    const o = runOpex(i, g, c)

    it('each head = Fin-IGAAP rows 15–22 by FY and in total; total = D25', () => {
      for (const [h, r] of HEAD_ROWS) {
        expectSeries(neg(o[h]), row(set, `Fin-IGAAP!${r}`), 0.01, `${h} r${r}`)
        expectClose(-sum(o[h]), row(set, `Fin-IGAAP!${r}`).total, 0.01, `${h} D${r}`)
      }
      expectSeries(neg(o.total), row(set, 'Fin-IGAAP!25'), 0.01, 'r25')
      expectClose(-sum(o.total), row(set, 'Fin-IGAAP!25').total, 0.01, 'D25')
    })

    it('GST on costs: Fin-IGAAP rows 367 (others), 368 (RM), 369 (MM), 370 (electricity)', () => {
      const others = g.fys.map((_, k) => o.gst.financeLegal[k] + o.gst.spvManpower[k] + o.gst.spvOverhead[k]
        + o.gst.ieFee[k] + o.gst.insurance[k])
      expectSeries(others, row(set, 'Fin-IGAAP!367'), 0.01, 'r367')
      expectSeries(o.gst.routineMaintenance, row(set, 'Fin-IGAAP!368'), 0.01, 'r368')
      expectSeries(o.gst.majorMaintenance, row(set, 'Fin-IGAAP!369'), 0.01, 'r369')
      expectSeries(o.gst.electricity, row(set, 'Fin-IGAAP!370'), 0.01, 'r370')
      expect(o.gst.spvManpower.every((v) => v === 0) && o.gst.spvOverhead.every((v) => v === 0)).toBe(true)
    })

    it('O&M COD → 1st annuity incl. GST: COP-MOF r314 by period, r38 total', () => {
      expectSeries(o.postCodOpex, row(set, 'COP-MOF!314'), 1e-6, 'r314')
      expectClose(sum(o.postCodOpex), row(set, 'COP-MOF!38').total, 1e-6, 'G38')
    })
  })
}

describe('v16 opex: sample', () => {
  const { i, g, c } = setup('sample')
  const o = runOpex(i, g, c)

  it('total −386.37770064097117; post-COD O&M 8.794704003393369', () => {
    expectClose(-sum(o.total), -386.37770064097117, 1e-5, 'D25')
    expectClose(sum(o.postCodOpex), 8.794704003393369, 1e-6, 'G38')
  })

  it('FLC stops after the repayment-end FY (FY43 × 0.457534, then 0)', () => {
    const k43 = g.fys.findIndex((f) => new Date(f * 86_400_000).getUTCFullYear() === 2043)
    expectClose(o.financeLegal[k43] / o.financeLegal[k43 - 1], (1 - 198 / 365) * 1.045, 1e-12, 'FY43/FY42') // DB!U13
    expect(o.financeLegal.slice(k43 + 1).every((v) => v === 0)).toBe(true)
  })

  it('MM follows operations.resurfacingYears', () => {
    const moved = runOpex({ ...i, operations: { ...i.operations, resurfacingYears: [7, 13] } }, g, c)
    const k = (y: number) => g.fys.findIndex((f) => new Date(f * 86_400_000).getUTCFullYear() === y)
    expect(moved.majorMaintenance[k(2036)]).toBeGreaterThan(0) // year 7 starts 19-Mar-36 (FY36 stub)
    expect(moved.majorMaintenance[k(2037)]).toBeGreaterThan(30)
    expect(moved.majorMaintenance[k(2035)]).toBe(0)
  })
})
