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
/** What a fresh blank project needs: everything empty but manual EPC phasing (its phasing is Equated). */
const REQUIRED = BLANK_EMPTY.filter(p => !p.startsWith('build.manualPhasing.'))
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
    expect(m.missing.paths).toEqual(REQUIRED)
    expect(m.missing.filled).toBe(0)
    expect(m.missing.total).toBe(REQUIRED.length)
    expect(m.checks.length).toBe(m.missing.byField.length)
    expect(m.checks.every(c => c.id.startsWith('field:') && !c.pass && c.severity === 'error')).toBe(true)
    expect(m.checks.find(c => c.id === 'field:deal.bidPrice')!.message).toBe('Required')
    expect(m.checks.find(c => c.id === 'field:capital.repayment')!.message).toBe('25 of 25 values missing')
    expect(m.checks.some(c => c.id === 'financing-tieup')).toBe(false)
  })

  it('an invalid bid date (the engine would throw) gives no result and a blocking check, never a crash', () => {
    useStore.getState().setInput('deal.bidDate', '2026-02-30')
    const { result } = renderHook(() => useModel())
    expect(result.current.active).toBeNull()
    expect(result.current.missing.paths).toEqual([])
    expect(result.current.checks.map(c => c.id)).toEqual(['field:deal.bidDate'])
    expect(result.current.score.errors).toBe(1)
    wrap(<ResultsGate><Results /></ResultsGate>)
    expect(screen.getByRole('alert').textContent).toMatch(/can't run on these inputs.*Bid Date must be a valid date/)
    expect(screen.getByRole('button', { name: 'Go to Bid Date' })).toBeTruthy()
  })

  it('milestones past the build give no result and one milestone cause with a jump, never NaN', () => {
    useStore.getState().setInput('deal.buildDays', 700)
    const { result } = renderHook(() => useModel())
    expect(result.current.active).toBeNull()
    expect(result.current.checks.map(c => c.id)).toEqual(['field:milestones'])
    wrap(<ResultsGate><Results /></ResultsGate>)
    expect(screen.getByRole('alert').textContent).toMatch(/Milestone 3: day 821 must be a whole day within the 700 build days/)
    expect(screen.getByRole('alert').textContent).not.toMatch(/NaN/)
    fireEvent.click(screen.getByRole('button', { name: 'Go to Build Milestones' }))
    expect(window.location.hash).toBe('#/phasing?focus=milestones')
  })

  it('Schedule G with no milestones gives no result and a blocking check', () => {
    act(() => { useStore.getState().setInput('milestones', []); useStore.getState().setInput('build.phasing', 'scheduleG') })
    const { result } = renderHook(() => useModel())
    expect(result.current.active).toBeNull()
    expect(result.current.checks.map(c => c.id)).toEqual(['schedule-g-milestones'])
  })

  it('an engine failure past the gate points at the failing input and lists the failing input checks', () => {
    useStore.getState().setInput('deal.daysToAward', -1e6) // the grid cannot place the dates: the engine throws
    const { result } = renderHook(() => useModel())
    expect(result.current.active).toBeNull()
    const [run, ...inputs] = result.current.blocked
    expect(run).toMatchObject({ id: 'model-run', fieldId: 'deal.daysToAward' })
    expect(inputs.map(c => c.id)).toContain('field:deal.daysToAward')
    expect(result.current.checks).toEqual(result.current.blocked)
    wrap(<ResultsGate><Results /></ResultsGate>)
    expect(screen.getAllByRole('button', { name: 'Go to Days to Award' }).length).toBeGreaterThan(0)
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
    expect(screen.getByRole('heading', { name: /Fill in \d+ more fields to see results/ })).toBeTruthy()
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('1')
    expect(bar.getAttribute('aria-valuemax')).toBe(String(REQUIRED.length))
    const deal = screen.getByRole('list', { name: 'Deal & Timeline' })
    expect(within(deal).queryByRole('button', { name: /Bid Price/ })).toBeNull() // filled
    fireEvent.click(within(deal).getByRole('button', { name: /Authority Estimate/ }))
    expect(window.location.hash).toBe('#/deal?focus=deal.authorityEstimate')
    fireEvent.click(screen.getByRole('button', { name: /Repayment Schedule.*25 of 25/ }))
    expect(window.location.hash).toBe('#/capital?focus=capital.repayment')
  })

  it('a reset that empties a field takes the results away again', () => {
    useStore.getState().createProject('blank')
    fill(BLANK_EMPTY)
    wrap(<ResultsGate><Results /></ResultsGate>)
    expect(screen.getByText(/^IRR 0\.\d{4}/)).toBeTruthy()
    act(() => useStore.getState().resetField('deal.bidPrice'))
    expect(screen.queryByText(/^IRR/)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Fill in 1 more field to see results' })).toBeTruthy()
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

describe('ProjectSwitcher', () => {
  const openMenu = () => {
    const t = screen.getByRole('button', { name: /switch project/ })
    act(() => { t.focus(); fireEvent.keyDown(t, { key: 'Enter' }) })
    return t
  }
  it('names the current project for assistive tech and returns focus to the trigger after Rename', async () => {
    wrap(<Topbar onMenu={() => {}} />)
    const trigger = openMenu()
    expect(screen.getByRole('menuitem', { name: /Sample Greenfield.*current project/ })).toBeTruthy()
    act(() => { fireEvent.click(screen.getByRole('menuitem', { name: /Rename/ })) })
    const box = await screen.findByRole('textbox', { name: 'Project name' })
    fireEvent.change(box, { target: { value: 'Ring Road' } })
    act(() => { fireEvent.submit(box.closest('form')!) })
    await vi.waitFor(() => expect(screen.queryByRole('textbox', { name: 'Project name' })).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(trigger.textContent).toMatch(/Ring Road/)
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
