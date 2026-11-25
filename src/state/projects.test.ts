import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_INPUTS } from '../engine/defaults'
import { cookies } from '../lib/cookies'
import { getAt } from '../lib/path'

const KEY = 'milestone.scenarios.v1'
const clearCookies = () => {
  for (const n of document.cookie.split('; ').filter(Boolean).map(c => c.split('=')[0])) document.cookie = `${n}=; path=/; max-age=0`
}
const fresh = async () => { vi.resetModules(); return import('./store') }
type Mod = Awaited<ReturnType<typeof fresh>>
const act = (m: Mod) => { const s = m.useStore.getState(); return s.scenarios.find(x => x.id === s.activeId)! }

beforeEach(() => { localStorage.clear(); clearCookies() })

describe('projects', () => {
  it('starts with one sample project holding the Base case', async () => {
    const { useStore } = await fresh()
    const s = useStore.getState()
    expect(s.projects).toHaveLength(1)
    expect(s.projects[0].template).toBe('sample')
    expect(s.projectId).toBe(s.projects[0].id)
    expect(s.scenarios[0].empty).toEqual([])
  })

  it('a blank project has no demo value in any empty leaf, and keeps standards pre-filled', async () => {
    const m = await fresh()
    const { BLANK_EMPTY } = await import('./projects')
    const id = m.useStore.getState().createProject('blank')
    expect(m.useStore.getState().projectId).toBe(id)
    const sc = act(m)
    expect(sc.empty).toEqual(BLANK_EMPTY)
    for (const p of ['deal.bidPrice', 'deal.projectName', 'deal.bidDate', 'capital.repayment.3', 'milestones.0.day',
      'operations.resurfacingYears.1', 'income.bankRates.4', 'indexation.wpi', 'build.epcFixed']) expect(sc.empty).toContain(p)
    for (const p of sc.empty) {
      const v = getAt(sc.inputs, p)
      expect(v === 0 || v === '', p).toBe(true)
    }
    for (const p of ['income.spread', 'income.installments.0', 'support.tranches.0.progress', 'tax.baseRate', 'deal.pavement', 'deal.operateYears'])
      expect(sc.empty).not.toContain(p)
    expect(sc.inputs.income.installments).toEqual(DEFAULT_INPUTS.income.installments)
    expect(sc.inputs.build.gstWorks).toBe(0.18)
    expect(sc.inputs.deal.bidPrice).toBe(0)
  })

  it('setInput clears the path (and any path under it) from empty; createScenario copies empty', async () => {
    const m = await fresh()
    const st = m.useStore.getState
    st().createProject('blank')
    st().setInput('deal.bidPrice', 1800)
    expect(act(m).empty).not.toContain('deal.bidPrice')
    st().setInput('capital.repayment', new Array(25).fill(0.04))
    expect(act(m).empty.some(p => p.startsWith('capital.repayment'))).toBe(false)
    st().setInput('milestones.0.day', 0) // a zero is a value too
    expect(act(m).empty).not.toContain('milestones.0.day')
    const before = act(m).empty
    const copy = st().createScenario('Copy')
    expect(st().scenarios.find(s => s.id === copy)!.empty).toEqual(before)
  })

  it('reset on a blank base re-empties the field; on a sample base restores the default', async () => {
    const m = await fresh()
    const st = m.useStore.getState
    st().setInput('deal.bidPrice', 2100)
    st().resetField('deal.bidPrice')
    expect(act(m).inputs.deal.bidPrice).toBe(DEFAULT_INPUTS.deal.bidPrice)
    st().createProject('blank')
    st().setInput('deal.bidPrice', 2100)
    st().setInput('income.spread', 0.02)
    st().resetField('deal.bidPrice')
    expect(act(m).empty).toContain('deal.bidPrice')
    expect(act(m).inputs.deal.bidPrice).toBe(0)
    st().resetField('income.spread') // a pre-filled standard resets to the standard
    expect(act(m).inputs.income.spread).toBe(DEFAULT_INPUTS.income.spread)
    st().setInput('deal.lengthKm', 30)
    st().resetActive()
    expect(act(m).empty.length).toBeGreaterThan(50)
    expect(act(m).inputs.deal.lengthKm).toBe(0)
  })

  it('creates, switches, renames and deletes projects; never deletes the last', async () => {
    const m = await fresh()
    const st = m.useStore.getState
    const sample = st().projectId
    st().setInput('deal.bidPrice', 2345)
    const blank = st().createProject('blank')
    expect(st().projects).toHaveLength(2)
    expect(act(m).inputs.deal.bidPrice).toBe(0)
    st().setProject(sample)
    expect(act(m).inputs.deal.bidPrice).toBe(2345)
    st().renameProject(blank, 'NH-44 Pkg 3')
    st().setProject(blank)
    expect(act(m).inputs.deal.projectName).toBe('NH-44 Pkg 3')
    expect(act(m).empty).not.toContain('deal.projectName')
    const dup = st().createProject('duplicate')
    expect(st().projectId).toBe(dup)
    expect(st().projects.find(p => p.id === dup)!.template).toBe('blank')
    expect(act(m).inputs.deal.projectName).toMatch(/^NH-44 Pkg 3/)
    const s2 = st().createProject('sample')
    expect(act(m).inputs).toEqual(DEFAULT_INPUTS)
    st().deleteProject(s2)
    expect(st().projects.map(p => p.id)).toEqual([sample, blank, dup])
    expect(st().projectId).toBe(sample)
    st().deleteProject(blank); st().deleteProject(dup); st().deleteProject(sample)
    expect(st().projects).toHaveLength(1)
    expect(act(m).inputs.deal.bidPrice).toBe(2345)
  })

  it('persists two projects, including a partially filled blank one, and a reload restores both', async () => {
    const a = await fresh()
    const st = a.useStore.getState
    const sample = st().projectId
    st().setInput('deal.bidPrice', 2345)
    const blank = st().createProject('blank')
    st().setInput('deal.bidPrice', 1500)
    st().setInput('deal.bidDate', '2026-09-01')
    st().setInput('operations.inflation.insurance', 0) // equals the neutral value: must stay filled
    const empty = act(a).empty
    const b = await fresh()
    const s = b.useStore.getState()
    expect(s.projects.map(p => p.id)).toEqual([sample, blank])
    expect(s.projectId).toBe(blank)
    expect(act(b).empty).toEqual(empty)
    expect(act(b).empty).not.toContain('operations.inflation.insurance')
    expect(act(b).inputs.deal.bidPrice).toBe(1500)
    expect(act(b).inputs.deal.bidDate).toBe('2026-09-01')
    expect(act(b).inputs.deal.authorityEstimate).toBe(0)
    expect(act(b).inputs.income.rateQuoteDate).toBe('') // empty dates are not replaced by the demo date
    b.useStore.getState().setProject(sample)
    expect(act(b).inputs.deal.bidPrice).toBe(2345)
    expect(act(b).empty).toEqual([])
  })

  it('migrates v1 storage into one sample project', async () => {
    cookies.set(KEY, JSON.stringify({
      state: { scenarios: [{ id: 'a', name: 'Saved', inputs: { deal: { bidPrice: 2100 } }, updatedAt: 1 },
        { id: 'b', name: 'Other', inputs: {}, updatedAt: 1 }], activeId: 'b', baseId: 'a', compareId: null },
      version: 1,
    }))
    const { useStore } = await fresh()
    const s = useStore.getState()
    expect(s.projects).toHaveLength(1)
    expect(s.projects[0].template).toBe('sample')
    expect(s.scenarios.map(x => x.name)).toEqual(['Saved', 'Other'])
    expect(s.activeId).toBe('b')
    expect(s.baseId).toBe('a')
    expect(s.scenarios[0].inputs.deal.bidPrice).toBe(2100)
    expect(s.scenarios[0].empty).toEqual([])
  })

  it('drops unknown empty paths on rehydrate and keeps empty leaves neutral', async () => {
    cookies.set(KEY, JSON.stringify({
      state: { projectId: 'p', projects: [{ id: 'p', template: 'blank', activeId: 's', baseId: 's', compareId: null, createdAt: 1,
        scenarios: [{ id: 's', name: 'Base case', updatedAt: 1, inputs: { deal: { bidPrice: 999 } },
          empty: ['deal.bidPrice', 'nope', 'income.spread', 7] }] }] },
      version: 2,
    }))
    const m = await fresh()
    // the unlisted blank dates ('' in the template) are not valid dates, so they are empty too
    expect(act(m).empty).toEqual(['deal.bidPrice', 'deal.bidDate', 'income.rateQuoteDate'])
    expect(act(m).inputs.deal.bidPrice).toBe(0)
    expect(act(m).inputs.deal.lengthKm).toBe(0) // not listed as empty, so it holds the blank template value
  })

  it('imports a scenario JSON with its empty paths into the active project', async () => {
    const m = await fresh()
    const st = m.useStore.getState
    st().createProject('blank')
    st().setInput('deal.bidPrice', 1700)
    const { exportScenarioJson } = await import('../lib/export')
    const json = exportScenarioJson(act(m))
    expect(JSON.parse(json).empty).toEqual(act(m).empty)
    expect(st().importScenario(json).ok).toBe(true)
    expect(st().scenarios).toHaveLength(2)
    expect(act(m).inputs.deal.bidPrice).toBe(1700)
    expect(act(m).empty).toEqual(st().scenarios[0].empty)
  })
})
