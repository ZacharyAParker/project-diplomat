import {
  ELECTION_HEADLINES,
  TERM_DAYS,
  agendaItems,
  availableOptions,
  decide,
  decideSituation,
  endDay,
  type GameState,
  type TimelineEntry,
} from '@diplomat/engine'
import { describe, expect, it } from 'vitest'
import { content, founded } from '../test/fixtures.ts'
import { totalMovement } from './changes.ts'
import { snapshot, withDayEnd, type Snapshot } from './saves.ts'
import { nightMoment, termReport, verdictOf } from './term.ts'

interface Run {
  state: GameState
  history: Snapshot[]
}

// Plays like the store does, keeping a snapshot per day. Tamper is applied each morning.
function run(days: number, tamper: (state: GameState) => GameState = (s) => s): Run {
  let state = founded()
  let history = [snapshot(state, 0)]
  for (let i = 0; i < days; i++) {
    state = tamper(state)
    const agenda = agendaItems(state, content)
    if (agenda.situation) {
      state = decideSituation(state, content, availableOptions(agenda.situation.stage.options, state)[0]!.id)
    }
    for (const dilemma of [agenda.major, ...agenda.minors]) {
      if (dilemma) state = decide(state, content, dilemma.id, availableOptions(dilemma.options, state)[0]!.id)
    }
    state = endDay(state, content)
    history = withDayEnd(history, state)
  }
  return { state, history }
}

const entry = (kind: TimelineEntry['kind'], headline: string, day = 45): TimelineEntry => ({
  day,
  kind,
  headline,
  changes: [],
})

describe('verdictOf', () => {
  it('reads the three election results and a fall, and nothing else', () => {
    expect(verdictOf(entry('election', ELECTION_HEADLINES.won))).toBe('won')
    expect(verdictOf(entry('election', ELECTION_HEADLINES.reduced))).toBe('reduced')
    expect(verdictOf(entry('election', ELECTION_HEADLINES.lost))).toBe('lost')
    expect(verdictOf(entry('government', 'The government falls'))).toBe('fell')
    expect(verdictOf(entry('decision', ELECTION_HEADLINES.won))).toBeNull()
  })

  it('finds the moment among a night of entries', () => {
    const election = entry('election', ELECTION_HEADLINES.won)
    expect(nightMoment([entry('budget', 'Books'), election, entry('trait', 'Known')])).toBe(election)
    expect(nightMoment([entry('budget', 'Books')])).toBeNull()
    expect(nightMoment([])).toBeNull()
  })
})

describe('termReport', () => {
  const first = run(TERM_DAYS)
  const election = first.state.timeline.find((e) => e.kind === 'election')!

  it('is only made for an entry that ends a term', () => {
    expect(termReport(first.state.timeline[0]!, first.state.timeline, first.history)).toBeNull()
  })

  it('covers the first term from the founding to polling day', () => {
    const report = termReport(election, first.state.timeline, first.history)!
    expect(report).toMatchObject({ from: 1, to: TERM_DAYS, verdict: verdictOf(election) })
    const start = first.history.find((s) => s.day === 0)!
    const end = first.history.find((s) => s.day === TERM_DAYS)!
    for (const row of report.rows) {
      expect(row.start).toBe(start.indicators[row.id])
      expect(row.end).toBe(end.indicators[row.id])
    }
    expect(report.rows).toHaveLength(12)
  })

  it('takes the support figure from what the engine printed on polling day', () => {
    const report = termReport(election, first.state.timeline, first.history)!
    expect(report.support?.when).toBe('polling')
    expect(election.text).toContain(`Support stood at ${report.support!.value} on polling day`)
  })

  it('reads a rising debt as worse and a rising economy as better', () => {
    const start = { ...first.history[0]!, day: 0 }
    const end: Snapshot = {
      ...start,
      day: TERM_DAYS,
      indicators: {
        ...start.indicators,
        debt: start.indicators.debt + 9,
        capacity: start.indicators.capacity + 9,
      },
    }
    const report = termReport(election, first.state.timeline, [start, end])!
    const row = (id: string) => report.rows.find((r) => r.id === id)!
    expect(row('debt')).toMatchObject({ direction: 'up', tone: 'bad' })
    expect(row('capacity')).toMatchObject({ direction: 'up', tone: 'good' })
    expect(row('health')).toMatchObject({ direction: 'none', tone: 'neutral' })
  })

  it('lists the decisions that moved the most, biggest first, from this term only', () => {
    const report = termReport(election, first.state.timeline, first.history)!
    const moved = report.decisions.map((e) => totalMovement(e.changes))
    expect(report.decisions.length).toBeGreaterThan(0)
    expect(report.decisions.length).toBeLessThanOrEqual(5)
    expect(moved).toEqual([...moved].sort((a, b) => b - a))
    for (const e of report.decisions) expect(['decision', 'situation']).toContain(e.kind)
  })

  it('sorts promises into kept and broken', () => {
    const timeline = [
      entry('promise', 'Promise kept: No new taxes', 20),
      entry('promise', 'Promise broken: A railway to Dunmoor', 30),
      entry('promise', 'Promise kept: Too late to count', 50),
      election,
    ].sort((a, b) => a.day - b.day)
    const report = termReport(election, timeline, [])!
    expect(report.kept).toEqual(['No new taxes'])
    expect(report.broken).toEqual(['A railway to Dunmoor'])
  })

  it('still reports when the save has no history, with the figures marked missing', () => {
    const report = termReport(election, first.state.timeline, [])!
    expect(report.rows.every((r) => r.start === null && r.end === null && r.tone === 'neutral')).toBe(true)
  })

  it('starts the second term the morning after the first election', () => {
    const second = run(TERM_DAYS * 2)
    const elections = second.state.timeline.filter((e) => verdictOf(e) !== null)
    const last = elections.at(-1)!
    const before = elections.at(-2)!
    const report = termReport(last, second.state.timeline, second.history)!
    expect(report.from).toBe(before.day + 1)
    expect(report.to).toBe(last.day)
    expect(report.decisions.every((e) => e.day >= report.from && e.day <= report.to)).toBe(true)
  })

  it('reports a fall with the level the new government starts on, and says the slate is cleared', () => {
    const wreck = (state: GameState): GameState =>
      state.day === 6 ? { ...state, indicators: { ...state.indicators, legitimacy: 2 } } : state
    const fallen = run(6, wreck)
    const fall = fallen.state.timeline.find((e) => e.kind === 'government')!
    expect(fall.day).toBe(6)
    const report = termReport(fall, fallen.state.timeline, fallen.history)!
    expect(report).toMatchObject({ verdict: 'fell', from: 1, to: 6, cleared: true })
    expect(report.support).toEqual({ value: fallen.history.at(-1)!.support, when: 'after' })
  })
})
