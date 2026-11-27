import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useStore } from '../state/store'
import { Build } from './Build'
import { Capital } from './Capital'
import { Deal } from './Deal'
import { Income } from './Income'
import { Operations } from './Operations'
import { Phasing } from './Phasing'
import { Statements } from './Statements'

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } // jsdom lacks it

const wrap = (ui: React.ReactNode) => render(<TooltipProvider>{ui}</TooltipProvider>)
/** Value shown next to a <dt> label in a stat tile. */
const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent

beforeEach(() => { useStore.setState(useStore.getInitialState(), true); window.location.hash = '' })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('sections', () => {
  it.each([['Deal', Deal], ['Build', Build], ['Phasing', Phasing], ['Capital', Capital], ['Income', Income], ['Operations', Operations], ['Statements', Statements]])(
    '%s renders with defaults and shows a chart or table', (_, View) => {
      const { container } = wrap(<View />)
      expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
      expect(container.querySelectorAll('figure, table').length).toBeGreaterThan(0)
      expect(container.textContent).not.toMatch(/NaN|undefined/)
    })

  it('changing Bid Price in Deal updates total completion payments in Income', () => {
    vi.useFakeTimers()
    wrap(<><Deal /><Income /></>)
    const before = stat('Total completion payments')
    fireEvent.change(screen.getByLabelText('Bid Price'), { target: { value: '2,500' } })
    act(() => { vi.advanceTimersByTime(500) })
    const after = stat('Total completion payments')
    expect(after).toMatch(/₹/)
    expect(after).not.toBe(before)
  })

  it('a jump to a field that is not mounted focuses the section heading', () => {
    window.location.hash = '#/deal?focus=capital.buildRate'
    wrap(<Deal />)
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
  })

  it('a jump to a mounted field focuses that field, not the heading', async () => {
    window.location.hash = '#/deal?focus=deal.authorityEstimate'
    wrap(<Deal />)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Authority Estimate')))
  })

  it('header links its health summary to Health, filtered to the section', () => {
    wrap(<Operations />)
    const chip = screen.getByRole('link', { name: /warning/ })
    expect(chip.getAttribute('href')).toBe('#/health?section=operations')
  })

  it("statements show the original's IGAAP profit and loss (temporary view), negatives in parentheses", () => {
    wrap(<Statements />)
    const pl = screen.getByRole('region', { name: 'Profit and Loss Statement, as per IGAAP' })
    expect(pl.textContent).toMatch(/FY27.*FY45/)
    expect(pl.textContent).toMatch(/\(\d[\d,]*\.\d\d\)/)
    expect(pl.textContent).not.toMatch(/NaN/)
  })

  it('Capital shows the short-term loan and the DSR, FFE and MMR funds', () => {
    wrap(<Capital />)
    for (const t of ['Short-term loan (STL)', 'Debt Service Reserve (DSR)', 'Funds for Expenses (FFE)', 'Major Maintenance Reserve (MMR)'])
      expect(screen.getByRole('heading', { name: t }), t).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Short-term loan (STL)' }).parentElement!.textContent).toMatch(/₹225\.00 Cr.*Peak balance ₹196\.88 Cr/)
    expect(screen.getByLabelText('Senior debt and fund balances at each financial year end')).toBeTruthy()
  })

  it("Build shows the original's project cost, with patrol rental and finance & legal from build days", () => {
    wrap(<Build />)
    expect(stat('Total project cost')).toBe('₹2,465.69 Cr')
    expect(screen.getByRole('rowheader', { name: 'Finance & legal (from build days)' }).parentElement!.textContent).toContain('4.97')
    expect(screen.queryByLabelText('Patrol Vehicles (Rental)')).toBeNull() // hidden: the engine derives it
    expect(screen.getByLabelText('Patrol Rental (per month)')).toBeTruthy()
  })

  it('Phasing offers the Schedule G option and the manual phasing list', () => {
    wrap(<Phasing />)
    expect(screen.getByText('Manual EPC Phasing')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Monthly construction schedule' }).textContent).toContain('(after COD)')
  })

  it.each([['Phasing', Phasing], ['Statements', Statements]])('%s sits behind the results gate in a blank project', (_, View) => {
    useStore.getState().createProject('blank')
    const { container } = wrap(<View />)
    expect(screen.getByText(/^Fill in \d+ more fields to see results$/)).toBeTruthy()
    expect(container.querySelectorAll('figure, [role="tablist"]').length).toBe(0) // the milestone input list is a table; results are not
    expect(screen.queryByText(/^(Monthly construction schedule|Income statement)$/)).toBeNull()
  })
})
