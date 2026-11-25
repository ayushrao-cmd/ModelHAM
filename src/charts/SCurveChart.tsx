import { CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import type { PhasingRow } from '../engine/statements'
import { fmt } from '../lib/format'
import { ChartFrame, ChartTooltip, useReducedMotion } from './ChartFrame'
import { sCurveData } from './data'
import { INK, SERIES, SURFACE, axisProps, gridProps, legendStyle, shortMonth, yAxisProps } from './theme'

/** Cumulative progress lines; the milestone requirement for each is a hollow marker in the same hue. */
export function SCurveChart({ rows: phasing }: { rows: PhasingRow[] }) {
  const motionOff = useReducedMotion()
  const { rows, markers } = sCurveData(phasing)
  // Physical requirement: hollow ring; financial: solid dot. Equal requirements nest instead of hiding each other.
  const req = (key: string, name: string, color: string, r: number, hollow: boolean) => {
    const dot = { r, fill: hollow ? SURFACE : color, stroke: hollow ? color : SURFACE, strokeWidth: 2 }
    return <Line dataKey={key} name={name} stroke={color} strokeWidth={0} legendType="circle" isAnimationActive={false} dot={dot} activeDot={{ ...dot, r: r + 1 }} />
  }
  return (
    <ChartFrame title="Cumulative progress against the build milestones" empty={!rows.length}>
      <ComposedChart data={rows} margin={{ top: 20, right: 8 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="month" {...axisProps} tickFormatter={shortMonth} minTickGap={24} />
        <YAxis {...yAxisProps} width={48} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={v => fmt.pct(v, 0)} />
        <Tooltip content={<ChartTooltip format={v => fmt.pct(v)} labelFormat={fmt.date} />} />
        <Legend wrapperStyle={legendStyle} />
        {markers.map(m => (
          <ReferenceLine key={m.label} x={m.month} stroke={INK} strokeOpacity={0.35} strokeDasharray="3 3"
            label={{ value: m.label, position: 'top', fill: INK, fontSize: 12 }} />
        ))}
        <Line dataKey="physical" name="Physical progress" stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={!motionOff} />
        <Line dataKey="financial" name="Financial progress (EPC spend)" stroke={SERIES[1]} strokeWidth={2} dot={false} isAnimationActive={!motionOff} />
        {req('reqPhysical', 'Required physical', SERIES[0], 7, true)}
        {req('reqFinancial', 'Required financial', SERIES[1], 3.5, false)}
      </ComposedChart>
    </ChartFrame>
  )
}
