import { holds, compare } from './conditions.ts'
import { pick, pickWeighted, rngFor } from './rng.ts'
import { SAVE_VERSION } from './save.ts'
import {
  type Change,
  type Content,
  type Dilemma,
  type Effect,
  type EntryKind,
  type Identity,
  type IndicatorId,
  type NationState,
  type Option,
  type Situation,
  type SituationStage,
} from './types.ts'

export interface Agenda {
  major: string | null
  minors: string[]
  situation: boolean
}

export interface GameState extends NationState {
  version: number
  pack: { id: string; version: string }
  agenda: Agenda
}

export interface AgendaItems {
  major: Dilemma | null
  minors: Dilemma[]
  situation: { situation: Situation; stage: SituationStage; index: number; gauge: number } | null
}

export interface Forecast {
  changes: Change[]
  penalties: (Change & { trait: string })[]
  pressure: Change[]
  policies: { policy: string; to: boolean | number }[]
  hasLater: boolean
  // due is in days from the decision, as written in the pack.
  promise?: { text: string; due: number }
}

export interface NationClass {
  id: string
  name: string
  description: string
}

export const START_INDICATORS: Readonly<Record<IndicatorId, number>> = {
  fiscal: 48,
  debt: 45,
  capacity: 50,
  employment: 52,
  living: 50,
  inequality: 50,
  health: 50,
  education: 50,
  environment: 48,
  liberty: 55,
  legitimacy: 55,
  administration: 50,
}

export const TERM_DAYS = 45

export const ELECTION_HEADLINES = {
  won: 'The government is re-elected',
  reduced: 'The government is returned with a reduced majority',
  lost: 'The government is voted out',
} as const

const ELECTION_WIN = 50
const ELECTION_HOLD = 43
const FALL_LEGITIMACY = 10
const FALL_SUPPORT = 20
const RESIGN_STANDING = 10
const BORROW_DIVISOR = 6
const FISCAL_RECOVERY = 0.3
const DEBT_CRISIS = 80

const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10

export function newNation(
  content: Content,
  identity: Identity,
  seed: number,
  answers: Record<string, string> = {},
): GameState {
  const state: GameState = {
    version: SAVE_VERSION,
    pack: { id: content.pack.id, version: content.pack.version },
    seed,
    day: 1,
    identity: structuredClone(identity),
    indicators: { ...START_INDICATORS },
    factions: Object.fromEntries(content.factions.map((f) => [f.id, { clout: f.clout, approval: 50 }])),
    policies: Object.fromEntries(content.policies.map((p) => [p.id, p.default])),
    flags: {},
    traits: [],
    cabinet: {},
    promises: [],
    pending: [],
    answered: {},
    situation: null,
    situationsDone: [],
    government: 1,
    timeline: [],
    agenda: { major: null, minors: [], situation: false },
  }
  appointCabinet(state, content)
  found(state, content, answers)
  state.agenda = buildAgenda(state, content)
  return state
}

// Answers are applied in the pack's order, not the order they were given in,
// so the same answers always found the same nation.
function found(state: GameState, content: Content, answers: Record<string, string>) {
  const questions = content.founding.questions
  for (const id of Object.keys(answers)) {
    if (!questions.some((q) => q.id === id)) throw new Error(`unknown founding question ${id}`)
  }
  const changes: Change[] = []
  for (const question of questions) {
    if (!Object.hasOwn(answers, question.id)) continue
    const chosen = answers[question.id]
    const answer = question.answers.find((a) => a.id === chosen)
    if (!answer) throw new Error(`unknown answer ${chosen} to founding question ${question.id}`)
    apply(state, answer.effects, changes)
  }
  record(
    state,
    content,
    'founding',
    '{nation} is founded',
    changes,
    'A government takes office in {capital} under its first {leader}.',
  )
}

// Clout-weighted approval across all factions, 0 to 100.
export function support(state: NationState): number {
  const factions = Object.values(state.factions)
  const clout = factions.reduce((sum, f) => sum + f.clout, 0)
  if (clout === 0) return 50
  return clamp(factions.reduce((sum, f) => sum + f.clout * f.approval, 0) / clout)
}

export function render(text: string, state: NationState, content: Content): string {
  return text.replace(/\{([a-z]+)(?::([a-z_]+))?\}/g, (whole, key: string, arg?: string) => {
    if (key === 'nation') return state.identity.name
    if (key === 'capital') return state.identity.capital
    if (key === 'currency') return state.identity.currency
    if (key === 'demonym') return state.identity.demonym
    if (key === 'leader') return state.identity.leaderTitle
    if (key === 'minister' && arg) {
      const title = content.portfolios.find((p) => p.id === arg)?.title
      const name = state.cabinet[arg]?.name
      return title && name ? `${title} ${name}` : whole
    }
    return whole
  })
}

export function availableOptions(options: Option[], state: NationState): Option[] {
  return options.filter((o) => holds(o.when, state))
}

export function currentStage(state: NationState, content: Content) {
  if (!state.situation) return null
  const situation = findSituation(content, state.situation.id)
  return situation.stages[state.situation.stage] ?? null
}

export function agendaItems(state: GameState, content: Content): AgendaItems {
  const stage = state.agenda.situation ? currentStage(state, content) : null
  return {
    major: state.agenda.major === null ? null : findDilemma(content, state.agenda.major),
    minors: state.agenda.minors.map((id) => findDilemma(content, id)),
    situation:
      stage && state.situation
        ? {
            situation: findSituation(content, state.situation.id),
            stage,
            index: state.situation.stage,
            gauge: state.situation.gauge,
          }
        : null,
  }
}

export function dayComplete(state: GameState): boolean {
  return state.agenda.major === null && state.agenda.minors.length === 0 && !state.agenda.situation
}

export function daysUntilElection(state: NationState): number {
  return (TERM_DAYS - (state.day % TERM_DAYS)) % TERM_DAYS
}

export function classify(state: NationState, content: Content): NationClass {
  const fits = content.classes.find((c) => holds(c.when, state))
  if (!fits) throw new Error('no class in the pack fits this nation')
  return {
    id: fits.id,
    name: render(fits.name, state, content),
    description: render(fits.description, state, content),
  }
}

// A stage option takes no pressure from its own tags and a dilemma option does, and an
// option does not say which it is. So it is looked up on today's agenda: as the pack's
// own object if it is one, by id if it is a copy.
export function forecast(option: Option, state: GameState, content: Content): Forecast {
  const stage = state.agenda.situation ? currentStage(state, content) : null
  const dilemmas = agendaIds(state).map((id) => findDilemma(content, id))
  const atStage = (same: (o: Option) => boolean) => stage?.options.some(same) ?? false
  const onDilemma = (same: (o: Option) => boolean) => dilemmas.some((d) => d.options.some(same))
  const itself = (o: Option) => o === option
  const sameId = (o: Option) => o.id === option.id

  if (atStage(itself)) return dryRun(state, content, option, 'situation')
  if (onDilemma(itself)) return dryRun(state, content, option, 'decision')
  if (atStage(sameId) && onDilemma(sameId)) {
    throw new Error(
      `a copy of option ${option.id} could belong to a dilemma or to the situation: ` +
        'use forecastDecision or forecastSituation',
    )
  }
  return dryRun(state, content, option, atStage(sameId) ? 'situation' : 'decision')
}

export function forecastDecision(
  state: GameState,
  content: Content,
  dilemmaId: string,
  optionId: string,
): Forecast {
  return dryRun(state, content, agendaOption(state, content, dilemmaId, optionId), 'decision')
}

export function forecastSituation(state: GameState, content: Content, optionId: string): Forecast {
  return dryRun(state, content, stageOption(state, content, optionId), 'situation')
}

// Runs the option against a scratch copy through the same function decide uses,
// so what is shown before the choice is what happens after it.
function dryRun(
  state: GameState,
  content: Content,
  option: Option,
  kind: 'decision' | 'situation',
): Forecast {
  const scratch: GameState = structuredClone({ ...state, timeline: [] })
  return enact(scratch, content, option, '', kind)
}

function agendaIds(state: GameState): string[] {
  return state.agenda.major === null ? state.agenda.minors : [state.agenda.major, ...state.agenda.minors]
}

function agendaOption(state: GameState, content: Content, dilemmaId: string, optionId: string): Option {
  if (!agendaIds(state).includes(dilemmaId)) throw new Error(`${dilemmaId} is not on today's agenda`)
  const dilemma = findDilemma(content, dilemmaId)
  const option = availableOptions(dilemma.options, state).find((o) => o.id === optionId)
  if (!option) throw new Error(`${optionId} is not an available option for ${dilemmaId}`)
  return option
}

function stageOption(state: GameState, content: Content, optionId: string): Option {
  const stage = currentStage(state, content)
  if (!stage || !state.agenda.situation) throw new Error('no situation stage is waiting on a decision')
  const option = availableOptions(stage.options, state).find((o) => o.id === optionId)
  if (!option) throw new Error(`${optionId} is not an available option at this stage`)
  return option
}

export function decide(input: GameState, content: Content, dilemmaId: string, optionId: string): GameState {
  const state = structuredClone(input)
  const option = agendaOption(state, content, dilemmaId, optionId)

  enact(state, content, option, dilemmaId, 'decision')
  state.answered[dilemmaId] = state.day
  if (state.agenda.major === dilemmaId) state.agenda.major = null
  state.agenda.minors = state.agenda.minors.filter((id) => id !== dilemmaId)
  return state
}

export function decideSituation(input: GameState, content: Content, optionId: string): GameState {
  const state = structuredClone(input)
  const option = stageOption(state, content, optionId)

  enact(state, content, option, state.situation!.id, 'situation')
  state.agenda.situation = false
  return state
}

export function endDay(input: GameState, content: Content): GameState {
  const state = structuredClone(input)

  if (state.day % 7 === 0) settleBudget(state, content)
  runPending(state, content)
  settlePromises(state, content)
  advanceSituation(state, content)
  updateTraits(state, content)
  checkCabinet(state, content)
  const fell = checkGovernment(state, content)
  if (!fell && state.day % TERM_DAYS === 0) holdElection(state, content)

  state.day += 1
  state.agenda = buildAgenda(state, content)
  return state
}

function enact(
  state: GameState,
  content: Content,
  option: Option,
  source: string,
  kind: 'decision' | 'situation',
): Forecast {
  const policies = policyChanges(state, option.effects)
  const changes: Change[] = []
  apply(state, option.effects, changes)

  const penalties: (Change & { trait: string })[] = []
  for (const trait of content.traits) {
    if (!state.traits.includes(trait.id)) continue
    if (!trait.opposes.some((tag) => option.tags.includes(tag))) continue
    if (trait.penalty === 0) continue
    const why = `{nation} is known as a ${trait.name}. This cuts against it.`
    const hit: Change[] = []
    apply(state, [{ indicator: 'legitimacy', by: -trait.penalty, why }], hit)
    penalties.push(...hit.map((c) => ({ ...c, trait: trait.id })))
  }

  const pressure: Change[] = []
  if (state.situation && kind === 'decision') {
    const situation = findSituation(content, state.situation.id)
    for (const push of situation.pressures) {
      if (!option.tags.includes(push.tag)) continue
      const why = `It bears on ${situation.title.toLowerCase()}.`
      apply(state, [{ situation: situation.id, by: push.by, why }], pressure)
    }
  }

  // Copied, so the state never shares a list with the pack it was played from.
  for (const later of option.later) {
    state.pending.push({
      dueDay: state.day + later.after,
      ...(later.when ? { when: structuredClone(later.when) } : {}),
      headline: later.headline,
      effects: structuredClone(later.effects),
      source,
    })
  }
  if (option.promise) {
    state.promises.push({
      id: option.promise.id,
      text: option.promise.text,
      dueDay: state.day + option.promise.due,
      kept: structuredClone(option.promise.kept),
      broken: structuredClone(option.promise.broken),
    })
  }
  record(state, content, kind, option.headline, [...changes, ...penalties, ...pressure], option.result)

  const explained = (c: Change) => explain(c, state, content)
  return {
    changes: changes.map(explained),
    penalties: penalties.map((p) => ({ ...explained(p), trait: p.trait })),
    pressure: pressure.map(explained),
    policies,
    hasLater: option.later.length > 0,
    ...(option.promise
      ? { promise: { text: render(option.promise.text, state, content), due: option.promise.due } }
      : {}),
  }
}

// A forecast that listed a policy already in force would make it look like a change.
function policyChanges(state: GameState, effects: Effect[]): { policy: string; to: boolean | number }[] {
  const last = new Map<string, boolean | number>()
  for (const effect of effects) if ('policy' in effect) last.set(effect.policy, effect.to)
  return [...last]
    .filter(([policy, to]) => state.policies[policy] !== to)
    .map(([policy, to]) => ({ policy, to }))
}

// Builds the stored form field by field, so nothing extra rides along into a save.
function explain(change: Change, state: NationState, content: Content): Change {
  return { kind: change.kind, target: change.target, by: change.by, why: render(change.why, state, content) }
}

function apply(state: GameState, effects: readonly Effect[], changes: Change[]) {
  for (const effect of effects) {
    if ('indicator' in effect) {
      state.indicators[effect.indicator] = clamp(state.indicators[effect.indicator] + effect.by)
      changes.push({ kind: 'indicator', target: effect.indicator, by: effect.by, why: effect.why })
    } else if ('faction' in effect) {
      const faction = state.factions[effect.faction]
      if (!faction) continue
      faction.approval = clamp(faction.approval + effect.by)
      changes.push({ kind: 'faction', target: effect.faction, by: effect.by, why: effect.why })
    } else if ('minister' in effect) {
      const minister = state.cabinet[effect.minister]
      if (!minister) continue
      minister.standing = clamp(minister.standing + effect.by)
      changes.push({ kind: 'minister', target: effect.minister, by: effect.by, why: effect.why })
    } else if ('situation' in effect) {
      if (state.situation?.id !== effect.situation) continue
      state.situation.gauge = clamp(state.situation.gauge + effect.by)
      changes.push({ kind: 'situation', target: effect.situation, by: effect.by, why: effect.why })
    } else if ('policy' in effect) {
      state.policies[effect.policy] = effect.to
    } else if (effect.clear) {
      delete state.flags[effect.flag]
    } else {
      state.flags[effect.flag] = state.day
    }
  }
}

function record(
  state: GameState,
  content: Content,
  kind: EntryKind,
  headline: string,
  changes: Change[],
  text?: string,
) {
  state.timeline.push({
    day: state.day,
    kind,
    headline: render(headline, state, content),
    ...(text === undefined ? {} : { text: render(text, state, content) }),
    changes: changes.map((c) => explain(c, state, content)),
  })
}

// A deficit is a fiscal reading under 50. Once a week the gap lands on the debt,
// and the books drift part of the way back to balance as one-off costs wash out.
// Past DEBT_CRISIS the interest bill starts to hurt.
function settleBudget(state: GameState, content: Content) {
  const gap = 50 - state.indicators.fiscal
  const borrowed = Math.round((gap / BORROW_DIVISOR) * 10) / 10
  const effects: Effect[] = []
  if (borrowed !== 0) {
    const why =
      borrowed > 0
        ? 'The week ended in deficit and the gap was borrowed.'
        : 'The week ended in surplus and some debt was paid down.'
    effects.push({ indicator: 'debt', by: borrowed, why })
  }
  const recovered = Math.round(gap * FISCAL_RECOVERY)
  if (recovered !== 0) {
    effects.push({ indicator: 'fiscal', by: recovered, why: 'One-off costs and windfalls from earlier weeks drop out of the books.' })
  }
  if (state.indicators.debt + borrowed >= DEBT_CRISIS) {
    effects.push(
      { indicator: 'living', by: -1, why: 'Interest on the debt is crowding out everything else.' },
      { indicator: 'legitimacy', by: -2, why: 'Lenders are asking for more, and the papers have noticed.' },
    )
  }
  if (effects.length === 0) return
  const changes: Change[] = []
  apply(state, effects, changes)
  const headline =
    state.indicators.debt >= DEBT_CRISIS
      ? 'Debt interest swallows the week'
      : borrowed > 0
        ? 'Treasury borrows to cover the week'
        : 'Treasury books a quiet week'
  record(state, content, 'budget', headline, changes)
}

function runPending(state: GameState, content: Content) {
  const due = state.pending.filter((p) => p.dueDay <= state.day)
  state.pending = state.pending.filter((p) => p.dueDay > state.day)
  for (const item of due) {
    if (!holds(item.when, state)) continue
    const changes: Change[] = []
    apply(state, item.effects, changes)
    record(state, content, 'consequence', item.headline, changes)
  }
}

function settlePromises(state: GameState, content: Content) {
  const due = state.promises.filter((p) => p.dueDay <= state.day)
  state.promises = state.promises.filter((p) => p.dueDay > state.day)
  for (const promise of due) {
    const changes: Change[] = []
    if (holds(promise.kept, state)) {
      apply(state, [{ indicator: 'legitimacy', by: 2, why: 'A promise was made and kept.' }], changes)
      record(state, content, 'promise', `Promise kept: ${promise.text}`, changes)
    } else {
      apply(state, promise.broken, changes)
      record(state, content, 'promise', `Promise broken: ${promise.text}`, changes)
    }
  }
}

function advanceSituation(state: GameState, content: Content) {
  if (!state.situation) {
    const next = content.situations.find((s) => !state.situationsDone.includes(s.id) && holds(s.when, state))
    if (!next) return
    state.situation = { id: next.id, stage: 0, gauge: next.start }
    record(state, content, 'situation', next.title, [], next.description)
    return
  }

  const situation = findSituation(content, state.situation.id)
  state.situation.stage += 1
  if (state.situation.stage < situation.stages.length) return

  const gauge = state.situation.gauge
  const outcome = situation.outcomes.find((o) => compare(gauge, o))
  state.situationsDone.push(situation.id)
  state.situation = null
  if (!outcome) return
  const changes: Change[] = []
  apply(state, outcome.effects, changes)
  record(state, content, 'situation', outcome.headline, changes, outcome.text)
}

function updateTraits(state: GameState, content: Content) {
  for (const trait of content.traits) {
    const has = state.traits.includes(trait.id)
    if (!has && holds(trait.earn, state)) {
      state.traits.push(trait.id)
      record(state, content, 'trait', `{nation} is now known as a ${trait.name}`, [], trait.description)
    } else if (has && trait.lose && holds(trait.lose, state)) {
      state.traits = state.traits.filter((id) => id !== trait.id)
      record(state, content, 'trait', `{nation} is no longer known as a ${trait.name}`, [])
    }
  }
}

function checkCabinet(state: GameState, content: Content) {
  for (const portfolio of content.portfolios) {
    const minister = state.cabinet[portfolio.id]
    if (!minister || minister.standing > RESIGN_STANDING) continue
    const changes: Change[] = []
    apply(state, [{ indicator: 'legitimacy', by: -2, why: 'A resignation never looks like strength.' }], changes)
    const leaving = `${portfolio.title} ${minister.name}`
    state.cabinet[portfolio.id] = { name: newName(state, content, `${portfolio.id}:${state.day}`), standing: 50 }
    record(state, content, 'cabinet', `${leaving} resigns`, changes, `${state.cabinet[portfolio.id]!.name} takes over.`)
  }
}

function checkGovernment(state: GameState, content: Content): boolean {
  if (state.indicators.legitimacy > FALL_LEGITIMACY && support(state) >= FALL_SUPPORT) return false
  replaceGovernment(state, content, 40)
  state.flags['government_fell'] = state.day
  record(
    state,
    content,
    'government',
    'The government falls',
    [],
    'A new administration takes office in {capital}. It inherits everything the last one did.',
  )
  return true
}

function holdElection(state: GameState, content: Content) {
  const polled = support(state)
  const report = (rest: string) => `Support stood at ${polled} on polling day. ${rest}`
  const changes: Change[] = []
  if (polled >= ELECTION_WIN) {
    apply(state, [{ indicator: 'legitimacy', by: 6, why: 'The voters were asked and said yes.' }], changes)
    const text = report('The {leader} stays on with a fresh mandate.')
    record(state, content, 'election', ELECTION_HEADLINES.won, changes, text)
  } else if (polled >= ELECTION_HOLD) {
    apply(state, [{ indicator: 'legitimacy', by: 1, why: 'The voters said yes, but not loudly.' }], changes)
    const text = report('The {leader} stays on, with fewer friends in the chamber.')
    record(state, content, 'election', ELECTION_HEADLINES.reduced, changes, text)
  } else {
    replaceGovernment(state, content, 45)
    state.flags['election_lost'] = state.day
    const text = report('A new {leader} takes office in {capital} and inherits everything the last one did.')
    record(state, content, 'election', ELECTION_HEADLINES.lost, changes, text)
  }
}

function replaceGovernment(state: GameState, content: Content, legitimacy: number) {
  state.government += 1
  state.indicators.legitimacy = legitimacy
  for (const faction of Object.values(state.factions)) faction.approval = clamp((faction.approval + 50) / 2)
  state.promises = []
  appointCabinet(state, content)
}

function appointCabinet(state: GameState, content: Content) {
  for (const portfolio of content.portfolios) {
    state.cabinet[portfolio.id] = {
      name: newName(state, content, `${portfolio.id}:gov${state.government}`),
      standing: 50,
    }
  }
}

function newName(state: GameState, content: Content, purpose: string): string {
  const rng = rngFor(state.seed, state.day, `name:${purpose}`)
  return `${pick(rng, content.names.given)} ${pick(rng, content.names.family)}`
}

function buildAgenda(state: GameState, content: Content): Agenda {
  const eligible = content.dilemmas.filter(
    (d) => isDue(d, state) && holds(d.when, state) && availableOptions(d.options, state).length >= 2,
  )
  const rng = rngFor(state.seed, state.day, 'agenda')

  const majors = eligible.filter((d) => d.kind === 'major')
  const top = Math.max(...majors.map((d) => d.priority))
  const major = majors.length ? pickWeighted(rng, majors.filter((d) => d.priority === top), (d) => d.weight) : null

  const minors: Dilemma[] = []
  const pool = eligible.filter((d) => d.kind === 'minor')
  const wanted = Math.min(pool.length, Math.floor(rng() * 3))
  while (minors.length < wanted) {
    const next = pickWeighted(rng, pool.filter((d) => !minors.includes(d)), (d) => d.weight)
    minors.push(next)
  }

  return {
    major: major?.id ?? null,
    minors: minors.map((d) => d.id),
    situation: currentStage(state, content) !== null,
  }
}

// A dilemma is due if it has never been answered, or if it repeats and has rested long enough.
export function isDue(dilemma: Dilemma, state: NationState): boolean {
  if (!Object.hasOwn(state.answered, dilemma.id)) return true
  if (dilemma.repeat === undefined) return false
  return state.day - state.answered[dilemma.id]! >= dilemma.repeat
}

function findDilemma(content: Content, id: string): Dilemma {
  const dilemma = content.dilemmas.find((d) => d.id === id)
  if (!dilemma) throw new Error(`unknown dilemma ${id}`)
  return dilemma
}

function findSituation(content: Content, id: string): Situation {
  const situation = content.situations.find((s) => s.id === id)
  if (!situation) throw new Error(`unknown situation ${id}`)
  return situation
}
