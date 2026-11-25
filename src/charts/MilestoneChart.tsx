import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts'
import type { ModelResult } from '../engine/model'
import { fmt } from '../lib/format'
import { ChartFrame, ChartTooltip, useReducedMotion } from './ChartFrame'
import { milestoneData } from './data'
import { SERIES, axisProps, gridProps, legendStyle, yAxisProps } from './theme'

const SERIES_DEFS = [
  ['reqPhysical', 'Required physical', SERIES[0]], ['projPhysical', 'Projected physical', SERIES[2]],
  ['reqFinancial', 'Required financial', SERIES[1]], ['projFinancial', 'Projected financial', SERIES[3]],
] as const

export function MilestoneChart({ result }: { result: ModelResult }) {
  const motionOff = useReducedMotion()
  const rows = milestoneData(result)
  return (
    <ChartFrame title="Milestone progress: required vs projected" empty={!rows.length}>
      <BarChart data={rows} barCategoryGap="24%">
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="name" {...axisProps} />
        <YAxis {...yAxisProps} width={48} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={v => fmt.pct(v, 0)} />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip format={v => fmt.pct(v)} />} />
        <Legend wrapperStyle={legendStyle} />
        {SERIES_DEFS.map(([key, name, color]) => (
          <Bar key={key} dataKey={key} name={name} fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={!motionOff} />
        ))}
      </BarChart>
    </ChartFrame>
  )
}
