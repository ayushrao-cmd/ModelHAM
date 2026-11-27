import sample from './golden/sample.json'

export interface GoldenRow {
  label: string; total: number | null; values: (number | null)[]
  lead?: Record<string, number> // numeric cells left of the value columns, keyed by 1-based column
}
export interface Golden {
  meta: { set: string; inputs: Record<string, number | string>; extracted: string; v16Residual?: number }
  cells: Record<string, GoldenRow>
  cols: Record<string, (string | null)[]>
  kpis: Record<string, number | null>
}

const sets: Record<string, Golden> = { sample: sample as unknown as Golden }

export const golden = (set: string): Golden => {
  const g = sets[set]
  if (!g) throw new Error(`golden set not loaded: ${set}`)
  return g
}

/** Raw row: nulls kept (empty / text cells). */
export function rowRaw(set: string, key: string): GoldenRow {
  const r = golden(set).cells[key]
  if (!r) throw new Error(`golden ${set}: no row ${key}`)
  return r
}
/** Row with empty cells as 0 and a missing total as NaN. */
export function row(set: string, key: string): { label: string; total: number; values: number[] } {
  const r = rowRaw(set, key)
  return { label: r.label, total: r.total ?? NaN, values: r.values.map((v) => v ?? 0) }
}
export const kpis = (set: string) => golden(set).kpis
export const cols = (set: string) => golden(set).cols

export function expectClose(a: number, b: number, tol: number, what = ''): void {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${what} expected ${b} got ${a} (tol ${tol})`)
}
export function expectSeries(actual: number[], g: { values: number[] }, tol: number, what = ''): void {
  g.values.forEach((v, i) => expectClose(actual[i] ?? 0, v, tol, `${what}[${i}]`))
}
