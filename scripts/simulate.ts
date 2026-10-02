// Plays a nation forward with random choices and prints what happened.
//
//   node scripts/simulate.ts               one 60-day story, seed 1
//   node scripts/simulate.ts 90 42         90 days, seed 42
//   node scripts/simulate.ts 60 --runs 200 summary across 200 seeds

import { checkPack } from '../packages/content/src/index.ts'
import {
  INDICATORS,
  availableOptions,
  currentStage,
  decide,
  decideSituation,
  endDay,
  newNation,
  support,
  type Content,
  type GameState,
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

const identity = { name: 'Vesland', capital: 'Port Almar', currency: 'crown', demonym: 'Veslander' }

function play(content: Content, seed: number, days: number): GameState {
  let state = newNation(content, identity, seed)
  for (let i = 0; i < days; i++) {
    const rng = rngFor(seed, state.day, 'player')
    const stage = currentStage(state, content)
    if (stage && state.agenda.situation) {
      state = decideSituation(state, content, pick(rng, availableOptions(stage.options, state)).id)
    }
    for (const id of [state.agenda.major, ...state.agenda.minors]) {
      if (!id) continue
      const dilemma = content.dilemmas.find((d) => d.id === id)!
      state = decide(state, content, id, pick(rng, availableOptions(dilemma.options, state)).id)
    }
    state = endDay(state, content)
  }
  return state
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

if (runs > 0) {
  const totals = Object.fromEntries(INDICATORS.map((id) => [id, [] as number[]]))
  let falls = 0
  let emptyDays = 0
  const traits = new Map<string, number>()
  for (let s = 1; s <= runs; s++) {
    const end = play(content, s, days)
    for (const id of INDICATORS) totals[id]!.push(end.indicators[id])
    falls += end.government - 1
    emptyDays += days - end.timeline.filter((e) => e.kind === 'decision').map((e) => e.day).filter((d, i, a) => a.indexOf(d) === i).length
    for (const t of end.traits) traits.set(t, (traits.get(t) ?? 0) + 1)
  }
  console.log(`${runs} runs of ${days} days\n`)
  for (const id of INDICATORS) {
    const values = totals[id]!.sort((a, b) => a - b)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    console.log(`${id.padEnd(15)} mean ${mean.toFixed(1).padStart(5)}   min ${values[0]}   max ${values.at(-1)}`)
  }
  console.log(`\ngovernments fallen per run: ${(falls / runs).toFixed(2)}`)
  console.log(`days with no decision per run: ${(emptyDays / runs).toFixed(1)}`)
  for (const [id, count] of [...traits].sort((a, b) => b[1] - a[1])) {
    console.log(`trait ${id}: held at the end in ${Math.round((count / runs) * 100)}% of runs`)
  }
} else {
  const end = play(content, seed, days)
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
}
