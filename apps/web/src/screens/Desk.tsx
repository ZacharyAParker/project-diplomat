import type { TimelineEntry } from '@diplomat/engine'
import type { Docket } from '@diplomat/government'
import { useEffect, useMemo, useRef, useState } from 'react'
import { dayLabel } from '../logic/changes.ts'
import {
  agendaCards,
  boxNotice,
  claimDecisions,
  closingLine,
  todaysDecisions,
  type BoxNotice,
  type Card,
  type ForecastView,
} from '../logic/desk.ts'
import { anyActive, decidedBy, executiveTitle } from '../logic/docket.ts'
import { composeFrontPage, editionEntries } from '../logic/frontpage.ts'
import { VERDICT_TITLES, nightMoment, termReport, verdictOf } from '../logic/term.ts'
import { useGame, useStore, type Current } from '../store/game.tsx'
import type { DecideExtra } from '../store/gameStore.ts'
import { useAction } from '../store/useAction.ts'
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
import { DocketView } from './desk/Docket.tsx'
import { FrontPage } from './desk/FrontPage.tsx'
import { Press } from './desk/Press.tsx'
import { Overnight } from './desk/Night.tsx'

// What the night produced, held until the player has read it. The election or the fall,
// if there was one, is shown first and on its own.
interface Night {
  day: number
  entries: TimelineEntry[]
  moment: TimelineEntry | null
  showing: 'moment' | 'rest'
}

// While any docket is being worked on, ask after it every so often, and stop asking as soon
// as none is, or the desk is left.
function useDocketPolling(current: Current): string | null {
  const store = useStore()
  const active = anyActive(current.government)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    // Nothing is being asked any more, so nothing can be going wrong with the asking.
    if (!active) {
      setProblem(null)
      return
    }
    let stopped = false
    let asking = false
    const timer = window.setInterval(() => {
      if (stopped || asking) return
      asking = true
      store
        .pollDockets()
        .then(
          () => setProblem(null),
          (error: unknown) => setProblem(error instanceof Error ? error.message : 'The bodies could not be asked.'),
        )
        .finally(() => {
          asking = false
        })
    }, store.pollMs)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [active, store, current.id])
  return problem
}

export function Desk({ current }: { current: Current }) {
  const game = useGame()
  const announce = useAnnounce()
  const { content } = game
  const { state } = current
  const [night, setNight] = useState<Night | null>(null)
  // A past term report, opened from the front page.
  const [reading, setReading] = useState<TimelineEntry | null>(null)
  const ending = useAction()
  const polling = useDocketPolling(current)

  async function close(how: 'end' | 'day' | 'week') {
    const day = state.day
    const entries = await ending.run(how, () => (how === 'end' ? game.endDay() : game.run(how === 'week' ? 7 : 1)))
    if (!entries) return
    const moment = nightMoment(entries)
    setNight({ day, entries, moment, showing: moment ? 'moment' : 'rest' })
    announce(how === 'week' ? 'A week has passed.' : `${dayLabel(day)} is over.`)
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
      <Day
        key={state.day}
        current={current}
        onEnd={(how) => void close(how)}
        ending={ending.busy}
        endError={ending.error}
        pollError={polling}
        onReport={setReading}
      />
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
  onEnd(how: 'end' | 'day' | 'week'): void
  // Which way of ending the day is on its way, if any.
  ending: string | null
  endError: string | null
  pollError: string | null
  onReport(entry: TimelineEntry): void
}

function Day({ current, onEnd, ending: closing, endError, pollError, onReport }: DayProps) {
  const game = useGame()
  const store = useStore()
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
  const [deciding, setDeciding] = useState<string | null>(null)
  const found = current.mode === 'found'
  const dockets = current.government?.dockets ?? {}

  const placed = Object.values(done).map((d) => d.index)
  const unplaced = decided.filter((d) => !placed.includes(d.index))
  // A petition decided away from the player (by the executive in found mode, by a Word, by
  // the Director) is shown once, with its docket and the badge of whoever decided it: in its
  // own slot if it was on the desk when it opened, otherwise with the earlier decisions.
  const claims = useMemo(
    () => claimDecisions(state, content, Object.values(dockets), unplaced),
    // unplaced follows from state and done.
    [state, content, dockets, done],
  )
  const inSlot = new Set(slots.filter((key) => claims.has(key) && !done[key] && !cards.some((c) => c.key === key)))
  const claimedBySlot = new Set([...inSlot].map((key) => claims.get(key)!))
  const earlier = unplaced.filter((d) => !claimedBySlot.has(d.index))
  const docketOf = (index: number) => {
    for (const [dilemma, at] of claims) if (at === index) return dockets[dilemma]
    return undefined
  }
  const total = slots.length + earlier.length
  const undecided = cards.filter((card) => !left.includes(card.key))

  async function decide(card: Card, course: string, view: ForecastView | null, extra: DecideExtra) {
    if (deciding) return
    setDeciding(card.key)
    try {
      const entry =
        card.dilemmaId === null ? await game.decideSituation(course) : await game.decide(card.dilemmaId, course, extra)
      // Where the entry landed in the timeline the server sent back.
      const timeline = store.get().nation?.state.timeline ?? []
      const wanted = JSON.stringify(entry)
      let index = timeline.length - 1
      for (let i = timeline.length - 1; i >= 0; i--) {
        if (JSON.stringify(timeline[i]) === wanted) {
          index = i
          break
        }
      }
      setRefused(null)
      const empty: ForecastView = { changes: [], policies: [], warnings: [], later: false, promise: null, nothing: true }
      setDone((old) => ({ ...old, [card.key]: { index, title: card.title, view: view ?? empty } }))
      announce(`Decided. ${entry.headline}`)
    } catch (error) {
      setRefused(error instanceof Error ? error.message : 'the server refused')
    } finally {
      setDeciding(null)
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
        <Press current={current} />
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
            <p>The decision was refused: {refused} Nothing has changed.</p>
          </Notice>
        )}
        {pollError && (
          <Notice tone="problem" title="The bodies could not be asked">
            <p>{pollError} The desk keeps trying.</p>
          </Notice>
        )}

        <div className="desk__cards">
          {earlier.map(({ index, entry }) => {
            const docket = docketOf(index)
            if (docket) return <Decided key={index} docket={docket} entry={entry} current={current} />
            return (
              <EntrySheet
                key={index}
                entry={entry}
                content={content}
                look="paper"
                kicker="Decided earlier today"
                empty="Nothing moved."
                className="result"
              />
            )
          })}
          {slots.map((key) => {
            const card = cards.find((c) => c.key === key)
            const result = done[key]
            if (inSlot.has(key)) {
              const index = claims.get(key)!
              return <Decided key={key} docket={dockets[key]!} entry={state.timeline[index]!} current={current} />
            }
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
                docket={card.dilemmaId ? dockets[card.dilemmaId] : null}
                busy={deciding === key}
                onDecide={(course, view, extra) => void decide(card, course, view, extra)}
                onConvene={card.dilemmaId ? () => game.convene(card.dilemmaId!) : undefined}
                onLeave={() => setLeft([...left, key])}
              />
            )
          })}
        </div>

        {found ? (
          <Sheet title="Run the nation" className="desk__close">
            <p>
              {executiveTitle(current.government)} decides each petition as the rules allow, and the day ends. You can
              still step in on any of them by Word first.
            </p>
            {endError && (
              <Notice tone="problem" title="The day did not end">
                <p>{endError}</p>
              </Notice>
            )}
            <div className="row">
              <Button look="accent" disabled={closing !== null} aria-busy={closing === 'day'} onClick={() => onEnd('day')}>
                {closing === 'day' ? 'Running the day' : 'Run the day'}
              </Button>
              <Button disabled={closing !== null} aria-busy={closing === 'week'} onClick={() => onEnd('week')}>
                {closing === 'week' ? 'Running the week' : 'Run a week'}
              </Button>
            </div>
          </Sheet>
        ) : (
          <Sheet title="End the day" className="desk__close">
            <p>{closingLine(total, cards.length, current.electionIn)}</p>
            {endError && (
              <Notice tone="problem" title="The day did not end">
                <p>{endError}</p>
              </Notice>
            )}
            <Button
              look="accent"
              wide
              disabled={closing !== null}
              aria-busy={closing !== null}
              onClick={() => (undecided.length > 0 ? setAsking(true) : onEnd('end'))}
            >
              End the day
            </Button>
          </Sheet>
        )}
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
            <Button
              look="primary"
              onClick={() => {
                setAsking(false)
                onEnd('end')
              }}
            >
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

// A petition decided away from the desk's Accept buttons: its entry, the badge of whoever
// decided it, and the docket that led there, folded.
function Decided({ docket, entry, current }: { docket: Docket; entry: TimelineEntry; current: Current }) {
  const { content } = useGame()
  const dilemma = content.dilemmas.find((d) => d.id === docket.dilemma)
  return (
    <EntrySheet
      entry={entry}
      content={content}
      look="paper"
      kicker={`${dilemma?.title ?? `Petition #${docket.number}`}. ${decidedBy(docket.decision?.by ?? 'executive', current.government)}`}
      empty="Nothing moved."
      className="result issue--decided"
    >
      <details className="fold">
        <summary>How Petition #{docket.number} was decided</summary>
        <div className="fold__body">
          <DocketView docket={docket} nation={current.id} government={current.government} options={dilemma?.options ?? []} />
        </div>
      </details>
    </EntrySheet>
  )
}
