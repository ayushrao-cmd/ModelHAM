import { useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Copy, FilePlus2, FolderOpen, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { missingOf } from '../state/projects'
import { allProjects, type Project, projectLabel, useStore } from '../state/store'

/** "Sample", or how much of a blank project's base scenario is filled in (nothing once complete). */
function fillTag(p: Project) {
  if (p.template === 'sample') return 'Sample'
  const base = p.scenarios.find(s => s.id === p.baseId) ?? p.scenarios[0]
  const { filled, total } = missingOf(base.empty)
  return filled < total ? `${Math.floor((filled / total) * 100)}% filled` : null
}

/** Top-bar project menu: switch, create (blank or sample), duplicate, rename and delete. */
export function ProjectSwitcher() {
  const stored = useStore(s => s.projects)
  const projectId = useStore(s => s.projectId)
  const scenarios = useStore(s => s.scenarios)
  const activeId = useStore(s => s.activeId)
  const baseId = useStore(s => s.baseId)
  const compareId = useStore(s => s.compareId)
  const { setProject, createProject, renameProject, deleteProject } = useStore.getState()
  const projects = useMemo(() => allProjects({ projects: stored, projectId, scenarios, activeId, baseId, compareId }),
    [stored, projectId, scenarios, activeId, baseId, compareId])
  const current = projects.find(p => p.id === projectId)!
  const name = projectLabel(current)
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const opening = useRef(false) // a dialog opened from the menu keeps focus; the menu must not hand it back to the trigger
  const trigger = useRef<HTMLButtonElement>(null)
  // When a dialog closes, focus returns to the switcher (Radix would aim for the menu item, which is gone).
  const backToTrigger = (e: Event) => { e.preventDefault(); trigger.current?.focus() }

  const open = (d: 'rename' | 'delete') => { opening.current = true; setDialog(d) }
  const create = (kind: 'blank' | 'sample' | 'duplicate') => {
    createProject(kind)
    toast.success(kind === 'blank' ? 'Created a blank project: fill in its inputs to see results'
      : kind === 'sample' ? 'Created a project from the sample data' : `Duplicated ${name}`)
  }
  const rename = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const v = new FormData(e.currentTarget).get('name')
    if (typeof v === 'string' && v.trim()) { renameProject(projectId, v); toast.success(`Renamed to ${v.trim()}`) }
    setDialog(null)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Below sm only the folder icon shows (the name stays its accessible label), leaving room for the scenario name. */}
          <Button ref={trigger} variant="outline" className="h-9 w-9 shrink-0 gap-1.5 bg-card px-0 sm:w-auto sm:min-w-0 sm:max-w-[15rem] sm:shrink sm:justify-between sm:px-3">
            <FolderOpen className="text-muted-foreground" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only sm:truncate">{name}</span>
            <ChevronsUpDown className="hidden text-muted-foreground sm:block" aria-hidden="true" />
            <span className="sr-only">, switch project</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72"
          onCloseAutoFocus={e => { if (opening.current) { e.preventDefault(); opening.current = false } }}>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Projects</DropdownMenuLabel>
          {projects.map(p => {
            const tag = fillTag(p)
            return (
              <DropdownMenuItem key={p.id} onSelect={() => setProject(p.id)} className="gap-2">
                <Check className={cn('text-primary', p.id !== projectId && 'invisible')} aria-hidden="true" />
                <span className="flex-1 truncate">{projectLabel(p)}</span>
                {p.id === projectId && <span className="sr-only">, current project</span>}
                {tag && <span className={cn('shrink-0 rounded-full border px-1.5 text-[11px] leading-[18px] tabular-nums',
                  p.template === 'sample' ? 'border-warning/40 bg-warning/10 text-foreground' : 'text-muted-foreground')}>{tag}</span>}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => create('blank')}><FilePlus2 aria-hidden="true" />New blank project</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => create('sample')}><Sparkles aria-hidden="true" />New sample project</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => create('duplicate')}><Copy aria-hidden="true" />Duplicate project</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => open('rename')}><Pencil aria-hidden="true" />Rename…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open('delete')} disabled={projects.length === 1}
            className="text-destructive focus:text-destructive"><Trash2 aria-hidden="true" />Delete…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === 'rename'} onOpenChange={o => { if (!o) setDialog(null) }}>
        <DialogContent className="max-w-sm" onCloseAutoFocus={backToTrigger}>
          <form onSubmit={rename} className="grid gap-4">
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>Sets Project Name in every scenario of this project.</DialogDescription>
            <Input name="name" autoFocus aria-label="Project name" className="bg-card" placeholder="Project name"
              defaultValue={name === 'Untitled project' ? '' : name} />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={o => { if (!o) setDialog(null) }}>
        <DialogContent className="max-w-sm" onCloseAutoFocus={backToTrigger}>
          <DialogTitle className="break-words">Delete {name}?</DialogTitle>
          <DialogDescription>
            {current.scenarios.length === 1 ? 'Its scenario is' : `Its ${current.scenarios.length} scenarios are`} removed from this browser. Export them first to keep a copy.
          </DialogDescription>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { deleteProject(projectId); toast.success(`Deleted ${name}`); setDialog(null) }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
