// Scenario JSON and schedule CSV export, plus the browser download. Pure except `download`.
import { toIso } from '../engine/dates'
import type { ModelResult } from '../engine/model'
import type { ConstructionMonth } from '../engine/v16/construction'
import type { Scenario } from '../state/store'

export type Cell = string | number

// A non-finite number (NaN = a blank statement cell) is an empty cell, never "NaN".
const cell = (v: Cell) => (typeof v === 'number' ? (Number.isFinite(v) ? String(Number(v.toFixed(6))) : '') :/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
export const toCsv = (header: string[], rows: Cell[][]) => [header, ...rows].map(r => r.map(cell).join(',')).join('\n')

/** The shape importScenario accepts back; `empty` lists the values not filled in yet. */
export const exportScenarioJson = (s: Scenario): string => JSON.stringify({ name: s.name, inputs: s.inputs, empty: s.empty }, null, 2)

const MONTH: (keyof ConstructionMonth)[] = ['epcFixed', 'epcVariable', 'tpc', 'idc', 'postCodInterest', 'opex', 'grant', 'grantGst',
  'equityUpfront', 'equityDeferred', 'debtDraw', 'debtBalance', 'stlDraw', 'stlRepay', 'stlBalance', 'dsrPrincipal', 'dsrInterest']
/** Per FY of the grid, from the result. */
const YEAR: [string, (r: ModelResult) => (number | null)[]][] = [
  ['opex', r => r.opex.total], ['interestOnFunds', r => r.funds.interestOnFunds], ['tax', r => r.tax.tax], ['csr', r => r.igaap.csr],
  ['pat', r => r.igaap.pat], ['cfads', r => r.cash.cfads], ['debtRepayment', r => r.debt.repayment], ['debtInterest', r => r.debt.interest],
  ['debtClosing', r => r.debt.closing], ['dscr', r => r.cash.dscr],
  ['dsrClosing', r => r.funds.dsrInterest.closing.map((v, k) => v + r.funds.dsrPrincipal.closing[k])],
  ['mmrClosing', r => r.funds.mmr.closing], ['ffeClosing', r => r.funds.ffe.closing], ['cashClosing', r => r.cash.closing],
  ['equityFlowPost', r => r.cash.annual.equityPost],
]

/** One table: a row per construction-grid month ('build', then 'cod' up to the 1st annuity), then per financial year
 *  ('year', dated at the FY end); columns the other kind lacks stay blank. ₹ Cr throughout. */
export function exportSchedulesCsv(r: ModelResult): string {
  const blank = (n: number) => new Array<Cell>(n).fill('')
  const val = (v: unknown): Cell => (typeof v === 'number' && Number.isFinite(v) ? v : '')
  const years = YEAR.map(([, f]) => f(r))
  return toCsv(['phase', 'date', ...MONTH, ...YEAR.map(([k]) => k)], [
    ...r.construction.months.map((m, k) => [r.grid.periods[k].kind === 'construction' ? 'build' : 'cod', toIso(r.grid.periods[k].end),
      ...MONTH.map(key => val(m[key])), ...blank(YEAR.length)]),
    ...r.grid.fys.map((d, k) => ['year', toIso(d), ...blank(MONTH.length), ...years.map(s => val(s[k]))]),
  ]) + '\n'
}

const REVOKE_AFTER_MS = 5000 // some browsers read the blob URL after click() returns; revoking at 0 ms can cancel the download

export function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}

/** "Base case (v2)" -> "base-case-v2" for file names. */
export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scenario'

/** Copy text to the clipboard, falling back to execCommand. True on success. */
export async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* no clipboard API or permission: fall back */ }
  const ta = Object.assign(document.createElement('textarea'), { value: text })
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;opacity:0'
  document.body.append(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { /* unsupported */ }
  ta.remove()
  return ok
}
