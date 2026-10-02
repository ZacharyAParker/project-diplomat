import { holds, compare } from './conditions.ts'
import { pick, pickWeighted, rngFor } from './rng.ts'
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
} from './types.ts'

export interface Agenda {
  major: string | null
  minors: string[]
  situation: boolean
}

export interface GameState extends NationState {
  agenda: Agenda
}

const START: Record<IndicatorId, number> = {
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

const FALL_LEGITIMACY = 10
const FALL_SUPPORT = 20
const RESIGN_STANDING = 10
const BORROW_DIVISOR = 6
const FISCAL_RECOVERY = 0.3
const DEBT_CRISIS = 80

const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10

export function newNation(content: Content, identity: Identity, seed: number): GameState {
  const state: GameState = {
    seed,
    day: 1,
    identity,
    indicators: { ...START },
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
  state.agenda = buildAgenda(state, content)
  return state
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

export function decide(input: GameState, content: Content, dilemmaId: string, optionId: string): GameState {
  const state = structuredClone(input)
  const onAgenda = state.agenda.major === dilemmaId || state.agenda.minors.includes(dilemmaId)
  if (!onAgenda) throw new Error(`${dilemmaId} is not on today's agenda`)
  const dilemma = findDilemma(content, dilemmaId)
  const option = availableOptions(dilemma.options, state).find((o) => o.id === optionId)
  if (!option) throw new Error(`${optionId} is not an available option for ${dilemmaId}`)

  enact(state, content, option, dilemmaId)
  state.answered[dilemmaId] = state.day
  if (state.agenda.major === dilemmaId) state.agenda.major = null
  state.agenda.minors = state.agenda.minors.filter((id) => id !== dilemmaId)
  return state
}

export function decideSituation(input: GameState, content: Content, optionId: string): GameState {
  const state = structuredClone(input)
  const stage = currentStage(state, content)
  if (!stage || !state.agenda.situation) throw new Error('no situation stage is waiting on a decision')
  const option = availableOptions(stage.options, state).find((o) => o.id === optionId)
  if (!option) throw new Error(`${optionId} is not an available option at this stage`)

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
  checkGovernment(state, content)

  state.day += 1
  state.agenda = buildAgenda(state, content)
  return state
}

function enact(state: GameState, content: Content, option: Option, source: string, kind: EntryKind = 'decision') {
  const changes: Change[] = []
  apply(state, option.effects, changes)

  for (const trait of content.traits) {
    if (!state.traits.includes(trait.id)) continue
    if (!trait.opposes.some((tag) => option.tags.includes(tag))) continue
    apply(
      state,
      [{ indicator: 'legitimacy', by: -trait.penalty, why: `{nation} is known as a ${trait.name}. This cuts against it.` }],
      changes,
    )
  }

  if (state.situation && kind === 'decision') {
    const situation = findSituation(content, state.situation.id)
    for (const pressure of situation.pressures) {
      if (!option.tags.includes(pressure.tag)) continue
      apply(state, [{ situation: situation.id, by: pressure.by, why: `It bears on ${situation.title.toLowerCase()}.` }], changes)
    }
  }

  for (const later of option.later) {
    state.pending.push({
      dueDay: state.day + later.after,
      when: later.when,
      headline: later.headline,
      effects: later.effects,
      source,
    })
  }
  if (option.promise) {
    state.promises.push({
      id: option.promise.id,
      text: option.promise.text,
      dueDay: state.day + option.promise.due,
      kept: option.promise.kept,
      broken: option.promise.broken,
    })
  }
  record(state, content, kind, option.headline, changes, option.result)
}

function apply(state: GameState, effects: Effect[], changes: Change[]) {
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
    text: text === undefined ? undefined : render(text, state, content),
    changes: changes.map((c) => ({ ...c, why: render(c.why, state, content) })),
  })
}

// A deficit is a fiscal reading under 50. Once a week the gap lands on the debt,
// and the books drift part of the way back to balance as one-off costs wash out.
// Past DEBT_CRISIS the interest bill starts to hurt.
function settleBudget(state: GameState, content: Content) {
  const gap = 50 - state.indicators.fiscal
  const borrowed = Math.round(gap / BORROW_DIVISOR)
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

function checkGovernment(state: GameState, content: Content) {
  if (state.indicators.legitimacy > FALL_LEGITIMACY && support(state) >= FALL_SUPPORT) return
  state.government += 1
  state.indicators.legitimacy = 40
  for (const faction of Object.values(state.factions)) faction.approval = clamp((faction.approval + 50) / 2)
  state.promises = []
  state.flags['government_fell'] = state.day
  appointCabinet(state, content)
  record(
    state,
    content,
    'government',
    'The government falls',
    [],
    'A new administration takes office in {capital}. It inherits everything the last one did.',
  )
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
    (d) => !(d.id in state.answered) && holds(d.when, state) && availableOptions(d.options, state).length >= 2,
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
