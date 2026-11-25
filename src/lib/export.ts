// Scenario JSON and schedule CSV export, plus the browser download. Pure except `download`.
import { toIso } from '../engine/dates'
import type { BuildMonth } from '../engine/build'
import type { ModelResult } from '../engine/model'
import type { OpsPeriod } from '../engine/operations'
import type { Scenario } from '../state/store'

export type Cell = string | number

const cell = (v: Cell) => (typeof v === 'number' ? String(Number(v.toFixed(6))) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
export const toCsv = (header: string[], rows: Cell[][]) => [header, ...rows].map(r => r.map(cell).join(',')).join('\n')

/** The shape importScenario accepts back. */
export const exportScenarioJson = (s: Scenario): string => JSON.stringify({ name: s.name, inputs: s.inputs }, null, 2)

const BUILD: (keyof BuildMonth)[] = ['epc', 'otherUses', 'gstPaid', 'idc', 'supportReceived', 'supportGst', 'equityDraw', 'debtDraw',
  'debtBalance', 'cumPhysical', 'cumCost', 'cumFunding']
const OPS: (keyof OpsPeriod)[] = ['n', 'year', 'completionPayment', 'interestIncome', 'omPayment', 'gstRecovery', 'opex', 'tax', 'cfads',
  'debtOpening', 'principal', 'interest', 'debtClosing', 'reserveBalance', 'reserveMovement', 'wcRelease', 'equityCash', 'dscr', 'balanceOutstanding']

/** One table: a row per build month then per operating period; columns the other phase lacks stay blank. ₹ Cr throughout. */
export function exportSchedulesCsv(r: ModelResult): string {
  const blank = (n: number) => new Array<Cell>(n).fill('')
  const val = (v: unknown): Cell => (typeof v === 'number' && Number.isFinite(v) ? v : '')
  return toCsv(['phase', 'date', ...BUILD, ...OPS], [
    ...r.build.months.map(m => ['build', toIso(m.day), ...BUILD.map(k => val(m[k])), ...blank(OPS.length)]),
    ...r.ops.map(p => ['operate', toIso(p.day), ...blank(BUILD.length), ...OPS.map(k => val(p[k]))]),
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
