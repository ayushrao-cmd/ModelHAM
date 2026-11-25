// Chart palette and shared axis styles. Colours resolve through CSS variables (src/index.css), so both themes work.
export const SERIES = [1, 2, 3, 4, 5, 6, 7, 8].map(n => `var(--viz-${n})`)
export const NEUTRAL = 'var(--viz-neutral)'
export const GOOD = 'var(--viz-good)'
export const BAD = 'var(--viz-bad)'
export const SURFACE = 'hsl(var(--card))'
export const INK = 'hsl(var(--foreground))'
export const MUTED = 'hsl(var(--muted-foreground))'
export const GRID = 'hsl(var(--border))'

export const axisTick = { fill: MUTED, fontSize: 12 }
export const axisProps = { tick: axisTick, tickLine: false, axisLine: { stroke: GRID } } as const
export const yAxisProps = { tick: axisTick, tickLine: false, axisLine: false, width: 64 } as const
export const gridProps = { stroke: GRID, strokeDasharray: undefined, vertical: false } as const
export const legendStyle = { fontSize: 12, color: MUTED, paddingTop: 8 }
export const CHART_HEIGHT = 320

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2027-03-31" -> "Mar 27" for axis ticks. */
export const shortMonth = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`
