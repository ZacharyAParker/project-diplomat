// The world week as the AI plays it. The engine plans every nation's legal moves (planWorld);
// this asks the models to choose: one call for every nation that does not matter to the
// player (task world.nations, sent only the nations with a real choice), and one call each, on
// their own sessions, for the nations that do (task nation.move). Whatever comes back is a
// choice among legal moves only; anything a model gets wrong falls back to the top move.
// See docs/design/world.md.

import { HOME, allies, atWar, describeMove, nationLines, planWorld, support, worldLines, type Content, type GameState, type NationPlan, type Temperament, type WorldChoices, type WorldPlan } from '@diplomat/engine'
import { carried } from './rules.ts'
import { rngFor } from './util.ts'
import type { Body, Brief, Division, ForeignBrief, ForeignMove, Institutions, Step, TaskInput, TaskOutput } from './types.ts'

const MAX_IN_BATCH = 14

export function temperamentWords(t: Temperament): string {
  const words = [
    t.ambition >= 65 ? 'ambitious' : t.ambition <= 25 ? 'content with what it has' : 'steady in its aims',
    t.aggression >= 65 ? 'quick to anger' : t.aggression <= 20 ? 'slow to anger' : 'wary',
    t.loyalty >= 65 ? 'loyal to its friends' : t.loyalty <= 35 ? 'faithless' : 'loyal enough',
    t.charity >= 65 ? 'generous' : t.charity <= 25 ? 'tight-fisted' : 'careful with its money',
  ]
  return words.join(', ')
}

export function foreignBrief(state: GameState, content: Content, id: string): ForeignBrief {
  const def = content.neighbours.find((n) => n.id === id)
  const memory = state.world?.nations[id]?.memory ?? []
  return {
    id,
    name: def?.name ?? id,
    leader: def?.leader ?? '',
    form: def?.form ?? '',
    description: def?.description ?? '',
    temperament: def ? temperamentWords(def.temperament) : '',
    lines: nationLines(state, content, id),
    memory: memory.map((m) => `Day ${m.day}: ${m.text}`),
  }
}

function movesOf(state: GameState, content: Content, plan: NationPlan): ForeignMove[] {
  return plan.moves.map((m) => ({ id: m.id, description: describeMove(state, content, m), because: m.because }))
}

export interface WorldCalls {
  plan: WorldPlan
  batch: TaskInput['world.nations'] | null
  singles: TaskInput['nation.move'][]
}

// What would be sent this week, without sending it.
export function worldCalls(state: GameState, content: Content, brief: Brief): WorldCalls {
  const plan = planWorld(state, content)
  const world = worldLines(state, content)
  const singles = plan.nations
    .filter((p) => p.important && p.moves.length > 1)
    .map((p) => ({ brief, world, nation: foreignBrief(state, content, p.nation), moves: movesOf(state, content, p) }))
  const chosen = plan.nations.filter((p) => !p.important && p.choice).slice(0, MAX_IN_BATCH)
  const batch = chosen.length ? { brief, world, nations: chosen.map((p) => ({ ...foreignBrief(state, content, p.nation), moves: movesOf(state, content, p) })) } : null
  return { plan, batch, singles }
}

type Run = <T extends 'world.nations' | 'nation.move'>(task: T, input: TaskInput[T]) => Promise<{ output: TaskOutput[T]; ai: boolean }>

// Asks for the week's choices. Calls to the important nations run side by side; the shared
// call runs with them. Returns the choices and how many came from a model.
export async function chooseWorld(state: GameState, content: Content, brief: Brief, run: Run): Promise<{ choices: WorldChoices; byModel: number; asked: number }> {
  const calls = worldCalls(state, content, brief)
  const choices: WorldChoices = { moves: {}, notes: {} }
  let byModel = 0
  const asked = calls.singles.length + (calls.batch ? calls.batch.nations.length : 0)
  const jobs: Promise<void>[] = calls.singles.map(async (input) => {
    const { output, ai } = await run('nation.move', input)
    choices.moves[input.nation.id] = output.move
    choices.notes[input.nation.id] = output.note
    if (ai) byModel++
  })
  if (calls.batch) {
    const batch = calls.batch
    jobs.push(
      (async () => {
        const { output, ai } = await run('world.nations', batch)
        for (const c of output.choices) {
          choices.moves[c.nation] = c.move
          choices.notes[c.nation] = c.note
          if (ai) byModel++
        }
      })(),
    )
  }
  await Promise.all(jobs)
  return { choices, byModel, asked }
}

// A declaration of war goes before the legislature when the constitution lets it bind the
// executive, or makes its vote the decision. No model: each party votes as a bloc by the
// public mood, the government's support, how hostile the target is, and whether it was
// provoked. Returns null when the executive may declare war alone.
export interface WarVote {
  body: Body
  step: Step
  division: Division
  carried: boolean
  provoked: boolean
}

export function warVote(institutions: Institutions, state: GameState, target: string): WarVote | null {
  const rules = institutions.constitution.rules
  const step = rules.steps.find((st) => st.role === 'recommend' && (st.decisive || st.bindAt !== undefined) && ['legislature', 'electorate'].includes(institutions.bodies.find((b) => b.id === st.body)?.kind ?? ''))
  if (!step) return null
  const body = institutions.bodies.find((b) => b.id === step.body)!
  const standing = state.neighbours[target] ?? 0
  const claim = state.world?.claims.some((c) => !c.settled && ((c.by === target && c.against === HOME) || (c.by === HOME && c.against === target))) ?? false
  const provoked = standing <= -20 || claim || allies(state, HOME).some((a) => atWar(state, a, target))
  const mood = 0.45 + (support(state) - 50) / 100 - standing / 250 + (provoked ? 0.15 : -0.2)
  const rng = rngFor(state.seed, state.day, `war-vote:${target}`)
  const blocs = body.parties.length ? body.parties : [{ id: 'all', seats: body.size }]
  const division: Division = { aye: 0, no: 0, abstain: 0, byParty: {} }
  for (const party of blocs) {
    const share = mood + (rng() * 0.2 - 0.1)
    const aye = Math.round(party.seats * (share >= 0.5 ? 0.85 : 0.2))
    const abstain = Math.round((party.seats - aye) * 0.15)
    const no = party.seats - aye - abstain
    division.byParty[party.id] = { aye, no, abstain }
    division.aye += aye
    division.no += no
    division.abstain += abstain
  }
  return { body, step, division, carried: carried(division, step, body.size), provoked }
}
