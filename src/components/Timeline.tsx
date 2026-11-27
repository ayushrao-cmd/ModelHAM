import { cn } from '@/lib/utils'
import { toIso } from '../engine/dates'
import type { Day } from '../engine/dates'
import type { ModelResult } from '../engine/model'
import { fmt } from '../lib/format'

/** Deal dates: completion is the COD, first payment the 1st annuity, end the concession end. */
export interface DealDates { bid: Day; award: Day; agreement: Day; start: Day; completion: Day; firstPayment: Day; end: Day }
export function dealDates(r: ModelResult): DealDates {
  const { grid: g, inputs: { deal } } = r, award = g.bid + deal.daysToAward
  return { bid: g.bid, award, agreement: award + deal.daysToAgreement, start: g.appointed, completion: g.cod,
    firstPayment: g.firstAnnuity, end: g.concessionEnd }
}

const EVENTS: { key: keyof DealDates; label: string }[] = [
  { key: 'bid', label: 'Bid' }, { key: 'award', label: 'Award' }, { key: 'agreement', label: 'Agreement' },
  { key: 'start', label: 'Start' }, { key: 'completion', label: 'COD' }, { key: 'firstPayment', label: 'First payment' },
  { key: 'end', label: 'End' },
]
const DAYS_PER_MONTH = 365.25 / 12

/** "60 days", "36 months", "14.5 years": days up to six months, months under five years. */
function gap(days: number) {
  if (days <= 183) return `${fmt.num(days, 0)} ${days === 1 ? 'day' : 'days'}`
  const months = days / DAYS_PER_MONTH
  return months < 60 ? `${fmt.num(months, 0)} months` : `${fmt.num(days / 365.25, 1)} years`
}

/** Deal timeline strip: bid → end with dates and the gap to the next event. Vertical on mobile, horizontal from md. */
export function Timeline({ timeline: t }: { timeline: DealDates }) {
  return (
    <figure aria-label="Deal timeline" className="m-0">
      <ol className="flex flex-col md:flex-row md:pt-7">
        {EVENTS.map(({ key, label }, k) => {
          const next = EVENTS[k + 1], build = key === 'start' // the build period is the one segment in the accent
          return (
            <li key={key} className={cn('relative flex gap-3 md:flex-col md:gap-0', next ? 'pb-4 md:flex-1 md:pb-0' : 'md:shrink-0')}>
              {next && <span aria-hidden="true" className={cn('absolute left-[5px] top-4 -bottom-0.5 w-0.5 md:left-4 md:right-1 md:top-[5px] md:h-0.5 md:w-auto',
                build ? 'bg-primary' : 'bg-border')} />}
              <span aria-hidden="true" className={cn('relative mt-1 size-3 shrink-0 rounded-full border-2 bg-card md:mt-0',
                build || key === 'completion' ? 'border-primary' : 'border-muted-foreground/60')} />
              <div className="min-w-0 md:mt-3 md:pr-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="whitespace-nowrap text-sm font-medium tabular-nums"><time dateTime={toIso(t[key])}>{fmt.date(t[key])}</time></div>
                {next && (
                  <div className={cn('mt-0.5 text-xs tabular-nums md:absolute md:-top-7 md:left-4 md:right-1 md:mt-0 md:text-center',
                    build ? 'font-medium text-primary' : 'text-muted-foreground')}>
                    <span className="sr-only">then </span>{gap(t[next.key] - t[key])}<span className="sr-only"> to {next.label.toLowerCase()}</span>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </figure>
  )
}
