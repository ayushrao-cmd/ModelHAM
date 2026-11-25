// Scenario store: every scenario is a full Inputs object; persisted to cookies (only fields that differ
// from the defaults), sanitised on the way in.
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { isIsoDate } from '../engine/dates'
import { DEFAULT_INPUTS } from '../engine/defaults'
import type { Inputs } from '../engine/types'
import { FIELDS } from '../fields'
import { cookies } from '../lib/cookies'
import { getAt, setAt } from '../lib/path'

export interface Scenario { id: string; name: string; inputs: Inputs; updatedAt: number }
interface Store {
  scenarios: Scenario[]; activeId: string; baseId: string; compareId: string | null
  setInput(fieldId: string, value: unknown): void
  resetField(fieldId: string): void
  createScenario(name: string, from?: string): string
  renameScenario(id: string, name: string): void
  deleteScenario(id: string): void
  setActive(id: string): void
  setBase(id: string): void
  setCompare(id: string | null): void
  importScenario(json: string): { ok: boolean; error?: string }
  /** Recovery: the active scenario back to its reference (base, or defaults for the base itself); others untouched. */
  resetActive(): void
  /** Recovery of last resort: a single fresh Base case. */
  resetAll(): void
}

const INPUT_KEYS = Object.keys(DEFAULT_INPUTS) // deal, milestones, build, … targets
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const parse = (s: string): unknown => { try { return JSON.parse(s) } catch { return undefined } }

/** Same shape as the default: same primitive type, arrays of same-shaped elements, objects merged key by key. */
function merge(def: unknown, raw: unknown): unknown {
  if (Array.isArray(def)) {
    if (!Array.isArray(raw)) return def
    const el = def[0]
    // ponytail: element shape is judged against the first default element; every default array is homogeneous
    const sameShape = (x: unknown) => isObj(el)
      ? isObj(x) && Object.keys(el).every(k => typeof x[k] === typeof el[k])
      : typeof x === typeof el && (typeof x !== 'number' || Number.isFinite(x))
    return raw.every(sameShape) ? raw.map(x => (isObj(el) ? merge(el, x) : x)) : def
  }
  if (isObj(def)) {
    if (!isObj(raw)) return def
    return Object.fromEntries(Object.entries(def).map(([k, d]) => [k, merge(d, raw[k])]))
  }
  return typeof raw === typeof def ? raw : def
}

/** Values the shape check can't judge: dates must be real ISO dates, selects one of their options. */
const valid = (kind: string, v: unknown, options?: { value: string }[]) =>
  kind === 'date' ? isIsoDate(v) : kind === 'select' ? !!options?.some(o => o.value === v) : true

export function mergeWithDefaults(raw: unknown): Inputs {
  let m = merge(DEFAULT_INPUTS, typeof raw === 'string' ? parse(raw) : raw) as Inputs
  for (const f of FIELDS) if (!valid(f.kind, getAt(m, f.id), f.options)) m = setAt(m, f.id, getAt(DEFAULT_INPUTS, f.id))
  return setAt(m, 'deal.operateYears', DEFAULT_INPUTS.deal.operateYears) // fixed at 15 by the concession agreement
}

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
const scenario = (name: string, inputs: Inputs): Scenario => ({ id: uid(), name, inputs, updatedAt: Date.now() })
const initial = () => { const s = scenario('Base case', DEFAULT_INPUTS); return { scenarios: [s], activeId: s.id, baseId: s.id, compareId: null } }

// Cookies survive refresh until cleared. Blocked cookies must never break the app: fall back to memory-only.
// The first load after the switch from localStorage reads the old save once, then removes it.
const safeStorage: StateStorage = {
  getItem: k => {
    try { const v = cookies.get(k); if (v !== null) return v } catch { /* cookies blocked */ }
    try { return localStorage.getItem(k) } catch { return null }
  },
  setItem: (k, v) => {
    try { cookies.set(k, v) } catch { return /* memory only */ }
    try { localStorage.removeItem(k) } catch { /* nothing to migrate */ }
  },
  removeItem: k => {
    try { cookies.remove(k) } catch { /* memory only */ }
    try { localStorage.removeItem(k) } catch { /* memory only */ }
  },
}

/** Only what differs from the defaults (arrays as a whole), so a saved scenario is a few hundred bytes. */
function changedFrom(def: unknown, v: unknown): unknown {
  if (isObj(def) && isObj(v)) {
    const out = Object.fromEntries(Object.keys(def).map(k => [k, changedFrom(def[k], v[k])]).filter(([, d]) => d !== undefined))
    return Object.keys(out).length ? out : undefined
  }
  return JSON.stringify(def) === JSON.stringify(v) ? undefined : v
}

type Persisted = Pick<Store, 'scenarios' | 'activeId' | 'baseId' | 'compareId'>
/** Rehydrate untrusted storage: sanitise every scenario, repair dangling ids, or start fresh. */
function rehydrate(raw: unknown): Persisted {
  if (!isObj(raw) || !Array.isArray(raw.scenarios)) return initial()
  const scenarios = raw.scenarios.filter(isObj).filter(s => typeof s.id === 'string').map(s => ({
    id: s.id as string, name: typeof s.name === 'string' && s.name ? s.name : 'Untitled',
    inputs: mergeWithDefaults(s.inputs), updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now(),
  }))
  if (!scenarios.length) return initial()
  const has = (id: unknown): id is string => scenarios.some(s => s.id === id)
  const baseId = has(raw.baseId) ? raw.baseId : scenarios[0].id
  return { scenarios, baseId, activeId: has(raw.activeId) ? raw.activeId : baseId, compareId: has(raw.compareId) ? raw.compareId : null }
}

/** What "changed" and "reset" compare against: the base scenario, or the defaults while editing the base itself. */
export function referenceInputs(s: Pick<Store, 'scenarios' | 'activeId' | 'baseId'>): Inputs {
  if (s.activeId === s.baseId) return DEFAULT_INPUTS
  return (s.scenarios.find(x => x.id === s.baseId) ?? s.scenarios[0]).inputs
}

export const useStore = create<Store>()(persist((set, get) => {
  const byId = (id: string) => get().scenarios.find(s => s.id === id)
  const patch = (id: string, f: (s: Scenario) => Scenario) =>
    set(st => ({ scenarios: st.scenarios.map(s => (s.id === id ? { ...f(s), updatedAt: Date.now() } : s)) }))
  const add = (name: string, inputs: Inputs) => {
    const s = scenario(name.trim() || 'Untitled', inputs)
    set(st => ({ scenarios: [...st.scenarios, s] }))
    return s.id
  }
  return {
    ...initial(),
    setInput: (fieldId, value) => patch(get().activeId, s => ({ ...s, inputs: setAt(s.inputs, fieldId, value) })),
    resetField: fieldId => get().setInput(fieldId, structuredClone(getAt(referenceInputs(get()), fieldId))),
    createScenario: (name, from) => add(name, structuredClone((byId(from ?? get().activeId) ?? byId(get().baseId)!).inputs)),
    renameScenario: (id, name) => { if (name.trim()) patch(id, s => ({ ...s, name: name.trim() })) },
    deleteScenario: id => set(st => {
      const scenarios = st.scenarios.filter(s => s.id !== id)
      if (!scenarios.length || scenarios.length === st.scenarios.length) return st
      const baseId = st.baseId === id ? scenarios[0].id : st.baseId
      return { scenarios, baseId, activeId: st.activeId === id ? baseId : st.activeId, compareId: st.compareId === id ? null : st.compareId }
    }),
    setActive: id => { if (byId(id)) set({ activeId: id }) },
    setBase: id => { if (byId(id)) set({ baseId: id }) },
    setCompare: id => { if (id === null || byId(id)) set({ compareId: id }) },
    importScenario: json => {
      const raw = parse(json)
      if (!isObj(raw)) return { ok: false, error: 'That file is not a scenario: expected a JSON object.' }
      const isScenario = isObj(raw.inputs)
      const inputs = isScenario ? raw.inputs as Record<string, unknown> : raw
      if (!INPUT_KEYS.some(k => k in inputs))
        return { ok: false, error: `That file is not a scenario: it has none of the model's sections (${INPUT_KEYS.join(', ')}).` }
      const id = add(isScenario && typeof raw.name === 'string' ? raw.name : 'Imported scenario', mergeWithDefaults(inputs))
      set({ activeId: id })
      return { ok: true }
    },
    resetActive: () => patch(get().activeId, s => ({ ...s, inputs: structuredClone(referenceInputs(get())) })),
    resetAll: () => set(initial()),
  }
}, {
  name: 'milestone.scenarios.v1',
  version: 1,
  storage: createJSONStorage(() => safeStorage),
  partialize: ({ scenarios, activeId, baseId, compareId }) => ({
    scenarios: scenarios.map(s => ({ ...s, inputs: (changedFrom(DEFAULT_INPUTS, s.inputs) ?? {}) as Inputs })),
    activeId, baseId, compareId,
  }),
  // Runs on rehydrate (the brief's onRehydrateStorage step): sanitises before state is set, so no render sees raw storage.
  merge: (persisted, current) => ({ ...current, ...rehydrate(persisted) }),
}))
