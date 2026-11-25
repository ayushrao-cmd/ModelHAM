// Light/dark theme: starts from prefers-color-scheme, then remembers the user's choice.
// index.html applies the same class before first paint so there is no flash.
import { create } from 'zustand'

export type Theme = 'light' | 'dark'
const KEY = 'milestone.theme'

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
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
      try { localStorage.setItem(KEY, next) } catch { /* memory only */ }
      return { theme: next }
    }),
  }
})
