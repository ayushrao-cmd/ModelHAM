import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Info, Search, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import type { Check } from '../engine/health'
import type { SectionId } from '../engine/types'
import { FIELDS } from '../fields'
import { useModel } from '../state/useModel'
import { go } from './router'
import { SECTIONS, sectionMeta } from './sections'

const RANK = { error: 0, warning: 1, info: 2 }
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

function CheckIcon({ c }: { c: Check }) {
  if (c.pass) return <CircleCheck className="text-success" aria-hidden="true" />
  if (c.severity === 'error') return <CircleAlert className="text-destructive" aria-hidden="true" />
  if (c.severity === 'warning') return <TriangleAlert className="text-warning" aria-hidden="true" />
  return <Info className="text-muted-foreground" aria-hidden="true" />
}
const status = (c: Check) => (c.pass ? 'Passed' : c.severity === 'error' ? 'Error' : c.severity === 'warning' ? 'Warning' : 'Note')

/** ⌘K / Ctrl+K: jump to a section, a field or a health check. Includes its own top-bar trigger. */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const { checks } = useModel()
  const jumped = useRef(false)
  const sorted = useMemo(() => [...checks].sort((a, b) => Number(a.pass) - Number(b.pass) || RANK[a.severity] - RANK[b.severity]), [checks])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) { e.preventDefault(); setOpen(o => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const jump = (section: SectionId, fieldId?: string) => { jumped.current = true; setOpen(false); go(section, fieldId) }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} aria-keyshortcuts="Meta+K Control+K"
        aria-label="Search sections, fields and checks"
        className="h-9 w-9 shrink-0 gap-2 bg-card px-0 text-muted-foreground md:w-auto md:px-2.5">
        <Search aria-hidden="true" />
        <span className="hidden md:inline">Search</span>
        <kbd className="ml-1 hidden rounded-sm border bg-muted px-1.5 font-sans text-[11px] font-medium leading-5 text-muted-foreground md:inline">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search Milestone" description="Jump to a section, an input field or a health check."
        // After a jump the target field (or section heading) takes focus; do not hand it back to the trigger.
        onCloseAutoFocus={e => { if (jumped.current) { e.preventDefault(); jumped.current = false } }}>
        <CommandInput placeholder="Search sections, fields and checks…" />
        <CommandList className="max-h-[min(60vh,26rem)]">
          <CommandEmpty>No section, field or check matches.</CommandEmpty>
          <CommandGroup heading="Sections">
            {SECTIONS.map(s => (
              <CommandItem key={s.id} value={`section:${s.id} ${s.label}`} onSelect={() => jump(s.id)}>
                <s.icon className="text-muted-foreground" aria-hidden="true" />{s.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Fields">
            {FIELDS.map(f => {
              const sec = sectionMeta(f.section).label
              return (
                <CommandItem key={f.id} value={`field:${f.id} ${f.label}`} keywords={[sec, f.group]} onSelect={() => jump(f.section, f.id)}>
                  <span className="min-w-0 flex-1 truncate">{f.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{sec}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
          <CommandGroup heading="Checks">
            {sorted.map(c => (
              <CommandItem key={c.id} value={`check:${c.id} ${c.title}`} keywords={[c.message, sectionMeta(c.section).label]}
                onSelect={() => jump(c.section, c.fieldId)} className="items-start">
                <CheckIcon c={c} />
                <span className="min-w-0 flex-1">
                  <span className="sr-only">{status(c)}: </span>
                  <span className={cn('block truncate', c.pass && 'text-muted-foreground')}>{c.title}</span>
                  {!c.pass && <span className="block truncate text-xs text-muted-foreground">{c.message}</span>}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
