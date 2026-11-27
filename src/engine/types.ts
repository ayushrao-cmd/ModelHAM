// All money in ₹ Cr, rates as fractions. No React/DOM imports.
export type SectionId = 'overview'|'deal'|'build'|'phasing'|'capital'|'income'|'operations'|'returns'|'statements'|'health'|'scenarios'
export type Pavement = 'flexible'|'flexiblePerpetual'
export interface Inputs {
  deal: { projectName: string; authorityName: string; bidPrice: number; authorityEstimate: number; lengthKm: number;
          bidDate: string; daysToAward: number; daysToAgreement: number; daysToStart: number; buildDays: number;
          operateYears: number; pavement: Pavement }
  milestones: { day: number; physical: number; financial: number }[]
  build: { epcFixed: number; gstWorks: number; gstServices: number; ieFeePctOfBid: number; adminPctOfEpc: number;
           fundRaisingPctOfDebt: number; financeLegal: number; contingency: number; preBid: number; preBidMiscPct: number;
           spvFormationPctOfShareCapital: number; patrolCapital: number; patrolRental: number;
           perfSecurityPctOfBid: number; perfSecurityCommissionPa: number; phasing: 'manual'|'equated'|'sCurve';
           /** V16 manual EPC phasing, share per construction month (36 values; month 37 gets 0). */
           manualPhasing: number[]; spvManpower: number;
           /** V16 derives these from build days: patrol rental = rate x 12 x buildDays/365; finance & legal = one-off +
            *  annual x count of 31-March month-ends in construction. */
           patrolRentalPerMonth: number; flcOneOff: number; flcAnnual: number }
  stl: { pctOfBid: number; option: 'STL'; repayShare: number; repayMilestones: number }
  funds: { fdRate: number; ffeDays: number; mmrShare: number; mmrYears: number; dsrInterestMonths: number; dsrPrincipalInstalments: number }
  csr: { on: boolean; rate: number; netWorth: number; turnover: number; profit: number }
  support: { pctOfBid: number; tranches: { progress: number; shareOfBid: number }[]; lagDays: number }
  capital: { equityPct: number; upfrontEquityPct: number; shareCapitalPct: number; buildRate: number; operateRate: number;
             repayment: number[]; maxLeverage: number; dscrWarn: number }
  income: { completionPctOfBid: number; installments: number[]; firstPaymentLagDays: number; bankRates: number[];
            spread: number; rateQuoteDate: string; maxQuoteAgeMonths: number; omBaseRate: number; omResurfacingRate: number;
            omPreResurfacingFlexible: number; omPreResurfacingPerpetual: number }
  indexation: { wpi: number; cpi: number; wpiWeight: number; pim: number }
  operations: { routine: number; electricity: number; financeLegal: number; staff: number; patrolRunning: number; ieFee: number;
                insuranceBaseRate: number; insuranceLoading: number; majorMaintenance: number; resurfacingYears: [number, number];
                inflation: { maintenance: number; staff: number; electricity: number; insurance: number } }
  tax: { baseRate: number; surcharge: number; cess: number; depLifeYears: number }
  targets: { equityIrrHurdle: number }
}
export interface FieldDef { id: string; label: string; section: SectionId;
  group: string; kind: 'money'|'percent'|'days'|'years'|'number'|'date'|'text'|'select'|'toggle'|'percentList'|'milestoneList'|'trancheList'; min?: number; max?: number;
  step?: number; help?: string; options?: { value: string; label: string }[]; key?: boolean; readOnly?: boolean
  /** Pre-filled in a blank project: an HAM concession standard (MCA) or a statutory/policy value. Unset = project data, starts empty. */
  prefill?: 'standard' | 'policy'
  /** Display right after this field id in its group (FIELDS order itself is pinned). */
  after?: string }
