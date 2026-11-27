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
      'operations.resurfacingYears.1', 'income.bankRates.4', 'build.manualPhasing.0', 'build.epcFixed']) expect(sc.empty).toContain(p)
    for (const p of sc.empty) {
      const v = getAt(sc.inputs, p)
      expect(v === 0 || v === '', p).toBe(true)
    }
    // hidden inputs the engine no longer reads are never required
    for (const p of ['income.spread', 'income.installments.0', 'support.tranches.0.progress', 'tax.baseRate', 'deal.pavement', 'deal.operateYears',
      'indexation.wpi', 'indexation.cpi', 'build.patrolRental', 'build.financeLegal'])
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

  it('migrates v3 saves: blank empty ranges decode with the v3 index, hidden fields drop out, S-curve becomes Schedule G', async () => {
    const { BLANK_EMPTY, BLANK_EMPTY_V3 } = await import('./projects')
    const was = ['deal.bidPrice', 'build.patrolRental', 'build.contingency', 'indexation.wpi', 'operations.routine', 'build.spvManpower']
    const v3 = was.map(p => BLANK_EMPTY_V3.indexOf(p))
    expect(v3.every(n => n >= 0)).toBe(true)
    expect(BLANK_EMPTY_V3.length - BLANK_EMPTY.length).toBe(4) // patrol rental, build finance & legal, WPI, CPI
    const inputs = { ...DEFAULT_INPUTS, build: { ...DEFAULT_INPUTS.build, phasing: 'sCurve' } }
    cookies.set(KEY, JSON.stringify({ state: { projectId: 'b', projects: [
      { id: 'b', template: 'blank', activeId: 's', baseId: 's', compareId: null, createdAt: 1,
        scenarios: [{ id: 's', name: 'Base case', updatedAt: 1, inputs, empty: v3.join(',') }] },
      { id: 'p', template: 'sample', activeId: 't', baseId: 't', compareId: null, createdAt: 1,
        scenarios: [{ id: 't', name: 'Base case', updatedAt: 1, inputs: { build: { phasing: 'sCurve' } }, empty: '' }] },
    ] }, version: 3 }))
    const m = await fresh()
    expect(act(m).empty).toEqual(['deal.bidPrice', 'build.contingency', 'operations.routine', 'build.spvManpower'])
    expect(act(m).inputs.build.phasing).toBe('scheduleG')
    m.useStore.getState().setProject('p')
    expect(act(m).inputs.build.phasing).toBe('scheduleG')
    expect(act(m).inputs.build.manualPhasing).toEqual(DEFAULT_INPUTS.build.manualPhasing)
    // and an exported scenario from before the rename imports as Schedule G
    expect(m.useStore.getState().importScenario(JSON.stringify({ name: 'Old', inputs }))).toEqual({ ok: true })
    expect(act(m).inputs.build.phasing).toBe('scheduleG')
  })

  it('a fresh blank project does not run the engine and has the new policy fields pre-filled', async () => {
    const m = await fresh()
    m.useStore.getState().createProject('blank')
    const { resultFor } = await import('./useModel')
    expect(resultFor(act(m))).toBeNull()
    const i = act(m).inputs
    expect([i.stl.pctOfBid, i.funds.fdRate, i.funds.mmrShare, i.funds.mmrYears, i.csr.on, i.tax.depLifeYears, i.indexation.pim])
      .toEqual([0.1, 0.055, 0.2, 5, true, 15, 0.04])
    expect(act(m).empty).toContain('build.manualPhasing.0')
  })

  it('on rehydrate drops unknown empty paths, and a blank leaf that is missing or wrong-typed becomes empty', async () => {
    const inputs = structuredClone(DEFAULT_INPUTS) as unknown as { deal: Record<string, unknown> }
    delete inputs.deal.authorityEstimate // missing
    inputs.deal.lengthKm = 'long' // wrong type
    cookies.set(KEY, JSON.stringify({
      state: { projectId: 'p', projects: [{ id: 'p', template: 'blank', activeId: 's', baseId: 's', compareId: null, createdAt: 1,
        scenarios: [{ id: 's', name: 'Base case', updatedAt: 1, inputs, empty: ['deal.bidPrice', 'nope', 'income.spread', 7] }] }] },
      version: 2,
    }))
    const { V3_BLANK_PATHS } = await import('./projects')
    const m = await fresh()
    // v2 save: the v3 blank fields (manual phasing, SPV manpower) are empty too
    expect(act(m).empty).toEqual(['deal.bidPrice', 'deal.authorityEstimate', 'deal.lengthKm', ...V3_BLANK_PATHS])
    expect(act(m).inputs.deal.bidPrice).toBe(0)
    expect(act(m).inputs.deal.lengthKm).toBe(0)
    expect(act(m).inputs.deal.buildDays).toBe(DEFAULT_INPUTS.deal.buildDays)
    // a save with almost nothing in it: every unsaved blank leaf is empty, never a computed 0
    cookies.set(KEY, JSON.stringify({ state: { projectId: 'q', projects: [{ id: 'q', template: 'blank', activeId: 's', baseId: 's',
      compareId: null, createdAt: 1, scenarios: [{ id: 's', name: 'Base case', updatedAt: 1, inputs: { deal: { bidPrice: 999 } }, empty: '' }] }] },
    version: 2 }))
    const { BLANK_EMPTY } = await import('./projects')
    const n = await fresh()
    expect(act(n).empty).toEqual(BLANK_EMPTY.filter(x => x !== 'deal.bidPrice'))
    expect(act(n).inputs.deal.bidPrice).toBe(999)
  })

  it('saves empty fields compactly: ten fresh blank projects and the sample stay under 4 KB', async () => {
    const m = await fresh()
    for (let k = 0; k < 10; k++) m.useStore.getState().createProject('blank')
    const saved = cookies.get(KEY)!
    expect(JSON.parse(saved).state.projects[1].scenarios[0].empty).toBe('0-113')
    const { encodeCookie } = await import('../lib/cookies')
    expect(encodeCookie(saved).length).toBeLessThan(4096)
    const b = await fresh()
    expect(b.useStore.getState().projects).toHaveLength(11)
    expect(act(b).empty).toHaveLength(114)
  })

  it('warns once, suggesting Export, when the saved state grows past about 12 KB', async () => {
    const m = await fresh()
    const { toast } = await import('sonner') // the same module instance the fresh store uses
    const warn = vi.spyOn(toast, 'warning')
    m.useStore.getState().setInput('deal.projectName', 'x'.repeat(13000))
    m.useStore.getState().setInput('deal.authorityName', 'y'.repeat(13000))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/Export/)
  })

  it("clearing a blank project's text field makes it empty again", async () => {
    const m = await fresh()
    const st = m.useStore.getState
    st().createProject('blank')
    st().setInput('deal.projectName', 'Ring Road')
    expect(act(m).empty).not.toContain('deal.projectName')
    st().setInput('deal.projectName', '')
    expect(act(m).empty).toContain('deal.projectName')
    st().setProject(st().projects[0].id) // in the sample project '' is a value (Health flags it), not empty
    st().setInput('deal.projectName', '')
    expect(act(m).empty).toEqual([])
  })

  it('a duplicate is independent of its source', async () => {
    const m = await fresh()
    const st = m.useStore.getState
    const src = st().createProject('blank')
    st().setInput('deal.bidPrice', 1000)
    const srcIds = st().scenarios.map(s => s.id)
    const dup = st().createProject('duplicate')
    expect(st().scenarios.map(s => s.id).some(id => srcIds.includes(id))).toBe(false)
    st().setInput('deal.bidPrice', 2000)
    st().setInput('deal.lengthKm', 12)
    st().createScenario('Only in the copy')
    st().setProject(src)
    expect(act(m).inputs.deal.bidPrice).toBe(1000)
    expect(act(m).empty).toContain('deal.lengthKm')
    expect(st().scenarios).toHaveLength(1)
    st().setProject(dup)
    expect(act(m).inputs.deal.bidPrice).toBe(2000)
    expect(st().scenarios).toHaveLength(2)
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
