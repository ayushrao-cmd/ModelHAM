import type { Day } from '../dates'
import type { Inputs } from '../types'
import type { CashResult } from './cash'
import type { ConstructionResult } from './construction'
import type { DebtResult } from './debt'
import type { FundsResult } from './funds'
import type { GstResult } from './gst'
import type { OpexResult } from './opex'
import type { RevenueResult } from './revenue'
import type { CapitalisedCost, Depreciation, TaxResult } from './tax'
export type { Day }

/** A COP-MOF column: a calendar-month slice from the appointed date to the 1st annuity (A §1). */
export interface Period {
  start: Day; end: Day
  /** Construction days (COP-MOF r12) or post-COD days (r13, the last one excludes the annuity day: A-Q2). */
  days: number
  kind: 'construction' | 'postCod'
  /** FY end of the period's end date (COP-MOF r11). */
  fy: Day
}

/** A concession year (O&M Cost J4..J9): `share` of it falls in FY(start), the complement (1 − share) in FY(end). */
export interface ConcessionYear { start: Day; end: Day; share: number }

export interface Grid {
  bid: Day; appointed: Day; constructionEnd: Day; cod: Day; firstAnnuity: Day; concessionEnd: Day
  periods: Period[]            // 37 construction + 7 post-COD at the sample
  annuities: Day[]             // 30; last = concessionEnd (B-Q14)
  fys: Day[]                   // FY ends, FY27..FY45 at the sample
  fyDays: number[]             // days in each FY, 365/366 ('Fin Set' r49)
  concessionYears: ConcessionYear[]
  opFactorCod: number[]; opFactorAnnuity: number[]; constructionFactor: number[]   // per FY
}

/** A V16 quirk the engine reproduces, or a V16 hard-code it generalises (`notes.ts`). */
export interface MethodNote { id: string; text: string; v16Value?: number; consistentValue?: number }

/** Headline numbers (DB!B5:G5 and Fin-IGAAP D143..D208); IRRs/DSCRs null where V16's IFERROR gives 0. */
export interface V16Kpis {
  projectIrrPre: number | null; projectIrrPost: number | null
  /** Half-yearly XIRR post / pre tax (D194 headline, D195). */
  equityIrr: number | null; equityIrrPre: number | null
  equityIrrAnnualPost: number | null; equityIrrAnnualPre: number | null
  /** After the mobilisation-advance adjustment, post tax (D207). */
  equityIrrMobAdj: number | null
  dscrMin: number | null; dscrAvg: number | null; dscrMax: number | null
  /** G46 TPC, Σ grant with PIM, D75 debt, D70 equity, debt / equity, Revenue!D14, Σ O&M payments − Σ opex. */
  totalProjectCost: number; grant: number; debt: number; equity: number; leverage: number
  completionBase: number; omMargin: number
}

/** IGAAP P&L below EBITDA as the KPIs need it (Fin-IGAAP r13, r33–r36, CSR net worth r40 + r42..r46), per FY. The
 *  statements themselves are built from the result in `statements/igaap.ts`. */
export interface IgaapProfit { turnover: number[]; pbt: number[]; csr: number[]; pat: number[]; netWorth: number[] }

export interface Loop { converged: boolean; iterations: number }

/** `runV16` (model.ts). */
export interface V16Result {
  inputs: Inputs; grid: Grid; construction: ConstructionResult; revenue: RevenueResult; opex: OpexResult
  debt: DebtResult; funds: FundsResult; gst: GstResult; capitalised: CapitalisedCost; bookDep: Depreciation
  taxDep: Depreciation & { rate: number }; tax: TaxResult; igaap: IgaapProfit; cash: CashResult
  kpis: V16Kpis; notes: MethodNote[]
  /** Every fixed point within tolerance; `iterations` = construction outer + funds ↔ tax passes. */
  converged: boolean; iterations: number
  /** Per loop, for Health: construction ↔ interest DSR, funds ↔ tax ↔ cash for DSCR, CSR ↔ PAT (inside the tax loop,
   *  last pass). */
  loops: { construction: Loop; tax: Loop; csr: Loop }
}
