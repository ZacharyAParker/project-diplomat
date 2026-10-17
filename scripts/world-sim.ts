// Runs the world on its own for a few years, with nobody deciding anything, and prints what
// happened: how often wars start and end, annexations, matters raised, Assembly motions.
// For tuning the world week. node scripts/world-sim.ts [years] [seeds]
import { join } from 'node:path'
import { loadPack } from '../packages/content/src/load.ts'
import { decideMatter, endDay, matterOptions, newNation, openMatters, HOME, type GameState } from '../packages/engine/src/index.ts'

const root = join(import.meta.dirname, '..')
const { content } = loadPack(join(root, 'packs/core'))
const years = Number(process.argv[2] ?? 3)
const seeds = Number(process.argv[3] ?? 10)
// hawk: the player stands firm, fights, joins every war and condemns everything. Otherwise nobody decides.
const hawk = process.argv[4] === 'hawk'
const HAWKISH = ['firm', 'fight', 'join', 'condemn', 'ally', 'reparations', 'annex', 'none', 'deny', 'aye']
const identity = { name: 'Testland', capital: 'Testby', currency: 'mark', demonym: 'Testlander', leaderTitle: 'Premier', flag: { layout: 'plain', colours: ['#000'] } }

const totals = { council: {} as Record<string, number>, vetoed: 0, councilPassed: 0, underdog: 0, claimsOnHome: 0, wars: 0, homeWars: 0, annexed: 0, homeLost: 0, matters: {} as Record<string, number>, motions: {} as Record<string, number>, passed: 0 }
for (let seed = 1; seed <= seeds; seed++) {
  let state: GameState = newNation(content, identity, seed * 7919)
  for (let d = 0; d < years * 364; d++) {
    state = { ...state, agenda: { major: null, minors: [], situation: false, bound: {} } }
    if (hawk) {
      for (const m of openMatters(state)) {
        const o = matterOptions(state, content, m).find((x) => HAWKISH.includes(x.does))
        if (o) state = decideMatter(state, content, m.id, o.id)
      }
    }
    state = endDay(state, content)
  }
  const w = state.world!
  totals.wars += w.wars.length
  // Wars started by the weaker side, at the odds when they began.
  totals.underdog += w.wars.filter((x) => (x.odds ?? 1) < 0.9).length
  totals.homeWars += w.wars.filter((x) => x.attackers.includes(HOME) || x.defenders.includes(HOME)).length
  totals.annexed += Object.values(w.nations).filter((n) => !n.free).length
  totals.homeLost += w.home.lost
  totals.claimsOnHome += w.claims.filter((c) => c.against === HOME).length
  for (const m of w.matters) totals.matters[m.kind] = (totals.matters[m.kind] ?? 0) + 1
  for (const m of w.council.past) {
    totals.council[m.kind] = (totals.council[m.kind] ?? 0) + 1
    if (m.vetoed?.length) totals.vetoed++
    if (m.passed) totals.councilPassed++
  }
  for (const m of w.assembly.past) {
    totals.motions[m.kind] = (totals.motions[m.kind] ?? 0) + 1
    if (m.passed) totals.passed++
  }
  if (seed === 1) {
    console.log('seed 1 wars:', w.wars.map((x) => `${x.attackers.join('+')} v ${x.defenders.join('+')} d${x.since} odds ${x.odds} ${x.weeks}w ${x.ended?.outcome ?? 'on'}`).join('; '))
    console.log('seed 1 council:', w.council.permanent.join('+'), '|', w.council.elected.map((e) => e.id).join('+'))
    console.log('seed 1 pacts:', w.pacts.map((p) => p.members.join('+')).join('; '))
    console.log('seed 1 home standing:', JSON.stringify(state.neighbours))
    console.log('seed 1 indicators:', JSON.stringify(state.indicators))
  }
}
const per = (n: number) => (n / seeds / years).toFixed(2)
console.log(`per nation-year over ${seeds} seeds x ${years} years:`)
console.log(`  wars ${per(totals.wars)} (${per(totals.underdog)} started by the weaker side), involving the player ${per(totals.homeWars)}, annexations ${per(totals.annexed)}, borderlands lost ${per(totals.homeLost)}, claims on the player ${per(totals.claimsOnHome)}`)
console.log('  matters (last 4 weeks kept only):', JSON.stringify(totals.matters))
console.log('  motions (last 30 kept):', JSON.stringify(totals.motions), 'passed', totals.passed)
console.log('  council (last 30 kept):', JSON.stringify(totals.council), 'passed', totals.councilPassed, 'vetoed', totals.vetoed)
