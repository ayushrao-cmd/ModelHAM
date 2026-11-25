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
const startsEmpty = (f: FieldDef) => !f.prefill && f.kind !== 'select' && !f.readOnly
export const BLANK_EMPTY: string[] = FIELDS.filter(startsEmpty).flatMap(f => leafPaths(f.id, getAt(DEFAULT_INPUTS, f.id)))
export const BLANK_INPUTS: Inputs = BLANK_EMPTY.reduce(
  (i, p) => setAt(i, p, typeof getAt(i, p) === 'string' ? '' : 0), DEFAULT_INPUTS)
const EMPTIABLE = new Set(BLANK_EMPTY)

export const TEMPLATES: Record<Template, { inputs: Inputs; empty: string[] }> = {
  sample: { inputs: DEFAULT_INPUTS, empty: [] },
  blank: { inputs: BLANK_INPUTS, empty: BLANK_EMPTY },
}

/** Untrusted empty paths: only leaves a blank project can have empty, in template order, no duplicates. */
export function validEmpty(raw: unknown): string[] {
  const s = new Set(Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string' && EMPTIABLE.has(p)) : [])
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
