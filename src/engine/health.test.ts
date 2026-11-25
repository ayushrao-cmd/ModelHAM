import { describe, it, expect, vi, afterEach } from 'vitest'
import { DEFAULT_INPUTS as D } from './defaults'
import { runModel } from './model'
import { type Check, healthScore, runChecks, statementChecks, validateInputs } from './health'
import { buildStatements, row } from './statements'
import type { Inputs } from './types'
import { fieldById } from '../fields'
import { setAt } from '../lib/path'
import { fmt } from '../lib/format'

const checks = (i: Inputs) => runChecks(runModel(i))
const find = (cs: Check[], id: string) => {
  const c = cs.find(x => x.id === id)
  if (!c) throw new Error(`missing check ${id}`)
  return c
}
const failing = (cs: Check[]) => cs.filter(c => !c.pass)

afterEach(() => { vi.useRealTimers() })

describe('health at defaults', () => {
  const cs = checks(D)

  it('has every check id from the brief', () => {
    const ids = ['financing-tieup', ...[1, 2, 3, 4].flatMap(k => [`milestone-progress-${k}`, `milestone-funding-${k}`]),
      'dscr-floor', 'dscr-warn', 'debt-repaid', 'repayment-sum', 'installment-sum', 'tranche-sum', 'rate-quote-fresh',
      'aps-trigger', 'leverage', 'sources-uses', 'build-cash', 'om-margin', 'solver-converged', 'equity-hurdle',
      'resurfacing-order', 'dates-order', 'irr-undefined', 'field:deal.buildDays', 'bs-balance', 'cf-reconcile', 'gst-recovered']
    for (const id of ids) expect(cs.map(c => c.id), id).toContain(id)
    expect(new Set(cs.map(c => c.id)).size).toBe(cs.length)
  })

  it('no error fails; om-margin is a failing warning with the amount', () => {
    expect(failing(cs).filter(c => c.severity === 'error').map(c => c.id)).toEqual([])
    const om = find(cs, 'om-margin')
    expect(om).toMatchObject({ severity: 'warning', pass: false })
    expect(om.message).toContain('₹25.34 Cr') // workbook O&M loss ~₹20 Cr; ours −25.34 at defaults
  })

  it('milestone funding excess is reported with its amount, never clipped', () => {
    const f2 = find(cs, 'milestone-funding-2')
    expect(f2).toMatchObject({ severity: 'warning', pass: false, fieldId: 'support.tranches' })
    expect(f2.message).toContain('₹45.42 Cr')
    expect(find(cs, 'milestone-funding-3').pass).toBe(true)
  })

  it('healthScore counts passes, failing errors and warnings', () => {
    const s = healthScore(cs)
    expect(s.total).toBe(cs.length)
    expect(s.passed).toBe(cs.filter(c => c.pass).length)
    expect(s.errors).toBe(0)
    expect(s.warnings).toBe(failing(cs).filter(c => c.severity === 'warning').length)
    expect(s.warnings).toBeGreaterThanOrEqual(2)
  })

  it('every check has a known section and, if set, a resolvable field', () => {
    for (const c of cs) {
      expect(['deal', 'build', 'phasing', 'capital', 'income', 'operations', 'returns', 'statements']).toContain(c.section)
      if (c.fieldId) expect(fieldById(c.fieldId), c.id).toBeDefined()
    }
  })
})

describe('schedules (Review Focus 3)', () => {
  it('repayment with last element removed: engine runs, repayment-sum fails with 95.40%', () => {
    const cs = checks(setAt(D, 'capital.repayment', D.capital.repayment.slice(0, -1)))
    const c = find(cs, 'repayment-sum')
    expect(c).toMatchObject({ pass: false, severity: 'error', fieldId: 'capital.repayment' })
    expect(c.message).toContain('95.40%')
    expect(find(cs, 'debt-repaid').pass).toBe(false)
  })
  it('installments of length 29: installment-sum fails, no throw', () => {
    const cs = checks(setAt(D, 'income.installments', D.income.installments.slice(0, -1)))
    expect(find(cs, 'installment-sum')).toMatchObject({ pass: false, fieldId: 'income.installments' })
  })
  it('installments of the wrong length fail even if they sum to 100%', () => {
    const inst = D.income.installments.slice(0, -2)
    inst.push(1 - inst.reduce((a, b) => a + b, 0))
    expect(find(validateInputs(setAt(D, 'income.installments', inst)), 'installment-sum').pass).toBe(false)
  })
})

describe('rate-quote-fresh', () => {
  it('fails for a quote 2026-03-01 against bid 2026-07-08', () => {
    const c = find(validateInputs(setAt(D, 'income.rateQuoteDate', '2026-03-01')), 'rate-quote-fresh')
    expect(c.pass).toBe(false)
    expect(c.fieldId).toBe('income.rateQuoteDate')
  })
  it('does not depend on Date.now()', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    expect(find(checks(D), 'rate-quote-fresh').pass).toBe(true)
  })
  it('dates-order fails when the quote is after the bid', () => {
    expect(find(validateInputs(setAt(D, 'income.rateQuoteDate', '2026-07-09')), 'dates-order').pass).toBe(false)
  })
})

describe('financing-tieup', () => {
  it('threshold is 1154.84 at defaults and passes', () => {
    const c = find(checks(D), 'financing-tieup')
    expect(c.pass).toBe(true)
    expect(c.message).toContain('₹1,154.84 Cr')
  })
  it('fails when debt + equity < min(0.9×(AE − 0.4×bid), 0.6×bid) (Ruling 2: bid 2600, AE 4000 → 1560)', () => {
    const c = find(checks(setAt(setAt(D, 'deal.bidPrice', 2600), 'deal.authorityEstimate', 4000)), 'financing-tieup')
    expect(c).toMatchObject({ pass: false, severity: 'error' })
    expect(c.message).toContain('₹1,560.00 Cr')
  })
})

describe('aps-trigger', () => {
  it('bid 1,800 (17.55% below 2,183.15) → info, 0.8% of bid = ₹14.40 Cr', () => {
    const c = find(validateInputs(setAt(D, 'deal.bidPrice', 1800)), 'aps-trigger')
    expect(c).toMatchObject({ severity: 'info', pass: false })
    expect(c.message).toContain('0.8%')
    expect(c.message).toContain('₹14.40 Cr')
    expect(c.message).toContain('17.55%')
  })
  it('above 20% below: 1% + 0.2% per point', () => {
    // 1,600 is 26.71% below → 27 pts → 1% + 7 × 0.2% = 2.4% of 1,600 = ₹38.40 Cr
    const c = find(validateInputs(setAt(D, 'deal.bidPrice', 1600)), 'aps-trigger')
    expect(c.message).toContain('2.4%')
    expect(c.message).toContain('₹38.40 Cr')
  })
  it('passes at defaults (bid above the estimate)', () => {
    expect(find(validateInputs(D), 'aps-trigger').pass).toBe(true)
  })
})

describe('field validation and cross-field rules', () => {
  it('field:deal.buildDays fails for 100 with a message naming the 365 limit', () => {
    const c = find(validateInputs(setAt(D, 'deal.buildDays', 100)), 'field:deal.buildDays')
    expect(c).toMatchObject({ pass: false, severity: 'error', fieldId: 'deal.buildDays', section: 'deal' })
    expect(c.message).toContain('365')
  })
  it('non-integer days and NaN fail', () => {
    expect(find(validateInputs(setAt(D, 'deal.daysToAward', 60.5)), 'field:deal.daysToAward').pass).toBe(false)
    expect(find(validateInputs(setAt(D, 'build.epcFixed', NaN)), 'field:build.epcFixed').pass).toBe(false)
  })
  it('resurfacing-order fails for [6, 9] and [6, 16], passes at [6, 12]', () => {
    const r = (y: [number, number]) => find(validateInputs(setAt(D, 'operations.resurfacingYears', y)), 'resurfacing-order')
    expect(r([6, 9]).pass).toBe(false)
    expect(r([6, 16]).pass).toBe(false)
    expect(r([6, 12]).pass).toBe(true)
  })
  it('tranche-sum: weights positive, progress in (0, 100%] and strictly ascending; no sum rule', () => {
    const t = (i: Inputs) => find(validateInputs(i), 'tranche-sum')
    expect(t(D).pass).toBe(true)
    expect(t(setAt(D, 'support.pctOfBid', 0.35)).pass).toBe(true) // weights need not sum to the %
    expect(t(setAt(D, 'support.tranches.3.shareOfBid', 0)).pass).toBe(false)
    expect(t(setAt(D, 'support.tranches.9.progress', 1.2)).pass).toBe(false)
    expect(t(setAt(D, 'support.tranches.0.progress', 0)).pass).toBe(false)
    expect(t(setAt(D, 'support.tranches.1.progress', 0.05)).pass).toBe(false) // equal to previous
  })
  it('operate years is fixed at 15', () => {
    expect(find(validateInputs(setAt(D, 'deal.operateYears', 20)), 'field:deal.operateYears').pass).toBe(false)
    expect(find(validateInputs(D), 'field:deal.operateYears').pass).toBe(true)
  })
  it('milestone list must be ascending and within build days', () => {
    expect(find(validateInputs(setAt(D, 'milestones.1.day', 200)), 'field:milestones').pass).toBe(false)
    expect(find(validateInputs(setAt(D, 'milestones.3.day', 1200)), 'field:milestones').pass).toBe(false)
  })
})

describe('model checks that can fail', () => {
  it('low bid: DSCR floor fails (error) with a coverage message; dscr-warn also fails', () => {
    const cs = checks(setAt(D, 'deal.bidPrice', 1800))
    const f = find(cs, 'dscr-floor')
    expect(f).toMatchObject({ pass: false, severity: 'error' })
    expect(f.message).toMatch(/doesn't cover debt service/)
    expect(find(cs, 'dscr-warn').pass).toBe(false)
    expect(find(cs, 'equity-hurdle')).toMatchObject({ pass: false, severity: 'info' })
  })
  it('leverage warns above maxLeverage', () => {
    expect(find(checks(setAt(D, 'capital.equityPct', 0.2)), 'leverage')).toMatchObject({ pass: false, severity: 'warning' })
  })
  it('s-curve phasing misses the first milestone', () => {
    const c = find(checks(setAt(D, 'build.phasing', 'sCurve')), 'milestone-progress-1')
    expect(c).toMatchObject({ pass: false, severity: 'error' })
    expect(c.message).toContain('20.00%')
  })
  it('reported debt and equity that do not match the draws fail sources-uses', () => {
    const r = runModel(D)
    const cs = runChecks({ ...r, build: { ...r.build, debt: r.build.debt - 10 } })
    expect(find(cs, 'sources-uses').pass).toBe(false)
    expect(find(cs, 'sources-uses').message).toContain('Monthly debt draws')
  })
  it('Construction Support above build costs (bid 8,000) fails sources-uses and build-cash, quoting the excess', () => {
    const r = runModel(setAt(D, 'deal.bidPrice', 8000)), b = r.build
    const excess = b.support + b.supportGst - b.totalUses
    expect(excess).toBeGreaterThan(1000)
    const cs = runChecks(r)
    for (const id of ['sources-uses', 'build-cash']) {
      const c = find(cs, id)
      expect(c.pass, id).toBe(false)
      expect(c.message).toContain(`exceeds build costs ${fmt.cr(b.totalUses)} by ${fmt.cr(excess)}`)
    }
  })
  it('solver-converged fails when the fixed point did not converge', () => {
    const r = runModel(D)
    const c = find(runChecks({ ...r, build: { ...r.build, converged: false, iterations: 50 } }), 'solver-converged')
    expect(c.pass).toBe(false)
    expect(c.message).toContain('50')
  })
  it('irr-undefined fails when any IRR is null', () => {
    const r = runModel(D)
    const c = find(runChecks({ ...r, kpis: { ...r.kpis, equityIrr: null } }), 'irr-undefined')
    expect(c).toMatchObject({ pass: false, severity: 'error', section: 'returns' })
  })
  it('negative DSCR is explained as negative cash flow', () => {
    const r = runModel(D)
    const ops = r.ops.map((p, k) => (k === 3 ? { ...p, dscr: -0.4 } : p))
    const c = find(runChecks({ ...r, ops, kpis: { ...r.kpis, dscrMin: -0.4 } }), 'dscr-floor')
    expect(c.pass).toBe(false)
    expect(c.message).toMatch(/negative/)
  })
})

describe('every failing check with a fieldId resolves', () => {
  it('across a spread of broken inputs', () => {
    const cases: Inputs[] = [
      setAt(D, 'deal.bidPrice', 1800), setAt(D, 'deal.buildDays', 100), setAt(D, 'income.rateQuoteDate', '2026-03-01'),
      setAt(D, 'capital.repayment', D.capital.repayment.slice(0, -1)), setAt(D, 'operations.resurfacingYears', [6, 9]),
      setAt(setAt(D, 'deal.bidPrice', 2600), 'deal.authorityEstimate', 4000), setAt(D, 'capital.equityPct', 0.2),
      setAt(D, 'build.phasing', 'sCurve'), setAt(D, 'support.pctOfBid', 0.3), setAt(D, 'deal.projectName', ' '),
      setAt(D, 'deal.bidDate', '2026-02-30'), setAt(D, 'deal.pavement', 'concrete'),
    ]
    let n = 0
    for (const i of cases) for (const c of failing(checks(i))) if (c.fieldId) { n++; expect(fieldById(c.fieldId), c.id).toBeDefined() }
    expect(n).toBeGreaterThan(10)
  })
  it('sources-uses reconciles monthly draws: a corrupted debt figure fails with amounts', () => {
    const r = runModel(D)
    expect(find(runChecks(r), 'sources-uses').pass).toBe(true)
    const c = find(runChecks({ ...r, build: { ...r.build, debt: r.build.debt + 10 } }), 'sources-uses')
    expect(c.pass).toBe(false)
    expect(c.message).toMatch(/debt/i)
    expect(c.message).toContain('₹10.00 Cr')
    const e = find(runChecks({ ...r, build: { ...r.build, months: r.build.months.map((m, k) => (k ? m : { ...m, equityDraw: m.equityDraw + 5 })) } }), 'sources-uses')
    expect(e.pass).toBe(false)
    expect(e.message).toMatch(/equity/i)
  })
})

describe('no build months', () => {
  it.each([['Build Days −30', setAt(D, 'deal.buildDays', -30)], ['Build Days 0', setAt(D, 'deal.buildDays', 0)]])(
    '%s: checks run without throwing and fail with a clear message', (_, i) => {
      const cs = checks(i)
      expect(find(cs, 'field:deal.buildDays').pass).toBe(false)
      const b = find(cs, 'build-period')
      expect(b).toMatchObject({ pass: false, severity: 'error', fieldId: 'deal.buildDays' })
      expect(b.message).toMatch(/no build months/i)
    })
  it('at defaults the build-period check passes', () => {
    expect(find(checks(D), 'build-period').pass).toBe(true)
  })
})


describe('float edges and recovery', () => {
  it('at defaults only the two known warnings fail (leverage sits at 3.0x to within the solver tolerance)', () => {
    expect(failing(checks(D)).map(c => c.id).sort()).toEqual(['milestone-funding-2', 'om-margin'])
  })
  it('money and ratio comparisons tolerate solver and float residue, but not real misses', () => {
    const r = runModel(D), b = r.build
    const tie = (tied: number) => find(runChecks({ ...r, build: { ...b, debt: tied - b.equity } }), 'financing-tieup').pass
    const threshold = Math.min(0.9 * (D.deal.authorityEstimate - D.support.pctOfBid * D.deal.bidPrice), D.income.completionPctOfBid * D.deal.bidPrice)
    expect(tie(threshold - 0.005)).toBe(true)
    expect(tie(threshold - 0.05)).toBe(false)
    const kpi = (k: Partial<typeof r.kpis>) => runChecks({ ...r, kpis: { ...r.kpis, ...k } })
    expect(find(kpi({ equityIrr: D.targets.equityIrrHurdle - 1e-7 }), 'equity-hurdle').pass).toBe(true)
    expect(find(kpi({ equityIrr: D.targets.equityIrrHurdle - 1e-3 }), 'equity-hurdle').pass).toBe(false)
    expect(find(kpi({ dscrMin: 1 - 1e-10 }), 'dscr-floor').pass).toBe(true)
    expect(find(kpi({ dscrMin: 0.99 }), 'dscr-floor').pass).toBe(false)
    expect(find(kpi({ dscrMin: D.capital.dscrWarn - 1e-10 }), 'dscr-warn').pass).toBe(true)
  })
  it('gst-recovered passes at defaults and warns with the unrecovered amount at a low bid', () => {
    expect(find(checks(D), 'gst-recovered')).toMatchObject({ pass: true, severity: 'warning' })
    const r = runModel(setAt(D, 'deal.bidPrice', 1500))
    const left = r.build.netGstCredit - r.ops.reduce((a, p) => a + p.gstRecovery, 0)
    expect(left).toBeGreaterThan(1)
    const c = find(runChecks(r), 'gst-recovered')
    expect(c).toMatchObject({ pass: false, severity: 'warning' })
    expect(c.message).toContain(fmt.cr(left))
  })
})

describe('statement checks', () => {
  const r = runModel(D)
  const fresh = () => buildStatements(r)

  it('pass at defaults, in the statements section, as errors', () => {
    const cs = runChecks(r)
    for (const id of ['bs-balance', 'cf-reconcile']) expect(find(cs, id)).toMatchObject({ section: 'statements', severity: 'error', pass: true })
    expect(find(cs, 'bs-balance').message).toMatch(/^Balance sheet balances at every FY end, FY\d\d to FY\d\d/)
    expect(find(cs, 'milestone-progress-1').section).toBe('phasing')
  })

  it('bs-balance fails on a corrupted balance sheet, naming the first failing year and the gap', () => {
    const s = fresh()
    row(s.bs, 'totalAssets').values[3] += 1.5
    const c = find(statementChecks(s), 'bs-balance')
    expect(c.pass).toBe(false)
    expect(c.message).toContain('₹1.50 Cr')
    expect(c.message).toContain(`FY${String(new Date(s.years[3] * 86_400_000).getUTCFullYear() % 100).padStart(2, '0')}`)
    expect(find(statementChecks(s), 'cf-reconcile').pass).toBe(true)
  })

  it('cf-reconcile fails when CFS closing cash differs from BS cash', () => {
    const s = fresh()
    row(s.cf, 'closingCash').values[1] -= 0.25
    const c = find(statementChecks(s), 'cf-reconcile')
    expect(c.pass).toBe(false)
    expect(c.message).toContain('₹0.25 Cr')
  })

  it('a gap within ₹0.01 Cr still passes', () => {
    const s = fresh()
    row(s.bs, 'totalAssets').values[0] += 0.004
    expect(find(statementChecks(s), 'bs-balance').pass).toBe(true)
  })
})
