import { beforeEach, describe, expect, it } from 'vitest'
import { cookies } from './cookies'

const names = () => document.cookie.split('; ').filter(Boolean).map(c => c.split('=')[0])
const clearCookies = () => { for (const n of names()) document.cookie = `${n}=; path=/; max-age=0` }

beforeEach(clearCookies)

describe('cookies', () => {
  it('round-trips a value and returns null for a missing key', () => {
    expect(cookies.get('k')).toBeNull()
    cookies.set('k', '{"a":"₹ 2,250; x=y"}')
    expect(cookies.get('k')).toBe('{"a":"₹ 2,250; x=y"}')
  })

  it('splits values larger than one cookie into chunks and reassembles them', () => {
    const big = JSON.stringify({ s: 'x'.repeat(9000), u: '₹'.repeat(500) })
    cookies.set('big', big)
    expect(names().filter(n => n.startsWith('big.')).length).toBeGreaterThan(3) // big.n + ≥3 chunks
    expect(cookies.get('big')).toBe(big)
  })

  it('removes leftover chunks when a value shrinks, and remove() clears everything', () => {
    cookies.set('k', 'y'.repeat(9000))
    cookies.set('k', 'small')
    expect(cookies.get('k')).toBe('small')
    expect(names().filter(n => n.startsWith('k.'))).toEqual(expect.arrayContaining(['k.n', 'k.0']))
    expect(names().filter(n => n.startsWith('k.')).length).toBe(2)
    cookies.remove('k')
    expect(cookies.get('k')).toBeNull()
    expect(names().filter(n => n.startsWith('k.'))).toEqual([])
  })

  it('returns null when a chunk is missing instead of a truncated value', () => {
    cookies.set('k', 'z'.repeat(9000))
    document.cookie = 'k.1=; path=/; max-age=0'
    expect(cookies.get('k')).toBeNull()
  })
})
