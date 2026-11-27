import { describe, it, expect } from 'vitest'
import { fyEnd } from '../dates'
import { row, inputsFor, expectSeries, expectClose } from './golden'
import { buildGrid, daysInFy } from './grid'
import { grantSchedule } from './construction'
import { inflationIndex } from './indices'
import { runOpex, type OpexHead } from './opex'

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const setup = (set: string) => {
  const i = inputsFor(set), g = buildGrid(i)
  return { i, g, ev: sum(grantSchedule(i, g).pim) } // DB!D30 EPC variable net, no funding loop needed
}
const neg = (a: number[]) => a.map((v) => -v)
/** Fin-IGAAP P&L rows (negative there; positive here). */
const HEAD_ROWS: [OpexHead, number][] = [['ieFee', 15], ['spvManpower', 16], ['spvOverhead', 17], ['financeLegal', 18],
  ['insurance', 19], ['routineMaintenance', 20], ['majorMaintenance', 21], ['electricity', 22]]

for (const set of ['sample', 'bid2400', 'epc105', 'build1460', 'equity30', 'rates50bp', 'equated']) {
  describe(`v16 opex: ${set}`, () => {
    const { i, g, ev } = setup(set)
    const o = runOpex(i, g, ev)

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
  const { i, g, ev } = setup('sample')
  const o = runOpex(i, g, ev)
  const idx = inflationIndex(i, g, i.operations.inflation.maintenance)
  const at = (d: number) => g.fys.indexOf(fyEnd(d))

  it('total −386.37770064097117; post-COD O&M 8.794704003393369', () => {
    expectClose(-sum(o.total), -386.37770064097117, 1e-5, 'D25')
    expectClose(sum(o.postCodOpex), 8.794704003393369, 1e-6, 'G38')
  })

  // DB!U12 = annuity no. (repayment length); before FY(U12) × J12, in it × U13 = 1 − (U14 − U12 + 1)/days, then 0.
  for (const n of [25, 20]) {
    it(`FLC stops at the repayment-end FY of a ${n}-instalment schedule`, () => {
      const ii = { ...i, capital: { ...i.capital, repayment: i.capital.repayment.slice(0, n) } }
      const end = g.annuities[n - 1], k = at(end), u13 = 1 - (fyEnd(end) - end + 1) / daysInFy(fyEnd(end))
      const factor = g.fys.map((_, j) => (j < k ? g.opFactorCod[j] : j === k ? u13 : 0))
      expectSeries(runOpex(ii, g, ev).financeLegal, { values: factor.map((f, j) => i.operations.financeLegal * f * idx[j]) },
        1e-12, `FLC n=${n}`)
      expect(k).toBe(at(g.annuities[24]) - (n === 20 ? 3 : 0)) // 20 instalments: 2.5 years earlier → 3 FYs
    })
  }

  it('MM lands only in operations.resurfacingYears (years 6 and 12 become 0 when moved to 7 and 13)', () => {
    const moved = runOpex({ ...i, operations: { ...i.operations, resurfacingYears: [7, 13] } }, g, ev)
    const want = g.fys.map(() => 0)
    for (const y of [7, 13]) {
      const c = g.concessionYears[y - 1], mm = i.operations.majorMaintenance
      want[at(c.start)] += mm * c.share * idx[at(c.start)]
      want[at(c.end)] += mm * (1 - c.share) * idx[at(c.end)]
    }
    expectSeries(moved.majorMaintenance, { values: want }, 1e-12, 'MM [7, 13]')
    expect(moved.majorMaintenance[at(g.concessionYears[5].start)]).toBe(0) // year 6's start FY
  })
})
