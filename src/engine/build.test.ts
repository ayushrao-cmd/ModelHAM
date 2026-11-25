import { describe, it, expect } from 'vitest'
import { DEFAULT_INPUTS as i } from './defaults'
import { buildTimeline, indexFactor } from './timeline'
import { runBuild } from './build'

const firstPeriod = { debtService: (d: number) => d * 0.07, opex: 7, interest: (d: number) => d * 0.0475 }
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('runBuild (defaults)', () => {
  const t = buildTimeline(i)
  const r = runBuild(i, t, firstPeriod)
  const line = (k: string) => r.uses.find(u => u.key === k)!

  it('EPC = fixed incl. GST + variable (indexation pass-through)', () => {
    const variable = line('epcVariable')
    const landing = i.support.tranches.map(tr => r.months.findIndex(m => m.cumPhysical >= tr.progress))
    const expectedVar = sum(i.support.tranches.map((tr, k) =>
      tr.shareOfBid * i.deal.bidPrice * (indexFactor(i, t.months[landing[k]]) - 1)))
    expect(variable.net).toBeCloseTo(expectedVar, 6)
    expect(variable.net).toBeGreaterThan(0)
    // variable EPC carries works GST like the fixed EPC
    expect(sum(r.months.map(m => m.epc))).toBeCloseTo(
      i.build.epcFixed * (1 + i.build.gstWorks) + variable.net * (1 + i.build.gstWorks), 6)
    // pass-through: indexation uplift is inside support received
    const base = sum(i.support.tranches.map(tr => tr.shareOfBid * i.deal.bidPrice))
    expect(sum(r.months.map(m => m.supportReceived))).toBeCloseTo(base + variable.net, 6)
    expect(r.support).toBeCloseTo(base + variable.net, 6)
  })

  it('sources = uses', () => {
    expect(Math.abs(r.support + r.supportGst + r.equity + r.debt - r.totalUses)).toBeLessThan(0.01)
    expect(r.totalUses).toBeCloseTo(sum(r.uses.map(u => u.net + u.gst)), 6)
    expect(sum(r.months.map(m => m.epc + m.otherUses + m.idc))).toBeCloseTo(r.totalUses, 6)
  })

  it('equity share, upfront equity first', () => {
    expect(r.equity / (r.equity + r.debt)).toBeCloseTo(i.capital.equityPct, 6)
    expect(r.shareCapital + r.promoterDebt).toBeCloseTo(r.equity, 9)
    expect(r.shareCapital).toBeCloseTo(r.equity * i.capital.shareCapitalPct, 9)
    const k = r.months.findIndex(m => m.debtDraw > 0)
    expect(k).toBeGreaterThan(0)
    expect(r.months.slice(0, k).every(m => m.debtDraw === 0)).toBe(true)
    expect(sum(r.months.slice(0, k + 1).map(m => m.equityDraw)))
      .toBeGreaterThanOrEqual(i.capital.upfrontEquityPct * r.equity - 0.01)
    expect(Math.abs(sum(r.months.map(m => m.debtDraw)) - r.debt)).toBeLessThan(0.01)
    expect(Math.abs(sum(r.months.map(m => m.equityDraw)) - r.equity)).toBeLessThan(0.01)
  })

  it('IDC fixed point converges', () => {
    expect(r.converged).toBe(true)
    expect(r.iterations).toBeLessThanOrEqual(50)
    expect(r.idc).toBeGreaterThan(0)
    expect(line('idc').net).toBeCloseTo(r.idc, 9)
    expect(r.months.every(m => m.debtBalance >= 0)).toBe(true)
    expect(r.reserve).toBeCloseTo(firstPeriod.debtService(r.debt), 1)
    expect(r.workingCapital).toBeCloseTo(firstPeriod.opex + firstPeriod.interest(r.debt), 1)
  })

  it('support tranches land at first month reaching progress', () => {
    i.support.tranches.forEach(tr => {
      const k = r.months.findIndex(m => m.cumPhysical >= tr.progress)
      expect(k).toBeGreaterThanOrEqual(0)
      expect(r.months[k].supportReceived).toBeGreaterThan(0)
      expect(r.months[k].supportGst).toBeCloseTo(i.build.gstWorks * r.months[k].supportReceived, 9)
    })
    const landed = new Set(i.support.tranches.map(tr => r.months.findIndex(m => m.cumPhysical >= tr.progress)))
    r.months.forEach((m, k) => { if (!landed.has(k)) expect(m.supportReceived).toBe(0) })
  })

  it('physical progress reaches 100%, cash never negative', () => {
    expect(r.months[r.months.length - 1].cumPhysical).toBeCloseTo(1, 9)
    expect(r.months.every(m => m.cumFunding >= m.cumCost - 1e-6)).toBe(true)
    expect(r.netGstCredit).toBeGreaterThanOrEqual(0)
  })

  it('s-curve phasing also balances and reaches 100%', () => {
    const s = runBuild({ ...i, build: { ...i.build, phasing: 'sCurve' } }, t, firstPeriod)
    expect(s.months[s.months.length - 1].cumPhysical).toBeCloseTo(1, 9)
    expect(s.months[0].cumPhysical).toBeLessThan(r.months[0].cumPhysical)
    expect(s.converged).toBe(true)
    expect(Math.abs(s.support + s.supportGst + s.equity + s.debt - s.totalUses)).toBeLessThan(0.01)
  })

  it('pre-bid includes miscellaneous allowance', () => {
    expect(line('preBid').net).toBeCloseTo(i.build.preBid * (1 + i.build.preBidMiscPct), 9)
    expect(line('preBid').label).toBe('Pre-bid costs incl. miscellaneous allowance')
  })
})
