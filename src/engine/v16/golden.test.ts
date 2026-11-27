import { describe, it, expect } from 'vitest'
import { row, kpis, cols } from './golden'

describe('golden sample', () => {
  it('matches V16 cached values', () => {
    expect(row('sample', 'Fin-IGAAP!36').total).toBeCloseTo(793.2194509898166, 9)
    expect(row('sample', 'Fin-INDAS!49').total).toBeCloseTo(788.706066821826, 9)
    expect(row('sample', 'Fin-IGAAP!63').values.every((v) => Math.abs(v ?? 0) < 1e-6)).toBe(true)
    expect(kpis('sample').equityIrrHalfYearly).toBeCloseTo(0.15091964602470398, 9)
    expect(cols('sample')['Fin-IGAAP'][0]).toBe('2027-03-31')
  })
})
