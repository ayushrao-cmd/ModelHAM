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
  it('reports an unreachable target with both range ends', () => {
    const r = solveBidPrice(DEFAULT_INPUTS, 0.6)
    expect(r.ok).toBe(false)
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
})
