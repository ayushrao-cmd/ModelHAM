import { useEffect, useMemo, useState } from 'react'
import { useRoute } from '../app/router'
import { ResultsGate } from '../components/ResultsGate'
import { StatementsView } from '../components/statements/StatementsView'
import { buildIgaap } from '../engine/v16/statements/igaap'
import { buildIndas } from '../engine/v16/statements/indas'
import { useResult } from '../state/useModel'
import { Panel, SectionHeader } from './SectionLayout'

/** IGAAP | IndAS statements; `#/statements?std=indas&tab=bs` opens a standard and tab, and every switch writes them back. */
function StatementsBody() {
  const r = useResult()
  const sets = useMemo(() => ({ igaap: buildIgaap(r), indas: buildIndas(r) }), [r])
  const { param } = useRoute()
  const std = param('std'), tab = param('tab')
  const [view, setView] = useState({ standard: std, tab })
  useEffect(() => setView({ standard: std, tab }), [std, tab]) // a later deep link wins
  return (
    <Panel>
      <StatementsView sets={sets} standard={view.standard} tab={view.tab} onChange={next => {
        setView(next)
        // Shareable without a hashchange (which would move focus to the page heading), as Health's section filter.
        history.replaceState(null, '', `#/statements?std=${next.standard}&tab=${next.tab}`)
      }} />
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Statements follow the original workbook's IGAAP and IndAS method, line for line; no deferred tax is recognised.
      </p>
    </Panel>
  )
}

export function Statements() {
  return (
    <div className="space-y-6">
      <SectionHeader id="statements" />
      <ResultsGate><StatementsBody /></ResultsGate>
    </div>
  )
}
