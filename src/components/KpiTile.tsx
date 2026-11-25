import { useEffect, useId, useRef, useState } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '../charts/ChartFrame'
import { SERIES } from '../charts/theme'

const TWEEN_MS = 300
const SAME = 1e-9 // below this a delta reads as "no change"

/** Eases the shown number to `target` over 300 ms; jumps straight there under reduced motion, on mount, or to/from null. */
export function useTween(target: number | null, ms = TWEEN_MS) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const a = from.current
    if (reduce || a == null || target == null || a === target) { from.current = target; setShown(target); return }
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms), v = a + (target - a) * (1 - (1 - k) ** 3) // ease-out cubic
      from.current = k < 1 ? v : target
      setShown(from.current)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, reduce, ms])
  return shown
}

/** A trend glyph, not a chart: no axes or hover. Scales to its own min..max, with a zero line when the series crosses it. */
function Sparkline({ values }: { values: number[] }) {
  const xs = values.filter(Number.isFinite)
  if (xs.length < 2) return <div className="h-7" />
  const lo = Math.min(...xs), hi = Math.max(...xs), span = hi - lo || 1
  const y = (v: number) => (28 - 2 - ((v - lo) / span) * 24).toFixed(2)
  const pts = xs.map((v, k) => `${((k / (xs.length - 1)) * 100).toFixed(2)},${y(v)}`).join(' ')
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-full overflow-visible" aria-hidden="true">
      {lo < 0 && hi > 0 && <line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="hsl(var(--border))" vectorEffect="non-scaling-stroke" />}
      <polyline points={pts} fill="none" stroke={SERIES[0]} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export interface KpiTileProps {
  label: string
  value: number | null
  format(n: number | null): string
  /** Active minus base; omit (undefined) while the base itself is active. */
  delta?: number | null
  formatDelta?(d: number): string
  /** Which way is good: IRRs and coverage up, cost down. */
  good?: 'up' | 'down'
  trend: number[]
  trendLabel: string
}

export function KpiTile({ label, value, format, delta, formatDelta = String, good = 'up', trend, trendLabel }: KpiTileProps) {
  const id = useId()
  const shown = useTween(value)
  const hasDelta = delta != null && Number.isFinite(delta)
  const flat = hasDelta && Math.abs(delta) < SAME
  const better = hasDelta && !flat && (delta > 0) === (good === 'up')
  const Arrow = hasDelta && delta > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <div role="group" aria-labelledby={id} className="flex min-w-0 flex-col bg-card px-4 pb-3 pt-4 sm:px-5">
      <span id={id} className="text-[13px] text-muted-foreground">{label}</span>
      {/* The final value is what a screen reader gets; the tween is visual only. */}
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden="true" className="mt-1 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{format(shown)}</span>
      <span className="mt-0.5 min-h-4 text-xs leading-4">
        {hasDelta && (flat
          ? <span className="text-muted-foreground">Same as base</span>
          : <span className={cn('inline-flex items-center gap-0.5 font-medium tabular-nums', better ? 'text-success' : 'text-destructive')}>
              <Arrow className="size-3.5 shrink-0" aria-hidden="true" />
              {formatDelta(delta)}<span className="font-normal text-muted-foreground">&nbsp;vs base</span>
              <span className="sr-only">, {better ? 'better' : 'worse'}</span>
            </span>)}
      </span>
      <div className="mt-2" title={trendLabel}><Sparkline values={trend} /></div>
      <span className="sr-only">Trend: {trendLabel}.</span>
    </div>
  )
}
