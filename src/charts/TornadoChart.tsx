import { Bar, BarChart, CartesianGrid, LabelList, Legend, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import type { TornadoBar } from '../engine/sensitivity'
import { fmt } from '../lib/format'
import { ChartFrame, ChartTooltip, useReducedMotion } from './ChartFrame'
import { INK, SERIES, axisProps, gridProps, legendStyle } from './theme'

/** Horizontal diverging bars around the base value; `format` formats the metric (default percent). */
export function TornadoChart({ bars, format = fmt.pct }: { bars: TornadoBar[]; format?: (n: number | null) => string }) {
  const motionOff = useReducedMotion()
  const valid = bars.filter(b => b.base != null && b.low != null && b.high != null)
  const base = valid[0]?.base ?? 0
  const rows = valid.map(b => ({ label: b.label, low: b.low! - base, high: b.high! - base, lowAbs: b.low!, highAbs: b.high! }))
  const abs = (v: number) => format(base + v)
  return (
    <ChartFrame title={`Sensitivity: result for ±10% on each driver (base ${format(base)})`} empty={!rows.length}
      height={Math.max(220, 56 * rows.length + 60)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 56 }} barGap={2}>
        <CartesianGrid {...gridProps} horizontal={false} vertical />
        <XAxis type="number" {...axisProps} tickFormatter={abs} />
        <YAxis type="category" dataKey="label" width={130} tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip format={abs} />} />
        <Legend wrapperStyle={legendStyle} />
        <ReferenceLine x={0} stroke={INK} strokeOpacity={0.6} />
        <Bar dataKey="low" name="Inputs −10%" fill={SERIES[0]} maxBarSize={14} radius={4} isAnimationActive={!motionOff}>
          <LabelList dataKey="lowAbs" position="right" fill={INK} fontSize={11} formatter={(v: number) => format(v)} />
        </Bar>
        <Bar dataKey="high" name="Inputs +10%" fill={SERIES[1]} maxBarSize={14} radius={4} isAnimationActive={!motionOff}>
          <LabelList dataKey="highAbs" position="right" fill={INK} fontSize={11} formatter={(v: number) => format(v)} />
        </Bar>
      </BarChart>
    </ChartFrame>
  )
}
