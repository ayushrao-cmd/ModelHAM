import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toDay } from '../../engine/dates'
import type { Row, Statement, StatementSet } from '../../engine/v16/types'
import { StatementTable, statementCsv } from './StatementTable'
import { StatementsView } from './StatementsView'

// 19 FYs, FY27–FY45, as the sample.
const N = 19
const years = Array.from({ length: N }, (_, k) => toDay(`${2027 + k}-03-31`))
const FYS = years.map((_, k) => `FY${27 + k}`)
const each = (f: (k: number) => number) => Array.from({ length: N }, (_, k) => f(k))
const r = (id: string, num: string | undefined, label: string, values: number[], kind: Row['kind'] = 'line', extra: Partial<Row> = {}): Row =>
  ({ id, ...(num ? { num } : {}), label, values, total: values.reduce((a, b) => a + b, 0), kind, unit: 'money', ...extra })
const NAN = each(() => NaN)

const deep = r('pl.A.1.1.1', undefined, 'Annuity instalment', each(() => 6), 'line', {
  children: [r('pl.A.1.1.1.x', undefined, 'Instalment share', each(() => 6), 'line', {
    children: [r('pl.A.1.1.1.x.y', undefined, 'Beyond the contract depth', each(() => 6))],
  })],
})
const income = r('pl.A.1', 'A.1', 'Revenue from operations', each(() => 10), 'line', {
  formula: 'Completion payment plus O&M payment', source: 'Fin-IGAAP!8',
  children: [
    r('pl.A.1.1', undefined, 'Completion payment', each(() => 6), 'line', { children: [deep] }),
    r('pl.A.1.2', undefined, 'O&M payment', each(() => 4)),
  ],
})
const pl = (first: string): Statement => ({
  key: 'pl', title: 'Profit and loss',
  rows: [{ ...r('pl.A', 'A.', 'Income', NAN, 'header'), total: NaN }, income, r('pl.r9', undefined, first, each(() => 1)),
    r('pl.B.1', 'B.1', 'Finance cost', each(k => (k === 0 ? -2.5 : k === 1 ? -3 : 0))),
    r('pl.r12', undefined, 'Units', each(k => k + 1), 'line', { unit: 'count' }),
    r('pl.C', 'C.', 'Profit after tax', each(() => 8.5), 'total')],
})
const bs: Statement = {
  key: 'bs', title: 'Balance sheet',
  rows: [r('bs.A.1', 'A.1', 'Total assets', each(() => 100), 'subtotal'), { ...r('bs.r64', undefined, 'Check', each(() => 0.004), 'check'), total: NaN }],
}
const cf: Statement = { key: 'cf', title: 'Cash flow', rows: [r('cf.A.1', 'A.1', 'Closing cash', each(() => 5), 'total')] }
const dscr: Statement = { key: 'dscr', title: 'DSCR', rows: [{ ...r('dscr.r142', undefined, 'DSCR', each(k => (k < 3 ? NaN : 1.3)), 'line', { unit: 'ratio' }), total: NaN }] }
const irr: Statement = { key: 'irr', title: 'IRR', rows: [{ ...r('irr.r172', undefined, 'Post-tax equity IRR', each(() => 0), 'line', { unit: 'pct' }), total: 0.1234 }] }
const zero = each(() => 0)
const set = (standard: StatementSet['standard'], checks: StatementSet['checks'] = { bs: zero, cash: zero }): StatementSet =>
  ({ standard, years, checks, statements: [pl(standard === 'indas' ? 'Notional Income as per IndAS' : 'Other income'), bs, cf, dscr, irr] })
const sets = { igaap: set('igaap'), indas: set('indas') }
const cells = (name: RegExp) => [...screen.getByRole('row', { name }).querySelectorAll('td')].map(td => td.textContent)

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('StatementTable', () => {
  const view = (st: Statement = pl('Other income')) => render(<StatementTable statement={st} years={years} />)

  it('shows FY27 to FY45 plus Total, V16 numbering, and accounting negatives', () => {
    view()
    expect(screen.getAllByRole('columnheader').map(h => h.textContent).slice(1)).toEqual([...FYS, 'Total'])
    const row = screen.getByRole('row', { name: /Finance cost/ })
    expect(row.textContent).toContain('B.1')
    expect(row.textContent).not.toContain('pl.')
    expect(cells(/Finance cost/).slice(0, 3)).toEqual(['(2.50)', '(3.00)', '–'])
    expect(cells(/Finance cost/)[N]).toBe('(5.50)')
    expect(row.textContent).not.toMatch(/-\d/)
    // A row V16 does not number shows no number (not its id).
    expect(screen.getByRole('rowheader', { name: /Other income/ }).textContent).not.toMatch(/r9/)
  })

  it('formats by unit: counts as integers, ratios as ×, percentages, and NaN as a blank cell', () => {
    view()
    expect(cells(/Units/).slice(0, 2)).toEqual(['1', '2'])
    expect(cells(/Units/)[N]).toBe('190')
    expect(cells(/^A\. Income/)).toEqual(each(() => 0).concat(0).map(() => '')) // header: every cell blank
    cleanup()
    view(dscr)
    expect(cells(/DSCR/).slice(0, 4)).toEqual(['', '', '', '1.30×'])
    expect(cells(/DSCR/)[N]).toBe('')
    cleanup()
    view(irr)
    expect(cells(/equity IRR/)[N]).toBe('12.34%')
    expect(cells(/equity IRR/)[0]).toBe('–')
    expect(document.body.textContent).not.toMatch(/NaN/)
  })

  it('the chevron toggles, the label selects: separate buttons', async () => {
    const user = userEvent.setup()
    view()
    const panel = screen.getByRole('complementary', { name: 'Line detail' })
    const chevron = screen.getByRole('button', { name: 'Breakdown of Revenue from operations' })
    expect(chevron.getAttribute('aria-expanded')).toBe('false')
    await user.click(chevron)
    expect(chevron.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('row', { name: /Completion payment/ }).textContent).toMatch(/6\.00.*114\.00/)
    expect(panel.textContent).toMatch(/Select a line/) // toggling does not select

    const label = screen.getByRole('button', { name: /^A\.1 Revenue from operations/ })
    await user.click(label)
    expect(label.getAttribute('aria-pressed')).toBe('true')
    expect(chevron.getAttribute('aria-expanded')).toBe('true') // selecting does not toggle
    expect(panel.textContent).toContain('Completion payment plus O&M payment')
    expect(panel.textContent).toContain('Fin-IGAAP!8')
    await user.click(screen.getByRole('button', { name: /Finance cost/ }))
    expect(panel.textContent).toMatch(/No formula recorded/)
    expect(label.getAttribute('aria-pressed')).toBe('false')
  })

  it('leaf rows have no chevron', () => {
    view()
    expect(screen.queryByRole('button', { name: /Breakdown of Finance cost/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Finance cost/ }).hasAttribute('aria-expanded')).toBe(false)
  })

  it('keyboard: Tab reaches the region, then the chevron and the label; Enter and Space toggle; Escape clears', async () => {
    const user = userEvent.setup()
    view()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Profit and loss' }))
    await user.tab()
    const chevron = screen.getByRole('button', { name: 'Breakdown of Revenue from operations' })
    expect(document.activeElement).toBe(chevron)
    await user.keyboard('{Enter}')
    expect(chevron.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Completion payment')).toBeTruthy()
    await user.keyboard(' ')
    expect(chevron.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Completion payment')).toBeNull()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^A\.1 Revenue from operations/ }))
    await user.keyboard('{Enter}')
    const panel = screen.getByRole('complementary', { name: 'Line detail' })
    expect(panel.textContent).toContain('Fin-IGAAP!8')
    await user.keyboard('{Escape}')
    expect(panel.textContent).toMatch(/Select a line/)
  })

  it('nests to depth 3 (the contract), no deeper, and collapsing a parent clears a hidden selection', async () => {
    const user = userEvent.setup()
    view()
    await user.click(screen.getByRole('button', { name: 'Breakdown of Revenue from operations' }))
    await user.click(screen.getByRole('button', { name: 'Breakdown of Completion payment' }))
    await user.click(screen.getByRole('button', { name: 'Breakdown of Annuity instalment' }))
    const d3 = screen.getByRole('rowheader', { name: /Instalment share/ })
    expect(d3.style.paddingLeft).toBe('3.75rem')
    expect(screen.queryByRole('button', { name: /Breakdown of Instalment share/ })).toBeNull()
    expect(screen.queryByText('Beyond the contract depth')).toBeNull()

    await user.click(screen.getByRole('button', { name: /Instalment share/ }))
    const panel = screen.getByRole('complementary', { name: 'Line detail' })
    expect(panel.textContent).toContain('Instalment share')
    await user.click(screen.getByRole('button', { name: 'Breakdown of Revenue from operations' }))
    expect(screen.queryByText('Instalment share')).toBeNull()
    expect(panel.textContent).toMatch(/Select a line/)
  })

  it('the detail panel is not a live region', () => {
    view()
    expect(screen.getByRole('complementary', { name: 'Line detail' }).hasAttribute('aria-live')).toBe(false)
  })

  it('the selected row keeps its highlight on hover; every cell, the sticky label too, stays opaque', async () => {
    const user = userEvent.setup()
    view()
    await user.click(screen.getByRole('button', { name: /^A\.1 Revenue from operations/ }))
    const picked = screen.getByRole('row', { name: /A\.1 Revenue/ })
    const other = screen.getByRole('row', { name: /Finance cost/ })
    for (const c of picked.children) {
      expect(c.className).not.toMatch(/hover:/)
      expect(c.className).toContain('bg-card') // opaque base, tint layered on top
      expect(c.className).toContain('background-image')
    }
    for (const c of other.children) {
      expect(c.className).toContain('bg-card')
      expect(c.className).toContain('group-hover:bg-muted') // opaque hover, no translucent flicker
    }
  })

  it('19 FYs in a 390 px container: the table scrolls inside its focusable region, labels stay sticky', () => {
    const { container } = view()
    ;(container as HTMLElement).style.width = '390px'
    const region = screen.getByRole('region', { name: 'Profit and loss' })
    expect(region.tabIndex).toBe(0) // keyboard users can scroll it
    expect(region.className).toContain('overflow-x-auto')
    const table = within(region).getByRole('table')
    expect(table.querySelectorAll('thead th')).toHaveLength(N + 2)
    // The page never scrolls sideways: the region is the only overflow container, so the grid column must shrink.
    expect(region.parentElement!.className).toContain('min-w-0')
    for (const tr of table.querySelectorAll('tr')) expect(tr.firstElementChild!.className).toMatch(/sticky left-0/)
    region.scrollLeft = 600
    fireEvent.scroll(region)
    expect(screen.getByRole('rowheader', { name: /Finance cost/ })).toBeTruthy()
  })

  it('CSV flattens the tree with depth and indent to the screen depth, NaN as an empty cell', () => {
    const csv = statementCsv(pl('Other income'), years).split('\n')
    expect(csv[0]).toBe(['No.', 'Line', 'Depth', ...FYS, 'Total'].join(','))
    expect(csv[1]).toBe(`A.,Income,0,${','.repeat(N)}`)
    expect(csv).toContain(`A.1,Revenue from operations,0,${each(() => 10).join(',')},190`)
    expect(csv).toContain(`,  Completion payment,1,${each(() => 6).join(',')},114`)
    expect(csv).toContain(`,      Instalment share,3,${each(() => 6).join(',')},114`)
    expect(csv.join('\n')).not.toContain('Beyond the contract depth')
    expect(csv.join('\n')).not.toMatch(/NaN/)
    const d = statementCsv(dscr, years).split('\n')[1]
    expect(d).toBe(`,DSCR,0,,,,${each(() => 1.3).slice(3).join(',')},`)
  })
})

describe('StatementsView', () => {
  it('has the standard switch and the five statement tabs', () => {
    render(<StatementsView sets={sets} />)
    expect(screen.getByRole('group', { name: 'Accounting standard' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'IGAAP' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['P&L', 'Balance Sheet', 'Cash Flow', 'DSCR', 'IRR'])
    expect(screen.getByRole('tab', { name: 'P&L' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Other income')).toBeTruthy()
  })

  it('opens on the standard and tab it is given (from ?std= and ?tab=), ignoring unknown values', () => {
    const { rerender } = render(<StatementsView sets={sets} standard="indas" tab="pl" />)
    expect(screen.getByRole('button', { name: 'IndAS' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Notional Income as per IndAS')).toBeTruthy()
    rerender(<StatementsView sets={sets} standard="nope" tab="bogus" />)
    expect(screen.getByRole('button', { name: 'IGAAP' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('tab', { name: 'P&L' }).getAttribute('aria-selected')).toBe('true')
  })

  it('reports switches through onChange so the parent can write the URL', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StatementsView sets={sets} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'IndAS' }))
    expect(onChange).toHaveBeenLastCalledWith({ standard: 'indas', tab: 'pl' })
    expect(screen.getByText('Notional Income as per IndAS')).toBeTruthy() // uncontrolled: switches itself
    await user.click(screen.getByRole('tab', { name: 'Balance Sheet' }))
    expect(onChange).toHaveBeenLastCalledWith({ standard: 'indas', tab: 'bs' })
    expect(screen.getByRole('region', { name: 'Balance sheet' })).toBeTruthy()
  })

  it.each(['igaap', 'indas'] as const)('check banners pass for %s when every year balances and cash stays non-negative', std => {
    const { rerender } = render(<StatementsView sets={sets} standard={std} tab="bs" />)
    expect(screen.getByRole('status').textContent).toMatch(/Balances in every year/)
    // The check row's 0.004 gaps display as nil, with the same tie as the banner.
    expect(screen.getByRole('row', { name: /Check/ }).querySelector('th')!.className).not.toContain('text-destructive')
    rerender(<StatementsView sets={sets} standard={std} tab="cf" />)
    expect(screen.getByRole('status').textContent).toMatch(/Cash is non-negative in every year/)
    rerender(<StatementsView sets={sets} standard={std} tab="pl" />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('check banners name the first failing FY and its gap, in parentheses when negative', () => {
    const gaps = (xs: number[]) => each(k => xs[k] ?? 0)
    const bad = (checks: StatementSet['checks']) => ({ igaap: set('igaap', checks), indas: sets.indas })
    const { rerender } = render(<StatementsView sets={bad({ bs: gaps([0.004, -3, 0.4]), cash: gaps([0, 1]) })} tab="bs" />)
    expect(screen.getByRole('status').textContent).toMatch(/Out of balance in FY28 by \(₹3\.00 Cr\)/)
    rerender(<StatementsView sets={bad({ bs: gaps([0, 0.005]), cash: zero })} tab="bs" />)
    expect(screen.getByRole('status').textContent).toMatch(/Out of balance in FY28 by ₹0\.01 Cr/)
    rerender(<StatementsView sets={bad({ bs: zero, cash: gaps([0, 1]) })} tab="cf" />)
    expect(screen.getByRole('status').textContent).toMatch(/Cash is negative in FY28/)
  })

  it('a NaN gap or a missing year fails the check', () => {
    const { rerender } = render(<StatementsView sets={{ igaap: set('igaap', { bs: each(k => (k === 4 ? NaN : 0)), cash: zero }), indas: sets.indas }} tab="bs" />)
    expect(screen.getByRole('status').textContent).toMatch(/Out of balance in FY31/)
    expect(screen.getByRole('status').textContent).not.toMatch(/NaN|Balances/)
    rerender(<StatementsView sets={{ igaap: set('igaap', { bs: zero.slice(0, 10), cash: zero }), indas: sets.indas }} tab="bs" />)
    expect(screen.getByRole('status').textContent).toMatch(/Out of balance in FY37/)
  })

  it('a failing check row shows in the destructive colour', () => {
    const failing: Statement = { ...bs, rows: [bs.rows[0], { ...bs.rows[1], values: each(k => (k === 2 ? 1.5 : 0)) }] }
    render(<StatementTable statement={failing} years={years} />)
    const row = screen.getByRole('row', { name: /Check/ })
    expect(row.querySelector('th')!.className).toContain('text-destructive')
    expect(cells(/Check/)[2]).toBe('1.50')
  })

  it('copies the current statement as CSV with child rows', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<StatementsView sets={sets} standard="indas" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Copy CSV/ })) })
    const csv: string = writeText.mock.calls[0][0]
    expect(csv).toContain('Notional Income as per IndAS')
    expect(csv).toContain('    Annuity instalment,2,')
  })
})
