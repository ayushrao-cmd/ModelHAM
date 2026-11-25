import { describe, expect, it } from 'vitest'
import type { Check } from '../engine/health'
import { sectionStatus } from './sections'

const c = (section: Check['section'], severity: Check['severity'], pass: boolean): Check =>
  ({ id: `${section}-${severity}-${pass}`, title: '', section, severity, pass, message: '' })

describe('sectionStatus', () => {
  const checks = [c('build', 'error', false), c('build', 'warning', false), c('capital', 'warning', false),
    c('capital', 'error', true), c('returns', 'info', false), c('deal', 'error', true)]
  it('reports the worst failing severity; info failures and passes are ok', () => {
    expect(sectionStatus(checks, 'build')).toBe('error')
    expect(sectionStatus(checks, 'capital')).toBe('warning')
    expect(sectionStatus(checks, 'returns')).toBe('ok')
    expect(sectionStatus(checks, 'deal')).toBe('ok')
  })
  it('summarises everything for health and reports none for sections without checks', () => {
    expect(sectionStatus(checks, 'health')).toBe('error')
    expect(sectionStatus(checks, 'scenarios')).toBe('none')
  })
})
