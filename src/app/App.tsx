import { Component, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { SectionId } from '../engine/types'
import { useStore } from '../state/store'
import { Build } from '../sections/Build'
import { Capital } from '../sections/Capital'
import { Deal } from '../sections/Deal'
import { CheckFlipToasts, Health } from '../sections/Health'
import { Income } from '../sections/Income'
import { Operations } from '../sections/Operations'
import { Overview } from '../sections/Overview'
import { Returns } from '../sections/Returns'
import { Scenarios } from '../sections/Scenarios'
import { useRoute } from './router'
import { Brand, Sidebar, SidebarNav } from './Sidebar'
import { ThemeToggle, Topbar } from './Topbar'

const VIEWS: Record<SectionId, () => JSX.Element> = {
  overview: Overview, deal: Deal, build: Build, capital: Capital, income: Income, operations: Operations,
  returns: Returns, health: Health, scenarios: Scenarios,
}

/** If a scenario ever crashes the engine, offer a way out instead of a blank page: reset just that scenario, or its project. */
export class Recover extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  retry(reset: () => void) { reset(); this.setState({ failed: false }) } // persist writes through, so a reload keeps the fix
  render() {
    if (!this.state.failed) return this.props.children
    const { resetActive, resetAll } = useStore.getState()
    return (
      <div role="alert" className="mx-auto mt-24 max-w-md rounded-lg border bg-card p-6 shadow-card">
        <h1 className="text-lg font-semibold">The model could not run on this scenario</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Reset this scenario to its base to continue; the base itself goes back to how the project started (the sample
          data, or empty for a blank project). Or reset the whole project to a single Base case. Your other projects are kept.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => this.retry(resetActive)}>Reset this scenario</Button>
          <Button variant="outline" onClick={() => this.retry(resetAll)}>Reset this project</Button>
        </div>
      </div>
    )
  }
}

export default function App() {
  const { section } = useRoute()
  const [menuOpen, setMenuOpen] = useState(false)
  const View = VIEWS[section]
  return (
    <Recover>
      <TooltipProvider delayDuration={300}>
        <a href="#main" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus() }}
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
          Skip to content
        </a>
        <Sidebar current={section} />
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="flex w-72 flex-col gap-6 bg-sidebar px-0 py-4">
            <SheetTitle className="sr-only">Sections</SheetTitle>
            <SheetDescription className="sr-only">Jump to a section of the model.</SheetDescription>
            <Brand />
            <SidebarNav current={section} onNavigate={() => setMenuOpen(false)} />
            <div className="mt-auto flex items-center justify-between border-t px-6 pt-3 text-sm text-muted-foreground sm:hidden">
              Theme <ThemeToggle />
            </div>
          </SheetContent>
        </Sheet>
        <div className="flex min-h-dvh min-w-0 flex-col lg:pl-60">
          <Topbar onMenu={() => setMenuOpen(true)} />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8 lg:px-8">
            <View key={section} />
          </main>
        </div>
        <Toaster position="bottom-right" />
        <CheckFlipToasts />
      </TooltipProvider>
    </Recover>
  )
}
