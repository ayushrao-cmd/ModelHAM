// Operations: half-yearly income, opex, senior debt, Debt Service Reserve, GST recovery and tax.
import { type Day, toDay, yearsBetween } from './dates'
import type { BuildResult } from './build'
import { type Timeline, indexFactor } from './timeline'
import type { Inputs } from './types'

const DAYS_IN_YEAR = 365 // day count for operate-loan interest
const PERIODS_PER_YEAR = 2 // half-yearly payments
const REPAID = 1e-9 // ₹ Cr; float residue of summed repayment fractions below this counts as fully repaid

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** O&M payment rate per operating year (spec §7): year 1 = 0, resurfacing year, year before it, else base. */
export function omSchedule(i: Inputs): number[] {
  const inc = i.income, ry = i.operations.resurfacingYears as number[]
  const pre = i.deal.pavement === 'flexible' ? inc.omPreResurfacingFlexible : inc.omPreResurfacingPerpetual
  return Array.from({ length: i.deal.operateYears }, (_, k) => {
    const y = k + 1
    if (y === 1) return 0
    if (ry.includes(y)) return inc.omResurfacingRate
    if (ry.includes(y + 1)) return pre
    return inc.omBaseRate
  })
}

export const annuityRate = (i: Inputs): number => sum(i.income.bankRates) / i.income.bankRates.length + i.income.spread

/** Annual opex at date d, each line inflated from the bid date at its own rate. */
export function opexForYear(i: Inputs, year: number, d: Day) {
  const o = i.operations, inf = o.inflation
  const yrs = yearsBetween(toDay(i.deal.bidDate), d)
  const up = (amount: number, rate: number) => amount * (1 + rate) ** yrs
  const r = {
    routine: up(o.routine, inf.maintenance),
    electricity: up(o.electricity, inf.electricity),
    financeLegal: up(o.financeLegal, inf.maintenance),
    staff: up(o.staff, inf.staff),
    patrolRunning: up(o.patrolRunning, inf.maintenance),
    ieFee: up(o.ieFee, inf.maintenance),
    insurance: up(o.insuranceBaseRate * o.insuranceLoading * i.build.epcFixed, inf.insurance),
    majorMaintenance: (o.resurfacingYears as number[]).includes(year) ? up(o.majorMaintenance, inf.maintenance) : 0,
  }
  return { ...r, total: sum(Object.values(r)) }
}

export interface OpsPeriod { n: number; day: Day; year: number; completionPayment: number; interestIncome: number; omPayment: number;
  gstRecovery: number; opex: number; tax: number; cfads: number; debtOpening: number; principal: number; interest: number;
  debtClosing: number; reserveBalance: number; reserveMovement: number; wcRelease: number; equityCash: number; dscr: number | null;
  balanceOutstanding: number }

export function runOperations(i: Inputs, t: Timeline,
  b: Pick<BuildResult, 'debt'|'reserve'|'workingCapital'|'netGstCredit'|'totalUses'|'support'|'supportGst'>): OpsPeriod[] {
  const P = t.payments.length, rate = annuityRate(i), om = omSchedule(i), rep = i.capital.repayment
  const tx = i.tax, taxRate = tx.baseRate * (1 + tx.surcharge) * (1 + tx.cess)
  const completionBase = i.income.completionPctOfBid * i.deal.bidPrice * indexFactor(i, t.completion)
  const amortisation = (b.totalUses - b.support - b.supportGst - b.netGstCredit) / P
  const periodDays = (n: number) => t.payments[n - 1] - (n === 1 ? t.completion : t.payments[n - 2])
  const principalAt = (n: number) => (n <= rep.length ? rep[n - 1] * b.debt : 0)

  let balance = completionBase, debt = b.debt, reserve = b.reserve, gstLeft = b.netGstCredit, losses = 0
  return t.payments.map((day, k): OpsPeriod => {
    const n = k + 1, year = Math.ceil(n / PERIODS_PER_YEAR)
    // Income
    const completionPayment = (i.income.installments[k] ?? 0) * completionBase
    const interestIncome = balance * rate / PERIODS_PER_YEAR
    const balanceOutstanding = balance - completionPayment
    balance = balanceOutstanding
    const omPayment = om[year - 1] * i.deal.bidPrice * indexFactor(i, day) / PERIODS_PER_YEAR
    const gstRecovery = Math.min(gstLeft, i.build.gstWorks * completionPayment)
    gstLeft -= gstRecovery
    const opex = opexForYear(i, year, day).total / PERIODS_PER_YEAR
    // Senior debt
    const debtOpening = debt, principal = principalAt(n)
    const interest = debtOpening * i.capital.operateRate * periodDays(n) / DAYS_IN_YEAR
    const debtClosing = Math.abs(debtOpening - principal) < REPAID ? 0 : debtOpening - principal
    debt = debtClosing
    // Reserve: next period's debt service (0 after the last period).
    const reserveBalance = n < P ? principalAt(n + 1) + debtClosing * i.capital.operateRate * periodDays(n + 1) / DAYS_IN_YEAR : 0
    const reserveMovement = reserveBalance - reserve
    reserve = reserveBalance
    // Tax with losses carried forward
    const taxable = completionPayment + interestIncome + omPayment - opex - interest - amortisation - losses
    losses = Math.max(0, -taxable)
    const tax = Math.max(0, taxable) * taxRate
    const cfads = completionPayment + interestIncome + omPayment + gstRecovery - opex - tax
    const service = principal + interest
    const wcRelease = n === 1 ? b.workingCapital : 0
    return { n, day, year, completionPayment, interestIncome, omPayment, gstRecovery, opex, tax, cfads, debtOpening, principal,
      interest, debtClosing, reserveBalance, reserveMovement, wcRelease,
      equityCash: cfads - service - reserveMovement + wcRelease, dscr: service > 0 ? cfads / service : null, balanceOutstanding }
  })
}
