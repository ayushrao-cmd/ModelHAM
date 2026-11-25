import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts'
import type { ModelResult } from '../engine/model'
import { fmt } from '../lib/format'
import { ChartFrame, ChartTooltip, useReducedMotion } from './ChartFrame'
import { sourcesUsesData } from './data'
import { SERIES, NEUTRAL, SURFACE, axisProps, gridProps, legendStyle } from './theme'

const SOURCE_COLORS = [SERIES[0], SERIES[2], SERIES[6], SERIES[1]] // support, support GST, equity, debt: one entity, one hue

export function SourcesUsesChart({ result }: { result: ModelResult }) {
  const motionOff = useReducedMotion()
  const d = sourcesUsesData(result)
  const keys = [...d.sources.map((s, k) => ({ ...s, key: `s:${s.key}`, color: SOURCE_COLORS[k] })),
    ...d.uses.map((u, k) => ({ ...u, key: `u:${u.key}`, color: u.key === 'other' ? NEUTRAL : SERIES[k] }))]
  const row = (g: string, name: string) =>
    ({ name, ...Object.fromEntries(keys.filter(k => k.key.startsWith(g)).map(k => [k.key, k.value])) })
  const rows = [row('s:', `Sources ${fmt.cr(d.totalSources)}`), row('u:', `Uses ${fmt.cr(d.totalUses)}`)]
  return (
    <ChartFrame title="Sources and uses of funds" empty={d.totalUses <= 0} height={260}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }} barSize={32}>
        <CartesianGrid {...gridProps} horizontal={false} vertical />
        <XAxis type="number" {...axisProps} tickFormatter={v => fmt.num(v, 0)} />
        <YAxis type="category" dataKey="name" width={150} tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip format={v => fmt.cr(v)} />} />
        <Legend wrapperStyle={legendStyle} />
        {keys.map(k => (
          <Bar key={k.key} dataKey={k.key} name={k.label} stackId={k.key.slice(0, 1)} fill={k.color}
            stroke={SURFACE} strokeWidth={2} isAnimationActive={!motionOff} />
        ))}
      </BarChart>
    </ChartFrame>
  )
}
