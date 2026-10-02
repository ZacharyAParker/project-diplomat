import type { Content, TimelineEntry } from '@diplomat/engine'
import { useEffect, useRef, type ReactNode } from 'react'
import { KICKERS } from '../logic/frontpage.ts'
import { ChangeList } from './Changes.tsx'

export interface EntrySheetProps {
  entry: TimelineEntry
  content: Content
  // Small capitals above the headline. Left out, it is the kind of entry.
  kicker?: string
  level?: 2 | 3
  look?: 'column' | 'paper'
  // Hands focus to the headline when the sheet appears, for a result that has just
  // replaced the thing the player was looking at.
  takeFocus?: boolean
  // What to print when the entry moved nothing.
  empty?: string
  className?: string
  children?: ReactNode
}

// One timeline entry in full: headline, text, and every change with its reason, exactly
// as the engine recorded it. The desk, the night and the record all print entries with this.
export function EntrySheet(props: EntrySheetProps) {
  const { entry, content, kicker, level = 3, look = 'column', takeFocus, empty, className, children } = props
  const heading = useRef<HTMLHeadingElement>(null)
  const Heading = level === 2 ? 'h2' : 'h3'

  useEffect(() => {
    if (takeFocus) heading.current?.focus({ preventScroll: true })
  }, [takeFocus])

  return (
    <article className={['sheet', `sheet--${look}`, 'entry', className].filter(Boolean).join(' ')}>
      <p className="sheet__kicker label">{kicker ?? KICKERS[entry.kind]}</p>
      <Heading ref={heading} tabIndex={-1} className="sheet__title">
        {entry.headline}
      </Heading>
      {entry.text && <p className="entry__text">{entry.text}</p>}
      {children}
      <ChangeList changes={entry.changes} content={content} reason="shown" empty={empty} />
    </article>
  )
}
