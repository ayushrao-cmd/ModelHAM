import { CalendarRange, ChartSpline, HardHat, HeartPulse, IndianRupee, Landmark, Layers, LayoutDashboard, Scale, TrendingUp, Wrench, type LucideIcon } from 'lucide-react'
import type { Check } from '../engine/health'
import type { SectionId } from '../engine/types'

/** `short`: sidebar label when the full one would truncate. */
export interface SectionMeta { id: SectionId; label: string; short?: string; icon: LucideIcon; description: string }

// Spec §5 order. 'story' sections are the deal → build → fund → earn → operate → return sequence.
export const SECTIONS: SectionMeta[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, description: 'Headline returns, coverage and health for the active scenario.' },
  { id: 'deal', label: 'Deal & Timeline', icon: CalendarRange, description: 'Bid price, authority estimate, project length and every date from bid to final payment.' },
  { id: 'build', label: 'Build', icon: HardHat, description: 'Construction budget: hard and soft costs, GST and the uses of funds.' },
  { id: 'phasing', label: 'Phasing', icon: ChartSpline, description: 'Month-by-month construction schedule, progress against the build milestones and how each month is funded.' },
  { id: 'capital', label: 'Capital', icon: Landmark, description: 'Funding stack, drawdown, interest during construction, reserves and repayment.' },
  { id: 'income', label: 'Income', icon: IndianRupee, description: 'Completion-cost installments, interest on the balance, O&M payments and indexation.' },
  { id: 'operations', label: 'Operations', icon: Wrench, description: 'Routine and major maintenance, SPV running costs, insurance and inflation.' },
  { id: 'returns', label: 'Returns', icon: TrendingUp, description: 'Project and equity IRRs, coverage by period, cash waterfall and sensitivity.' },
  { id: 'statements', label: 'Financial Statements', short: 'Statements', icon: Scale, description: 'Income statement, balance sheet and cash flow for each financial year of the project.' },
  { id: 'health', label: 'Health', icon: HeartPulse, description: 'Every check, why it passed or failed, and the field to fix.' },
  { id: 'scenarios', label: 'Scenarios', icon: Layers, description: 'Saved scenarios and a side-by-side comparison.' },
]
export const STORY: SectionId[] = ['deal', 'build', 'phasing', 'capital', 'income', 'operations', 'returns']
export const sectionMeta = (id: SectionId) => SECTIONS.find(s => s.id === id)!

export type Status = 'error' | 'warning' | 'ok' | 'none'
/** Worst failing severity in a section. Health summarises all checks; a section with no checks reports 'none'. */
export function sectionStatus(checks: Check[], id: SectionId): Status {
  const mine = id === 'health' ? checks : checks.filter(c => c.section === id)
  if (!mine.length) return 'none'
  if (mine.some(c => !c.pass && c.severity === 'error')) return 'error'
  if (mine.some(c => !c.pass && c.severity === 'warning')) return 'warning'
  return 'ok'
}
