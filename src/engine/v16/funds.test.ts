import { describe, it, expect } from 'vitest'
import { row, rowRaw, inputsFor, expectSeries, expectClose, opsFor, fromSerial } from './golden'
import { buildGrid } from './grid'
import { grantSchedule, runConstruction } from './construction'
import { runRevenue } from './revenue'
import { runOpex } from './opex'
import { runDebt } from './debt'
import { runFunds, type Ledger } from './funds'

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const neg = (a: number[]) => a.map((v) => -v)
const TOL = 1e-6 // plan: ₹0.01 Cr per FY cell; these match far tighter

/** Tax (Fin-IGAAP r35, negated) and cash available for DSCR (r136) from golden until Task 13 closes the loops. */
const setup = (set: string) => {
  const i = inputsFor(set), g = buildGrid(i), c = runConstruction(i, g, opsFor(set))
  const rev = runRevenue(i, g, c), opex = runOpex(i, g, sum(grantSchedule(i, g).pim)), debt = runDebt(i, g, c)
  const f = runFunds(i, g, c, rev, opex, debt, neg(row(set, 'Fin-IGAAP!35').values), row(set, 'Fin-IGAAP!136').values)
  return { i, g, f }
}
const r = (set: string, n: number) => row(set, `Fin-IGAAP!${n}`)
/** A ledger against its sheet rows (opening, funded, set aside, used (negative in the sheet), closing, interest). */
function ledger(set: string, l: Ledger, rows: (number | null)[], what: string) {
  const [o, fu, sa, us, cl, int] = rows
  const series: [number[], number | null][] = [[l.opening, o], [l.funded, fu], [l.setAside, sa], [neg(l.used), us],
    [l.closing, cl], [l.interest, int]]
  series.forEach(([a, n], k) => { if (n !== null) expectSeries(a, r(set, n), TOL, `${what} r${n} (${k})`) })
}

for (const set of ['sample', 'bid2400', 'epc105', 'build1460', 'equity30', 'rates50bp', 'equated']) {
  describe(`v16 funds: ${set}`, () => {
    const { f } = setup(set)

    it('MMR: Fin-IGAAP rows 283–288', () => {
      expectSeries(f.mmrExpenditureYear, { values: r(set, 283).values.map((v) => (v ? fromSerial(v) : 0)) }, 0, 'r283')
      ledger(set, f.mmr, [284, null, 285, 286, 287, 288], 'mmr')
      expect(f.mmr.funded.every((v) => v === 0)).toBe(true)
      expectClose(sum(f.mmr.interest), r(set, 288).total, TOL, 'D288')
    })

    it('Funds for Expenses: months held H280, ledgers rows 291–317', () => {
      expectClose(f.ffeMonths, rowRaw(set, 'Fin-IGAAP!280').values[3]!, 1e-12, 'H280')
      ledger(set, f.ffe, [291, 292, 293, 294, 295, 296], 'ffe')
      ledger(set, f.ffeInterest, [299, 300, 301, 302, 303, null], 'ffe interest')
      ledger(set, f.ffeOm, [306, 307, 308, 309, 310, null], 'ffe O&M')
      ledger(set, f.ffeTax, [313, 314, 315, 316, 317, null], 'ffe tax')
      expectClose(sum(f.ffe.funded), r(set, 292).total, TOL, 'D292')
      expectClose(sum(f.ffe.interest), r(set, 296).total, TOL, 'D296')
    })

    it('DSR: requirements and annuities, rows 320–322', () => {
      expectSeries(f.dsrPrincipalRequired, r(set, 320), TOL, 'r320')
      expectSeries(f.dsrInterestRequired, r(set, 321), TOL, 'r321')
      expectSeries(f.annuitiesInFy, r(set, 322), 0, 'r322')
    })

    it('DSR interest ledger: rows 328, 330–336', () => {
      expectSeries(f.fundsAvailable, r(set, 328), TOL, 'r328')
      ledger(set, f.dsrInterest, [330, 331, 332, null, 333, 334], 'dsr interest')
      expectSeries(f.dsrInterestCarried, r(set, 335), TOL, 'r335')
      expectSeries(f.dsrInterestShortfall, r(set, 336), TOL, 'r336')
      expectClose(sum(f.dsrInterest.funded), r(set, 331).total, TOL, 'D331')
      expectClose(sum(f.dsrInterest.interest), r(set, 334).total, TOL, 'D334')
    })

    it('DSR principal ledger: rows 344, 346–352', () => {
      expectSeries(f.dsrInterestCarried, r(set, 344), TOL, 'r344 = r335')
      ledger(set, f.dsrPrincipal, [346, 347, 348, null, 349, 350], 'dsr principal')
      expectSeries(f.dsrPrincipalCarried, r(set, 351), TOL, 'r351')
      expectSeries(f.dsrPrincipalShortfall, r(set, 352), TOL, 'r352')
      expectClose(sum(f.dsrPrincipal.funded), r(set, 347).total, TOL, 'D347')
      expectClose(sum(f.dsrPrincipal.interest), r(set, 350).total, TOL, 'D350')
    })

    it('interest accrued on funds = Fin-IGAAP r12 by FY and D12', () => {
      expectSeries(f.interestOnFunds, r(set, 12), TOL, 'r12')
      expectClose(sum(f.interestOnFunds), r(set, 12).total, TOL, 'D12')
    })
  })
}

describe('v16 funds: sample headline values (brief)', () => {
  const { g, f } = setup('sample')
  const fy = (y: number) => g.fys.findIndex((d) => new Date(d * 86_400_000).getUTCFullYear() === y)
  it('totals', () => {
    expectClose(sum(f.interestOnFunds), 81.69966022689292, 1e-6, 'interest on funds')
    expectClose(sum(f.ffe.interest), 27.608339, 1e-6, 'FFE')
    expectClose(sum(f.mmr.interest), 10.616840, 1e-6, 'MMR')
    expectClose(sum(f.dsrInterest.interest), 16.502020, 1e-6, 'DSR interest')
    expectClose(sum(f.dsrPrincipal.interest), 26.972461, 1e-6, 'DSR principal')
    expectClose(sum(f.dsrInterest.funded) + sum(f.dsrPrincipal.funded), 59.93073865502854, 1e-6, 'DSR at COD')
    expectClose(sum(f.ffe.funded), 55.40297435405625, 1e-6, 'FFE funded')
    expectClose(f.ffeMonths, 5.384508219178082, 1e-12, 'months')
  })
  it('MMR set-aside 8.530097 in FY32–FY36 and 11.108406 in FY38–FY42 (B-Q8 generalised)', () => {
    for (let y = 2032; y <= 2036; y++) expectClose(f.mmr.setAside[fy(y)], 8.530097, 1e-6, `FY${y}`)
    for (let y = 2038; y <= 2042; y++) expectClose(f.mmr.setAside[fy(y)], 11.108406, 1e-6, `FY${y}`)
    expect(f.mmr.setAside[fy(2037)]).toBe(0)
    expectClose(f.mmr.closing[fy(2036)], 0, 1e-9, 'FY36 closing')
  })
  it('DSR interest at COD = ½ × FY32 interest (V16 quirk B-Q3), at FY(construction end)', () => {
    expectClose(f.dsrInterest.funded[fy(2030)], 45.076992757740705, 1e-6, 'H331')
  })
})

describe('v16 funds: DSR top-ups capped by available cash (never binds at the golden sets)', () => {
  const i = inputsFor('sample'), g = buildGrid(i), c = runConstruction(i, g, opsFor('sample'))
  const rev = runRevenue(i, g, c), opex = runOpex(i, g, sum(grantSchedule(i, g).pim)), debt0 = runDebt(i, g, c)
  const tax = neg(row('sample', 'Fin-IGAAP!35').values)
  const k31 = g.fys.findIndex((d) => new Date(d * 86_400_000).getUTCFullYear() === 2031), k32 = k31 + 1, k33 = k31 + 2
  /** Cash available for DSCR = debt service (r141) + `x`, so r328 = x in every FY with an annuity. */
  const run = (x: number, debt = debt0) =>
    runFunds(i, g, c, rev, opex, debt, tax, debt.interest.map((v, k) => v + debt.repayment[k] + x))
  // H331, H347 as computed (the headline test pins them to golden at 1e-6).
  const cod = run(0), codI = sum(cod.dsrInterest.funded), codP = sum(cod.dsrPrincipal.funded)

  it('cash = debt service: no interest top-up, releases unlimited', () => {
    const f = run(0)
    expect(f.fundsAvailable.every((v) => Math.abs(v) < 1e-9)).toBe(true)
    expect(f.dsrInterest.setAside.every((v) => v <= 1e-12)).toBe(true)
    expectClose(f.dsrPrincipal.closing[k31], codP, 1e-6, 'principal DSR stays at the COD funding')
    expectClose(f.dsrInterest.setAside[k32], f.dsrInterestRequired[k32] - codI, 1e-6, 'FY32 release')
  })

  it('partial shortfall (2 of the 4.95 FY31 principal top-up): created, released, carried and shortfall rows', () => {
    const f = run(2), reqI = f.dsrInterestRequired, reqP = f.dsrPrincipalRequired
    expectClose(reqI[k31], codI, 1e-6, 'FY31 interest need is the COD funding')
    // FY31: interest needs nothing; the 2 carries to the principal ledger, which is 2.95 short.
    expectClose(f.dsrInterest.setAside[k31], 0, 1e-9, 'r332 FY31')
    expectClose(f.dsrInterestCarried[k31], 2, 1e-9, 'r335 FY31')
    expectClose(f.dsrInterestShortfall[k31], 0, 0, 'r336 FY31')
    expectClose(f.dsrPrincipal.setAside[k31], 2, 1e-9, 'r348 FY31 capped')
    expectClose(f.dsrPrincipal.closing[k31], codP + 2, 1e-9, 'r349 FY31')
    expectClose(f.dsrPrincipalCarried[k31], 2 + codP - reqP[k31], 1e-9, 'r351 FY31')
    expectClose(f.dsrPrincipalShortfall[k31], 2 + codP - reqP[k31], 1e-9, 'r352 FY31')
    expectClose(f.dsrPrincipalShortfall[k31], -2.951249, 1e-6, 'r352 FY31 value')
    // FY32: the interest DSR releases 2.15 (unlimited), and r344 = r335 carries that release plus the cash 2 into the
    // principal ledger: a principal top-up of 4.15 funded partly by the interest release.
    const release = reqI[k32] - codI
    expectClose(f.dsrInterest.setAside[k32], release, 1e-9, 'r332 FY32 release')
    expect(release).toBeLessThan(-2)
    expectClose(f.dsrInterestCarried[k32], 2 - release, 1e-9, 'r335 FY32')
    expectClose(f.dsrPrincipal.setAside[k32], 2 - release, 1e-9, 'r348 FY32 = cash + interest release')
    expectClose(f.dsrPrincipal.setAside[k32], 4.154245, 1e-6, 'r348 FY32 value')
    expectClose(f.dsrPrincipalShortfall[k32], (2 - release) + (codP + 2) - reqP[k32], 1e-9, 'r352 FY32')
    expect(f.dsrPrincipalShortfall[k32]).toBeLessThan(0)
  })

  it('a rising interest need is topped up up to the cash available, the rest is a shortfall', () => {
    // FY33 interest +10 → FY32 interest DSR need = ½ × FY33 interest rises by 5, above the 45.08 held.
    const debt = { ...debt0, interest: debt0.interest.map((v, k) => (k === k33 ? v + 10 : v)) }
    const need = (f: ReturnType<typeof run>) => f.dsrInterestRequired[k32] - codI
    const capped = run(2, debt)
    expect(need(capped)).toBeGreaterThan(2)
    expectClose(capped.dsrInterest.setAside[k32], 2, 1e-9, 'r332 capped at the cash')
    expectClose(capped.dsrInterest.closing[k32], codI + 2, 1e-9, 'r333')
    expectClose(capped.dsrInterestShortfall[k32], 2 - need(capped), 1e-9, 'r336 shortfall')
    expectClose(capped.dsrPrincipal.setAside[k32], 0, 0, 'nothing left for the principal DSR')
    const full = run(100, debt)
    expectClose(full.dsrInterest.setAside[k32], need(full), 1e-9, 'r332 full top-up')
    expectClose(full.dsrInterest.closing[k32], full.dsrInterestRequired[k32], 1e-9, 'r333 = requirement')
    expectClose(full.dsrInterestShortfall[k32], 0, 0, 'no shortfall')
  })
})

describe('v16 funds: guards', () => {
  const i = inputsFor('sample'), g = buildGrid(i), c = runConstruction(i, g, opsFor('sample'))
  const rev = runRevenue(i, g, c), opex = runOpex(i, g, sum(grantSchedule(i, g).pim)), debt = runDebt(i, g, c)
  const tax = neg(row('sample', 'Fin-IGAAP!35').values), cash = row('sample', 'Fin-IGAAP!136').values

  it('a huge or infinite DSR principal instalment count returns at once (bounded by the schedule)', () => {
    for (const n of [1e12, Infinity]) {
      const t = performance.now()
      const f = runFunds({ ...i, funds: { ...i.funds, dsrPrincipalInstalments: n } }, g, c, rev, opex, debt, tax, cash)
      expect(performance.now() - t).toBeLessThan(200)
      expect(f.dsrPrincipalRequired.every(Number.isFinite)).toBe(true)
    }
  })

  it('FFE months come from the first-payment lag (DB!H72), not funds.ffeDays; no annuities → no subtraction', () => {
    const f = runFunds({ ...i, funds: { ...i.funds, ffeDays: 30 } }, g, c, rev, opex, debt, tax, cash)
    expectClose(f.ffeMonths, 5.384508219178082, 1e-12, 'ffeDays ignored')
    const none = runFunds(i, g, c, { ...rev, dates: [] }, opex, debt, tax, cash)
    expectClose(none.ffeMonths, i.income.firstPaymentLagDays / 365 * 12, 1e-12, 'no annuities')
  })
})
