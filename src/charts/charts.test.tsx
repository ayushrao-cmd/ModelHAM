import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DEFAULT_INPUTS as i } from '../engine/defaults'
import { runModel } from '../engine/model'
import { TornadoChart } from './TornadoChart'
import { DscrChart } from './DscrChart'
import { SourcesUsesChart } from './SourcesUsesChart'

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } // jsdom lacks it

describe('chart components', () => {
  it('render a labelled figure', () => {
    render(<><DscrChart result={runModel(i)} /><SourcesUsesChart result={runModel(i)} /></>)
    expect(screen.getByLabelText('Debt service coverage ratio (DSCR), by financial year')).toBeTruthy()
    expect(screen.getByLabelText('Sources and uses of funds')).toBeTruthy()
  })
  it('tornado shows a No data panel when empty or null', () => {
    render(<TornadoChart bars={[{ key: 'a', label: 'A', low: null, high: null, base: null }]} />)
    expect(screen.getByText('No data')).toBeTruthy()
  })
})
