import type { ConstructionResult } from './construction'
import type { OpexResult } from './opex'
import { toFy, type RevenueResult } from './revenue'
import type { Grid } from './types'

/**
 * GST ledgers per FY of `g.fys` (recon B §5, B-G9; Fin-IGAAP r362–390). Amounts positive: the sheet's utilisation,
 * write-off and payment rows (r371/r384, r372, r385) are the negatives of `creditUsed*`, `writeOff`, `paidToGovt`.
 * Feeds: CF r84 = −inputCp, r80 = outputGrant, r101 = instalment + interest + O&M output, r109 = −Σ inputOps,
 * r110 = −paidToGovt; BS r55 = creditClosing; P&L r24 = −writeOff.
 */
export interface GstResult {
  /** Input A/c: r365 opening, r366 CP input (COP-MOF r277), r367 others / r368 RM / r369 MM / r370 electricity. */
  creditOpening: number[]; inputCp: number[]
  inputOps: { om: number[]; rm: number[]; mm: number[]; electricity: number[] }
  /** r384 = creditUsedCp + creditUsedOps: CP part = COP-MOF r282 by FY (the construction monthly ledger). */
  creditUsedCp: number[]; creditUsedOps: number[]
  /** r372 (last FY only), r373. */
  writeOff: number[]; creditClosing: number[]
  /** Output: r377 grant (COP-MOF r281), r378 instalment, r379 interest (B-Q13), r380 O&M; r381 total. */
  outputGrant: number[]; outputInstalment: number[]; outputInterest: number[]; outputOm: number[]; output: number[]
  /** r385: output less credit used (the output ledger r376/r386 stays 0). */
  paidToGovt: number[]
  /** r390 (informational): CP input credit set against the FY's liability, cumulative-capped. */
  creditCpAvailable: number[]
}

export function runGst(g: Grid, c: ConstructionResult, rev: RevenueResult, opex: OpexResult): GstResult {
  const ends = g.periods.map((p) => p.end) // COP-MOF r11 = FY of the period end
  const byPeriod = (s: number[]) => toFy(s, ends, g), byAnnuity = (s: number[]) => toFy(s, rev.dates, g)
  const o = opex.gst
  const inputCp = byPeriod(c.uses.itc.available)
  const inputOps = {
    om: g.fys.map((_, k) => o.financeLegal[k] + o.spvManpower[k] + o.spvOverhead[k] + o.ieFee[k] + o.insurance[k]),
    rm: o.routineMaintenance, mm: o.majorMaintenance, electricity: o.electricity,
  }
  const outputGrant = byPeriod(c.uses.grant.receivedGst)
  const outputInstalment = byAnnuity(rev.gstInstalment), outputInterest = byAnnuity(rev.gstInterest)
  const outputOm = byAnnuity(rev.gstOm)
  const output = g.fys.map((_, k) => outputGrant[k] + outputInstalment[k] + outputInterest[k] + outputOm[k])
  // V16 quirk A-G19: COP-MOF r282/r283 net the grant GST month by month (a monthly shortfall is paid in cash through
  // TPC r40), while r384 nets per FY and never sees r283. Both agree while every month's credit covers its grant
  // GST (r283 = 0 at every golden set); otherwise a CP shortfall is both paid in cash (r283) and set off against
  // the FY credit (r384). Reproduced as is: r384 per FY, its CP part from the monthly ledger.
  const creditUsedCp = byPeriod(c.uses.itc.used)

  const n = g.fys.length, z = () => g.fys.map(() => 0)
  const creditOpening = z(), creditUsedOps = z(), writeOff = z(), creditClosing = z(), paidToGovt = z()
  const creditCpAvailable = z()
  let open = 0, cpCum = 0, cpUsed = 0
  for (let k = 0; k < n; k++) {
    creditOpening[k] = open
    const available = open + inputCp[k] + inputOps.om[k] + inputOps.rm[k] + inputOps.mm[k] + inputOps.electricity[k]
    const used = Math.min(available, output[k]) // r384 = −MIN(Σ r365:r370, r381)
    creditUsedOps[k] = used - creditUsedCp[k]
    paidToGovt[k] = output[k] - used // r385
    writeOff[k] = k === n - 1 ? available - used : 0 // r372: FY = DB!N16 (concession-end FY)
    creditClosing[k] = open = available - used - writeOff[k]
    cpCum += inputCp[k] // r390 = MAX(MIN(Σ r366 to date − Σ r390 before, r389), 0)
    creditCpAvailable[k] = Math.max(Math.min(cpCum - cpUsed, output[k]), 0)
    cpUsed += creditCpAvailable[k]
  }
  return { creditOpening, inputCp, inputOps, creditUsedCp, creditUsedOps, writeOff, creditClosing, outputGrant,
    outputInstalment, outputInterest, outputOm, output, paidToGovt, creditCpAvailable }
}
