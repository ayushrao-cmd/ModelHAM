/** Day = integer days since 1970-01-01 UTC. */
export type Day = number

const MS = 86_400_000

export const toDay = (iso: string): Day => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / MS
}

export const toIso = (d: Day): string => new Date(d * MS).toISOString().slice(0, 10)

/** A real calendar date written YYYY-MM-DD (round-trips, so 2026-02-30 fails). */
export const isIsoDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toIso(toDay(s)) === s

export const addDays = (d: Day, n: number): Day => d + n

/** Excel EDATE: clamps to month end. */
export const addMonths = (d: Day, n: number): Day => {
  const t = new Date(d * MS)
  const y = t.getUTCFullYear()
  const m = t.getUTCMonth() + n
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return Date.UTC(y, m, Math.min(t.getUTCDate(), last)) / MS
}

export const eomonth = (d: Day): Day => {
  const t = new Date(d * MS)
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0) / MS
}

/** 31 March of the Indian financial year containing d. */
export const fyEnd = (d: Day): Day => {
  const t = new Date(d * MS)
  const y = t.getUTCFullYear() + (t.getUTCMonth() >= 3 ? 1 : 0)
  return Date.UTC(y, 2, 31) / MS
}

export const yearsBetween = (a: Day, b: Day): number => (b - a) / 365
