import { ArrowRight, CircleCheck } from 'lucide-react'
import { DscrChart } from '../charts/DscrChart'
import { SourcesUsesChart } from '../charts/SourcesUsesChart'
import { CheckIcon, RANK, status } from '../app/CommandPalette'
import { hrefFor } from '../app/router'
import { sectionMeta } from '../app/sections'
import { KpiTile } from '../components/KpiTile'
import { SolveCard } from '../components/SolveCard'
import type { ModelResult } from '../engine/model'
import { fmt } from '../lib/format'
import { useStore } from '../state/store'
import { ResultsGate } from '../components/ResultsGate'
import { useModel, useResult } from '../state/useModel'
import { jumpTo } from './Health'
import { Panel, SectionHeader } from './SectionLayout'

const signed = (d: number, s: string) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${s}`
const pp = (d: number) => signed(d, `${fmt.num(Math.abs(d) * 100)} pp`)
const times = (d: number) => signed(d, fmt.x(Math.abs(d)))
const crore = (d: number) => signed(d, fmt.cr(Math.abs(d)))

const dscrs = (r: ModelResult) => r.ops.flatMap(p => (p.dscr == null ? [] : [p.dscr]))

/** The headline metrics, shared by Overview tiles and the Scenarios comparison. */
export const KPIS: { key: string; label: string; get(r: ModelResult): number | null; format(n: number | null): string;
  formatDelta(d: number): string; good: 'up' | 'down'; trend(r: ModelResult): number[]; trendLabel: string }[] = [
  { key: 'equityIrr', label: 'Equity IRR', get: r => r.kpis.equityIrr, format: n => fmt.pct(n), formatDelta: pp, good: 'up',
    trend: r => r.ops.map(p => p.equityCash), trendLabel: 'equity cash per period' },
  { key: 'projectIrrPre', label: 'Project IRR, pre-tax', get: r => r.kpis.projectIrrPre, format: n => fmt.pct(n), formatDelta: pp, good: 'up',
    trend: r => r.ops.map(p => p.cfads), trendLabel: 'cash flow available for debt service per period' },
  { key: 'projectIrrPost', label: 'Project IRR, post-tax', get: r => r.kpis.projectIrrPost, format: n => fmt.pct(n), formatDelta: pp, good: 'up',
    trend: r => r.ops.map(p => p.cfads), trendLabel: 'cash flow available for debt service per period' },
  { key: 'dscrMin', label: 'Min DSCR', get: r => r.kpis.dscrMin, format: fmt.x, formatDelta: times, good: 'up',
    trend: dscrs, trendLabel: 'DSCR per period' },
  { key: 'dscrAvg', label: 'Avg DSCR', get: r => r.kpis.dscrAvg, format: fmt.x, formatDelta: times, good: 'up',
    trend: dscrs, trendLabel: 'DSCR per period' },
  { key: 'totalProjectCost', label: 'Total project cost', get: r => r.kpis.totalProjectCost, format: fmt.cr, formatDelta: crore, good: 'down',
    trend: r => r.build.months.map(m => m.cumCost), trendLabel: 'cumulative build cost by month' },
]

/** Active minus base; undefined when either has no value (e.g. no IRR). */
export const kpiDelta = (a: number | null, b: number | null) => (a == null || b == null ? undefined : a - b)

const TOP_ISSUES = 5

function TopIssues() {
  const { checks, score } = useModel()
  const failing = checks.filter(c => !c.pass).sort((a, b) => RANK[a.severity] - RANK[b.severity])
  return (
    <Panel className="flex flex-col p-0">
      <div className="flex items-baseline justify-between gap-3 px-5 pb-2 pt-4">
        <h2 className="text-[15px] font-semibold leading-6">Top issues</h2>
        <a href={hrefFor('health')} className="text-[13px] font-medium text-primary hover:underline">
          {score.passed}/{score.total} checks pass<span className="sr-only">, open Health</span>
        </a>
      </div>
      {failing.length ? (
        <ul className="divide-y border-t">
          {failing.slice(0, TOP_ISSUES).map(c => (
            <li key={c.id}>
              <button type="button" onClick={() => jumpTo(c)}
                className="group flex w-full items-start gap-3 px-5 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="mt-0.5 shrink-0 [&>svg]:size-4"><CheckIcon c={c} /></span>
                <span className="min-w-0 flex-1">
                  <span className="sr-only">{status(c)}: </span>
                  <span className="block text-sm font-medium leading-5">{c.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[13px] leading-5 text-muted-foreground">{c.message}</span>
                </span>
                <span className="mt-0.5 hidden shrink-0 text-xs text-muted-foreground group-hover:text-foreground sm:inline">{sectionMeta(c.section).label}</span>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 border-t px-5 py-6 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-success" aria-hidden="true" />Every check passes.
        </p>
      )}
      {failing.length > TOP_ISSUES && (
        <a href={hrefFor('health')} className="mt-auto border-t px-5 py-2.5 text-[13px] font-medium text-primary hover:underline">
          {failing.length - TOP_ISSUES} more in Health
        </a>
      )}
    </Panel>
  )
}

function OverviewResults() {
  const r = useResult()
  const { base } = useModel()
  const isBase = useStore(s => s.activeId === s.baseId)
  return <>
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border shadow-card lg:grid-cols-3">
      {KPIS.map(k => (
        <KpiTile key={k.key} label={k.label} value={k.get(r)} format={k.format} good={k.good}
          delta={isBase || !base ? undefined : kpiDelta(k.get(r), k.get(base))} formatDelta={k.formatDelta}
          trend={k.trend(r)} trendLabel={k.trendLabel} />
      ))}
    </div>
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-5"><SolveCard result={r} /></div>
      <div className="min-w-0 lg:col-span-7"><TopIssues /></div>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel><SourcesUsesChart result={r} /></Panel>
      <Panel><DscrChart result={r} /></Panel>
    </div>
  </>
}

export function Overview() {
  return (
    <div className="space-y-6">
      <SectionHeader id="overview" />
      <ResultsGate><OverviewResults /></ResultsGate>
    </div>
  )
}
