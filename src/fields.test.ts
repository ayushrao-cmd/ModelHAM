import { describe, it, expect } from 'vitest'
import { DEFAULT_INPUTS } from './engine/defaults'
import { FIELDS, fieldById } from './fields'
import { getAt, setAt } from './lib/path'

function leaves(o: object, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v !== null && typeof v === 'object' && !Array.isArray(v) ? leaves(v, `${prefix}${k}.`) : [`${prefix}${k}`])
}
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

describe('field registry', () => {
  it('every leaf path of DEFAULT_INPUTS has exactly one FieldDef', () => {
    for (const p of leaves(DEFAULT_INPUTS)) expect(FIELDS.filter(f => f.id === p), p).toHaveLength(1)
    expect(FIELDS).toHaveLength(leaves(DEFAULT_INPUTS).length)
  })
  it('every FieldDef id resolves via getAt to a defined value', () => {
    for (const f of FIELDS) expect(getAt(DEFAULT_INPUTS, f.id), f.id).toBeDefined()
    expect(fieldById('deal.bidPrice')?.label).toBe('Bid Price')
  })
  it('repayment and installments sum to 1', () => {
    expect(sum(DEFAULT_INPUTS.capital.repayment)).toBeCloseTo(1, 10)
    expect(sum(DEFAULT_INPUTS.income.installments)).toBeCloseTo(1, 10)
    expect(DEFAULT_INPUTS.income.installments).toHaveLength(30)
  })
  it('setAt is immutable', () => {
    const next = setAt(DEFAULT_INPUTS, 'deal.bidPrice', 1)
    expect(next.deal.bidPrice).toBe(1)
    expect(DEFAULT_INPUTS.deal.bidPrice).toBe(2250)
    expect(next.build).toBe(DEFAULT_INPUTS.build)
  })
  it('setAt keeps arrays as arrays and does not mutate', () => {
    const r = setAt(DEFAULT_INPUTS, 'capital.repayment.0', 0.02)
    expect(Array.isArray(r.capital.repayment)).toBe(true)
    expect(r.capital.repayment).toHaveLength(25)
    expect(r.capital.repayment[0]).toBe(0.02)
    expect(DEFAULT_INPUTS.capital.repayment[0]).toBe(0.015)
    const m = setAt(DEFAULT_INPUTS, 'milestones.1.day', 500)
    expect(Array.isArray(m.milestones)).toBe(true)
    expect(m.milestones[1].day).toBe(500)
    expect(DEFAULT_INPUTS.milestones[1].day).toBe(548)
  })
  it('section/group layout is exactly as specified', () => {
    const pairs = [...new Set(FIELDS.map(x => x.section + '/' + x.group))].sort()
    expect(pairs).toEqual([
      'build/Build Milestones', 'build/Hard costs', 'build/Phasing', 'build/Soft costs',
      'capital/Loan terms', 'capital/Repayment', 'capital/Structure',
      'deal/Bid', 'deal/Dates', 'deal/Project',
      'income/Annuity Rate', 'income/Completion Payments', 'income/Indexation', 'income/O&M Payments',
      'operations/Inflation', 'operations/Insurance', 'operations/Maintenance', 'operations/Running costs', 'operations/Tax',
      'returns/Targets',
    ].sort())
    expect(fieldById('support.pctOfBid')?.section).toBe('capital')
    expect(fieldById('milestones')?.kind).toBe('milestoneList')
    expect(fieldById('support.tranches')?.kind).toBe('trancheList')
  })
})
