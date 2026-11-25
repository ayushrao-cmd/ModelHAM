import { cn } from '@/lib/utils'
import type { SectionId } from '../engine/types'
import { useModel } from '../state/useModel'
import { hrefFor } from './router'
import { SECTIONS, STORY, sectionStatus, type SectionMeta, type Status } from './sections'

const DOT: Record<Status, string> = { error: 'bg-destructive', warning: 'bg-warning', ok: 'bg-success', none: 'bg-muted-foreground/40' }
const SAY: Record<Status, string> = { error: 'has errors', warning: 'has warnings', ok: 'all checks pass', none: 'no checks' }

/** The product mark: a highway milestone stone, cap in the accent colour. */
export function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-3">
      <svg viewBox="0 0 20 20" className="size-6 shrink-0" aria-hidden="true">
        <path d="M4.5 18V9.25a5.5 5.5 0 0 1 11 0V18z" className="fill-card stroke-foreground" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M5.25 9.25a4.75 4.75 0 0 1 9.5 0v1.5h-9.5z" className="fill-primary" />
        <path d="M2.5 18h15" className="stroke-foreground" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">Milestone</div>
        <div className="text-xs text-muted-foreground">HAM bid modeller</div>
      </div>
    </div>
  )
}

function Item({ s, active, status, onNavigate, rail }: { s: SectionMeta; active: boolean; status: Status; onNavigate?: () => void; rail?: boolean }) {
  const Icon = s.icon
  return (
    <li>
      <a href={hrefFor(s.id)} onClick={onNavigate} aria-current={active ? 'page' : undefined}
        className={cn('group flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors',
          'hover:bg-accent hover:text-foreground', active && 'bg-accent text-accent-foreground')}>
        <span className={cn('relative z-10 grid size-6 shrink-0 place-items-center rounded-md transition-colors',
          rail && 'border bg-sidebar', active && rail && 'border-primary bg-primary text-primary-foreground')}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="flex-1 truncate" title={s.short && s.label}>{s.short ?? s.label}</span>
        <span className={cn('size-2 shrink-0 rounded-full', DOT[status])} title={`${s.label} ${SAY[status]}`} aria-hidden="true" />
        <span className="sr-only">, {SAY[status]}</span>
      </a>
    </li>
  )
}

export function SidebarNav({ current, onNavigate }: { current: SectionId; onNavigate?: () => void }) {
  const { checks } = useModel()
  const item = (s: SectionMeta, rail = false) =>
    <Item key={s.id} s={s} rail={rail} active={s.id === current} status={sectionStatus(checks, s.id)} onNavigate={onNavigate} />
  const story = SECTIONS.filter(s => STORY.includes(s.id))
  return (
    <nav aria-label="Sections" className="flex flex-col gap-4 px-3">
      <ul>{item(SECTIONS[0])}</ul>
      {/* The story sections are a sequence (deal → … → returns): a thin route line joins their icons. */}
      <ul className="relative before:absolute before:bottom-5 before:left-[23.5px] before:top-5 before:w-px before:bg-border">
        {story.map(s => item(s, true))}
      </ul>
      <ul className="border-t pt-4">{SECTIONS.filter(s => !STORY.includes(s.id) && s.id !== 'overview').map(s => item(s))}</ul>
    </nav>
  )
}

export function Sidebar({ current }: { current: SectionId }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-6 border-r bg-sidebar py-4 lg:flex">
      <Brand />
      <SidebarNav current={current} />
    </aside>
  )
}
