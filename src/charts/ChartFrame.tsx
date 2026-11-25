import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import { ResponsiveContainer } from 'recharts'
import { CHART_HEIGHT } from './theme'

const QUERY = '(prefers-reduced-motion: reduce)'
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia?.(QUERY)
  mq?.addEventListener?.('change', cb)
  return () => mq?.removeEventListener?.('change', cb)
}
/** True when the user asked for less motion; charts then skip their draw-in animation. */
export const useReducedMotion = () =>
  useSyncExternalStore(subscribe, () => window.matchMedia?.(QUERY).matches ?? false, () => false)

/** Titled, labelled chart surface with a muted "No data" panel when there is nothing to plot. */
export function ChartFrame({ title, empty, children, height = CHART_HEIGHT }:
  { title: string; empty: boolean; children: ReactNode; height?: number }) {
  return (
    <figure aria-label={title} className="m-0 w-full">
      <figcaption className="mb-2 text-sm font-medium text-foreground">{title}</figcaption>
      {empty
        ? <div role="status" className="flex items-center justify-center rounded-md bg-muted text-sm text-muted-foreground" style={{ height }}>No data</div>
        : <ResponsiveContainer width="100%" height={height}>{children as React.ReactElement}</ResponsiveContainer>}
    </figure>
  )
}

interface Item { name?: string | number; value?: number | string | (number | string)[]; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }
/** Tooltip card: swatch + name + tabular value per series. */
export function ChartTooltip({ active, payload, label, format, labelFormat, hide }:
  { active?: boolean; payload?: Item[]; label?: string | number; format: (v: number, key: string) => string;
    labelFormat?: (l: string) => string; hide?: string[] }) {
  const items = (payload ?? []).filter(p => typeof p.value === 'number' && !hide?.includes(String(p.dataKey)))
  if (!active || !items.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {label != null && <div className="mb-1 font-medium">{labelFormat ? labelFormat(String(label)) : label}</div>}
      {items.map(p => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-4 tabular-nums">{format(p.value as number, String(p.dataKey))}</span>
        </div>
      ))}
    </div>
  )
}
