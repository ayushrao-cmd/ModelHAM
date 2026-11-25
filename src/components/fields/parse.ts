// Text ⇄ number for inputs. Percent kinds are typed and shown in percent points (9.82 means 0.0982).
import type { FieldDef } from '../../engine/types'

type Kind = FieldDef['kind']
export type Parsed = { ok: true; value: number } | { ok: false; error: string }

export const isPercent = (k: Kind) => k === 'percent' || k === 'percentList'
// Digits with optional grouping commas (each comma between digits), optional decimals; or a bare ".5".
const NUMBER = /^-?(?:\d+(?:,\d+)*(?:\.\d*)?|\.\d+)$/
/** Drops float residue: 9.82 / 100 is 0.09820000000000001 in IEEE doubles. */
const clean = (n: number) => Number(n.toPrecision(12))

export function parseNumber(raw: string, kind: Kind): Parsed {
  const s = raw.replace(/[₹\s]/g, '').replace(isPercent(kind) ? /%$/ : /cr$/i, '')
  if (!s) return { ok: false, error: 'Enter a value.' }
  if (!NUMBER.test(s)) return { ok: false, error: isPercent(kind) ? 'Enter a number in percent, e.g. 9.82.' : 'Enter a number, e.g. 2,250.' }
  const n = Number(s.replace(/,/g, ''))
  return { ok: true, value: isPercent(kind) ? clean(n / 100) : n }
}

export const formatNumber = (v: number, kind: Kind): string =>
  Number.isFinite(v) ? clean(isPercent(kind) ? v * 100 : v).toLocaleString('en-IN', { maximumFractionDigits: 6 }) : ''
