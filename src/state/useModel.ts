// Engine results for the active and base scenarios, recomputed only when an Inputs object changes identity.
import { useMemo } from 'react'
import { healthScore, runChecks, type Check } from '../engine/health'
import { runModel, type ModelResult } from '../engine/model'
import type { Inputs } from '../engine/types'
import { useStore } from './store'

// Shared across every component that calls useModel (per-component useMemo alone would rerun the engine per caller).
const results = new WeakMap<Inputs, ModelResult>()
export const resultFor = (i: Inputs) => {
  let r = results.get(i)
  if (!r) { r = runModel(i); results.set(i, r) }
  return r
}
const checks = new WeakMap<ModelResult, Check[]>()
const checksFor = (r: ModelResult) => {
  let c = checks.get(r)
  if (!c) { c = runChecks(r); checks.set(r, c) }
  return c
}

export function useModel(): { active: ModelResult; base: ModelResult; checks: Check[]; score: ReturnType<typeof healthScore> } {
  const activeInputs = useStore(s => (s.scenarios.find(x => x.id === s.activeId) ?? s.scenarios[0]).inputs)
  const baseInputs = useStore(s => (s.scenarios.find(x => x.id === s.baseId) ?? s.scenarios[0]).inputs)
  return useMemo(() => {
    const active = resultFor(activeInputs)
    const c = checksFor(active)
    return { active, base: resultFor(baseInputs), checks: c, score: healthScore(c) }
  }, [activeInputs, baseInputs])
}
