import { describe, expect, it } from 'vitest'
import { formatNumber, parseNumber } from './parse'

describe('parseNumber', () => {
  it('rejects empty, sign-only, malformed and non-numeric input', () => {
    expect(parseNumber('', 'money').ok).toBe(false)
    expect(parseNumber('   ', 'money').ok).toBe(false)
    expect(parseNumber('-', 'money').ok).toBe(false)
    expect(parseNumber('1,2,', 'money').ok).toBe(false)
    expect(parseNumber('abc', 'percent').ok).toBe(false)
    expect(parseNumber('1.2.3', 'number').ok).toBe(false)
    expect(parseNumber('Infinity', 'number').ok).toBe(false)
  })

  it('strips grouping commas, ₹ and units', () => {
    expect(parseNumber('2,250', 'money')).toEqual({ ok: true, value: 2250 })
    expect(parseNumber('₹2,250 Cr', 'money')).toEqual({ ok: true, value: 2250 })
    expect(parseNumber('1,00,000.5', 'money')).toEqual({ ok: true, value: 100000.5 })
    expect(parseNumber('-5', 'money')).toEqual({ ok: true, value: -5 })
    expect(parseNumber('.5', 'number')).toEqual({ ok: true, value: 0.5 })
  })

  it('reads percent kinds as percent points without float residue', () => {
    expect(parseNumber('9.82', 'percent')).toEqual({ ok: true, value: 0.0982 })
    expect(parseNumber('9.82%', 'percentList')).toEqual({ ok: true, value: 0.0982 })
    expect(parseNumber('0.14', 'percent')).toEqual({ ok: true, value: 0.0014 })
  })
})

describe('formatNumber', () => {
  it('groups en-IN and shows percent kinds ×100 so they round-trip', () => {
    expect(formatNumber(2250, 'money')).toBe('2,250')
    expect(formatNumber(0.0014, 'percent')).toBe('0.14')
    expect(formatNumber(0.0975, 'percent')).toBe('9.75')
    for (const [v, k] of [[0.0982, 'percent'], [2.3104, 'money'], [1095, 'days']] as const)
      expect(parseNumber(formatNumber(v, k), k)).toEqual({ ok: true, value: v })
  })
})
