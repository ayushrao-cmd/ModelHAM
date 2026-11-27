// Engine results for the active and base scenarios, recomputed only when an Inputs object changes identity.
// The engine never runs on an incomplete scenario, nor on one it cannot place in time (an invalid bid date, no build
// months): its result
// is null and its checks are the Required checks, or the blocking ones.
import { useMemo } from 'react'
import { blockingChecks, healthScore, modelRunCheck, runChecks, validateInputs, type Check } from '../engine/health'
import { runModel, type ModelResult } from '../engine/model'
import type { Inputs } from '../engine/types'
import { type Missing, missingOf, requiredChecks, requiredEmpty } from './projects'
import { type Scenario, useStore } from './store'

interface Run { result: ModelResult | null; blocked: Check[] }
/** Inputs the model cannot give a meaningful result for: an invalid bid date (the engine throws) or no build months
 *  (Build Days below 1: no construction periods, which the screens and the build-period checks assume). */
function blocking(i: Inputs): Check[] {
  const days = i.deal.buildDays
  return [...blockingChecks(i), ...(days >= 1 ? [] : [{ id: 'build-period', title: 'Build period has months', section: 'deal' as const,
    fieldId: 'deal.buildDays', severity: 'error' as const, pass: false,
    message: `There are no build months: Build Days is ${Number.isFinite(days) ? days : 'not a number'}, so construction never runs and the model can't run.` }])]
}
// Shared across every component that calls useModel (per-component useMemo alone would rerun the engine per caller).
const runs = new WeakMap<Inputs, Run>()
function runOf(i: Inputs): Run {
  let r = runs.get(i)
  if (!r) {
    const blocked = blocking(i)
    // The engine throws on dates it cannot place; that must never reach React (it would show the Recover screen).
    if (blocked.length) r = { result: null, blocked }
    else try { r = { result: runModel(i), blocked: [] } } catch (e) {
      // The failing input checks are the likely cause: the run check points at the first, and they are listed too.
      const bad = validateInputs(i).filter(c => !c.pass && c.severity === 'error')
      r = { result: null, blocked: [modelRunCheck(e, bad), ...bad] }
    }
    runs.set(i, r)
  }
  return r
}
/** The engine result for a scenario, or null while it has empty fields or a blocking error. */
export const resultFor = (s: Pick<Scenario, 'inputs' | 'empty'>) => (requiredEmpty(s.inputs, s.empty).length ? null : runOf(s.inputs).result)
const checks = new WeakMap<ModelResult, Check[]>()
const checksFor = (r: ModelResult) => {
  let c = checks.get(r)
  if (!c) { c = runChecks(r); checks.set(r, c) }
  return c
}

export interface Model {
  active: ModelResult | null; base: ModelResult | null; checks: Check[]; score: ReturnType<typeof healthScore>; missing: Missing
  /** Why a complete scenario has no result (invalid dates): shown instead of results. */
  blocked: Check[]
}

type St = ReturnType<typeof useStore.getState>
const scenarioOf = (s: St, id: string) => s.scenarios.find(x => x.id === id) ?? s.scenarios[0]

export function useModel(): Model {
  const activeInputs = useStore(s => scenarioOf(s, s.activeId).inputs)
  const activeEmpty = useStore(s => scenarioOf(s, s.activeId).empty)
  const baseInputs = useStore(s => scenarioOf(s, s.baseId).inputs)
  const baseEmpty = useStore(s => scenarioOf(s, s.baseId).empty)
  return useMemo(() => {
    const missing = missingOf(activeInputs, activeEmpty)
    const active = resultFor({ inputs: activeInputs, empty: activeEmpty })
    const blocked = missing.paths.length ? [] : runOf(activeInputs).blocked
    const c = active ? checksFor(active) : [...requiredChecks(missing), ...blocked]
    return { active, base: resultFor({ inputs: baseInputs, empty: baseEmpty }), checks: c, score: healthScore(c), missing, blocked }
  }, [activeInputs, activeEmpty, baseInputs, baseEmpty])
}

/** The active result, for components rendered only under a <ResultsGate>. */
export function useResult(): ModelResult {
  const { active } = useModel()
  if (!active) throw new Error('useResult() outside a <ResultsGate>: the scenario is incomplete')
  return active
}
