// Health: typed checks that can actually fail, explain themselves with numbers, and point at the field to fix (spec §9).
// Model checks read the original-method (V16) result; V16's own statement checks are re-run on the IGAAP statements.
import { FIELDS } from '../fields'
import { fmt } from '../lib/format'
import { getAt } from '../lib/path'
import { addMonths, fyEnd, isIsoDate, toDay, toIso } from './dates'
import type { ModelResult } from './model'
import type { FieldDef, Inputs, SectionId } from './types'
import { epcPhasing } from './v16/construction'
import { buildIgaap } from './v16/statements/igaap'
import type { Loop, Row } from './v16/types'

export type Severity = 'error'|'warning'|'info'
/** `group: 'notes'`: a method note (a reproduced quirk of the original), not a check; Health lists them apart. */
export interface Check { id: string; title: string; section: SectionId; fieldId?: string; severity: Severity; pass: boolean
  message: string; group?: 'notes' }

const SUM_TOL = 1e-6 // schedules must total 100% to within float residue
const MONEY_TOL = 0.005 // ₹ Cr; below this an amount displays as ₹0.00 Cr
/** ₹ Cr; the funding fixed points converge to this. The statement checks (here and on the Statements screen) tie to it. */
export const RECON_TOL = 0.01
/** A reconciliation gap within tolerance; NaN does not tie. Health and the Statements banners and check rows share it. */
export const ties = (gap: number) => Math.abs(gap) <= RECON_TOL
const RATIO_TOL = 1e-9 // float residue on DSCR comparisons
const IRR_TOL = 1e-6 // XIRR converges to about this
export const DSCR_FLOOR = 1.0 // cash flow must at least cover debt service
const TIEUP_SHARE = 0.9 // financing tie-up: 90% of (Authority Estimate − Construction Support)
const APS_FREE_PTS = 10 // no Additional Performance Security up to 10 points below the estimate
const APS_SLAB2_PTS = 20 // second slab starts 20 points below
const APS_RATE_1 = 0.001 // 0.1% of bid per point in the first slab
const APS_RATE_2 = 0.002 // 0.2% of bid per point beyond the second slab
const RESURFACING_GAP = 5 // second resurfacing must be more than 5 years after the first
const PERIODS_PER_YEAR = 2 // half-yearly payments

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
  const fields = FIELDS.filter(f => !f.hidden && f.kind !== 'trancheList' && f.id !== 'operations.resurfacingYears').map(f => {
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

  const mp = sum(i.build.manualPhasing), mpOk = i.build.phasing !== 'manual' || Math.abs(mp - 1) <= SUM_TOL
  const mpMsg = mpOk ? 'Manual EPC phasing totals 100%.' : `Manual EPC phasing sums to ${fmt.pct(mp)} (must be 100.00%).`

  const [r1, r2] = i.operations.resurfacingYears, Y = i.deal.operateYears
  const resurfacingOk = Number.isInteger(r1) && Number.isInteger(r2) && r1 >= 1 && r2 > r1 + RESURFACING_GAP && r2 < Y
  const resurfacingMsg = r2 <= r1 + RESURFACING_GAP ? `Second resurfacing (year ${r2}) must be more than ${RESURFACING_GAP} years after the first (year ${r1}).`
    : r2 >= Y ? `Second resurfacing (year ${r2}) must fall before the end of the ${Y}-year operations period.`
    : resurfacingOk ? `Resurfacing in years ${r1} and ${r2}.` : `Resurfacing years must be whole operating years (are ${r1}, ${r2}).`

  // MMR: mmrShare of each major maintenance is set aside in each of mmrYears years, so the two must give 100%.
  const { mmrShare, mmrYears } = i.funds, cover = mmrShare * mmrYears, coverOk = Math.abs(cover - 1) <= SUM_TOL
  const coverMsg = `The maintenance reserve sets aside ${fmt.pct(mmrShare)} × ${fmt.num(mmrYears, 0)} years = ${fmt.pct(cover)} of each major maintenance`
    + (coverOk ? '.' : cover < 1 ? ', so the reserve falls short and the rest is paid from cash.'
      : ', so more than the cost is reserved and the excess stays in the fund.')

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
    check('mmr-cover', 'Maintenance reserve covers each resurfacing', 'operations', 'warning', coverOk, coverMsg, 'funds.mmrShare'),
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

/** Checks that stop the engine from running at all (it throws on a date it cannot place): shown instead of results. */
export function blockingChecks(i: Inputs): Check[] {
  return validateInputs(i).filter(c => c.id === 'field:deal.bidDate' && !c.pass)
}

/** The engine threw on inputs that passed `blockingChecks`: an error check instead of a crash. */
export const modelRunCheck = (e: unknown): Check => check('model-run', 'Model can run', 'deal', 'error', false,
  `The model can't run on these inputs: ${e instanceof Error ? e.message : String(e)}. Check the dates and day counts.`, 'deal.daysToStart')

const LOOPS: Record<keyof ModelResult['loops'], { title: string; what: string }> = {
  construction: { title: 'Construction funding converged', what: 'Construction funding (debt, equity, interest during build and the interest DSR)' },
  tax: { title: 'Tax and reserves converged', what: 'Tax, interest on funds and the DSR top-ups' },
  csr: { title: 'CSR converged', what: 'CSR and profit after tax' },
}

/** Formats a method note's values: the DSCR note in ×, the others are IRRs. */
const noteValue = (id: string, n: number) => (id === 'B-Q5' ? fmt.x(n) : fmt.pct(n))

export function runChecks(r: ModelResult): Check[] {
  const { inputs: i, grid: g, construction: c, cash, debt, opex, gst } = r
  // A DSCR or IRR the inputs give no answer for is null (no debt service, no root); a non-finite one is treated the same.
  const k = { ...r.kpis, dscrMin: Number.isFinite(r.kpis.dscrMin) ? r.kpis.dscrMin : null }
  const out = validateInputs(i)
  const months = c.months

  // Financing tie-up: debt + equity ≥ min(90% × (AE − support share × bid), completion share × bid).
  const bid = i.deal.bidPrice
  const threshold = Math.min(TIEUP_SHARE * (i.deal.authorityEstimate - i.support.pctOfBid * bid), i.income.completionPctOfBid * bid)
  const tied = c.debt + c.equity
  const tiedOk = tied >= threshold - RECON_TOL // debt and equity are exact only to the solver tolerance
  out.push(check('financing-tieup', 'Financing Tie-up Test', 'deal', 'error', tiedOk,
    `Debt + equity ${fmt.cr(tied)} ${tiedOk ? 'meets' : 'is below'} the tie-up threshold ${fmt.cr(threshold)}.`, 'deal.bidPrice'))

  const build = g.periods.flatMap((p, n) => (p.kind === 'construction' ? [n] : []))
  out.push(check('build-period', 'Build period has months', 'deal', 'error', build.length > 0,
    build.length ? `The build runs ${build.length} months, ${fmt.date(g.appointed)} to ${fmt.date(g.constructionEnd)}.`
      : `There are no build months: Build Days is ${fmt.num(i.deal.buildDays, 0)}, so construction never runs. Build-period checks are skipped.`,
    'deal.buildDays'))

  // Manual phasing is by month index (quirk A-Q1): build months past the last entry get no EPC. A build starting
  // mid-month spans one extra, partial calendar month (the sample: 36 entries, 37 months), which is allowed.
  const entries = i.build.manualPhasing.length, first = build.length ? g.periods[build[0]] : undefined
  const firstPartial = !!first && first.days < Number(toIso(first.end).slice(8, 10))
  const short = i.build.phasing === 'manual' && build.length > entries + (firstPartial ? 1 : 0)
  out.push(check('manual-phasing-length', 'Manual EPC phasing covers the build', 'phasing', 'warning', !short,
    i.build.phasing !== 'manual' ? 'Manual EPC phasing is not in use.'
      : short ? `The build runs ${build.length} months but manual EPC phasing has ${entries} entries: as the original, months ${entries + 1} to ${build.length} get no EPC.`
      : `Manual EPC phasing has ${entries} entries for the ${build.length} build months.`,
    'build.manualPhasing'))

  // Build milestones, at the month containing each milestone day. Physical = EPC phasing (the original's progress),
  // financial = EPC spend share; funding = Construction Support + GST, equity and debt drawn, against total cost.
  const phys = epcPhasing(i, g), epc = months.map(m => m.epcFixed + m.epcVariable), epcTotal = sum(epc)
  const funding = months.map(m => m.grant + m.grantGst + m.equityUpfront + m.equityDeferred + m.debtDraw)
  const upTo = (xs: number[], n: number) => sum(xs.slice(0, n + 1))
  if (build.length) i.milestones.forEach((ms, n) => {
    const m = build.find(x => g.periods[x].end >= g.appointed + ms.day - 1) ?? build[build.length - 1]
    const end = g.periods[m].end, p = upTo(phys, m), f = epcTotal > 0 ? upTo(epc, m) / epcTotal : 0
    const ok = p >= ms.physical - SUM_TOL && f >= ms.financial - SUM_TOL
    out.push(check(`milestone-progress-${n + 1}`, `Build Milestone ${n + 1} progress`, 'phasing', 'error', ok,
      `Day ${ms.day} (${fmt.date(end)}): physical ${fmt.pct(p)} vs required ${fmt.pct(ms.physical)}; financial ${fmt.pct(f)} vs required ${fmt.pct(ms.financial)}.`,
      'milestones'))
    const fund = upTo(funding, m), cost = upTo(months.map(x => x.tpc), m), excess = fund - cost
    out.push(check(`milestone-funding-${n + 1}`, `Build Milestone ${n + 1} funding vs cost`, 'capital', 'warning', excess <= MONEY_TOL,
      excess <= MONEY_TOL ? `By day ${ms.day}, funding ${fmt.cr(fund)} does not exceed cost ${fmt.cr(cost)}.`
        : `By day ${ms.day}, funding ${fmt.cr(fund)} exceeds cost ${fmt.cr(cost)} by ${fmt.cr(excess)} (Construction Support received ahead of spend).`,
      'support.tranches'))
  })

  // Coverage, annual (FY) as the original. Null DSCR = no debt service in that year; comparisons are written so NaN fails.
  const worstFy = cash.dscr.findIndex(v => v != null && v === k.dscrMin)
  const when = worstFy >= 0 ? ` (${fmt.fy(g.fys[worstFy])})` : ''
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

  const left = debt.closing[debt.closing.length - 1] ?? c.debt
  out.push(check('debt-repaid', 'Debt fully repaid', 'capital', 'error', Math.abs(left) <= MONEY_TOL,
    Math.abs(left) <= MONEY_TOL ? `Debt is fully repaid by the last repayment (${fmt.date(debt.repaymentEnd)}).`
      : `${fmt.cr(left)} of debt is still outstanding at the end of ${fmt.fy(g.fys[g.fys.length - 1])}.`,
    'capital.repayment'))

  const levOk = c.debt <= i.capital.maxLeverage * c.equity + RECON_TOL
  out.push(check('leverage', 'Leverage within limit', 'capital', 'warning', levOk,
    `Debt / equity ${fmt.x(k.leverage)} is ${levOk ? 'within' : 'above'} the ${fmt.x(i.capital.maxLeverage)} limit.`,
    'capital.equityPct'))

  // Sources = Uses: Construction Support with GST, equity and debt against the project cost (to the 1st annuity), and
  // the monthly draws behind the reported debt and equity. The STL passes straight through to the EPC contractor.
  const support = sum(months.map(m => m.grant)), supportGst = sum(months.map(m => m.grantGst))
  const sources = support + supportGst + c.debt + c.equity
  const need = c.tpc - support - supportGst, negative = need < 0
  const negMsg = `Construction Support incl. GST ${fmt.cr(support + supportGst)} exceeds project cost ${fmt.cr(c.tpc)} by ${fmt.cr(-need)}: there is nothing for debt and equity to fund.`
  const recon: [string, number, number, string][] = [
    ['Monthly equity draws', sum(months.map(m => m.equityUpfront + m.equityDeferred)), c.equity, 'reported equity'],
    ['Monthly debt draws', sum(months.map(m => m.debtDraw)), c.debt, 'reported debt'],
    ['Funding to the first annuity', sum(funding), c.tpc, 'project cost'],
    ['Sources', sources, c.tpc, 'uses'],
  ]
  const off = recon.findIndex(([, a, b]) => !(Math.abs(a - b) <= RECON_TOL))
  out.push(check('sources-uses', 'Sources = Uses', 'capital', 'error', off < 0 && !negative,
    negative ? negMsg : off >= 0
      ? `${recon[off][0]} ${fmt.cr(recon[off][1])} differ from ${recon[off][3]} ${fmt.cr(recon[off][2])} by ${fmt.cr(recon[off][1] - recon[off][2])}.`
      : `Sources ${fmt.cr(sources)} equal uses ${fmt.cr(c.tpc)}; monthly equity and debt draws reconcile.`,
    'deal.bidPrice'))
  const badMonth = months.findIndex(m => !(m.equityUpfront + m.equityDeferred >= -MONEY_TOL && m.debtDraw >= -MONEY_TOL && m.debtBalance >= -MONEY_TOL))
  out.push(check('build-cash', 'Build draws never negative', 'capital', 'error', !negative && badMonth < 0,
    negative ? negMsg : badMonth >= 0 ? `Negative draw or debt balance in ${fmt.date(g.periods[badMonth].end)}.`
      : 'Every build-period draw and debt balance is non-negative.',
    'deal.bidPrice'))

  out.push(check('om-margin', 'O&M margin', 'operations', 'warning', k.omMargin >= 0,
    k.omMargin >= 0 ? `O&M payments exceed operating costs by ${fmt.cr(k.omMargin)} over the concession.`
      : `O&M payments fall short of operating costs by ${fmt.cr(-k.omMargin)} over the concession.`, 'operations.routine'))

  // Major maintenance reserve edge cases (generalised from the original's fixed columns): a resurfacing soon after
  // COD has fewer set-aside years; a third consecutive year of major maintenance is not reserved for.
  const mm = opex.majorMaintenance, kCod = g.fys.indexOf(fyEnd(g.cod)), Y = i.funds.mmrYears
  const cycles = mm.flatMap((v, n) => (n >= kCod && kCod >= 0 && v > 0 && !(n > kCod && mm[n - 1] > 0) ? [n] : []))
  const clipped = cycles.map(n => {
    const end = mm[n + 1] > 0 ? n + 1 : n
    return { n, years: end - Math.max(kCod, end - Y + 1) + 1 }
  }).find(x => x.years < Y)
  out.push(check('mmr-window', 'Maintenance reserve built up in time', 'operations', 'warning', !clipped,
    clipped ? `Major maintenance in ${fmt.fy(g.fys[clipped.n])} comes ${clipped.years} year${clipped.years === 1 ? '' : 's'} after COD, so the reserve gets ${clipped.years} of its ${Y} set-aside years and falls short.`
      : cycles.length ? `Every major maintenance gets its ${Y} set-aside years.` : 'No major maintenance in the concession.',
    'operations.resurfacingYears'))
  const third = cycles.find(n => mm[n + 1] > 0 && mm[n + 2] > 0)
  out.push(check('mmr-third-year', 'Major maintenance reserved for', 'operations', 'warning', third === undefined,
    third === undefined ? 'Each major maintenance spans at most two financial years, all reserved for.'
      : `Major maintenance runs a third consecutive year (${fmt.fy(g.fys[third + 2])}); the reserve sets nothing aside for it.`,
    'operations.resurfacingYears'))

  for (const key of Object.keys(LOOPS) as (keyof typeof LOOPS)[]) {
    const l: Loop = r.loops[key], { title, what } = LOOPS[key]
    out.push(check(`loop-${key}`, title, key === 'construction' ? 'build' : 'returns', 'error', l.converged,
      l.converged ? `${what} converged in ${l.iterations} iteration${l.iterations === 1 ? '' : 's'}.`
        : `${what} did not converge after ${l.iterations} iterations; results are approximate.`))
  }

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

  // GST input credit not used against output GST by the concession end is written off to the P&L.
  const writtenOff = sum(gst.writeOff)
  out.push(check('gst-recovered', 'GST credit used', 'income', 'warning', writtenOff <= MONEY_TOL,
    writtenOff <= MONEY_TOL ? 'All GST input credit is set off against output GST by the concession end.'
      : `${fmt.cr(writtenOff)} of GST input credit is still unused at the concession end and is written off to profit and loss.`,
    'deal.bidPrice'))

  out.push(...statementChecks(r))
  out.push(...r.notes.map((n): Check => {
    const vals = [n.v16Value != null && `original ${noteValue(n.id, n.v16Value)}`,
      n.consistentValue != null && `consistent ${noteValue(n.id, n.consistentValue)}`].filter(Boolean)
    return { id: `note:${n.id}`, title: `Method note ${n.id}`, section: 'statements', severity: 'info', pass: true,
      group: 'notes', message: `${n.text}${vals.length ? ` (${vals.join('; ')}.)` : ''}` }
  }))
  return out
}

/** The original's own checks, re-run on the IGAAP statements as built: balance sheet, cash ≥ 0, cash, equity and debt
 *  ties. A V16 quirk that breaks one of them is reproduced, and reported here as an error. */
export function statementChecks(r: ModelResult): Check[] {
  const s = buildIgaap(r), { fys } = r.grid, n = fys.length
  const fy = (k: number) => `${fmt.fy(fys[k])} (${fmt.date(fys[k])})`
  const span = n ? `${fmt.fy(fys[0])} to ${fmt.fy(fys[n - 1])}` : ''
  const bsRow = (id: string) => (s.statements.find(x => x.key === 'bs')!.rows.find((x: Row) => x.id === id)?.values ?? [])
  const firstGap = (gaps: number[]) => gaps.findIndex(v => !ties(v))
  const c = r.construction, cash = r.cash, months = c.months, debt = r.debt
  const last = (xs: number[]) => xs[xs.length - 1] ?? 0

  const bs = firstGap(s.checks.bs)
  const neg = firstGap(s.checks.cash) // a 0/1 flag: 1 (or blank) fails, as on the Statements screen
  const tie = firstGap(cash.closing.map((v, k) => v - (k ? cash.closing[k - 1] : 0) - cash.inflow[k] - cash.outflow[k]))
  const equityBs = last(bsRow('bs.A.1')) + last(bsRow('bs.A.2')), equityDrawn = sum(months.map(m => m.equityShareCapital + m.equityUsl))
  const equityOff = [equityBs - c.equity, equityDrawn - c.equity].findIndex(v => !(Math.abs(v) <= RECON_TOL))
  const drawn = sum(months.map(m => m.debtDraw)), repaid = sum(debt.repayment)
  const debtOff = [drawn - debt.base, repaid - debt.base].findIndex(v => !(Math.abs(v) <= RECON_TOL))
  return [
    check('bs-balance', 'Balance sheet balances', 'statements', 'error', bs < 0,
      bs < 0 ? `Total liabilities equal total assets at every FY end, ${span}.`
        : `Balance sheet does not balance at ${fy(bs)}: total liabilities less total assets is ${fmt.cr(s.checks.bs[bs])}.`),
    check('cash-nonnegative', 'Cash never negative', 'statements', 'error', neg < 0,
      neg < 0 ? `Cash in bank is at least zero at every FY end, ${span}.`
        : `Cash in bank is ${fmt.cr(cash.closing[neg])} at ${fy(neg)}: the year's applications exceed its sources.`),
    check('cash-tie', 'Cash flow reconciles', 'statements', 'error', tie < 0,
      tie < 0 ? `Closing cash = opening cash + inflows + outflows at every FY end, ${span}; it is the balance-sheet cash.`
        : `Closing cash at ${fy(tie)} differs from opening cash plus the year's flows.`),
    check('equity-tie', 'Equity ties', 'statements', 'error', equityOff < 0,
      equityOff < 0 ? `Share capital and unsecured loan on the balance sheet (${fmt.cr(equityBs)}) equal the equity drawn in construction.`
        : equityOff === 0 ? `Balance-sheet equity ${fmt.cr(equityBs)} differs from the equity raised ${fmt.cr(c.equity)}.`
        : `Monthly equity draws ${fmt.cr(equityDrawn)} differ from the equity raised ${fmt.cr(c.equity)}.`),
    check('debt-tie', 'Senior debt ties', 'statements', 'error', debtOff < 0,
      debtOff < 0 ? `Senior debt drawn in construction (${fmt.cr(drawn)}) is the repayment base, and is repaid in full over the schedule.`
        : debtOff === 0 ? `Senior debt drawn ${fmt.cr(drawn)} differs from the repayment base ${fmt.cr(debt.base)}.`
        : `Repayments ${fmt.cr(repaid)} differ from the senior debt ${fmt.cr(debt.base)}.`),
  ]
}

/** Method notes are information, not checks: they don't count. */
export function healthScore(checks: Check[]) {
  const counted = checks.filter(c => c.group !== 'notes'), failed = counted.filter(c => !c.pass)
  return { passed: counted.length - failed.length, total: counted.length,
    errors: failed.filter(c => c.severity === 'error').length, warnings: failed.filter(c => c.severity === 'warning').length }
}
