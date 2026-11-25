import { describe, it, expect } from 'vitest'
import { toDay, toIso, addDays, addMonths, eomonth, fyEnd, yearsBetween } from './dates'

describe('dates', () => {
  it('addMonths clamps to month end like EDATE', () => {
    expect(toIso(addMonths(toDay('2026-01-31'), 1))).toBe('2026-02-28')
    expect(toIso(addMonths(toDay('2026-11-15'), 3))).toBe('2027-02-15')
  })
  it('fyEnd returns 31 Mar of the Indian FY', () => {
    expect(toIso(fyEnd(toDay('2026-07-08')))).toBe('2027-03-31')
    expect(toIso(fyEnd(toDay('2027-03-31')))).toBe('2027-03-31')
    expect(toIso(fyEnd(toDay('2027-04-01')))).toBe('2028-03-31')
  })
  it('addDays / eomonth / yearsBetween', () => {
    expect(toIso(addDays(toDay('2027-03-20'), 1094))).toBe('2030-03-18')
    expect(toIso(eomonth(toDay('2024-02-10')))).toBe('2024-02-29')
    expect(yearsBetween(0, 365)).toBe(1)
  })
  it('toDay epoch', () => {
    expect(toDay('1970-01-02')).toBe(1)
  })
})
