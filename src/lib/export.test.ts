import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_INPUTS } from '../engine/defaults'
import { runModel } from '../engine/model'
import { setAt } from './path'
import { useStore } from '../state/store'
import { exportScenarioJson, exportSchedulesCsv, toCsv } from './export'

beforeEach(() => useStore.setState(useStore.getInitialState(), true))

describe('exportSchedulesCsv', () => {
  it('has a header and one row per build month and ops period, with ISO dates and a phase', () => {
    const r = runModel(DEFAULT_INPUTS)
    const lines = exportSchedulesCsv(r).trim().split('\n')
    const header = lines[0].split(',')
    expect(header.slice(0, 2)).toEqual(['phase', 'date'])
    expect(lines).toHaveLength(1 + r.build.months.length + r.ops.length)
    const rows = lines.slice(1).map(l => l.split(','))
    expect(rows.every(c => c.length === header.length)).toBe(true)
    expect(rows[0][0]).toBe('build')
    expect(rows[rows.length - 1][0]).toBe('operate')
    expect(rows.every(c => /^\d{4}-\d{2}-\d{2}$/.test(c[1]))).toBe(true)
  })
})

describe('toCsv', () => {
  it('quotes commas and quotes, and trims float residue', () => {
    expect(toCsv(['a', 'b'], [['x,y', 0.1 + 0.2], ['say "hi"', '']])).toBe('a,b\n"x,y",0.3\n"say ""hi""",')
  })
})

describe('exportScenarioJson', () => {
  it('round-trips through importScenario to equal inputs and name', () => {
    const inputs = setAt(setAt(DEFAULT_INPUTS, 'deal.bidPrice', 2345.67), 'capital.repayment.0', 0.05)
    const json = exportScenarioJson({ id: 'x', name: 'Stretch', inputs, updatedAt: 0 })
    expect(JSON.parse(json)).toEqual({ name: 'Stretch', inputs })
    expect(useStore.getState().importScenario(json)).toEqual({ ok: true })
    const s = useStore.getState().scenarios.find(x => x.id === useStore.getState().activeId)!
    expect(s.name).toBe('Stretch')
    expect(s.inputs).toEqual(inputs)
  })
})
