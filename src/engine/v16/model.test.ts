import { describe, it, expect } from 'vitest'
import { row, rowRaw, inputsFor, kpis, expectSeries, expectClose, fromSerial } from './golden'
import { runV16 } from './model'

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const neg = (a: number[]) => a.map((v) => -v)
// Global Constraints: statement cells ₹0.01 Cr, monthly draws ₹0.001 Cr, IRRs 1e-6, DSCRs 1e-4. The chain matches
// far tighter; these keep a margin over V16's own iteration residuals.
const CELL = 1e-4, DRAW = 1e-3, IRR = 1e-6, DSCR = 1e-4

const SETS = ['sample', 'bid2400', 'epc105', 'build1460', 'equity30', 'rates50bp', 'equated']

for (const set of SETS) {
  describe(`v16 model (full chain, no golden inputs): ${set}`, () => {
    const r = runV16(inputsFor(set)), c = r.cash, k = kpis(set)
    const ig = (n: number) => row(set, `Fin-IGAAP!${n}`)

    it('converges', () => {
      expect(r.converged).toBe(true)
      expect(r.iterations).toBeGreaterThan(0)
    })

    it('KPIs: every IRR variant and DSCR min/avg/max', () => {
      expectClose(r.kpis.projectIrrPre!, k.projectIrrPreAnnual!, IRR, 'project pre')
      expectClose(r.kpis.projectIrrPost!, k.projectIrrPostAnnual!, IRR, 'project post')
      expectClose(r.kpis.equityIrr!, k.equityIrrHalfYearly!, IRR, 'equity half-yearly')
      expectClose(r.kpis.equityIrrPre!, k.equityIrrHalfYearlyPre!, IRR, 'equity half-yearly pre')
      expectClose(r.kpis.equityIrrAnnualPost!, k.equityIrrAnnualPost!, IRR, 'equity annual post')
      expectClose(r.kpis.equityIrrAnnualPre!, k.equityIrrAnnualPre!, IRR, 'equity annual pre')
      expectClose(r.kpis.equityIrrMobAdj!, k.equityIrrMobAdjPost!, IRR, 'equity mob-adjusted')
      expectClose(c.irr.equityMobAdjPre!, k.equityIrrMobAdjPre!, IRR, 'equity mob-adjusted pre')
      expectClose(r.kpis.dscrAvg!, k.dscrAvg!, DSCR, 'dscr avg')
      expectClose(r.kpis.dscrMin!, k.dscrMin!, DSCR, 'dscr min')
      expectClose(r.kpis.dscrMax!, k.dscrMax!, DSCR, 'dscr max')
    })

    it('cash flow statement r69–r121 and cash in bank r61', () => {
      for (const [n, s] of Object.entries(c.lines)) expectSeries(s, ig(+n), CELL, `r${n}`)
      expectSeries(c.inflow, ig(119), CELL, 'r119')
      expectSeries(c.outflow, ig(120), CELL, 'r120')
      expectSeries(c.opening, ig(118), CELL, 'r118')
      expectSeries(c.closing, ig(121), CELL, 'r121')
      expectSeries(c.closing, ig(61), CELL, 'r61')
    })

    it('DSCR rows 124–145', () => {
      const d = c.dscrRows
      const rows: [number, number[]][] = [[124, d.pat], [125, d.bookDep], [126, d.interest], [127, d.accruals],
        [128, d.ffeTransfer], [129, d.mmrRelease], [130, d.outputGst], [132, neg(d.inputGst)], [133, neg(d.gstPaid)],
        [135, neg(d.mmrSetAside)], [136, c.cfads], [137, d.repaymentsInFy], [138, d.cfadsAnnuity],
        [139, d.repayment], [140, d.interest], [141, d.debtService], [142, c.dscr.map((v) => v ?? 0)]]
      for (const [n, s] of rows) expectSeries(s, ig(n), n === 142 ? DSCR : CELL, `r${n}`)
      expectClose(c.dscrAvg!, ig(143).total, DSCR, 'D143')
      expectClose(c.dscrMin!, ig(144).total, DSCR, 'D144')
      expectClose(c.dscrMax!, ig(145).total, DSCR, 'D145')
    })

    it('annual IRR rows 155–172', () => {
      const a = c.annual
      const rows: [number, number[]][] = [[155, a.projectOutflow], [156, a.equityOutflow], [158, a.cfadsPre],
        [159, a.tax], [160, c.cfads], [161, neg(a.repayment)], [162, neg(a.interest)], [163, a.dsrMovement],
        [164, a.equityInflow], [165, c.projectFlows.pre], [166, c.projectFlows.post], [167, a.equityPre],
        [168, a.equityPost]]
      for (const [n, s] of rows) expectSeries(s, ig(n), CELL, `r${n}`)
      expectClose(c.irr.projectPre!, ig(169).total, IRR, 'D169')
      expectClose(c.irr.projectPost!, ig(170).total, IRR, 'D170')
      expectClose(c.irr.equityAnnualPre!, ig(171).total, IRR, 'D171')
      expectClose(c.irr.equityAnnualPost!, ig(172).total, IRR, 'D172')
    })

    it('half-yearly and mob-adjusted equity IRR rows 175–208 (dated)', () => {
      const h = c.equityFlows
      const dates = rowRaw(set, 'Fin-IGAAP!175').values.filter((v) => v !== null).map((v) => fromSerial(v!))
      expect(h.dates).toEqual(dates)
      const rows: [number, number[]][] = [[184, h.outflow], [189, h.inflow], [190, h.post], [191, h.tax],
        [192, h.pre], [199, h.mobBalance], [201, h.mobAdjusted], [203, h.mobPost], [205, h.mobPre]]
      for (const [n, s] of rows) expectSeries(s, ig(n), CELL, `r${n}`)
      expectClose(sum(h.inflow), ig(189).total, CELL, 'D189')
      expectClose(c.irr.equityHalfYearly!, ig(194).total, IRR, 'D194')
      expectClose(c.irr.equityHalfYearlyPre!, ig(195).total, IRR, 'D195')
      expectClose(c.irr.equityMobAdj!, ig(207).total, IRR, 'D207')
      expectClose(c.irr.equityMobAdjPre!, ig(208).total, IRR, 'D208')
    })

    it('integration: tax r35, cash for DSCR r136, interest on funds r12, construction draws and totals', () => {
      expectSeries(neg(r.tax.tax), ig(35), CELL, 'r35')
      expectSeries(c.cfads, ig(136), CELL, 'r136')
      expectSeries(r.funds.interestOnFunds, ig(12), CELL, 'r12')
      expectSeries(r.igaap.pat, ig(36), CELL, 'r36')
      expectSeries(neg(r.igaap.csr), ig(34), CELL, 'r34')
      const m = r.construction.months, cop = (n: number) => row(set, `COP-MOF!${n}`)
      expectSeries(m.map((x) => x.debtDraw), cop(75), DRAW, 'COP-MOF r75')
      expectSeries(m.map((x) => x.equityShareCapital), cop(90), DRAW, 'COP-MOF r90')
      expectSeries(m.map((x) => x.equityUsl), cop(91), DRAW, 'COP-MOF r91')
      expectSeries(m.map((x) => x.dsrInterest), cop(42), DRAW, 'COP-MOF r42 interest DSR')
      expectSeries(m.map((x) => x.opex), cop(38), DRAW, 'COP-MOF r38 post-COD O&M')
      expectClose(r.construction.debt, rowRaw(set, 'COP-MOF!75').lead!['4'], DRAW, 'D75')
      expectClose(r.construction.equity, rowRaw(set, 'COP-MOF!70').lead!['4'], DRAW, 'D70')
      expectClose(r.construction.tpc, cop(46).total, DRAW, 'G46')
    })
  })
}

describe('v16 model: sample targets', () => {
  const i = inputsFor('sample'), r = runV16(i)

  it('brief values (B §9, §10)', () => {
    expectClose(r.cash.closing[r.cash.closing.length - 1], 1123.3026931195573, CELL, 'cash FY45') // opex carries ~1e-6
    expectClose(r.kpis.projectIrrPre!, 0.11756865643843484, IRR, 'project pre')
    expectClose(r.kpis.projectIrrPost!, 0.10429227047105294, IRR, 'project post')
    expectClose(r.kpis.equityIrr!, 0.15091964602470398, IRR, 'equity half-yearly')
    expectClose(r.kpis.equityIrrPre!, 0.18318542838096616, IRR, 'equity half-yearly pre')
    expectClose(r.kpis.equityIrrAnnualPost!, 0.15479997797143308, IRR, 'equity annual post')
    expectClose(r.kpis.equityIrrAnnualPre!, 0.18806922538694915, IRR, 'equity annual pre')
    expectClose(r.kpis.equityIrrMobAdj!, 0.16736456751823428, IRR, 'mob-adjusted')
    expectClose(r.kpis.dscrAvg!, 1.4667248362973662, DSCR, 'dscr avg')
    expectClose(r.kpis.dscrMin!, 1.1966405451878497, DSCR, 'dscr min')
    expectClose(r.kpis.dscrMax!, 1.820775755243809, DSCR, 'dscr max')
  })

  it('KPI summary fields', () => {
    expectClose(r.kpis.debt, 990.249726, 1e-6, 'debt')
    expectClose(r.kpis.equity, 330.083242, 1e-6, 'equity')
    expectClose(r.kpis.totalProjectCost, 2465.686875, 1e-6, 'tpc')
    expectClose(r.kpis.grant, 970.638904, 1e-6, 'grant')
    expectClose(r.kpis.completionBase, 1480.714521, 1e-6, 'completion base')
    expectClose(r.kpis.leverage, 990.249726 / 330.083242, 1e-6, 'leverage')
    expectClose(r.kpis.omMargin, row('sample', 'Fin-IGAAP!10').total + row('sample', 'Fin-IGAAP!25').total, 1e-5, 'O&M margin')
  })

  it('FY30 equity inflow is dropped from the half-yearly IRR (B-Q1)', () => {
    expectClose(sum(r.cash.annual.equityInflow) - sum(r.cash.equityFlows.inflow), 0.0587, 1e-4, 'Q1')
  })

  it('method notes: B-Q5 average DSCR with the consistent ≈ 1.4250, and the generalisations', () => {
    const q5 = r.notes.find((n) => n.id === 'B-Q5')!
    expectClose(q5.v16Value!, 1.4667248362973662, DSCR, 'v16')
    expectClose(q5.consistentValue!, 1.4250, 1e-3, 'consistent')
    for (const id of ['A-PIM-APRIL', 'A-PSBG-SEARCH', 'B-CP-GST-ROW', 'B-CSR-END'])
      expect(r.notes.some((n) => n.id === id), id).toBe(true)
    expect(r.notes.every((n) => n.text.length > 0 && n.text.length < 400)).toBe(true)
  })

  it('runs in under 50 ms (median of 5)', () => {
    const t = Array.from({ length: 5 }, () => { const s = performance.now(); runV16(i); return performance.now() - s })
    expect(t.sort((a, b) => a - b)[2]).toBeLessThan(50)
  })

  it('bid 1,200 returns within 200 ms with converged defined', () => {
    const x = { ...i, deal: { ...i.deal, bidPrice: 1200 } }
    const s = performance.now(), res = runV16(x)
    expect(performance.now() - s).toBeLessThan(200)
    expect(typeof res.converged).toBe('boolean')
    expect(res.iterations).toBeLessThanOrEqual(100) // 50 per loop
  })

  it('keeps the invalid-date contract: throws', () => {
    expect(() => runV16({ ...i, deal: { ...i.deal, bidDate: '2026-02-30' } })).toThrow()
  })
})
