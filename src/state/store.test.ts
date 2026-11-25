import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_INPUTS } from '../engine/defaults'

const fresh = async () => {
  vi.resetModules()
  return import('./store')
}

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
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

  it('initialises and still works in memory when localStorage throws', async () => {
    const boom = () => { throw new Error('denied') }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)
    const { useStore } = await fresh()
    expect(useStore.getState().scenarios).toHaveLength(1)
    useStore.getState().setInput('deal.bidPrice', 1999)
    expect(useStore.getState().scenarios[0].inputs.deal.bidPrice).toBe(1999)
  })

  it('rehydrates persisted scenarios through mergeWithDefaults', async () => {
    localStorage.setItem('milestone.scenarios.v1', JSON.stringify({
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
    localStorage.setItem('milestone.scenarios.v1', '{"state":{"scenarios":"nope"},"version":1}')
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
})
