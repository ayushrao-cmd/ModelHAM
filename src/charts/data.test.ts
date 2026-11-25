import { describe, it, expect } from 'vitest'
import { DEFAULT_INPUTS as i } from '../engine/defaults'
import { runModel } from '../engine/model'
import { sourcesUsesData, drawdownData, milestoneData, incomeData, dscrData, debtData, waterfallData } from './data'

const r = runModel(i)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('chart data mappers', () => {
  it('sources equal uses and uses group to <= 6 segments', () => {
    const d = sourcesUsesData(r)
    expect(Math.abs(d.totalSources - d.totalUses)).toBeLessThan(0.01)
    expect(d.sources).toHaveLength(4)
    expect(d.uses.length).toBeLessThanOrEqual(6)
    expect(sum(d.uses.map(u => u.value))).toBeCloseTo(d.totalUses, 6)
  })
  it('drawdown has one row per month and 4 milestone markers', () => {
    const d = drawdownData(r)
    expect(d.rows).toHaveLength(r.timeline.months.length)
    expect(d.markers.map(m => m.label)).toEqual(['M1', 'M2', 'M3', 'M4'])
    d.markers.forEach(m => expect(d.rows.some(x => x.month === m.month)).toBe(true))
  })
  it('milestone data pairs required with projected', () => {
    const d = milestoneData(r)
    expect(d).toHaveLength(i.milestones.length)
    expect(d[0].reqPhysical).toBe(i.milestones[0].physical)
    expect(d[3].projPhysical).toBeGreaterThan(0.9)
  })
  it('income rows per period', () => {
    const d = incomeData(r)
    expect(d).toHaveLength(r.ops.length)
    expect(sum(d.map(x => x.completion))).toBeCloseTo(sum(r.ops.map(p => p.completionPayment)), 6)
  })
  it('dscr excludes unserviced (null) periods and carries lines', () => {
    const d = dscrData(r)
    expect(d.rows.length).toBe(r.ops.filter(p => p.dscr != null).length)
    expect(d.rows.every(x => Number.isFinite(x.dscr))).toBe(true)
    expect(d.floor).toBe(1)
    expect(d.warn).toBe(i.capital.dscrWarn)
  })
  it('debt rows per period', () => expect(debtData(r)).toHaveLength(r.ops.length))
  it('waterfall ends at sum(equityCash) - equity and chains', () => {
    const d = waterfallData(r)
    const final = sum(r.ops.map(p => p.equityCash)) - r.build.equity
    expect(d[d.length - 1].end).toBeCloseTo(final, 6)
    expect(d[d.length - 1].total).toBe(true)
    expect(Math.abs(d[d.length - 2].end - final)).toBeLessThan(0.01)
    expect(d[0].end).toBeCloseTo(-r.build.equity, 6)
  })
})

describe('chart data mappers with no build months', () => {
  it('do not throw on an empty build grid', () => {
    const e = runModel({ ...i, deal: { ...i.deal, buildDays: -30 } })
    expect(e.build.months).toEqual([])
    expect(drawdownData(e)).toEqual({ rows: [], markers: [] })
    expect(milestoneData(e)).toEqual([])
    expect(() => sourcesUsesData(e)).not.toThrow()
  })
})

