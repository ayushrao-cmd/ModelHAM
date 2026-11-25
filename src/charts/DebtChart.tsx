import { Area, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis } from 'recharts'
import type { ModelResult } from '../engine/model'
import { fmt } from '../lib/format'
import { ChartFrame, ChartTooltip, useReducedMotion } from './ChartFrame'
import { debtData } from './data'
import { SERIES, axisProps, gridProps, legendStyle, shortMonth, yAxisProps } from './theme'

export function DebtChart({ result }: { result: ModelResult }) {
  const motionOff = useReducedMotion()
  const rows = debtData(result)
  return (
    <ChartFrame title="Senior debt outstanding and reserve balance" empty={!rows.length}>
      <ComposedChart data={rows}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="period" {...axisProps} tickFormatter={shortMonth} minTickGap={24} />
        <YAxis {...yAxisProps} tickFormatter={v => fmt.num(v, 0)} />
        <Tooltip content={<ChartTooltip format={v => fmt.cr(v)} labelFormat={fmt.date} />} />
        <Legend wrapperStyle={legendStyle} />
        <Area type="monotone" dataKey="debt" name="Debt outstanding" stroke={SERIES[0]} strokeWidth={2}
          fill={SERIES[0]} fillOpacity={0.12} isAnimationActive={!motionOff} />
        <Line type="monotone" dataKey="reserve" name="Reserve balance" stroke={SERIES[1]} strokeWidth={2}
          dot={false} isAnimationActive={!motionOff} />
      </ComposedChart>
    </ChartFrame>
  )
}
