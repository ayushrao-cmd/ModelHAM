import type { FieldDef } from '../../engine/types'
import { NumberField } from './NumberField'

interface Col { key: string; label: string; kind: FieldDef['kind'] }
export const COLUMNS: Partial<Record<FieldDef['kind'], Col[]>> = {
  milestoneList: [{ key: 'day', label: 'Day', kind: 'days' }, { key: 'physical', label: 'Physical %', kind: 'percent' }, { key: 'financial', label: 'Financial %', kind: 'percent' }],
  trancheList: [{ key: 'progress', label: 'Progress %', kind: 'percent' }, { key: 'shareOfBid', label: 'Share of bid %', kind: 'percent' }],
}

/** Small row editor for milestone and tranche lists; each cell commits to `${id}.${row}.${key}`. */
export function TableField({ def, domId, value, onCommit, describedBy }: {
  def: FieldDef; domId: string; value: Record<string, number>[]; onCommit(path: string, n: number): void; describedBy?: string
}) {
  const cols = COLUMNS[def.kind]!
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th scope="col" className="w-8 pb-1 font-medium">#</th>
          {cols.map(c => <th key={c.key} scope="col" className="pb-1 pl-1.5 text-right font-medium">{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {value.map((row, r) => (
          <tr key={r}>
            <th scope="row" className="py-0.5 text-left text-xs font-normal text-muted-foreground tabular-nums">{r + 1}</th>
            {cols.map((c, ci) => {
              const cell = r === 0 && ci === 0 ? domId : `${domId}-${r}-${c.key}`
              return (
                <td key={c.key} className="py-0.5 pl-1.5 align-top">
                  <NumberField id={cell} kind={c.kind} unit={false} value={row[c.key]} describedBy={describedBy}
                    aria-label={`${def.label} ${r + 1}: ${c.label}`}
                    onCommit={n => onCommit(`${def.id}.${r}.${c.key}`, n)} className="[&_input]:h-8 [&_input]:px-2" />
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
