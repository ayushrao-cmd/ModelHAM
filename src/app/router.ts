// Hash routing: '#/build?focus=build.epcFixed'. No router library; the hash is the only state.
import { useSyncExternalStore } from 'react'
import type { SectionId } from '../engine/types'

export const SECTION_IDS: SectionId[] = ['overview', 'deal', 'build', 'capital', 'income', 'operations', 'returns', 'health', 'scenarios']

export function parseHash(hash: string): { section: SectionId; focus?: string } {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const section = SECTION_IDS.find(s => s === path) ?? 'overview'
  const focus = new URLSearchParams(query).get('focus') ?? undefined
  return focus ? { section, focus } : { section }
}

export const hrefFor = (section: SectionId, focus?: string) => `#/${section}${focus ? `?focus=${encodeURIComponent(focus)}` : ''}`

const subscribe = (cb: () => void) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb) }
const getHash = () => window.location.hash

export function useRoute(): { section: SectionId; focus?: string; go(section: SectionId, focusFieldId?: string): void } {
  const hash = useSyncExternalStore(subscribe, getHash, () => '')
  return { ...parseHash(hash), go: (section, focus) => { window.location.hash = hrefFor(section, focus) } }
}
