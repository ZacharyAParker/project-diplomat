import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { loadPack } from '../../content/src/load.ts'
import { HOME, deserialize, endDay, generateWorld, mapProblems, newNation, ownContent, serialize, worldMap, type GameState } from '../src/index.ts'

const { content } = loadPack(join(import.meta.dirname, '../../../packs/core'))
const identity = { name: 'Testland', capital: 'Testby', currency: 'mark', demonym: 'Testlander', leaderTitle: 'Premier', flag: { layout: 'plain', colours: ['#000'] } }

const SEEDS = [1, 2, 3, 17, 42, 99, 314, 2718, 65537, 123456]

test('a generated world is the same every time for the same seed', () => {
  assert.deepEqual(generateWorld(content, 42), generateWorld(content, 42))
  assert.notEqual(generateWorld(content, 42).nations[0]!.name, generateWorld(content, 43).nations[0]!.name)
})

test('every generated world has twenty nations, four to six of them on the border, and a map true to the rules', () => {
  for (const seed of SEEDS) {
    const g = generateWorld(content, seed)
    const own = ownContent({ generated: g } as GameState, content)
    assert.equal(g.nations.length, 20, `seed ${seed}`)
    assert.equal(new Set(g.nations.map((n) => n.id)).size, 20, `seed ${seed}: ids are unique`)
    assert.equal(new Set(g.nations.map((n) => n.leader)).size, 20, `seed ${seed}: leaders are unique`)
    const near = g.nations.filter((n) => n.near).length
    assert.ok(near >= 4 && near <= 6, `seed ${seed}: ${near} on the border`)
    assert.deepEqual(mapProblems(own), [], `seed ${seed}`)
    assert.ok(worldMap(own)!.regions.some((r) => r.id === HOME))
    for (const n of g.nations) {
      assert.ok(n.borders.length > 0, `seed ${seed}: ${n.name} borders someone`)
      assert.ok(!n.needs.some((r) => n.surpluses.includes(r)), `seed ${seed}: ${n.name} needs what it has`)
      assert.ok(n.pleased.includes('{nation}') && n.displeased.includes('{nation}'))
    }
  }
})

test('every dilemma about another country has a country on the border it can be about', () => {
  for (const seed of SEEDS) {
    const g = generateWorld(content, seed)
    for (const d of content.dilemmas) {
      const want = d.abroad
      if (!want) continue
      const fits = g.nations.filter((n) => (want.supplies === undefined || n.surpluses.includes(want.supplies)) && (want.wants === undefined || n.needs.includes(want.wants)))
      assert.ok(fits.length > 0, `seed ${seed}: ${d.id}`)
      if (want.supplies !== undefined || want.wants !== undefined) assert.ok(fits.some((n) => n.near), `seed ${seed}: ${d.id} on the border`)
    }
  }
})

test('a nation founded in a new world keeps it through a save', () => {
  const state = newNation(content, identity, 7, {}, { world: 'new' })
  assert.ok(state.generated)
  assert.deepEqual(Object.keys(state.neighbours).sort(), state.generated.nations.map((n) => n.id).sort())
  assert.deepEqual(deserialize(serialize(state)).generated, state.generated)
  assert.equal(newNation(content, identity, 7).generated, undefined, 'the classic continent unless asked')
})

test('a new world turns like the classic one: its nations make moves and the weeks go by', () => {
  let state = newNation(content, identity, 11, {}, { world: 'new' })
  const own = ownContent(state, content)
  for (let i = 0; i < 70; i++) state = endDay({ ...state, agenda: { major: null, minors: [], situation: false, bound: {} } }, own)
  assert.equal(Object.keys(state.world!.nations).length, 20)
  for (const id of Object.keys(state.world!.nations)) assert.ok(state.generated!.nations.some((n) => n.id === id))
})
