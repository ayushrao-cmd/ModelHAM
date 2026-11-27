import { Area, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis } from 'recharts'
import type { ModelResult } from '../engine/model'
import { fmt } from '../lib/format'
import { ChartFrame, ChartTooltip, useReducedMotion } from './ChartFrame'
import { debtData } from './data'
import { SERIES, axisProps, gridProps, legendStyle, yAxisProps } from './theme'

export function DebtChart({ result }: { result: ModelResult }) {
  const motionOff = useReducedMotion()
  const rows = debtData(result)
  return (
    <ChartFrame title="Senior debt and fund balances at each financial year end" empty={!rows.length}>
      <ComposedChart data={rows}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="year" {...axisProps} minTickGap={8} />
        <YAxis {...yAxisProps} tickFormatter={v => fmt.num(v, 0)} />
        <Tooltip content={<ChartTooltip format={v => fmt.cr(v)} />} />
        <Legend wrapperStyle={legendStyle} />
        <Area type="monotone" dataKey="debt" name="Debt outstanding" stroke={SERIES[0]} strokeWidth={2}
          fill={SERIES[0]} fillOpacity={0.12} isAnimationActive={!motionOff} />
        {([['dsr', 'Debt Service Reserve', SERIES[1]], ['mmr', 'Maintenance reserve', SERIES[2]], ['ffe', 'Funds for expenses', SERIES[3]]] as const).map(([key, name, color]) => (
          <Line key={key} type="monotone" dataKey={key} name={name} stroke={color} strokeWidth={2} dot={false} isAnimationActive={!motionOff} />
        ))}
      </ComposedChart>
    </ChartFrame>
  )
}
