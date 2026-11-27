import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DEFAULT_INPUTS } from '../engine/defaults'
import type { Check } from '../engine/health'
import { useStore } from '../state/store'
import { CheckFlipToasts, flipSummary, Health } from './Health'
import { Overview } from './Overview'
import { Returns } from './Returns'
import { Scenarios } from './Scenarios'

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } // jsdom lacks it

const wrap = (ui: React.ReactNode) => render(<TooltipProvider>{ui}</TooltipProvider>)
const activeInputs = () => { const s = useStore.getState(); return s.scenarios.find(x => x.id === s.activeId)!.inputs }

beforeEach(() => { useStore.setState(useStore.getInitialState(), true); window.location.hash = '' })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('Overview', () => {
  it("shows the original workbook's headline numbers at the sample, and no delta while the base is active", () => {
    wrap(<Overview />)
    const tile = (name: RegExp) => screen.getByRole('group', { name }).textContent
    expect(tile(/^Equity IRR/)).toContain('15.09%') // half-yearly XIRR
    expect(tile(/^Project IRR, pre-tax/)).toContain('11.76%') // annual
    expect(tile(/^Project IRR, post-tax/)).toContain('10.43%')
    expect(tile(/^Min DSCR/)).toContain('1.20×')
    expect(tile(/^Avg DSCR/)).toContain('1.47×')
    expect(tile(/^Equity IRR/)).not.toMatch(/vs base/)
  })

  it('shows a delta against the base once another scenario is active', () => {
    const s = useStore.getState()
    const id = s.createScenario('Higher bid')
    s.setActive(id)
    s.setInput('deal.bidPrice', DEFAULT_INPUTS.deal.bidPrice + 100)
    wrap(<Overview />)
    expect(screen.getByRole('group', { name: /^Equity IRR/ }).textContent).toMatch(/vs base/)
  })

  it('solves Bid Price for the target IRR and Apply sets it', () => {
    wrap(<Overview />)
    fireEvent.click(screen.getByRole('button', { name: 'Solve' }))
    const result = screen.getByRole('status', { name: /solve result/i })
    expect(result.textContent).toMatch(/Bid Price ₹[\d,.]+ Cr gives 15\.00%/)
    fireEvent.click(within(result).getByRole('button', { name: /Apply/ }))
    const bid = activeInputs().deal.bidPrice
    expect(bid).not.toBe(DEFAULT_INPUTS.deal.bidPrice)
    expect(result.textContent ?? '').not.toMatch(/Apply/)
  })
})

describe('Returns', () => {
  it('renders the IRR table with every IRR the original reports, charts and the Targets inputs', () => {
    const { container } = wrap(<Returns />)
    const irr = (name: string) => screen.getByRole('rowheader', { name }).parentElement!.textContent
    expect(irr('Equity, post-tax (half-yearly)')).toContain('15.09%')
    expect(irr('Equity, pre-tax (half-yearly)')).toContain('18.32%')
    expect(irr('Equity, post-tax (annual)')).toContain('15.48%')
    expect(irr('Equity, pre-tax (annual)')).toContain('18.81%')
    expect(irr('Equity, post-tax, mobilisation-advance adjusted')).toContain('16.74%')
    expect(irr('Equity, pre-tax, mobilisation-advance adjusted')).toContain('20.49%')
    expect(irr('Project, pre-tax (annual)')).toContain('11.76%')
    expect(irr('Project, post-tax (annual)')).toContain('10.43%')
    expect(screen.getByLabelText('Debt service coverage ratio (DSCR), by financial year')).toBeTruthy()
    expect(screen.getByLabelText('Equity IRR Hurdle')).toBeTruthy()
    expect(container.querySelectorAll('figure').length).toBeGreaterThanOrEqual(3)
    expect(container.textContent).not.toMatch(/NaN|undefined/)
  })
})

describe('Health', () => {
  it('filters by ?section= and by status', () => {
    window.location.hash = '#/health?section=operations'
    wrap(<Health />)
    const groups = screen.getAllByRole('region', { name: /checks$/ })
    expect(groups.map(g => g.getAttribute('aria-label'))).toEqual(['Operations checks'])
    const items = () => within(screen.getByRole('region', { name: 'Operations checks' })).getAllByRole('listitem')
    expect(items().some(li => !li.textContent!.startsWith('Passed'))).toBe(true) // defaults fail the O&M margin warning
    fireEvent.click(screen.getByRole('button', { name: /^Passed/ }))
    expect(items().length).toBeGreaterThan(0)
    expect(items().every(li => li.textContent!.startsWith('Passed'))).toBe(true)
  })

  it('lists the method notes in their own group, reachable as ?section=notes', () => {
    window.location.hash = '#/health?section=notes'
    wrap(<Health />)
    const notes = screen.getByRole('region', { name: 'Method notes' })
    expect(within(notes).getAllByRole('listitem').length).toBeGreaterThanOrEqual(8)
    expect(notes.textContent).toMatch(/Method note B-Q5.*original 1\.47×/)
    expect(screen.queryAllByRole('region', { name: /checks$/ })).toHaveLength(0)
  })

  it('summarises flipped checks in one line', () => {
    const c = (id: string, title: string, pass: boolean): Check => ({ id, title, pass, section: 'deal', severity: 'error', message: '' })
    const prev = new Map([['a', true], ['b', false], ['c', true]])
    expect(flipSummary(prev, [c('a', 'Financing Tie-up', false), c('b', 'Debt repaid', true), c('c', 'Same', true)]))
      .toBe('2 checks changed: Financing Tie-up now failing, Debt repaid now passing')
    expect(flipSummary(prev, [c('a', 'A', true), c('b', 'B', false), c('c', 'C', true)])).toBeNull()
  })

  it('debounces flip toasts: a burst that ends where it started does not toast; a settled change toasts once', () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(toast, 'warning'), ok = vi.spyOn(toast, 'success')
    const s = useStore.getState()
    s.setActive(s.createScenario('Edit'))
    render(<CheckFlipToasts />)
    act(() => useStore.getState().setInput('deal.bidPrice', 1800)) // mid-typing value that fails DSCR
    act(() => { vi.advanceTimersByTime(300) })
    act(() => useStore.getState().setInput('deal.bidPrice', 2250))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(warn).not.toHaveBeenCalled()
    expect(ok).not.toHaveBeenCalled()
    act(() => useStore.getState().setInput('deal.bidPrice', 1800))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('Scenarios', () => {
  it('compares two scenarios: only differing inputs, and KPI deltas', () => {
    const s = useStore.getState()
    const id = s.createScenario('Higher bid')
    s.setActive(id)
    s.setInput('deal.bidPrice', 2500)
    wrap(<Scenarios />)
    const diff = screen.getByRole('table', { name: /inputs that differ/i })
    const rows = within(diff).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toMatch(/Bid Price.*₹2,500\.00 Cr/)
    expect(screen.getByRole('table', { name: /results/i }).textContent).toMatch(/Equity IRR/)
  })

  it('sets the base scenario', () => {
    const s = useStore.getState()
    const id = s.createScenario('Alt')
    wrap(<Scenarios />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Make Alt the base' })) })
    expect(useStore.getState().baseId).toBe(id)
  })

  it('Esc while renaming cancels without committing via blur', () => {
    wrap(<Scenarios />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename Base case' }))
    const input = screen.getByRole('textbox', { name: 'Rename Base case' })
    fireEvent.change(input, { target: { value: 'Typo' } })
    // A browser blurs the input as Esc removes it: key and blur arrive before React re-renders.
    act(() => { fireEvent.keyDown(input, { key: 'Escape' }); fireEvent.blur(input) })
    expect(useStore.getState().scenarios[0].name).toBe('Base case')
    expect(screen.queryByRole('textbox', { name: 'Rename Base case' })).toBeNull()
  })
})

