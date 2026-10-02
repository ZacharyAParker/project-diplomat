import {
  availableOptions,
  render,
  type AgendaItems,
  type Change,
  type Content,
  type Forecast,
  type GameState,
  type Option,
  type TimelineEntry,
} from '@diplomat/engine'
import { policyLine } from './changes.ts'

export type CardKind = 'situation' | 'major' | 'minor'

export interface OptionView {
  id: string
  name: string
  role: string
  speech: string
}

// One thing on the desk that wants a decision, with every macro already filled in.
export interface Card {
  // Stable for the whole day, so a card and its result can share a place on the page.
  key: string
  kind: CardKind
  // Null for a situation stage, which is decided without naming a dilemma.
  dilemmaId: string | null
  kicker: string
  title: string
  description: string
  options: OptionView[]
  gauge?: { label: string; value: number }
}

function optionViews(options: Option[], state: GameState, content: Content): OptionView[] {
  return availableOptions(options, state).map((option) => ({
    id: option.id,
    name: render(option.advocate.name, state, content),
    role: render(option.advocate.role, state, content),
    speech: render(option.speech, state, content),
  }))
}

// The day's business in the order it should be faced: the crisis, the main dilemma, the small ones.
export function agendaCards(agenda: AgendaItems, state: GameState, content: Content): Card[] {
  const text = (raw: string) => render(raw, state, content)
  const cards: Card[] = []
  if (agenda.situation) {
    const { situation, stage, index, gauge } = agenda.situation
    cards.push({
      key: `situation:${situation.id}:${index}`,
      kind: 'situation',
      dilemmaId: null,
      kicker: `${text(situation.title)}, stage ${index + 1} of ${situation.stages.length}`,
      title: text(stage.title),
      description: text(stage.description),
      options: optionViews(stage.options, state, content),
      gauge: { label: text(situation.gauge), value: gauge },
    })
  }
  const dilemmas = agenda.major ? [agenda.major, ...agenda.minors] : agenda.minors
  for (const dilemma of dilemmas) {
    cards.push({
      key: dilemma.id,
      kind: dilemma.kind,
      dilemmaId: dilemma.id,
      kicker: dilemma.kind === 'major' ? 'The main business' : 'Also in the box',
      title: text(dilemma.title),
      description: text(dilemma.description),
      options: optionViews(dilemma.options, state, content),
    })
  }
  return cards
}

export interface ForecastView {
  // In the order decide will record them: the option's own effects, trait penalties, pressure.
  changes: Change[]
  policies: string[]
  // One per trait the option cuts against.
  warnings: string[]
  later: boolean
  // The promise and when it is judged, as one line.
  promise: string | null
  // True when the option moves nothing at all, so the card can say so and not show a blank.
  nothing: boolean
}

export function promiseLine(promise: { text: string; due: number }): string {
  const when = promise.due === 1 ? 'tomorrow night' : `in ${promise.due} days`
  return `${promise.text.replace(/[.!?]+$/, '')}. Judged ${when}.`
}

export function forecastView(forecast: Forecast, content: Content): ForecastView {
  const changes = [...forecast.changes, ...forecast.penalties, ...forecast.pressure]
  const traits = [...new Set(forecast.penalties.map((p) => p.trait))]
  const policies = forecast.policies.map((p) => policyLine(p, content))
  return {
    changes,
    policies,
    warnings: traits.map((id) => `Goes against: ${content.traits.find((t) => t.id === id)?.name ?? id}`),
    later: forecast.hasLater,
    promise: forecast.promise ? promiseLine(forecast.promise) : null,
    nothing: changes.length === 0 && policies.length === 0 && !forecast.hasLater && !forecast.promise,
  }
}

// What has been decided so far today, with each entry's place in the timeline. Only
// decisions carry today's date before the day ends; the night's entries are stamped as
// the day turns. The founding shares day 1 and is not a decision.
export function todaysDecisions(state: GameState): { index: number; entry: TimelineEntry }[] {
  const found: { index: number; entry: TimelineEntry }[] = []
  for (let index = state.timeline.length - 1; index >= 0; index--) {
    const entry = state.timeline[index]!
    if (entry.day < state.day) break
    if (entry.kind === 'decision' || entry.kind === 'situation') found.unshift({ index, entry })
  }
  return found
}

export interface BoxNotice {
  // True when every major dilemma that comes only once has been answered.
  exhausted: boolean
  // How many major dilemmas have not come up yet.
  remaining: number
  // True on the first morning without one, which is when it is worth a paragraph.
  first: boolean
}

// Null while there is, or was, a major dilemma today.
export function boxNotice(state: GameState, content: Content): BoxNotice | null {
  if (state.agenda.major !== null) return null
  const majors = content.dilemmas.filter((d) => d.kind === 'major')
  const answered = majors.filter((d) => Object.hasOwn(state.answered, d.id))
  const last = Math.max(0, ...answered.map((d) => state.answered[d.id]!))
  if (last === state.day) return null
  // Dilemmas that repeat never run out, so they do not count towards what is left.
  const remaining = majors.filter((d) => d.repeat === undefined && !answered.includes(d)).length
  return { exhausted: remaining === 0, remaining, first: last === state.day - 1 }
}

// What the foot of the desk says before the day is ended. Total is everything the day
// started with, open is what has not been decided.
export function closingLine(total: number, open: number, electionIn: number): string {
  const vote = electionIn === 0 ? ' The country votes tonight.' : ''
  if (total === 0) return `There is nothing to decide today.${vote}`
  if (open === 0) return `Everything in the box has been dealt with.${vote}`
  const papers = open === 1 ? 'One paper is' : `${open} papers are`
  const fate = 'Anything not decided when the day ends is gone, and may not come round again.'
  return `${papers} still on the desk. ${fate}${vote}`
}
