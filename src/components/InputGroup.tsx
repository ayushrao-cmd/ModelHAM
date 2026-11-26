import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FIELDS } from '../fields'
import type { FieldDef, SectionId } from '../engine/types'
import { Field, WIDE } from './fields/Field'

const LISTS: FieldDef['kind'][] = ['percentList', 'milestoneList', 'trancheList']

/** A card of one input group's fields, in FIELDS order (a field with `after` follows that field). Lists and text take the full width. */
export function InputGroup({ section, group }: { section: SectionId; group: string }) {
  const all = FIELDS.filter(f => f.section === section && f.group === group)
  const fields = all.filter(f => !f.after).flatMap(f => [f, ...all.filter(x => x.after === f.id)])
  const headingId = `group-${section}-${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <Card role="region" aria-labelledby={headingId} className="shadow-card">
      <CardHeader className="px-5 pb-3 pt-4">
        <h2 id={headingId} className="text-[15px] font-semibold leading-6">{group}</h2>
      </CardHeader>
      <CardContent className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-4 gap-y-4 px-5 pb-5">
        {fields.map(f => <Field key={f.id} id={f.id} className={WIDE.includes(f.kind) ? 'col-span-full' : undefined}
          labelHidden={fields.length === 1 && LISTS.includes(f.kind) && f.label === group} />)}
      </CardContent>
    </Card>
  )
}
