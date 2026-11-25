// Light/dark theme: starts from prefers-color-scheme, then remembers the user's choice in a cookie.
// index.html applies the same class before first paint so there is no flash.
import { create } from 'zustand'
import { cookies } from '../lib/cookies'

export type Theme = 'light' | 'dark'
const KEY = 'milestone.theme'

function initial(): Theme {
  try {
    const saved = cookies.get(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* storage blocked: fall through */ }
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function apply(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark')
  document.documentElement.style.colorScheme = t
}

export const useTheme = create<{ theme: Theme; toggle(): void }>(set => {
  const theme = initial()
  apply(theme)
  return {
    theme,
    toggle: () => set(s => {
      const next: Theme = s.theme === 'dark' ? 'light' : 'dark'
      apply(next)
      try { cookies.set(KEY, next) } catch { /* memory only */ }
      return { theme: next }
    }),
  }
})
