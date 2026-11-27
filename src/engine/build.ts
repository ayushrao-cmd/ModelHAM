// Build period: monthly uses, Construction Support, equity/debt drawdown, IDC fixed point.
import type { Day } from './dates'
import { type Timeline, indexFactor } from './timeline'
import type { Inputs } from './types'

const DAYS_IN_YEAR = 365 // day count for IDC and performance-security commission
const MAX_ITERATIONS = 50 // fixed-point cap (spec §7)
const TOLERANCE = 0.01 // ₹ Cr, i.e. ₹1 lakh change in total debt

export interface UseLine { key: string; label: string; net: number; gst: number }
/** One build month. epc and otherUses are gross of GST; epcFixed, epcVariable, reserve and workingCapital are net
 * detail (reserve and working capital are part of otherUses). cash = surplus carried to the next month. */
export interface BuildMonth { day: Day; days: number; epc: number; epcFixed: number; epcVariable: number; otherUses: number;
  reserve: number; workingCapital: number; gstPaid: number; idc: number; supportReceived: number; supportGst: number;
  equityDraw: number; debtDraw: number; debtBalance: number; cash: number; cumPhysical: number; cumCost: number; cumFunding: number }
export interface BuildResult { months: BuildMonth[]; uses: UseLine[]; totalUses: number; support: number; supportGst: number;
  epcVariable: number; // Σ variable EPC (indexation pass-through), net of GST
  equity: number; shareCapital: number; promoterDebt: number; debt: number; idc: number; reserve: number; workingCapital: number;
  netGstCredit: number; converged: boolean; iterations: number }
export interface FirstPeriod { debtService: (debt: number) => number; opex: number; interest: (debt: number) => number }

/** A use line: net amount per month (sums to the line total) and its GST rate. */
interface Line { key: string; label: string; gstRate: number; net: number[]; epc?: boolean }

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const sCurve = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x)

/** Build-month phasing and Construction Support receipts. Independent of debt, so callers can size
 * variable EPC before the IDC fixed point (runModel needs it for first-period insurance). */
export function supportSchedule(i: Inputs, t: Timeline) {
  const b = i.build, bid = i.deal.bidPrice, n = t.months.length
  // Build days falling in each month (first and last months are partial).
  const days = t.months.map((d, m) => Math.min(d, t.completion) - (m ? t.months[m - 1] + 1 : t.start) + 1)
  const totalDays = sum(days)
  let acc = 0
  const elapsed = days.map(d => (acc += d))
  const equated = days.map(d => d / totalDays)
  const phys = b.phasing !== 'sCurve' ? equated // 'manual' is v16-only; the old engine treats it as equated
    : elapsed.map((e, m) => sCurve(e / totalDays) - sCurve(m ? elapsed[m - 1] / totalDays : 0))
  acc = 0
  const cumPhysical = phys.map(w => (acc += w))

  // Construction Support: pctOfBid × bid split across tranches by weight. A tranche is earned in the first month reaching
  // its progress and received lagDays after that month ends (certification and release), in the month containing that day.
  const supportBase = new Array<number>(n).fill(0), received = new Array<number>(n).fill(0)
  const weights = sum(i.support.tranches.map(tr => tr.shareOfBid))
  const lag = Math.max(0, i.support.lagDays || 0)
  for (const tr of n && weights > 0 ? i.support.tranches : []) {
    const found = cumPhysical.findIndex(c => c >= tr.progress)
    const earned = found < 0 ? n - 1 : found // ponytail: float shortfall on a 100% tranche lands in the last month
    const paid = t.months.findIndex(d => d >= t.months[earned] + lag)
    // ponytail: a receipt that would fall after completion is taken in the last build month, so sources still equal uses
    const k = paid < 0 ? n - 1 : paid
    const amount = i.support.pctOfBid * bid * tr.shareOfBid / weights
    supportBase[k] += amount
    received[k] += amount * indexFactor(i, t.months[k])
  }
  const variable = received.map((r, m) => r - supportBase[m]) // indexation uplift paid through to the contractor
  return { days, totalDays, equated, phys, cumPhysical, received, variable }
}

export function runBuild(i: Inputs, t: Timeline, fp: FirstPeriod): BuildResult {
  const b = i.build, bid = i.deal.bidPrice, n = t.months.length
  const { days, totalDays, equated, phys, cumPhysical, received, variable } = supportSchedule(i, t)
  const supportGst = received.map(r => b.gstWorks * r)

  const at = (k: number, x: number) => Array.from({ length: n }, (_, m) => (m === k ? x : 0))
  const spread = (w: number[], x: number) => w.map(v => v * x)
  const first = 0, secondLast = Math.max(0, n - 2), last = n - 1

  const lines = (D: number, E: number): Line[] => [
    { key: 'epcFixed', label: 'EPC (fixed price)', gstRate: b.gstWorks, net: spread(phys, b.epcFixed), epc: true },
    { key: 'epcVariable', label: 'EPC (variable: indexation pass-through)', gstRate: b.gstWorks, net: variable, epc: true },
    { key: 'ieFee', label: 'Independent Engineer fee', gstRate: b.gstServices, net: spread(equated, b.ieFeePctOfBid * bid) },
    { key: 'admin', label: 'SPV administration', gstRate: 0, net: spread(equated, b.adminPctOfEpc * b.epcFixed) },
    { key: 'perfSecurity', label: 'Performance-security commission', gstRate: b.gstServices,
      net: spread(equated, b.perfSecurityCommissionPa * b.perfSecurityPctOfBid * bid * totalDays / DAYS_IN_YEAR) },
    { key: 'patrolRental', label: 'Patrol vehicles (rental)', gstRate: b.gstServices, net: spread(equated, b.patrolRental) },
    { key: 'patrolCapital', label: 'Patrol vehicles (capital)', gstRate: 0, net: at(secondLast, b.patrolCapital) },
    { key: 'preBid', label: 'Pre-bid costs incl. miscellaneous allowance', gstRate: b.gstServices,
      net: at(first, b.preBid * (1 + b.preBidMiscPct)) },
    { key: 'spvFormation', label: 'SPV formation', gstRate: 0,
      net: at(first, b.spvFormationPctOfShareCapital * E * i.capital.shareCapitalPct) },
    { key: 'fundRaising', label: 'Fund-raising fee', gstRate: b.gstServices, net: at(first, b.fundRaisingPctOfDebt * D) },
    { key: 'financeLegal', label: 'Finance & legal', gstRate: b.gstServices, net: at(first, b.financeLegal) },
    { key: 'contingency', label: 'Contingency', gstRate: 0, net: at(last, b.contingency) },
    { key: 'reserve', label: 'Debt Service Reserve', gstRate: 0, net: at(last, fp.debtService(D)) },
    { key: 'workingCapital', label: 'Working capital (liquidity buffer to first payment, released at concession end)', gstRate: 0, net: at(last, fp.opex + fp.interest(D)) },
  ]

  /** One pass over the months for a guessed debt D and equity E. */
  const walk = (D: number, E: number) => {
    const ls = lines(D, E)
    const upfront = i.capital.upfrontEquityPct * E
    // After upfront equity, the remaining equity and the debt are drawn pro rata, so draws total E : D.
    // With no debt (D = 0, E = upfront) everything is equity; the first guess (D = E = 0) draws debt only.
    const rest = E - upfront + D
    const ratio = rest > 0 ? (E - upfront) / rest : E > 0 ? 1 : 0
    let balance = 0, carry = 0, eqCum = 0, cumCost = 0, cumFunding = 0
    const months: BuildMonth[] = t.months.map((day, m) => {
      const idc = balance * i.capital.buildRate * days[m] / DAYS_IN_YEAR
      let epc = 0, otherUses = 0, gstPaid = 0
      const net: Record<string, number> = {}
      for (const l of ls) {
        const gross = l.net[m] * (1 + l.gstRate)
        if (l.epc) epc += gross; else otherUses += gross
        gstPaid += l.net[m] * l.gstRate
        net[l.key] = l.net[m]
      }
      const need = epc + otherUses + idc - received[m] - supportGst[m] - carry
      const funding = Math.max(0, need)
      carry = Math.max(0, -need) // surplus cash carries forward
      const upfrontDraw = Math.min(funding, Math.max(0, upfront - eqCum))
      const equityDraw = upfrontDraw + (funding - upfrontDraw) * ratio
      const debtDraw = funding - equityDraw
      eqCum += equityDraw
      balance += debtDraw
      cumCost += epc + otherUses + idc
      cumFunding += received[m] + supportGst[m] + funding
      return { day, days: days[m], epc, epcFixed: net.epcFixed, epcVariable: net.epcVariable, otherUses, reserve: net.reserve,
        workingCapital: net.workingCapital, gstPaid, idc, supportReceived: received[m], supportGst: supportGst[m], equityDraw, debtDraw,
        debtBalance: balance, cash: carry, cumPhysical: cumPhysical[m], cumCost, cumFunding }
    })
    const idc = sum(months.map(m => m.idc))
    const uses: UseLine[] = ls.map(l => ({ key: l.key, label: l.label, net: sum(l.net), gst: sum(l.net) * l.gstRate }))
    uses.splice(uses.length - 2, 0, { key: 'idc', label: 'Interest During Build', net: idc, gst: 0 })
    return { months, uses, idc }
  }

  const support = sum(received), supportGstTotal = sum(supportGst)
  let D = 0, E = 0, iterations = 0, converged = false
  let pass!: ReturnType<typeof walk>, totalUses = 0, needTotal = 0
  while (iterations < MAX_ITERATIONS) {
    pass = walk(D, E)
    iterations++
    totalUses = sum(pass.uses.map(u => u.net + u.gst))
    needTotal = totalUses - support - supportGstTotal
    const nextD = needTotal * (1 - i.capital.equityPct), nextE = needTotal * i.capital.equityPct
    // Two passes at least: the first runs on a guess (D = E = 0), so its draw split is not the reported one.
    converged = iterations >= 2 && Math.abs(nextD - D) < TOLERANCE && Math.abs(nextE - E) < TOLERANCE
    D = nextD
    E = nextE
    if (converged) break
  }

  const lineNet = (k: string) => pass.uses.find(u => u.key === k)!.net
  // Report what the final pass actually drew (within TOLERANCE of D and E), so debt, equity and the monthly draws
  // agree exactly and the statements balance by construction.
  const equity = sum(pass.months.map(m => m.equityDraw)), debt = sum(pass.months.map(m => m.debtDraw))
  const shareCapital = equity * i.capital.shareCapitalPct
  return { months: pass.months, uses: pass.uses, totalUses, support, supportGst: supportGstTotal, epcVariable: lineNet('epcVariable'),
    equity, shareCapital,
    promoterDebt: equity - shareCapital, debt, idc: pass.idc, reserve: lineNet('reserve'), workingCapital: lineNet('workingCapital'),
    netGstCredit: Math.max(0, sum(pass.months.map(m => m.gstPaid)) - supportGstTotal), converged, iterations }
}
