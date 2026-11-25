// Hash routing: '#/build?focus=build.epcFixed'. No router library; the hash is the only state.
import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import type { SectionId } from '../engine/types'

export const SECTION_IDS: SectionId[] = ['overview', 'deal', 'build', 'phasing', 'capital', 'income', 'operations', 'returns', 'statements', 'health', 'scenarios']

export function parseHash(hash: string): { section: SectionId; focus?: string } {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const section = SECTION_IDS.find(s => s === path)
  if (!section) return { section: 'overview' } // unknown section: its focus target cannot be on overview either
  const focus = new URLSearchParams(query).get('focus') ?? undefined
  return focus ? { section, focus } : { section }
}

export const hrefFor = (section: SectionId, focus?: string) => `#/${section}${focus ? `?focus=${encodeURIComponent(focus)}` : ''}`

/**
 * Focus requests carry a counter: a repeat jump to the field already in the hash fires no hashchange,
 * so the counter is what tells the field to focus again. Every navigation replaces the request.
 */
export const useFocusRequest = create<{ id?: string; n: number }>(() => ({
  id: typeof window === 'undefined' ? undefined : parseHash(window.location.hash).focus, n: 1,
}))
let claimed = 0
const request = (id?: string) => useFocusRequest.setState(s => ({ id, n: s.n + 1 }))
/** True once per request, for the field it names (StrictMode remounts and later visits do not re-focus). */
export function claimFocus(id: string): boolean {
  const { id: want, n } = useFocusRequest.getState()
  if (want !== id || n <= claimed) return false
  claimed = n
  return true
}
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => request(parseHash(window.location.hash).focus))

export function go(section: SectionId, focus?: string) {
  const href = hrefFor(section, focus)
  if (window.location.hash === href) request(focus)
  else window.location.hash = href
}

const subscribe = (cb: () => void) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb) }
const getHash = () => window.location.hash

/** A query value from the hash, e.g. 'capital' from '#/health?section=capital'. */
export const hashParam = (hash: string, key: string) => new URLSearchParams(hash.split('?')[1] ?? '').get(key)

export function useRoute(): { section: SectionId; focus?: string; param(key: string): string | null; go(section: SectionId, focusFieldId?: string): void } {
  const hash = useSyncExternalStore(subscribe, getHash, () => '')
  return { ...parseHash(hash), param: key => hashParam(hash, key), go }
}
