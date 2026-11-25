// Pure chart data mappers: ModelResult in, plain rows out. Components only render these.
import { toIso } from '../engine/dates'
import { DSCR_FLOOR } from '../engine/health'
import type { ModelResult } from '../engine/model'
import type { PhasingRow, Row, Statements } from '../engine/statements'
import { fmt } from '../lib/format'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const MAX_USE_SEGMENTS = 6 // beyond this, small use lines fold into "Other"

export interface Seg { key: string; label: string; value: number }

export function sourcesUsesData(r: ModelResult) {
  const b = r.build
  const sources: Seg[] = [
    { key: 'support', label: 'Construction Support', value: b.support },
    { key: 'supportGst', label: 'Support GST', value: b.supportGst },
    { key: 'equity', label: 'Equity', value: b.equity },
    { key: 'debt', label: 'Senior Debt', value: b.debt },
  ]
  const lines = b.uses.map(u => ({ key: u.key, label: u.label, value: u.net + u.gst })).filter(u => u.value > 0)
    .sort((a, c) => c.value - a.value)
  const uses = lines.length <= MAX_USE_SEGMENTS ? lines
    : [...lines.slice(0, MAX_USE_SEGMENTS - 1),
      { key: 'other', label: 'Other', value: sum(lines.slice(MAX_USE_SEGMENTS - 1).map(u => u.value)) }]
  return { sources, uses, totalSources: sum(sources.map(s => s.value)), totalUses: sum(uses.map(u => u.value)) }
}

/** Index of the build month containing a milestone day (same rule as the Health check). */
function monthOf(r: ModelResult, day: number) {
  const found = r.build.months.findIndex(m => m.day >= r.timeline.start + day - 1)
  return found < 0 ? r.build.months.length - 1 : found
}

export function drawdownData(r: ModelResult) {
  const rows = r.build.months.map(m => ({ month: toIso(m.day), support: m.supportReceived + m.supportGst,
    equity: m.equityDraw, debt: m.debtDraw }))
  // No build months (Health's build-period check fails): no markers to place.
  const markers = rows.length ? r.inputs.milestones.map((ms, n) => ({ month: rows[monthOf(r, ms.day)].month, label: `M${n + 1}` })) : []
  return { rows, markers }
}

/** Cumulative physical and financial progress per build month; required progress sits only on milestone months. */
export function sCurveData(rows: PhasingRow[]) {
  const req = (x: PhasingRow, k: 'physical' | 'financial') => (x.milestones.length ? Math.max(...x.milestones.map(m => m[k])) : undefined)
  return {
    rows: rows.map(x => ({ month: toIso(x.day), physical: x.cumPhysical, financial: x.cumFinancial,
      reqPhysical: req(x, 'physical'), reqFinancial: req(x, 'financial') })),
    markers: rows.flatMap(x => x.milestones.map(m => ({ month: toIso(x.day), label: m.label }))),
  }
}

/** One row per FY with the named statement lines, for charts. */
export const fyData = (s: Statements, rows: Row[], keys: string[]): Record<string, string | number>[] =>
  s.years.map((y, k) => ({ year: fmt.fy(y), ...Object.fromEntries(keys.map(key => [key, rows.find(x => x.key === key)!.values[k]])) }))

export const incomeData = (r: ModelResult) => r.ops.map(p => ({ period: toIso(p.day),
  completion: p.completionPayment, interest: p.interestIncome, om: p.omPayment }))

export function dscrData(r: ModelResult) {
  const rows = r.ops.filter(p => p.dscr != null).map(p => ({ period: toIso(p.day), dscr: p.dscr as number }))
  return { rows, floor: DSCR_FLOOR, warn: r.inputs.capital.dscrWarn }
}

export const debtData = (r: ModelResult) => r.ops.map(p => ({ period: toIso(p.day), debt: p.debtClosing, reserve: p.reserveBalance }))

export interface WaterfallStep { name: string; value: number; start: number; end: number; total?: boolean }

export function waterfallData(r: ModelResult): WaterfallStep[] {
  const q = (f: (p: (typeof r.ops)[number]) => number) => sum(r.ops.map(f))
  const deltas: [string, number][] = [
    ['Equity invested', -r.build.equity],
    ['Income', q(p => p.completionPayment + p.interestIncome + p.omPayment + p.gstRecovery)],
    ['Operating costs', -q(p => p.opex)],
    ['Tax', -q(p => p.tax)],
    ['Debt service', -q(p => p.principal + p.interest)],
    ['Reserve & working capital', q(p => p.wcRelease - p.reserveMovement)],
  ]
  let run = 0
  const steps = deltas.map(([name, value]) => ({ name, value, start: run, end: (run += value) }))
  const final = q(p => p.equityCash) - r.build.equity // the chain above closes to this within rounding
  return [...steps, { name: 'Net to equity', value: final, start: 0, end: final, total: true }]
}
