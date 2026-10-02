import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  decide,
  decideSituation,
  endDay,
  newNation,
  type Content,
  type Dilemma,
  type GameState,
  type Option,
} from '../src/index.ts'

const identity = { name: 'Testland', capital: 'Test City', currency: 'mark', demonym: 'Testlander' }

function option(id: string, extra: Partial<Option> = {}): Option {
  return {
    id,
    advocate: { name: 'Someone', role: 'somebody' },
    speech: 'Do it.',
    tags: [],
    effects: [{ indicator: 'living', by: 1, why: 'because' }],
    later: [],
    headline: `${id} chosen`,
    result: 'It happened.',
    ...extra,
  }
}

function dilemma(id: string, options: Option[], extra: Partial<Dilemma> = {}): Dilemma {
  return { id, version: 1, kind: 'major', title: id, description: id, tags: [], priority: 0, weight: 1, options, ...extra }
}

function pack(extra: Partial<Content> = {}): Content {
  return {
    factions: [
      { id: 'labour', name: 'Labour', description: '', clout: 50 },
      { id: 'business', name: 'Business', description: '', clout: 50 },
    ],
    policies: [{ id: 'wealth_tax', name: 'Wealth tax', description: '', default: false }],
    traits: [],
    portfolios: [{ id: 'finance', title: 'Finance Minister' }],
    names: { given: ['Ana', 'Bram'], family: ['Kovic', 'Quist'] },
    dilemmas: [dilemma('only', [option('a'), option('b')])],
    situations: [],
    ...extra,
  }
}

function skip(state: GameState, content: Content, days: number): GameState {
  for (let i = 0; i < days; i++) state = endDay(state, content)
  return state
}

test('the same seed plays out the same way', () => {
  const content = pack({
    dilemmas: ['one', 'two', 'three', 'four'].map((id) => dilemma(id, [option('a'), option('b')])),
  })
  const run = () => {
    let state = newNation(content, identity, 7)
    for (let i = 0; i < 4; i++) {
      state = decide(state, content, state.agenda.major!, 'a')
      state = endDay(state, content)
    }
    return state
  }
  assert.deepEqual(run(), run())
})

test('a decision applies its effects and writes them into the timeline with reasons', () => {
  const content = pack({
    dilemmas: [
      dilemma('only', [
        option('a', {
          effects: [
            { indicator: 'health', by: 4, why: 'Clinics opened in {capital}.' },
            { faction: 'labour', by: -6, why: 'Nobody asked them.' },
            { policy: 'wealth_tax', to: true },
          ],
        }),
        option('b'),
      ]),
    ],
  })
  const before = newNation(content, identity, 1)
  const after = decide(before, content, 'only', 'a')

  assert.equal(after.indicators.health, before.indicators.health + 4)
  assert.equal(after.factions['labour']!.approval, 44)
  assert.equal(after.policies['wealth_tax'], true)
  assert.equal(after.agenda.major, null)
  const entry = after.timeline.at(-1)!
  assert.equal(entry.changes.length, 2)
  assert.equal(entry.changes[0]!.why, 'Clinics opened in Test City.')
})

test('a dilemma that is not on the agenda cannot be decided', () => {
  const content = pack()
  const state = newNation(content, identity, 1)
  assert.throws(() => decide(state, content, 'missing', 'a'), /not on today's agenda/)
  const decided = decide(state, content, 'only', 'a')
  assert.throws(() => decide(decided, content, 'only', 'a'), /not on today's agenda/)
})

test('an option whose condition fails is not available', () => {
  const content = pack({
    dilemmas: [dilemma('only', [option('a'), option('b'), option('c', { when: { flag: 'never_set' } })])],
  })
  const state = newNation(content, identity, 1)
  assert.throws(() => decide(state, content, 'only', 'c'), /not an available option/)
})

test('a delayed effect lands on its day and not before', () => {
  const later = [{ after: 3, headline: 'It caught up', effects: [{ indicator: 'capacity' as const, by: -5, why: 'late' }] }]
  const content = pack({ dilemmas: [dilemma('only', [option('a', { later }), option('b')])] })
  let state = decide(newNation(content, identity, 1), content, 'only', 'a')
  const start = state.indicators.capacity

  state = skip(state, content, 3)
  assert.equal(state.indicators.capacity, start)
  state = endDay(state, content)
  assert.equal(state.indicators.capacity, start - 5)
  assert.equal(state.timeline.at(-1)!.headline, 'It caught up')
})

test('a broken promise costs what it said it would', () => {
  const promise = {
    id: 'no-tax',
    text: 'No wealth tax',
    due: 2,
    kept: { policy: 'wealth_tax', is: false },
    broken: [{ indicator: 'legitimacy' as const, by: -6, why: 'They said they would not.' }],
  }
  const content = pack({
    dilemmas: [
      dilemma('pledge', [option('a', { promise }), option('b')], { priority: 1 }),
      dilemma('tax', [option('a', { effects: [{ policy: 'wealth_tax', to: true }] }), option('b')]),
    ],
  })
  let state = newNation(content, identity, 1)
  state = endDay(decide(state, content, 'pledge', 'a'), content)
  state = decide(state, content, 'tax', 'a')
  const before = state.indicators.legitimacy
  state = skip(state, content, 2)

  assert.equal(state.indicators.legitimacy, before - 6)
  assert.match(state.timeline.at(-1)!.headline, /^Promise broken/)
})

test('acting against a trait costs legitimacy', () => {
  const content = pack({
    traits: [
      {
        id: 'frugal',
        name: 'Frugal State',
        description: '',
        earn: { day: { gte: 1 } },
        opposes: ['spending'],
        penalty: 3,
      },
    ],
    dilemmas: [
      dilemma('first', [option('a'), option('b')], { priority: 1 }),
      dilemma('second', [option('a', { tags: ['spending'] }), option('b')]),
    ],
  })
  let state = newNation(content, identity, 1)
  state = endDay(decide(state, content, 'first', 'a'), content)
  assert.deepEqual(state.traits, ['frugal'])

  const before = state.indicators.legitimacy
  const spent = decide(state, content, 'second', 'a')
  const saved = decide(state, content, 'second', 'b')
  assert.equal(spent.indicators.legitimacy, before - 3)
  assert.equal(saved.indicators.legitimacy, before)
})

test('the government falls when legitimacy collapses, and the nation carries on', () => {
  const content = pack({
    dilemmas: [
      dilemma('only', [
        option('a', {
          effects: [
            { indicator: 'legitimacy', by: -50, why: 'catastrophe' },
            { faction: 'labour', by: -30, why: 'catastrophe' },
          ],
        }),
        option('b'),
      ]),
    ],
  })
  let state = decide(newNation(content, identity, 1), content, 'only', 'a')
  const cabinetBefore = state.cabinet['finance']!.name
  state = endDay(state, content)

  assert.equal(state.government, 2)
  assert.equal(state.indicators.legitimacy, 40)
  assert.equal(state.factions['labour']!.approval, 35)
  assert.ok('government_fell' in state.flags)
  assert.equal(state.timeline.at(-1)!.kind, 'government')
  assert.equal(state.day, 2)
  assert.equal(typeof cabinetBefore, 'string')
})

test('a minister with no standing left resigns and is replaced', () => {
  const content = pack({
    dilemmas: [
      dilemma('only', [option('a', { effects: [{ minister: 'finance', by: -45, why: 'overruled' }] }), option('b')]),
    ],
  })
  let state = decide(newNation(content, identity, 1), content, 'only', 'a')
  state = endDay(state, content)
  assert.equal(state.cabinet['finance']!.standing, 50)
  assert.match(state.timeline.at(-1)!.headline, /resigns$/)
})

test('a situation runs its stages, takes pressure from tagged decisions, and ends in an outcome', () => {
  const push = (by: number): Option =>
    option(by > 0 ? 'up' : 'down', { effects: [{ situation: 'crisis', by, why: 'pushed' }] })
  const content = pack({
    dilemmas: [dilemma('only', [option('a', { tags: ['thirsty'] }), option('b')])],
    situations: [
      {
        id: 'crisis',
        title: 'The Crisis',
        description: 'It begins.',
        when: { day: { gte: 1 } },
        gauge: 'Level',
        start: 50,
        pressures: [{ tag: 'thirsty', by: -10 }],
        stages: [
          { title: 'One', description: '', options: [push(10), push(-10)] },
          { title: 'Two', description: '', options: [push(10), push(-10)] },
        ],
        outcomes: [
          { gte: 60, headline: 'Good ending', text: 'Fine.', effects: [{ indicator: 'legitimacy', by: 5, why: 'handled' }] },
          { headline: 'Bad ending', text: 'Not fine.', effects: [{ indicator: 'legitimacy', by: -5, why: 'botched' }] },
        ],
      },
    ],
  })

  let state = endDay(newNation(content, identity, 1), content)
  assert.equal(state.situation?.gauge, 50)
  assert.equal(state.agenda.situation, true)

  state = decide(state, content, 'only', 'a')
  assert.equal(state.situation?.gauge, 40)
  state = endDay(decideSituation(state, content, 'up'), content)
  state = endDay(decideSituation(state, content, 'up'), content)

  assert.equal(state.situation, null)
  assert.deepEqual(state.situationsDone, ['crisis'])
  assert.equal(state.timeline.at(-1)!.headline, 'Good ending')
})

test('a week in deficit adds to the debt', () => {
  const content = pack({
    dilemmas: [dilemma('only', [option('a', { effects: [{ indicator: 'fiscal', by: -18, why: 'spent' }] }), option('b')])],
  })
  let state = decide(newNation(content, identity, 1), content, 'only', 'a')
  const debt = state.indicators.debt
  state = skip(state, content, 7)
  assert.equal(state.indicators.debt, debt + 3)
  assert.ok(state.indicators.fiscal > 30)
})
