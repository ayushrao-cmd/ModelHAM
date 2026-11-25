import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import type { ModelResult } from '../engine/model'
import { fmt } from '../lib/format'
import { ChartFrame, useReducedMotion } from './ChartFrame'
import { waterfallData } from './data'
import { BAD, GOOD, GRID, INK, SERIES, axisProps, gridProps } from './theme'

// Horizontal bars: step names sit on the category axis, so long labels never collide at narrow widths.
export function EquityWaterfallChart({ result }: { result: ModelResult }) {
  const motionOff = useReducedMotion()
  const rows = waterfallData(result).map(s => ({ ...s, range: [Math.min(s.start, s.end), Math.max(s.start, s.end)] as [number, number] }))
  return (
    <ChartFrame title="Equity cash waterfall, ₹ Cr (invested to net returned)" empty={!result.ops.length}
      height={44 * rows.length + 48}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 64 }}>
        <CartesianGrid {...gridProps} horizontal={false} vertical />
        <XAxis type="number" {...axisProps} tickFormatter={v => fmt.num(v, 0)} />
        <YAxis type="category" dataKey="name" width={124} tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={false} />
        <ReferenceLine x={0} stroke={GRID} />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={({ active, payload }) => {
          const s = payload?.[0]?.payload as (typeof rows)[number] | undefined
          return active && s ? (
            <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
              <div className="font-medium">{s.name}</div>
              <div className="tabular-nums">{s.value < 0 ? 'Out' : 'In'} {fmt.cr(Math.abs(s.value))}</div>
              <div className="tabular-nums text-muted-foreground">Running total {fmt.cr(s.end)}</div>
            </div>) : null
        }} />
        <Bar dataKey="range" maxBarSize={24} radius={4} isAnimationActive={!motionOff}>
          {rows.map(s => <Cell key={s.name} fill={s.total ? SERIES[0] : s.value < 0 ? BAD : GOOD} />)}
          <LabelList dataKey="value" position="right" fill={INK} fontSize={12}
            formatter={(v: number) => `${v < 0 ? '−' : '+'}${fmt.num(Math.abs(v), 0)}`} />
        </Bar>
      </BarChart>
    </ChartFrame>
  )
}
