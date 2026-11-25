import type { Day } from './dates'

export type Flow = { day: Day; amount: number }

/** XNPV, base = first flow's day. */
export const npv = (rate: number, flows: Flow[]): number => {
  if (!flows.length) return 0
  const d0 = flows[0].day
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, (f.day - d0) / 365), 0)
}

/** XIRR: Newton from 0.1, bisection fallback on [-0.99, 10]; null if no sign change / no root. */
export const xirr = (flows: Flow[]): number | null => {
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return null
  const d0 = flows[0].day
  const f = (r: number) => npv(r, flows)
  const df = (r: number) =>
    flows.reduce((s, c) => {
      const t = (c.day - d0) / 365
      return s - (t * c.amount) / Math.pow(1 + r, t + 1)
    }, 0)

  let r = 0.1
  for (let i = 0; i < 100; i++) {
    const v = f(r)
    const d = df(r)
    if (!isFinite(v) || !isFinite(d) || d === 0) break
    const next = r - v / d
    if (next <= -0.99 || next > 10) break
    if (Math.abs(next - r) < 1e-12) return next
    r = next
  }

  let lo = -0.99
  let hi = 10
  let flo = f(lo)
  if (Math.abs(flo) < 1e-9) return lo // root at the lower bound
  if (flo * f(hi) > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fm = f(mid)
    if (Math.abs(fm) < 1e-9 || hi - lo < 1e-12) return mid
    if (flo * fm < 0) hi = mid
    else {
      lo = mid
      flo = fm
    }
  }
  return (lo + hi) / 2
}
