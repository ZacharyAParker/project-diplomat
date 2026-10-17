// What a body is told. Every task reads the nation through a Brief and a petition through a
// PetitionBrief: the numbers turned into words, as a minister would brief them, with the
// numbers themselves kept alongside for the rules-based stand-ins.

import {
  agendaItems,
  availableOptions,
  forecast,
  forecastDecision,
  INDICATOR_INFO,
  INDICATORS,
  render,
  support,
  type Change,
  type Content,
  type Forecast,
  type GameState,
} from '@diplomat/engine'
import { census } from './census.ts'
import { formatDate } from './documents.ts'
import { FORMS } from './forms.ts'
import { DISMISS, type Brief, type GovernmentState, type PetitionBrief } from './types.ts'

const MAX_RECORD = 12
const MAX_EXTRACT = 400
const MAX_WORDS = 12

export function level(x: number): string {
  if (x < 20) return 'very low'
  if (x < 40) return 'low'
  if (x < 60) return 'middling'
  if (x < 80) return 'high'
  return 'very high'
}

export function mood(approval: number): string {
  if (approval < 30) return 'angry'
  if (approval < 45) return 'unhappy'
  if (approval < 60) return 'content'
  if (approval < 75) return 'pleased'
  return 'delighted'
}

export function standingLines(state: GameState, gov: GovernmentState, content: Content): string[] {
  const lines = INDICATORS.map((id) => {
    const info = INDICATOR_INFO[id]
    const value = Math.round(state.indicators[id])
    return `${info.name}: ${level(value)}, ${value}${info.lowerIsBetter ? ' (lower is better)' : ''}`
  })
  lines.push(`Support for the government: ${level(support(state))}, ${Math.round(support(state))}`)
  for (const f of content.factions) {
    const a = state.factions[f.id]?.approval
    if (a !== undefined) lines.push(`${f.name}: ${mood(a)}, ${Math.round(a)}`)
  }
  const figures = census(state, gov.censusBase, content)
  for (const id of ['population', 'gdp-per-head', 'unemployment', 'crime', 'civil-rights', 'economy']) {
    const f = figures.find((x) => x.id === id)
    if (f) lines.push(`${f.name}: ${f.value.toLocaleString('en-GB')} ${f.unit}${f.rating ? ` (${f.rating})` : ''}`)
  }
  return lines
}

export function brief(
  state: GameState,
  gov: GovernmentState,
  content: Content,
  record: { id: string; title: string; extract: string }[],
  archivePath?: string,
): Brief {
  const id = state.identity
  const constitution = gov.institutions.constitution
  return {
    nation: {
      name: id.name,
      demonym: id.demonym,
      capital: id.capital,
      currency: id.currency,
      leaderTitle: id.leaderTitle,
      ...(id.motto ? { motto: id.motto } : {}),
      ...(id.animal ? { animal: id.animal } : {}),
      ...(id.faith ? { faith: id.faith } : {}),
    },
    date: formatDate(gov.institutions.calendar.start, state.day),
    day: state.day,
    form: { id: constitution.form, name: constitution.form === 'custom' ? constitution.formName : FORMS[constitution.form].name, executive: constitution.rules.executive.title },
    founder: { ...gov.institutions.founder },
    standing: standingLines(state, gov, content),
    canon: [...gov.institutions.canon],
    words: [...gov.words]
      .sort((a, b) => b.number - a.number)
      .slice(0, MAX_WORDS)
      // Silence closes a matter only once the Word is confirmed.
      .map((w) => ({ number: w.number, text: w.text, silence: w.silence && w.confirmed, confirmed: w.confirmed })),
    record: record.slice(0, MAX_RECORD).map((r) => ({ id: r.id, title: r.title, extract: r.extract.slice(0, MAX_EXTRACT) })),
    ...(archivePath ? { archivePath } : {}),
  }
}

export function amount(by: number): string {
  const n = Math.abs(by)
  if (n < 1.5) return 'a little'
  if (n < 3.5) return 'somewhat'
  if (n < 5.5) return 'a fair amount'
  return 'sharply'
}

function changeLine(c: Change, content: Content, state: GameState): string {
  const way = c.by > 0 ? 'up' : 'down'
  const why = c.why ? `: ${c.why}` : ''
  if (c.kind === 'indicator') return `${INDICATOR_INFO[c.target as keyof typeof INDICATOR_INFO]?.name ?? c.target} ${way} ${amount(c.by)}${why}`
  if (c.kind === 'faction') {
    const name = content.factions.find((f) => f.id === c.target)?.name ?? c.target
    return `${name} ${c.by > 0 ? 'pleased' : 'displeased'}, ${amount(c.by)}${why}`
  }
  if (c.kind === 'minister') {
    const title = content.portfolios.find((p) => p.id === c.target)?.title ?? c.target
    return `${title} ${state.cabinet[c.target]?.name ?? ''} ${c.by > 0 ? 'stronger' : 'weaker'}`.replace(/\s+/g, ' ') + why
  }
  if (c.kind === 'neighbour') {
    const name = content.neighbours.find((n) => n.id === c.target)?.name ?? c.target
    return `Relations with ${name} ${c.by > 0 ? 'warmer' : 'cooler'}, ${amount(c.by)}${why}`
  }
  return `The crisis ${c.by > 0 ? 'deepens' : 'eases'}${why}`
}

export function forecastLines(f: Forecast, content: Content, state: GameState): string[] {
  const lines = [...f.changes, ...f.penalties, ...f.pressure].map((c) => changeLine(c, content, state))
  for (const p of f.policies) {
    const name = content.policies.find((x) => x.id === p.policy)?.name ?? p.policy
    lines.push(typeof p.to === 'boolean' ? `${name}: ${p.to ? 'brought in' : 'ended'}` : `${name} set to ${p.to}`)
  }
  if (f.promise) lines.push(`A promise is made: ${f.promise.text} (due in ${f.promise.due} days)`)
  if (f.hasLater) lines.push('Something more will follow from this later.')
  if (lines.length === 0) lines.push('Nothing measurable changes.')
  return lines
}

function forecastFor(state: GameState, content: Content, dilemmaId: string, optionId: string): Forecast {
  const items = agendaItems(state, content)
  const onAgenda = items.major?.id === dilemmaId || items.minors.some((d) => d.id === dilemmaId)
  if (onAgenda) return forecastDecision(state, content, dilemmaId, optionId)
  // Not on today's desk (a test, or a docket opened ahead): forecast the pack's option as it
  // stands, which runs the same dry run without a neighbour bound to it.
  const option = content.dilemmas.find((d) => d.id === dilemmaId)!.options.find((o) => o.id === optionId)!
  return forecast(option, state, content)
}

export const DISMISS_SPEECH = 'Let it lie. Take none of these courses, and let the matter rest until it comes round again.'

export function petitionBrief(state: GameState, content: Content, dilemmaId: string, number: number): PetitionBrief {
  const dilemma = content.dilemmas.find((d) => d.id === dilemmaId)
  if (!dilemma) throw new Error(`no dilemma ${dilemmaId} in the pack`)
  const neighbour = state.agenda.bound[dilemmaId]
  const say = (t: string) => render(t, state, content, neighbour)
  const options = availableOptions(dilemma.options, state).map((o, i) => {
    const f = forecastFor(state, content, dilemmaId, o.id)
    const all = [...f.changes, ...f.penalties]
    return {
      course: o.id,
      number: i + 1,
      advocate: `${say(o.advocate.name)}, ${say(o.advocate.role)}`,
      speech: say(o.speech),
      forecast: forecastLines(f, content, state),
      tags: [...o.tags],
      effects: all.filter((c) => c.kind === 'faction').map((c) => ({ faction: c.target, by: c.by })),
      indicators: all.filter((c) => c.kind === 'indicator').map((c) => ({ indicator: c.target as (typeof INDICATORS)[number], by: c.by })),
    }
  })
  return {
    number,
    dilemma: dilemma.id,
    title: say(dilemma.title),
    description: say(dilemma.description),
    kind: dilemma.kind,
    ...(neighbour ? { neighbour: content.neighbours.find((n) => n.id === neighbour)?.name ?? neighbour } : {}),
    tags: [...dilemma.tags],
    options: [
      ...options,
      { course: DISMISS, number: 0, advocate: 'Nobody in particular', speech: DISMISS_SPEECH, forecast: ['Nothing changes. The matter rests and may come round again.'], tags: [] },
    ],
  }
}
