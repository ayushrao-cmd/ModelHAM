// Scenario store: every scenario is a full Inputs object; persisted to localStorage, sanitised on the way in.
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { DEFAULT_INPUTS } from '../engine/defaults'
import type { Inputs } from '../engine/types'
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
  setCompare(id: string | null): void
  importScenario(json: string): { ok: boolean; error?: string }
}

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

export function mergeWithDefaults(raw: unknown): Inputs {
  return merge(DEFAULT_INPUTS, typeof raw === 'string' ? parse(raw) : raw) as Inputs
}

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
const scenario = (name: string, inputs: Inputs): Scenario => ({ id: uid(), name, inputs, updatedAt: Date.now() })
const initial = () => { const s = scenario('Base case', DEFAULT_INPUTS); return { scenarios: [s], activeId: s.id, baseId: s.id, compareId: null } }

// Private mode / quota / disabled storage must never break the app: fall back to memory-only.
const safeStorage: StateStorage = {
  getItem: k => { try { return localStorage.getItem(k) } catch { return null } },
  setItem: (k, v) => { try { localStorage.setItem(k, v) } catch { /* memory only */ } },
  removeItem: k => { try { localStorage.removeItem(k) } catch { /* memory only */ } },
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
    resetField: fieldId => {
      const base = byId(get().baseId)
      if (base) get().setInput(fieldId, structuredClone(getAt(base.inputs, fieldId)))
    },
    createScenario: (name, from) => add(name, structuredClone((byId(from ?? get().activeId) ?? byId(get().baseId)!).inputs)),
    renameScenario: (id, name) => { if (name.trim()) patch(id, s => ({ ...s, name: name.trim() })) },
    deleteScenario: id => set(st => {
      const scenarios = st.scenarios.filter(s => s.id !== id)
      if (!scenarios.length || scenarios.length === st.scenarios.length) return st
      const baseId = st.baseId === id ? scenarios[0].id : st.baseId
      return { scenarios, baseId, activeId: st.activeId === id ? baseId : st.activeId, compareId: st.compareId === id ? null : st.compareId }
    }),
    setActive: id => { if (byId(id)) set({ activeId: id }) },
    setCompare: id => { if (id === null || byId(id)) set({ compareId: id }) },
    importScenario: json => {
      const raw = parse(json)
      if (!isObj(raw)) return { ok: false, error: 'That file is not a scenario: expected a JSON object.' }
      const isScenario = isObj(raw.inputs)
      const id = add(isScenario && typeof raw.name === 'string' ? raw.name : 'Imported scenario', mergeWithDefaults(isScenario ? raw.inputs : raw))
      set({ activeId: id })
      return { ok: true }
    },
  }
}, {
  name: 'milestone.scenarios.v1',
  version: 1,
  storage: createJSONStorage(() => safeStorage),
  partialize: ({ scenarios, activeId, baseId, compareId }) => ({ scenarios, activeId, baseId, compareId }),
  // Runs on rehydrate (the brief's onRehydrateStorage step): sanitises before state is set, so no render sees raw storage.
  merge: (persisted, current) => ({ ...current, ...rehydrate(persisted) }),
}))
