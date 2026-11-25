import { Component, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { SectionId } from '../engine/types'
import { Build } from '../sections/Build'
import { Capital } from '../sections/Capital'
import { Deal } from '../sections/Deal'
import { Income } from '../sections/Income'
import { Operations } from '../sections/Operations'
import { SectionHeader } from '../sections/SectionLayout'
import { useRoute } from './router'
import { Brand, Sidebar, SidebarNav } from './Sidebar'
import { ThemeToggle, Topbar } from './Topbar'

// Overview, Returns, Health and Scenarios are header-only until Task 13.
const VIEWS: Partial<Record<SectionId, () => JSX.Element>> = { deal: Deal, build: Build, capital: Capital, income: Income, operations: Operations }

/** If a stored scenario ever crashes the engine, offer a way out instead of a blank page. */
class Recover extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  reset = () => {
    try { localStorage.removeItem('milestone.scenarios.v1') } catch { /* storage blocked */ }
    location.reload()
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="mx-auto mt-24 max-w-md rounded-lg border bg-card p-6 shadow-card">
        <h1 className="text-lg font-semibold">The model could not run on the saved scenarios</h1>
        <p className="mt-2 text-sm text-muted-foreground">Reset to the demo base case to continue. Saved scenarios in this browser are cleared.</p>
        <Button className="mt-4" onClick={this.reset}>Reset to base case</Button>
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
            {View ? <View key={section} /> : <SectionHeader key={section} id={section} />}
          </main>
        </div>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </Recover>
  )
}
