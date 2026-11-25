// Engine results for the active and base scenarios, recomputed only when an Inputs object changes identity.
// The engine never runs on an incomplete scenario: its result is null and its checks are the Required checks.
import { useMemo } from 'react'
import { healthScore, runChecks, type Check } from '../engine/health'
import { runModel, type ModelResult } from '../engine/model'
import type { Inputs } from '../engine/types'
import { type Missing, missingOf, requiredChecks } from './projects'
import { type Scenario, useStore } from './store'

// Shared across every component that calls useModel (per-component useMemo alone would rerun the engine per caller).
const results = new WeakMap<Inputs, ModelResult>()
const resultOf = (i: Inputs) => {
  let r = results.get(i)
  if (!r) { r = runModel(i); results.set(i, r) }
  return r
}
/** The engine result for a scenario, or null while it has empty fields. */
export const resultFor = (s: Pick<Scenario, 'inputs' | 'empty'>) => (s.empty.length ? null : resultOf(s.inputs))
const checks = new WeakMap<ModelResult, Check[]>()
const checksFor = (r: ModelResult) => {
  let c = checks.get(r)
  if (!c) { c = runChecks(r); checks.set(r, c) }
  return c
}

export interface Model {
  active: ModelResult | null; base: ModelResult | null; checks: Check[]; score: ReturnType<typeof healthScore>; missing: Missing
}

type St = ReturnType<typeof useStore.getState>
const scenarioOf = (s: St, id: string) => s.scenarios.find(x => x.id === id) ?? s.scenarios[0]

export function useModel(): Model {
  const activeInputs = useStore(s => scenarioOf(s, s.activeId).inputs)
  const activeEmpty = useStore(s => scenarioOf(s, s.activeId).empty)
  const baseInputs = useStore(s => scenarioOf(s, s.baseId).inputs)
  const baseEmpty = useStore(s => scenarioOf(s, s.baseId).empty)
  return useMemo(() => {
    const missing = missingOf(activeEmpty)
    const active = resultFor({ inputs: activeInputs, empty: activeEmpty })
    const c = active ? checksFor(active) : requiredChecks(missing)
    return { active, base: resultFor({ inputs: baseInputs, empty: baseEmpty }), checks: c, score: healthScore(c), missing }
  }, [activeInputs, activeEmpty, baseInputs, baseEmpty])
}

/** The active result, for components rendered only under a <ResultsGate>. */
export function useResult(): ModelResult {
  const { active } = useModel()
  if (!active) throw new Error('useResult() outside a <ResultsGate>: the scenario is incomplete')
  return active
}
