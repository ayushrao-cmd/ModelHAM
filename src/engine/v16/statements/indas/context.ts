import type { Row, V16Result } from '../../types'
import { buildIgaap } from '../igaap'
import { context as base, type Ctx as Base } from '../igaap/context'
import { under, type RowOpts } from '../row'

/** The statement context on Fin-INDAS, plus the IGAAP rows IndAS copies (V16's IndAS formulas point at the same
 *  schedules, or at Fin-IGAAP itself, for every line the two standards share). */
export interface Ctx extends Base {
  /** The IGAAP top-level row reproducing Fin-IGAAP!n. */
  ig: (n: number) => Row
  /** Fin-INDAS!n equal to the IGAAP row `from`: its values, total (blank stays blank) and drill-down, re-identified
   *  under `id`; `label` defaults to the IGAAP label. */
  copy: (id: string, n: number, from: Row, formula: string, o?: RowOpts & { label?: string }) => Row
}

export function context(r: V16Result): Ctx {
  const x = base(r, 'Fin-INDAS'), rows = new Map<number, Row>()
  for (const s of buildIgaap(r).statements) for (const row of s.rows) rows.set(+row.source!.split('!')[1], row)
  return {
    ...x,
    ig: (n) => rows.get(n)!,
    copy: (id, n, from, formula, { label = from.label, ...o } = {}) => x.fin(id, label, from.values, n, formula, {
      total: Number.isNaN(from.total) ? false : from.total, unit: from.unit, additive: from.additive,
      children: from.children?.map((c) => under(id, c)), ...o }),
  }
}
