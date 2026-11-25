import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Topbar } from '../app/Topbar'
import { DEFAULT_INPUTS } from '../engine/defaults'
import { getAt } from '../lib/path'
import { CheckFlipToasts } from '../sections/Health'
import { Overview } from '../sections/Overview'
import { BLANK_EMPTY } from '../state/projects'
import { useStore } from '../state/store'
import { useModel, useResult } from '../state/useModel'
import { Field } from './fields/Field'
import { ResultsGate } from './ResultsGate'

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } // jsdom lacks it

const wrap = (ui: React.ReactNode) => render(<TooltipProvider>{ui}</TooltipProvider>)
const fill = (paths: string[]) => { for (const p of paths) useStore.getState().setInput(p, getAt(DEFAULT_INPUTS, p)) }
function Results() { const r = useResult(); return <p>IRR {r.kpis.equityIrr?.toFixed(4)}</p> }

beforeEach(() => { useStore.setState(useStore.getInitialState(), true); window.location.hash = '' })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('gating', () => {
  it('does not run the engine on an incomplete scenario: checks are the Required checks only', () => {
    useStore.getState().createProject('blank')
    const { result } = renderHook(() => useModel())
    const m = result.current
    expect(m.active).toBeNull()
    expect(m.base).toBeNull()
    expect(m.missing.paths).toEqual(BLANK_EMPTY)
    expect(m.missing.filled).toBe(0)
    expect(m.missing.total).toBe(BLANK_EMPTY.length)
    expect(m.checks.length).toBe(m.missing.byField.length)
    expect(m.checks.every(c => c.id.startsWith('field:') && !c.pass && c.severity === 'error')).toBe(true)
    expect(m.checks.find(c => c.id === 'field:deal.bidPrice')!.message).toBe('Required')
    expect(m.checks.find(c => c.id === 'field:capital.repayment')!.message).toBe('25 of 25 values missing')
    expect(m.checks.some(c => c.id === 'financing-tieup')).toBe(false)
  })

  it('filling the last field makes results appear', () => {
    useStore.getState().createProject('blank')
    const { result } = renderHook(() => useModel())
    act(() => fill(BLANK_EMPTY.slice(0, -1)))
    expect(result.current.active).toBeNull()
    expect(result.current.missing.byField).toHaveLength(1)
    act(() => fill(BLANK_EMPTY.slice(-1)))
    expect(result.current.active).not.toBeNull()
    expect(result.current.base).not.toBeNull()
    expect(result.current.checks.some(c => c.id === 'financing-tieup')).toBe(true)
  })

  it('toasts once when the scenario becomes complete, and not for flips while incomplete', () => {
    vi.useFakeTimers()
    const ok = vi.spyOn(toast, 'success'), warn = vi.spyOn(toast, 'warning')
    useStore.getState().createProject('blank')
    render(<CheckFlipToasts />)
    act(() => fill(BLANK_EMPTY.slice(0, 5)))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(ok).not.toHaveBeenCalled()
    act(() => fill(BLANK_EMPTY.slice(5)))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(ok).toHaveBeenCalledTimes(1)
    expect(ok).toHaveBeenCalledWith('All fields filled — results are live')
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('ResultsGate', () => {
  it('lists the missing fields by section as jump links, with progress, instead of results', () => {
    useStore.getState().createProject('blank')
    useStore.getState().setInput('deal.bidPrice', 1800)
    wrap(<ResultsGate><Results /></ResultsGate>)
    expect(screen.queryByText(/^IRR/)).toBeNull()
    const n = useStore.getState().scenarios[0].empty.length
    expect(screen.getByRole('heading', { name: /Fill in \d+ more fields to see results/ })).toBeTruthy()
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe(String(BLANK_EMPTY.length - n))
    expect(bar.getAttribute('aria-valuemax')).toBe(String(BLANK_EMPTY.length))
    const deal = screen.getByRole('list', { name: 'Deal & Timeline' })
    expect(within(deal).queryByRole('button', { name: /Bid Price/ })).toBeNull() // filled
    fireEvent.click(within(deal).getByRole('button', { name: /Authority Estimate/ }))
    expect(window.location.hash).toBe('#/deal?focus=deal.authorityEstimate')
    fireEvent.click(screen.getByRole('button', { name: /Repayment Schedule.*25 of 25/ }))
    expect(window.location.hash).toBe('#/capital?focus=capital.repayment')
  })

  it('renders its children once the scenario is complete', () => {
    wrap(<ResultsGate><Results /></ResultsGate>)
    expect(screen.getByText(/^IRR 0\.\d{4}/)).toBeTruthy()
  })

  it('replaces every Overview result in a blank project', () => {
    useStore.getState().createProject('blank')
    const { container } = wrap(<Overview />)
    expect(screen.getByRole('heading', { name: /Fill in \d+ more fields/ })).toBeTruthy()
    expect(screen.queryByRole('group', { name: /Equity IRR/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Solve' })).toBeNull()
    expect(container.textContent).not.toMatch(/₹/)
  })
})

describe('empty fields', () => {
  it('render empty with a Required placeholder and inline error; standards show their tag', () => {
    useStore.getState().createProject('blank')
    wrap(<><Field id="deal.bidPrice" /><Field id="income.spread" /><Field id="tax.baseRate" /></>)
    const bid = screen.getByLabelText('Bid Price') as HTMLInputElement
    expect(bid.value).toBe('')
    expect(bid.placeholder).toBe('Required')
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0)
    expect(screen.queryByRole('slider')).toBeNull() // no slider range built from demo values
    expect(screen.queryByRole('button', { name: /Reset Bid Price/ })).toBeNull()
    expect(screen.getByText('MCA standard')).toBeTruthy()
    expect(screen.getByText('Standard')).toBeTruthy()
  })

  it('typing 0 into an empty field fills it', () => {
    vi.useFakeTimers()
    useStore.getState().createProject('blank')
    wrap(<Field id="operations.inflation.insurance" />)
    fireEvent.change(screen.getByLabelText('Insurance Inflation'), { target: { value: '0' } })
    act(() => { vi.advanceTimersByTime(500) })
    const s = useStore.getState()
    expect(s.scenarios[0].empty).not.toContain('operations.inflation.insurance')
  })
})

describe('Topbar', () => {
  it('shows the Demo data badge on sample projects only', () => {
    wrap(<Topbar onMenu={() => {}} />)
    expect(screen.getByText('Demo data')).toBeTruthy()
    cleanup()
    act(() => { useStore.getState().createProject('blank') })
    wrap(<Topbar onMenu={() => {}} />)
    expect(screen.queryByText('Demo data')).toBeNull()
    expect(screen.getByRole('button', { name: /Untitled project/ })).toBeTruthy()
  })
})
