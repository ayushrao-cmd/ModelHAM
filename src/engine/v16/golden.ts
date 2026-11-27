import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Inputs } from '../types'
import { V16_SAMPLE } from './sample'

export interface GoldenRow {
  label: string; total: number | null; values: (number | null)[]
  lead?: Record<string, number> // numeric cells left of the value columns, keyed by 1-based column
}
/** Differential sets (scripts/v16/run_differential.py): `inputs` are site Inputs paths (incl. V16-derived knock-ons,
 *  see scripts/v16/io_map.json); `patches` are hard-code cells changed in the V16 copy (design §9). */
export interface Golden {
  meta: { set: string; inputs: Record<string, number | string>; extracted: string; v16Residual?: number; source?: string
    patches?: { cell: string; old: string; new: string; why: string }[] }
  cells: Record<string, GoldenRow>
  cols: Record<string, (string | null)[]>
  kpis: Record<string, number | null>
}

// Test-only (Node: vite-node provides __dirname): each set is ~1.7 MB, so read on first use (sample = tight recalculation of the unchanged workbook,
// sampleCached = V16's cached values via openpyxl, the rest are the differential sets).
const SETS = ['sample', 'sampleCached', 'bid2400', 'epc105', 'build1460', 'equity30', 'rates50bp', 'equated']
const FILES: Record<string, string> = { sampleCached: 'sample-cached' }
const cache = new Map<string, Golden>()

export const golden = (set: string): Golden => {
  if (!SETS.includes(set)) throw new Error(`golden set not loaded: ${set}`)
  let g = cache.get(set)
  if (!g) {
    g = JSON.parse(readFileSync(join(__dirname, 'golden', `${FILES[set] ?? set}.json`), 'utf8')) as Golden
    cache.set(set, g)
  }
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

export const XL = 25569 // Excel serial of 1970-01-01
/** Excel date serial → engine Day (fractional serials keep their fraction). */
export const fromSerial = (serial: number) => serial - XL

/** V16_SAMPLE with a set's meta.inputs (Inputs paths → values) applied. */
export function inputsFor(set: string): Inputs {
  const i = structuredClone(V16_SAMPLE) as unknown as Record<string, unknown>
  for (const [path, v] of Object.entries(golden(set).meta.inputs)) {
    const keys = path.split('.')
    let o = i as Record<string, unknown>
    for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>
    o[keys[keys.length - 1]] = v
  }
  return i as unknown as Inputs
}
