import { describe, expect, it } from 'vitest'
import { hrefFor, parseHash } from './router'

describe('parseHash', () => {
  it('reads section and focus, defaulting unknown or empty hashes to overview', () => {
    expect(parseHash('#/build?focus=build.epcFixed')).toEqual({ section: 'build', focus: 'build.epcFixed' })
    expect(parseHash('#/health')).toEqual({ section: 'health' })
    expect(parseHash('')).toEqual({ section: 'overview' })
    expect(parseHash('#/nowhere?focus=x')).toEqual({ section: 'overview' }) // unknown section drops focus
  })
  it("sends a focus to the field's own section (old bookmarks from before Phasing existed)", () => {
    expect(parseHash('#/build?focus=build.phasing')).toEqual({ section: 'phasing', focus: 'build.phasing' })
    expect(parseHash('#/build?focus=milestones.2.day')).toEqual({ section: 'phasing', focus: 'milestones.2.day' })
    expect(parseHash('#/build?focus=nope')).toEqual({ section: 'build', focus: 'nope' })
  })
  it('round-trips hrefFor', () => {
    expect(parseHash(hrefFor('capital', 'capital.repayment.0'))).toEqual({ section: 'capital', focus: 'capital.repayment.0' })
  })
})
