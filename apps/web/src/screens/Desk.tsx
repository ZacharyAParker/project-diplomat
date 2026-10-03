import type { TimelineEntry } from '@diplomat/engine'
import { useMemo, useRef, useState } from 'react'
import { dayLabel } from '../logic/changes.ts'
import {
  agendaCards,
  boxNotice,
  closingLine,
  todaysDecisions,
  type BoxNotice,
  type Card,
  type ForecastView,
} from '../logic/desk.ts'
import { composeFrontPage, editionEntries } from '../logic/frontpage.ts'
import { VERDICT_TITLES, nightMoment, termReport, verdictOf } from '../logic/term.ts'
import { useGame, type Current } from '../store/game.tsx'
import {
  Button,
  Dialog,
  EntrySheet,
  Notice,
  Screen,
  Sheet,
  TermReportView,
  useAnnounce,
} from '../ui/index.ts'
import { AgendaCard, ForecastNotes, LeftCard } from './desk/AgendaCard.tsx'
import { FrontPage } from './desk/FrontPage.tsx'
import { Overnight } from './desk/Night.tsx'

// What the night produced, held until the player has read it. The election or the fall,
// if there was one, is shown first and on its own.
interface Night {
  day: number
  entries: TimelineEntry[]
  moment: TimelineEntry | null
  showing: 'moment' | 'rest'
}

export function Desk({ current }: { current: Current }) {
  const game = useGame()
  const announce = useAnnounce()
  const { content } = game
  const { state } = current
  const [night, setNight] = useState<Night | null>(null)
  // A past term report, opened from the front page.
  const [reading, setReading] = useState<TimelineEntry | null>(null)

  function endDay() {
    const day = state.day
    const entries = game.endDay()
    const moment = nightMoment(entries)
    setNight({ day, entries, moment, showing: moment ? 'moment' : 'rest' })
    announce(`${dayLabel(day)} is over.`)
  }

  if (night?.showing === 'moment' && night.moment) {
    const ending = night.moment
    const report = termReport(ending, state.timeline, current.history)
    const more = night.entries.length > 1
    return (
      <Screen
        title={VERDICT_TITLES[verdictOf(ending) ?? 'fell']}
        kicker={`The night after day ${night.day}`}
        focusKey="moment"
        className="desk desk--moment"
      >
        {report && <TermReportView report={report} ending={ending} content={content} />}
        <p className="night__on">
          <Button
            look="accent"
            onClick={() => (more ? setNight({ ...night, showing: 'rest' }) : setNight(null))}
          >
            {more ? 'The rest of the night' : 'To the morning paper'}
          </Button>
        </p>
      </Screen>
    )
  }

  if (night) {
    return (
      <Screen
        title="Overnight"
        kicker={`The night after day ${night.day}`}
        focusKey="night"
        className="desk desk--night"
      >
        <Overnight
          entries={night.entries.filter((entry) => entry !== night.moment)}
          content={content}
          afterMoment={night.moment !== null}
          onMorning={() => setNight(null)}
        />
      </Screen>
    )
  }

  if (reading) {
    const report = termReport(reading, state.timeline, current.history)
    return (
      <Screen
        title={VERDICT_TITLES[verdictOf(reading) ?? 'fell']}
        kicker={`The night after day ${reading.day}`}
        focusKey="reading"
        className="desk desk--moment"
      >
        {report && <TermReportView report={report} ending={reading} content={content} />}
        <p className="night__on">
          <Button look="primary" onClick={() => setReading(null)}>
            Back to the desk
          </Button>
        </p>
      </Screen>
    )
  }

  return (
    <Screen
      title="Issues"
      kicker={`${dayLabel(state.day)} in ${state.identity.capital}`}
      focusKey={`day ${state.day}`}
      className="desk"
    >
      <Day key={state.day} current={current} onEnd={endDay} onReport={setReading} />
    </Screen>
  )
}

// A paper decided since the desk was opened: where its entry is in the timeline, what the
// card was called, and the notes from its forecast, which the entry does not carry.
interface Done {
  index: number
  title: string
  view: ForecastView
}

interface DayProps {
  current: Current
  onEnd(): void
  onReport(entry: TimelineEntry): void
}

function Day({ current, onEnd, onReport }: DayProps) {
  const game = useGame()
  const announce = useAnnounce()
  const { content } = game
  const { state } = current
  const box = useRef<HTMLHeadingElement>(null)

  const page = useMemo(() => composeFrontPage(state, content), [state, content])
  const ending = useMemo(() => editionEntries(state).find((entry) => verdictOf(entry) !== null), [state])
  const cards = useMemo(() => agendaCards(current.agenda, state, content), [current.agenda, state, content])
  const decided = useMemo(() => todaysDecisions(state), [state])
  const notice = useMemo(() => boxNotice(state, content), [state, content])

  // The order the papers were in when the desk was opened. A result takes the place of
  // its card, so nothing on the page moves when a decision is made.
  const [slots] = useState(() => cards.map((card) => card.key))
  const [done, setDone] = useState<Record<string, Done>>({})
  const [left, setLeft] = useState<readonly string[]>([])
  const [asking, setAsking] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)

  const placed = Object.values(done).map((d) => d.index)
  const earlier = decided.filter((d) => !placed.includes(d.index))
  const total = slots.length + earlier.length
  const undecided = cards.filter((card) => !left.includes(card.key))

  function decide(card: Card, optionId: string, view: ForecastView, text?: string) {
    const index = state.timeline.length
    try {
      const entry =
        card.dilemmaId === null ? game.decideSituation(optionId) : game.decide(card.dilemmaId, optionId, text)
      setRefused(null)
      setDone((old) => ({ ...old, [card.key]: { index, title: card.title, view } }))
      announce(`Decided. ${entry.headline}`)
    } catch (error) {
      setRefused(error instanceof Error ? error.message : 'the engine refused')
    }
  }

  function toBox() {
    box.current?.scrollIntoView?.({ block: 'start' })
    box.current?.focus({ preventScroll: true })
  }

  return (
    <div className="desk__layout">
      <div className="desk__paper">
        {cards.length > 0 && (
          <p className="desk__jump">
            <Button look="quiet" size="small" onClick={toBox}>
              {cards.length === 1 ? 'One issue is waiting' : `${cards.length} issues are waiting`}: skip to
              them
            </Button>
          </p>
        )}
        <FrontPage
          page={page}
          capital={state.identity.capital}
          after={
            ending && (
              <p className="paper__more">
                <Button size="small" onClick={() => onReport(ending)}>
                  Read the term report
                </Button>
              </p>
            )
          }
        />
      </div>

      <section className="desk__box" aria-labelledby="box-title">
        <header className="desk__box-head">
          <h2 id="box-title" ref={box} tabIndex={-1}>
            Today's issues
          </h2>
          <p className="soft">
            {total === 0 ? 'Nothing needs deciding.' : `${total - cards.length} of ${total} decided.`}
          </p>
        </header>

        {notice && (notice.first || total > 0) && (
          <BoxNote notice={notice} nation={state.identity.name} pack={content.pack.name} />
        )}
        {total === 0 && (
          <p className="desk__empty measure">
            The box is empty. Days like this still count: the budget settles on the seventh day, old decisions
            come home, and the election gets nearer. End the day when you have had enough of it.
          </p>
        )}
        {refused && (
          <Notice tone="problem" title="That was not done">
            <p>The game refused the decision ({refused}). Nothing has changed.</p>
          </Notice>
        )}

        <div className="desk__cards">
          {earlier.map(({ index, entry }) => (
            <EntrySheet
              key={index}
              entry={entry}
              content={content}
              look="paper"
              kicker="Decided earlier today"
              empty="Nothing moved."
              className="result"
            />
          ))}
          {slots.map((key) => {
            const card = cards.find((c) => c.key === key)
            const result = done[key]
            const entry = result && state.timeline[result.index]
            if (entry) {
              return (
                <EntrySheet
                  key={key}
                  entry={entry}
                  content={content}
                  look="paper"
                  kicker={`The talking point: ${result.title}`}
                  empty="Nothing moved."
                  className="result result--fresh"
                  takeFocus
                >
                  <ForecastNotes view={result.view} />
                </EntrySheet>
              )
            }
            if (!card) return null
            if (left.includes(key)) {
              return (
                <LeftCard key={key} card={card} onReturn={() => setLeft(left.filter((k) => k !== key))} />
              )
            }
            return (
              <AgendaCard
                key={key}
                card={card}
                current={current}
                content={content}
                onDecide={(optionId, view, text) => decide(card, optionId, view, text)}
                onLeave={() => setLeft([...left, key])}
              />
            )
          })}
        </div>

        <Sheet title="End the day" className="desk__close">
          <p>{closingLine(total, cards.length, current.electionIn)}</p>
          <Button look="accent" wide onClick={() => (undecided.length > 0 ? setAsking(true) : onEnd())}>
            End the day
          </Button>
        </Sheet>
      </section>

      <Dialog
        open={asking}
        title="End the day with issues still open?"
        onClose={() => setAsking(false)}
        actions={
          <>
            <Button look="secondary" onClick={() => setAsking(false)}>
              Back to the desk
            </Button>
            <Button look="primary" onClick={onEnd}>
              End the day anyway
            </Button>
          </>
        }
      >
        <p>These have not been decided:</p>
        <ul className="desk__open">
          {undecided.map((card) => (
            <li key={card.key}>{card.title}</li>
          ))}
        </ul>
        <p>
          Once the day ends they are gone. A dilemma may come round again, or may not. A crisis moves to its
          next stage either way.
        </p>
      </Dialog>
    </div>
  )
}

function BoxNote({ notice, nation, pack }: { notice: BoxNotice; nation: string; pack: string }) {
  if (!notice.first) return <p className="soft">No major business today.</p>
  const kept =
    `${nation} is kept, and the routine goes on: budgets, pay rounds and reshuffles still come round, old ` +
    'decisions come home and elections are held. More dilemmas arrive with later versions.'
  if (notice.exhausted) {
    return (
      <Notice title="The pack has run out">
        <p>
          Every one-off dilemma in {pack} has now crossed this desk. {kept}
        </p>
      </Notice>
    )
  }
  const waiting =
    notice.remaining === 1
      ? 'One is still in the pack, waiting'
      : `${notice.remaining} are still in the pack, waiting`
  return (
    <Notice title="No major business">
      <p>
        No major dilemma fits the country as it stands today. {waiting} on circumstances that have not arisen.{' '}
        {kept}
      </p>
    </Notice>
  )
}
