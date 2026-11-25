import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import type { ModelResult } from '../engine/model'
import { fmt } from '../lib/format'
import { ChartFrame, ChartTooltip, useReducedMotion } from './ChartFrame'
import { dscrData } from './data'
import { BAD, MUTED, SERIES, SURFACE, axisProps, gridProps, shortMonth, yAxisProps } from './theme'

export function DscrChart({ result }: { result: ModelResult }) {
  const motionOff = useReducedMotion()
  const { rows, floor, warn } = dscrData(result)
  return (
    <ChartFrame title="Debt service coverage ratio (DSCR)" empty={!rows.length}>
      <LineChart data={rows} margin={{ right: 16 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="period" {...axisProps} tickFormatter={shortMonth} minTickGap={24} />
        <YAxis {...yAxisProps} width={48} domain={[0, 'auto']} tickFormatter={v => fmt.x(v)} />
        <Tooltip content={<ChartTooltip format={v => fmt.x(v)} labelFormat={fmt.date} />} />
        <ReferenceLine y={floor} stroke={BAD} label={{ value: `Floor ${fmt.x(floor)}`, position: 'insideBottomRight', fill: BAD, fontSize: 12 }} />
        <ReferenceLine y={warn} stroke={MUTED} strokeDasharray="4 4" label={{ value: `Warning ${fmt.x(warn)}`, position: 'insideTopRight', fill: MUTED, fontSize: 12 }} />
        <Line type="monotone" dataKey="dscr" name="DSCR" stroke={SERIES[0]} strokeWidth={2}
          dot={{ r: 4, fill: SERIES[0], stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={!motionOff} />
      </LineChart>
    </ChartFrame>
  )
}
