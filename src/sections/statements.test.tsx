import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { StatementsView } from '../components/statements/StatementsView'
import { DEFAULT_INPUTS } from '../engine/defaults'
import { statementChecks } from '../engine/health'
import { runModel } from '../engine/model'
import { buildIgaap } from '../engine/v16/statements/igaap'
import { buildIndas } from '../engine/v16/statements/indas'
import { useStore } from '../state/store'
import { Statements } from './Statements'

const R = runModel(DEFAULT_INPUTS)

const view = (hash = '#/statements') => {
  window.location.hash = hash
  return render(<TooltipProvider><Statements /></TooltipProvider>)
}
const lastCell = (row: HTMLElement) => row.querySelector('td:last-child')!.textContent

beforeEach(() => { useStore.setState(useStore.getInitialState(), true) })
afterEach(() => { cleanup(); window.location.hash = '' })

describe('Statements section on the sample (original-method engine)', () => {
  it('opens on the IGAAP P&L, FY27 to FY45, profit after tax ₹793.22 Cr in Total', () => {
    view()
    expect(screen.getByRole('button', { name: 'IGAAP' }).getAttribute('aria-pressed')).toBe('true')
    const pl = screen.getByRole('region', { name: 'Profit and Loss Statement, as per IGAAP' })
    expect(pl.textContent).toMatch(/FY27.*FY45.*Total/)
    expect(lastCell(screen.getByRole('row', { name: /F\. Profit after tax/ }))).toBe('793.22')
    expect(pl.textContent).toMatch(/\(\d[\d,]*\.\d\d\)/)
    expect(document.body.textContent).not.toMatch(/NaN|undefined/)
    expect(screen.getByText(/original workbook's IGAAP and IndAS method/)).toBeTruthy()
  })

  it('?std=indas shows the IndAS P&L', () => {
    view('#/statements?std=indas')
    expect(screen.getByRole('button', { name: 'IndAS' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Notional Income as per IndAS')).toBeTruthy()
  })

  it.each(['igaap', 'indas'])('?std=%s&tab=bs: the balance sheet check banner says it balances', std => {
    view(`#/statements?std=${std}&tab=bs`)
    expect(screen.getByRole('tab', { name: 'Balance Sheet' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('status').textContent).toMatch(/Balances in every year/)
  })

  it('expanding Total Revenue reveals A.1 to A.5', async () => {
    const user = userEvent.setup()
    view()
    await user.click(screen.getByRole('button', { name: 'Breakdown of Total Revenue' }))
    const rows = screen.getAllByRole('row')
    const at = rows.findIndex(r => /Total Revenue/.test(r.textContent ?? ''))
    expect(rows.slice(at + 1, at + 6).map(r => r.querySelector('th')!.textContent!.match(/A\.\d/)?.[0])).toEqual(['A.1', 'A.2', 'A.3', 'A.4', 'A.5'])
  })

  it.each([[0.007, true], [0.02, false]])('a BS gap of %s: the screen and Health agree (balanced: %s)', (gap, ok) => {
    const r = structuredClone(R)
    r.funds.mmr.closing[5] += gap // an asset off by the gap in FY32
    render(<StatementsView sets={{ igaap: buildIgaap(r), indas: buildIndas(r) }} standard="igaap" tab="bs" />)
    expect(screen.getByRole('status').textContent).toMatch(ok ? /Balances in every year/ : /Out of balance in FY32/)
    const row = screen.getByRole('row', { name: /BS Check/ })
    expect(row.querySelector('th')!.className.includes('text-destructive')).toBe(!ok)
    expect(statementChecks(r).find(c => c.id === 'bs-balance')!.pass).toBe(ok)
  })

  it('switching the standard and the tab writes ?std= and ?tab= to the URL', async () => {
    const user = userEvent.setup()
    view()
    await user.click(screen.getByRole('button', { name: 'IndAS' }))
    expect(window.location.hash).toBe('#/statements?std=indas&tab=pl')
    await user.click(screen.getByRole('tab', { name: 'Cash Flow' }))
    expect(window.location.hash).toBe('#/statements?std=indas&tab=cf')
    expect(screen.getByRole('button', { name: 'IndAS' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'IGAAP' }))
    expect(window.location.hash).toBe('#/statements?std=igaap&tab=cf')
    expect(screen.getByRole('tab', { name: 'Cash Flow' }).getAttribute('aria-selected')).toBe('true')
  })
})
