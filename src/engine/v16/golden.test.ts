import { describe, it, expect } from 'vitest'
import { row, rowRaw, kpis, cols, golden } from './golden'

describe('golden sample', () => {
  it('matches V16 cached values', () => {
    expect(row('sample', 'Fin-IGAAP!36').total).toBeCloseTo(793.2194509898166, 9)
    expect(row('sample', 'Fin-INDAS!49').total).toBeCloseTo(788.706066821826, 9)
    expect(row('sample', 'Fin-IGAAP!63').values.every((v) => Math.abs(v) < 1e-6)).toBe(true)
    expect(kpis('sample').equityIrrHalfYearly).toBeCloseTo(0.15091964602470398, 9)
    expect(cols('sample')['Fin-IGAAP'][0]).toBe('2027-03-31')
  })

  it('keeps full float precision', () => {
    expect(row('sample', 'Fin-IGAAP!36').total).toBe(793.2194509898166)
    expect(kpis('sample').equityIrrHalfYearly).toBe(0.15091964602470398)
  })

  it('exports full extents with aligned columns', () => {
    const g = golden('sample')
    for (const [key, r] of Object.entries(g.cells)) {
      const sheet = key.split('!')[0]
      expect(r.values.length, key).toBe(g.cols[sheet].length)
    }
    expect(rowRaw('sample', 'DB!72').label).toBe('Dates')
    expect(rowRaw('sample', 'DB!78').label).toBe('Year End')
    expect(rowRaw('sample', 'Debt!8').values.length).toBeGreaterThanOrEqual(200) // runs past column ER
    expect(rowRaw('sample', 'Inflation!47').values.length).toBeGreaterThanOrEqual(360) // past AK
    // post-COD COP-MOF month columns (index 37..43) exist
    expect(cols('sample')['COP-MOF'][43]).toBe('2030-09-30')
    expect(rowRaw('sample', 'Fin-IGAAP!63').values[0]).toBe(0)
  })
})

describe('differential goldens', () => {
  const SETS = ['bid2400', 'epc105', 'build1460', 'equity30', 'rates50bp', 'equated']
  it.each(SETS)('%s loads and its IGAAP balance sheet balances every FY', (set) => {
    const g = golden(set)
    expect(g.meta.set).toBe(set)
    expect(Object.keys(g.meta.inputs).length).toBeGreaterThan(0)
    const bs = rowRaw(set, 'Fin-IGAAP!63').values.filter((v): v is number => v !== null)
    expect(bs.length).toBeGreaterThanOrEqual(19)
    for (const v of bs) expect(Math.abs(v)).toBeLessThan(1e-6)
  })
  it('a higher bid lifts equity IRR', () => {
    expect(kpis('bid2400').equityIrrHalfYearly!).toBeGreaterThan(kpis('sample').equityIrrHalfYearly!)
  })
})
