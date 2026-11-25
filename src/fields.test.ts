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
})
