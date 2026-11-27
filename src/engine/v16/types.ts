import type { Day } from '../dates'
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
