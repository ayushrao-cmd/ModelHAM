import { describe, it, expect } from 'vitest'
import { fmt } from './format'

describe('fmt', () => {
  it('formats money, percent, multiple and date (en-IN, UTC)', () => {
    expect(fmt.cr(2250)).toBe('₹2,250.00 Cr')
    expect(fmt.cr(1234567.891)).toBe('₹12,34,567.89 Cr')
    expect(fmt.pct(0.0982)).toBe('9.82%')
    expect(fmt.pct(0.008, 1)).toBe('0.8%')
    expect(fmt.x(1.4667)).toBe('1.47×')
    expect(fmt.date('2026-07-08')).toBe('08 Jul 2026')
    expect(fmt.date(0)).toBe('01 Jan 1970')
    expect(fmt.num(1095, 0)).toBe('1,095')
    expect(fmt.cr(-25.335)).toBe('-₹25.34 Cr')
  })
  it('null, NaN and ±Infinity render as an em dash', () => {
    expect(fmt.cr(NaN)).toBe('—')
    expect(fmt.cr(null)).toBe('—')
    expect(fmt.pct(Infinity)).toBe('—')
    expect(fmt.x(-Infinity)).toBe('—')
    expect(fmt.num(null)).toBe('—')
  })
})
