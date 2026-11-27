import type { Inputs } from './types'

// Published completion-payment schedule (percent, 2 dp). Stored as fractions; the published
// figures are rounded to 2 dp; they sum to 100.00 (only float residue), which is added to the last element.
const INSTALLMENT_PCT = [2.10,2.17,2.24,2.31,2.38,2.45,2.52,2.60,2.68,2.76,2.84,2.93,3.02,3.11,3.20,3.30,3.40,3.50,3.61,3.72,3.83,3.94,4.06,4.18,4.25,4.25,4.44,4.71,4.75,4.75]
const installments = INSTALLMENT_PCT.map(p => p / 100)
installments[installments.length - 1] += 1 - installments.reduce((a, b) => a + b, 0)

export const DEFAULT_INPUTS: Inputs = {
  deal: { projectName: 'Sample Greenfield Corridor – Pkg 2', authorityName: 'Authority (demo)', bidPrice: 2250,
    authorityEstimate: 2183.15, lengthKm: 32.955, bidDate: '2026-07-08', daysToAward: 60, daysToAgreement: 45,
    daysToStart: 150, buildDays: 1095, operateYears: 15, pavement: 'flexiblePerpetual' },
  milestones: [
    { day: 274, physical: 0.2, financial: 0.2 }, { day: 548, physical: 0.35, financial: 0.35 },
    { day: 821, physical: 0.75, financial: 0.75 }, { day: 1095, physical: 1, financial: 1 },
  ],
  build: { epcFixed: 1750, gstWorks: 0.18, gstServices: 0.18, ieFeePctOfBid: 0.004, adminPctOfEpc: 0.025,
    fundRaisingPctOfDebt: 0.01, financeLegal: 4.21, contingency: 5, preBid: 0.2904, preBidMiscPct: 1,
    spvFormationPctOfShareCapital: 0.0025, patrolCapital: 1.03, patrolRental: 0.846,
    perfSecurityPctOfBid: 0.05, perfSecurityCommissionPa: 0.015, phasing: 'equated',
    // last entry is V16's own plug (0.009999999999999454) so the row sums to exactly 1
    manualPhasing: [...Array(4).fill(0.02), ...Array(11).fill(0.03), ...Array(9).fill(0.04), 0.03, 0.03, ...Array(7).fill(0.02), 0.01, 0.01, 0.009999999999999454],
    spvManpower: 1.5, patrolRentalPerMonth: 0.0235, flcOneOff: 0.27, flcAnnual: 1.15 },
  stl: { pctOfBid: 0.1, option: 'STL', repayShare: 0.125, repayMilestones: 8 },
  funds: { fdRate: 0.055, ffeDays: 180, mmrShare: 0.2, mmrYears: 5, dsrInterestMonths: 6, dsrPrincipalInstalments: 1 },
  csr: { on: true, rate: 0.02, netWorth: 500, turnover: 1000, profit: 5 },
  support: { pctOfBid: 0.4,
    tranches: [0.05,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9].map(progress => ({ progress, shareOfBid: 0.04 })),
    lagDays: 0 },
  capital: { equityPct: 0.25, upfrontEquityPct: 0.5, shareCapitalPct: 0.25, buildRate: 0.0975, operateRate: 0.095,
    repayment: [0.015,0.015,0.02,0.02,0.03,0.03,0.04,0.04,0.045,0.045,0.045,0.045,0.045,0.045,0.044,0.044,0.044,0.044,0.044,0.044,0.05,0.05,0.055,0.055,0.046],
    maxLeverage: 3, dscrWarn: 1.10 },
  income: { completionPctOfBid: 0.6, installments, firstPaymentLagDays: 180,
    bankRates: [0.087,0.0835,0.0835,0.087,0.0875], spread: 0.0125, rateQuoteDate: '2026-07-01', maxQuoteAgeMonths: 3,
    omBaseRate: 0.004, omResurfacingRate: 0.024, omPreResurfacingFlexible: 0.008, omPreResurfacingPerpetual: 0.006 },
  indexation: { wpi: 0.04, cpi: 0.04, wpiWeight: 0.7, pim: 0.04 },
  operations: { routine: 2.3104, electricity: 1.8705, financeLegal: 1.42, staff: 1.00, patrolRunning: 0.22, ieFee: 1.50,
    insuranceBaseRate: 0.0014, insuranceLoading: 2.15, majorMaintenance: 27.8278, resurfacingYears: [6, 12],
    inflation: { maintenance: 0.045, staff: 0.07, electricity: 0.03, insurance: 0 } },
  tax: { baseRate: 0.22, surcharge: 0.10, cess: 0.04, depLifeYears: 15 },
  targets: { equityIrrHurdle: 0.15 },
}
