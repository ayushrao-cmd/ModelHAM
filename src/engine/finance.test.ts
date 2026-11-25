import { describe, it, expect } from 'vitest'
import { xirr, npv } from './finance'

describe('finance', () => {
  it('xirr simple 10%', () => {
    expect(xirr([{ day: 0, amount: -100 }, { day: 365, amount: 110 }])!).toBeCloseTo(0.1, 6)
  })
  it('xirr null without both signs', () => {
    expect(xirr([{ day: 0, amount: -100 }, { day: 365, amount: -5 }])).toBeNull()
  })
  it('xirr deep negative still finite', () => {
    expect(xirr([{ day: 0, amount: -100 }, { day: 365, amount: 1 }])!).toBeCloseTo(-0.99, 1)
  })
  it('npv at irr is zero', () => {
    expect(npv(0.1, [{ day: 0, amount: -100 }, { day: 365, amount: 110 }])).toBeCloseTo(0, 6)
  })
})
