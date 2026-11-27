import { describe, it, expect } from 'vitest'
import { toDay, toIso } from '../dates'
import { row, rowRaw, cols, inputsFor, fromSerial, XL } from './golden'
import { V16_SAMPLE } from './sample'
import { buildGrid } from './grid'
import { pim, inflationIndex } from './indices'

const SETS = ['sample', 'bid2400', 'epc105', 'build1460', 'equity30', 'rates50bp', 'equated']
const day = fromSerial

/** Golden values of an FY-keyed row, picked at the grid's FY ends via the sheet's column dates. */
function atFys(set: string, key: string, colKey: string, fys: number[]): number[] {
  const c = cols(set)[colKey], r = row(set, key)
  return fys.map((f) => {
    const k = c.indexOf(toIso(f))
    if (k < 0) throw new Error(`${key}: no column for ${toIso(f)}`)
    return r.values[k]
  })
}
const close = (a: number[], b: number[], tol: number) => {
  expect(a.length).toBe(b.length)
  a.forEach((v, k) => expect(Math.abs(v - b[k]), `[${k}] ${v} vs ${b[k]}`).toBeLessThanOrEqual(tol))
}

describe('v16 grid: sample', () => {
  const g = buildGrid(V16_SAMPLE)

  it('key dates (DB row 12)', () => {
    expect(toIso(g.appointed)).toBe('2027-03-20')
    expect(toIso(g.constructionEnd)).toBe('2030-03-18')
    expect(toIso(g.cod)).toBe('2030-03-19')
    expect(toIso(g.firstAnnuity)).toBe('2030-09-15')
    expect(toIso(g.concessionEnd)).toBe('2045-03-18')
  })

  it('37 construction + 7 post-COD periods; last post-COD period 14 days (A-Q2)', () => {
    expect(g.periods.filter((p) => p.kind === 'construction')).toHaveLength(37)
    const post = g.periods.filter((p) => p.kind === 'postCod')
    expect(post.map((p) => p.days)).toEqual([13, 30, 31, 30, 31, 31, 14])
    expect(g.periods.filter((p) => p.kind === 'construction').reduce((s, p) => s + p.days, 0)).toBe(1095)
  })

  it('annuities: 30, half-yearly, annuity 30 on concession end (B-Q14)', () => {
    expect(g.annuities).toHaveLength(30)
    expect(toIso(g.annuities[1])).toBe('2031-03-15')
    expect(toIso(g.annuities[28])).toBe('2044-09-15')
    expect(toIso(g.annuities[29])).toBe('2045-03-18')
  })

  it('FY grid FY27..FY45 and factors', () => {
    expect(toIso(g.fys[0])).toBe('2027-03-31')
    expect(toIso(g.fys[g.fys.length - 1])).toBe('2045-03-31')
    expect(g.fys).toHaveLength(19)
    const fy = (iso: string) => g.fys.indexOf(toDay(iso))
    expect(g.opFactorAnnuity[fy('2031-03-31')]).toBeCloseTo(0.5397260273972603, 15)
    expect(g.opFactorCod[fy('2030-03-31')]).toBeCloseTo(0.03561643835616438, 15)
    expect(g.opFactorCod[fy('2032-03-31')]).toBeCloseTo(0.9999026873268958, 15) // B-Q11
    expect(g.opFactorCod[fy('2033-03-31')]).toBeCloseTo(1.0000973126731043, 15)
    expect(g.opFactorCod[fy('2045-03-31')]).toBeCloseTo(0.9644808743169399, 15) // vs N19 0.964384
    expect(g.fyDays[fy('2028-03-31')]).toBe(366)
  })

  it('inflation indices by FY end (Inflation r36 RM/MM 4.5%, r40 manpower 7%, r38 electricity 3%, r44 none)', () => {
    const inf = V16_SAMPLE.operations.inflation
    close(inflationIndex(V16_SAMPLE, g, inf.maintenance), atFys('sample', 'Inflation!36', 'Inflation', g.fys), 1e-9)
    close(inflationIndex(V16_SAMPLE, g, inf.maintenance), atFys('sample', 'Inflation!37', 'Inflation', g.fys), 1e-9)
    close(inflationIndex(V16_SAMPLE, g, inf.staff), atFys('sample', 'Inflation!40', 'Inflation', g.fys), 1e-9)
    close(inflationIndex(V16_SAMPLE, g, inf.electricity), atFys('sample', 'Inflation!38', 'Inflation', g.fys), 1e-9)
    close(inflationIndex(V16_SAMPLE, g, inf.insurance), atFys('sample', 'Inflation!44', 'Inflation', g.fys), 1e-9)
  })

  it('grant PIM at the interpolated milestone dates (DB r76 → r81, A-Q6)', () => {
    const p = pim(V16_SAMPLE, g)
    const dates = row('sample', 'DB!76').values.slice(1, 12)
    const idx = row('sample', 'DB!81').values.slice(1, 12)
    close(dates.map((d) => p.grantAt(day(d))), idx.map((v) => v / 100), 1e-12)
    expect(p.grantAt(day(dates[0]))).toBeCloseTo(1.0350684931506848, 15)
  })
})

describe.each(SETS)('v16 grid vs golden %s', (set) => {
  const i = inputsFor(set)
  const g = buildGrid(i)

  it('key dates match DB row 12', () => {
    const d = rowRaw(set, 'DB!12').values as number[]
    expect(g.bid).toBe(day(d[0]))
    expect(g.appointed).toBe(day(d[4]))
    expect(g.constructionEnd).toBe(day(d[6]))
    expect(g.cod).toBe(day(d[7]))
    expect(g.firstAnnuity).toBe(day(d[8]))
    expect(g.concessionEnd).toBe(day(d[11]))
  })

  it('periods match COP-MOF rows 7, 8, 11, 12, 13', () => {
    const n = g.periods.length
    const r = (k: number) => rowRaw(set, `COP-MOF!${k}`).values
    expect(r(7)[n]).toBeNull()
    expect(g.periods.map((p) => p.start)).toEqual(r(7).slice(0, n).map((v) => day(v!)))
    expect(g.periods.map((p) => p.end)).toEqual(r(8).slice(0, n).map((v) => day(v!)))
    expect(g.periods.map((p) => p.fy)).toEqual(r(11).slice(0, n).map((v) => day(v!)))
    expect(g.periods.map((p) => (p.kind === 'construction' ? p.days : 0))).toEqual(r(12).slice(0, n))
    expect(g.periods.map((p) => (p.kind === 'postCod' ? p.days : 0))).toEqual(r(13).slice(0, n))
  })

  it('annuity dates match Revenue row 4', () => {
    const r = rowRaw(set, 'Revenue!4').values
    expect(g.annuities.map((d) => d + XL)).toEqual(r.slice(1, 1 + g.annuities.length))
    expect(r[1 + g.annuities.length]).toBeNull()
  })

  it('FY columns and factor rows match Fin-IGAAP r3-r5, Fin-INDAS r4', () => {
    const fys = rowRaw(set, 'Fin-IGAAP!3').values.filter((v) => v !== null).map((v) => day(v!))
    expect(g.fys).toEqual(fys)
    const n = g.fys.length
    close(g.opFactorAnnuity, row(set, 'Fin-IGAAP!4').values.slice(0, n), 1e-15)
    close(g.opFactorCod, row(set, 'Fin-IGAAP!5').values.slice(0, n), 1e-15)
    close(g.constructionFactor, row(set, 'Fin-INDAS!4').values.slice(0, n), 1e-15)
  })

  it('concession years match O&M Cost rows 4, 6, 7', () => {
    const n = g.concessionYears.length
    const r = (k: number) => rowRaw(set, `O&M Cost!${k}`).values.slice(5, 5 + n)
    expect(g.concessionYears.map((y) => y.start)).toEqual(r(4).map((v) => day(v!)))
    expect(g.concessionYears.map((y) => y.end)).toEqual(r(7).map((v) => day(v!)))
    close(g.concessionYears.map((y) => y.share), r(6) as number[], 1e-15)
    expect(rowRaw(set, 'O&M Cost!4').values[5 + n]).toBeNull()
  })

  it('PIM: FY-end series (Inflation r32), payment-date index (Revenue r37), grant (DB r81)', () => {
    const p = pim(i, g)
    close(p.atFyEnd, atFys(set, 'Inflation!32', 'Inflation', g.fys), 1e-12)
    close(g.annuities.map((d) => p.at(d)), row(set, 'Revenue!37').values.slice(1, 1 + g.annuities.length), 1e-12)
    const m = row(set, 'DB!76').values.slice(1, 12)
    close(m.map((d) => p.grantAt(day(d))), row(set, 'DB!81').values.slice(1, 12).map((v) => v / 100), 1e-12)
  })

  it('inflation indices match Inflation r36/r38/r40/r44', () => {
    const inf = i.operations.inflation
    for (const [rate, r] of [[inf.maintenance, 36], [inf.electricity, 38], [inf.staff, 40], [inf.insurance, 44]])
      close(inflationIndex(i, g, rate), atFys(set, `Inflation!${r}`, 'Inflation', g.fys), 1e-9)
  })
})

describe('v16 grid: build1460 moves COD into FY31', () => {
  const g = buildGrid(inputsFor('build1460'))
  it('dates and FY grid', () => {
    expect(toIso(g.cod)).toBe('2031-03-19')
    expect(toIso(g.firstAnnuity)).toBe('2031-09-15')
    expect(toIso(g.concessionEnd)).toBe('2046-03-18')
    expect(toIso(g.fys[g.fys.length - 1])).toBe('2046-03-31')
    expect(g.fys).toHaveLength(20)
    const fy = (iso: string) => g.fys.indexOf(toDay(iso))
    expect(g.opFactorCod[fy('2030-03-31')]).toBe(0)
    expect(g.opFactorCod[fy('2031-03-31')]).toBeCloseTo(0.03561643835616438, 15)
    expect(g.opFactorAnnuity[fy('2032-03-31')]).toBeCloseTo(0.5424657534246575, 15)
    expect(g.constructionFactor[fy('2031-03-31')]).toBeCloseTo(0.9643835616438357, 15)
  })
})

describe('v16 grid: invalid dates throw instead of looping', () => {
  for (const bidDate of ['2026-02-30', '']) {
    it(`bid date "${bidDate}"`, () => {
      const i = { ...V16_SAMPLE, deal: { ...V16_SAMPLE.deal, bidDate } }
      expect(() => buildGrid(i)).toThrow(/v16 grid: invalid bid date/)
    })
  }
  it('a non-finite derived date (first-payment lag NaN)', () => {
    const i = { ...V16_SAMPLE, income: { ...V16_SAMPLE.income, firstPaymentLagDays: NaN } }
    expect(() => buildGrid(i)).toThrow(/v16 grid: invalid dates/)
  })
})
