import { describe, it, expect } from 'vitest'
import { DEFAULT_INPUTS as i } from './defaults'
import { buildTimeline, indexFactor } from './timeline'
import { setAt } from '../lib/path'
import { runBuild, supportSchedule } from './build'

const firstPeriod = { debtService: (d: number) => d * 0.07, opex: 7, interest: (d: number) => d * 0.0475 }
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
/** A tranche's share of bid: Construction Support % split by weight. */
const weightShare = (tr: { shareOfBid: number }) => i.support.pctOfBid * tr.shareOfBid / sum(i.support.tranches.map(x => x.shareOfBid))
/** Month a tranche is received: lagDays after the end of the month that first reaches its progress. */
const receivedIn = (r: { months: { day: number; cumPhysical: number }[] }, progress: number, lag = i.support.lagDays) => {
  const earned = r.months.findIndex(m => m.cumPhysical >= progress)
  const paid = r.months.findIndex(m => m.day >= r.months[earned].day + lag)
  return paid < 0 ? r.months.length - 1 : paid
}

describe('runBuild (defaults)', () => {
  const t = buildTimeline(i)
  const r = runBuild(i, t, firstPeriod)
  const line = (k: string) => r.uses.find(u => u.key === k)!

  it('EPC = fixed incl. GST + variable (indexation pass-through)', () => {
    const variable = line('epcVariable')
    const landing = i.support.tranches.map(tr => receivedIn(r, tr.progress))
    const expectedVar = sum(i.support.tranches.map((tr, k) =>
      weightShare(tr) * i.deal.bidPrice * (indexFactor(i, t.months[landing[k]]) - 1)))
    expect(variable.net).toBeCloseTo(expectedVar, 6)
    expect(variable.net).toBeGreaterThan(0)
    expect(r.epcVariable).toBeCloseTo(expectedVar, 6)
    // variable EPC carries works GST like the fixed EPC
    expect(sum(r.months.map(m => m.epc))).toBeCloseTo(
      i.build.epcFixed * (1 + i.build.gstWorks) + variable.net * (1 + i.build.gstWorks), 6)
    // pass-through: indexation uplift is inside support received
    const base = i.support.pctOfBid * i.deal.bidPrice
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

  it('support tranches land lagDays after the first month reaching progress', () => {
    i.support.tranches.forEach(tr => {
      const k = receivedIn(r, tr.progress)
      expect(k).toBeGreaterThanOrEqual(0)
      expect(r.months[k].supportReceived).toBeGreaterThan(0)
      expect(r.months[k].supportGst).toBeCloseTo(i.build.gstWorks * r.months[k].supportReceived, 9)
    })
    const landed = new Set(i.support.tranches.map(tr => receivedIn(r, tr.progress)))
    r.months.forEach((m, k) => { if (!landed.has(k)) expect(m.supportReceived).toBe(0) })
  })

  it('support lag: 0 pays in the earned month, a long lag is capped at the last build month', () => {
    const at = (lag: number) => runBuild(setAt(i, 'support.lagDays', lag), t, firstPeriod)
    const zero = at(0), max = at(90), long = at(10_000), n = r.months.length
    i.support.tranches.forEach(tr => {
      const k = zero.months.findIndex(m => m.cumPhysical >= tr.progress)
      expect(zero.months[k].supportReceived).toBeGreaterThan(0)
    })
    expect(long.months.slice(0, n - 1).every(m => m.supportReceived === 0)).toBe(true)
    for (const x of [zero, max]) expect(Math.abs(x.support + x.supportGst + x.equity + x.debt - x.totalUses)).toBeLessThan(0.01)
    expect(at(30).idc).toBeGreaterThan(zero.idc) // later support means more debt outstanding during the build
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

describe('runBuild equity share extremes', () => {
  const t = buildTimeline(i)
  it.each([[1], [0]])('equityPct %s: monthly draws reconcile to reported debt and equity', eq => {
    const r = runBuild(setAt(i, 'capital.equityPct', eq), t, firstPeriod)
    expect(r.converged).toBe(true)
    expect(r.iterations).toBeGreaterThanOrEqual(2)
    expect(Math.abs(sum(r.months.map(m => m.debtDraw)) - r.debt)).toBeLessThan(0.01)
    expect(Math.abs(sum(r.months.map(m => m.equityDraw)) - r.equity)).toBeLessThan(0.01)
    if (eq === 1) { expect(r.debt).toBeCloseTo(0, 6); expect(r.idc).toBeCloseTo(0, 6) }
    else expect(r.equity).toBeCloseTo(0, 6)
  })
})

describe('Construction Support (% of Bid) and tranche weights', () => {
  const t = buildTimeline(i)
  it('tranches split pctOfBid × bid by weight, so the % moves the model', () => {
    const r = supportSchedule(i, t)
    const lower = supportSchedule(setAt(i, 'support.pctOfBid', 0.3), t)
    expect(sum(lower.received)).toBeCloseTo(sum(r.received) * 0.75, 6)
    // weights are relative: doubling every weight changes nothing
    const doubled = setAt(i, 'support.tranches', i.support.tranches.map(tr => ({ ...tr, shareOfBid: tr.shareOfBid * 2 })))
    expect(sum(supportSchedule(doubled, t).received)).toBeCloseTo(sum(r.received), 6)
    expect(runBuild(setAt(i, 'support.pctOfBid', 0.3), t, firstPeriod).support).toBeLessThan(runBuild(i, t, firstPeriod).support)
  })
})

describe('runBuild with no build months', () => {
  it('returns an empty schedule instead of throwing', () => {
    const x = setAt(i, 'deal.buildDays', -30)
    const r = runBuild(x, buildTimeline(x), firstPeriod)
    expect(r.months).toEqual([])
  })
})

