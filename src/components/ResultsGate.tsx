import type { ReactNode } from 'react'
import { ArrowRight, ListChecks } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { go, useRoute } from '../app/router'
import { SECTIONS } from '../app/sections'
import type { Missing } from '../state/projects'
import { useModel } from '../state/useModel'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "23 of 92 values filled" with a bar. List cells count one value each. */
export function FillProgress({ missing, className }: { missing: Missing; className?: string }) {
  const { filled, total } = missing
  return (
    <div className={className}>
      <p className="text-[13px] tabular-nums text-muted-foreground">{filled} of {total} values filled</p>
      <div role="progressbar" aria-label="Values filled" aria-valuemin={0} aria-valuemax={total} aria-valuenow={filled}
        aria-valuetext={`${filled} of ${total} values filled`} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${total ? (filled / total) * 100 : 100}%` }} />
      </div>
    </div>
  )
}

/**
 * Results only for a complete scenario. While fields are empty: a card naming what is left, grouped by section
 * (the current section first), each a jump to the field. `quiet` renders nothing instead of the card.
 */
export function ResultsGate({ children, quiet }: { children: ReactNode; quiet?: boolean }) {
  const { missing } = useModel()
  const { section } = useRoute()
  if (!missing.paths.length) return <>{children}</>
  if (quiet) return null
  const groups = SECTIONS.map(s => ({ s, fields: missing.byField.filter(f => f.section === s.id) })).filter(g => g.fields.length)
    .sort((a, b) => Number(b.s.id === section) - Number(a.s.id === section))
  return (
    <Card className="min-w-0 p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <ListChecks className="size-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-6">Fill in {plural(missing.byField.length, 'more field')} to see results</h2>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            Results, charts and checks appear once every input of this scenario has a value.
          </p>
        </div>
      </div>
      <FillProgress missing={missing} className="mt-4" />
      <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {groups.map(({ s, fields }) => (
          <div key={s.id} className="min-w-0">
            <h3 id={`missing-${s.id}`} className="text-[13px] font-medium text-muted-foreground">{s.label}</h3>
            <ul aria-labelledby={`missing-${s.id}`} className="mt-1 -mx-2">
              {fields.map(f => (
                <li key={f.fieldId}>
                  <button type="button" onClick={() => go(f.section, f.fieldId)}
                    className="group flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="min-w-0 flex-1 truncate">{f.label}</span>
                    {f.total > 1 && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        <span className="sr-only">, </span>{f.count} of {f.total} empty
                      </span>
                    )}
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  )
}
