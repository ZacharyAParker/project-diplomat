// The world week as the AI plays it. The engine plans every nation's legal moves (planWorld);
// this asks the models to choose: one call for every nation that does not matter to the
// player (task world.nations, sent only the nations with a real choice), and one call each, on
// their own sessions, for the nations that do (task nation.move). Whatever comes back is a
// choice among legal moves only; anything a model gets wrong falls back to the top move.
// See docs/design/world.md.

import { HOME, allies, atWar, describeMove, homeStrength, nameOf, nationLines, planWorld, strengthOf, worldLines, type Content, type GameState, type NationPlan, type Temperament, type WorldChoices, type WorldPlan } from '@diplomat/engine'
import { brief } from './briefs.ts'
import { carried } from './rules.ts'
import type { Context } from './pipeline.ts'
import { DISMISS, type Body, type Brief, type Course, type Division, type ForeignBrief, type ForeignMove, type Institutions, type PetitionBrief, type Step, type TaskInput, type TaskOutput } from './types.ts'

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
// executive, or makes its vote the decision. It sits as on any petition, with the declaration
// as the one course and refusal as the other: the AI plays the members (or the stand-in does,
// by the parties' factions), they debate and divide, and the division decides.
export function warStep(institutions: Institutions): { body: Body; step: Step } | null {
  const step = institutions.constitution.rules.steps.find((st) => st.role === 'recommend' && (st.decisive || st.bindAt !== undefined) && ['legislature', 'electorate', 'council'].includes(institutions.bodies.find((b) => b.id === st.body)?.kind ?? ''))
  if (!step) return null
  return { body: institutions.bodies.find((b) => b.id === step.body)!, step }
}

export interface WarSitting {
  body: Body
  carried: boolean
  division: Division
  document: string
  ai: boolean
  provoked: boolean
}

export function provokedBy(state: GameState, target: string): boolean {
  const standing = state.neighbours[target] ?? 0
  const claim = state.world?.claims.some((c) => !c.settled && ((c.by === target && c.against === HOME) || (c.by === HOME && c.against === target))) ?? false
  return standing <= -20 || claim || allies(state, HOME).some((a) => atWar(state, a, target))
}

// The motion as the members see it: a petition with one course and refusal.
export function warMotion(state: GameState, content: Content, institutions: Institutions, target: string): PetitionBrief {
  const name = nameOf(state, content, target)
  const provoked = provokedBy(state, target)
  const executive = institutions.constitution.rules.executive.title
  const theirs = content.neighbours.find((n) => n.id === target)
  const why = [
    provoked ? `The government says ${name} has provoked it.` : `The government gives no provocation the House has heard of.`,
    ...worldLines(state, content).filter((l) => l.includes(name)),
  ]
  // How the factions take it, for the rules-based members: a provoked war rallies the country,
  // an unprovoked one does not, and business never likes a war.
  const mood = provoked ? 1 : -2
  const effects = content.factions.map((f) => ({ faction: f.id, by: f.id === 'business' ? mood - 1 : mood }))
  return {
    number: 0,
    dilemma: `war-${target}`,
    title: `A declaration of war against ${name}`,
    // Not a petition from the public: a motion the executive brings. Number 0 says so.
    description: `This is a motion, not a petition. ${executive} asks the House to declare war on ${name}${theirs ? `, ${theirs.description.charAt(0).toLowerCase()}${theirs.description.slice(1)}` : '.'} ${why.join(' ')}`.replace(/\.\./g, '.'),
    kind: 'major',
    neighbour: name,
    tags: ['foreign', 'defence'],
    options: [
      {
        course: '1',
        number: 1,
        advocate: executive,
        speech: `That this House declares war on ${name}.`,
        forecast: [
          'The war is paid for every week it lasts: the budget, then the debt, and living standards fall.',
          `Lost, it costs a borderland for good, reparations, and very likely the government.`,
          `Won, ${name} pays reparations, and if it stands alone it could be annexed.`,
        ],
        tags: ['hawkish', 'defence'],
        effects,
        indicators: [
          { indicator: 'fiscal', by: -2 },
          { indicator: 'living', by: -1 },
        ],
      },
      { course: DISMISS, number: 0, advocate: 'Members opposite', speech: `That the House declines to declare war on ${name}.`, forecast: ['No war. The quarrel goes on by other means.'], tags: ['dovish'] },
    ],
  }
}

export async function warSitting(ctx: Context, target: string): Promise<WarSitting | null> {
  const found = warStep(ctx.gov.institutions)
  if (!found) return null
  const { body, step } = found
  const p = warMotion(ctx.state, ctx.content, ctx.gov.institutions, target)
  const b = brief(ctx.state, ctx.gov, ctx.content, await ctx.record({ body: body.id, series: 'hansard', limit: 6 }), ctx.archivePath)
  const name = nameOf(ctx.state, ctx.content, target)
  const advice = [{ body: 'The Foreign Ministry', summary: `Our army is ${homeStrength(ctx.state) >= 55 ? 'strong' : homeStrength(ctx.state) >= 40 ? 'middling' : 'weak'}; ${name}'s strength is ${strengthOf(ctx.state, target)} to our ${homeStrength(ctx.state)}${allies(ctx.state, target).length ? `, and it has allies: ${allies(ctx.state, target).map((a) => nameOf(ctx.state, ctx.content, a)).join(', ')}` : ', and it stands alone'}.` }]
  let ladder: Course[]
  let division: Division
  let text: string
  let ai: boolean
  if (body.kind === 'electorate') {
    const run = await ctx.run('electorate.referendum', { brief: b, petition: p, mood: provokedBy(ctx.state, target) ? 'The country feels wronged.' : 'The country does not see why.' })
    ai = run.ai
    const aye = Math.round(((run.output.results['1'] ?? 0) / 100) * body.size)
    ladder = aye * 2 > body.size ? ['1', DISMISS] : [DISMISS, '1']
    const party = body.parties[0]?.id ?? 'voters'
    division = { aye, no: body.size - aye, abstain: 0, byParty: { [party]: { aye, no: body.size - aye, abstain: 0 } } }
    text = run.output.campaign
  } else {
    const input: TaskInput['legislature.sitting'] = {
      brief: b,
      body,
      petition: p,
      kind: 'first',
      step: { ...(step.bindAt === undefined ? {} : { bindAt: step.bindAt }), ...(step.carryAt === undefined ? {} : { carryAt: step.carryAt }), ...(step.decisive ? { decisive: true } : {}) },
      advice,
    }
    const run = body.kind === 'legislature' ? await ctx.run('legislature.sitting', input) : await ctx.run('council.sitting', input)
    ai = run.ai
    const out = run.output as TaskOutput['legislature.sitting']
    ladder = out.ladder
    division = out.division
    text = out.debate
  }
  // The declaration carries if it is the House's first preference and the division carries.
  const isCarried = ladder[0] === '1' && carried(division, step, body.size)
  const document = await ctx.write({
    series: 'hansard',
    title: `${body.name}: a declaration of war against ${name}`,
    day: ctx.state.day,
    issuer: body.name,
    kind: 'division',
    refs: [],
    body: `${text}\n\n**${isCarried ? 'The declaration is carried' : 'The declaration is refused'}**, ${division.aye} to ${division.no}, with ${division.abstain} abstaining.${ai ? '' : '\n\n*(Sat without the AI.)*'}`,
    data: { division, carried: isCarried, target, ladder },
  })
  return { body, carried: isCarried, division, document, ai, provoked: provokedBy(ctx.state, target) }
}
