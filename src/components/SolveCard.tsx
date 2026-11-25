import { useState } from 'react'
import { Target } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { ModelResult } from '../engine/model'
import { type SolveResult, solveBidPrice } from '../engine/solve'
import type { Inputs } from '../engine/types'
import { fmt } from '../lib/format'
import { useStore } from '../state/store'
import { NumberField } from './fields/NumberField'
import { parseNumber } from './fields/parse'

const round2 = (n: number) => Math.round(n * 100) / 100 // to ₹0.01 Cr, the precision a typed Bid Price has

/** "What Bid Price gives this equity IRR?" Bisection over runModel, run synchronously (a few ms). */
export function SolveCard({ result: r }: { result: ModelResult }) {
  const setInput = useStore(s => s.setInput)
  const [target, setTarget] = useState(r.inputs.targets.equityIrrHurdle)
  // A result belongs to the inputs it was solved on; any edit (including Apply) retires it.
  const [solved, setSolved] = useState<{ for: Inputs; res: SolveResult } | null>(null)
  const res = solved?.for === r.inputs ? solved.res : null

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Read the field itself: Enter submits before the field's debounce or blur has committed the draft.
    const p = parseNumber((e.currentTarget.querySelector('#solve-target') as HTMLInputElement).value, 'percent')
    if (!p.ok) return
    setTarget(p.value)
    setSolved({ for: r.inputs, res: solveBidPrice(r.inputs, p.value) })
  }
  const apply = (bid: number) => {
    setInput('deal.bidPrice', round2(bid))
    toast.success(`Bid Price set to ${fmt.cr(round2(bid))}`)
  }

  return (
    <Card className="min-w-0 border-primary/25 bg-primary/[0.04] p-5 shadow-card">
      <div className="flex items-center gap-2">
        <Target className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-[15px] font-semibold leading-6">Solve Bid Price</h2>
      </div>
      <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
        Find the Bid Price that gives a target equity IRR, holding every other input fixed.
      </p>
      <form className="mt-4 flex items-end gap-2" onSubmit={onSubmit}>
        <div className="min-w-0 flex-1">
          <label htmlFor="solve-target" className="text-sm font-medium leading-5">Target equity IRR</label>
          <NumberField id="solve-target" className="mt-1.5" value={target} kind="percent" onCommit={setTarget} />
        </div>
        <Button type="submit" className="mb-px shrink-0">Solve</Button>
      </form>
      <div role="status" aria-label="Solve result" className="mt-3 min-h-9 text-sm">
        {res && (res.ok ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md border bg-card px-3 py-2">
            <span className="tabular-nums">
              Bid Price <strong className="font-semibold">{fmt.cr(round2(res.bidPrice))}</strong> gives {fmt.pct(res.equityIrr)}
            </span>
            {Math.abs(round2(res.bidPrice) - r.inputs.deal.bidPrice) < 0.005
              ? <span className="text-xs text-muted-foreground">Already the current Bid Price</span>
              : <Button size="sm" variant="outline" className="h-7" onClick={() => apply(res.bidPrice)}>
                  Apply<span className="sr-only"> Bid Price {fmt.cr(round2(res.bidPrice))}</span>
                </Button>}
          </div>
        ) : (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-foreground">
            {res.reason}. Try a target closer to the current {r.kpis.equityIrr == null ? 'IRR' : fmt.pct(r.kpis.equityIrr)}.
          </p>
        ))}
      </div>
    </Card>
  )
}
