// runModel: timeline → build → operations, then XIRR returns and coverage KPIs.
import { type BuildResult, runBuild, supportSchedule } from './build'
import { type Flow, xirr } from './finance'
import { type OpsPeriod, completionBase, opexForYear, runOperations } from './operations'
import { type Timeline, buildTimeline } from './timeline'
import type { Inputs } from './types'

const DAYS_IN_YEAR = 365 // day count for operate-loan interest (matches operations)
const PERIODS_PER_YEAR = 2 // half-yearly payments (matches operations)

export interface Kpis { projectIrrPre: number|null; projectIrrPost: number|null; equityIrr: number|null; dscrMin: number|null;
  dscrAvg: number|null; totalProjectCost: number; support: number; debt: number; equity: number; leverage: number;
  omMargin: number; completionCostBase: number }
export interface ModelResult { inputs: Inputs; timeline: Timeline; build: BuildResult; ops: OpsPeriod[]; kpis: Kpis }

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function runModel(i: Inputs): ModelResult {
  const t = buildTimeline(i)
  // Variable EPC does not depend on debt, so first-period insurance uses the exact EPC (fixed + variable).
  const epcNet = i.build.epcFixed + sum(supportSchedule(i, t).variable)
  const firstDays = t.payments[0] - t.completion // same day count operations uses for period 1
  const interest = (D: number) => D * i.capital.operateRate * firstDays / DAYS_IN_YEAR
  const build = runBuild(i, t, {
    debtService: D => (i.capital.repayment[0] ?? 0) * D + interest(D),
    interest,
    opex: opexForYear(i, 1, t.completion, epcNet).total / PERIODS_PER_YEAR,
  })
  const ops = runOperations(i, t, build)

  const buildOut = build.months.map(m => ({ day: m.day, amount: -(m.equityDraw + m.debtDraw) }))
  // Reserve and working capital are project assets funded in build, so their release is project cash.
  const post: Flow[] = [...buildOut, ...ops.map(p => ({ day: p.day, amount: p.cfads + p.wcRelease - p.reserveMovement }))]
  const pre: Flow[] = post.map((f, k) => (k < buildOut.length ? f : { ...f, amount: f.amount + ops[k - buildOut.length].tax }))
  const equity: Flow[] = [...build.months.map(m => ({ day: m.day, amount: -m.equityDraw })),
    ...ops.map(p => ({ day: p.day, amount: p.equityCash }))]

  const served = ops.filter(p => p.principal + p.interest > 0)
  const dscrs = served.map(p => p.dscr!)
  const service = sum(served.map(p => p.principal + p.interest))

  return { inputs: i, timeline: t, build, ops, kpis: {
    projectIrrPre: xirr(pre), projectIrrPost: xirr(post), equityIrr: xirr(equity),
    dscrMin: dscrs.length ? Math.min(...dscrs) : null,
    dscrAvg: service > 0 ? sum(served.map(p => p.cfads)) / service : null,
    totalProjectCost: build.totalUses, support: build.support, debt: build.debt, equity: build.equity,
    leverage: build.equity > 0 ? build.debt / build.equity : 0,
    omMargin: sum(ops.map(p => p.omPayment - p.opex)),
    completionCostBase: completionBase(i, t),
  } }
}
