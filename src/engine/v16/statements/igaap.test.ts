import { describe, it, expect } from 'vitest'
import { expectClose, inputsFor, rowRaw } from '../golden'
import { runV16 } from '../model'
import type { Row, Statement } from '../types'
import { buildIgaap } from './igaap'
import { additiveErrors, walk } from './row'

// Plan tolerances: ₹0.01 Cr per cell, ratios 1e-4, IRRs 1e-6.
const CELL = 0.01, RATIO = 1e-4, IRR = 1e-6
const RATIO_ROWS = new Set([142, 143, 144, 145])
const IRR_ROWS = new Set([169, 170, 171, 172, 194, 195, 207, 208])
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k)

/** Fin-IGAAP rows each statement reproduces at top level, in V16's order (C-statements §2.1–§2.5). */
const ROWS: Record<Statement['key'], number[]> = {
  pl: [7, ...range(8, 13), 14, ...range(15, 36)],
  bs: [39, ...range(40, 52), 53, ...range(54, 64)],
  cf: [67, 68, ...range(69, 81), 82, ...range(83, 91), 92, 93, 94, ...range(95, 99), 100, 101, 102, 103,
    ...range(104, 107), 108, ...range(109, 116), 117, ...range(118, 121)],
  dscr: range(124, 145),
  irr: [154, 155, 156, ...range(157, 172), 174, 176, 177, 184, 185, ...range(189, 192), 194, 195, 197, ...range(199, 205),
    207, 208],
}
const TITLE_ROW: Record<Statement['key'], number> = { pl: 6, bs: 38, cf: 66, dscr: 123, irr: 147 }
/** Rows whose children are not a sum: tax and CSR build-ups, depreciation base × share, ratios, IRRs. */
const NON_ADDITIVE = new Set([32, 34, 35, 106, 107, 142, 143, 169, 170, 171, 172])
const SOURCE = /^(−)?Fin-IGAAP!(\d+)$/

const SETS = ['sample', 'bid2400', 'epc105', 'build1460', 'equity30', 'rates50bp', 'equated']

for (const set of SETS) {
  describe(`v16 IGAAP statements: ${set}`, () => {
    const r = runV16(inputsFor(set)), s = buildIgaap(r), n = r.grid.fys.length
    const st = (key: Statement['key']) => s.statements.find((x) => x.key === key)!
    const srcRow = (row: Row) => SOURCE.exec(row.source ?? '')
    const tol = (v16: number) => (RATIO_ROWS.has(v16) ? RATIO : IRR_ROWS.has(v16) ? IRR : CELL)

    /** Values (FY columns; skipped when the row is all blank, i.e. on the half-yearly date grid) and the total. */
    const matches = (row: Row, topLevel: boolean) => {
      const m = srcRow(row)!, sign = m[1] ? -1 : 1, v16 = +m[2], g = rowRaw(set, `Fin-IGAAP!${v16}`), t = tol(v16)
      if (row.kind === 'header') return
      const what = `${row.id} (r${v16})`
      if (!row.values.every(Number.isNaN))
        row.values.forEach((v, k) => {
          if (Number.isNaN(v)) expect(g.values[k], `${what}[${k}] blank`).toBeNull()
          else expectClose(v, sign * (g.values[k] ?? 0), t, `${what}[${k}]`)
        })
      if (Number.isFinite(row.total) && g.total !== null) expectClose(row.total, sign * g.total, t, `${what} total`)
      if (topLevel) expect(Number.isNaN(row.total), `${what} total blank`).toBe(g.total === null)
    }

    it('years = the FY grid; statements pl, bs, cf, dscr, irr with V16 titles', () => {
      expect(s.standard).toBe('igaap')
      expect(s.years).toEqual(r.grid.fys)
      expect(s.statements.map((x) => x.key)).toEqual(['pl', 'bs', 'cf', 'dscr', 'irr'])
      for (const x of s.statements) expect(x.title).toBe(rowRaw(set, `Fin-IGAAP!${TITLE_ROW[x.key]}`).label)
    })

    it('every V16 row once, in order, with V16 labels', () => {
      for (const x of s.statements) {
        expect(x.rows.map((row) => +srcRow(row)![2]), x.key).toEqual(ROWS[x.key])
        for (const row of x.rows) {
          expect(row.label, row.id).toBe(rowRaw(set, `Fin-IGAAP!${srcRow(row)![2]}`).label)
          expect(row.source!.startsWith('−'), row.id).toBe(false)
        }
      }
    })

    it('every top-level row: FY values and D total = golden', () => {
      for (const x of s.statements) for (const row of x.rows) matches(row, true)
    })

    it('every drill-down row sourced from a Fin-IGAAP row matches it (sign as marked)', () => {
      let count = 0
      for (const x of s.statements)
        for (const { row, depth } of walk(x.rows))
          if (depth > 0 && srcRow(row)) { matches(row, false); count++ }
      expect(count).toBeGreaterThan(100)
    })

    it('BS check and cash check rows are 0 every FY', () => {
      const bs = st('bs').rows
      expect(s.checks.bs).toEqual(bs.find((x) => x.source === 'Fin-IGAAP!63')!.values)
      expect(s.checks.cash).toEqual(bs.find((x) => x.source === 'Fin-IGAAP!64')!.values)
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

    it('non-additive trees are exactly the build-ups, and each rebuilds its parent', () => {
      const flagged = new Set<number>()
      for (const x of s.statements)
        for (const { row } of walk(x.rows)) if (row.additive === false) flagged.add(+srcRow(row)![2])
      expect(flagged).toEqual(NON_ADDITIVE)
      const pl = st('pl').rows, by = (rows: Row[] | undefined, src: string) => rows!.find((c) => c.source === src)!
      const v = (rows: Row[] | undefined, src: string) => by(rows, src).values
      const tax = by(pl, 'Fin-IGAAP!35').children, rate = r.tax.rate
      for (let k = 0; k < n; k++) {
        // E.2: PBT + book dep − IT dep = PBT (IT); taxable = MAX(that + b/f losses, 0); tax = taxable × rate.
        const it = v(tax, 'Fin-IGAAP!262')[k] + v(tax, 'Fin-IGAAP!263')[k] + v(tax, 'Fin-IGAAP!264')[k]
        expectClose(v(tax, 'Fin-IGAAP!265')[k], it, 1e-9, `r265[${k}]`)
        expectClose(v(tax, 'Fin-IGAAP!267')[k], Math.max(it + v(tax, 'Fin-IGAAP!266')[k], 0), 1e-9, `r267[${k}]`)
        expectClose(by(pl, 'Fin-IGAAP!35').values[k], -v(tax, 'Fin-IGAAP!267')[k] * rate, 1e-9, `r35[${k}]`)
      }
      // D.1: cumulative additions × the FY's receipts / lifetime receipts.
      const dep = by(pl, 'Fin-IGAAP!32'), [base, fy, life] = dep.children!
      dep.values.forEach((d, k) => expectClose(d, -base.values[k] * fy.values[k] / life.values[k], 1e-9, `r32[${k}]`))
      // E.1: applicable × MAX(rate × average PBT of the 3 preceding FYs, 0).
      const csr = by(pl, 'Fin-IGAAP!34'), app = v(csr.children, 'Fin-IGAAP!403')
      const avg = csr.children!.find((c) => c.id.endsWith('.avg'))!.values
      csr.values.forEach((c, k) => expectClose(c, -app[k] * Math.max(r.inputs.csr.rate * avg[k], 0), 1e-9, `r34[${k}]`))
      // DSCR = r138 / r141 in the window; average = Σ r136 / Σ r141 over it.
      const dscr = st('dscr').rows, ratio = by(dscr, 'Fin-IGAAP!142')
      ratio.values.forEach((x, k) => {
        if (Number.isFinite(x)) expectClose(x, ratio.children![0].values[k] / ratio.children![1].values[k], 1e-12, 'r142')
      })
      const avgRow = by(dscr, 'Fin-IGAAP!143'), [num, den] = avgRow.children!
      expectClose(avgRow.total, num.total / den.total, 1e-12, 'D143')
      // IRR rows: the IRR of the flow row they list (V16 shows it in the last FY and the total).
      for (const n169 of [169, 170, 171, 172]) {
        const irr = by(st('irr').rows, `Fin-IGAAP!${n169}`)
        expect(irr.children!.map((c) => c.source)).toEqual([`Fin-IGAAP!${n169 - 4}`])
        expect(irr.values[n - 1]).toBe(irr.total)
      }
    })

    it('V16 numbering in ids and num', () => {
      const ids = (key: Statement['key']) => st(key).rows.map((x) => x.id)
      expect(ids('pl')).toEqual(expect.arrayContaining(['pl.A.1', 'pl.A.5', 'pl.B.7', 'pl.B.10', 'pl.C', 'pl.F', 'pl.r13']))
      expect(ids('bs')).toEqual(expect.arrayContaining(['bs.A.12', 'bs.B.8', 'bs.r63']))
      expect(ids('cf')).toEqual(expect.arrayContaining(['cf.A.1', 'cf.A.22', 'cf.B.src.A.5', 'cf.B.app.B.8', 'cf.C.r121']))
      expect(ids('dscr')).toEqual(expect.arrayContaining(['dscr.B', 'dscr.C', 'dscr.F', 'dscr.r128']))
      expect(ids('irr')).toEqual(expect.arrayContaining(['irr.A', 'irr.I', 'irr.HY.E', 'irr.MA.I']))
      const b7 = st('pl').rows.find((x) => x.id === 'pl.B.7')!
      expect([b7.num, b7.source]).toEqual(['B.7', 'Fin-IGAAP!20'])
      expect(st('dscr').rows.find((x) => x.id === 'dscr.r128')!.num).toBe('Add')
    })
  })
}

describe('v16 IGAAP statements: drill-down content (sample)', () => {
  const r = runV16(inputsFor('sample')), s = buildIgaap(r)
  const find = (id: string) => {
    for (const x of s.statements) for (const { row } of walk(x.rows)) if (row.id === id) return row
    throw new Error(`no row ${id}`)
  }

  it('revenue → instalments by date; interest on funds → its four funds', () => {
    const a1 = find('pl.A.1')
    expect(a1.children).toHaveLength(r.grid.annuities.length)
    expect(a1.children![0].label).toBe('Annuity 1, 15-Sep-2030')
    expect(find('pl.A.5').children!.map((c) => c.source)).toEqual(
      ['Fin-IGAAP!296', 'Fin-IGAAP!288', 'Fin-IGAAP!334', 'Fin-IGAAP!350'])
  })

  it('intangible → opening, additions (capitalised cost by line less grant), amortisation', () => {
    const b1 = find('bs.B.1')
    expect(b1.children!.map((c) => c.source)).toEqual(['Fin-IGAAP!238', 'Fin-IGAAP!239', 'Fin-IGAAP!240'])
    const add = b1.children![1].children!
    expect(add.map((c) => c.label)).toContain('Interest - Construction Period')
    expectClose(add.find((c) => c.label === 'EPC Cost - Fixed')!.total, 1750, 1e-6, 'EPC fixed')
    expectClose(add.find((c) => c.label.startsWith('Less: Grant'))!.total, -970.6389041095891, 1e-6, 'grant')
  })

  it('tax → PBT, + book dep, − tax dep, − b/f loss, × rate', () => {
    expect(find('pl.E.2').children!.map((c) => c.source)).toEqual(['Fin-IGAAP!262', 'Fin-IGAAP!263', 'Fin-IGAAP!264',
      'Fin-IGAAP!265', 'Fin-IGAAP!266', 'Fin-IGAAP!267', "'Fin Set'!B11", 'Fin-IGAAP!268'])
  })
})
