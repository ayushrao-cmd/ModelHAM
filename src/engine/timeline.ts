import { type Day, addDays, addMonths, eomonth, toDay, yearsBetween } from './dates'
import type { Inputs } from './types'

export interface Timeline {
  bid: Day; award: Day; agreement: Day; start: Day; completion: Day; firstPayment: Day; end: Day
  months: Day[]; payments: Day[]
}

export function buildTimeline(i: Inputs): Timeline {
  const { deal } = i
  const bid = toDay(deal.bidDate)
  const award = addDays(bid, deal.daysToAward)
  const agreement = addDays(award, deal.daysToAgreement)
  const start = addDays(agreement, deal.daysToStart)
  const completion = addDays(start, deal.buildDays - 1)
  const firstPayment = addDays(completion, i.income.firstPaymentLagDays)
  const end = addMonths(completion, 12 * deal.operateYears)
  const months: Day[] = []
  // No months when completion precedes start (Build Days < 1); runChecks reports it.
  if (completion >= start) for (let m = eomonth(start); m <= eomonth(completion); m = eomonth(m + 1)) months.push(m)
  const payments = Array.from({ length: 2 * deal.operateYears }, (_, k) => addMonths(firstPayment, 6 * k))
  return { bid, award, agreement, start, completion, firstPayment, end, months, payments }
}

export const indexRate = (i: Inputs): number =>
  i.indexation.wpiWeight * i.indexation.wpi + (1 - i.indexation.wpiWeight) * i.indexation.cpi

export const indexFactor = (i: Inputs, d: Day): number => {
  const bid = toDay(i.deal.bidDate)
  return d <= bid ? 1 : (1 + indexRate(i)) ** yearsBetween(bid, d)
}
