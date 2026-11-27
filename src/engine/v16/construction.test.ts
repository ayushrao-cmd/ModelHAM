import { describe, it, expect } from 'vitest'
import { addMonths } from '../dates'
import { row, rowRaw, inputsFor, fromSerial, expectSeries, expectClose, opsFor } from './golden'
import { buildGrid } from './grid'
import { constructionUses, grantSchedule, stlSchedule, derivedCosts, runConstruction, type UseKey,
  type ConstructionMonth } from './construction'

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
      s.crossing.forEach((c, k) => expectClose(c!, d76[k], 1e-6, `crossing ${k + 1}`))
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

/** Monthly funding series → COP-MOF row. */
const MONTHS: [keyof ConstructionMonth, number][] = [
  ['tpc', 46], ['required', 66], ['idc', 31], ['postCodInterest', 33], ['opex', 38], ['dsrPrincipal', 41],
  ['dsrInterest', 42], ['equityUpfront', 71], ['equityDeferred', 74], ['debtDraw', 75], ['equityShareCapital', 90],
  ['equityUsl', 91], ['debtBalance', 217], ['stlBalance', 157], ['psbgCommission', 28], ['fundRaising', 24],
  ['spvFormation', 20],
]

for (const set of ['sample', 'epc105', 'bid2400', 'build1460', 'equated', 'equity30', 'rates50bp']) {
  describe(`v16 construction funding: ${set}`, () => {
    const i = inputsFor(set), g = buildGrid(i)
    const r = runConstruction(i, g, opsFor(set))
    const lead = (k: number) => rowRaw(set, `COP-MOF!${k}`).lead!['4']

    for (const [k, n] of MONTHS) {
      it(`${k} (COP-MOF r${n}) by month`, () => {
        expectSeries(r.months.map((m) => m[k] as number), row(set, `COP-MOF!${n}`), 0.001, k)
      })
    }

    it('totals: TPC G46, funds required G66, equity D70, debt D75, IDC G31, post-COD interest G33, SC D90, USL D91', () => {
      expectClose(r.tpc, row(set, 'COP-MOF!46').total, 0.001, 'tpc')
      expectClose(r.fundsRequired, row(set, 'COP-MOF!66').total, 0.001, 'G66')
      expectClose(r.equity, lead(70), 0.001, 'equity')
      expectClose(r.upfrontEquity, lead(71), 0.001, 'upfront')
      expectClose(r.debt, lead(75), 0.001, 'debt')
      expectClose(r.idc, row(set, 'COP-MOF!31').total, 0.001, 'idc')
      expectClose(r.postCodInterest, row(set, 'COP-MOF!33').total, 0.001, 'post-COD interest')
      expectClose(r.shareCapital, lead(90), 0.001, 'share capital')
      expectClose(r.usl, lead(91), 0.001, 'usl')
    })

    it("PSBG release 'CA Set'!J14 = MIN(r295 crossing, EDATE(AD, 12))", () => {
      const crossing = fromSerial(rowRaw(set, 'COP-MOF!295').values.find((v) => v !== null)!)
      expectClose(r.psbgRelease, Math.min(crossing, addMonths(g.appointed, 12)), 1e-6, 'J14')
    })

    it('converges within 50 outer iterations', () => {
      expect(r.converged).toBe(true)
      expect(r.iterations).toBeLessThanOrEqual(50)
    })
  })
}

describe('v16 construction funding: sample targets (A §5, §6)', () => {
  const i = inputsFor('sample'), g = buildGrid(i)
  const r = runConstruction(i, g, opsFor('sample'))

  it('TPC 2465.686875, G66 1320.332969, E 330.083242, D 990.249726, IDC 117.988926, post-COD interest 46.608270', () => {
    expectClose(r.tpc, 2465.686875, 1e-6, 'tpc')
    expectClose(r.fundsRequired, 1320.332969, 1e-6, 'G66')
    expectClose(r.equity, 330.083242, 1e-6, 'equity')
    expectClose(r.debt, 990.249726, 1e-6, 'debt')
    expectClose(r.idc, 117.988926, 1e-6, 'idc')
    expectClose(r.postCodInterest, 46.608270, 1e-6, 'post-COD interest')
    expectClose(r.shareCapital, 82.52081054048645, 1e-6, 'share capital') // 3e-8 off: pre-bid input 0.290409 is rounded (G19 −3.9e-7)
    expectClose(r.usl, 247.56243162145938, 1e-6, 'usl')
  })

  it('upfront 1 (STL) is 10% of upfront in the AD month (A-Q5); share capital drawn first (H, I)', () => {
    expectClose(r.months[0].equityStl, 16.504162, 1e-6, 'H72')
    expectClose(r.months[0].equityShareCapital, 56.240779, 1e-6, 'H90')
    expectClose(r.months[1].equityShareCapital, 26.280031, 1e-6, 'I90')
    expect(r.months.slice(2).every((m) => m.equityShareCapital === 0)).toBe(true)
  })

  it('debt only after upfront until (ΣD + STL)/(ΣE + ΣD + STL) = 75% (A-Q9): first deferred equity in Z (Sep-28)', () => {
    expect(r.months.findIndex((m) => m.equityDeferred > 0)).toBe(18)
  })

  it('post-COD draws 25:75 (debt 41.552231, equity 13.850744); debt at COD 948.697496', () => {
    const post = r.months.filter((_, k) => g.periods[k].kind === 'postCod')
    const s = (f: (m: ConstructionMonth) => number) => post.reduce((a, m) => a + f(m), 0)
    expectClose(s((m) => m.debtDraw), 41.552231, 1e-6, 'post-COD debt')
    expectClose(s((m) => m.equityDeferred), 13.850744, 1e-6, 'post-COD equity')
    expectClose(r.months[36].debtBalance, 948.697496, 1e-6, 'debt at COD')
  })

  it('PSBG release 2028-02-11 05:53:22', () => {
    expectClose(r.psbgRelease, fromSerial(46794.24539921296), 1e-6, 'J14')
  })

  it('an extreme input (bid 1,200) returns within 200 ms with converged defined', () => {
    const x = { ...i, deal: { ...i.deal, bidPrice: 1200 } }
    const t = performance.now()
    const res = runConstruction(x, buildGrid(x), opsFor('sample'))
    expect(performance.now() - t).toBeLessThan(200)
    expect(typeof res.converged).toBe('boolean')
    expect(res.iterations).toBeLessThanOrEqual(50)
  })

  it('a non-converging run stops at the cap and reports converged: false', () => {
    const res = runConstruction(i, g, opsFor('sample'), 2)
    expect(res.converged).toBe(false)
    expect(res.iterations).toBe(2)
  })
})
