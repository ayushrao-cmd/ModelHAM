import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt } from '../lib/format'
import { ChartFrame, ChartTooltip, useReducedMotion } from './ChartFrame'
import { GRID, SURFACE, axisProps, gridProps, legendStyle, yAxisProps } from './theme'

export interface Series { key: string; name: string; color: string }
const HEIGHT = 260

/** Annual bars per FY, grouped or stacked, with a zero line for negative values. Series that are zero throughout are dropped. */
export function StatementChart({ title, data, series, stacked }: {
  title: string; data: Record<string, string | number>[]; series: Series[]; stacked?: boolean
}) {
  const motionOff = useReducedMotion()
  const shown = series.filter(s => data.some(d => Math.abs(Number(d[s.key])) >= 0.005))
  return (
    <ChartFrame title={title} empty={!data.length || !shown.length} height={HEIGHT}>
      <BarChart data={data} barGap={2} stackOffset={stacked ? 'sign' : undefined}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="year" {...axisProps} minTickGap={8} />
        <YAxis {...yAxisProps} tickFormatter={v => fmt.num(v, 0)} />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip format={v => fmt.cr(v)} />} />
        <Legend wrapperStyle={legendStyle} />
        <ReferenceLine y={0} stroke={GRID} />
        {shown.map(s => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? 'a' : undefined} maxBarSize={stacked ? 28 : 14}
            stroke={stacked ? SURFACE : undefined} strokeWidth={stacked ? 1 : 0} radius={stacked || data.some(d => Number(d[s.key]) < 0) ? 0 : [3, 3, 0, 0]} isAnimationActive={!motionOff} />
        ))}
      </BarChart>
    </ChartFrame>
  )
}
