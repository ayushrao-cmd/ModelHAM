import { fyEnd, toIso } from '../../../dates'
import { toFy } from '../../revenue'
import type { Day, Row, V16Result } from '../../types'
import { header, line, type RowOpts } from '../row'

/** What every IGAAP statement builder needs: the result, FY count and the V16 FY aggregations. */
export interface Ctx {
  r: V16Result; n: number
  /** Σ_FY of a per-period series (COP-MOF r11) and of a per-annuity series (Revenue r7). */
  byPeriod: (s: number[]) => number[]; byAnnuity: (s: number[]) => number[]
  /** A per-FY series with `v` in the FY of `d` (0 elsewhere, all 0 if off the grid). */
  at: (v: number, d: Day) => number[]
  zero: () => number[]
  /** A row reproducing Fin-IGAAP!n (`flip`: shown with the opposite sign, source '−Fin-IGAAP!n'). */
  fin: (id: string, label: string, values: number[], n: number, formula: string, o?: RowOpts & { flip?: boolean }) => Row
  /** A V16 heading row at Fin-IGAAP!n. */
  header: (id: string, label: string, n: number, num?: string) => Row
}

export const src = (n: number, flip = false) => `${flip ? '−' : ''}Fin-IGAAP!${n}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 15-Sep-2030. */
export const fmtDate = (d: Day) => { const [y, m, day] = toIso(d).split('-'); return `${day}-${MONTHS[+m - 1]}-${y}` }

export function context(r: V16Result): Ctx {
  const g = r.grid, n = g.fys.length, ends = g.periods.map((p) => p.end), idx = new Map(g.fys.map((f, k) => [f, k]))
  const zero = () => Array<number>(n).fill(0)
  return {
    r, n, zero,
    byPeriod: (s) => toFy(s, ends, g), byAnnuity: (s) => toFy(s, r.revenue.dates, g),
    at: (v, d) => { const z = zero(), k = idx.get(fyEnd(d)); if (k !== undefined) z[k] = v; return z },
    fin: (id, label, values, num, formula, o = {}) => line(id, label, values, { formula, source: src(num, o.flip), ...o }),
    header: (id, label, num, v16) => header(id, label, n, { source: src(num), ...(v16 && { num: v16 }) }),
  }
}
