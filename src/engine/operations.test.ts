import { describe, it, expect } from 'vitest'
import { DEFAULT_INPUTS as i } from './defaults'
import { buildTimeline, indexFactor } from './timeline'
import { yearsBetween } from './dates'
import { annuityRate, omSchedule, opexForYear, runOperations } from './operations'
import type { Inputs } from './types'

const stub = { debt: 990, reserve: 60, workingCapital: 55, netGstCredit: 158, totalUses: 2465, support: 900, supportGst: 162, epcVariable: 77.7 }
const epcNet = i.build.epcFixed + stub.epcVariable
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const withOps = (o: Partial<Inputs['operations']>): Inputs => ({ ...i, operations: { ...i.operations, ...o } })

describe('omSchedule', () => {
  it('defaults (perpetual, resurfacing 6 & 12)', () => {
    expect(omSchedule(i)).toEqual([0,0.004,0.004,0.004,0.006,0.024,0.004,0.004,0.004,0.004,0.006,0.024,0.004,0.004,0.004])
  })
  it('flexible pavement uses the flexible pre-resurfacing rate', () => {
    const s = omSchedule({ ...i, deal: { ...i.deal, pavement: 'flexible' } })
    expect(s[4]).toBe(0.008)
    expect(s[10]).toBe(0.008)
  })
  it('moving resurfacing moves the 2.4% and the pre-resurfacing year', () => {
    const s = omSchedule(withOps({ resurfacingYears: [7, 13] }))
    expect(s[6]).toBe(0.024)
    expect(s[12]).toBe(0.024)
    expect(s[5]).toBe(0.006)
    expect(s[4]).toBe(0.004)
    expect(s).toHaveLength(i.deal.operateYears)
  })
})

describe('annuityRate', () => {
  it('mean of bank rates + spread', () => expect(annuityRate(i)).toBeCloseTo(0.0982, 6))
})

describe('opexForYear', () => {
  const t = buildTimeline(i)
  it('each line inflates from bid date at its own rate; insurance = base × loading × EPC', () => {
    const d = t.payments[3]
    const y = yearsBetween(t.bid, d)
    const o = opexForYear(i, 2, d, epcNet)
    expect(o.routine).toBeCloseTo(i.operations.routine * (1 + i.operations.inflation.maintenance) ** y, 9)
    expect(o.staff).toBeCloseTo(i.operations.staff * (1 + i.operations.inflation.staff) ** y, 9)
    expect(o.electricity).toBeCloseTo(i.operations.electricity * (1 + i.operations.inflation.electricity) ** y, 9)
    expect(o.insurance).toBeCloseTo(i.operations.insuranceBaseRate * i.operations.insuranceLoading * epcNet, 9)
    expect(o.insurance).toBeCloseTo(5.50, 2) // spec ≈ 5.48: 0.14% × 2.15 × (fixed + variable EPC)
    expect(o.majorMaintenance).toBe(0)
    expect(o.total).toBeCloseTo(o.routine + o.electricity + o.financeLegal + o.staff + o.patrolRunning + o.ieFee + o.insurance, 9)
    expect(opexForYear(i, 6, d, epcNet).majorMaintenance).toBeCloseTo(i.operations.majorMaintenance * (1 + i.operations.inflation.maintenance) ** y, 9)
  })
})

describe('runOperations (defaults, stub build)', () => {
  const t = buildTimeline(i)
  const p = runOperations(i, t, stub)

  it('one period per payment date', () => {
    expect(p).toHaveLength(2 * i.deal.operateYears)
    expect(p[0].day).toBe(t.payments[0])
    expect(p.map(x => x.year).slice(0, 4)).toEqual([1, 1, 2, 2])
  })

  it('completion payments sum to the indexed base; balance runs to 0', () => {
    expect(sum(p.map(x => x.completionPayment)))
      .toBeCloseTo(i.income.completionPctOfBid * i.deal.bidPrice * indexFactor(i, t.completion), 6)
    expect(p[p.length - 1].balanceOutstanding).toBeCloseTo(0, 6)
    const base = i.income.completionPctOfBid * i.deal.bidPrice * indexFactor(i, t.completion)
    expect(p[0].interestIncome).toBeCloseTo(base * annuityRate(i) / 2, 9)
  })

  it('debt repays in full; no DSCR after the last repayment', () => {
    expect(sum(p.map(x => x.principal))).toBeCloseTo(990, 6)
    expect(p[p.length - 1].debtClosing).toBeCloseTo(0, 6)
    expect(p[0].debtOpening).toBe(990)
    p.forEach((x, k) => {
      if (k + 1 > 25) expect(x.dscr).toBeNull()
      else expect(x.dscr).not.toBeNull()
    })
  })

  it('GST credit recovered but never more than the credit', () => {
    const g = sum(p.map(x => x.gstRecovery))
    expect(g).toBeLessThanOrEqual(158 + 1e-9)
    expect(g).toBeGreaterThan(0)
  })

  it('major maintenance only in resurfacing years, split 50/50', () => {
    const ry = i.operations.resurfacingYears
    p.forEach(x => {
      const o = opexForYear(i, x.year, x.day, epcNet)
      if (ry.includes(x.year)) expect(o.majorMaintenance).toBeGreaterThan(0)
      else expect(o.majorMaintenance).toBe(0)
      expect(x.opex).toBeCloseTo(o.total / 2, 9)
    })
  })

  it('working capital released in period 1; reserve released after the last repayment', () => {
    expect(p[0].wcRelease).toBe(55)
    expect(p.slice(1).every(x => x.wcRelease === 0)).toBe(true)
    expect(p[25].reserveBalance).toBeCloseTo(0, 9)
    expect(p[0].reserveMovement).toBeCloseTo(p[0].reserveBalance - 60, 9)
    expect(p[0].reserveBalance).toBeCloseTo(p[1].principal + p[1].interest, 9)
  })

  it('amortisation base excludes support, GST, reserve and working capital', () => {
    const tx = i.tax, rate = tx.baseRate * (1 + tx.surcharge) * (1 + tx.cess)
    const amort = (2465 - 900 - 162 - 158 - 60 - 55) / p.length
    const x = p[0]
    expect(x.tax).toBeGreaterThan(0) // no losses brought forward in period 1
    expect(x.tax).toBeCloseTo((x.completionPayment + x.interestIncome + x.omPayment - x.opex - x.interest - amort) * rate, 9)
  })

  it('early losses carry forward and reduce later tax', () => {
    const big = runOperations(i, t, { ...stub, totalUses: 3300 }) // amortisation ≈ 65.5/period: losses early, profits later
    expect(big[0].tax).toBe(0) // amortisation creates an early loss
    const later = big.findIndex(x => x.tax > 0)
    expect(later).toBeGreaterThan(0)
    expect(sum(big.map(x => x.tax))).toBeLessThan(sum(p.map(x => x.tax)))
    // first taxable period pays tax only on profit after absorbing the losses
    const tx = i.tax, rate = tx.baseRate * (1 + tx.surcharge) * (1 + tx.cess)
    const amort = (3300 - 900 - 162 - 158 - 60 - 55) / big.length
    const profit = (x: typeof big[0]) => x.completionPayment + x.interestIncome + x.omPayment - x.opex - x.interest - amort
    const lossBf = -sum(big.slice(0, later).map(profit))
    expect(lossBf).toBeGreaterThan(0)
    expect(big[later].tax).toBeCloseTo((profit(big[later]) - lossBf) * rate, 9)
    expect(big[later].tax).toBeLessThan(profit(big[later]) * rate)
  })

  it('tax never negative; cash identities hold', () => {
    p.forEach(x => {
      expect(x.tax).toBeGreaterThanOrEqual(0)
      expect(x.cfads).toBeCloseTo(x.completionPayment + x.interestIncome + x.omPayment + x.gstRecovery - x.opex - x.tax, 9)
      expect(x.equityCash).toBeCloseTo(x.cfads - x.principal - x.interest - x.reserveMovement + x.wcRelease, 9)
    })
  })
})
