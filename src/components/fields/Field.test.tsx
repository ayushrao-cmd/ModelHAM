import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { go } from '../../app/router'
import { fmt } from '../../lib/format'
import { getAt } from '../../lib/path'
import { useStore } from '../../state/store'
import { useModel } from '../../state/useModel'
import { InputGroup } from '../InputGroup'
import { Field } from './Field'

// jsdom has no ResizeObserver; Radix Slider measures its thumb with one.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }

/** Ruling 5: stand-in for the Overview KPI (Task 13). */
function Probe() { return <p data-testid="kpi">{fmt.pct(useModel().active!.kpis.equityIrr)}</p> }

const active = (id: string) => { const s = useStore.getState(); return getAt(s.scenarios.find(x => x.id === s.activeId)!.inputs, id) }
const mount = (id: string) => render(<TooltipProvider><Field id={id} /><Probe /></TooltipProvider>)
/** Edits go to a copy so they differ from the base scenario. */
const editCopy = () => { const s = useStore.getState(); s.setActive(s.createScenario('Edit')) }

beforeEach(() => { useStore.setState(useStore.getInitialState(), true); window.location.hash = '' })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Field', () => {
  it('shows a parse error inline and never commits it', () => {
    vi.useFakeTimers()
    mount('deal.bidPrice')
    const input = screen.getByLabelText('Bid Price')
    fireEvent.change(input, { target: { value: 'abc' } })
    act(() => { vi.advanceTimersByTime(500) })
    fireEvent.blur(input)
    expect(screen.getByText(/enter a number/i)).toBeTruthy()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(active('deal.bidPrice')).toBe(2250)
    expect(screen.getByTestId('kpi').textContent).not.toMatch(/NaN/)
  })

  it('commits a valid value after the debounce, marks it changed and resets to base', () => {
    vi.useFakeTimers()
    editCopy()
    mount('deal.bidPrice')
    const input = screen.getByLabelText('Bid Price') as HTMLInputElement
    expect(screen.queryByText('Changed from base')).toBeNull()
    fireEvent.change(input, { target: { value: '2,300' } })
    expect(active('deal.bidPrice')).toBe(2250) // debounced
    act(() => { vi.advanceTimersByTime(200) })
    expect(active('deal.bidPrice')).toBe(2300)
    expect(screen.getByText('Changed from base')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /reset bid price/i }))
    expect(active('deal.bidPrice')).toBe(2250)
    expect(input.value).toBe('2,250')
    expect(screen.queryByText('Changed from base')).toBeNull()
  })

  it('on the base scenario itself, compares with and resets to the default', () => {
    vi.useFakeTimers()
    mount('deal.bidPrice')
    const input = screen.getByLabelText('Bid Price') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2400' } })
    fireEvent.blur(input)
    expect(active('deal.bidPrice')).toBe(2400)
    expect(screen.getByText('Changed from base')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /reset bid price/i }))
    expect(active('deal.bidPrice')).toBe(2250)
    expect(screen.queryByText('Changed from base')).toBeNull()
  })

  it('opens help from the keyboard', async () => {
    mount('deal.bidPrice')
    const help = screen.getByRole('button', { name: 'Help: Bid Price' })
    act(() => help.focus())
    await waitFor(() => expect(screen.getByRole('tooltip').textContent).toMatch(/Quoted project price/))
  })

  it('does not repeat a list label that equals its group heading, but keeps it as the accessible name', () => {
    render(<TooltipProvider><InputGroup section="build" group="Build Milestones" /></TooltipProvider>)
    expect(screen.getAllByText('Build Milestones', { exact: true }).filter(el => !el.closest('.sr-only'))).toHaveLength(1)
    expect(screen.getByRole('group', { name: 'Build Milestones' })).toBeTruthy()
  })

  it('reads percent input as percent points', () => {
    vi.useFakeTimers()
    mount('capital.buildRate')
    const input = screen.getByLabelText('Loan Rate – Build') as HTMLInputElement
    expect(input.value).toBe('9.75')
    fireEvent.change(input, { target: { value: '9.82' } })
    fireEvent.blur(input)
    expect(active('capital.buildRate')).toBe(0.0982)
  })

  it('shows the message of a failing check and marks the control invalid', () => {
    useStore.getState().setInput('build.contingency', -1)
    mount('build.contingency')
    const input = screen.getByLabelText('Contingency')
    const msg = screen.getByText(/Contingency must be at least/)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(msg.closest('[id]')!.id)
  })

  it('focuses the field on every jump, including a repeat jump to the same hash', async () => {
    mount('deal.bidPrice')
    const input = screen.getByLabelText('Bid Price')
    expect(input.id).toBe('field-deal-bidPrice')
    act(() => go('deal', 'deal.bidPrice'))
    await waitFor(() => expect(document.activeElement).toBe(input))
    act(() => input.blur())
    expect(window.location.hash).toBe('#/deal?focus=deal.bidPrice')
    act(() => go('deal', 'deal.bidPrice'))
    await waitFor(() => expect(document.activeElement).toBe(input))
  })

  it('edits list entries in place and shows the live sum', () => {
    vi.useFakeTimers()
    mount('capital.repayment')
    expect(screen.getByText('Σ 100.00%')).toBeTruthy()
    const first = screen.getByLabelText('Repayment Schedule entry 1')
    fireEvent.change(first, { target: { value: '2.5' } })
    fireEvent.blur(first)
    expect(active('capital.repayment.0')).toBe(0.025)
    expect(screen.getByText('Σ 101.00%')).toBeTruthy()
  })

  it('never commits a value outside the field min/max: Build Days −30 shows an inline error and keeps the last valid value', () => {
    vi.useFakeTimers()
    mount('deal.buildDays')
    const input = screen.getByLabelText('Build Days') as HTMLInputElement
    fireEvent.change(input, { target: { value: '-30' } })
    act(() => { vi.advanceTimersByTime(500) })
    fireEvent.blur(input)
    expect(screen.getByText('Enter at least 365.')).toBeTruthy()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(active('deal.buildDays')).toBe(1095)
    fireEvent.change(input, { target: { value: '2,000' } })
    fireEvent.blur(input)
    expect(screen.getByText('Enter at most 1,825.')).toBeTruthy()
    expect(active('deal.buildDays')).toBe(1095)
  })

  it('never commits a non-integer day count', () => {
    vi.useFakeTimers()
    mount('deal.buildDays')
    const input = screen.getByLabelText('Build Days')
    fireEvent.change(input, { target: { value: '1000.5' } })
    fireEvent.blur(input)
    expect(screen.getByText(/whole number/i)).toBeTruthy()
    expect(active('deal.buildDays')).toBe(1095)
  })

  it('shows Operate Years read-only, fixed at 15', () => {
    mount('deal.operateYears')
    const input = screen.getByLabelText('Operate Years') as HTMLInputElement
    expect(input.readOnly).toBe(true)
    expect(input.value).toBe('15 years')
    expect(screen.getByText(/Fixed at 15 years by the concession agreement/)).toBeTruthy()
  })
})

