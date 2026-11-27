// Health: typed checks that can actually fail, explain themselves with numbers, and point at the field to fix (spec §9).
import { FIELDS } from '../fields'
import { fmt } from '../lib/format'
import { getAt } from '../lib/path'
import { addMonths, isIsoDate, toDay } from './dates'
import type { ModelResult } from './model'
import { type Statements, buildStatements, row } from './statements'
import type { FieldDef, Inputs, SectionId } from './types'

export type Severity = 'error'|'warning'|'info'
export interface Check { id: string; title: string; section: SectionId; fieldId?: string; severity: Severity; pass: boolean; message: string }

const SUM_TOL = 1e-6 // schedules must total 100% to within float residue
const MONEY_TOL = 0.005 // ₹ Cr; below this an amount displays as ₹0.00 Cr
const RECON_TOL = 0.01 // ₹ Cr; the debt / Interest During Build fixed point converges to this
const RATIO_TOL = 1e-9 // float residue on DSCR comparisons
const IRR_TOL = 1e-6 // XIRR converges to about this
export const DSCR_FLOOR = 1.0 // cash flow must at least cover debt service
const TIEUP_SHARE = 0.9 // financing tie-up: 90% of (Authority Estimate − Construction Support)
const APS_FREE_PTS = 10 // no Additional Performance Security up to 10 points below the estimate
const APS_SLAB2_PTS = 20 // second slab starts 20 points below
const APS_RATE_1 = 0.001 // 0.1% of bid per point in the first slab
const APS_RATE_2 = 0.002 // 0.2% of bid per point beyond the second slab
const RESURFACING_GAP = 5 // second resurfacing must be more than 5 years after the first
const PERIODS_PER_YEAR = 2 // half-yearly payments (matches operations)

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const check = (id: string, title: string, section: SectionId, severity: Severity, pass: boolean, message: string,
  fieldId?: string): Check => ({ id, title, section, severity, pass, message, ...(fieldId ? { fieldId } : {}) })

const NUMERIC: FieldDef['kind'][] = ['money', 'percent', 'days', 'years', 'number']
function show(kind: FieldDef['kind'], n: number) {
  if (kind === 'money') return fmt.cr(n)
  if (kind === 'percent') return fmt.pct(n)
  if (kind === 'days') return `${fmt.num(n, 0)} days`
  if (kind === 'years') return `${fmt.num(n, 0)} years`
  return fmt.num(n)
}

/** First problem with a field's value, or null. Lists with their own cross-field check are skipped. */
function fieldProblem(f: FieldDef, v: unknown, i: Inputs): string | null {
  if (NUMERIC.includes(f.kind) && !Array.isArray(v)) {
    const n = v as number
    if (typeof n !== 'number' || !Number.isFinite(n)) return `${f.label} must be a number.`
    if ((f.kind === 'days' || f.kind === 'years') && !Number.isInteger(n)) return `${f.label} must be a whole number (is ${n}).`
    if (f.min != null && n < f.min) return `${f.label} must be at least ${show(f.kind, f.min)} (is ${show(f.kind, n)}).`
    if (f.max != null && n > f.max) return `${f.label} must be at most ${show(f.kind, f.max)} (is ${show(f.kind, n)}).`
    return null
  }
  if (f.kind === 'toggle') return typeof v === 'boolean' ? null : `${f.label} must be on or off.`
  if (f.kind === 'text') return typeof v === 'string' && v.trim() ? null : `${f.label} is required.`
  if (f.kind === 'date') return isIsoDate(v) ? null : `${f.label} must be a valid date (YYYY-MM-DD).`
  if (f.kind === 'select') return f.options?.some(o => o.value === v) ? null : `${f.label} must be one of ${f.options?.map(o => o.label).join(', ')}.`
  if (f.kind === 'percentList') {
    const xs = v as number[]
    const k = xs.findIndex(x => !(x >= 0 && x <= 1))
    return k < 0 ? null : `${f.label}: entry ${k + 1} must be between 0% and 100% (is ${fmt.pct(xs[k])}).`
  }
  if (f.kind === 'milestoneList') {
    const ms = i.milestones
    for (let k = 0; k < ms.length; k++) {
      const m = ms[k], prev = ms[k - 1]
      if (!Number.isInteger(m.day) || m.day < 1 || m.day > i.deal.buildDays)
        return `Milestone ${k + 1}: day ${m.day} must be a whole day within the ${fmt.num(i.deal.buildDays, 0)} build days.`
      if (prev && m.day <= prev.day) return `Milestone ${k + 1}: day ${m.day} must be after milestone ${k} (day ${prev.day}).`
      for (const key of ['physical', 'financial'] as const) {
        if (!(m[key] >= 0 && m[key] <= 1)) return `Milestone ${k + 1}: ${key} progress must be between 0% and 100%.`
        if (prev && m[key] < prev[key]) return `Milestone ${k + 1}: ${key} progress ${fmt.pct(m[key])} is below milestone ${k} (${fmt.pct(prev[key])}).`
      }
    }
  }
  return null // trancheList → tranche-sum; resurfacingYears → resurfacing-order
}

export function validateInputs(i: Inputs): Check[] {
  const fields = FIELDS.filter(f => f.kind !== 'trancheList' && f.id !== 'operations.resurfacingYears').map(f => {
    const problem = fieldProblem(f, getAt(i, f.id), i)
    return check(`field:${f.id}`, f.label, f.section, 'error', !problem, problem ?? `${f.label} is valid.`, f.id)
  })

  const periods = PERIODS_PER_YEAR * i.deal.operateYears
  const schedule = (id: string, title: string, section: SectionId, fieldId: string, xs: number[], lengthOk: boolean, lengthRule: string) => {
    const s = sum(xs), sumOk = Math.abs(s - 1) <= SUM_TOL
    const msg = !sumOk ? `${title} sums to ${fmt.pct(s)} (must be 100.00%).`
      : !lengthOk ? `${title} has ${xs.length} entries; ${lengthRule}.` : `${title} sums to 100% over ${xs.length} payments.`
    return check(id, title, section, 'error', sumOk && lengthOk, msg, fieldId)
  }

  // Tranche weights split Construction Support (pctOfBid × bid); they need not sum to anything.
  const { tranches, pctOfBid } = i.support
  const badWeight = tranches.findIndex(t => !(t.shareOfBid > 0))
  const badProgress = tranches.findIndex((t, k) => !(t.progress > 0 && t.progress <= 1) || (k > 0 && t.progress <= tranches[k - 1].progress))
  const trancheMsg = !tranches.length ? `No tranches: Construction Support of ${fmt.pct(pctOfBid)} of bid has nowhere to land.`
    : badWeight >= 0 ? `Tranche ${badWeight + 1} weight ${fmt.pct(tranches[badWeight].shareOfBid)} must be above zero.`
    : badProgress >= 0 ? `Tranche ${badProgress + 1} progress ${fmt.pct(tranches[badProgress].progress)} must be above 0%, above the previous tranche and at most 100%.`
    : `${tranches.length} tranches split Construction Support of ${fmt.pct(pctOfBid)} of bid by weight, in ascending progress.`
  const tranchesOk = (tranches.length > 0 || pctOfBid === 0) && badWeight < 0 && badProgress < 0

  const mp = sum(i.build.manualPhasing), mpOk = i.build.phasing !== 'manual' || Math.abs(mp - 1) <= 1e-6
  const mpMsg = mpOk ? 'Manual EPC phasing totals 100%.' : `Manual EPC phasing sums to ${fmt.pct(mp)} (must be 100.00%).`

  const [r1, r2] = i.operations.resurfacingYears, Y = i.deal.operateYears
  const resurfacingOk = Number.isInteger(r1) && Number.isInteger(r2) && r1 >= 1 && r2 > r1 + RESURFACING_GAP && r2 < Y
  const resurfacingMsg = r2 <= r1 + RESURFACING_GAP ? `Second resurfacing (year ${r2}) must be more than ${RESURFACING_GAP} years after the first (year ${r1}).`
    : r2 >= Y ? `Second resurfacing (year ${r2}) must fall before the end of the ${Y}-year operations period.`
    : resurfacingOk ? `Resurfacing in years ${r1} and ${r2}.` : `Resurfacing years must be whole operating years (are ${r1}, ${r2}).`

  const datesValid = isIsoDate(i.deal.bidDate) && isIsoDate(i.income.rateQuoteDate)
  const bid = toDay(i.deal.bidDate), quote = toDay(i.income.rateQuoteDate)
  const oldest = addMonths(bid, -i.income.maxQuoteAgeMonths)
  const fresh = datesValid && quote >= oldest

  const ae = i.deal.authorityEstimate, bidPrice = i.deal.bidPrice
  const d = ae > 0 ? (ae - bidPrice) / ae : 0, pts = Math.round(d * 100) // workbook rule: points rounded
  const apsPct = pts <= APS_FREE_PTS ? 0 : pts <= APS_SLAB2_PTS ? APS_RATE_1 * (pts - APS_FREE_PTS)
    : APS_RATE_1 * (APS_SLAB2_PTS - APS_FREE_PTS) + APS_RATE_2 * (pts - APS_SLAB2_PTS)
  const versus = `Bid is ${fmt.pct(Math.abs(d))} ${d >= 0 ? 'below' : 'above'} the Authority Estimate (${fmt.cr(ae)})`

  return [...fields,
    schedule('repayment-sum', 'Repayment Schedule', 'capital', 'capital.repayment', i.capital.repayment,
      i.capital.repayment.length <= periods, `debt must be repaid within the ${periods} payments`),
    schedule('installment-sum', 'Completion Payment Schedule', 'income', 'income.installments', i.income.installments,
      i.income.installments.length === periods, `it needs exactly ${periods} (${PERIODS_PER_YEAR} × ${Y} operate years)`),
    check('tranche-sum', 'Support tranches valid', 'capital', 'error', tranchesOk, trancheMsg, 'support.tranches'),
    check('manual-phasing-sum', 'Manual EPC phasing total', 'phasing', 'error', mpOk, mpMsg, 'build.manualPhasing'),
    check('resurfacing-order', 'Resurfacing years in order', 'operations', 'error', resurfacingOk, resurfacingMsg, 'operations.resurfacingYears'),
    check('dates-order', 'Rate quote on or before bid date', 'income', 'error', datesValid && quote <= bid,
      datesValid ? `Rate quote ${fmt.date(quote)} ${quote <= bid ? 'is on or before' : 'is after'} the bid date ${fmt.date(bid)}.`
        : 'Bid date and rate quote date must both be valid dates.', 'income.rateQuoteDate'),
    check('rate-quote-fresh', 'Rate quote is fresh', 'income', 'warning', fresh,
      datesValid ? `Rate quote ${fmt.date(quote)} ${fresh ? 'is within' : 'is older than'} ${i.income.maxQuoteAgeMonths} months before the bid date ${fmt.date(bid)} (oldest allowed ${fmt.date(oldest)}).`
        : 'Bid date and rate quote date must both be valid dates.', 'income.rateQuoteDate'),
    check('aps-trigger', 'Additional Performance Security', 'deal', 'info', apsPct === 0,
      apsPct === 0 ? `${versus}; no Additional Performance Security.`
        : `${versus}: Additional Performance Security of ${fmt.pct(apsPct, 1)} of bid = ${fmt.cr(apsPct * bidPrice)}.`, 'deal.bidPrice'),
  ]
}

export function runChecks(r: ModelResult): Check[] {
  const { inputs: i, timeline: t, build: b, ops, kpis: k } = r
  const out = validateInputs(i)

  // Financing tie-up: debt + equity ≥ min(90% × (AE − support share × bid), completion share × bid).
  const bid = i.deal.bidPrice
  const threshold = Math.min(TIEUP_SHARE * (i.deal.authorityEstimate - i.support.pctOfBid * bid), i.income.completionPctOfBid * bid)
  const tied = b.debt + b.equity
  const tiedOk = tied >= threshold - RECON_TOL // debt and equity are exact only to the solver tolerance
  out.push(check('financing-tieup', 'Financing Tie-up Test', 'deal', 'error', tiedOk,
    `Debt + equity ${fmt.cr(tied)} ${tiedOk ? 'meets' : 'is below'} the tie-up threshold ${fmt.cr(threshold)}.`, 'deal.bidPrice'))

  // An empty build grid (completion before start, or an unusable date) fails here; the milestone checks need months.
  const months = b.months
  out.push(check('build-period', 'Build period has months', 'deal', 'error', months.length > 0,
    months.length ? `The build runs ${months.length} months, ${fmt.date(t.start)} to ${fmt.date(t.completion)}.`
      : `There are no build months: Build Days is ${fmt.num(i.deal.buildDays, 0)}, so construction never runs. Build-period checks are skipped.`,
    'deal.buildDays'))

  // Build milestones, measured at the month containing each milestone day (the build grid is monthly).
  const epcTotal = sum(months.map(m => m.epc))
  let acc = 0
  const financial = months.map(m => (acc += m.epc) / epcTotal) // financial progress = cumulative EPC spend share
  if (months.length) i.milestones.forEach((ms, n) => {
    const found = months.findIndex(m => m.day >= t.start + ms.day - 1)
    const m = found < 0 ? months.length - 1 : found
    const mo = months[m], phys = mo.cumPhysical, fin = financial[m]
    const ok = phys >= ms.physical - SUM_TOL && fin >= ms.financial - SUM_TOL
    out.push(check(`milestone-progress-${n + 1}`, `Build Milestone ${n + 1} progress`, 'phasing', 'error', ok,
      `Day ${ms.day} (${fmt.date(mo.day)}): physical ${fmt.pct(phys)} vs required ${fmt.pct(ms.physical)}; financial ${fmt.pct(fin)} vs required ${fmt.pct(ms.financial)}.`,
      'milestones'))
    const excess = mo.cumFunding - mo.cumCost
    out.push(check(`milestone-funding-${n + 1}`, `Build Milestone ${n + 1} funding vs cost`, 'capital', 'warning', excess <= MONEY_TOL,
      excess <= MONEY_TOL ? `By day ${ms.day}, funding ${fmt.cr(mo.cumFunding)} does not exceed cost ${fmt.cr(mo.cumCost)}.`
        : `By day ${ms.day}, funding ${fmt.cr(mo.cumFunding)} exceeds cost ${fmt.cr(mo.cumCost)} by ${fmt.cr(excess)} (Construction Support received ahead of spend).`,
      'support.tranches'))
  })

  // Coverage. Comparisons are written so NaN fails.
  const worst = ops.find(p => p.dscr === k.dscrMin)
  const when = worst ? ` (period ${worst.n}, ${fmt.date(worst.day)})` : ''
  const floorOk = k.dscrMin == null || k.dscrMin >= DSCR_FLOOR - RATIO_TOL
  out.push(check('dscr-floor', `DSCR at least ${fmt.x(DSCR_FLOOR)}`, 'capital', 'error', floorOk,
    k.dscrMin == null ? 'No debt service, so no coverage test.'
      : floorOk ? `Minimum DSCR ${fmt.x(k.dscrMin)}${when} is at least ${fmt.x(DSCR_FLOOR)}.`
      : k.dscrMin < 0 ? `Minimum DSCR ${fmt.x(k.dscrMin)}${when}: cash flow is negative, so it doesn't cover debt service at all.`
      : `Minimum DSCR ${fmt.x(k.dscrMin)}${when} is below ${fmt.x(DSCR_FLOOR)}: cash flow doesn't cover debt service.`,
    'capital.repayment'))
  const warnOk = k.dscrMin == null || k.dscrMin >= i.capital.dscrWarn - RATIO_TOL
  out.push(check('dscr-warn', 'DSCR above warning level', 'capital', 'warning', warnOk,
    k.dscrMin == null ? 'No debt service, so no coverage test.'
      : `Minimum DSCR ${fmt.x(k.dscrMin)}${when} is ${warnOk ? 'at or above' : 'below'} the warning level ${fmt.x(i.capital.dscrWarn)}.`,
    'capital.dscrWarn'))

  const last = ops[ops.length - 1]
  const left = last ? last.debtClosing : b.debt
  out.push(check('debt-repaid', 'Debt fully repaid', 'capital', 'error', Math.abs(left) <= MONEY_TOL,
    Math.abs(left) <= MONEY_TOL ? `Debt is fully repaid by the final payment${last ? ` (${fmt.date(last.day)})` : ''}.`
      : `${fmt.cr(left)} of debt is still outstanding after the final payment${last ? ` (${fmt.date(last.day)})` : ''}.`,
    'capital.repayment'))

  // Money tolerance: the debt/equity split is exact only to the solver's ₹0.01 Cr (defaults sit at 3.0×).
  const levOk = b.debt <= i.capital.maxLeverage * b.equity + RECON_TOL
  out.push(check('leverage', 'Leverage within limit', 'capital', 'warning', levOk,
    `Debt / equity ${fmt.x(k.leverage)} is ${levOk ? 'within' : 'above'} the ${fmt.x(i.capital.maxLeverage)} limit.`,
    'capital.equityPct'))

  // Sources = Uses, reconciled independently: reported totals, the monthly draws behind debt and equity, and
  // the monthly cash (funding vs cost by completion). Negative debt/equity means Construction Support exceeds costs.
  const sources = b.support + b.supportGst + b.debt + b.equity
  // Draws are never negative, so the sign test is on the funding need itself.
  const need = b.totalUses - b.support - b.supportGst
  const negative = need < 0
  const negMsg = `Construction Support incl. GST ${fmt.cr(b.support + b.supportGst)} exceeds build costs ${fmt.cr(b.totalUses)} by ${fmt.cr(-need)}: there is nothing for debt and equity to fund.`
  const end = months[months.length - 1]
  const recon: [string, number, number][] = [
    ['Monthly equity draws', sum(months.map(m => m.equityDraw)), b.equity],
    ['Monthly debt draws', sum(months.map(m => m.debtDraw)), b.debt],
    ['Funding by completion', end?.cumFunding ?? 0, end?.cumCost ?? 0],
    ['Sources', sources, b.totalUses],
  ]
  const against = ['reported equity', 'reported debt', 'cost by completion', 'uses']
  const off = recon.findIndex(([, a, c]) => !(Math.abs(a - c) <= RECON_TOL))
  out.push(check('sources-uses', 'Sources = Uses', 'capital', 'error', off < 0 && !negative,
    negative ? negMsg : off >= 0
      ? `${recon[off][0]} ${fmt.cr(recon[off][1])} differ from ${against[off]} ${fmt.cr(recon[off][2])} by ${fmt.cr(recon[off][1] - recon[off][2])}.`
      : `Sources ${fmt.cr(sources)} equal uses ${fmt.cr(b.totalUses)}; monthly equity and debt draws and build cash reconcile.`,
    'deal.bidPrice'))
  const badMonth = months.find(m => !(m.equityDraw >= -MONEY_TOL && m.debtDraw >= -MONEY_TOL && m.debtBalance >= -MONEY_TOL))
  out.push(check('build-cash', 'Build cash never negative', 'capital', 'error', !negative && !badMonth,
    negative ? negMsg : badMonth ? `Negative build-period draw or balance in ${fmt.date(badMonth.day)}.` : 'Every build-period draw and debt balance is non-negative.',
    'deal.bidPrice'))

  out.push(check('om-margin', 'O&M margin', 'operations', 'warning', k.omMargin >= 0,
    k.omMargin >= 0 ? `O&M payments exceed operating costs by ${fmt.cr(k.omMargin)} over the concession.`
      : `O&M payments fall short of operating costs by ${fmt.cr(-k.omMargin)} over the concession.`, 'operations.routine'))

  out.push(check('solver-converged', 'Interest During Build solver converged', 'build', 'error', b.converged,
    b.converged ? `Debt and Interest During Build converged in ${b.iterations} iterations.`
      : `Debt and Interest During Build did not converge after ${b.iterations} iterations; results are approximate.`))

  const irrs = [k.equityIrr, k.projectIrrPre, k.projectIrrPost]
  out.push(check('irr-undefined', 'Returns computable', 'returns', 'error', irrs.every(x => x != null),
    irrs.every(x => x != null) ? 'Equity and project IRRs are defined.'
      : "Returns can't be computed with these inputs: the cash flows never turn positive enough to give an IRR."))

  const hurdle = i.targets.equityIrrHurdle
  const hurdleOk = k.equityIrr != null && k.equityIrr >= hurdle - IRR_TOL
  out.push(check('equity-hurdle', 'Equity IRR vs hurdle', 'returns', 'info', hurdleOk,
    k.equityIrr == null ? `Equity IRR can't be computed, so it can't be compared with the ${fmt.pct(hurdle)} hurdle.`
      : `Equity IRR ${fmt.pct(k.equityIrr)} is ${hurdleOk ? 'at or above' : 'below'} the ${fmt.pct(hurdle)} hurdle.`,
    'targets.equityIrrHurdle'))

  // GST credit is recovered from Completion Payments; a low bid can leave some unrecovered at concession end.
  const recovered = sum(ops.map(p => p.gstRecovery)), gstLeft = b.netGstCredit - recovered
  out.push(check('gst-recovered', 'GST credit recovered', 'income', 'warning', gstLeft <= MONEY_TOL,
    gstLeft <= MONEY_TOL ? `All ${fmt.cr(b.netGstCredit)} of net GST credit is recovered from Completion Payments by the final payment.`
      : `${fmt.cr(gstLeft)} of net GST credit is still unrecovered after the final payment (recovered ${fmt.cr(recovered)} of ${fmt.cr(b.netGstCredit)}); it stays a receivable at concession end.`,
    'deal.bidPrice'))

  out.push(...statementChecks(buildStatements(r)))
  return out
}

/** The statements' own identities, re-checked on the statements as built: balance sheet and cash reconciliation. */
export function statementChecks(s: Statements): Check[] {
  const { years } = s
  const span = years.length ? `${fmt.fy(years[0])} to ${fmt.fy(years[years.length - 1])}` : ''
  const test = (id: string, title: string, a: number[], c: number[], ok: string, bad: (gap: number, year: string) => string) => {
    const gaps = years.map((_, k) => a[k] - c[k])
    const k = gaps.findIndex(g => !(Math.abs(g) <= RECON_TOL))
    const worst = Math.max(0, ...gaps.map(Math.abs))
    return check(id, title, 'statements', 'error', k < 0,
      !years.length ? 'No financial years to check.'
        : k < 0 ? `${ok} at every FY end, ${span} (largest gap ${fmt.cr(worst)}).`
        : bad(gaps[k], `${fmt.fy(years[k])} (${fmt.date(years[k])})`))
  }
  const v = (rows: Statements['bs'], key: string) => row(rows, key).values
  return [
    test('bs-balance', 'Balance sheet balances', v(s.bs, 'totalAssets'), v(s.bs, 'totalLiabilitiesEquity'), 'Balance sheet balances',
      (g, y) => `Balance sheet does not balance at ${y}: assets exceed liabilities and equity by ${fmt.cr(g)}.`),
    test('cf-reconcile', 'Cash flow reconciles to balance sheet', v(s.cf, 'closingCash'), v(s.bs, 'cash'), 'Closing cash equals balance-sheet cash',
      (g, y) => `Cash flow closing cash differs from balance-sheet cash at ${y} by ${fmt.cr(g)}.`),
  ]
}

export function healthScore(checks: Check[]) {
  const failed = checks.filter(c => !c.pass)
  return { passed: checks.length - failed.length, total: checks.length,
    errors: failed.filter(c => c.severity === 'error').length, warnings: failed.filter(c => c.severity === 'warning').length }
}
