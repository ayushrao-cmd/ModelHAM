import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  // .claude/ holds other agents' worktrees: their copies of the suite must not run here.
  test: { environment: 'jsdom', globals: true, exclude: [...configDefaults.exclude, '.claude/**'] },
}))
