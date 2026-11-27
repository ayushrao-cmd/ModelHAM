import { describe, it, expect, vi, afterEach } from 'vitest'
import { DEFAULT_INPUTS as D } from './defaults'
import { runModel, type ModelResult } from './model'
import { type Check, blockingChecks, healthScore, modelRunCheck, runChecks, statementChecks, validateInputs } from './health'
import type { Inputs } from './types'
import { V16_SAMPLE } from './v16/sample'
import { fieldById } from '../fields'
import { setAt } from '../lib/path'

const checks = (i: Inputs) => runChecks(runModel(i))
const find = (cs: Check[], id: string) => {
  const c = cs.find(x => x.id === id)
  if (!c) throw new Error(`missing check ${id}`)
  return c
}
const failing = (cs: Check[]) => cs.filter(c => !c.pass)
const R = runModel(D)
/** A deep copy of the sample result to corrupt. */
const copy = (): ModelResult => structuredClone(R)

afterEach(() => { vi.useRealTimers() })

describe('health at the sample (the original workbook inputs)', () => {
  const cs = runChecks(R)

  it('the defaults are the original sample', () => expect(D).toBe(V16_SAMPLE))

  it('has every check id, the original’s own checks among them', () => {
    const ids = ['financing-tieup', ...[1, 2, 3, 4].flatMap(k => [`milestone-progress-${k}`, `milestone-funding-${k}`]),
      'dscr-floor', 'dscr-warn', 'debt-repaid', 'repayment-sum', 'installment-sum', 'tranche-sum', 'rate-quote-fresh',
      'aps-trigger', 'leverage', 'sources-uses', 'build-cash', 'om-margin', 'loop-construction', 'loop-tax', 'loop-csr',
      'equity-hurdle', 'resurfacing-order', 'dates-order', 'irr-undefined', 'field:deal.buildDays', 'gst-recovered',
      'mmr-cover', 'mmr-window', 'mmr-third-year',
      'bs-balance', 'cash-nonnegative', 'cash-tie', 'equity-tie', 'debt-tie']
    for (const id of ids) expect(cs.map(c => c.id), id).toContain(id)
    expect(new Set(cs.map(c => c.id)).size).toBe(cs.length)
  })

  it('the original’s checks (BS, cash ≥ 0, cash, equity and debt ties) pass, in the statements section, as errors', () => {
    for (const id of ['bs-balance', 'cash-nonnegative', 'cash-tie', 'equity-tie', 'debt-tie'])
      expect(find(cs, id), id).toMatchObject({ section: 'statements', severity: 'error', pass: true })
    expect(find(cs, 'bs-balance').message).toMatch(/every FY end, FY27 to FY45/)
  })

  it('only the O&M margin warning fails, with the original’s ₹20.36 Cr shortfall', () => {
    expect(failing(cs).map(c => c.id)).toEqual(['om-margin'])
    const om = find(cs, 'om-margin')
    expect(om).toMatchObject({ severity: 'warning', pass: false })
    expect(om.message).toContain('₹20.36 Cr')
  })

  it('milestone funding: the original draws only what each month needs, so milestone 2 passes at the sample', () => {
    // Construction Support received in a tranche month is carried as cash for a month at most; at the milestone
    // months (Dec 27, Sep 28, Jun 29, Mar 30) funding equals cost. Equated phasing shows the old warning again.
    const f2 = find(cs, 'milestone-funding-2')
    expect(f2).toMatchObject({ severity: 'warning', pass: true, fieldId: 'support.tranches' })
    expect(f2.message).toContain('₹1,281.37 Cr')
    const eq = find(checks(setAt(D, 'build.phasing', 'equated')), 'milestone-funding-2')
    expect(eq.pass).toBe(false)
    expect(eq.message).toContain('₹45.07 Cr')
  })

  it('lists every reproduced quirk as a method note (info, not counted)', () => {
    const notes = cs.filter(c => c.group === 'notes')
    expect(notes.map(c => c.id)).toEqual(R.notes.map(n => `note:${n.id}`))
    expect(notes.length).toBeGreaterThanOrEqual(8)
    expect(notes.every(c => c.severity === 'info' && c.pass)).toBe(true)
    expect(find(cs, 'note:B-Q5').message).toMatch(/original 1\.47×; consistent 1\.4\d×/)
    expect(find(cs, 'note:B-Q1').message).toContain('original 15.09%')
    const s = healthScore(cs)
    expect(s.total).toBe(cs.length - notes.length)
  })

  it('healthScore counts passes, failing errors and warnings', () => {
    const s = healthScore(cs)
    expect(s.passed).toBe(s.total - 1)
    expect(s.errors).toBe(0)
    expect(s.warnings).toBe(1)
  })

  it('every check has a known section and, if set, a resolvable field', () => {
    for (const c of cs) {
      expect(['deal', 'build', 'phasing', 'capital', 'income', 'operations', 'returns', 'statements']).toContain(c.section)
      if (c.fieldId) expect(fieldById(c.fieldId), c.id).toBeDefined()
    }
  })

  it('hidden inputs are not validated', () => {
    const ids = validateInputs(D).map(c => c.id)
    for (const id of ['funds.ffeDays', 'build.patrolRental', 'build.financeLegal', 'support.lagDays', 'indexation.wpi'])
      expect(ids).not.toContain(`field:${id}`)
  })
})

describe('schedules', () => {
  it('repayment with last element removed: engine runs, repayment-sum fails with 95.40%', () => {
    const cs = checks(setAt(D, 'capital.repayment', D.capital.repayment.slice(0, -1)))
    const c = find(cs, 'repayment-sum')
    expect(c).toMatchObject({ pass: false, severity: 'error', fieldId: 'capital.repayment' })
    expect(c.message).toContain('95.40%')
    expect(find(cs, 'debt-repaid').pass).toBe(false)
  })
  it('installments of the wrong length fail even if they sum to 100%', () => {
    const inst = D.income.installments.slice(0, -2)
    inst.push(1 - inst.reduce((a, b) => a + b, 0))
    expect(find(validateInputs(setAt(D, 'income.installments', inst)), 'installment-sum').pass).toBe(false)
  })
})

describe('input checks', () => {
  it('rate quote: stale fails, after the bid fails dates-order, and Date.now() does not matter', () => {
    expect(find(validateInputs(setAt(D, 'income.rateQuoteDate', '2026-03-01')), 'rate-quote-fresh').pass).toBe(false)
    expect(find(validateInputs(setAt(D, 'income.rateQuoteDate', '2026-07-09')), 'dates-order').pass).toBe(false)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    expect(find(validateInputs(D), 'rate-quote-fresh').pass).toBe(true)
  })
  it('aps-trigger: bid 1,800 → 0.8% of bid = ₹14.40 Cr; 1,600 → 2.4%', () => {
    const c = find(validateInputs(setAt(D, 'deal.bidPrice', 1800)), 'aps-trigger')
    expect(c).toMatchObject({ severity: 'info', pass: false })
    expect(c.message).toContain('₹14.40 Cr')
    expect(find(validateInputs(setAt(D, 'deal.bidPrice', 1600)), 'aps-trigger').message).toContain('2.4%')
    expect(find(validateInputs(D), 'aps-trigger').pass).toBe(true)
  })
  it('field rules: build days limit, whole days, NaN, fixed operate years, milestone order', () => {
    expect(find(validateInputs(setAt(D, 'deal.buildDays', 100)), 'field:deal.buildDays').message).toContain('365')
    expect(find(validateInputs(setAt(D, 'deal.daysToAward', 60.5)), 'field:deal.daysToAward').pass).toBe(false)
    expect(find(validateInputs(setAt(D, 'build.epcFixed', NaN)), 'field:build.epcFixed').pass).toBe(false)
    expect(find(validateInputs(setAt(D, 'deal.operateYears', 20)), 'field:deal.operateYears').pass).toBe(false)
    expect(find(validateInputs(setAt(D, 'milestones.1.day', 200)), 'field:milestones').pass).toBe(false)
  })
  it('resurfacing order and support tranches', () => {
    const r = (y: [number, number]) => find(validateInputs(setAt(D, 'operations.resurfacingYears', y)), 'resurfacing-order').pass
    expect([r([6, 9]), r([6, 16]), r([6, 12])]).toEqual([false, false, true])
    const t = (i: Inputs) => find(validateInputs(i), 'tranche-sum').pass
    expect(t(setAt(D, 'support.tranches.3.shareOfBid', 0))).toBe(false)
    expect(t(setAt(D, 'support.tranches.1.progress', 0.05))).toBe(false)
  })
  it('manual phasing must total 100% while selected; the Schedule G option exists', () => {
    const bad = (phasing: Inputs['build']['phasing']) => ({ ...D, build: { ...D.build, phasing, manualPhasing: D.build.manualPhasing.map((x, k) => (k === 0 ? x - 0.05 : x)) } })
    expect(find(validateInputs(bad('manual')), 'manual-phasing-sum').message).toContain('95.00%')
    expect(find(validateInputs(bad('equated')), 'manual-phasing-sum').pass).toBe(true)
    expect(find(validateInputs(setAt(D, 'build.phasing', 'scheduleG')), 'field:build.phasing').pass).toBe(true)
    expect(find(validateInputs(setAt(D, 'build.phasing', 'sCurve')), 'field:build.phasing').pass).toBe(false)
  })
  it('an invalid bid date blocks the engine (it would throw); nothing else does', () => {
    expect(blockingChecks(D)).toEqual([])
    const bad = setAt(D, 'deal.bidDate', '2026-02-30')
    expect(() => runModel(bad)).toThrow()
    expect(blockingChecks(bad).map(c => c.id)).toEqual(['field:deal.bidDate'])
    expect(modelRunCheck(new Error('boom'))).toMatchObject({ id: 'model-run', severity: 'error', pass: false })
  })
})

describe('model checks that can fail', () => {
  it('financing tie-up: threshold ₹1,154.84 Cr passes; bid 2,600 with AE 4,000 fails at ₹1,560.00 Cr', () => {
    expect(find(runChecks(R), 'financing-tieup').message).toContain('₹1,154.84 Cr')
    const c = find(checks(setAt(setAt(D, 'deal.bidPrice', 2600), 'deal.authorityEstimate', 4000)), 'financing-tieup')
    expect(c).toMatchObject({ pass: false, severity: 'error' })
    expect(c.message).toContain('₹1,560.00 Cr')
  })
  it('low bid: DSCR floor fails naming the FY; dscr-warn and the hurdle fail too', () => {
    const cs = checks(setAt(D, 'deal.bidPrice', 1800))
    const f = find(cs, 'dscr-floor')
    expect(f).toMatchObject({ pass: false, severity: 'error' })
    expect(f.message).toMatch(/0\.88× \(FY38\).*doesn't cover debt service/)
    expect(find(cs, 'dscr-warn').pass).toBe(false)
    expect(find(cs, 'equity-hurdle')).toMatchObject({ pass: false, severity: 'info' })
  })
  it('a V16 result that breaks an identity is reproduced and flagged: bid 1,500 gives negative cash', () => {
    const c = find(checks(setAt(D, 'deal.bidPrice', 1500)), 'cash-nonnegative')
    expect(c).toMatchObject({ pass: false, severity: 'error' })
    expect(c.message).toMatch(/-₹9\.60 Cr at FY31/)
  })
  it('leverage warns above maxLeverage', () => {
    expect(find(checks(setAt(D, 'capital.equityPct', 0.2)), 'leverage')).toMatchObject({ pass: false, severity: 'warning' })
  })
  it('Construction Support received ahead of spend (bid 8,000) warns with the excess', () => {
    const c = find(checks(setAt(D, 'deal.bidPrice', 8000)), 'milestone-funding-1')
    expect(c).toMatchObject({ pass: false, severity: 'warning' })
    expect(c.message).toContain('₹235.95 Cr')
  })
  it('sources-uses reconciles the monthly draws: a corrupted debt or equity figure fails with amounts', () => {
    expect(find(runChecks(R), 'sources-uses').pass).toBe(true)
    const r = copy()
    r.construction.debt += 10
    const c = find(runChecks(r), 'sources-uses')
    expect(c.pass).toBe(false)
    expect(c.message).toMatch(/Monthly debt draws.*₹10\.00 Cr/)
    const e = copy()
    e.construction.months[0].equityUpfront += 5
    expect(find(runChecks(e), 'sources-uses').message).toMatch(/equity/i)
  })
  it('a loop that does not converge is an error naming the loop', () => {
    const cs = runChecks(runModel(D, { maxConstructionIterations: 2, maxTaxIterations: 2 }))
    const c = find(cs, 'loop-construction')
    expect(c).toMatchObject({ pass: false, severity: 'error' })
    expect(c.message).toMatch(/^Construction funding .* did not converge after 2 iterations/)
    expect(find(cs, 'loop-tax').message).toMatch(/^Tax, interest on funds .* did not converge/)
    expect(find(runChecks(R), 'loop-csr').pass).toBe(true)
  })
  it('null IRRs and DSCRs (no answer) give messages, never NaN', () => {
    const r = copy()
    r.kpis = { ...r.kpis, equityIrr: null, dscrMin: null }
    const cs = runChecks(r)
    expect(find(cs, 'irr-undefined')).toMatchObject({ pass: false, severity: 'error', section: 'returns' })
    expect(find(cs, 'dscr-floor')).toMatchObject({ pass: true, message: 'No debt service, so no coverage test.' })
    expect(find(cs, 'equity-hurdle').message).toMatch(/can't be computed/)
    for (const c of cs) expect(c.message, c.id).not.toMatch(/NaN|undefined/)
  })
  it('negative DSCR is explained as negative cash flow', () => {
    const r = copy()
    r.kpis.dscrMin = -0.4
    expect(find(runChecks(r), 'dscr-floor').message).toMatch(/negative/)
  })
  it('money and ratio comparisons tolerate solver and float residue, but not real misses', () => {
    const kpi = (k: Partial<ModelResult['kpis']>) => runChecks({ ...R, kpis: { ...R.kpis, ...k } })
    expect(find(kpi({ equityIrr: D.targets.equityIrrHurdle - 1e-7 }), 'equity-hurdle').pass).toBe(true)
    expect(find(kpi({ equityIrr: D.targets.equityIrrHurdle - 1e-3 }), 'equity-hurdle').pass).toBe(false)
    expect(find(kpi({ dscrMin: 1 - 1e-10 }), 'dscr-floor').pass).toBe(true)
    expect(find(kpi({ dscrMin: 0.99 }), 'dscr-floor').pass).toBe(false)
  })
  it('GST credit left at the concession end warns with the amount written off', () => {
    const r = copy()
    r.gst.writeOff[r.gst.writeOff.length - 1] = 3.21
    expect(find(runChecks(r), 'gst-recovered').message).toContain('₹3.21 Cr')
  })
})

describe('maintenance reserve edge cases', () => {
  it('pass at the sample (20% × 5 years, resurfacing in years 6 and 12)', () => {
    for (const id of ['mmr-cover', 'mmr-window', 'mmr-third-year']) expect(find(runChecks(R), id).pass, id).toBe(true)
  })
  it('share × years ≠ 100% warns', () => {
    const c = find(validateInputs(setAt(D, 'funds.mmrShare', 0.25)), 'mmr-cover')
    expect(c).toMatchObject({ pass: false, severity: 'warning' })
    expect(c.message).toContain('125.00%')
  })
  it('a resurfacing in concession years 1–3 clips the set-aside window', () => {
    const c = find(checks(setAt(D, 'operations.resurfacingYears', [2, 9])), 'mmr-window')
    expect(c).toMatchObject({ pass: false, severity: 'warning', fieldId: 'operations.resurfacingYears' })
    expect(c.message).toMatch(/FY31.*3 of its 5 set-aside years/)
  })
  it('a third consecutive year of major maintenance warns', () => {
    const r = copy(), mm = r.opex.majorMaintenance, k = mm.findIndex(v => v > 0)
    mm[k + 2] = 1
    expect(find(runChecks(r), 'mmr-third-year')).toMatchObject({ pass: false, severity: 'warning' })
  })
})

describe('statement checks', () => {
  it('bs-balance fails on a corrupted ledger, naming the first failing year and the gap', () => {
    const r = copy()
    r.funds.mmr.closing[5] += 1.5
    const c = find(statementChecks(r), 'bs-balance')
    expect(c.pass).toBe(false)
    expect(c.message).toContain('FY32')
    expect(c.message).toContain('-₹1.50 Cr')
  })
  it('cash-tie fails when closing cash is not opening plus the flows', () => {
    const r = copy()
    r.cash.closing[3] += 0.25
    expect(find(statementChecks(r), 'cash-tie').pass).toBe(false)
  })
  it('equity-tie and debt-tie fail on a mismatch', () => {
    const e = copy()
    e.construction.equity += 1
    expect(find(statementChecks(e), 'equity-tie').pass).toBe(false)
    const d = copy()
    d.debt.repayment[10] -= 2
    expect(find(statementChecks(d), 'debt-tie').message).toMatch(/Repayments/)
  })
  it('a gap within ₹0.01 Cr still passes', () => {
    const r = copy()
    r.funds.mmr.closing[5] += 0.004
    expect(find(statementChecks(r), 'bs-balance').pass).toBe(true)
  })
})

describe('no build months and broken inputs', () => {
  it.each([['Build Days −30', -30], ['Build Days 0', 0]])('%s: checks run without throwing and fail clearly', (_, days) => {
    const cs = checks(setAt(D, 'deal.buildDays', days))
    expect(find(cs, 'build-period')).toMatchObject({ pass: false, severity: 'error', fieldId: 'deal.buildDays' })
    for (const c of cs) expect(c.message, c.id).not.toMatch(/NaN/)
  })
  it('every failing check with a fieldId resolves', () => {
    const cases: Inputs[] = [
      setAt(D, 'deal.bidPrice', 1800), setAt(D, 'deal.buildDays', 100), setAt(D, 'income.rateQuoteDate', '2026-03-01'),
      setAt(D, 'capital.repayment', D.capital.repayment.slice(0, -1)), setAt(D, 'operations.resurfacingYears', [6, 9]),
      setAt(setAt(D, 'deal.bidPrice', 2600), 'deal.authorityEstimate', 4000), setAt(D, 'capital.equityPct', 0.2),
      setAt(D, 'build.phasing', 'scheduleG'), setAt(D, 'support.pctOfBid', 0.3), setAt(D, 'deal.projectName', ' '),
      setAt(D, 'deal.pavement', 'concrete'),
    ]
    let n = 0
    for (const i of cases) for (const c of failing(checks(i))) if (c.fieldId) { n++; expect(fieldById(c.fieldId), c.id).toBeDefined() }
    expect(n).toBeGreaterThan(10)
  })
})
