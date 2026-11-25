import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts'
import type { ModelResult } from '../engine/model'
import { fmt } from '../lib/format'
import { ChartFrame, ChartTooltip, useReducedMotion } from './ChartFrame'
import { incomeData } from './data'
import { SERIES, SURFACE, axisProps, gridProps, legendStyle, shortMonth, yAxisProps } from './theme'

export function IncomeChart({ result }: { result: ModelResult }) {
  const motionOff = useReducedMotion()
  const rows = incomeData(result)
  const bar = (key: string, name: string, color: string) => (
    <Bar dataKey={key} name={name} stackId="a" fill={color} stroke={SURFACE} strokeWidth={1} isAnimationActive={!motionOff} />)
  return (
    <ChartFrame title="Income per payment period" empty={!rows.length}>
      <BarChart data={rows}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="period" {...axisProps} tickFormatter={shortMonth} minTickGap={24} />
        <YAxis {...yAxisProps} tickFormatter={v => fmt.num(v, 0)} />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip format={v => fmt.cr(v)} labelFormat={fmt.date} />} />
        <Legend wrapperStyle={legendStyle} />
        {bar('completion', 'Completion payment', SERIES[0])}
        {bar('interest', 'Interest on balance', SERIES[1])}
        {bar('om', 'O&M payment', SERIES[2])}
      </BarChart>
    </ChartFrame>
  )
}
