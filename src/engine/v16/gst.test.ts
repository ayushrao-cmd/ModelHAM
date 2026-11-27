import { describe, it, expect } from 'vitest'
import { addMonths, toDay } from '../dates'
import { row, rowRaw, inputsFor, expectSeries, expectClose, opsFor } from './golden'
import { buildGrid } from './grid'
import { grantSchedule, runConstruction } from './construction'
import { runRevenue, toFy } from './revenue'
import { runOpex, type OpexResult } from './opex'
import { runGst } from './gst'
import type { ConstructionResult } from './construction'
import type { RevenueResult } from './revenue'
import type { Grid } from './types'

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
      for (const h of [383, 388]) expect(rowRaw(set, `Fin-IGAAP!${h}`).values.every((v) => v === null)).toBe(true) // headers
    })

    it('P&L r24 (excess input GST charged) = r372 = −writeOff, by FY and D24', () => {
      expectSeries(neg(gst.writeOff), r(24), 0.01, 'r24')
      expectClose(-sum(gst.writeOff), r(24).total, 0.01, 'D24')
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

  it('write-off lands in the concession-end FY (DB!N16), not the last grid FY', () => {
    const z = rev.gstInstalment.map(() => 0), noOut = { ...rev, gstInstalment: z, gstInterest: z, gstOm: z }
    const gExt = { ...g, fys: [...g.fys, addMonths(g.fys[g.fys.length - 1], 12)] }
    const pad = Object.fromEntries(Object.entries(opex.gst).map(([h, a]) => [h, [...a, 0]])) as OpexResult['gst']
    const ext = runGst(gExt, c, noOut, { ...opex, gst: pad })
    const n16 = g.fys.length - 1 // g.fys ends at FY(concession end); gExt has one FY after it
    expect(ext.writeOff[n16]).toBeGreaterThan(0)
    expect(ext.writeOff[n16 + 1]).toBe(0)
    expect(ext.creditClosing[n16]).toBe(0)
    expect(ext.creditClosing[n16 + 1]).toBe(0)
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

// A-G19 divergence, built by hand: FY1 has 10 of CP input and 10 of revenue output GST, FY2 a grant tranche with
// GST 10 and no input. Monthly (COP-MOF H282 = −MIN(H287 + H288, H281)): month 2 opens at 10 (no grant in month 1),
// so it uses 10. Per FY (Fin-IGAAP F384 = −MIN(SUM(F365:F370), F381)): FY1 uses its 10 on revenue, FY2 has 0 to use.
describe('v16 gst: COP-MOF H282 monthly vs Fin-IGAAP F384 per FY (A-G19)', () => {
  const fy1 = toDay('2028-03-31'), fy2 = toDay('2029-03-31')
  const g = { fys: [fy1, fy2], concessionEnd: toDay('2028-12-31'),
    periods: [{ end: toDay('2027-12-31') }, { end: toDay('2028-06-30') }] } as unknown as Grid
  const c = { uses: { itc: { available: [10, 0], used: [0, 10] }, grant: { receivedGst: [0, 10] } } } as unknown as ConstructionResult
  const rev = { dates: [toDay('2028-01-15')], gstInstalment: [10], gstInterest: [0], gstOm: [0] } as unknown as RevenueResult
  const heads = ['ieFee', 'spvManpower', 'spvOverhead', 'financeLegal', 'insurance', 'routineMaintenance',
    'majorMaintenance', 'electricity']
  const opex = { gst: Object.fromEntries(heads.map((h) => [h, [0, 0]])) } as unknown as OpexResult
  const r = runGst(g, c, rev, opex)

  it('r384 per FY is kept (CP + OP = MIN(credit, output)); the OP part goes negative, unclamped', () => {
    expect(r.creditUsedCp).toEqual([0, 10])
    expect(r.creditUsedOps).toEqual([10, -10])
    expect(r.creditUsedCp.map((v, k) => v + r.creditUsedOps[k])).toEqual([10, 0]) // −F384
    expect(r.paidToGovt).toEqual([0, 10]) // F385 = −(F381 + F384)
    expect(r.creditClosing).toEqual([0, 0])
  })
})
