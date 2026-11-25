// Simplified project accounts (not IGAAP/IndAS): annual Income Statement, Balance Sheet and Cash Flow by Indian FY,
// plus the monthly construction schedule. Definitions: docs/2026-11-25-statements-phasing-design.md §2. Pure.
import { type Day, fyEnd } from './dates'
import type { ModelResult } from './model'

export type RowStyle = 'heading' | 'subtotal' | 'total'
/** One statement line: a value per FY (empty for headings). Costs and outflows are negative. */
export interface Row { key: string; label: string; values: number[]; style?: RowStyle }
export interface Statements { years: Day[]; is: Row[]; bs: Row[]; cf: Row[] }

export interface Milestone { label: string; physical: number; financial: number }
export interface PhasingRow { day: Day; days: number; epcFixed: number; epcVariable: number; otherUses: number; gst: number; idc: number
  totalCost: number; cumCost: number; physical: number; cumPhysical: number; cumFinancial: number; support: number; equity: number
  debt: number; closingDebt: number; cash: number; milestones: Milestone[] }

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
export const lastOf = <T>(xs: T[]): T | undefined => xs[xs.length - 1]

export function row(rows: Row[], key: string): Row {
  const r = rows.find(x => x.key === key)
  if (!r) throw new Error(`no statement row ${key}`)
  return r
}

export function buildStatements(r: ModelResult): Statements {
  const { build: b, ops, inputs: i } = r, months = b.months
  const first = months[0]?.day ?? ops[0]?.day, last = lastOf(ops)?.day ?? lastOf(months)?.day
  const years: Day[] = []
  if (first != null && last != null) for (let y = fyEnd(first); y <= fyEnd(last); y = fyEnd(y + 1)) years.push(y)
  const Y = years.length
  const zeros = () => new Array<number>(Y).fill(0)
  const at = (d: Day) => years.indexOf(fyEnd(d))
  /** Per-FY totals of f over build months and ops periods (each bucketed by its own day). */
  const flow = (fm: (m: (typeof months)[number]) => number, fp: (p: (typeof ops)[number]) => number) => {
    const out = zeros()
    for (const m of months) out[at(m.day)] += fm(m)
    for (const p of ops) out[at(p.day)] += fp(p)
    return out
  }
  const cum = (xs: number[]) => { let a = 0; return xs.map(x => (a += x)) }
  const none = () => 0
  const sub = (...rows: number[][]) => years.map((_, k) => sum(rows.map(x => x[k])))

  // Income statement: operations only; build costs (incl. Interest During Build) are capitalised.
  const completion = flow(none, p => p.completionPayment), interestIncome = flow(none, p => p.interestIncome)
  const om = flow(none, p => p.omPayment), opex = flow(none, p => -p.opex)
  const revenue = sub(completion, interestIncome, om), ebitda = sub(revenue, opex)
  const amortisation = flow(none, p => -p.amortisation), ebit = sub(ebitda, amortisation)
  const financeCost = flow(none, p => -p.interest), pbt = sub(ebit, financeCost)
  const tax = flow(none, p => -p.tax), pat = sub(pbt, tax)

  // Cash flow (direct). Construction cost excludes the reserve and working capital, which are restricted cash.
  const receipts = flow(none, p => p.completionPayment + p.interestIncome + p.omPayment + p.gstRecovery)
  const opexPaid = flow(none, p => -p.opex), taxPaid = flow(none, p => -p.tax)
  const cfo = sub(receipts, opexPaid, taxPaid)
  const construction = flow(m => -(m.epc + m.otherUses + m.idc - m.reserve - m.workingCapital), none)
  const supportIn = flow(m => m.supportReceived + m.supportGst, none)
  const toReserve = flow(m => -m.reserve, p => -p.reserveMovement)
  const wcFunded = flow(m => -m.workingCapital, none), wcReleased = flow(none, p => p.wcRelease)
  const cfi = sub(construction, supportIn, toReserve, wcFunded, wcReleased)
  const equityIn = flow(m => m.equityDraw, none), debtIn = flow(m => m.debtDraw, none)
  const principal = flow(none, p => -p.principal), interestPaid = flow(none, p => -p.interest)
  const distributions = flow(none, p => -p.equityCash)
  const cff = sub(equityIn, debtIn, principal, interestPaid, distributions)
  const netChange = sub(cfo, cfi, cff), closingCash = cum(netChange)
  const openingCash = closingCash.map((c, k) => c - netChange[k])

  // Balance sheet at each FY end.
  const done = years.map(y => months.length > 0 && months[months.length - 1].day <= y) // build complete by this FY end
  const C = b.totalUses - b.support - b.supportGst - b.netGstCredit - b.reserve - b.workingCapital // = operations amortisation base
  const cwipCum = cum(flow(m => m.epc + m.otherUses + m.idc - m.gstPaid - m.reserve - m.workingCapital - m.supportReceived, none))
  const gstBuild = cum(flow(m => m.gstPaid - m.supportGst, none)), recovered = cum(flow(none, p => p.gstRecovery))
  const cwip = cwipCum.map((x, k) => (done[k] ? 0 : x))
  const projectAsset = cum(amortisation).map((a, k) => (done[k] ? C + a : 0))
  // From completion the GST balance is the engine's net credit still to recover; any Support GST above GST paid was
  // netted off the project asset (as in the amortisation base), so the two definitions meet at completion.
  const gst = years.map((_, k) => (done[k] ? b.netGstCredit - recovered[k] : gstBuild[k]))
  const reserve = cum(flow(m => m.reserve, p => p.reserveMovement)), workingCapital = cum(flow(m => m.workingCapital, p => -p.wcRelease))
  const cash = years.map(y => lastOf(months.filter(m => m.day <= y))?.cash ?? 0) // operations distribute every surplus
  const gstReceivable = gst.map(x => Math.max(0, x)), gstPayable = gst.map(x => Math.max(0, -x))
  const totalAssets = sub(cwip, projectAsset, gstReceivable, reserve, workingCapital, cash)
  const seniorDebt = years.map(y => {
    const p = lastOf(ops.filter(o => o.day <= y))
    return p ? p.debtClosing : lastOf(months.filter(m => m.day <= y))?.debtBalance ?? 0
  })
  const totalLiabilities = sub(gstPayable, seniorDebt)
  const equityCum = cum(equityIn), sc = i.capital.shareCapitalPct
  const shareCapital = equityCum.map(e => e * sc), promoterDebt = equityCum.map(e => e * (1 - sc))
  const retainedEarnings = cum(sub(pat, distributions))
  const totalEquity = sub(shareCapital, promoterDebt, retainedEarnings)
  const totalLiabilitiesEquity = sub(totalLiabilities, totalEquity)

  const L = (key: string, label: string, values: number[], style?: RowStyle): Row => ({ key, label, values, ...(style ? { style } : {}) })
  const H = (key: string, label: string): Row => ({ key, label, values: [], style: 'heading' })
  return {
    years,
    is: [
      L('completionPayments', 'Completion Payments', completion),
      L('interestIncome', 'Interest on Outstanding Balance', interestIncome),
      L('omIncome', 'O&M payments', om),
      L('revenue', 'Revenue', revenue, 'subtotal'),
      L('opex', 'Operating expenses', opex),
      L('ebitda', 'EBITDA', ebitda, 'subtotal'),
      L('amortisation', 'Amortisation of project asset', amortisation),
      L('ebit', 'EBIT', ebit, 'subtotal'),
      L('financeCost', 'Finance cost (senior debt interest)', financeCost),
      L('pbt', 'Profit before tax', pbt, 'subtotal'),
      L('tax', 'Tax (current)', tax),
      L('pat', 'Profit after tax', pat, 'total'),
    ],
    bs: [
      H('h-assets', 'Assets'),
      L('cwip', 'Capital work-in-progress', cwip),
      L('projectAsset', 'Project asset (net)', projectAsset),
      L('gstReceivable', 'GST credit receivable', gstReceivable),
      L('reserve', 'Debt Service Reserve (restricted)', reserve),
      L('workingCapital', 'Working capital buffer (restricted)', workingCapital),
      L('cash', 'Cash', cash),
      L('totalAssets', 'Total assets', totalAssets, 'total'),
      H('h-liabilities', 'Liabilities'),
      L('gstPayable', 'GST payable', gstPayable),
      L('seniorDebt', 'Senior debt', seniorDebt),
      L('totalLiabilities', 'Total liabilities', totalLiabilities, 'subtotal'),
      H('h-equity', 'Equity'),
      L('shareCapital', 'Share capital', shareCapital),
      L('promoterDebt', 'Promoter sub-debt', promoterDebt),
      L('retainedEarnings', 'Retained earnings', retainedEarnings),
      L('totalEquity', 'Total equity', totalEquity, 'subtotal'),
      L('totalLiabilitiesEquity', 'Total liabilities and equity', totalLiabilitiesEquity, 'total'),
      L('check', 'Check: assets − liabilities − equity', sub(totalAssets, totalLiabilitiesEquity.map(x => -x))),
    ],
    cf: [
      H('h-operating', 'Operating activities'),
      L('receipts', 'Receipts (Completion Payments, interest, O&M, GST recovery)', receipts),
      L('opexPaid', 'Operating expenses paid', opexPaid),
      L('taxPaid', 'Tax paid', taxPaid),
      L('cfo', 'Net cash from operating activities', cfo, 'subtotal'),
      H('h-investing', 'Investing activities'),
      L('construction', 'Construction costs paid (incl. GST and Interest During Build)', construction),
      L('supportIn', 'Construction Support received (incl. GST)', supportIn),
      L('toReserve', 'Transfers to Debt Service Reserve', toReserve),
      L('wcFunded', 'Working capital buffer funded', wcFunded),
      L('wcReleased', 'Working capital buffer released', wcReleased),
      L('cfi', 'Net cash from investing activities', cfi, 'subtotal'),
      H('h-financing', 'Financing activities'),
      L('equityIn', 'Equity drawn', equityIn),
      L('debtIn', 'Senior debt drawn', debtIn),
      L('principal', 'Principal repaid', principal),
      L('interestPaid', 'Interest paid', interestPaid),
      L('distributions', 'Distributions to equity', distributions),
      L('cff', 'Net cash from financing activities', cff, 'subtotal'),
      L('netChange', 'Net change in cash', netChange, 'total'),
      L('openingCash', 'Opening cash', openingCash),
      L('closingCash', 'Closing cash', closingCash, 'total'),
    ],
  }
}

/** Monthly construction schedule. Financial progress = cumulative EPC spend share (as the milestone checks). */
export function buildPhasing(r: ModelResult): PhasingRow[] {
  const { build: b, timeline: t, inputs: i } = r, months = b.months
  const epcTotal = sum(months.map(m => m.epc))
  // A milestone sits in the first month reaching its day (the Health milestone rule).
  const monthOf = (day: number) => { const k = months.findIndex(m => m.day >= t.start + day - 1); return k < 0 ? months.length - 1 : k }
  const flagged = i.milestones.map((ms, n) => ({ k: monthOf(ms.day), label: `M${n + 1}`, physical: ms.physical, financial: ms.financial }))
  let epcCum = 0
  return months.map((m, k) => {
    epcCum += m.epc
    const totalCost = m.epc + m.otherUses + m.idc
    return { day: m.day, days: m.days, epcFixed: m.epcFixed, epcVariable: m.epcVariable,
      otherUses: m.epc + m.otherUses - m.gstPaid - m.epcFixed - m.epcVariable, gst: m.gstPaid, idc: m.idc, totalCost, cumCost: m.cumCost,
      physical: m.cumPhysical - (k ? months[k - 1].cumPhysical : 0), cumPhysical: m.cumPhysical,
      cumFinancial: epcTotal ? epcCum / epcTotal : 0, support: m.supportReceived + m.supportGst, equity: m.equityDraw, debt: m.debtDraw,
      closingDebt: m.debtBalance, cash: m.cash,
      milestones: flagged.filter(f => f.k === k).map(({ label, physical, financial }) => ({ label, physical, financial })) }
  })
}
