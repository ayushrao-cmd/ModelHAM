import { describe, it, expect } from 'vitest'
import { DEFAULT_INPUTS as i } from '../engine/defaults'
import { runModel } from '../engine/model'
import { sourcesUsesData, drawdownData, sCurveData, incomeData, dscrData, debtData, waterfallData, phasingRows, costLines } from './data'

const r = runModel(i)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('chart data mappers', () => {
  it('project cost lines sum to the total project cost; sources equal uses; uses group to <= 6 segments', () => {
    expect(sum(costLines(r).map(u => u.gross))).toBeCloseTo(r.kpis.totalProjectCost, 6)
    const d = sourcesUsesData(r)
    expect(Math.abs(d.totalSources - d.totalUses)).toBeLessThan(0.01)
    expect(d.totalUses).toBeCloseTo(2465.69, 2)
    expect(d.sources).toHaveLength(4)
    expect(d.uses.length).toBeLessThanOrEqual(6)
  })
  it('phasing has one row per period (37 build + 7 COD → 1st annuity), cost cumulates to the project cost', () => {
    const rows = phasingRows(r)
    expect(rows).toHaveLength(44)
    expect(rows.filter(x => x.kind === 'construction')).toHaveLength(37)
    expect(rows[rows.length - 1].cumCost).toBeCloseTo(r.kpis.totalProjectCost, 6)
    expect(rows.flatMap(x => x.milestones.map(m => m.label))).toEqual(['M1', 'M2', 'M3', 'M4'])
  })
  it('drawdown has one row per period and 4 milestone markers', () => {
    const d = drawdownData(r)
    expect(d.rows).toHaveLength(r.grid.periods.length)
    expect(d.markers.map(m => m.label)).toEqual(['M1', 'M2', 'M3', 'M4'])
    d.markers.forEach(m => expect(d.rows.some(x => x.month === m.month)).toBe(true))
    expect(sum(d.rows.map(x => x.equity + x.debt))).toBeCloseTo(r.kpis.equity + r.kpis.debt, 6)
  })
  it('s-curve has a row per build month, ending at 100%, with required progress only at milestone months', () => {
    const { rows, markers } = sCurveData(phasingRows(r))
    expect(rows).toHaveLength(37)
    expect(rows[rows.length - 1].physical).toBeCloseTo(1, 10)
    expect(rows.filter(x => x.reqPhysical != null).map(x => x.reqPhysical)).toEqual(i.milestones.map(m => m.physical))
    expect(markers.map(m => m.label)).toEqual(['M1', 'M2', 'M3', 'M4'])
  })
  it('income rows per annuity', () => {
    const d = incomeData(r)
    expect(d).toHaveLength(30)
    expect(sum(d.map(x => x.completion))).toBeCloseTo(sum(r.revenue.instalment), 6)
  })
  it('dscr is annual, FY31 to FY43, and carries lines', () => {
    const d = dscrData(r)
    expect(d.rows.map(x => x.year)).toEqual(Array.from({ length: 13 }, (_, k) => `FY${31 + k}`))
    expect(Math.min(...d.rows.map(x => x.dscr))).toBeCloseTo(1.1966, 4)
    expect(d.floor).toBe(1)
    expect(d.warn).toBe(i.capital.dscrWarn)
  })
  it('debt rows per FY, repaid by the end', () => {
    const d = debtData(r)
    expect(d).toHaveLength(r.grid.fys.length)
    expect(Math.abs(d[d.length - 1].debt)).toBeLessThan(1e-6)
    expect(Math.max(...d.map(x => x.dsr))).toBeGreaterThan(0)
  })
  it('waterfall chains to the net equity flow', () => {
    const d = waterfallData(r)
    const final = sum(r.cash.annual.equityPost)
    expect(d[d.length - 1].end).toBeCloseTo(final, 6)
    expect(d[d.length - 1].total).toBe(true)
    expect(Math.abs(d[d.length - 2].end - final)).toBeLessThan(0.01)
    expect(d[0].end).toBeCloseTo(-r.kpis.equity, 2)
  })
})
