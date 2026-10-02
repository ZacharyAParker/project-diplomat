import type { Change, Content } from '@diplomat/engine'
import { describe, groupChanges, type Direction } from '../logic/changes.ts'
import { Pips } from './Meter.tsx'

function Arrow({ direction }: { direction: Direction }) {
  const points =
    direction === 'up' ? '6,1 11,10 1,10' : direction === 'down' ? '1,2 11,2 6,11' : '1,5 11,5 11,7 1,7'
  return (
    <svg
      className="change__arrow"
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
      focusable="false"
    >
      <polygon points={points} fill="currentColor" />
    </svg>
  )
}

export interface ChangeLineProps {
  change: Change
  content: Content
  // "shown" prints the reason under the line, "folded" puts it behind a disclosure,
  // "none" leaves it out.
  reason?: 'shown' | 'folded' | 'none'
}

// One movement: an arrow, the name, how far, and whether that is good. The same line is
// used for a forecast before a choice and for the record after it.
export function ChangeLine({ change, content, reason = 'shown' }: ChangeLineProps) {
  const d = describe(change, content)
  const line = (
    <span className="change__line">
      <Arrow direction={d.direction} />
      <span className="change__name">{d.name}</span>
      <span className="change__movement">{d.movement}</span>
      <Pips size={d.size} tone={d.tone} />
      {d.verdict && <span className="change__verdict label">{d.verdict}</span>}
    </span>
  )
  if (reason === 'folded' && d.why) {
    return (
      <li className={`change change--${d.tone}`}>
        <details>
          <summary>{line}</summary>
          <p className="change__why small soft">{d.why}</p>
        </details>
      </li>
    )
  }
  return (
    <li className={`change change--${d.tone}`}>
      {line}
      {reason === 'shown' && d.why && <p className="change__why small soft">{d.why}</p>}
    </li>
  )
}

export interface ChangeListProps {
  changes: readonly Change[]
  content: Content
  reason?: ChangeLineProps['reason']
  // What to print when nothing moved.
  empty?: string
}

// Changes sorted under "The country", "Factions" and "Cabinet", in the order recorded.
// The group names are labels and not headings, since the list sits under headings of
// different levels on different screens.
export function ChangeList({ changes, content, reason = 'shown', empty }: ChangeListProps) {
  if (changes.length === 0) return empty ? <p className="soft">{empty}</p> : null
  return (
    <div className="changes">
      {groupChanges(changes).map((group) => (
        <div key={group.group} className="changes__group">
          <p className="label soft">{group.label}</p>
          <ul aria-label={group.label}>
            {group.changes.map((change, i) => (
              <ChangeLine key={i} change={change} content={content} reason={reason} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
