import { describe, it, expect } from 'vitest'
import { DEFAULT_INPUTS } from './defaults'
import { runModel } from './model'
import { solveBidPrice } from './solve'
import { tornado } from './sensitivity'

const irr = (r: ReturnType<typeof runModel>) => r.kpis.equityIrr
const base = runModel(DEFAULT_INPUTS).kpis.equityIrr as number

describe('solveBidPrice', () => {
  it('recovers the default bid from the default equity IRR', () => {
    const t0 = performance.now()
    const r = solveBidPrice(DEFAULT_INPUTS, base)
    const ms = performance.now() - t0
    expect(r.ok).toBe(true)
    if (r.ok) expect(Math.abs(r.bidPrice - 2250)).toBeLessThan(1)
    expect(r.runs).toBeLessThanOrEqual(40)
    expect(ms).toBeLessThan(1000)
  })
  it.each([1800, 2900])('bisects to a target taken from bid %i', bid => {
    const target = runModel({ ...DEFAULT_INPUTS, deal: { ...DEFAULT_INPUTS.deal, bidPrice: bid } }).kpis.equityIrr as number
    const r = solveBidPrice(DEFAULT_INPUTS, target)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Math.abs(r.bidPrice - bid)).toBeLessThan(1)
      expect(Math.abs(r.equityIrr - target)).toBeLessThan(1e-4)
      expect(r.runs).toBeGreaterThan(3)
    }
    expect(r.runs).toBeLessThanOrEqual(40)
  })
  it('honours an explicit range', () => {
    const target = runModel({ ...DEFAULT_INPUTS, deal: { ...DEFAULT_INPUTS.deal, bidPrice: 2000 } }).kpis.equityIrr as number
    const r = solveBidPrice(DEFAULT_INPUTS, target, [1500, 2100])
    expect(r.ok).toBe(true)
    if (r.ok) expect(Math.abs(r.bidPrice - 2000)).toBeLessThan(1)
  })
  it('fails when the run cap is hit without converging', () => {
    const target = runModel({ ...DEFAULT_INPUTS, deal: { ...DEFAULT_INPUTS.deal, bidPrice: 1800 } }).kpis.equityIrr as number
    const r = solveBidPrice(DEFAULT_INPUTS, target, undefined, 6)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('Solver did not converge within 6 runs')
    expect(r.runs).toBe(6)
  })
  it('reports an unreachable target with both range ends', () => {
    const r = solveBidPrice(DEFAULT_INPUTS, 0.6)
    expect(r.ok).toBe(false)
    expect(r.runs).toBe(2)
    if (!r.ok) {
      expect(r.reason).toContain('₹1,125.00 Cr')
      expect(r.reason).toContain('₹3,375.00 Cr')
    }
  })
})

describe('tornado', () => {
  const bars = tornado(DEFAULT_INPUTS, irr)
  it('has 6 bars, sorted by spread, base = model result', () => {
    expect(bars).toHaveLength(6)
    const spread = (b: (typeof bars)[0]) => Math.abs((b.high ?? 0) - (b.low ?? 0))
    for (let k = 1; k < bars.length; k++) expect(spread(bars[0])).toBeGreaterThanOrEqual(spread(bars[k]))
    bars.forEach(b => expect(b.base).toBe(base))
  })
  it('does not mutate inputs and Annuity Rate moves the metric', () => {
    const copy = JSON.parse(JSON.stringify(DEFAULT_INPUTS))
    const bs = tornado(DEFAULT_INPUTS, irr)
    expect(DEFAULT_INPUTS).toEqual(copy)
    const a = bs.find(b => b.key === 'bankRates')!
    expect(a.low).not.toBe(a.high)
  })
})
