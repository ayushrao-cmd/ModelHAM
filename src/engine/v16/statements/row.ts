import type { Row } from '../types'

/** Row builders and tree helpers shared by the IGAAP and IndAS statements. */

export interface RowOpts {
  num?: string; unit?: Row['unit']; formula?: string; source?: string; children?: Row[]; additive?: boolean
  /** D column: Σ values by default; `false` = blank (BS balances, DSCR rows V16 does not total); a number = as given. */
  total?: number | false
}

/** A blank cell (see `Row`). */
export const isBlank = (v: number) => Number.isNaN(v)
/** Σ of the finite values (NaN = blank cell). */
export const sumFinite = (a: number[]) => a.reduce((s, v) => (Number.isFinite(v) ? s + v : s), 0)
/** Per-index Σ of the series, blanks (and missing entries) counted as 0. */
export const add = (...a: number[][]) => a[0].map((_, k) => sumFinite(a.map((x) => x[k] ?? 0)))
export const neg = (a: number[]) => a.map((v) => -v)
export const cumulative = (a: number[]) => { let s = 0; return a.map((v) => (s += v)) }
/** Previous FY's value (0 in the first FY): the opening of a balance. */
export const previous = (a: number[]) => a.map((_, k) => (k ? a[k - 1] : 0))

function make(kind: Row['kind'], id: string, label: string, values: number[], o: RowOpts): Row {
  const total = o.total === false ? NaN : o.total ?? sumFinite(values)
  const r: Row = { id, label, values, total, kind, unit: o.unit ?? 'money' }
  if (o.num !== undefined) r.num = o.num
  if (o.children?.length) r.children = o.children
  if (o.additive === false) r.additive = false
  if (o.formula) r.formula = o.formula
  if (o.source) r.source = o.source
  return r
}

export const line = (id: string, label: string, values: number[], o: RowOpts = {}) => make('line', id, label, values, o)
export const check = (id: string, label: string, values: number[], o: RowOpts = {}) =>
  make('check', id, label, values, { total: false, ...o })
export const header = (id: string, label: string, n: number, o: Omit<RowOpts, 'children' | 'total'> = {}) =>
  make('header', id, label, Array<number>(n).fill(NaN), { ...o, total: false })
/** A sum of `parts` (its children unless `o.children` says otherwise); a blank `total` stays blank. */
export const subtotal = (id: string, label: string, parts: Row[], o: RowOpts = {}, kind: 'subtotal' | 'total' = 'subtotal') =>
  make(kind, id, label, add(...parts.map((p) => p.values)), { children: parts, ...o })
export const total = (id: string, label: string, parts: Row[], o: RowOpts = {}) => subtotal(id, label, parts, o, 'total')

/** A copy of `row` re-identified under `parent` (ids stay unique in a tree); `deep` keeps its children (re-identified
 *  too), otherwise a leaf (without `additive`, which only describes children). */
export function under(parent: string, row: Row, deep = true): Row {
  const id = `${parent}/${row.id}`
  const { children, additive, ...rest } = row
  const r: Row = { ...rest, id }
  if (deep && children) {
    r.children = children.map((c) => under(id, c))
    if (additive === false) r.additive = false
  }
  return r
}
export const leaves = (parent: string, rows: Row[]) => rows.map((r) => under(parent, r, false))

/** Every row of a tree (pre-order) with its depth (0 = top level). */
export function* walk(rows: Row[], depth = 0): Generator<{ row: Row; depth: number }> {
  for (const row of rows) {
    yield { row, depth }
    if (row.children) yield* walk(row.children, depth + 1)
  }
}

/** Rows whose additive children do not sum to them (per FY, and on the total where both are set), beyond `tol`. */
export function additiveErrors(rows: Row[], tol = 1e-6): string[] {
  const out: string[] = []
  for (const { row } of walk(rows)) {
    if (!row.children || row.additive === false) continue
    const s = add(...row.children.map((c) => c.values))
    row.values.forEach((v, k) => {
      if (Number.isFinite(v) && !(Math.abs(s[k] - v) <= tol)) out.push(`${row.id}[${k}]: Σ ${s[k]} ≠ ${v}`)
    })
    const t = sumFinite(row.children.map((c) => c.total))
    if (Number.isFinite(row.total) && row.children.every((c) => Number.isFinite(c.total)) && !(Math.abs(t - row.total) <= tol))
      out.push(`${row.id} total: Σ ${t} ≠ ${row.total}`)
  }
  return out
}
