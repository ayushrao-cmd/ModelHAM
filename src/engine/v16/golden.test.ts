import { describe, it, expect } from 'vitest'
import { row, rowRaw, kpis, cols, golden } from './golden'

describe('golden sample', () => {
  it('matches V16 cached values', () => {
    expect(row('sampleCached', 'Fin-IGAAP!36').total).toBeCloseTo(793.2194509898166, 9)
    expect(row('sampleCached', 'Fin-INDAS!49').total).toBeCloseTo(788.706066821826, 9)
    expect(row('sampleCached', 'Fin-IGAAP!63').values.every((v) => Math.abs(v) < 1e-6)).toBe(true)
    expect(kpis('sampleCached').equityIrrHalfYearly).toBeCloseTo(0.15091964602470398, 9)
    expect(cols('sampleCached')['Fin-IGAAP'][0]).toBe('2027-03-31')
  })

  it('keeps full float precision', () => {
    expect(row('sampleCached', 'Fin-IGAAP!36').total).toBe(793.2194509898166)
    expect(kpis('sampleCached').equityIrrHalfYearly).toBe(0.15091964602470398)
    expect(row('sample', 'Fin-IGAAP!36').total).toBe(793.2194510802694)
  })

  it('sample is the converged recalculation of the unchanged workbook', () => {
    const g = golden('sample')
    expect(g.meta.source).toBe('tight recalculation of the unchanged workbook')
    expect(g.meta.v16Residual!).toBeLessThan(1e-9)
    // cached V16 stopped early (100 iterations, 0.001): statements move by < 1e-7, KPIs by < 1e-9
    expect(Math.abs(row('sample', 'Fin-IGAAP!36').total - 793.2194509898166)).toBeLessThan(1e-7) // 9.05e-8
    expect(Math.abs(row('sample', 'Fin-INDAS!49').total - 788.706066821826)).toBeLessThan(1e-7) // 8.40e-8
    expect(kpis('sample').equityIrrHalfYearly).toBe(kpis('sampleCached').equityIrrHalfYearly)
    // the Debt tail is where the cached values had not converged (up to 0.0028)
    expect(Math.abs(rowRaw('sample', 'Debt!30').values[201]!)).toBeLessThan(1e-6)
    expect(rowRaw('sampleCached', 'Debt!30').values[201]!).toBeGreaterThan(0.002)
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
  const SETS = ['sample', 'sampleCached', 'bid2400', 'epc105', 'build1460', 'equity30', 'rates50bp', 'equated']
  it.each(SETS)('%s loads; BS and cash checks are 0 every FY (IGAAP and IndAS)', (set) => {
    const g = golden(set)
    if (!set.startsWith('sample')) {
      expect(g.meta.set).toBe(set)
      expect(Object.keys(g.meta.inputs).length).toBeGreaterThan(0)
    }
    // BS checks (IGAAP r63, IndAS r76) and cash checks (IGAAP r64, IndAS r77)
    for (const key of ['Fin-IGAAP!63', 'Fin-INDAS!76', 'Fin-IGAAP!64', 'Fin-INDAS!77']) {
      const vals = rowRaw(set, key).values.filter((v): v is number => v !== null)
      expect(vals.length, key).toBeGreaterThanOrEqual(19)
      for (const v of vals) expect(Math.abs(v), key).toBeLessThan(1e-6)
    }
  })
  it('a higher bid lifts equity IRR', () => {
    expect(kpis('bid2400').equityIrrHalfYearly!).toBeGreaterThan(kpis('sample').equityIrrHalfYearly!)
  })
})
