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

  it('statements open on the tab named in the URL and keep the tab in the URL when switched', () => {
    window.location.hash = '#/statements?tab=bs'
    wrap(<Statements />)
    expect(screen.getByRole('tab', { name: 'Balance Sheet' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(/^Balance sheet balances at every FY end/)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Balance sheet' }).textContent).toMatch(/FY27.*COD/)
    const cf = screen.getByRole('tab', { name: 'Cash Flow' })
    fireEvent.mouseDown(cf) // Radix tabs activate on mousedown
    expect(cf.getAttribute('aria-selected')).toBe('true')
    expect(window.location.hash).toBe('#/statements?tab=cf')
    expect(screen.getByText(/^Closing cash equals balance-sheet cash/)).toBeTruthy()
  })

  it('statements show negatives in parentheses', () => {
    wrap(<Statements />)
    const is = screen.getByRole('region', { name: 'Income statement' })
    expect(is.textContent).toMatch(/\(\d[\d,]*\.\d\d\)/)
    expect(is.textContent).not.toMatch(/-\d/)
  })

  it.each([['Phasing', Phasing], ['Statements', Statements]])('%s sits behind the results gate in a blank project', (_, View) => {
    useStore.getState().createProject('blank')
    const { container } = wrap(<View />)
    expect(screen.getByText(/^Fill in \d+ more fields to see results$/)).toBeTruthy()
    expect(container.querySelectorAll('figure, [role="tablist"]').length).toBe(0) // the milestone input list is a table; results are not
    expect(screen.queryByText(/^(Monthly construction schedule|Income statement)$/)).toBeNull()
  })
})
