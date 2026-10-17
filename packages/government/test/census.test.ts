import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameState, IndicatorId } from '@diplomat/engine'
import { bound, spend } from '../src/bounds.ts'
import { census, censusBase, civilRights, economyRating, RIGHTS_WORDS } from '../src/census.ts'
import type { CensusBase } from '../src/types.ts'
import { content, nation } from './fixtures.ts'

const base: CensusBase = { population: 5_000_000, gdpPerHead: 30_000, taxRate: 25, crimePerHour: 4, growth: 0.0001 }

const value = (state: GameState, id: string) => census(state, base, content).find((f) => f.id === id)!.value
const at = (changes: Partial<Record<IndicatorId, number>>, day = 30): GameState => {
  const s = nation(1)
  return { ...s, day, indicators: { ...s.indicators, ...changes } }
}

function rises(id: string, indicator: IndicatorId, direction: 1 | -1 = 1) {
  let last = -Infinity
  for (const x of [0, 10, 25, 50, 75, 90, 100]) {
    const v = direction * value(at({ [indicator]: x }), id)
    assert.ok(v >= last, `${id} should ${direction > 0 ? 'rise' : 'fall'} with ${indicator} (at ${x}: ${v} after ${last})`)
    last = v
  }
}

test('the census figures move the right way with the indicators', () => {
  rises('population', 'health')
  rises('population', 'living')
  rises('gdp-per-head', 'capacity')
  rises('gdp-per-head', 'employment')
  rises('gdp-per-head', 'education')
  rises('crime', 'inequality')
  rises('crime', 'administration', -1)
  rises('crime', 'employment', -1)
  rises('unemployment', 'employment', -1)
  rises('income-spread', 'inequality')
  rises('income', 'inequality', -1)
  rises('life', 'health')
  rises('literacy', 'education')
  rises('carbon', 'environment', -1)
  rises('tax', 'fiscal')
  rises('civil-rights', 'liberty')
})

test('population grows from the base by days at neutral readings', () => {
  const neutral = { health: 50, living: 50 }
  assert.equal(value(at(neutral, 1), 'population'), 5_000_000)
  assert.ok(value(at(neutral, 100), 'population') > value(at(neutral, 10), 'population'))
  assert.ok(value(at({ health: 10, living: 10 }, 100), 'population') < 5_000_000, 'a sick and poor country shrinks')
  const gdp = census(at({}), base, content)
  const people = gdp.find((f) => f.id === 'population')!.value
  const perHead = gdp.find((f) => f.id === 'gdp-per-head')!.value
  assert.ok(Math.abs(gdp.find((f) => f.id === 'gdp')!.value - people * perHead) <= 1)
})

test('the headline ratings come from our own word ladder', () => {
  assert.equal(civilRights(0), 'Abolished')
  assert.equal(civilRights(100), 'Superb')
  assert.equal(economyRating(55), 'Fair')
  let last = -1
  for (let x = 0; x <= 100; x += 5) {
    const i = RIGHTS_WORDS.indexOf(civilRights(x) as (typeof RIGHTS_WORDS)[number])
    assert.ok(i >= last)
    last = i
  }
  const figures = census(nation(1), base, content)
  assert.ok(figures.filter((f) => f.rating).length >= 3)
  const comic = figures.filter((f) => ['forms', 'queues', 'letters', 'potholes', 'pigeons', 'tea', 'sulk'].includes(f.id))
  assert.ok(comic.length >= 6)
  assert.ok(figures.every((f) => Number.isFinite(f.value) && f.description))
  assert.deepEqual(census(nation(1), base, content), census(nation(1), base, content))
})

test('a census base comes from the founding answers and the seed', () => {
  const rich = censusBase({ livelihood: 'money', bargain: 'cradle' }, 1)
  const poor = censusBase({ livelihood: 'land', bargain: 'ladder' }, 1)
  assert.ok(rich.gdpPerHead > poor.gdpPerHead)
  assert.ok(rich.taxRate > poor.taxRate)
  assert.equal(censusBase({}, 1).taxRate, 27)
  assert.deepEqual(censusBase({}, 4), censusBase({}, 4))
  assert.ok(censusBase({}, 4).population > 0)
})

test('effects are bounded: kinds, size, daily totals, count and reasons', () => {
  const b = { perEffect: 3, perDay: 5, maxEffects: 4 }
  const out = bound(
    [
      { indicator: 'liberty', by: 9, why: 'A march.' },
      { indicator: 'liberty', by: 4, why: 'Another march.' },
      { indicator: 'health', by: -2, why: '' },
      { standing: 5, why: 'Abroad.' },
      { identity: 'capital', to: 'Elsewhere' },
      { faction: 'labour', by: -1, why: 'A strike.' },
      { policy: 'wealth_tax', to: true },
      { flag: 'storm' },
    ],
    b,
    { 'faction:labour': 4.5 },
  )
  assert.deepEqual(out.effects, [
    { indicator: 'liberty', by: 3, why: 'A march.' },
    { indicator: 'liberty', by: 2, why: 'Another march.' },
    { faction: 'labour', by: -0.5, why: 'A strike.' },
  ])
  assert.ok(out.dropped.some((d) => /no reason/.test(d)))
  assert.ok(out.dropped.some((d) => /not a kind/.test(d)))
  // Found in review: the world could set a law or a flag. Neither passes without leave.
  assert.ok(out.dropped.some((d) => /a policy this cannot set/.test(d)))
  assert.ok(out.dropped.some((d) => /a flag, which only a dilemma may set/.test(d)))
  assert.deepEqual(spend({}, out.effects), { 'indicator:liberty': 5, 'faction:labour': 0.5 })
  const full = bound([{ indicator: 'liberty', by: 1, why: 'Again.' }], b, { 'indicator:liberty': 5 })
  assert.deepEqual(full.effects, [])
  // A law may set a policy the pack defines, to a value of its own kind, and no other.
  const policies = [{ id: 'wealth_tax', name: 'Wealth tax', description: '', default: false }]
  const law = bound([{ policy: 'wealth_tax', to: true }, { policy: 'wealth_tax', to: 3 }, { policy: 'nonsense', to: true }], b, {}, { policies })
  assert.deepEqual(law.effects, [{ policy: 'wealth_tax', to: true }])
  assert.equal(law.dropped.length, 2)
})
