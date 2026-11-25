import animate from 'tailwindcss-animate'

const c = name => `hsl(var(--${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        background: c('background'), foreground: c('foreground'),
        card: { DEFAULT: c('card'), foreground: c('card-foreground') },
        popover: { DEFAULT: c('popover'), foreground: c('popover-foreground') },
        primary: { DEFAULT: c('primary'), foreground: c('primary-foreground') },
        secondary: { DEFAULT: c('secondary'), foreground: c('secondary-foreground') },
        muted: { DEFAULT: c('muted'), foreground: c('muted-foreground') },
        accent: { DEFAULT: c('accent'), foreground: c('accent-foreground') },
        destructive: { DEFAULT: c('destructive'), foreground: c('destructive-foreground') },
        success: { DEFAULT: c('success'), foreground: c('success-foreground') },
        warning: { DEFAULT: c('warning'), foreground: c('warning-foreground') },
        border: c('border'), input: c('input'), ring: c('ring'),
        sidebar: c('sidebar'),
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 6px)' },
      boxShadow: {
        card: '0 1px 2px hsl(var(--shadow) / 0.05), 0 1px 3px hsl(var(--shadow) / 0.06)',
        pop: '0 12px 32px -8px hsl(var(--shadow) / 0.18), 0 2px 6px hsl(var(--shadow) / 0.08)',
      },
    },
  },
  plugins: [animate],
}
