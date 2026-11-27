// Pure chart and table data mappers: ModelResult in, plain rows out. Components only render these.
import { toIso, type Day } from '../engine/dates'
import { DSCR_FLOOR } from '../engine/health'
import type { ModelResult } from '../engine/model'
import { epcPhasing, type UseKey } from '../engine/v16/construction'
import { fmt } from '../lib/format'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const MAX_USE_SEGMENTS = 6 // beyond this, small use lines fold into "Other"

export interface Seg { key: string; label: string; value: number }

const USE_LABEL: Record<Exclude<UseKey, 'maInterestFromEpc'>, string> = {
  epcFixed: 'EPC fixed price', epcVariable: 'EPC variable (price index)', imvCapital: 'Patrol vehicles (capital)',
  preBid: 'Pre-bid expenses', spvFormation: 'SPV formation', ieFee: 'Independent Engineer fee', spvManpower: 'SPV manpower',
  admin: 'SPV admin', fundRaising: 'Fund-raising fee', financeLegal: 'Finance & legal (from build days)',
  imvRental: 'Patrol vehicles (rental, from build days)', contingency: 'Contingency',
  psbgCommission: 'Performance Security commission', stlInterest: 'Short-term loan interest, net of EPC recovery',
  netGstPayable: 'Net GST payable',
}

/** One project-cost line: gross (incl. GST) and its GST input credit, ₹ Cr over the build and COD → 1st annuity. */
export interface CostLine { key: string; label: string; gross: number; gst: number }

/** The project cost (the original's total project cost) by line; Σ gross = kpis.totalProjectCost. */
export function costLines(r: ModelResult): CostLine[] {
  const { lines } = r.construction.uses, m = r.construction.months
  const line = (k: UseKey) => ({ gross: sum(lines[k].gross), gst: sum(lines[k].gst) })
  // The STL interest is recovered from the EPC contractor (back to back), so the two lines net to its cost.
  const stl = line('stlInterest'), ma = line('maInterestFromEpc')
  const rows: CostLine[] = (Object.keys(USE_LABEL) as (keyof typeof USE_LABEL)[]).map(key => ({ key, label: USE_LABEL[key],
    ...(key === 'stlInterest' ? { gross: stl.gross + ma.gross, gst: stl.gst + ma.gst } : line(key)) }))
  const period = (key: string, label: string, f: (x: (typeof m)[number]) => number) => ({ key, label, gross: sum(m.map(f)), gst: 0 })
  return [...rows,
    period('idc', 'Interest during construction', x => x.idc),
    period('postCodInterest', 'Interest, COD to first annuity', x => x.postCodInterest),
    period('opex', 'O&M, COD to first annuity', x => x.opex),
    period('dsr', 'Debt Service Reserve funded at COD', x => x.dsrPrincipal + x.dsrInterest),
  ]
}

export function sourcesUsesData(r: ModelResult) {
  const m = r.construction.months, c = r.construction
  const sources: Seg[] = [
    { key: 'support', label: 'Construction Support', value: sum(m.map(x => x.grant)) },
    { key: 'supportGst', label: 'Support GST', value: sum(m.map(x => x.grantGst)) },
    { key: 'equity', label: 'Equity', value: c.equity },
    { key: 'debt', label: 'Senior Debt', value: c.debt },
  ]
  const lines = costLines(r).map(u => ({ key: u.key, label: u.label, value: u.gross })).filter(u => u.value > 0)
    .sort((a, b) => b.value - a.value)
  const uses = lines.length <= MAX_USE_SEGMENTS ? lines
    : [...lines.slice(0, MAX_USE_SEGMENTS - 1),
      { key: 'other', label: 'Other', value: sum(lines.slice(MAX_USE_SEGMENTS - 1).map(u => u.value)) }]
  return { sources, uses, totalSources: sum(sources.map(s => s.value)), totalUses: sum(uses.map(u => u.value)) }
}

/** Index into `r.grid.periods` of the construction month containing a milestone day (as the Health check). */
function monthOf(r: ModelResult, day: number) {
  const ps = r.grid.periods, found = ps.findIndex(p => p.kind === 'construction' && p.end >= r.grid.appointed + day - 1)
  return found >= 0 ? found : ps.reduce((last, p, k) => (p.kind === 'construction' ? k : last), -1)
}

/** One month of the construction schedule (COD → 1st annuity months included). Amounts gross of GST, ₹ Cr. */
export interface PhasingRow {
  day: Day; days: number; kind: 'construction' | 'postCod'
  epcFixed: number; epcVariable: number; otherUses: number; gst: number; interest: number; totalCost: number; cumCost: number
  physical: number; cumPhysical: number; cumFinancial: number
  support: number; equity: number; debt: number; closingDebt: number
  milestones: { label: string; physical: number; financial: number }[]
}

export function phasingRows(r: ModelResult): PhasingRow[] {
  const { grid: g, construction: c, inputs: i } = r
  const phys = epcPhasing(i, g), m = c.months, lines = Object.values(c.uses.lines)
  const epcTotal = sum(m.map(x => x.epcFixed + x.epcVariable))
  const marks = i.milestones.map((ms, n) => ({ at: monthOf(r, ms.day), label: `M${n + 1}`, physical: ms.physical, financial: ms.financial }))
  let cost = 0, p = 0, f = 0
  return g.periods.map((period, k) => {
    const x = m[k], interest = x.idc + x.postCodInterest
    cost += x.tpc; p += phys[k]; f += x.epcFixed + x.epcVariable
    return { day: period.end, days: period.days, kind: period.kind, epcFixed: x.epcFixed, epcVariable: x.epcVariable,
      otherUses: x.tpc - x.epcFixed - x.epcVariable - interest, gst: sum(lines.map(l => l.gst[k])), interest,
      totalCost: x.tpc, cumCost: cost, physical: phys[k], cumPhysical: p, cumFinancial: epcTotal > 0 ? f / epcTotal : 0,
      support: x.grant + x.grantGst, equity: x.equityUpfront + x.equityDeferred, debt: x.debtDraw, closingDebt: x.debtBalance,
      milestones: marks.filter(ms => ms.at === k).map(({ label, physical, financial }) => ({ label, physical, financial })) }
  })
}

export function drawdownData(r: ModelResult) {
  const rows = phasingRows(r)
  return {
    rows: rows.map(x => ({ month: toIso(x.day), support: x.support, equity: x.equity, debt: x.debt })),
    markers: rows.flatMap(x => x.milestones.map(ms => ({ month: toIso(x.day), label: ms.label }))),
  }
}

/** Cumulative physical and financial progress per build month; required progress sits only on milestone months. */
export function sCurveData(phasing: PhasingRow[]) {
  const rows = phasing.filter(x => x.kind === 'construction')
  const req = (x: PhasingRow, k: 'physical' | 'financial') => (x.milestones.length ? Math.max(...x.milestones.map(m => m[k])) : undefined)
  return {
    rows: rows.map(x => ({ month: toIso(x.day), physical: x.cumPhysical, financial: x.cumFinancial,
      reqPhysical: req(x, 'physical'), reqFinancial: req(x, 'financial') })),
    markers: rows.flatMap(x => x.milestones.map(m => ({ month: toIso(x.day), label: m.label }))),
  }
}

/** Income per annuity date (half-yearly). */
export const incomeData = (r: ModelResult) => r.revenue.dates.map((d, k) => ({ period: toIso(d),
  completion: r.revenue.instalment[k], interest: r.revenue.interest[k], om: r.revenue.om[k], bonus: r.revenue.bonus[k] }))

/** Annual DSCR, the original's repayment financial years (FY of the 1st annuity to FY of the last repayment). */
export function dscrData(r: ModelResult) {
  const rows = r.cash.dscr.flatMap((v, k) => (v == null ? [] : [{ year: fmt.fy(r.grid.fys[k]), dscr: v }]))
  return { rows, floor: DSCR_FLOOR, warn: r.inputs.capital.dscrWarn }
}

/** Closing balances per FY: senior debt and the three funds (DSR, maintenance reserve, funds for expenses). */
export const debtData = (r: ModelResult) => r.grid.fys.map((y, k) => ({ year: fmt.fy(y), debt: r.debt.closing[k],
  dsr: r.funds.dsrInterest.closing[k] + r.funds.dsrPrincipal.closing[k], mmr: r.funds.mmr.closing[k], ffe: r.funds.ffe.closing[k] }))

export interface WaterfallStep { name: string; value: number; start: number; end: number; total?: boolean }

/** The original's annual equity flows: equity in, cash available before tax, then tax, debt service and DSR to equity. */
export function waterfallData(r: ModelResult): WaterfallStep[] {
  const a = r.cash.annual
  const deltas: [string, number][] = [
    ['Equity invested', sum(a.equityOutflow)],
    ['Cash before tax', sum(a.cfadsPre)],
    ['Tax', -sum(a.tax)],
    ['Debt service', -sum(a.repayment) - sum(a.interest)],
    ['Debt Service Reserve', sum(a.dsrMovement)],
  ]
  let run = 0
  const steps = deltas.map(([name, value]) => ({ name, value, start: run, end: (run += value) }))
  const final = sum(a.equityPost) // the chain above closes to this within rounding
  return [...steps, { name: 'Net to equity', value: final, start: 0, end: final, total: true }]
}
