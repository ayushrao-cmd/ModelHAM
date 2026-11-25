// All money in ₹ Cr, rates as fractions. No React/DOM imports.
export type SectionId = 'overview'|'deal'|'build'|'capital'|'income'|'operations'|'returns'|'health'|'scenarios'
export type Pavement = 'flexible'|'flexiblePerpetual'
export interface Inputs {
  deal: { projectName: string; authorityName: string; bidPrice: number; authorityEstimate: number; lengthKm: number;
          bidDate: string; daysToAward: number; daysToAgreement: number; daysToStart: number; buildDays: number;
          operateYears: number; pavement: Pavement }
  milestones: { day: number; physical: number; financial: number }[]
  build: { epcFixed: number; gstWorks: number; gstServices: number; ieFeePctOfBid: number; adminPctOfEpc: number;
           fundRaisingPctOfDebt: number; financeLegal: number; contingency: number; preBid: number; preBidMiscPct: number;
           spvFormationPctOfShareCapital: number; patrolCapital: number; patrolRental: number;
           perfSecurityPctOfBid: number; perfSecurityCommissionPa: number; phasing: 'equated'|'sCurve' }
  support: { pctOfBid: number; tranches: { progress: number; shareOfBid: number }[] }
  capital: { equityPct: number; upfrontEquityPct: number; shareCapitalPct: number; buildRate: number; operateRate: number;
             repayment: number[]; maxLeverage: number; dscrWarn: number }
  income: { completionPctOfBid: number; installments: number[]; firstPaymentLagDays: number; bankRates: number[];
            spread: number; rateQuoteDate: string; maxQuoteAgeMonths: number; omBaseRate: number; omResurfacingRate: number;
            omPreResurfacingFlexible: number; omPreResurfacingPerpetual: number }
  indexation: { wpi: number; cpi: number; wpiWeight: number }
  operations: { routine: number; electricity: number; financeLegal: number; staff: number; patrolRunning: number; ieFee: number;
                insuranceBaseRate: number; insuranceLoading: number; majorMaintenance: number; resurfacingYears: [number, number];
                inflation: { maintenance: number; staff: number; electricity: number; insurance: number } }
  tax: { baseRate: number; surcharge: number; cess: number }
  targets: { equityIrrHurdle: number }
}
export interface FieldDef { id: string; label: string; section: SectionId;
  group: string; kind: 'money'|'percent'|'days'|'years'|'number'|'date'|'text'|'select'|'percentList'|'milestoneList'|'trancheList'; min?: number; max?: number;
  step?: number; help?: string; options?: { value: string; label: string }[]; key?: boolean }
