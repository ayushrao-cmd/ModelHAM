import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import type { ModelResult } from '../engine/model'
import { fmt } from '../lib/format'
import { ChartFrame, ChartTooltip, useReducedMotion } from './ChartFrame'
import { drawdownData } from './data'
import { INK, SERIES, SURFACE, axisProps, gridProps, legendStyle, shortMonth, yAxisProps } from './theme'

export function DrawdownChart({ result }: { result: ModelResult }) {
  const motionOff = useReducedMotion()
  const { rows, markers } = drawdownData(result)
  const bar = (key: string, name: string, color: string) => (
    <Bar dataKey={key} name={name} stackId="a" fill={color} stroke={SURFACE} strokeWidth={1} isAnimationActive={!motionOff} />)
  return (
    <ChartFrame title="Monthly funding drawdown" empty={!rows.length}>
      <BarChart data={rows} margin={{ top: 20, right: 8 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="month" {...axisProps} tickFormatter={shortMonth} minTickGap={24} />
        <YAxis {...yAxisProps} tickFormatter={v => fmt.num(v, 0)} />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip format={v => fmt.cr(v)} labelFormat={fmt.date} />} />
        <Legend wrapperStyle={legendStyle} />
        {bar('support', 'Construction Support (+GST)', SERIES[0])}
        {bar('equity', 'Equity', SERIES[6])}
        {bar('debt', 'Senior Debt', SERIES[1])}
        {markers.map(m => (
          <ReferenceLine key={m.label} x={m.month} stroke={INK} strokeOpacity={0.5} strokeDasharray="3 3"
            label={{ value: m.label, position: 'top', fill: INK, fontSize: 12 }} />
        ))}
      </BarChart>
    </ChartFrame>
  )
}
