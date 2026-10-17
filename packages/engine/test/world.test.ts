// The world beyond the borders: twenty nations, wars, pacts, the Assembly of Nations and the
// foreign matters that reach the player. Played on the real core pack.
import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { loadPack } from '../../content/src/load.ts'
import {
  HOME,
  activeWars,
  allies,
  decideMatter,
  deserialize,
  endDay,
  forbidden,
  grievances,
  homeStrength,
  importantNations,
  matterCard,
  matterOptions,
  newNation,
  openMatters,
  planWorld,
  regimeOf,
  serialize,
  worldAct,
  type GameState,
} from '../src/index.ts'

const { content } = loadPack(join(import.meta.dirname, '../../../packs/core'))
const identity = { name: 'Testland', capital: 'Testby', currency: 'mark', demonym: 'Testlander', leaderTitle: 'Premier', flag: { layout: 'plain', colours: ['#000'] } }

const fresh = (seed = 1) => newNation(content, identity, seed)
const clear = (s: GameState): GameState => ({ ...s, agenda: { major: null, minors: [], situation: false, bound: {} } })
function days(state: GameState, n: number, opts: Parameters<typeof endDay>[2] = {}): GameState {
  let s = state
  for (let i = 0; i < n; i++) s = endDay(clear(s), content, opts)
  return s
}
// To the next night the world turns (day 7, 14, ...), without turning it.
const toWeek = (s: GameState) => days(s, (7 - (s.day % 7)) % 7)

test('a new nation finds a world of twenty nations, all in the Assembly with it', () => {
  const s = fresh()
  const w = s.world!
  assert.equal(Object.keys(w.nations).length, 20)
  assert.equal(Object.keys(s.neighbours).length, 20)
  assert.ok(w.assembly.members.includes(HOME))
  assert.equal(w.assembly.members.length, 21)
  assert.equal(w.assembly.next % 14, 0)
  for (const n of Object.values(w.nations)) {
    for (const [other, r] of Object.entries(n.relations)) assert.equal(w.nations[other]!.relations[n.id], r, `${n.id} and ${other} see each other the same way`)
  }
  // Old friends start in pacts, but nobody is in two, and no pact is bigger than four.
  const seen = new Set<string>()
  for (const p of w.pacts) {
    assert.ok(p.members.length >= 2 && p.members.length <= 4)
    for (const m of p.members) {
      assert.ok(!seen.has(m), `${m} is in one pact only`)
      seen.add(m)
    }
  }
})

test('the planner only offers legal moves, and war only against a hostile neighbour', () => {
  let s = fresh(3)
  // Make Kessmark and Ytterholm bitter enemies, and Kessmark much the stronger.
  s.world!.nations['kessmark']!.relations['ytterholm'] = -90
  s.world!.nations['ytterholm']!.relations['kessmark'] = -90
  s.world!.nations['ytterholm']!.strength = 10
  s.world!.pacts = []
  const plan = planWorld(s, content)
  const kess = plan.nations.find((p) => p.nation === 'kessmark')!
  assert.ok(kess.moves.some((m) => m.id === 'war:ytterholm'), 'Kessmark may go to war with Ytterholm')
  for (const p of plan.nations) {
    for (const m of p.moves) {
      if (m.kind !== 'war') continue
      const def = content.neighbours.find((n) => n.id === p.nation)!
      assert.ok(def.borders.includes(m.target!) || (m.target === HOME && def.near), `${p.nation} borders ${m.target}`)
    }
  }
  // Far-off nations can never invade the player.
  for (const p of plan.nations) {
    const def = content.neighbours.find((n) => n.id === p.nation)!
    if (!def.near) assert.ok(!p.moves.some((m) => m.id === `war:${HOME}` || m.id === `claim:${HOME}`))
  }
  void s
  s = toWeek(s)
})

test('the AI chooses among legal moves; anything else falls back to the top move', () => {
  let s = toWeek(fresh(5))
  const before = s.world!.nations['velsa']!.relations['ardune']!
  s = endDay(clear(s), content, { world: { moves: { velsa: 'court:ardune', caravel: 'war:nowhere' }, notes: { velsa: 'A note.' } } })
  const after = s.world!.nations['velsa']!.relations['ardune']!
  assert.ok(after > before - 5, 'Velsa courted Ardune, so relations did not sour beyond the weekly friction')
  assert.ok(s.world!.nations['velsa']!.memory.some((m) => m.text === 'A note.'))
  assert.ok(!activeWars(s).some((w) => w.attackers.includes('caravel')), 'an illegal war was not started')
})

test('a war between two nations is fought week by week and ends', () => {
  let s = fresh(7)
  const w = s.world!
  w.pacts = []
  w.nations['kessmark']!.relations['ytterholm'] = -90
  w.nations['ytterholm']!.relations['kessmark'] = -90
  w.nations['ytterholm']!.strength = 15
  s = toWeek(s)
  s = endDay(clear(s), content, { world: { moves: { kessmark: 'war:ytterholm' }, notes: {} } })
  const war = s.world!.wars.find((x) => x.attackers.includes('kessmark') && x.defenders.includes('ytterholm'))
  assert.ok(war, 'the war began')
  s = days(s, 7 * 30)
  const done = s.world!.wars.find((x) => x.id === war.id)!
  assert.ok(done.ended, 'and ended within thirty weeks')
  assert.ok(done.weeks >= 1)
})

test('when the player is invaded a matter asks what to do, and the war costs money every week', () => {
  let s = fresh(11)
  const w = s.world!
  w.pacts = []
  s.neighbours['eskerland'] = -90
  w.nations['eskerland']!.strength = 95
  w.claims.push({ id: 'claim-x', by: 'eskerland', against: HOME, region: 'the Weir Valley', since: 1 })
  s = toWeek(s)
  s = endDay(clear(s), content, { world: { moves: { eskerland: `war:${HOME}` }, notes: { eskerland: 'Historic justice.' } } })
  assert.ok(activeWars(s).some((x) => x.attackers.includes('eskerland') && x.defenders.includes(HOME)))
  const attacked = openMatters(s).find((m) => m.kind === 'attacked')!
  assert.ok(attacked)
  const card = matterCard(s, content, attacked)
  assert.match(card.title, /Eskerland invades Testland/)
  assert.equal(card.note, 'Historic justice.')
  s = decideMatter(s, content, attacked.id, 'fight')
  assert.ok(importantNations(s).includes('eskerland'), 'an enemy at war with the player plays on its own session')
  const fiscal = s.indicators.fiscal
  s = days(s, 7)
  assert.ok(s.timeline.some((e) => e.kind === 'world' && e.changes.some((c) => c.why === 'The war is paid for week by week.')))
  void fiscal
})

test('the player can be beaten but never annexed', () => {
  let s = fresh(13)
  const w = s.world!
  w.pacts = []
  s.neighbours['eskerland'] = -90
  w.nations['eskerland']!.strength = 100
  w.claims.push({ id: 'claim-y', by: 'eskerland', against: HOME, region: 'Hollin Moor', since: 1 })
  s.indicators.capacity = 5
  s.indicators.administration = 5
  s.indicators.legitimacy = 20
  s = toWeek(s)
  s = endDay(clear(s), content, { world: { moves: { eskerland: `war:${HOME}` }, notes: {} } })
  const war = activeWars(s).find((x) => x.defenders.includes(HOME))!
  assert.ok(war)
  s.world!.wars.find((x) => x.id === war.id)!.front = 99
  const capacity = s.indicators.capacity
  s = days(s, 7)
  const ended = s.world!.wars.find((x) => x.id === war.id)!
  assert.equal(ended.ended?.outcome, 'attackers')
  assert.equal(s.world!.nations[HOME], undefined, 'the player is never a world nation that could be annexed')
  assert.ok(s.world!.home.lost >= 1, 'a borderland was ceded')
  assert.ok(s.indicators.capacity <= capacity, 'and the economy took the hit')
  assert.ok(s.world!.home.reparations.some((r) => r.by < 0), 'reparations are owed')
  assert.ok(s.timeline.some((e) => e.headline === 'Testland loses the war with Eskerland'))
})

test('a beaten AI nation that stands alone can be annexed by the player, and only then', () => {
  let s = fresh(17)
  const w = s.world!
  w.pacts = []
  s.neighbours['ardune'] = -90
  s.indicators.capacity = 90
  s.indicators.administration = 90
  w.nations['ardune']!.strength = 5
  s = worldAct(s, content, { war: 'ardune' })
  const war = activeWars(s).find((x) => x.attackers.includes(HOME))!
  assert.ok(war)
  s.world!.wars.find((x) => x.id === war.id)!.front = 99
  s = toWeek(s)
  s = days(s, 1)
  const victory = openMatters(s).find((m) => m.kind === 'victory')!
  assert.ok(victory, 'victory raises a matter')
  assert.ok(matterOptions(s, content, victory).some((o) => o.does === 'annex'))
  s = decideMatter(s, content, victory.id, 'annex')
  assert.equal(s.world!.nations['ardune']!.free, false)
  assert.equal(s.world!.nations['ardune']!.ruler, HOME)
  assert.ok(!s.world!.assembly.members.includes('ardune'))
  // An annexed nation no longer comes to the desk.
  assert.ok(!planWorld(s, content).nations.some((p) => p.nation === 'ardune'))
})

test('the Assembly sets its motion a week ahead, asks the player for a vote, and sits', () => {
  let s = fresh(19)
  const sitting = s.world!.assembly.next
  s = days(s, sitting - 7 - s.day)
  assert.equal(s.day, sitting - 7)
  s = days(s, 1)
  const motion = s.world!.assembly.motion!
  assert.ok(motion, 'a motion is set the week before')
  const vote = openMatters(s).find((m) => m.kind === 'vote')!
  assert.ok(vote)
  s = decideMatter(s, content, vote.id, 'aye')
  assert.equal(s.world!.assembly.motion!.votes![HOME], 'aye')
  s = days(s, 7)
  const sat = s.world!.assembly.past.find((m) => m.id === motion.id)!
  assert.ok(sat, 'the motion was sat on')
  assert.equal(sat.votes![HOME], 'aye')
  assert.equal(typeof sat.passed, 'boolean')
  assert.ok(s.world!.assembly.next > sitting)
})

test('a matter nobody decides lapses to its lapse option after a week', () => {
  let s = fresh(23)
  s.world!.matters.push({ id: 'matter-x', kind: 'aid', day: s.day, expires: s.day + 7, subject: 'amaranth', vars: { need: 'a flood' } })
  const standing = s.neighbours['amaranth']!
  s = days(s, 14)
  const m = s.world!.matters.find((x) => x.id === 'matter-x')!
  assert.equal(m.decided?.option, 'refuse')
  assert.ok(s.timeline.some((e) => e.text?.startsWith('No decision was taken in time.')))
  assert.ok(s.neighbours['amaranth']! < standing + 1)
})

test('the player acts from the World page within the rules', () => {
  let s = fresh(29)
  assert.match(forbidden(s, content, { war: 'lunes' })!, /only go to war with a nation on its border/)
  assert.equal(forbidden(s, content, { war: 'eskerland' }), null)
  s.neighbours['velsa'] = 80
  s = worldAct(s, content, { pact: 'velsa' })
  assert.ok(allies(s, HOME).includes('velsa'))
  assert.ok(importantNations(s).includes('velsa'))
  const strength = homeStrength(s)
  s = worldAct(s, content, { mobilise: true })
  assert.ok(homeStrength(s) > strength)
  s = worldAct(s, content, { assembly: 'leave' })
  assert.ok(!s.world!.assembly.members.includes(HOME))
  assert.throws(() => worldAct(s, content, { assembly: 'leave' }), /Not a member/)
})

test('the same seed makes the same world', () => {
  const a = days(fresh(31), 70)
  const b = days(fresh(31), 70)
  assert.deepEqual(a.world, b.world)
})

test('a save with a world loads, and a damaged world is refused', () => {
  const s = days(fresh(37), 30)
  const back = deserialize(serialize(s))
  assert.deepEqual(back.world, s.world)
  const broken = JSON.parse(serialize(s))
  broken.world.nations.velsa.strength = 400
  assert.throws(() => deserialize(JSON.stringify(broken)), /world is missing or malformed/)
  const old = JSON.parse(serialize(s))
  old.version = 2
  delete old.world
  assert.equal(deserialize(JSON.stringify(old)).version, 3)
})

test('war comes from feelings: a weak nation in a fury may still attack a stronger one', () => {
  const s = fresh(41)
  const w = s.world!
  w.pacts = []
  // Gorsk, poor and quick to anger, hates rich Brennholt next door, which is far stronger.
  w.nations['gorsk']!.relations['brennholt'] = -95
  w.nations['brennholt']!.relations['gorsk'] = -95
  w.nations['gorsk']!.strength = 30
  w.nations['brennholt']!.strength = 80
  const gorsk = content.neighbours.find((n) => n.id === 'gorsk')!
  const grudge = grievances(s, content, gorsk, 'brennholt')
  assert.ok(grudge.reasons.includes('their wealth would be better spent by us'))
  assert.ok(grudge.reasons.includes('they have wronged us too often'))
  const plan = planWorld(s, content).nations.find((p) => p.nation === 'gorsk')!
  const war = plan.moves.find((m) => m.id === 'war:brennholt')
  assert.ok(war, 'the war is on the table even against the odds')
  assert.match(war.because, /whatever the odds/)
  // An autocrat resents a free neighbour's government; a free nation thinks less of a junta.
  assert.equal(regimeOf(s, content, 'kessmark'), 'autocratic')
  assert.equal(regimeOf(s, content, 'velsa'), 'free')
})
