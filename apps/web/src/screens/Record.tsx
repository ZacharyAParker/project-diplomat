import type { Content } from '@diplomat/engine'
import { memo, useCallback, useMemo, useState } from 'react'
import { dayLabel } from '../logic/changes.ts'
import { KICKERS } from '../logic/frontpage.ts'
import {
  DAYS_PER_PAGE,
  FILTERS,
  recordDays,
  summaryLine,
  type FilterId,
  type RecordEntry,
} from '../logic/record.ts'
import { termReport } from '../logic/term.ts'
import { useGame, type Current } from '../store/game.tsx'
import { Button, ChangeList, Screen, Segmented, TermReportView } from '../ui/index.ts'

interface RowProps {
  item: RecordEntry
  open: boolean
  onToggle(index: number): void
  content: Content
  current: Current
}

// Closed, an entry is one line. Its changes are only built when it is opened, and a row
// is only drawn again when it is the one that was opened or shut, which is what keeps a
// record of thousands of entries quick.
const Row = memo(function Row({ item, open, onToggle, content, current }: RowProps) {
  const { entry, index } = item
  const body = `entry-${index}`
  const moved = entry.changes.length
  const report = open ? termReport(entry, current.state.timeline, current.history) : null
  return (
    <li className={open ? 'record__entry record__entry--open' : 'record__entry'}>
      <h3 className="record__head">
        <button
          type="button"
          className="record__toggle"
          aria-expanded={open}
          aria-controls={body}
          onClick={() => onToggle(index)}
        >
          <span className="label soft">{KICKERS[entry.kind]}</span>
          <span className="record__headline">{entry.headline}</span>
          <span className="small soft">
            {moved === 0 ? 'Nothing moved' : moved === 1 ? 'One change' : `${moved} changes`}
          </span>
        </button>
      </h3>
      {open && (
        <div id={body} className="record__body">
          {report ? (
            <TermReportView report={report} ending={entry} content={content} />
          ) : (
            <>
              {entry.text && <p>{entry.text}</p>}
              <ChangeList
                changes={entry.changes}
                content={content}
                reason="shown"
                empty={entry.text ? undefined : 'Nothing more was written down.'}
              />
            </>
          )}
        </div>
      )}
    </li>
  )
})

export function TheRecord({ current }: { current: Current }) {
  const { content } = useGame()
  const { timeline } = current.state
  const [filter, setFilter] = useState<FilterId>('all')
  const [shown, setShown] = useState(DAYS_PER_PAGE)
  const [open, setOpen] = useState<readonly number[]>([])

  const days = useMemo(() => recordDays(timeline, filter), [timeline, filter])
  const visible = days.slice(0, shown)
  const hidden = days.length - visible.length

  const toggle = useCallback((index: number) => {
    setOpen((old) => (old.includes(index) ? old.filter((i) => i !== index) : [...old, index]))
  }, [])

  return (
    <Screen
      title="The record"
      kicker={summaryLine(timeline.length, current.state.day)}
      intro={<p>Everything that has happened, newest first. Nothing is ever removed from it.</p>}
      className="record"
    >
      <Segmented
        legend="Show"
        options={FILTERS.map((f) => ({ value: f.id, label: f.label }))}
        value={filter}
        onChange={(value) => {
          setFilter(value)
          setShown(DAYS_PER_PAGE)
        }}
      />

      {days.length === 0 ? (
        <p className="record__empty soft">
          Nothing of that kind has happened yet. It will be written down here when it does.
        </p>
      ) : (
        <div className="record__days">
          {visible.map((day) => (
            <section key={day.day} className="record__day" aria-labelledby={`day-${day.day}`}>
              <h2 id={`day-${day.day}`} className="record__date">
                {dayLabel(day.day)}
              </h2>
              <ul>
                {day.entries.map((item) => (
                  <Row
                    key={item.index}
                    item={item}
                    open={open.includes(item.index)}
                    onToggle={toggle}
                    content={content}
                    current={current}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {hidden > 0 && (
        <p className="record__more">
          <Button onClick={() => setShown(shown + DAYS_PER_PAGE)}>Show earlier days ({hidden} more)</Button>
        </p>
      )}
    </Screen>
  )
}
