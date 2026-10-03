// Plays a nation forward with random choices and prints what happened.
// The founding questions are answered at random too, so each seed is a different country.
//
//   node scripts/simulate.ts               one 60-day story, seed 1
//   node scripts/simulate.ts 90 42         90 days, seed 42
//   node scripts/simulate.ts 60 --runs 200 summary across 200 seeds

import { checkPack } from '../packages/content/src/index.ts'
import {
  ELECTION_HEADLINES,
  INDICATORS,
  availableOptions,
  classify,
  currentStage,
  decide,
  decideSituation,
  endDay,
  newNation,
  support,
  type Content,
  type GameState,
  type Identity,
} from '../packages/engine/src/index.ts'
import { pick, rngFor } from '../packages/engine/src/rng.ts'

const args = process.argv.slice(2)
const runsAt = args.indexOf('--runs')
const runs = runsAt === -1 ? 0 : Number(args[runsAt + 1])
const positional = args.filter((_, i) => runsAt === -1 || (i !== runsAt && i !== runsAt + 1))
const days = Number(positional[0] ?? 60)
const seed = Number(positional[1] ?? 1)

const { content, problems } = checkPack('packs/core')
if (problems.length) {
  for (const p of problems) console.error(`${p.where}: ${p.message}`)
  process.exit(1)
}

const identity: Identity = {
  name: 'Vesland',
  capital: 'Port Almar',
  currency: 'crown',
  demonym: 'Veslander',
  leaderTitle: 'Prime Minister',
  flag: { layout: 'tricolour', colours: ['navy', 'white', 'gold'] },
}

function found(content: Content, seed: number): GameState {
  const rng = rngFor(seed, 0, 'founding')
  const answers = Object.fromEntries(content.founding.questions.map((q) => [q.id, pick(rng, q.answers).id]))
  return newNation(content, identity, seed, answers)
}

function play(start: GameState, content: Content, days: number): GameState {
  let state = start
  for (let i = 0; i < days; i++) {
    const rng = rngFor(state.seed, state.day, 'player')
    const stage = currentStage(state, content)
    if (stage && state.agenda.situation) {
      state = decideSituation(state, content, pick(rng, availableOptions(stage.options, state)).id)
    }
    for (const id of [state.agenda.major, ...state.agenda.minors]) {
      if (!id) continue
      const dilemma = content.dilemmas.find((d) => d.id === id)!
      const option = pick(rng, availableOptions(dilemma.options, state))
      state = decide(state, content, id, option.id, option.custom ? `Simulated ${option.custom.field}` : undefined)
    }
    state = endDay(state, content)
  }
  return state
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
const spread = (values: number[]) =>
  `mean ${mean(values).toFixed(1).padStart(5)}   min ${Math.min(...values)}   max ${Math.max(...values)}`
const tally = (counts: Map<string, number>, key: string) => counts.set(key, (counts.get(key) ?? 0) + 1)
const ranked = (counts: Map<string, number>) => [...counts].sort((a, b) => b[1] - a[1])
const share = (count: number) => `${Math.round((count / runs) * 100)}%`

if (runs > 0) {
  const starts = Object.fromEntries(INDICATORS.map((id) => [id, [] as number[]]))
  const ends = Object.fromEntries(INDICATORS.map((id) => [id, [] as number[]]))
  const startSupport: number[] = []
  const firstMajors = new Set<string>()
  const elections = { won: 0, reduced: 0, lost: 0 }
  const traits = new Map<string, number>()
  const startClasses = new Map<string, number>()
  const endClasses = new Map<string, number>()
  let falls = 0
  let emptyDays = 0

  for (let s = 1; s <= runs; s++) {
    const start = found(content, s)
    const end = play(start, content, days)
    for (const id of INDICATORS) {
      starts[id]!.push(start.indicators[id])
      ends[id]!.push(end.indicators[id])
    }
    startSupport.push(support(start))
    if (start.agenda.major) firstMajors.add(start.agenda.major)
    tally(startClasses, classify(start, content).id)
    tally(endClasses, classify(end, content).id)
    for (const t of end.traits) tally(traits, t)
    for (const outcome of ['won', 'reduced', 'lost'] as const) {
      elections[outcome] += end.timeline.filter((e) => e.headline === ELECTION_HEADLINES[outcome]).length
    }
    falls += end.timeline.filter((e) => e.kind === 'government').length
    emptyDays += days - new Set(end.timeline.filter((e) => e.kind === 'decision').map((e) => e.day)).size
  }

  console.log(`${runs} runs of ${days} days\n`)
  console.log('at the founding')
  for (const id of INDICATORS) console.log(`${id.padEnd(15)} ${spread(starts[id]!)}`)
  console.log(`${'support'.padEnd(15)} ${spread(startSupport)}`)
  console.log(`different first dilemmas: ${firstMajors.size}`)
  for (const [id, count] of ranked(startClasses)) console.log(`class ${id}: ${share(count)} of runs`)

  console.log(`\nafter ${days} days`)
  for (const id of INDICATORS) console.log(`${id.padEnd(15)} ${spread(ends[id]!)}`)
  console.log(`\ngovernments fallen per run: ${(falls / runs).toFixed(2)}`)
  console.log(
    `elections per run: won ${(elections.won / runs).toFixed(2)}, ` +
      `reduced majority ${(elections.reduced / runs).toFixed(2)}, lost ${(elections.lost / runs).toFixed(2)}`,
  )
  console.log(`days with no decision per run: ${(emptyDays / runs).toFixed(1)}`)
  for (const [id, count] of ranked(traits)) console.log(`trait ${id}: held at the end in ${share(count)} of runs`)
  for (const [id, count] of ranked(endClasses)) console.log(`class ${id}: held at the end in ${share(count)} of runs`)
  const unused = content.classes.filter((c) => !endClasses.has(c.id)).map((c) => c.id)
  if (unused.length) console.log(`classes nobody ended in: ${unused.join(', ')}`)
} else {
  const end = play(found(content, seed), content, days)
  for (const entry of end.timeline) {
    console.log(`\nDay ${entry.day}  [${entry.kind}]  ${entry.headline}`)
    if (entry.text) console.log(`  ${entry.text}`)
    for (const c of entry.changes) {
      const target = c.kind === 'minister' ? `${c.target} minister` : c.target
      console.log(`    ${target} ${signed(c.by)}  ${c.why}`)
    }
  }
  console.log(`\nAfter ${days} days, government number ${end.government}, support ${support(end)}`)
  console.log(INDICATORS.map((id) => `${id} ${end.indicators[id]}`).join('  '))
  console.log(`traits: ${end.traits.join(', ') || 'none'}`)
  const nationClass = classify(end, content)
  console.log(`class: ${nationClass.name}. ${nationClass.description}`)
}
