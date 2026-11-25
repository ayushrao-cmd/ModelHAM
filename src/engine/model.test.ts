import { describe, it, expect } from 'vitest'
import { DEFAULT_INPUTS as i } from './defaults'
import { runModel } from './model'
import { opexForYear } from './operations'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('runModel', () => {
  const r = runModel(i)
  const k = r.kpis

  it('runs in < 50 ms (mean of 5)', () => {
    runModel(i) // warm-up
    const t0 = performance.now()
    for (let n = 0; n < 5; n++) runModel(i)
    expect((performance.now() - t0) / 5).toBeLessThan(50)
  })

  it('calibration band vs the workbook (spec §7)', () => {
    const band: [keyof typeof k, number, number][] = [
      ['equityIrr', 0.151, 0.015], ['projectIrrPre', 0.118, 0.015], ['projectIrrPost', 0.104, 0.015],
      ['dscrMin', 1.20, 0.15], ['dscrAvg', 1.47, 0.15],
    ]
    const rows = band.map(([key, target, tol]) => {
      const v = k[key] as number | null
      return { kpi: key, model: v, target, diff: v == null ? null : v - target, ok: v != null && Math.abs(v - target) <= tol }
    })
    if (rows.some(x => !x.ok)) console.table(rows)
    expect(rows.filter(x => !x.ok).map(x => x.kpi)).toEqual([])
  })

  it('leverage = debt / equity', () => expect(k.leverage).toBeCloseTo(k.debt / k.equity, 10))

  it('dscrAvg = Σ cfads / Σ debt service over serviced periods', () => {
    const served = r.ops.filter(p => p.principal + p.interest > 0)
    expect(k.dscrAvg).toBeCloseTo(sum(served.map(p => p.cfads)) / sum(served.map(p => p.principal + p.interest)), 10)
    expect(k.dscrMin).toBeCloseTo(Math.min(...served.map(p => p.dscr!)), 10)
  })

  it('omMargin = Σ O&M payments − Σ opex', () =>
    expect(k.omMargin).toBeCloseTo(sum(r.ops.map(p => p.omPayment - p.opex)), 10))

  it('build reserve and working capital match period 1 of operations (exact epcVariable, actual day count)', () => {
    const p1 = r.ops[0]
    expect(r.build.reserve).toBeCloseTo(p1.principal + p1.interest, 2) // ~₹0.002 Cr iteration lag
    const epcNet = i.build.epcFixed + r.build.epcVariable
    expect(r.build.workingCapital).toBeCloseTo(opexForYear(i, 1, r.timeline.completion, epcNet).total / 2 + p1.interest, 2)
    expect(r.ops[0].reserveMovement).toBeCloseTo(r.ops[0].reserveBalance - r.build.reserve, 10)
  })

  it('low bid (Review Focus 2) does not throw and gives no NaN IRRs', () => {
    const lo = runModel({ ...i, deal: { ...i.deal, bidPrice: 100 } }).kpis
    for (const v of [lo.projectIrrPre, lo.projectIrrPost, lo.equityIrr]) {
      expect(v === null || typeof v === 'number').toBe(true)
      expect(Number.isNaN(v)).toBe(false)
    }
  })
})
