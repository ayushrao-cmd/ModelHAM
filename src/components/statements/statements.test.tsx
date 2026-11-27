import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toDay } from '../../engine/dates'
import { type Row, type StatementSet, StatementTable, statementCsv } from './StatementTable'
import { StatementsView } from './StatementsView'

const years = ['2027-03-31', '2028-03-31', '2029-03-31'].map(toDay)
const r = (id: string, label: string, values: number[], kind: Row['kind'] = 'line', extra: Partial<Row> = {}): Row =>
  ({ id, label, values, total: values.reduce((a, b) => a + b, 0), kind, ...extra })

const income = r('pl.A.1', 'Revenue from operations', [10, 20, 30], 'line', {
  formula: 'Completion payment plus O&M payment', source: 'Fin-IGAAP!8',
  children: [
    r('pl.A.1.1', 'Completion payment', [6, 12, 18], 'line', {
      children: [r('pl.A.1.1.1', 'Annuity instalment', [6, 12, 18])],
    }),
    r('pl.A.1.2', 'O&M payment', [4, 8, 12]),
  ],
})
const pl = (first: string): StatementSet['statements'][number] => ({
  key: 'pl', title: 'Profit and loss',
  rows: [r('pl.A', 'Income', [0, 0, 0], 'header'), income, r('pl.A.2', first, [1, 1, 1]),
    r('pl.B.1', 'Finance cost', [-2.5, -3, -1]), r('pl.C', 'Profit after tax', [8.5, 18, 30], 'total')],
})
const bs: StatementSet['statements'][number] = {
  key: 'bs', title: 'Balance sheet',
  rows: [r('bs.A.1', 'Total assets', [100, 90, 80], 'subtotal'), r('bs.C', 'Check', [0, 0, 0], 'check')],
}
const cf: StatementSet['statements'][number] = { key: 'cf', title: 'Cash flow', rows: [r('cf.A.1', 'Closing cash', [5, 6, 7], 'total')] }
const set = (standard: StatementSet['standard'], checks: StatementSet['checks'] = { bs: [0, 0, 0], cash: [0, 0, 0] }): StatementSet =>
  ({ standard, years, checks, statements: [pl(standard === 'indas' ? 'Notional Income as per IndAS' : 'Other income'), bs, cf,
    { key: 'dscr', title: 'DSCR', rows: [r('dscr.A.1', 'DSCR', [0, 1.3, 1.4])] },
    { key: 'irr', title: 'IRR', rows: [r('irr.A.1', 'Equity cash flow', [-50, 10, 60])] }] })
const sets = { igaap: set('igaap'), indas: set('indas') }

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('StatementTable', () => {
  const view = () => render(<StatementTable statement={pl('Other income')} years={years} />)

  it('shows FY columns plus Total, V16 numbering without the statement prefix, and accounting negatives', () => {
    view()
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent)
    expect(headers.slice(1)).toEqual(['FY27', 'FY28', 'FY29', 'Total'])
    const row = screen.getByRole('row', { name: /Finance cost/ })
    expect(row.textContent).toContain('B.1')
    expect(row.textContent).not.toContain('pl.')
    expect(row.textContent).toContain('(2.50)')
    expect(row.textContent).toContain('(6.50)') // total
    expect(row.textContent).not.toMatch(/-\d/)
  })

  it('expands a row with children by click and by keyboard, nested, with per-FY amounts', () => {
    view()
    expect(screen.queryByText('Completion payment')).toBeNull()
    const toggle = screen.getByRole('button', { name: /Revenue from operations/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const child = screen.getByRole('row', { name: /Completion payment/ })
    expect(child.textContent).toMatch(/6\.00.*12\.00.*18\.00.*36\.00/)
    expect(screen.getByRole('row', { name: /O&M payment/ }).textContent).toContain('A.1.2')
    expect(screen.queryByText('Annuity instalment')).toBeNull()

    // A native <button>: browsers turn Enter and Space into a click (detail 0), which jsdom doesn't synthesise from keydown.
    const nested = screen.getByRole('button', { name: /Completion payment/ })
    expect(nested.tagName).toBe('BUTTON')
    expect(nested.getAttribute('type')).toBe('button')
    nested.focus()
    fireEvent.click(nested, { detail: 0 })
    expect(nested.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('row', { name: /Annuity instalment/ }).textContent).toContain('A.1.1.1')
    fireEvent.click(nested, { detail: 0 })
    expect(nested.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Annuity instalment')).toBeNull()

    fireEvent.click(toggle) // collapsing the parent hides the whole subtree
    expect(screen.queryByText('Completion payment')).toBeNull()
  })

  it('leaf rows have no expand state', () => {
    view()
    expect(screen.getByRole('button', { name: /Finance cost/ }).hasAttribute('aria-expanded')).toBe(false)
  })

  it('the side panel shows the selected row formula and source', () => {
    view()
    const panel = screen.getByRole('complementary', { name: 'Line detail' })
    expect(panel.textContent).toMatch(/Select a line/)
    fireEvent.click(screen.getByRole('button', { name: /Revenue from operations/ }))
    expect(panel.textContent).toContain('Completion payment plus O&M payment')
    expect(panel.textContent).toContain('Fin-IGAAP!8')
    fireEvent.click(screen.getByRole('button', { name: /Finance cost/ }))
    expect(panel.textContent).toMatch(/No formula recorded/)
  })

  it('CSV flattens the whole tree with depth and indent, expanded or not', () => {
    const csv = statementCsv(pl('Other income'), years).split('\n')
    expect(csv[0]).toBe('No.,Line,Depth,FY27,FY28,FY29,Total')
    expect(csv).toContain('A.1,Revenue from operations,0,10,20,30,60')
    expect(csv).toContain('A.1.1,  Completion payment,1,6,12,18,36')
    expect(csv).toContain('A.1.1.1,    Annuity instalment,2,6,12,18,36')
    expect(csv).toContain('B.1,Finance cost,0,-2.5,-3,-1,-6.5')
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

  it('reports switches through onChange so the parent can write the URL', () => {
    const onChange = vi.fn()
    render(<StatementsView sets={sets} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'IndAS' }))
    expect(onChange).toHaveBeenLastCalledWith({ standard: 'indas', tab: 'pl' })
    expect(screen.getByText('Notional Income as per IndAS')).toBeTruthy() // uncontrolled: switches itself
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Balance Sheet' })) // Radix tabs activate on mousedown
    expect(onChange).toHaveBeenLastCalledWith({ standard: 'indas', tab: 'bs' })
    expect(screen.getByRole('region', { name: 'Balance sheet' })).toBeTruthy()
  })

  it.each(['igaap', 'indas'] as const)('check banners pass for %s when every year balances and reconciles', std => {
    const { rerender } = render(<StatementsView sets={sets} standard={std} tab="bs" />)
    expect(screen.getByRole('status').textContent).toMatch(/Balances in every year/)
    rerender(<StatementsView sets={sets} standard={std} tab="cf" />)
    expect(screen.getByRole('status').textContent).toMatch(/Reconciles in every year/)
    rerender(<StatementsView sets={sets} standard={std} tab="pl" />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('check banners name the first failing FY and its gap', () => {
    const bad = { igaap: set('igaap', { bs: [0, 0.4, -3], cash: [0.004, -1.25, 0] }), indas: sets.indas }
    const { rerender } = render(<StatementsView sets={bad} tab="bs" />)
    expect(screen.getByRole('status').textContent).toMatch(/Out of balance in FY28 by ₹0\.40 Cr/)
    rerender(<StatementsView sets={bad} tab="cf" />)
    expect(screen.getByRole('status').textContent).toMatch(/Does not reconcile in FY28 by -₹1\.25 Cr/)
  })

  it('copies the current statement as CSV with child rows', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<StatementsView sets={sets} standard="indas" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Copy CSV/ })) })
    const csv: string = writeText.mock.calls[0][0]
    expect(csv).toContain('Notional Income as per IndAS')
    expect(csv).toContain('A.1.1.1,    Annuity instalment,2,6,12,18,36')
  })

  it('the table scrolls inside its own region', () => {
    render(<StatementsView sets={sets} />)
    const region = screen.getByRole('region', { name: 'Profit and loss' })
    expect(region.className).toContain('overflow-x-auto')
    expect(within(region).getByRole('table')).toBeTruthy()
  })
})
