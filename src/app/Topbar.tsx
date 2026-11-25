import { useRef } from 'react'
import { Check, ChevronsUpDown, CircleAlert, CircleCheck, Download, FileJson, Menu, Moon, Sheet, Sun, TriangleAlert, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { download, exportScenarioJson, exportSchedulesCsv, slug } from '../lib/export'
import { activeTemplate, useStore } from '../state/store'
import { useModel } from '../state/useModel'
import { CommandPalette } from './CommandPalette'
import { ProjectSwitcher } from './ProjectSwitcher'
import { hrefFor } from './router'
import { useTheme } from './theme'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function ScenarioSwitcher() {
  const scenarios = useStore(s => s.scenarios)
  const activeId = useStore(s => s.activeId)
  const baseId = useStore(s => s.baseId)
  const setActive = useStore(s => s.setActive)
  const active = scenarios.find(s => s.id === activeId)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 min-w-0 max-w-[13rem] shrink justify-between gap-1.5 bg-card px-2.5 sm:px-3">
          <span className="truncate">{active?.name ?? 'Scenario'}</span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">, switch scenario</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Scenarios</DropdownMenuLabel>
        {scenarios.map(s => (
          <DropdownMenuItem key={s.id} onSelect={() => setActive(s.id)} className="gap-2">
            <Check className={cn('text-primary', s.id !== activeId && 'invisible')} aria-hidden="true" />
            <span className="flex-1 truncate">{s.name}</span>
            {s.id === baseId && <span className="text-xs text-muted-foreground">Base</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><a href={hrefFor('scenarios')}>Manage scenarios</a></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function HealthBadge() {
  const { score } = useModel()
  const { errors, warnings } = score
  const Icon = errors ? CircleAlert : warnings ? TriangleAlert : CircleCheck
  const tone = errors ? 'text-destructive' : warnings ? 'text-warning' : 'text-success'
  const full = errors || warnings ? `${plural(errors, 'error')} · ${plural(warnings, 'warning')}` : 'All checks pass'
  return (
    <a href={hrefFor('health')} aria-label={`Health: ${full}. Open Health.`}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border bg-card px-2.5 text-sm font-medium shadow-card transition-colors hover:bg-accent">
      <Icon className={cn('size-4 shrink-0', tone)} aria-hidden="true" />
      <span className="hidden sm:inline">{full}</span>
      <span className="sm:hidden" aria-hidden="true">{errors || warnings ? `${errors} · ${warnings}` : 'OK'}</span>
    </a>
  )
}

function ExportMenu() {
  const file = useRef<HTMLInputElement>(null)
  const importScenario = useStore(s => s.importScenario)
  const { active: r } = useModel()
  const scenario = useStore(s => s.scenarios.find(x => x.id === s.activeId) ?? s.scenarios[0])
  const onFile = async (f: File | undefined) => {
    if (!f) return
    let text: string
    try { text = await f.text() } catch { toast.error(`Could not read ${f.name}.`); return }
    const res = importScenario(text)
    if (res.ok) toast.success(`Imported ${f.name} as a new scenario and opened it`)
    else toast.error(res.error ?? 'Import failed.')
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-9 w-9 bg-card px-0 md:w-auto md:px-3" aria-label="Export and import">
            <Download aria-hidden="true" /><span className="hidden md:inline">Export</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => download(`${slug(scenario.name)}.json`, exportScenarioJson(scenario), 'application/json')}>
            <FileJson aria-hidden="true" />Export scenario (JSON)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => file.current?.click()}>
            <Upload aria-hidden="true" />Import scenario…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Schedules exist only once every input has a value. */}
          <DropdownMenuItem disabled={!r} onSelect={() => { if (r) download(`${slug(scenario.name)}-schedules.csv`, exportSchedulesCsv(r), 'text/csv') }}>
            <Sheet aria-hidden="true" />Export schedules (CSV)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Outside the menu, which unmounts on close. Reset so choosing the same file again still fires change. */}
      <input ref={file} type="file" accept="application/json,.json" className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={e => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
    </>
  )
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <Button variant="ghost" size="icon" className={className} onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  )
}

export function Topbar({ onMenu }: { onMenu(): void }) {
  const sample = useStore(s => activeTemplate(s) === 'sample')
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:gap-3 sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={onMenu} aria-label="Open sections">
        <Menu aria-hidden="true" />
      </Button>
      <ProjectSwitcher />
      <ScenarioSwitcher />
      {sample && (
        <Badge variant="outline" className="shrink-0 whitespace-nowrap rounded-full border-warning/40 bg-warning/10 px-2 font-medium text-foreground sm:px-2.5">
          Demo data
        </Badge>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <CommandPalette />
        <HealthBadge />
        <ExportMenu />
        {/* Below sm the toggle lives in the sections drawer, leaving room for the scenario name. */}
        <ThemeToggle className="hidden sm:inline-flex" />
      </div>
    </header>
  )
}
