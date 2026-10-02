import type { Content, TimelineEntry } from '@diplomat/engine'
import type { CSSProperties } from 'react'
import { Button, EntrySheet } from '../../ui/index.ts'

export interface OvernightProps {
  entries: readonly TimelineEntry[]
  content: Content
  // True when an election or a fall has already been shown, so an empty list is not a quiet night.
  afterMoment: boolean
  onMorning(): void
}

// Everything the end of the day produced, in the order it happened, each with its reasons.
export function Overnight({ entries, content, afterMoment, onMorning }: OvernightProps) {
  return (
    <div className="night">
      {entries.length === 0 ? (
        <p className="lede measure">
          {afterMoment
            ? 'Nothing else happened. It was enough.'
            : 'Nothing stirred. No bills came due, nobody resigned, and the country slept.'}
        </p>
      ) : (
        <ol className="night__list">
          {entries.map((entry, i) => (
            <li key={i} className="night__item" style={{ '--nth': i } as CSSProperties}>
              <EntrySheet entry={entry} content={content} level={2} />
            </li>
          ))}
        </ol>
      )}
      <p className="night__on">
        <Button look="accent" onClick={onMorning}>
          To the morning paper
        </Button>
      </p>
    </div>
  )
}
