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
  IDENTITY_LIMITS,
  type IdentityField,
  type IndicatorId,
  type NationState,
  type NeighbourDef,
  type Option,
  type Situation,
  type SituationStage,
} from './types.ts'

export interface Agenda {
  major: string | null
  minors: string[]
  situation: boolean
  // Which neighbour each dilemma about another country was put on the desk with.
  bound: Record<string, string>
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
const OPINION_STEP = 2
const OPINION_CAP = 4
const WALKOUT_LEGITIMACY = 2

const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10
const clampStanding = (n: number) => Math.round(Math.min(100, Math.max(-100, n)) * 10) / 10

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
    neighbours: Object.fromEntries(content.neighbours.map((n) => [n.id, n.standing])),
    treaties: [],
    resources: {},
    agenda: { major: null, minors: [], situation: false, bound: {} },
  }
  appointCabinet(state, content)
  found(state, content, answers)
  assess(state, content)
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

export function render(text: string, state: NationState, content: Content, neighbour?: string): string {
  const abroad = neighbour === undefined ? undefined : content.neighbours.find((n) => n.id === neighbour)
  return text.replace(/\{([a-z]+)(?::([a-z_]+))?\}/g, (whole, key: string, arg?: string) => {
    if (key === 'neighbour' && abroad) {
      if (arg === undefined) return abroad.name
      if (arg === 'demonym') return abroad.demonym
      if (arg === 'leader') return abroad.leader
      return whole
    }
    if (key === 'nation') return state.identity.name
    if (key === 'capital') return state.identity.capital
    if (key === 'currency') return state.identity.currency
    if (key === 'demonym') return state.identity.demonym
    if (key === 'leader') return state.identity.leaderTitle
    if (key === 'animal') return state.identity.animal ?? 'unnamed national animal'
    if (key === 'motto') return state.identity.motto ?? ''
    if (key === 'faith') return state.identity.faith ?? 'no faith in particular'
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

export function electionTerm(state: NationState): number {
  return state.term ?? TERM_DAYS
}

// The day of the next election, today included, or null for a nation that holds none.
export function nextElection(state: NationState): number | null {
  const term = electionTerm(state)
  if (term <= 0) return null
  if (state.electionDay !== undefined) return state.electionDay
  return Math.ceil(state.day / term) * term
}

export function daysUntilElection(state: NationState): number | null {
  const next = nextElection(state)
  return next === null ? null : next - state.day
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

  const bound = (same: (o: Option) => boolean) => {
    const owner = dilemmas.find((d) => d.options.some(same))
    return owner ? state.agenda.bound[owner.id] : undefined
  }
  if (atStage(itself)) return dryRun(state, content, option, 'situation')
  if (onDilemma(itself)) return dryRun(state, content, option, 'decision', bound(itself))
  if (atStage(sameId) && onDilemma(sameId)) {
    throw new Error(
      `a copy of option ${option.id} could belong to a dilemma or to the situation: ` +
        'use forecastDecision or forecastSituation',
    )
  }
  if (atStage(sameId)) return dryRun(state, content, option, 'situation')
  return dryRun(state, content, option, 'decision', bound(sameId))
}

export function forecastDecision(
  state: GameState,
  content: Content,
  dilemmaId: string,
  optionId: string,
): Forecast {
  const option = agendaOption(state, content, dilemmaId, optionId)
  return dryRun(state, content, option, 'decision', state.agenda.bound[dilemmaId])
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
  neighbour?: string,
): Forecast {
  const scratch: GameState = structuredClone({ ...state, timeline: [] })
  return enact(scratch, content, option, '', kind, neighbour)
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

// text is what the player wrote, for an option that asks them to name something.
export function decide(
  input: GameState,
  content: Content,
  dilemmaId: string,
  optionId: string,
  text?: string,
): GameState {
  const state = structuredClone(input)
  const chosen = agendaOption(state, content, dilemmaId, optionId)
  const option = chosen.custom
    ? {
        ...chosen,
        effects: [...chosen.effects, { identity: chosen.custom.field, to: cleanName(chosen.custom.field, text) }],
      }
    : chosen

  enact(state, content, option, dilemmaId, 'decision', state.agenda.bound[dilemmaId])
  state.answered[dilemmaId] = state.day
  if (state.agenda.major === dilemmaId) state.agenda.major = null
  state.agenda.minors = state.agenda.minors.filter((id) => id !== dilemmaId)
  return state
}

// Sets a dilemma aside without taking any of its courses. Nothing moves. It counts as
// answered, so it rests like any other before it can come round again.
export function dismiss(input: GameState, content: Content, dilemmaId: string, why?: string): GameState {
  const state = structuredClone(input)
  if (!agendaIds(state).includes(dilemmaId)) throw new Error(`${dilemmaId} is not on today's agenda`)
  const dilemma = findDilemma(content, dilemmaId)
  record(state, content, 'decision', `${dilemma.title}: dismissed`, [], why, state.agenda.bound[dilemmaId])
  state.answered[dilemmaId] = state.day
  if (state.agenda.major === dilemmaId) state.agenda.major = null
  state.agenda.minors = state.agenda.minors.filter((id) => id !== dilemmaId)
  return state
}

// A change that came from above the engine: an event in the world, a law the legislature
// passed, a Founder's Word. Only indicator, faction, minister, policy and flag effects are
// taken; the caller has already bounded them. Recorded on the timeline with every reason.
export function applyExternal(
  input: GameState,
  content: Content,
  kind: 'event' | 'law' | 'word',
  headline: string,
  effects: readonly Effect[],
  text?: string,
): GameState {
  const state = structuredClone(input)
  const allowed = effects.filter(
    (e) => 'indicator' in e || 'faction' in e || 'minister' in e || 'policy' in e || ('flag' in e && !('identity' in e)),
  )
  const changes: Change[] = []
  apply(state, allowed, changes)
  record(state, content, kind, headline, changes, text)
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
  if (state.day % 7 === 0) settleTreaties(state, content)
  runPending(state, content)
  settlePromises(state, content)
  advanceSituation(state, content)
  updateTraits(state, content)
  checkCabinet(state, content)
  const fell = checkGovernment(state, content)
  const polling = nextElection(state) === state.day
  if (!fell && polling) holdElection(state, content)
  if (polling && state.electionDay !== undefined) state.electionDay += electionTerm(state)

  state.day += 1
  assess(state, content)
  state.agenda = buildAgenda(state, content)
  return state
}

function enact(
  state: GameState,
  content: Content,
  option: Option,
  source: string,
  kind: 'decision' | 'situation',
  neighbour?: string,
): Forecast {
  const policies = policyChanges(state, option.effects)
  const changes: Change[] = []
  apply(state, option.effects, changes, neighbour)
  opinions(state, content, option, changes)

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
      ...(neighbour === undefined ? {} : { neighbour }),
    })
  }
  if (option.promise) {
    state.promises.push({
      id: option.promise.id,
      text: option.promise.text,
      dueDay: state.day + option.promise.due,
      kept: structuredClone(option.promise.kept),
      broken: structuredClone(option.promise.broken),
      ...(neighbour === undefined ? {} : { neighbour }),
    })
  }
  record(state, content, kind, option.headline, [...changes, ...penalties, ...pressure], option.result, neighbour)

  const explained = (c: Change) => explain(c, state, content, neighbour)
  return {
    changes: changes.map(explained),
    penalties: penalties.map((p) => ({ ...explained(p), trait: p.trait })),
    pressure: pressure.map(explained),
    policies,
    hasLater: option.later.length > 0,
    ...(option.promise
      ? { promise: { text: render(option.promise.text, state, content, neighbour), due: option.promise.due } }
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
function explain(change: Change, state: NationState, content: Content, neighbour?: string): Change {
  const why = render(change.why, state, content, change.kind === 'neighbour' ? change.target : neighbour)
  return { kind: change.kind, target: change.target, by: change.by, why }
}

function apply(state: GameState, effects: readonly Effect[], changes: Change[], neighbour?: string) {
  for (const effect of effects) {
    if ('identity' in effect) {
      state.identity[effect.identity] = effect.to
    } else if ('standing' in effect) {
      if (neighbour === undefined || !Object.hasOwn(state.neighbours, neighbour)) continue
      state.neighbours[neighbour] = clampStanding(state.neighbours[neighbour]! + effect.standing)
      changes.push({ kind: 'neighbour', target: neighbour, by: effect.standing, why: effect.why })
    } else if ('treaty' in effect) {
      if (neighbour === undefined) continue
      if (state.treaties.some((t) => t.kind === effect.treaty && t.with === neighbour)) continue
      const until = effect.days === undefined ? {} : { until: state.day + effect.days }
      state.treaties.push({ kind: effect.treaty, with: neighbour, since: state.day, ...until })
    } else if ('endTreaty' in effect) {
      const ends = (t: { kind: string; with: string }) =>
        t.kind === effect.endTreaty && (neighbour === undefined || t.with === neighbour)
      state.treaties = state.treaties.filter((t) => !ends(t))
    } else if ('indicator' in effect) {
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
  neighbour?: string,
) {
  state.timeline.push({
    day: state.day,
    kind,
    headline: render(headline, state, content, neighbour),
    ...(text === undefined ? {} : { text: render(text, state, content, neighbour) }),
    changes: changes.map((c) => explain(c, state, content, neighbour)),
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
    apply(state, item.effects, changes, item.neighbour)
    record(state, content, 'consequence', item.headline, changes, undefined, item.neighbour)
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
      apply(state, promise.broken, changes, promise.neighbour)
      record(state, content, 'promise', `Promise broken: ${promise.text}`, changes, undefined, promise.neighbour)
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

export function buildAgenda(state: GameState, content: Content): Agenda {
  const eligible = content.dilemmas.filter(
    (d) =>
      isDue(d, state) &&
      holds(d.when, state) &&
      availableOptions(d.options, state).length >= 2 &&
      (d.abroad === undefined || candidates(d, state, content).length > 0),
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

  const bound: Record<string, string> = {}
  for (const dilemma of major ? [major, ...minors] : minors) {
    if (dilemma.abroad === undefined) continue
    bound[dilemma.id] = pick(rngFor(state.seed, state.day, `abroad:${dilemma.id}`), candidates(dilemma, state, content))
  }

  return {
    major: major?.id ?? null,
    minors: minors.map((d) => d.id),
    situation: currentStage(state, content) !== null,
    bound,
  }
}

// The neighbours a dilemma about another country could be put on the desk with today.
export function candidates(dilemma: Dilemma, state: NationState, content: Content): string[] {
  const want = dilemma.abroad
  if (!want) return []
  const has = (n: NeighbourDef, kind: string) => state.treaties.some((t) => t.kind === kind && t.with === n.id)
  return content.neighbours
    .filter(
      (n) =>
        (want.supplies === undefined || n.surpluses.includes(want.supplies)) &&
        (want.wants === undefined || n.needs.includes(want.wants)) &&
        (want.standing === undefined || compare(standingWith(state, content, n.id), want.standing)) &&
        (want.treaty === undefined || has(n, want.treaty)) &&
        (want.noTreaty === undefined || !has(n, want.noTreaty)),
    )
    .map((n) => n.id)
}

export function standingWith(state: NationState, content: Content, neighbour: string): number {
  if (Object.hasOwn(state.neighbours, neighbour)) return state.neighbours[neighbour]!
  return content.neighbours.find((n) => n.id === neighbour)?.standing ?? 0
}

// Where the nation stands on each resource, by the pack's rules. Short of something wins
// over having it to spare when a rule allows both.
function assess(state: GameState, content: Content) {
  for (const n of content.neighbours) {
    if (!Object.hasOwn(state.neighbours, n.id)) state.neighbours[n.id] = n.standing
  }
  state.resources = Object.fromEntries(
    content.resources.map((r) => [r.id, holds(r.need, state) ? 'need' : holds(r.surplus, state) ? 'surplus' : 'even']),
  )
}

// Every neighbour reads the papers. An option carrying a tag a neighbour cares about moves
// standing with that neighbour, whatever the decision was about.
function opinions(state: GameState, content: Content, option: Option, changes: Change[]) {
  for (const n of content.neighbours) {
    const liked = option.tags.filter((tag) => n.likes.includes(tag)).length
    const disliked = option.tags.filter((tag) => n.dislikes.includes(tag)).length
    const by = Math.max(-OPINION_CAP, Math.min(OPINION_CAP, (liked - disliked) * OPINION_STEP))
    if (by === 0) continue
    const why = by > 0 ? n.pleased : n.displeased
    apply(state, [{ standing: by, why }], changes, n.id)
  }
}

// Once a week every treaty pays out, runs its course, or is walked out of by the other
// side if relations have fallen far enough.
function settleTreaties(state: GameState, content: Content) {
  for (const treaty of [...state.treaties]) {
    const def = content.treaties.find((t) => t.id === treaty.kind)
    if (!def) continue
    const remove = () => {
      state.treaties = state.treaties.filter((t) => t !== treaty)
    }
    if (treaty.until !== undefined && treaty.until <= state.day) {
      remove()
      record(state, content, 'treaty', `The ${def.name.toLowerCase()} with {neighbour} runs its course`, [], undefined, treaty.with)
      continue
    }
    if (standingWith(state, content, treaty.with) < def.breaksBelow) {
      remove()
      const changes: Change[] = []
      const why = `{neighbour} walked out of the ${def.name.toLowerCase()}, and it was noticed.`
      apply(state, [{ indicator: 'legitimacy', by: -WALKOUT_LEGITIMACY, why }], changes)
      record(state, content, 'treaty', `{neighbour} walks out of the ${def.name.toLowerCase()}`, changes, undefined, treaty.with)
      continue
    }
    const changes: Change[] = []
    apply(state, def.weekly, changes, treaty.with)
    record(state, content, 'treaty', def.headline, changes, undefined, treaty.with)
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

// What a player types for a name: one line, no control characters, no runs of spaces,
// and no longer than the field allows. Anything that cleans down to nothing is refused.
export function cleanName(field: IdentityField, text: string | undefined): string {
  const cleaned = (text ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) throw new Error(`a ${field} needs a name`)
  return [...cleaned].slice(0, IDENTITY_LIMITS[field]).join('').trim()
}

// The sandbox. Each of these changes the nation in a way the rules would not, says so in
// the record, and marks the nation as sandboxed for good.

export type Adjustment =
  | { indicator: IndicatorId; to: number }
  | { faction: string; to: number }
  | { neighbour: string; to: number }
  | { policy: string; to: boolean | number }

export function adjust(input: GameState, content: Content, adjustments: readonly Adjustment[]): GameState {
  const state = structuredClone(input)
  const changes: Change[] = []
  const why = 'Set by hand in the sandbox.'
  for (const a of adjustments) {
    if ('indicator' in a) {
      const by = clamp(a.to) - state.indicators[a.indicator]
      apply(state, [{ indicator: a.indicator, by, why }], changes)
    } else if ('faction' in a) {
      const faction = state.factions[a.faction]
      if (!faction) throw new Error(`unknown faction ${a.faction}`)
      apply(state, [{ faction: a.faction, by: clamp(a.to) - faction.approval, why }], changes)
    } else if ('neighbour' in a) {
      if (!content.neighbours.some((n) => n.id === a.neighbour)) throw new Error(`unknown neighbour ${a.neighbour}`)
      const was = standingWith(state, content, a.neighbour)
      state.neighbours[a.neighbour] = was
      apply(state, [{ standing: clampStanding(a.to) - was, why }], changes, a.neighbour)
    } else {
      if (!content.policies.some((p) => p.id === a.policy)) throw new Error(`unknown policy ${a.policy}`)
      apply(state, [{ policy: a.policy, to: a.to }], changes)
    }
  }
  state.sandbox = true
  record(state, content, 'sandbox', 'Figures changed in the sandbox', changes.filter((c) => c.by !== 0))
  return state
}

// Puts any dilemma on today's desk, whether or not it is due or its conditions hold.
export function callUp(input: GameState, content: Content, dilemmaId: string): GameState {
  const state = structuredClone(input)
  const dilemma = findDilemma(content, dilemmaId)
  if (dilemma.kind === 'major') state.agenda.major = dilemma.id
  else if (!state.agenda.minors.includes(dilemma.id)) state.agenda.minors = [...state.agenda.minors, dilemma.id]
  if (dilemma.abroad) {
    const fits = candidates(dilemma, state, content)
    const neighbour = fits[0] ?? content.neighbours[0]?.id
    if (neighbour) state.agenda.bound = { ...state.agenda.bound, [dilemma.id]: neighbour }
  }
  state.sandbox = true
  record(state, content, 'sandbox', `Called up in the sandbox: ${dilemma.title}`, [])
  return state
}

// Starts any crisis now, at its first stage, in place of any that is running.
export function startCrisis(input: GameState, content: Content, situationId: string): GameState {
  const state = structuredClone(input)
  const situation = findSituation(content, situationId)
  state.situation = { id: situation.id, stage: 0, gauge: situation.start }
  state.situationsDone = state.situationsDone.filter((id) => id !== situation.id)
  state.agenda.situation = true
  state.sandbox = true
  record(state, content, 'sandbox', `Crisis started in the sandbox: ${situation.title}`, [], situation.description)
  return state
}
