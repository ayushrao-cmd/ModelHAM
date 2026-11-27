// Project and scenario store. Each project is one bid with its own scenarios; the active project's scenarios sit at the
// top level (so every scenario selector works unchanged) and `projects` holds the others. Persisted to cookies: each
// scenario only as the fields that differ from its project's template, plus its empty paths; sanitised on the way in.
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { toast } from 'sonner'
import { isIsoDate } from '../engine/dates'
import { DEFAULT_INPUTS } from '../engine/defaults'
import type { Inputs } from '../engine/types'
import { FIELDS } from '../fields'
import { cookies, encodeCookie } from '../lib/cookies'
import { getAt, setAt } from '../lib/path'
import { BLANK_EMPTY, BLANK_EMPTY_V3, BLANK_FIELD_OF, decodeEmpty, encodeEmpty, neutralise, TEMPLATES, type Template, under, V3_BLANK_PATHS, validEmpty } from './projects'

export type { Template } from './projects'
/** `empty`: leaf paths with no value yet (blank projects); the engine never runs while any remain. */
export interface Scenario { id: string; name: string; inputs: Inputs; updatedAt: number; empty: string[] }
export interface Project {
  id: string; template: Template; scenarios: Scenario[]; activeId: string; baseId: string; compareId: string | null; createdAt: number
}
type Active = Pick<Project, 'scenarios' | 'activeId' | 'baseId' | 'compareId'>
interface Store extends Active {
  projects: Project[]; projectId: string
  setInput(path: string, value: unknown): void
  resetField(fieldId: string): void
  createScenario(name: string, from?: string): string
  renameScenario(id: string, name: string): void
  deleteScenario(id: string): void
  setActive(id: string): void
  setBase(id: string): void
  setCompare(id: string | null): void
  importScenario(json: string): { ok: boolean; error?: string }
  /** Recovery: the active scenario back to its reference (base, or the template for the base itself); others untouched. */
  resetActive(): void
  /** Recovery of last resort: the active project back to a single fresh Base case. Other projects are kept. */
  resetAll(): void
  /** Creates a project and switches to it. */
  createProject(kind: 'blank' | 'sample' | 'duplicate'): string
  setProject(id: string): void
  /** Sets Project Name in every scenario of the project. */
  renameProject(id: string, name: string): void
  /** Never the last project. */
  deleteProject(id: string): void
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

/**
 * Untrusted inputs onto a template. Empty paths are exempt from date/select validation; in a blank project an invalid
 * project-data value becomes empty rather than falling back to a template value. Empty leaves end up neutral.
 * In a blank project every project-data leaf the raw data lacks (or that the shape check replaced) is empty too: a
 * neutral placeholder is never shown or computed as if it were a value.
 */
export function sanitize(raw: unknown, template: Template, rawEmpty: unknown): { inputs: Inputs; empty: string[] } {
  const base = TEMPLATES[template].inputs
  const parsed = typeof raw === 'string' ? parse(raw) : raw
  let m = merge(base, parsed) as Inputs
  const empty = new Set(validEmpty(rawEmpty).filter(p => getAt(m, p) !== undefined))
  if (template === 'blank') for (const p of BLANK_EMPTY) if (getAt(m, p) !== getAt(isObj(parsed) ? parsed : {}, p)) empty.add(p)
  for (const f of FIELDS) {
    if (empty.has(f.id) || valid(f.kind, getAt(m, f.id), f.options)) continue
    if (template === 'blank' && BLANK_EMPTY.includes(f.id)) empty.add(f.id)
    else m = setAt(m, f.id, getAt(base, f.id))
  }
  m = setAt(m, 'deal.operateYears', DEFAULT_INPUTS.deal.operateYears) // fixed at 15 by the concession agreement
  const list = BLANK_EMPTY.filter(p => empty.has(p))
  return { inputs: neutralise(m, list), empty: list }
}

/** Raw saved or imported inputs from before persist v4: the 'sCurve' phasing option is now V16's 'scheduleG'. */
export function upgradeInputs(raw: unknown): unknown {
  if (!isObj(raw) || !isObj(raw.build) || raw.build.phasing !== 'sCurve') return raw
  return { ...raw, build: { ...raw.build, phasing: 'scheduleG' } }
}

export const mergeWithDefaults = (raw: unknown): Inputs => sanitize(raw, 'sample', []).inputs

// ponytail: ~50 random bits is plenty for the few dozen ids one browser holds, and a third the size of a UUID in the cookie
const uid = () => Math.random().toString(36).slice(2, 12).padEnd(10, '0')
const scenario = (name: string, inputs: Inputs, empty: string[]): Scenario => ({ id: uid(), name, inputs, empty, updatedAt: Date.now() })
const baseCase = (t: Template) => scenario('Base case', TEMPLATES[t].inputs, TEMPLATES[t].empty)
const newProject = (template: Template): Project => {
  const s = baseCase(template)
  return { id: uid(), template, scenarios: [s], activeId: s.id, baseId: s.id, compareId: null, createdAt: Date.now() }
}
const pick = (p: Active): Active => ({ scenarios: p.scenarios, activeId: p.activeId, baseId: p.baseId, compareId: p.compareId })
const initial = () => { const p = newProject('sample'); return { projects: [p], projectId: p.id, ...pick(p) } }

type Projects = Pick<Store, 'projects' | 'projectId'> & Active
/** Every project, the active one carrying its live top-level scenarios. */
export const allProjects = (s: Projects): Project[] => s.projects.map(p => (p.id === s.projectId ? { ...p, ...pick(s) } : p))
export const activeTemplate = (s: Pick<Store, 'projects' | 'projectId'>): Template =>
  s.projects.find(p => p.id === s.projectId)?.template ?? 'sample'
const baseOf = (p: Active) => p.scenarios.find(x => x.id === p.baseId) ?? p.scenarios[0]
/** Base scenario's Project Name, or "Untitled project" while it has none. */
export const projectLabel = (p: Active) => {
  const b = baseOf(p)
  return (!b.empty.includes('deal.projectName') && b.inputs.deal.projectName.trim()) || 'Untitled project'
}

// Above this many encoded characters the Cookie header nears common 8–16 KB server limits: warn once per session.
const WARN_CHARS = 12 * 1024
let warned = false

// Cookies survive refresh until cleared. Blocked cookies must never break the app: fall back to memory-only.
// The first load after the switch from localStorage reads the old save once, then removes it.
const safeStorage: StateStorage = {
  getItem: k => {
    try { const v = cookies.get(k); if (v !== null) return v } catch { /* cookies blocked */ }
    try { return localStorage.getItem(k) } catch { return null }
  },
  setItem: (k, v) => {
    if (!warned && encodeCookie(v).length > WARN_CHARS) {
      warned = true
      toast.warning('Saved projects are getting large for browser cookies. Export the scenarios you need and delete projects you no longer use.')
    }
    try { cookies.set(k, v) } catch { return /* memory only */ }
    try { localStorage.removeItem(k) } catch { /* nothing to migrate */ }
  },
  removeItem: k => {
    try { cookies.remove(k) } catch { /* memory only */ }
    try { localStorage.removeItem(k) } catch { /* memory only */ }
  },
}

/** Only what differs from the template (arrays as a whole), so a saved scenario is a few hundred bytes. */
function changedFrom(def: unknown, v: unknown): unknown {
  if (isObj(def) && isObj(v)) {
    const out = Object.fromEntries(Object.keys(def).map(k => [k, changedFrom(def[k], v[k])]).filter(([, d]) => d !== undefined))
    return Object.keys(out).length ? out : undefined
  }
  return JSON.stringify(def) === JSON.stringify(v) ? undefined : v
}

/**
 * A scenario as saved: the fields that differ from its template. In a blank project a filled value equal to the neutral
 * placeholder (e.g. 0% insurance inflation) is saved too (its whole field), since an unsaved blank leaf reloads as empty.
 */
function savedInputs(t: Template, s: Scenario): Inputs {
  let d = (changedFrom(TEMPLATES[t].inputs, s.inputs) ?? {}) as Inputs
  if (t === 'blank') {
    const empty = new Set(s.empty)
    for (const [p, fieldId] of BLANK_FIELD_OF) if (!empty.has(p) && getAt(d, p) === undefined) d = setAt(d, fieldId, getAt(s.inputs, fieldId))
  }
  return d
}

/** One untrusted project: sanitise every scenario against its template and repair dangling ids; null if unusable. */
function rehydrateProject(raw: Record<string, unknown>): Project | null {
  if (typeof raw.id !== 'string' || !Array.isArray(raw.scenarios)) return null
  const template: Template = raw.template === 'blank' ? 'blank' : 'sample'
  const scenarios = raw.scenarios.filter(isObj).filter(s => typeof s.id === 'string').map(s => ({
    id: s.id as string, name: typeof s.name === 'string' && s.name ? s.name : 'Untitled',
    ...sanitize(s.inputs, template, s.empty), updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now(),
  }))
  if (!scenarios.length) return null
  const has = (id: unknown): id is string => scenarios.some(s => s.id === id)
  const baseId = has(raw.baseId) ? raw.baseId : scenarios[0].id
  return { id: raw.id, template, scenarios, baseId, activeId: has(raw.activeId) ? raw.activeId : baseId,
    compareId: has(raw.compareId) ? raw.compareId : null, createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now() }
}

/** Rehydrate untrusted storage, or start fresh. */
function rehydrate(raw: unknown): Projects {
  if (!isObj(raw) || !Array.isArray(raw.projects)) return initial()
  const seen = new Set<string>()
  const projects = raw.projects.filter(isObj).map(rehydrateProject)
    .filter((p): p is Project => !!p && !seen.has(p.id) && !!seen.add(p.id))
  if (!projects.length) return initial()
  const p = projects.find(x => x.id === raw.projectId) ?? projects[0]
  return { projects, projectId: p.id, ...pick(p) }
}

/** What "changed" and "reset" compare against: the base scenario, or the template while editing the base itself. */
export function reference(s: Pick<Store, 'projects' | 'projectId'> & Active): { inputs: Inputs; empty: string[] } {
  if (s.activeId === s.baseId) return TEMPLATES[activeTemplate(s)]
  return baseOf(s)
}
export const referenceInputs = (s: Parameters<typeof reference>[0]) => reference(s).inputs

export const useStore = create<Store>()(persist((set, get) => {
  const byId = (id: string) => get().scenarios.find(s => s.id === id)
  const patch = (id: string, f: (s: Scenario) => Scenario) =>
    set(st => ({ scenarios: st.scenarios.map(s => (s.id === id ? { ...f(s), updatedAt: Date.now() } : s)) }))
  const add = (name: string, inputs: Inputs, empty: string[]) => {
    const s = scenario(name.trim() || 'Untitled', inputs, empty)
    set(st => ({ scenarios: [...st.scenarios, s] }))
    return s.id
  }
  /** Value and emptiness of `path` and everything under it, from `src`. */
  const assign = (s: Scenario, path: string, value: unknown, srcEmpty: string[] = []): Scenario => {
    const keep = s.empty.some(under(path)) ? s.empty.filter(p => !under(path)(p)) : s.empty
    const more = srcEmpty.filter(under(path))
    return { ...s, inputs: setAt(s.inputs, path, value), empty: more.length ? BLANK_EMPTY.filter(p => keep.includes(p) || more.includes(p)) : keep }
  }
  const rename = (scenarios: Scenario[], name: string) => scenarios.map(s => ({ ...assign(s, 'deal.projectName', name), updatedAt: Date.now() }))
  const switchTo = (projects: Project[], p: Project) => set({ projects, projectId: p.id, ...pick(p) })
  return {
    ...initial(),
    setInput: (path, value) => {
      // Clearing a blank project's text field (Project or Authority Name) makes it empty again, not "filled with ''".
      const cleared = value === '' && activeTemplate(get()) === 'blank' && BLANK_FIELD_OF.has(path)
      patch(get().activeId, s => assign(s, path, value, cleared ? [path] : []))
    },
    resetField: fieldId => {
      const ref = reference(get())
      patch(get().activeId, s => assign(s, fieldId, structuredClone(getAt(ref.inputs, fieldId)), ref.empty))
    },
    createScenario: (name, from) => {
      const src = byId(from ?? get().activeId) ?? byId(get().baseId)!
      return add(name, structuredClone(src.inputs), [...src.empty])
    },
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
      // A file without `empty` (an older export) is complete where it has values; in a blank project sanitize leaves the rest empty.
      const s = sanitize(upgradeInputs(inputs), activeTemplate(get()), isScenario ? raw.empty : [])
      const id = add(isScenario && typeof raw.name === 'string' ? raw.name : 'Imported scenario', s.inputs, s.empty)
      set({ activeId: id })
      return { ok: true }
    },
    resetActive: () => {
      const ref = reference(get())
      patch(get().activeId, s => ({ ...s, inputs: structuredClone(ref.inputs), empty: [...ref.empty] }))
    },
    resetAll: () => { const s = baseCase(activeTemplate(get())); set({ scenarios: [s], activeId: s.id, baseId: s.id, compareId: null }) },
    createProject: kind => {
      const projects = allProjects(get())
      let p: Project
      if (kind === 'duplicate') {
        const src = projects.find(x => x.id === get().projectId)!
        const ids = new Map(src.scenarios.map(s => [s.id, uid()]))
        const scenarios = src.scenarios.map(s => ({ ...structuredClone(s), id: ids.get(s.id)! }))
        const named = projectLabel(src) !== 'Untitled project'
        p = { ...src, id: uid(), createdAt: Date.now(), scenarios: named ? rename(scenarios, `${projectLabel(src)} (copy)`) : scenarios,
          activeId: ids.get(src.activeId)!, baseId: ids.get(src.baseId)!, compareId: src.compareId && ids.get(src.compareId)! }
      } else p = newProject(kind)
      switchTo([...projects, p], p)
      return p.id
    },
    setProject: id => {
      if (id === get().projectId) return
      const projects = allProjects(get()), p = projects.find(x => x.id === id)
      if (p) switchTo(projects, p)
    },
    renameProject: (id, name) => {
      const n = name.trim()
      if (!n) return
      if (id === get().projectId) set(st => ({ scenarios: rename(st.scenarios, n) }))
      else set(st => ({ projects: st.projects.map(p => (p.id === id ? { ...p, scenarios: rename(p.scenarios, n) } : p)) }))
    },
    deleteProject: id => {
      const st = get(), projects = allProjects(st).filter(p => p.id !== id)
      if (!projects.length || projects.length === st.projects.length) return
      if (id === st.projectId) switchTo(projects, projects[0])
      else set({ projects })
    },
  }
}, {
  name: 'milestone.scenarios.v1', // the cookie name predates projects; kept so saves carry over
  version: 4,
  storage: createJSONStorage(() => safeStorage),
  partialize: s => ({
    projectId: s.projectId,
    projects: allProjects(s).map(p => ({ ...p, scenarios: p.scenarios.map(x => ({
      ...x, inputs: savedInputs(p.template, x), empty: encodeEmpty(x.empty) })) })),
  }),
  // v1 saved one list of scenarios: it becomes the one sample project. v2 blank projects get the v3 blank fields empty.
  // v4: blank saves' empty ranges were indexed by the v3 list (v2's is its prefix), so they are decoded with it into
  // paths (the hidden fields drop out in sanitize); the 'sCurve' phasing option is now 'scheduleG'.
  migrate: (raw0, version) => {
    let raw = raw0
    if (version < 2 && isObj(raw)) raw = { projectId: 'p1', projects: [{ ...raw, id: 'p1', template: 'sample' }] }
    if (version < 4 && isObj(raw) && Array.isArray(raw.projects)) raw = { ...raw, projects: raw.projects.map(p => {
      if (!isObj(p) || !Array.isArray(p.scenarios)) return p
      return { ...p, scenarios: p.scenarios.map(x => {
        if (!isObj(x)) return x
        const inputs = upgradeInputs(x.inputs)
        if (p.template !== 'blank') return { ...x, inputs }
        const was = typeof x.empty === 'string' ? decodeEmpty(x.empty, BLANK_EMPTY_V3) : Array.isArray(x.empty) ? x.empty : []
        return { ...x, inputs, empty: version < 3 ? [...was, ...V3_BLANK_PATHS] : was }
      }) }
    }) }
    return raw
  },
  // Runs on rehydrate (the brief's onRehydrateStorage step): sanitises before state is set, so no render sees raw storage.
  merge: (persisted, current) => ({ ...current, ...rehydrate(persisted) }),
}))
