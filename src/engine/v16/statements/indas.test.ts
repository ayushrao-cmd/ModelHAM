import { describe, it, expect } from 'vitest'
import { expectClose, inputsFor, row, rowRaw } from '../golden'
import { runV16 } from '../model'
import type { Row, Statement } from '../types'
import { csr } from '../tax'
import { buildIndas, financialAsset } from './indas'
import { additiveErrors, isBlank, walk } from './row'

// Plan tolerances: ₹0.01 Cr per cell, ratios 1e-4, IRRs 1e-6.
const CELL = 0.01, RATIO = 1e-4, IRR = 1e-6
const RATIO_ROWS = new Set([158, 159, 160, 161])
const IRR_ROWS = new Set([185, 186, 187, 188, 209, 210, 400, 413])
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k)

/** Fin-INDAS rows each statement reproduces at top level, in V16's order (C-statements §3.1–§3.4). */
const ROWS: Record<Statement['key'], number[]> = {
  pl: [8, ...range(9, 14), 15, ...range(16, 49)],
  bs: [52, ...range(53, 65), 66, ...range(67, 77)],
  cf: [80, 81, ...range(82, 94), 95, ...range(96, 107), 108, 109, 110, ...range(111, 115), 116, 117, 118, 119,
    ...range(120, 123), 124, ...range(125, 132), 133, ...range(134, 137)],
  dscr: range(140, 161),
  irr: [170, 171, 172, ...range(173, 188), 190, 192, ...range(193, 199), 200, ...range(204, 207), 209, 210],
}
const TITLE_ROW: Record<Statement['key'], number> = { pl: 7, bs: 51, cf: 79, dscr: 139, irr: 163 }
/** Rows whose children are not a sum: CSR and tax build-ups (and their CF copies), DSCR ratios, IRRs. */
const NON_ADDITIVE = new Set(['Fin-INDAS!47', 'Fin-INDAS!48', 'Fin-INDAS!122', 'Fin-INDAS!123', 'Fin-INDAS!158',
  'Fin-INDAS!159', 'Fin-INDAS!185', 'Fin-INDAS!186', 'Fin-INDAS!187', 'Fin-INDAS!188'])
/** Drill-down rows may reproduce an IGAAP row (IndAS copies it); top-level rows are always Fin-INDAS. */
const SOURCE = /^(−)?(Fin-INDAS|Fin-IGAAP)!(\d+)$/
/** The half-yearly equity IRR rows: on a date grid, so blank FY values (total only). */
const DATE_GRID = new Set(range(190, 210))
/** NaN contract (types.ts `Row`): blank values only on headers, the DSCR window rows, the date-grid rows and r41
 *  (C.5 USL interest: V16 leaves its FY cells blank, D = 0). */
const BLANK_OK = new Set([41, ...range(158, 161), ...DATE_GRID])
const UNITS: Record<number, Row['unit']> = { 153: 'count', 158: 'ratio', 159: 'ratio', 160: 'ratio', 161: 'ratio',
  185: 'pct', 186: 'pct', 187: 'pct', 188: 'pct', 209: 'pct', 210: 'pct' }

const SETS = ['sample', 'bid2400', 'epc105', 'build1460', 'equity30', 'rates50bp', 'equated']

for (const set of SETS) {
  describe(`v16 IndAS statements: ${set}`, () => {
    const r = runV16(inputsFor(set)), s = buildIndas(r), n = r.grid.fys.length
    const st = (key: Statement['key']) => s.statements.find((x) => x.key === key)!
    const srcRow = (row: Row) => SOURCE.exec(row.source ?? '')
    const tol = (sheet: string, v16: number) =>
      sheet === 'Fin-INDAS' && RATIO_ROWS.has(v16) ? RATIO : sheet === 'Fin-INDAS' && IRR_ROWS.has(v16) ? IRR : CELL

    const matches = (row: Row, topLevel: boolean) => {
      const m = srcRow(row)!, sign = m[1] ? -1 : 1, key = `${m[2]}!${m[3]}`, g = rowRaw(set, key), t = tol(m[2], +m[3])
      if (row.kind === 'header') return
      const what = `${row.id} (${key})`
      if (!(m[2] === 'Fin-INDAS' && DATE_GRID.has(+m[3])))
        row.values.forEach((v, k) => {
          if (Number.isNaN(v)) expect(g.values[k], `${what}[${k}] blank`).toBeNull()
          else expectClose(v, sign * (g.values[k] ?? 0), t, `${what}[${k}]`)
        })
      if (Number.isFinite(row.total) && g.total !== null) expectClose(row.total, sign * g.total, t, `${what} total`)
      expect(Number.isNaN(row.total), `${what} total blank (${topLevel ? 'top' : 'child'})`).toBe(g.total === null)
    }

    it('years = the FY grid; statements pl, bs, cf, dscr, irr with V16 titles', () => {
      expect(s.standard).toBe('indas')
      expect(s.years).toEqual(r.grid.fys)
      expect(s.statements.map((x) => x.key)).toEqual(['pl', 'bs', 'cf', 'dscr', 'irr'])
      for (const x of s.statements) expect(x.title).toBe(rowRaw(set, `Fin-INDAS!${TITLE_ROW[x.key]}`).label)
    })

    it('every V16 row once, in order, with V16 labels', () => {
      for (const x of s.statements) {
        expect(x.rows.map((row) => srcRow(row)![2]), x.key).toEqual(x.rows.map(() => 'Fin-INDAS'))
        expect(x.rows.map((row) => +srcRow(row)![3]), x.key).toEqual(ROWS[x.key])
        for (const row of x.rows) {
          expect(row.label, row.id).toBe(rowRaw(set, `Fin-INDAS!${srcRow(row)![3]}`).label)
          expect(row.source!.startsWith('−'), row.id).toBe(false)
        }
      }
    })

    it('every top-level row: FY values and D total = golden', () => {
      for (const x of s.statements) for (const row of x.rows) matches(row, true)
    })

    it('every drill-down row sourced from a Fin-INDAS / Fin-IGAAP row matches it (sign as marked)', () => {
      let count = 0
      for (const x of s.statements)
        for (const { row, depth } of walk(x.rows))
          if (depth > 0 && srcRow(row)) { matches(row, false); count++ }
      expect(count).toBeGreaterThan(100)
    })

    it('NaN contract: blank values only on headers, DSCR window rows, date-grid rows and r41; every row has a unit', () => {
      for (const x of s.statements)
        for (const top of x.rows)
          for (const { row } of walk([top])) {
            expect(['money', 'ratio', 'pct', 'count', 'date'], row.id).toContain(row.unit)
            if (row.kind !== 'header' && row.values.some(isBlank))
              expect(BLANK_OK.has(+srcRow(top)![3]), `${row.id} has blank values`).toBe(true)
          }
    })

    it('units: DSCR rows ratio, IRR rows pct, annuity count; other top-level rows money', () => {
      for (const x of s.statements)
        for (const row of x.rows)
          if (row.kind !== 'header') expect(row.unit, row.id).toBe(UNITS[+srcRow(row)![3]] ?? 'money')
    })

    it('ties: tax = engine tax; CSR = csr() on IndAS figures; PAT = PBT + CSR − tax; reserves = Σ PAT', () => {
      const pl = st('pl').rows, bs = st('bs').rows, get = (rows: Row[], id: string) => rows.find((x) => x.id === id)!.values
      const pbt = get(pl, 'pl.E'), c = get(pl, 'pl.r47'), pat = get(pl, 'pl.F'), sc = get(bs, 'bs.r53'), rs = get(bs, 'bs.r55')
      let cum = 0
      pat.forEach((v, k) => {
        expectClose(get(pl, 'pl.r48')[k], -r.tax.tax[k], 1e-9, `tax[${k}]`)
        expectClose(v, pbt[k] + c[k] - r.tax.tax[k], 1e-9, `pat[${k}]`)
        expectClose(rs[k], (cum += v), 1e-9, `reserves[${k}]`)
      })
      const own = csr(r.inputs, r.grid, pbt, sc.map((v, k) => v + rs[k]), get(pl, 'pl.r14'), pat, 'indas')
      own.amount.forEach((v, k) => expectClose(-c[k], v, 1e-9, `csr[${k}]`))
    })

    it('BS check and cash check rows are 0 every FY', () => {
      const bs = st('bs').rows
      expect(s.checks.bs).toEqual(bs.find((x) => x.source === 'Fin-INDAS!76')!.values)
      expect(s.checks.cash).toEqual(bs.find((x) => x.source === 'Fin-INDAS!77')!.values)
      expect(s.checks.bs.every((v) => Math.abs(v) < 1e-9)).toBe(true)
      expect(s.checks.cash.every((v) => v === 0)).toBe(true)
      expect(s.checks.bs).toHaveLength(n)
    })

    it('trees: additive Σ children = parent; depth ≤ 3; FY values on every row; unique ids; formula and source', () => {
      for (const x of s.statements) {
        expect(additiveErrors(x.rows, 1e-6), x.key).toEqual([])
        const ids = new Set<string>()
        for (const { row, depth } of walk(x.rows)) {
          expect(depth, row.id).toBeLessThanOrEqual(3)
          expect(row.values, row.id).toHaveLength(n)
          expect(ids.has(row.id), `duplicate ${row.id}`).toBe(false)
          ids.add(row.id)
          expect(row.id.startsWith(`${x.key}.`), row.id).toBe(true)
          expect(row.source, row.id).toBeTruthy()
          if (row.kind !== 'header') expect(row.formula, row.id).toBeTruthy()
        }
      }
    })

    it('non-additive trees are exactly the build-ups; CSR and DSCR rebuild their parent', () => {
      const flagged = new Set<string>()
      for (const x of s.statements) for (const { row } of walk(x.rows)) if (row.additive === false) flagged.add(row.source!)
      expect(flagged).toEqual(NON_ADDITIVE)
      const by = (rows: Row[] | undefined, src: string) => rows!.find((c) => c.source === src)!
      // E.1 CSR on IndAS PBT: applicable × MAX(rate × average PBT of the 3 preceding FYs, 0).
      const csr = by(st('pl').rows, 'Fin-INDAS!47'), app = by(csr.children, 'Fin-INDAS!392').values
      const avg = csr.children!.find((c) => c.id.endsWith('.avg'))!.values
      csr.values.forEach((c, k) => expectClose(c, -app[k] * Math.max(r.inputs.csr.rate * avg[k], 0), 1e-9, `r47[${k}]`))
      const ratio = by(st('dscr').rows, 'Fin-INDAS!158')
      ratio.values.forEach((x, k) => {
        if (Number.isFinite(x)) expectClose(x, ratio.children![0].values[k] / ratio.children![1].values[k], 1e-12, 'r158')
      })
      for (const v16 of [185, 186, 187, 188]) {
        const irr = by(st('irr').rows, `Fin-INDAS!${v16}`)
        expect(irr.children!.map((c) => c.source)).toEqual([`Fin-INDAS!${v16 - 4}`])
        expect(irr.values[n - 1]).toBe(irr.total)
      }
    })

    it('financial asset r400–r406: IRR rate, roll-forward, closing ≈ 0 in the last FY', () => {
      const fa = financialAsset(r), g = (v16: number) => row(set, `Fin-INDAS!${v16}`)
      expectClose(fa.rate, g(400).total, IRR, 'rate')
      const cmp = (s: number[], v16: number) => s.forEach((v, k) => expectClose(v, g(v16).values[k], CELL, `r${v16}[${k}]`))
      cmp(fa.opening, 401); cmp(fa.addition, 402); cmp(fa.grant, 403); cmp(fa.receipt, 404)
      cmp(fa.financeIncome, 405); cmp(fa.closing, 406)
      expectClose(fa.closing[n - 1], 0, 1e-6, 'closing last FY')
      // Σ finance income = Σ receipts + Σ grant − Σ EPC cost (the asset ends at 0).
      const sum = (a: number[]) => a.reduce((t, v) => t + v, 0)
      expectClose(sum(fa.financeIncome), -sum(fa.receipt) - sum(fa.grant) - sum(fa.addition), 1e-6, 'Σ finance income')
    })
  })
}

describe('v16 IndAS statements: sample targets and drill-down', () => {
  const r = runV16(inputsFor('sample')), s = buildIndas(r), fa = financialAsset(r)
  const find = (id: string) => {
    for (const x of s.statements) for (const { row } of walk(x.rows)) if (row.id === id) return row
    throw new Error(`no row ${id}`)
  }

  it('brief values: rate, finance income 630.71, PAT 788.706066821826', () => {
    expectClose(fa.rate, 0.059613627963622795, 1e-9, 'rate')
    expectClose(fa.financeIncome.reduce((t, v) => t + v, 0), 630.714520547945, 1e-6, 'Σ finance income')
    expectClose(find('pl.F').total, 788.706066821826, 1e-4, 'PAT') // the engine's funds ↔ tax loop vs V16's iteration: ~4e-6
  })

  it('notional income → construction revenue by month + financing income', () => {
    const a1 = find('pl.A.1')
    expect(a1.children!.map((c) => c.source)).toEqual(['Fin-INDAS!402', 'Fin-INDAS!405'])
    const months = a1.children![0].children!
    expect(months.length).toBeGreaterThan(30)
    expect(months[0].label).toMatch(/^Month ending \d\d-[A-Z][a-z]{2}-\d{4}$/)
  })

  it('financial asset → opening, construction cost, grant, 60% instalments, financing income', () => {
    expect(find('bs.r67').children!.map((c) => c.source)).toEqual(
      ['Fin-INDAS!401', 'Fin-INDAS!402', 'Fin-INDAS!403', 'Fin-INDAS!404', 'Fin-INDAS!405'])
  })

  it('construction-period costs → their COP-MOF lines', () => {
    expect(find('pl.B.1').children!.map((c) => c.label)).toEqual(['EPC Cost - Fixed', 'EPC Cost - Variable'])
    expect(find('pl.B.7').children!.map((c) => c.label)).toEqual(['SPV Manpower', 'Administrative Cost', 'IMV Vehicle Rental'])
  })
})
