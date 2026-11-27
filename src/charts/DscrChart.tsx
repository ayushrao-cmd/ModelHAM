import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import type { ModelResult } from '../engine/model'
import { fmt } from '../lib/format'
import { ChartFrame, ChartTooltip, useReducedMotion } from './ChartFrame'
import { dscrData } from './data'
import { BAD, MUTED, SERIES, SURFACE, axisProps, gridProps, yAxisProps } from './theme'

export function DscrChart({ result }: { result: ModelResult }) {
  const motionOff = useReducedMotion()
  const { rows, floor, warn } = dscrData(result)
  return (
    <ChartFrame title="Debt service coverage ratio (DSCR), by financial year" empty={!rows.length}>
      <LineChart data={rows} margin={{ right: 16 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="year" {...axisProps} minTickGap={8} />
        <YAxis {...yAxisProps} width={48} domain={[0, (max: number) => Math.max(2, Math.ceil(max * 2) / 2)]} tickFormatter={v => fmt.x(v)} />
        <Tooltip content={<ChartTooltip format={v => fmt.x(v)} />} />
        <ReferenceLine y={floor} stroke={BAD} label={{ value: `Floor ${fmt.x(floor)}`, position: 'insideTopLeft', fill: BAD, fontSize: 12 }} />
        <ReferenceLine y={warn} stroke={MUTED} strokeDasharray="4 4" label={{ value: `Warning ${fmt.x(warn)}`, position: 'insideBottomRight', fill: MUTED, fontSize: 12 }} />
        <Line type="linear" dataKey="dscr" name="DSCR" stroke={SERIES[0]} strokeWidth={2}
          dot={{ r: 4, fill: SERIES[0], stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={!motionOff} />
      </LineChart>
    </ChartFrame>
  )
}
