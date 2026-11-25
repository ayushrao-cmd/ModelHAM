import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { SectionId } from '../engine/types'
import { FIELDS } from '../fields'
import { Field, WIDE } from './fields/Field'

/** A card of one input group's fields, in FIELDS order. Lists and text take the full width. */
export function InputGroup({ section, group }: { section: SectionId; group: string }) {
  const fields = FIELDS.filter(f => f.section === section && f.group === group)
  const headingId = `group-${section}-${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <Card role="region" aria-labelledby={headingId} className="shadow-card">
      <CardHeader className="px-5 pb-3 pt-4">
        <h2 id={headingId} className="text-[15px] font-semibold leading-6">{group}</h2>
      </CardHeader>
      <CardContent className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-4 gap-y-4 px-5 pb-5">
        {fields.map(f => <Field key={f.id} id={f.id} className={WIDE.includes(f.kind) ? 'col-span-full' : undefined} />)}
      </CardContent>
    </Card>
  )
}
