import {
  agendaItems,
  availableOptions,
  decide,
  endDay,
  forecastDecision,
  type Content,
  type Forecast,
  type GameState,
} from '@diplomat/engine'
import { describe, expect, it } from 'vitest'
import { content, founded, played } from '../test/fixtures.ts'
import { agendaCards, boxNotice, closingLine, forecastView, promiseLine, todaysDecisions } from './desk.ts'

const cardsOf = (state: GameState, pack: Content = content) =>
  agendaCards(agendaItems(state, pack), state, pack)

// Plays on with the first option of everything until the test finds the morning it wants.
function playUntil(wanted: (state: GameState) => boolean, limit = 80): GameState {
  for (let days = 0; days < limit; days++) {
    const state = played(days)
    if (wanted(state)) return state
  }
  throw new Error('no such morning in the first days of the fixture nation')
}

describe('agendaCards', () => {
  it('lists the major dilemma, then the minors, with only the options that are open', () => {
    const state = founded()
    const agenda = agendaItems(state, content)
    const cards = cardsOf(state)
    const expected = [agenda.major, ...agenda.minors].filter((d) => d !== null)
    expect(cards.map((c) => c.key)).toEqual(expected.map((d) => d.id))
    expect(cards[0]!.kind).toBe('major')
    expect(cards[0]!.kicker).toBe('The main business')
    for (const [i, card] of cards.entries()) {
      expect(card.options.map((o) => o.id)).toEqual(
        availableOptions(expected[i]!.options, state).map((o) => o.id),
      )
    }
  })

  it('fills in every macro, so no card shows a brace', () => {
    for (const days of [0, 5, 12, 20]) {
      const text = JSON.stringify(cardsOf(played(days)))
      expect(text).not.toMatch(/\{[a-z]+(:[a-z_]+)?\}/)
    }
  })

  it('puts a waiting crisis first, with its gauge and its stage', () => {
    const state = playUntil((s) => s.agenda.situation)
    const waiting = agendaItems(state, content).situation!
    const [first] = cardsOf(state)
    expect(first!.kind).toBe('situation')
    expect(first!.dilemmaId).toBeNull()
    expect(first!.gauge).toEqual({ label: waiting.situation.gauge, value: waiting.gauge })
    expect(first!.kicker).toMatch(
      new RegExp(`stage ${waiting.index + 1} of ${waiting.situation.stages.length}$`),
    )
  })

  it('is empty on a day with nothing to decide', () => {
    const state: GameState = { ...founded(), agenda: { major: null, minors: [], situation: false } }
    expect(cardsOf(state)).toEqual([])
  })
})

describe('forecastView', () => {
  const blank: Forecast = { changes: [], penalties: [], pressure: [], policies: [], hasLater: false }
  const move = { kind: 'indicator', target: 'debt', by: 4, why: 'Borrowed.' } as const

  it('keeps the changes in the order decide records them', () => {
    const state = founded()
    const card = cardsOf(state)[0]!
    for (const option of card.options) {
      const view = forecastView(forecastDecision(state, content, card.dilemmaId!, option.id), content)
      const entry = decide(state, content, card.dilemmaId!, option.id).timeline.at(-1)!
      expect(view.changes).toEqual(entry.changes)
    }
  })

  it('names a trait once however many penalties it brings', () => {
    const trait = content.traits[0]!
    const penalty = { ...move, target: 'legitimacy', by: -3, trait: trait.id }
    const view = forecastView({ ...blank, penalties: [penalty, penalty] }, content)
    expect(view.warnings).toEqual([`Goes against: ${trait.name}`])
    expect(view.changes).toHaveLength(2)
  })

  it('puts policy changes in words', () => {
    const policy = content.policies.find((p) => p.default === false)!
    const view = forecastView({ ...blank, policies: [{ policy: policy.id, to: true }] }, content)
    expect(view.policies).toEqual([`Introduces: ${policy.name}`])
    expect(view.nothing).toBe(false)
  })

  it('says that consequences are coming and never which', () => {
    const view = forecastView({ ...blank, hasLater: true }, content)
    expect(view).toMatchObject({ later: true, nothing: false, changes: [] })
  })

  it('writes the promise and its deadline as one line', () => {
    expect(promiseLine({ text: 'No new taxes', due: 30 })).toBe('No new taxes. Judged in 30 days.')
    expect(promiseLine({ text: 'No new taxes.', due: 1 })).toBe('No new taxes. Judged tomorrow night.')
    expect(forecastView({ ...blank, promise: { text: 'Peace', due: 2 } }, content).promise).toMatch(
      /^Peace\./,
    )
  })

  it('knows when an option does nothing at all', () => {
    expect(forecastView(blank, content).nothing).toBe(true)
    expect(forecastView({ ...blank, changes: [move] }, content).nothing).toBe(false)
  })
})

describe('todaysDecisions', () => {
  it('is empty on the first morning, founding and all', () => {
    expect(todaysDecisions(founded())).toEqual([])
  })

  it('finds what was decided today with its place in the timeline, and nothing from last night', () => {
    const morning = played(3)
    expect(todaysDecisions(morning)).toEqual([])
    const card = cardsOf(morning)[0]
    if (!card?.dilemmaId) throw new Error('the fixture nation has nothing to decide on day 4')
    const after = decide(morning, content, card.dilemmaId, card.options[0]!.id)
    const found = todaysDecisions(after)
    expect(found).toHaveLength(1)
    expect(found[0]!.index).toBe(after.timeline.length - 1)
    expect(after.timeline[found[0]!.index]).toBe(found[0]!.entry)
  })
})

describe('boxNotice', () => {
  const majors = content.dilemmas.filter((d) => d.kind === 'major')
  const bare = (state: GameState, answered: Record<string, number>): GameState => ({
    ...state,
    answered,
    agenda: { major: null, minors: [], situation: false },
  })

  it('says nothing while a major dilemma is on the desk', () => {
    expect(boxNotice(founded(), content)).toBeNull()
  })

  it('says nothing once the major dilemma of the day has been decided', () => {
    const state = founded()
    const card = cardsOf(state)[0]!
    const after = decide(state, content, card.dilemmaId!, card.options[0]!.id)
    expect(after.agenda.major).toBeNull()
    expect(boxNotice(after, content)).toBeNull()
  })

  it('reports the pack exhausted on the first morning after the last major dilemma', () => {
    const all = Object.fromEntries(majors.map((d, i) => [d.id, i === 0 ? 9 : 3]))
    const state = bare({ ...founded(), day: 10 }, all)
    expect(boxNotice(state, content)).toEqual({ exhausted: true, remaining: 0, first: true })
    expect(boxNotice({ ...state, day: 11 }, content)).toMatchObject({ exhausted: true, first: false })
  })

  it('tells a pause from the end, and counts what is still waiting', () => {
    const state = bare({ ...founded(), day: 5 }, { [majors[0]!.id]: 4 })
    expect(boxNotice(state, content)).toEqual({ exhausted: false, remaining: majors.filter((d) => d.repeat === undefined).length - 1, first: true })
  })

  it('says nothing on a day a repeating dilemma was answered', () => {
    const routine = content.dilemmas.find((d) => d.kind === 'major' && d.repeat !== undefined)!
    const state = bare({ ...founded(), day: 5 }, { [routine.id]: 5 })
    expect(boxNotice(state, content)).toBeNull()
  })
})

describe('closingLine', () => {
  it('covers a day with nothing, a finished day and an unfinished one', () => {
    expect(closingLine(0, 0, 12)).toBe('There is nothing to decide today.')
    expect(closingLine(2, 0, 12)).toBe('Everything in the box has been dealt with.')
    expect(closingLine(3, 1, 12)).toMatch(/^One paper is still on the desk\. Anything not decided/)
    expect(closingLine(3, 2, 12)).toMatch(/^2 papers are still on the desk\./)
  })

  it('mentions the vote on election day', () => {
    expect(closingLine(0, 0, 0)).toMatch(/The country votes tonight\.$/)
    expect(closingLine(1, 1, 0)).toMatch(/The country votes tonight\.$/)
  })
})

describe('ending the day with papers open', () => {
  it('is allowed by the engine and clears the desk for the morning', () => {
    const state = founded()
    expect(cardsOf(state).length).toBeGreaterThan(0)
    const next = endDay(state, content)
    expect(next.day).toBe(2)
    expect(todaysDecisions(next)).toEqual([])
  })
})
