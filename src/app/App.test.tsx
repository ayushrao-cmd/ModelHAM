import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import { cookies } from '../lib/cookies'
import { Recover } from './App'
import { MethodNotice, NOTICE_KEY } from './MethodNotice'

const activeInputs = () => { const s = useStore.getState(); return s.scenarios.find(x => x.id === s.activeId)!.inputs }
/** Stands in for an engine crash on the active scenario's inputs. */
function Bomb() {
  const days = useStore(s => s.scenarios.find(x => x.id === s.activeId)!.inputs.deal.buildDays)
  if (days < 0) throw new Error('boom')
  return <p>Model ok</p>
}

beforeEach(() => { useStore.setState(useStore.getInitialState(), true); vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Recover', () => {
  it('resets only the active scenario to its reference and keeps the others', () => {
    const s = useStore.getState()
    const keep = s.createScenario('Keep')
    useStore.getState().setActive(keep)
    useStore.getState().setInput('deal.bidPrice', 1900)
    const broken = useStore.getState().createScenario('Broken')
    useStore.getState().setActive(broken)
    useStore.getState().setInput('deal.buildDays', -30)
    render(<Recover><Bomb /></Recover>)
    fireEvent.click(screen.getByRole('button', { name: 'Reset this scenario' }))
    expect(screen.getByText('Model ok')).toBeTruthy()
    const st = useStore.getState()
    expect(st.scenarios.map(x => x.name)).toEqual(['Base case', 'Keep', 'Broken'])
    expect(activeInputs().deal.buildDays).toBe(1095)
    expect(st.scenarios.find(x => x.id === keep)!.inputs.deal.bidPrice).toBe(1900)
  })

  it('offers a secondary Reset this project, which keeps other projects', () => {
    const other = useStore.getState().projectId
    useStore.getState().createProject('sample')
    useStore.getState().setActive(useStore.getState().createScenario('Broken'))
    useStore.getState().setInput('deal.buildDays', -30)
    render(<Recover><Bomb /></Recover>)
    fireEvent.click(screen.getByRole('button', { name: 'Reset this project' }))
    expect(screen.getByText('Model ok')).toBeTruthy()
    expect(useStore.getState().scenarios).toHaveLength(1)
    expect(useStore.getState().projects.map(x => x.id)).toContain(other)
  })
})

describe('MethodNotice', () => {
  it('appears once per browser and links to the method notes', () => {
    cookies.remove(NOTICE_KEY)
    const first = render(<MethodNotice />)
    expect(screen.getByRole('status').textContent).toMatch(/Numbers now follow the original workbook's method/)
    expect(screen.getByRole('link', { name: 'See the method notes' }).getAttribute('href')).toBe('#/health?section=notes')
    first.unmount()
    render(<MethodNotice />) // a reload
    expect(screen.queryByRole('link', { name: 'See the method notes' })).toBeNull()
  })
})
