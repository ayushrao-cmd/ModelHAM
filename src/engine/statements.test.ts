import { describe, expect, it } from 'vitest'
import { setAt } from '../lib/path'
import { fyEnd } from './dates'
import { DEFAULT_INPUTS as D } from './defaults'
import { runModel } from './model'
import { buildPhasing, buildStatements, lastOf, row } from './statements'
import type { Inputs } from './types'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const EXACT = 1e-6 // ₹ Cr; identities hold by construction, so only float residue is allowed

const CASES: [string, Inputs][] = [
  ['defaults', D],
  ['bid 2400', setAt(D, 'deal.bidPrice', 2400)],
  ['equity 30%', setAt(D, 'capital.equityPct', 0.3)],
  ['build days 1460', setAt(D, 'deal.buildDays', 1460)],
  ['sCurve phasing', setAt(D, 'build.phasing', 'sCurve')],
]

describe.each(CASES)('statements (%s)', (_, i) => {
  const r = runModel(i), s = buildStatements(r), b = r.build, ops = r.ops
  const v = (st: typeof s.is, key: string) => row(st, key).values
  const near = (a: number[], c: number[]) => a.forEach((x, k) => expect(Math.abs(x - c[k]), `FY index ${k}`).toBeLessThan(EXACT))

  it('years run FY by FY from the first build month to the last payment', () => {
    expect(s.years[0]).toBe(fyEnd(b.months[0].day))
    expect(lastOf(s.years)).toBe(fyEnd(lastOf(ops)!.day))
    s.years.slice(1).forEach((y, k) => expect(fyEnd(s.years[k] + 1)).toBe(y))
  })

  it('build sources equal uses, and reported debt and equity are what was drawn', () => {
    expect(Math.abs(b.support + b.supportGst + b.debt + b.equity - b.totalUses)).toBeLessThan(EXACT)
    expect(Math.abs(sum(b.months.map(m => m.debtDraw)) - b.debt)).toBeLessThan(EXACT)
    expect(Math.abs(sum(b.months.map(m => m.equityDraw)) - b.equity)).toBeLessThan(EXACT)
  })

  it('balance sheet balances at every FY end', () => {
    near(v(s.bs, 'totalAssets'), v(s.bs, 'totalLiabilitiesEquity'))
    near(v(s.bs, 'check'), s.years.map(() => 0))
    expect(Math.max(...v(s.bs, 'totalAssets'))).toBeGreaterThan(1000) // a real balance sheet, not zeros
  })

  it('cash flow reconciles: closing cash = BS cash, opening = prior closing, net = Σ activities', () => {
    near(v(s.cf, 'closingCash'), v(s.bs, 'cash'))
    near(v(s.cf, 'openingCash'), [0, ...v(s.cf, 'closingCash').slice(0, -1)])
    near(v(s.cf, 'netChange'), v(s.cf, 'cfo').map((x, k) => x + v(s.cf, 'cfi')[k] + v(s.cf, 'cff')[k]))
  })

  it('income statement totals equal Σ ops values', () => {
    near([sum(v(s.is, 'revenue'))], [sum(ops.map(p => p.completionPayment + p.interestIncome + p.omPayment))])
    near([sum(v(s.is, 'opex'))], [-sum(ops.map(p => p.opex))])
    near([sum(v(s.is, 'tax'))], [-sum(ops.map(p => p.tax))])
    near([sum(v(s.is, 'financeCost'))], [-sum(ops.map(p => p.interest))])
    near([sum(v(s.is, 'amortisation'))], [-sum(ops.map(p => p.amortisation))])
    near(v(s.is, 'pat'), v(s.is, 'pbt').map((x, k) => x + v(s.is, 'tax')[k]))
    // Nothing is expensed during build: the first FY (all build) has no revenue and no profit.
    expect(v(s.is, 'revenue')[0]).toBe(0)
    expect(v(s.is, 'pat')[0]).toBe(0)
  })

  it('senior debt equals the build balance, then ops debtClosing, at each FY end', () => {
    s.years.forEach((y, k) => {
      const p = lastOf(ops.filter(o => o.day <= y)), m = lastOf(b.months.filter(o => o.day <= y))
      expect(Math.abs(v(s.bs, 'seniorDebt')[k] - (p ? p.debtClosing : m ? m.debtBalance : 0))).toBeLessThan(EXACT)
    })
    expect(lastOf(v(s.bs, 'seniorDebt'))).toBe(0)
  })

  it('retained earnings = Σ PAT − Σ distributions; equity = Σ draws split by share-capital %', () => {
    let pat = 0
    s.years.forEach((y, k) => {
      pat += v(s.is, 'pat')[k]
      const dist = sum(ops.filter(p => p.day <= y).map(p => p.equityCash))
      expect(Math.abs(v(s.bs, 'retainedEarnings')[k] - (pat - dist))).toBeLessThan(EXACT)
      const eq = sum(b.months.filter(m => m.day <= y).map(m => m.equityDraw))
      expect(Math.abs(v(s.bs, 'shareCapital')[k] - eq * i.capital.shareCapitalPct)).toBeLessThan(EXACT)
      expect(Math.abs(v(s.bs, 'shareCapital')[k] + v(s.bs, 'promoterDebt')[k] - eq)).toBeLessThan(EXACT)
    })
  })

  it('capital work-in-progress turns into the project asset at completion, amortised to nil', () => {
    const cod = s.years.findIndex(y => y >= lastOf(b.months)!.day)
    expect(v(s.bs, 'cwip')[cod - 1]).toBeGreaterThan(0)
    expect(v(s.bs, 'cwip')[cod]).toBe(0)
    expect(v(s.bs, 'projectAsset')[cod]).toBeGreaterThan(0)
    expect(Math.abs(lastOf(v(s.bs, 'projectAsset'))!)).toBeLessThan(EXACT)
    expect(lastOf(v(s.bs, 'reserve'))).toBe(0)
    expect(Math.abs(lastOf(v(s.bs, 'workingCapital'))!)).toBeLessThan(EXACT)
  })
})

describe.each(CASES)('phasing (%s)', (_, i) => {
  const r = runModel(i), rows = buildPhasing(r), b = r.build

  it('one row per build month, summing to the build totals', () => {
    expect(rows).toHaveLength(b.months.length)
    const total = (f: (x: (typeof rows)[number]) => number) => sum(rows.map(f))
    expect(Math.abs(total(x => x.totalCost) - b.totalUses)).toBeLessThan(EXACT)
    expect(Math.abs(total(x => x.epcFixed) - i.build.epcFixed)).toBeLessThan(EXACT)
    expect(Math.abs(total(x => x.epcVariable) - b.epcVariable)).toBeLessThan(EXACT)
    expect(Math.abs(total(x => x.gst) - sum(b.uses.map(u => u.gst)))).toBeLessThan(EXACT)
    expect(Math.abs(total(x => x.idc) - b.idc)).toBeLessThan(EXACT)
    expect(Math.abs(total(x => x.support) - (b.support + b.supportGst))).toBeLessThan(EXACT)
    expect(Math.abs(total(x => x.equity) - b.equity)).toBeLessThan(EXACT)
    expect(Math.abs(total(x => x.debt) - b.debt)).toBeLessThan(EXACT)
    expect(total(x => x.days)).toBe(i.deal.buildDays)
    rows.forEach(x => expect(Math.abs(x.epcFixed + x.epcVariable + x.otherUses + x.gst + x.idc - x.totalCost)).toBeLessThan(EXACT))
  })

  it('cumulative physical and financial progress end at 100%; closing debt ends at total debt', () => {
    const last = lastOf(rows)!
    expect(last.cumPhysical).toBeCloseTo(1, 10)
    expect(last.cumFinancial).toBeCloseTo(1, 10)
    expect(Math.abs(sum(rows.map(x => x.physical)) - 1)).toBeLessThan(1e-9)
    expect(Math.abs(last.closingDebt - b.debt)).toBeLessThan(EXACT)
    expect(Math.abs(last.cumCost - b.totalUses)).toBeLessThan(EXACT)
  })

  it('flags each milestone month with its requirement', () => {
    const flagged = rows.flatMap(x => x.milestones)
    expect(flagged.map(m => m.label)).toEqual(i.milestones.map((_, n) => `M${n + 1}`))
    expect(flagged.map(m => m.physical)).toEqual(i.milestones.map(m => m.physical))
    const m1 = rows.find(x => x.milestones.length)!
    expect(m1.day).toBeGreaterThanOrEqual(r.timeline.start + i.milestones[0].day - 1)
  })
})
