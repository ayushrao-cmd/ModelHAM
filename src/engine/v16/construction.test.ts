import { describe, it, expect } from 'vitest'
import { addMonths } from '../dates'
import { row, rowRaw, inputsFor, fromSerial, expectSeries, expectClose } from './golden'
import { buildGrid } from './grid'
import { constructionUses, grantSchedule, stlSchedule, derivedCosts, type UseKey } from './construction'

/** Use line → COP-MOF row (gross); its GST is in row + 231 (COP-MOF r246..r276). */
const ROWS: Record<UseKey, number> = {
  epcFixed: 15, epcVariable: 16, imvCapital: 18, preBid: 19, spvFormation: 20, ieFee: 21, spvManpower: 22,
  admin: 23, fundRaising: 24, financeLegal: 25, imvRental: 26, contingency: 27, psbgCommission: 28,
  stlInterest: 32, maInterestFromEpc: 37, netGstPayable: 40,
}
/** Switched-off / authority-MA / interim-debt lines: all zero in V16 at every set, so not modelled. */
const ZERO_ROWS = [17, 29, 30, 34, 35, 36, 39, 43, 44, 45]

/** Converged D (COP-MOF D75), E (D70) and PSBG release 'CA Set'!J14 = MIN(r295 crossing, EDATE(AD, 12)). */
function converged(set: string) {
  const i = inputsFor(set), g = buildGrid(i)
  const D = rowRaw(set, 'COP-MOF!75').lead!['4'], E = rowRaw(set, 'COP-MOF!70').lead!['4']
  const crossing = fromSerial(rowRaw(set, 'COP-MOF!295').values.find((v) => v !== null)!)
  return { i, g, D, E, psbg: Math.min(crossing, addMonths(g.appointed, 12)) }
}

for (const set of ['sample', 'epc105', 'bid2400', 'build1460', 'equated']) {
  describe(`v16 construction uses: ${set}`, () => {
    const { i, g, D, E, psbg } = converged(set)
    const u = constructionUses(i, g, D, E, psbg)

    for (const [k, r] of Object.entries(ROWS) as [UseKey, number][]) {
      it(`${k} (COP-MOF r${r}) gross and GST (r${r + 231}) by month`, () => {
        expectSeries(u.lines[k].gross, row(set, `COP-MOF!${r}`), 0.001, `${k} gross`)
        expectSeries(u.lines[k].gst, row(set, `COP-MOF!${r + 231}`), 0.001, `${k} gst`)
      })
    }

    it('unmodelled lines are zero in V16', () => {
      for (const r of ZERO_ROWS) expect(row(set, `COP-MOF!${r}`).values.every((v) => v === 0), `r${r}`).toBe(true)
    })

    it('GST credit ledger: ITC on costs (r277), closing ITC (r290)', () => {
      expectSeries(u.itc.available, row(set, 'COP-MOF!277'), 0.001, 'itc')
      expectSeries(u.itc.closing, row(set, 'COP-MOF!290'), 0.001, 'closing itc')
    })

    it('grant by month (r101) and its GST (r102)', () => {
      const s = grantSchedule(i, g)
      expectSeries(s.received, row(set, 'COP-MOF!101'), 0.001, 'grant')
      expectSeries(s.receivedGst, row(set, 'COP-MOF!102'), 0.001, 'grant gst')
      // tranche crossing dates DB!D76:M76 (interpolated, fractional) and amounts DB!D84:M84
      const d76 = row(set, 'DB!76').values.slice(1, 1 + s.crossing.length).map(fromSerial)
      s.crossing.forEach((c, k) => expectClose(c, d76[k], 1e-6, `crossing ${k + 1}`))
      expectSeries(s.amount, { values: row(set, 'DB!84').values.slice(1, 11) }, 1e-9, 'tranche')
    })

    it('STL ledger (r155, r156, r157, r161)', () => {
      const s = stlSchedule(i, g, grantSchedule(i, g))
      expectSeries(s.draw, row(set, 'COP-MOF!155'), 0.001, 'draw')
      expectSeries(s.repay.map((v) => -v), row(set, 'COP-MOF!156'), 0.001, 'repay')
      expectSeries(s.balance, row(set, 'COP-MOF!157'), 0.001, 'balance')
      expectSeries(s.interest, row(set, 'COP-MOF!161'), 0.001, 'interest')
    })
  })
}

describe('v16 construction: sample targets (A §6)', () => {
  const { i, g, D, E, psbg } = converged('sample')
  const u = constructionUses(i, g, D, E, psbg)
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)

  it('grant 970.638904, GST 174.715003, EPC variable net 70.638904 (gross 83.353907)', () => {
    const s = grantSchedule(i, g)
    expectClose(sum(s.amount), 970.638904, 1e-6, 'grant')
    expectClose(sum(s.gst), 174.715003, 1e-6, 'gst')
    expectClose(sum(s.pim), 70.638904, 1e-6, 'pim')
    expectClose(sum(u.lines.epcVariable.gross), 83.353907, 1e-6, 'epc variable gross')
    expect(s.month).toEqual([2, 4, 7, 11, 14, 17, 19, 22, 24, 29])
  })

  it('tranche 9 (80%) lands in month index 24 although cum progress is 0.8000000000000004 (A-Q10)', () => {
    const cum = i.build.manualPhasing.slice(0, 25).reduce((s, v) => s + v, 0)
    expect(cum).toBe(0.8000000000000004)
    expect(grantSchedule(i, g).month[8]).toBe(24)
    // a cum a hair below the threshold still crosses (ε = 1e-9)
    const mp = [...i.build.manualPhasing]; mp[24] -= 1e-12
    expect(grantSchedule({ ...i, build: { ...i.build, manualPhasing: mp } }, g).month[8]).toBe(24)
  })

  it('STL: 112.5 drawn at AD+30 and AD+90 months (A-Q4), 28.125 repaid at milestones 1-8, interest net 0', () => {
    const s = stlSchedule(i, g, grantSchedule(i, g))
    expect(s.draw[1]).toBe(112.5) // Apr-27 (AD + 30 = 19-Apr)
    expect(s.draw[3]).toBe(112.5) // Jun-27 (AD + 30 + 60 = 18-Jun)
    expect(s.repay.filter((v) => v).map((v) => +v.toFixed(6))).toEqual(Array(8).fill(28.125))
    expectClose(sum(s.interest), 18.353874, 1e-6, 'stl interest')
    expectClose(sum(u.lines.stlInterest.gross) + sum(u.lines.maInterestFromEpc.gross), 0, 1e-12, 'net')
  })

  it('PSBG commission 1.801664 gross with the +1-day quirk (A-Q3); admin 45.515973; FLC 4.21', () => {
    expectClose(sum(u.lines.psbgCommission.gross), 1.801664, 1e-6, 'psbg')
    expectClose(sum(u.lines.admin.gross), 45.515973, 1e-6, 'admin')
    expectClose(derivedCosts(i, g).financeLegal, 4.21, 1e-12, 'flc')
    expectClose(derivedCosts(i, g).patrolRental, 0.846, 1e-12, 'patrol')
  })

  it('build1460: FLC 5.5 and patrol rental 1.128 derived from build days (A-Q8)', () => {
    const b = inputsFor('build1460')
    expectClose(derivedCosts(b, buildGrid(b)).financeLegal, b.build.financeLegal, 1e-12, 'flc')
    expectClose(derivedCosts(b, buildGrid(b)).patrolRental, b.build.patrolRental, 1e-12, 'patrol')
    expectClose(derivedCosts(b, buildGrid(b)).financeLegal, 5.5, 1e-12, 'flc 5.5')
    expectClose(derivedCosts(b, buildGrid(b)).patrolRental, 1.128, 1e-12, 'patrol 1.128')
  })
})
