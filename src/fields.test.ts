import { describe, it, expect } from 'vitest'
import { DEFAULT_INPUTS } from './engine/defaults'
import { FIELDS, fieldById } from './fields'
import { V16_SAMPLE } from './engine/v16/sample'
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
  it('field order is fixed: saved blank-project data encodes empty fields by FIELDS index', () => {
    expect(FIELDS.map(x => x.id)).toEqual(['deal.projectName', 'deal.authorityName', 'deal.bidPrice', 'deal.authorityEstimate', 'deal.lengthKm', 'deal.bidDate', 'deal.daysToAward', 'deal.daysToAgreement', 'deal.daysToStart', 'deal.buildDays', 'deal.operateYears', 'deal.pavement', 'milestones', 'build.epcFixed', 'build.gstWorks', 'build.gstServices', 'build.ieFeePctOfBid', 'build.adminPctOfEpc', 'build.fundRaisingPctOfDebt', 'build.financeLegal', 'build.contingency', 'build.preBid', 'build.preBidMiscPct', 'build.spvFormationPctOfShareCapital', 'build.patrolCapital', 'build.patrolRental', 'build.perfSecurityPctOfBid', 'build.perfSecurityCommissionPa', 'build.phasing', 'support.pctOfBid', 'support.tranches', 'capital.equityPct', 'capital.upfrontEquityPct', 'capital.shareCapitalPct', 'capital.buildRate', 'capital.operateRate', 'capital.repayment', 'capital.maxLeverage', 'capital.dscrWarn', 'income.completionPctOfBid', 'income.installments', 'income.firstPaymentLagDays', 'income.bankRates', 'income.spread', 'income.rateQuoteDate', 'income.maxQuoteAgeMonths', 'income.omBaseRate', 'income.omResurfacingRate', 'income.omPreResurfacingFlexible', 'income.omPreResurfacingPerpetual', 'indexation.wpi', 'indexation.cpi', 'indexation.wpiWeight', 'operations.routine', 'operations.electricity', 'operations.financeLegal', 'operations.staff', 'operations.patrolRunning', 'operations.ieFee', 'operations.insuranceBaseRate', 'operations.insuranceLoading', 'operations.majorMaintenance', 'operations.resurfacingYears', 'operations.inflation.maintenance', 'operations.inflation.staff', 'operations.inflation.electricity', 'operations.inflation.insurance', 'tax.baseRate', 'tax.surcharge', 'tax.cess', 'targets.equityIrrHurdle', 'support.lagDays', 'stl.pctOfBid', 'funds.fdRate', 'funds.ffeDays', 'funds.mmrShare', 'funds.mmrYears', 'funds.dsrInterestMonths', 'csr.on', 'csr.rate', 'tax.depLifeYears', 'build.manualPhasing', 'build.spvManpower', 'indexation.pim', 'build.patrolRentalPerMonth', 'build.flcOneOff', 'build.flcAnnual', 'stl.option', 'stl.repayShare', 'stl.repayMilestones', 'funds.dsrPrincipalInstalments', 'csr.netWorth', 'csr.turnover', 'csr.profit'])
  })
  it('section/group layout is exactly as specified', () => {
    const pairs = [...new Set(FIELDS.map(x => x.section + '/' + x.group))].sort()
    expect(pairs).toEqual([
      'build/Hard costs', 'build/Soft costs', 'phasing/Build Milestones', 'phasing/Phasing',
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
  it('V16 inputs: 36-month manual phasing totals 100%, sample selects it, derived-cost rates match V16', () => {
    const m = DEFAULT_INPUTS.build.manualPhasing
    expect(m).toHaveLength(36)
    expect(sum(m)).toBeCloseTo(1, 12)
    expect(V16_SAMPLE.build.phasing).toBe('manual')
    expect(V16_SAMPLE.build.preBid).toBe(0.290409)
    expect(DEFAULT_INPUTS.build.patrolRentalPerMonth * 12 * 1095 / 365).toBeCloseTo(DEFAULT_INPUTS.build.patrolRental, 12)
    expect(DEFAULT_INPUTS.build.flcOneOff + 3 * DEFAULT_INPUTS.build.flcAnnual + 0.41 + 0.08).toBeCloseTo(DEFAULT_INPUTS.build.financeLegal, 12)
    expect(fieldById('build.phasing')?.options?.map(o => o.value)).toEqual(['manual', 'equated', 'sCurve'])
  })
})
