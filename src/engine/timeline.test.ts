import { describe, it, expect } from 'vitest'
import { DEFAULT_INPUTS as i } from './defaults'
import { addMonths, toDay, toIso } from './dates'
import { buildTimeline, indexFactor } from './timeline'

describe('timeline', () => {
  const t = buildTimeline(i)
  it('key dates', () => {
    expect(toIso(t.award)).toBe('2026-09-06')
    expect(toIso(t.agreement)).toBe('2026-10-21')
    expect(toIso(t.start)).toBe('2027-03-20')
    expect(toIso(t.completion)).toBe('2030-03-18')
    expect(toIso(t.firstPayment)).toBe('2030-09-14')
    expect(toIso(t.end)).toBe('2045-03-18')
  })
  it('payments and months', () => {
    expect(t.payments.length).toBe(2 * i.deal.operateYears)
    expect(t.payments[1]).toBe(addMonths(t.payments[0], 6))
    expect(t.months.length).toBe(37)
  })
  it('indexFactor', () => {
    expect(indexFactor(i, t.bid)).toBe(1)
    expect(indexFactor(i, toDay('2027-07-08'))).toBeCloseTo(1.04, 2)
  })
})
