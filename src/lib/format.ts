// Display formatting (en-IN grouping, dates in UTC). Pure: the engine imports it for check messages.
import { type Day, toIso } from '../engine/dates'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ok = (n: number | null): n is number => n != null && Number.isFinite(n)
const num = (n: number | null, dp = 2): string =>
  ok(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '—'

export const fmt = {
  cr: (n: number | null): string => (ok(n) ? `${n < 0 ? '-' : ''}₹${num(Math.abs(n))} Cr` : '—'),
  pct: (n: number | null, dp = 2): string => (ok(n) ? `${num(n * 100, dp)}%` : '—'),
  x: (n: number | null): string => (ok(n) ? `${num(n)}×` : '—'),
  // ponytail: fixed month names, not Intl (en-GB ICU now prints "Sept")
  date: (iso: string | Day): string => {
    const [y, m, d] = (typeof iso === 'number' ? toIso(iso) : iso).split('-')
    return `${d} ${MONTHS[Number(m) - 1]} ${y}`
  },
  /** Indian financial year of a day, by its ending year: 31 Mar 2027 -> "FY27". */
  fy: (d: Day): string => `FY${toIso(d).slice(2, 4)}`,
  num,
}
