import { useEffect, useState } from 'react'
import { Info, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cookies } from '../lib/cookies'

export const NOTICE_KEY = 'milestone.notice.method'

const seen = () => { try { return cookies.get(NOTICE_KEY) !== null } catch { return true } } // cookies blocked: never nag

/** One-time notice (per browser) that saved projects now compute with the original workbook's method, linking to the
 *  method notes. The flag is set as soon as it shows, so a reload does not show it again. */
export function MethodNotice() {
  const [open, setOpen] = useState(() => !seen())
  useEffect(() => { if (open) try { cookies.set(NOTICE_KEY, '1') } catch { /* memory only */ } }, [open])
  if (!open) return null
  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/[0.05] px-4 py-3 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-5">
        Numbers now follow the original workbook's method; saved projects are recomputed with it.{' '}
        <a href="#/health?section=notes" onClick={() => setOpen(false)} className="font-medium text-primary hover:underline">
          See the method notes
        </a>
      </p>
      <Button variant="ghost" size="icon" className="-my-1 -mr-2 size-7 shrink-0" aria-label="Dismiss" onClick={() => setOpen(false)}>
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}
