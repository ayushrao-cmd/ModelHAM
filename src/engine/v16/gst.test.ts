import { describe, it, expect } from 'vitest'
import { toDay } from '../dates'
import { row, inputsFor, expectSeries, expectClose, opsFor } from './golden'
import { buildGrid } from './grid'
import { grantSchedule, runConstruction } from './construction'
import { runRevenue, toFy } from './revenue'
import { runOpex } from './opex'
import { runGst } from './gst'

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const neg = (a: number[]) => a.map((v) => -v)
const setup = (set: string) => {
  const i = inputsFor(set), g = buildGrid(i), c = runConstruction(i, g, opsFor(set))
  const rev = runRevenue(i, g, c), opex = runOpex(i, g, sum(grantSchedule(i, g).pim))
  return { i, g, c, rev, opex, gst: runGst(g, c, rev, opex) }
}

for (const set of ['sample', 'bid2400', 'epc105', 'build1460', 'equity30', 'rates50bp', 'equated']) {
  describe(`v16 gst: ${set}`, () => {
    const { g, c, gst } = setup(set)
    const r = (n: number) => row(set, `Fin-IGAAP!${n}`)
    const used = g.fys.map((_, k) => gst.creditUsedCp[k] + gst.creditUsedOps[k])

    it('input A/c: Fin-IGAAP rows 365–373 by FY', () => {
      expectSeries(gst.creditOpening, r(365), 0.01, 'r365')
      expectSeries(gst.inputCp, r(366), 0.01, 'r366')
      expectSeries(gst.inputOps.om, r(367), 0.01, 'r367')
      expectSeries(gst.inputOps.rm, r(368), 0.01, 'r368')
      expectSeries(gst.inputOps.mm, r(369), 0.01, 'r369')
      expectSeries(gst.inputOps.electricity, r(370), 0.01, 'r370')
      expectSeries(neg(used), r(371), 0.01, 'r371')
      expectSeries(neg(gst.writeOff), r(372), 0.01, 'r372')
      expectSeries(gst.creditClosing, r(373), 0.01, 'r373')
    })

    it('output & payment ledger: rows 376–386 by FY; row 390', () => {
      expect(r(376).values.every((v) => v === 0) && r(386).values.every((v) => v === 0)).toBe(true)
      expectSeries(gst.outputGrant, r(377), 0.01, 'r377')
      expectSeries(gst.outputInstalment, r(378), 0.01, 'r378')
      expectSeries(gst.outputInterest, r(379), 0.01, 'r379')
      expectSeries(gst.outputOm, r(380), 0.01, 'r380')
      expectSeries(gst.output, r(381), 0.01, 'r381')
      expectSeries(neg(used), r(384), 0.01, 'r384')
      expectSeries(neg(gst.paidToGovt), r(385), 0.01, 'r385')
      expectSeries(gst.output, r(389), 0.01, 'r389')
      expectSeries(gst.creditCpAvailable, r(390), 0.01, 'r390')
    })

    it('CP utilisation = COP-MOF r282 (runConstruction monthly ledger) summed by FY', () => {
      const monthly = toFy(c.uses.itc.used, g.periods.map((p) => p.end), g)
      expectSeries(gst.creditUsedCp, { values: monthly }, 1e-12, 'cp used')
      expectSeries(monthly, { values: toFy(neg(row(set, 'COP-MOF!282').values), g.periods.map((p) => p.end), g) },
        0.001, 'r282')
    })

    it('cash flow totals: CF r84, r101, r109, r110', () => {
      expectClose(-sum(gst.inputCp), r(84).total, 0.01, 'D84')
      expectClose(sum(gst.outputInstalment) + sum(gst.outputInterest) + sum(gst.outputOm), r(101).total, 0.01, 'D101')
      expectClose(-sum(Object.values(gst.inputOps).flat()), r(109).total, 0.01, 'D109')
      expectClose(-sum(gst.paidToGovt), r(110).total, 0.01, 'D110')
    })
  })
}

describe('v16 gst: sample', () => {
  const { g, c, rev, opex, gst } = setup('sample')

  it('paid to government 350.2489958224803; credit closing FY30 157.76656468891025', () => {
    expectClose(sum(gst.paidToGovt), 350.2489958224803, 1e-5, 'D110')
    expectClose(gst.creditClosing[g.fys.indexOf(toDay('2030-03-31'))], 157.76656468891025, 1e-6, 'H373')
  })

  it('unused credit is written off in the last FY (r372 → P&L r24)', () => {
    const z = rev.gstInstalment.map(() => 0)
    const none = runGst(g, c, { ...rev, gstInstalment: z, gstInterest: z, gstOm: z }, opex)
    const last = g.fys.length - 1
    expect(none.writeOff.slice(0, last).every((v) => v === 0)).toBe(true)
    expectClose(none.writeOff[last], none.creditOpening[last] + none.inputCp[last] + opex.gstTotal[last], 1e-9, 'write-off')
    expect(none.creditClosing[last]).toBe(0)
    expect(none.paidToGovt.every((v) => v === 0)).toBe(true)
  })
})
