import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_INPUTS } from '../engine/defaults'
import { cookies } from '../lib/cookies'

const KEY = 'milestone.scenarios.v1'
const cookieNames = () => document.cookie.split('; ').filter(Boolean).map(c => c.split('=')[0])
const clearCookies = () => { for (const n of cookieNames()) document.cookie = `${n}=; path=/; max-age=0` }

const fresh = async () => {
  vi.resetModules()
  return import('./store')
}

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  clearCookies()
})

describe('mergeWithDefaults', () => {
  it('keeps stored values, fills the rest from defaults and drops unknown keys', async () => {
    const { mergeWithDefaults } = await fresh()
    const m = mergeWithDefaults({ deal: { bidPrice: 2000 }, junk: 1 })
    expect(m.deal.bidPrice).toBe(2000)
    expect({ ...m, deal: { ...m.deal, bidPrice: DEFAULT_INPUTS.deal.bidPrice } }).toEqual(DEFAULT_INPUTS)
    expect('junk' in m).toBe(false)
  })

  it('returns defaults for non-objects and bad JSON, and parses JSON strings', async () => {
    const { mergeWithDefaults } = await fresh()
    expect(mergeWithDefaults('not json')).toEqual(DEFAULT_INPUTS)
    expect(mergeWithDefaults(null)).toEqual(DEFAULT_INPUTS)
    expect(mergeWithDefaults(42)).toEqual(DEFAULT_INPUTS)
    expect(mergeWithDefaults([1, 2])).toEqual(DEFAULT_INPUTS)
    expect(mergeWithDefaults(JSON.stringify({ deal: { lengthKm: 40 } })).deal.lengthKm).toBe(40)
  })

  it('keeps the default when a stored leaf has the wrong type', async () => {
    const { mergeWithDefaults } = await fresh()
    const m = mergeWithDefaults({ deal: { bidPrice: 'lots', projectName: 7 }, build: 'x' })
    expect(m.deal.bidPrice).toBe(DEFAULT_INPUTS.deal.bidPrice)
    expect(m.deal.projectName).toBe(DEFAULT_INPUTS.deal.projectName)
    expect(m.build).toEqual(DEFAULT_INPUTS.build)
  })

  it('keeps arrays only when every element has the default element shape', async () => {
    const { mergeWithDefaults } = await fresh()
    const good = mergeWithDefaults({
      capital: { repayment: [0.5, 0.5] },
      milestones: [{ day: 100, physical: 0.5, financial: 0.5 }],
      operations: { resurfacingYears: [7, 13] },
    })
    expect(good.capital.repayment).toEqual([0.5, 0.5])
    expect(good.milestones).toEqual([{ day: 100, physical: 0.5, financial: 0.5 }])
    expect(good.operations.resurfacingYears).toEqual([7, 13])

    const bad = mergeWithDefaults({
      capital: { repayment: [0.5, 'x'] },
      milestones: [{ day: 'soon', physical: 0.5, financial: 0.5 }],
      support: { tranches: [{ progress: 0.5 }] },
      income: { installments: 'all' },
    })
    expect(bad.capital.repayment).toEqual(DEFAULT_INPUTS.capital.repayment)
    expect(bad.milestones).toEqual(DEFAULT_INPUTS.milestones)
    expect(bad.support.tranches).toEqual(DEFAULT_INPUTS.support.tranches)
    expect(bad.income.installments).toEqual(DEFAULT_INPUTS.income.installments)
  })
})

describe('mergeWithDefaults: dates, selects and fixed values', () => {
  it('replaces invalid ISO dates with the default (round-trip check)', async () => {
    const { mergeWithDefaults } = await fresh()
    for (const bad of ['abc', '', '2026-02-30', '2026-7-8', '2026-07-08T00:00'])
      expect(mergeWithDefaults({ deal: { bidDate: bad } }).deal.bidDate, bad).toBe(DEFAULT_INPUTS.deal.bidDate)
    expect(mergeWithDefaults({ income: { rateQuoteDate: 'soon' } }).income.rateQuoteDate).toBe(DEFAULT_INPUTS.income.rateQuoteDate)
    expect(mergeWithDefaults({ deal: { bidDate: '2026-08-01' } }).deal.bidDate).toBe('2026-08-01')
  })
  it('replaces select values outside the allowed options with the default', async () => {
    const { mergeWithDefaults } = await fresh()
    const m = mergeWithDefaults({ deal: { pavement: 'gravel' }, build: { phasing: 'random' } })
    expect(m.deal.pavement).toBe(DEFAULT_INPUTS.deal.pavement)
    expect(m.build.phasing).toBe(DEFAULT_INPUTS.build.phasing)
    expect(mergeWithDefaults({ build: { phasing: 'sCurve' } }).build.phasing).toBe('sCurve')
  })
  it('forces Operate Years to 15', async () => {
    const { mergeWithDefaults } = await fresh()
    expect(mergeWithDefaults({ deal: { operateYears: 20 } }).deal.operateYears).toBe(15)
  })
})

describe('store', () => {
  it('starts with one Base case scenario that is active and base', async () => {
    const { useStore } = await fresh()
    const s = useStore.getState()
    expect(s.scenarios).toHaveLength(1)
    expect(s.scenarios[0].name).toBe('Base case')
    expect(s.scenarios[0].inputs).toEqual(DEFAULT_INPUTS)
    expect(s.activeId).toBe(s.scenarios[0].id)
    expect(s.baseId).toBe(s.activeId)
    expect(s.compareId).toBeNull()
  })

  it('initialises and still works in memory when cookies and localStorage throw', async () => {
    const boom = () => { throw new Error('denied') }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!
    Object.defineProperty(document, 'cookie', { configurable: true, get: boom, set: boom })
    try {
      const { useStore } = await fresh()
      expect(useStore.getState().scenarios).toHaveLength(1)
      useStore.getState().setInput('deal.bidPrice', 1999)
      expect(useStore.getState().scenarios[0].inputs.deal.bidPrice).toBe(1999)
    } finally {
      delete (document as unknown as Record<string, unknown>).cookie
      expect(Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')).toEqual(desc)
    }
  })

  it('saves edits to cookies and a reload (fresh module) restores them', async () => {
    const a = await fresh()
    a.useStore.getState().setInput('deal.bidPrice', 2345)
    const id = a.useStore.getState().createScenario('Second')
    a.useStore.getState().setActive(id)
    expect(cookies.get(KEY)).not.toBeNull()
    const b = await fresh()
    const s = b.useStore.getState()
    expect(s.scenarios).toHaveLength(2)
    expect(s.scenarios[0].inputs.deal.bidPrice).toBe(2345)
    expect(s.activeId).toBe(id)
  })

  it('stores only fields that differ from the defaults, so the cookie stays small', async () => {
    const { useStore } = await fresh()
    useStore.getState().setInput('deal.bidPrice', 2345)
    useStore.getState().setInput('capital.repayment.0', 0.02)
    const saved = JSON.parse(cookies.get(KEY)!).state.projects[0].scenarios[0].inputs
    expect(saved).toEqual({ deal: { bidPrice: 2345 }, capital: { repayment: [0.02, ...DEFAULT_INPUTS.capital.repayment.slice(1)] } })
  })

  it('migrates scenarios saved by the old localStorage version into cookies', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      state: { scenarios: [{ id: 'old', name: 'Old save', inputs: { deal: { bidPrice: 2111 } }, updatedAt: 1 }],
        activeId: 'old', baseId: 'old', compareId: null },
      version: 1,
    }))
    const { useStore } = await fresh()
    expect(useStore.getState().scenarios[0].inputs.deal.bidPrice).toBe(2111)
    useStore.getState().setInput('deal.lengthKm', 40)
    expect(JSON.parse(cookies.get(KEY)!).state.projects[0].scenarios[0].inputs.deal).toEqual({ bidPrice: 2111, lengthKm: 40 })
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('rehydrates persisted scenarios through mergeWithDefaults', async () => {
    cookies.set(KEY, JSON.stringify({
      state: { scenarios: [{ id: 'a', name: 'Saved', inputs: { deal: { bidPrice: 2100 }, junk: true }, updatedAt: 1 }],
        activeId: 'a', baseId: 'a', compareId: null },
      version: 1,
    }))
    const { useStore } = await fresh()
    const s = useStore.getState()
    expect(s.scenarios[0].name).toBe('Saved')
    expect(s.scenarios[0].inputs.deal.bidPrice).toBe(2100)
    expect(s.scenarios[0].inputs.build).toEqual(DEFAULT_INPUTS.build)
    expect('junk' in s.scenarios[0].inputs).toBe(false)
  })

  it('falls back to a fresh Base case when persisted state is garbage', async () => {
    cookies.set(KEY, '{"state":{"scenarios":"nope"},"version":1}')
    const { useStore } = await fresh()
    const s = useStore.getState()
    expect(s.scenarios).toHaveLength(1)
    expect(s.scenarios[0].inputs).toEqual(DEFAULT_INPUTS)
    expect(s.activeId).toBe(s.scenarios[0].id)
  })

  it('setInput edits the active scenario and resetField restores the base value', async () => {
    const { useStore } = await fresh()
    const st = useStore.getState
    const baseId = st().baseId
    const id = st().createScenario('Aggressive')
    st().setActive(id)
    st().setInput('deal.bidPrice', 2000)
    st().setInput('capital.repayment.0', 0.02)
    const active = st().scenarios.find(s => s.id === id)!
    const base = st().scenarios.find(s => s.id === baseId)!
    expect(active.inputs.deal.bidPrice).toBe(2000)
    expect(active.inputs.capital.repayment[0]).toBe(0.02)
    expect(base.inputs.deal.bidPrice).toBe(DEFAULT_INPUTS.deal.bidPrice)
    st().resetField('deal.bidPrice')
    expect(st().scenarios.find(s => s.id === id)!.inputs.deal.bidPrice).toBe(DEFAULT_INPUTS.deal.bidPrice)
  })

  it('resetField uses the base value, or the default when editing the base scenario itself', async () => {
    const { useStore } = await fresh()
    const st = useStore.getState
    st().setInput('deal.bidPrice', 2100) // editing the base scenario
    st().resetField('deal.bidPrice')
    expect(st().scenarios.find(s => s.id === st().baseId)!.inputs.deal.bidPrice).toBe(DEFAULT_INPUTS.deal.bidPrice)
    st().setInput('deal.bidPrice', 2100)
    const id = st().createScenario('Copy') // copy starts at 2100; the base is now 2100
    st().setActive(id)
    st().setInput('deal.bidPrice', 1900)
    st().resetField('deal.bidPrice')
    expect(st().scenarios.find(s => s.id === id)!.inputs.deal.bidPrice).toBe(2100)
  })

  it('creates from the active scenario, renames, compares and deletes', async () => {
    const { useStore } = await fresh()
    const st = useStore.getState
    const baseId = st().baseId
    st().setInput('deal.bidPrice', 2100)
    const id = st().createScenario('Copy')
    expect(st().scenarios.find(s => s.id === id)!.inputs.deal.bidPrice).toBe(2100)
    st().renameScenario(id, 'Renamed')
    expect(st().scenarios.find(s => s.id === id)!.name).toBe('Renamed')
    st().setActive(id)
    st().setCompare(id)
    st().deleteScenario(id)
    expect(st().scenarios).toHaveLength(1)
    expect(st().activeId).toBe(baseId)
    expect(st().compareId).toBeNull()
    st().deleteScenario(baseId) // never delete the last scenario
    expect(st().scenarios).toHaveLength(1)
  })

  it('importScenario rejects bad JSON and imports a scenario or raw inputs', async () => {
    const { useStore } = await fresh()
    const st = useStore.getState
    expect(st().importScenario('{bad').ok).toBe(false)
    expect(st().importScenario('"just a string"').ok).toBe(false)
    expect(st().scenarios).toHaveLength(1)
    expect(st().importScenario(JSON.stringify({ name: 'Imported', inputs: { deal: { bidPrice: 2300 } } }))).toEqual({ ok: true })
    const imp = st().scenarios.find(s => s.name === 'Imported')!
    expect(imp.inputs.deal.bidPrice).toBe(2300)
    expect(st().activeId).toBe(imp.id)
    expect(st().importScenario(JSON.stringify({ deal: { bidPrice: 2400 } })).ok).toBe(true)
    expect(st().scenarios).toHaveLength(3)
  })

  it('importScenario rejects objects with no known Inputs key, and takes a scenario name', async () => {
    const { useStore } = await fresh()
    const st = useStore.getState
    const bad = st().importScenario(JSON.stringify({ hello: 'world', inputs: 3 }))
    expect(bad.ok).toBe(false)
    expect(bad.error).toMatch(/scenario/i)
    expect(st().importScenario(JSON.stringify({ name: 'Wrapped', inputs: { foo: 1 } })).ok).toBe(false)
    expect(st().importScenario('[]').ok).toBe(false)
    expect(st().scenarios).toHaveLength(1)
    expect(st().importScenario(JSON.stringify({ name: 'Tax only', inputs: { tax: { baseRate: 0.3 } } })).ok).toBe(true)
    expect(st().scenarios.find(s => s.id === st().activeId)!.name).toBe('Tax only')
    expect(st().importScenario(JSON.stringify({ targets: { equityIrrHurdle: 0.16 } })).ok).toBe(true)
    expect(st().scenarios.find(s => s.id === st().activeId)!.name).toBe('Imported scenario')
  })

  it('setBase makes an existing scenario the base and ignores unknown ids', async () => {
    const { useStore } = await fresh()
    const st = useStore.getState
    const first = st().baseId
    const id = st().createScenario('Alt')
    st().setBase(id)
    expect(st().baseId).toBe(id)
    st().setBase('nope')
    expect(st().baseId).toBe(id)
    st().deleteScenario(id)
    expect(st().baseId).toBe(first)
  })

  it('resetActive resets only the active scenario to its reference and keeps the others', async () => {
    const { useStore } = await fresh()
    const st = useStore.getState
    const baseId = st().baseId
    st().setInput('deal.bidPrice', 2100) // base differs from defaults
    const other = st().createScenario('Other')
    st().setActive(other)
    st().setInput('deal.bidPrice', 1900)
    const broken = st().createScenario('Broken')
    st().setActive(broken)
    st().setInput('deal.buildDays', -30)
    st().resetActive()
    expect(st().scenarios).toHaveLength(3)
    expect(st().activeId).toBe(broken)
    expect(st().scenarios.find(s => s.id === broken)!.inputs).toEqual(st().scenarios.find(s => s.id === baseId)!.inputs)
    expect(st().scenarios.find(s => s.id === other)!.inputs.deal.bidPrice).toBe(1900)
    st().setActive(baseId)
    st().resetActive() // the base itself resets to the defaults
    expect(st().scenarios.find(s => s.id === baseId)!.inputs).toEqual(DEFAULT_INPUTS)
    expect(st().scenarios).toHaveLength(3)
  })

  it('resetAll starts over with a single Base case', async () => {
    const { useStore } = await fresh()
    const st = useStore.getState
    st().setActive(st().createScenario('Extra'))
    st().resetAll()
    expect(st().scenarios).toHaveLength(1)
    expect(st().scenarios[0].inputs).toEqual(DEFAULT_INPUTS)
    expect(st().activeId).toBe(st().scenarios[0].id)
  })

  it('v2 blank project migrates to v3 keeping its empty paths and marking the new blank fields empty', async () => {
    const { BLANK_EMPTY, encodeEmpty } = await import('./projects')
    const old = BLANK_EMPTY.filter(p => !p.startsWith('build.manualPhasing') && !p.startsWith('build.spvManpower'))
    const keep = old.filter(p => p !== 'deal.bidPrice') // bid price was filled in
    cookies.set(KEY, JSON.stringify({ state: { projectId: 'b', projects: [{ id: 'b', template: 'blank', baseId: 's', activeId: 's',
      scenarios: [{ id: 's', name: 'Base case', updatedAt: 1, inputs: { deal: { bidPrice: 2000 } }, empty: encodeEmpty(keep) }] }] }, version: 2 }))
    const { useStore } = await fresh()
    const sc = useStore.getState().scenarios[0]
    expect(sc.inputs.deal.bidPrice).toBe(2000)
    expect(sc.empty).not.toContain('deal.bidPrice')
    for (const p of keep) expect(sc.empty).toContain(p)
    expect(sc.empty).toContain('build.spvManpower')
    expect(sc.empty).toContain('build.manualPhasing.35')
    expect(sc.inputs.build.spvManpower).toBe(0) // neutral, not the demo 1.5
  })

  it('a new blank project has the V16 blank fields empty and the policy fields pre-filled', async () => {
    const { useStore } = await fresh()
    useStore.getState().createProject('blank')
    const s = useStore.getState(), sc = s.scenarios.find(x => x.id === s.activeId)!
    expect(sc.empty).toContain('build.spvManpower')
    expect(sc.empty).toContain('build.manualPhasing.0')
    for (const p of ['stl.pctOfBid', 'funds.fdRate', 'csr.on', 'csr.rate', 'tax.depLifeYears', 'indexation.pim', 'build.flcAnnual', 'build.patrolRentalPerMonth'])
      expect(sc.empty, p).not.toContain(p)
    expect(sc.inputs.stl.pctOfBid).toBe(0.1)
    expect(sc.inputs.indexation.pim).toBe(0.04)
  })
})

