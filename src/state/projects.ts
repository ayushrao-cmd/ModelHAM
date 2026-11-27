// Project templates and empty fields. A blank project starts with every project-data leaf empty: the leaf holds a
// neutral 0 / '' that is never shown or computed, and its path is listed in the scenario's `empty`.
import { DEFAULT_INPUTS } from '../engine/defaults'
import type { Check } from '../engine/health'
import type { FieldDef, Inputs, SectionId } from '../engine/types'
import { FIELDS } from '../fields'
import { getAt, setAt } from '../lib/path'

export type Template = 'sample' | 'blank'

/** Leaf paths of a value: 'a.b' for a scalar, 'a.3' for list cells, 'a.0.day' for row cells. */
export function leafPaths(path: string, v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap((x, k) => leafPaths(`${path}.${k}`, x))
  if (v !== null && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => leafPaths(`${path}.${k}`, x))
  return [path]
}

/** `p` is `path` itself or inside it. */
export const under = (path: string) => (p: string) => p === path || p.startsWith(`${path}.`)

// Project data starts empty; concession standards and statutory values are pre-filled; selects keep a default choice.
// Persist v3 also had the (now hidden) fields the engine no longer reads; v4 dropped them (store.ts `migrate`).
const startsEmptyV3 = (f: FieldDef) => !f.prefill && f.kind !== 'select' && !f.readOnly
const startsEmpty = (f: FieldDef) => startsEmptyV3(f) && !f.hidden
const BLANK_FIELDS = FIELDS.filter(startsEmpty)
const leaves = (fs: FieldDef[]) => fs.flatMap(f => leafPaths(f.id, getAt(DEFAULT_INPUTS, f.id)))
export const BLANK_EMPTY: string[] = leaves(BLANK_FIELDS)
/** BLANK_EMPTY as persist v3 indexed it (v2's list is its prefix): decodes a v2/v3 save's empty ranges. */
export const BLANK_EMPTY_V3: string[] = leaves(FIELDS.filter(startsEmptyV3))
/** The field each blank leaf belongs to: 'capital.repayment.3' → 'capital.repayment'. */
export const BLANK_FIELD_OF = new Map(BLANK_FIELDS.flatMap(f => leafPaths(f.id, getAt(DEFAULT_INPUTS, f.id)).map(p => [p, f.id])))
/** Blank-class fields added in persist v3: a v2 blank save has no value for them. */
export const V3_BLANK_PATHS = BLANK_EMPTY.filter(p => under('build.manualPhasing')(p) || under('build.spvManpower')(p))
export const BLANK_INPUTS: Inputs = BLANK_EMPTY.reduce(
  (i, p) => setAt(i, p, typeof getAt(i, p) === 'string' ? '' : 0), DEFAULT_INPUTS)
const EMPTIABLE = new Set(BLANK_EMPTY)

export const TEMPLATES: Record<Template, { inputs: Inputs; empty: string[] }> = {
  sample: { inputs: DEFAULT_INPUTS, empty: [] },
  blank: { inputs: BLANK_INPUTS, empty: BLANK_EMPTY },
}

/**
 * Empty paths as index ranges into BLANK_EMPTY ("0-80" for a fresh blank project), so a save stays a few bytes.
 * ponytail: indices follow FIELDS order; reordering or adding blank-class fields needs a persist version bump + migrate.
 * v3 appended build.manualPhasing + build.spvManpower at the end of BLANK_EMPTY (store.ts `migrate` marks them empty for v2 blank saves).
 * v4 removed the hidden fields (patrol rental, build finance & legal, WPI, CPI): `migrate` decodes older saves with BLANK_EMPTY_V3.
 */
export function encodeEmpty(empty: string[]): string {
  const has = new Set(empty), idx = BLANK_EMPTY.flatMap((p, i) => (has.has(p) ? [i] : []))
  const out: string[] = []
  for (let k = 0; k < idx.length; k++) {
    let j = k
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++
    out.push(j > k ? `${idx[k]}-${idx[j]}` : String(idx[k]))
    k = j
  }
  return out.join(',')
}
export const decodeEmpty = (s: string, list = BLANK_EMPTY): string[] => s.split(',').flatMap(part => {
  const m = /^(\d+)(?:-(\d+))?$/.exec(part)
  if (!m) return []
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : a
  return b < a || b >= list.length ? [] : list.slice(a, b + 1)
})

/** Untrusted empty paths (an encoded string or a list): only leaves a blank project can have empty, in template order. */
export function validEmpty(raw: unknown): string[] {
  const list: unknown[] = typeof raw === 'string' ? decodeEmpty(raw) : Array.isArray(raw) ? raw : []
  const s = new Set(list.filter((p): p is string => typeof p === 'string' && EMPTIABLE.has(p)))
  return BLANK_EMPTY.filter(p => s.has(p))
}

/** Set every empty leaf back to its neutral value. */
export const neutralise = (inputs: Inputs, empty: string[]) => empty.reduce((i, p) => setAt(i, p, getAt(BLANK_INPUTS, p)), inputs)

export interface MissingField { fieldId: string; label: string; section: SectionId; count: number; total: number }
export interface Missing { paths: string[]; byField: MissingField[]; filled: number; total: number }

const TOTAL = new Map(FIELDS.map(f => [f.id, leafPaths(f.id, getAt(DEFAULT_INPUTS, f.id)).length]))
/** Progress counts values (list cells count one each) out of everything a blank project starts without. */
export function missingOf(empty: string[]): Missing {
  const byField = FIELDS.flatMap(f => {
    const count = empty.filter(under(f.id)).length
    return count ? [{ fieldId: f.id, label: f.label, section: f.section, count, total: TOTAL.get(f.id)! }] : []
  })
  return { paths: empty, byField, filled: BLANK_EMPTY.length - empty.length, total: BLANK_EMPTY.length }
}

/** While a scenario is incomplete these are its only checks: one error per field with an empty value. */
export const requiredChecks = (m: Missing): Check[] => m.byField.map(f => ({
  id: `field:${f.fieldId}`, title: f.label, section: f.section, fieldId: f.fieldId, severity: 'error', pass: false,
  message: f.total === 1 ? 'Required' : `${f.count} of ${f.total} values missing`,
}))
