import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ELECTION_HEADLINES,
  INDICATORS,
  INDICATOR_INFO,
  SAVE_VERSION,
  START_INDICATORS,
  TERM_DAYS,
  agendaItems,
  availableOptions,
  classify,
  dayComplete,
  daysUntilElection,
  dismiss,
  applyExternal,
  isDue,
  decide,
  decideSituation,
  deserialize,
  endDay,
  forecast,
  forecastDecision,
  holds,
  adjust,
  callUp,
  cleanName,
  startCrisis,
  forecastSituation,
  newNation,
  render,
  serialize,
  support,
  type Content,
  type Dilemma,
  type FoundingQuestion,
  type GameState,
  type Identity,
  type Option,
  type Situation,
} from '../src/index.ts'

const identity: Identity = {
  name: 'Testland',
  capital: 'Test City',
  currency: 'mark',
  demonym: 'Testlander',
  leaderTitle: 'First Minister',
  flag: { layout: 'bands', colours: ['red', 'white'] },
}

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
    pack: { id: 'test', name: 'Test Pack', version: '1.2.3' },
    founding: { questions: [] },
    neighbours: [],
    resources: [],
    treaties: [],
    classes: [],
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

test('a trait with no penalty records nothing, so the save still round trips', () => {
  const content = pack({
    traits: [
      { id: 'mild', name: 'Mild State', description: '', earn: { day: { gte: 1 } }, opposes: ['spending'], penalty: 0 },
    ],
    dilemmas: [
      dilemma('first', [option('a'), option('b')], { priority: 1 }),
      dilemma('second', [option('a', { tags: ['spending'] }), option('b')]),
    ],
  })
  const state = endDay(decide(newNation(content, identity, 1), content, 'first', 'a'), content)
  assert.deepEqual(state.traits, ['mild'])

  assert.deepEqual(forecastDecision(state, content, 'second', 'a').penalties, [])
  const after = decide(state, content, 'second', 'a')
  assert.deepEqual(after.timeline.at(-1)!.changes, [{ kind: 'indicator', target: 'living', by: 1, why: 'because' }])
  assert.deepStrictEqual(deserialize(serialize(after)), after)
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
  assert.equal(state.indicators.debt, debt + 3.3)
  assert.ok(state.indicators.fiscal > 30)
})

const questions: FoundingQuestion[] = [
  {
    id: 'origin',
    prompt: 'How did {nation} begin?',
    answers: [
      {
        id: 'uprising',
        label: 'An uprising',
        effects: [
          { indicator: 'liberty', by: 5, why: 'They marched on {capital}.' },
          { faction: 'labour', by: 4, why: 'The unions were there.' },
        ],
      },
      { id: 'treaty', label: 'A treaty', effects: [{ indicator: 'administration', by: 5, why: 'Clerks did it.' }] },
    ],
  },
  {
    id: 'tax',
    prompt: 'Who pays?',
    answers: [
      {
        id: 'rich',
        label: 'The rich',
        effects: [
          { policy: 'wealth_tax', to: true },
          { indicator: 'inequality', by: -4, why: 'Taxed.' },
        ],
      },
      { id: 'nobody', label: 'Nobody', effects: [{ indicator: 'fiscal', by: -4, why: 'Untaxed.' }] },
    ],
  },
]

test('a nation founded with no answers starts at the standard numbers, with a founding entry', () => {
  const state = newNation(pack({ founding: { questions } }), identity, 1)
  assert.deepEqual(state.indicators, START_INDICATORS)
  assert.equal(state.timeline.length, 1)
  assert.deepEqual(state.timeline[0], {
    day: 1,
    kind: 'founding',
    headline: 'Testland is founded',
    text: 'A government takes office in Test City under its first First Minister.',
    changes: [],
  })
})

test('founding answers move the starting state and are written as one entry with reasons', () => {
  const content = pack({ founding: { questions } })
  const state = newNation(content, identity, 1, { tax: 'rich', origin: 'uprising' })

  assert.equal(state.indicators.liberty, START_INDICATORS.liberty + 5)
  assert.equal(state.indicators.inequality, START_INDICATORS.inequality - 4)
  assert.equal(state.factions['labour']!.approval, 54)
  assert.equal(state.policies['wealth_tax'], true)
  assert.equal(state.timeline.length, 1)
  assert.deepEqual(state.timeline[0]!.changes, [
    { kind: 'indicator', target: 'liberty', by: 5, why: 'They marched on Test City.' },
    { kind: 'faction', target: 'labour', by: 4, why: 'The unions were there.' },
    { kind: 'indicator', target: 'inequality', by: -4, why: 'Taxed.' },
  ])
})

test('the order answers are given in does not matter, and omitted questions are skipped', () => {
  const content = pack({ founding: { questions } })
  const one = newNation(content, identity, 1, { tax: 'rich', origin: 'treaty' })
  const other = newNation(content, identity, 1, { origin: 'treaty', tax: 'rich' })
  assert.deepEqual(one, other)

  const partial = newNation(content, identity, 1, { origin: 'treaty' })
  assert.equal(partial.indicators.administration, START_INDICATORS.administration + 5)
  assert.equal(partial.indicators.inequality, START_INDICATORS.inequality)
})

test('unknown founding questions and answers are refused', () => {
  const content = pack({ founding: { questions } })
  assert.throws(() => newNation(content, identity, 1, { climate: 'wet' }), /unknown founding question climate/)
  assert.throws(() => newNation(content, identity, 1, { origin: 'meteor' }), /unknown answer meteor/)
})

test('ids that are also names on every object are treated like any other id', () => {
  const awkward: FoundingQuestion = { ...questions[0]!, id: 'constructor' }
  const content = pack({
    founding: { questions: [awkward, questions[1]!] },
    dilemmas: [dilemma('constructor', [option('a'), option('b', { when: { flag: 'constructor' } }), option('c')])],
  })
  const state = newNation(content, identity, 1)
  assert.deepEqual(state.indicators, START_INDICATORS)
  assert.equal(state.agenda.major, 'constructor')
  const offered = availableOptions(agendaItems(state, content).major!.options, state)
  assert.deepEqual(offered.map((o) => o.id), ['a', 'c'])
  assert.throws(() => decide(state, content, 'constructor', 'b'), /not an available option/)

  const founded = newNation(content, identity, 1, { constructor: 'treaty' })
  assert.equal(founded.indicators.administration, START_INDICATORS.administration + 5)
})

test('a new nation keeps its own copy of the identity it was given', () => {
  const given = structuredClone(identity)
  const state = newNation(pack(), given, 1)
  given.name = 'Changed'
  given.flag.colours.push('black')
  assert.deepEqual(state.identity, identity)
})

test('the leader macro uses the title the player chose', () => {
  const content = pack()
  assert.equal(render('The {leader} of {nation}', newNation(content, identity, 1), content), 'The First Minister of Testland')
})

test('every indicator has a name and a description', () => {
  for (const id of INDICATORS) {
    assert.ok(INDICATOR_INFO[id].name.length > 0)
    assert.ok(INDICATOR_INFO[id].description.length > 0)
  }
  assert.deepEqual(
    INDICATORS.filter((id) => INDICATOR_INFO[id].lowerIsBetter),
    ['debt', 'inequality'],
  )
})

const classes = [
  { id: 'broke', name: 'Broke', description: '{nation} owes everyone.', when: { indicator: 'debt' as const, gte: 70 } },
  { id: 'free', name: 'Free', description: 'Free.', when: { indicator: 'liberty' as const, gte: 50 } },
  { id: 'plain', name: 'Plain', description: 'Plain.' },
]

test('a nation gets the first class whose condition holds, and the last one otherwise', () => {
  const content = pack({ classes })
  const state = newNation(content, identity, 1)
  assert.equal(classify(state, content).id, 'free')

  state.indicators.debt = 80
  assert.deepEqual(classify(state, content), { id: 'broke', name: 'Broke', description: 'Testland owes everyone.' })

  state.indicators.debt = 20
  state.indicators.liberty = 10
  assert.equal(classify(state, content).id, 'plain')
  assert.throws(() => classify(state, pack()), /no class/)
})

function crisis(extra: Partial<Situation> = {}): Situation {
  const push = (id: string, by: number) => option(id, { effects: [{ situation: 'crisis', by, why: 'pushed' }] })
  return {
    id: 'crisis',
    title: 'The Crisis',
    description: 'It begins.',
    when: { day: { gte: 1 } },
    gauge: 'Level',
    start: 50,
    pressures: [{ tag: 'thirsty', by: -10 }],
    stages: [
      { title: 'One', description: '', options: [push('up', 10), push('down', -10)] },
      { title: 'Two', description: '', options: [push('up', 10), push('down', -10)] },
    ],
    outcomes: [{ headline: 'Over', text: 'Done.', effects: [] }],
    ...extra,
  }
}

function busyPack(): Content {
  const full = option('a', {
    tags: ['spending', 'thirsty'],
    effects: [
      { indicator: 'health', by: 4, why: 'Clinics opened in {capital}.' },
      { faction: 'labour', by: -6, why: 'Nobody asked them.' },
      { faction: 'nobody', by: 3, why: 'There is no such faction.' },
      { minister: 'finance', by: -5, why: 'Overruled.' },
      { policy: 'wealth_tax', to: true },
      { flag: 'done' },
    ],
    later: [
      { after: 3, headline: 'Later', effects: [{ indicator: 'living', by: 1, why: 'late' }] },
      {
        after: 4,
        when: { all: [{ flag: 'done' }, { not: { indicator: 'debt', gte: 99 } }] },
        headline: 'Later still',
        effects: [{ faction: 'labour', by: 2, why: 'later' }, { flag: 'done', clear: true }],
      },
    ],
    promise: {
      id: 'p',
      text: 'No new taxes in {nation}',
      due: 9,
      kept: { flag: 'done' },
      broken: [{ indicator: 'legitimacy', by: -5, why: 'broken' }],
    },
  })
  return pack({
    traits: [
      { id: 'frugal', name: 'Frugal State', description: '', earn: { day: { gte: 1 } }, opposes: ['spending'], penalty: 3 },
    ],
    dilemmas: [dilemma('only', [full, option('b', { effects: [{ policy: 'wealth_tax', to: false }] })])],
    situations: [crisis()],
  })
}

test('a forecast says what the decision then does', () => {
  const content = busyPack()
  const state = endDay(newNation(content, identity, 1), content)
  const chosen = agendaItems(state, content).major!.options[0]!
  const before = structuredClone(state)

  const told = forecast(chosen, state, content)
  assert.deepEqual(state, before)
  assert.deepEqual(told, {
    changes: [
      { kind: 'indicator', target: 'health', by: 4, why: 'Clinics opened in Test City.' },
      { kind: 'faction', target: 'labour', by: -6, why: 'Nobody asked them.' },
      { kind: 'minister', target: 'finance', by: -5, why: 'Overruled.' },
    ],
    penalties: [
      {
        kind: 'indicator',
        target: 'legitimacy',
        by: -3,
        why: 'Testland is known as a Frugal State. This cuts against it.',
        trait: 'frugal',
      },
    ],
    pressure: [{ kind: 'situation', target: 'crisis', by: -10, why: 'It bears on the crisis.' }],
    policies: [{ policy: 'wealth_tax', to: true }],
    hasLater: true,
    promise: { text: 'No new taxes in Testland', due: 9 },
  })

  const after = decide(state, content, 'only', 'a')
  const stripped = told.penalties.map(({ trait, ...change }) => change)
  assert.equal(typeof told.penalties[0]!.trait, 'string')
  assert.deepEqual(after.timeline.at(-1)!.changes, [...told.changes, ...stripped, ...told.pressure])
  for (const { policy, to } of told.policies) assert.equal(after.policies[policy], to)
  assert.equal(after.indicators.health, state.indicators.health + 4)
  assert.equal(after.indicators.legitimacy, state.indicators.legitimacy - 3)
  assert.equal(after.situation!.gauge, state.situation!.gauge - 10)
  assert.equal(after.pending.length > state.pending.length, told.hasLater)
  assert.equal(after.promises.at(-1)!.dueDay, state.day + told.promise!.due)
})

test('a forecast leaves out policies that would not change and promises that are not made', () => {
  const content = busyPack()
  const state = newNation(content, identity, 1)
  const told = forecast(agendaItems(state, content).major!.options[1]!, state, content)
  assert.deepEqual(told, { changes: [], penalties: [], pressure: [], policies: [], hasLater: false })
})

test('a forecast for a situation stage takes no pressure from its own tags', () => {
  const tagged = option('up', { tags: ['thirsty'], effects: [{ situation: 'crisis', by: 10, why: 'pushed' }] })
  const stages = [
    { title: 'One', description: '', options: [tagged, option('down')] },
    { title: 'Two', description: '', options: [option('up'), option('down')] },
  ]
  const content = pack({ situations: [crisis({ stages })] })
  const state = endDay(newNation(content, identity, 1), content)
  const stage = agendaItems(state, content).situation!.stage

  const told = forecast(stage.options[0]!, state, content)
  assert.deepEqual(told.pressure, [])
  const after = decideSituation(state, content, 'up')
  assert.deepEqual(after.timeline.at(-1)!.changes, told.changes)
  assert.equal(after.situation!.gauge, 60)
})

test('a forecast made from a copy of the pack says the same as one made from the pack', () => {
  const tagged = option('up', { tags: ['thirsty'], effects: [{ situation: 'crisis', by: 10, why: 'pushed' }] })
  const stages = [
    { title: 'One', description: '', options: [tagged, option('down')] },
    { title: 'Two', description: '', options: [option('up'), option('down')] },
  ]
  const content = pack({
    dilemmas: [dilemma('only', [option('a', { tags: ['thirsty'] }), option('b')])],
    situations: [crisis({ stages })],
  })
  const state = endDay(newNation(content, identity, 1), content)
  const copy = agendaItems(structuredClone(state), structuredClone(content))
  const stageTold = forecast(tagged, state, content)
  const majorTold = forecast(content.dilemmas[0]!.options[0]!, state, content)

  assert.deepEqual(stageTold.pressure, [])
  assert.equal(majorTold.pressure.length, 1)
  assert.deepEqual(forecast(copy.situation!.stage.options[0]!, state, content), stageTold)
  assert.deepEqual(forecast({ ...copy.major!.options[0]! }, state, content), majorTold)
  assert.deepEqual(forecastSituation(state, content, 'up'), stageTold)
  assert.deepEqual(forecastDecision(state, content, 'only', 'a'), majorTold)
  assert.deepEqual(decideSituation(state, content, 'up').timeline.at(-1)!.changes, stageTold.changes)
})

test('forecasting by id refuses what deciding would refuse', () => {
  const content = pack({
    dilemmas: [dilemma('only', [option('a'), option('b'), option('c', { when: { flag: 'never_set' } })])],
  })
  const state = newNation(content, identity, 1)
  assert.throws(() => forecastDecision(state, content, 'missing', 'a'), /not on today's agenda/)
  assert.throws(() => forecastDecision(state, content, 'only', 'c'), /not an available option/)
  assert.throws(() => forecastSituation(state, content, 'a'), /no situation stage is waiting/)
})

test('a copied option that could be on a dilemma or at the stage is refused, not guessed at', () => {
  const content = pack({
    dilemmas: [dilemma('only', [option('up', { tags: ['thirsty'] }), option('b')])],
    situations: [crisis()],
  })
  const state = endDay(newNation(content, identity, 1), content)
  const own = content.dilemmas[0]!.options[0]!

  assert.equal(forecast(own, state, content).pressure.length, 1)
  assert.deepEqual(forecast(content.situations[0]!.stages[0]!.options[0]!, state, content).pressure, [])
  assert.throws(() => forecast(structuredClone(own), state, content), /use forecastDecision or forecastSituation/)
})

function electionPack(labour: number, legitimacy = 0): Content {
  const effects: Option['effects'] = [
    { faction: 'labour', by: labour, why: 'x' },
    { indicator: 'legitimacy', by: legitimacy, why: 'x' },
  ]
  const promise = { id: 'p', text: 'Later', due: 60, kept: { day: { gte: 1 } }, broken: [] }
  return pack({ dilemmas: [dilemma('only', [option('a', { effects, promise }), option('b')])] })
}

function toPollingDay(content: Content): GameState {
  const state = decide(skip(newNation(content, identity, 1), content, TERM_DAYS - 1), content, 'only', 'a')
  assert.equal(state.day, TERM_DAYS)
  assert.equal(daysUntilElection(state), 0)
  return state
}

test('the days until the election count down through a term and start again', () => {
  const content = pack()
  let state = newNation(content, identity, 1)
  assert.equal(daysUntilElection(state), TERM_DAYS - 1)
  state = skip(state, content, TERM_DAYS)
  assert.equal(state.day, TERM_DAYS + 1)
  assert.equal(daysUntilElection(state), TERM_DAYS - 1)
})

test('a nation with a term of 0 holds no elections', () => {
  const content = pack()
  let state: GameState = { ...newNation(content, identity, 1), term: 0 }
  assert.equal(daysUntilElection(state), null)
  state = skip(state, content, TERM_DAYS * 2)
  assert.ok(!state.timeline.some((e) => e.kind === 'election'))
})

test('a nation with its own election day holds it then, and again a term later', () => {
  const content = pack()
  let state: GameState = { ...newNation(content, identity, 1), term: 10, electionDay: 4 }
  assert.equal(daysUntilElection(state), 3)
  state = skip(state, content, 15)
  const polls = state.timeline.filter((e) => e.kind === 'election').map((e) => e.day)
  assert.deepEqual(polls, [4, 14])
  assert.equal(state.electionDay, 24)
  assert.doesNotThrow(() => deserialize(serialize(state)))
})

test('dismissing a dilemma moves nothing and takes it off the desk', () => {
  const content = electionPack(0)
  const state = newNation(content, identity, 1)
  const after = dismiss(state, content, 'only')
  assert.equal(after.agenda.major, null)
  assert.deepEqual(after.indicators, state.indicators)
  assert.equal(after.answered['only'], 1)
  assert.match(after.timeline.at(-1)!.headline, /dismissed/)
})

test('an outside change is applied and recorded with its reasons, and nothing else gets in', () => {
  const content = pack()
  const state = newNation(content, identity, 1)
  const after = applyExternal(state, content, 'event', 'A storm', [
    { indicator: 'health', by: -2, why: 'The storm.' },
    { identity: 'capital', to: 'Elsewhere' },
  ])
  assert.equal(after.indicators.health, state.indicators.health - 2)
  assert.equal(after.identity.capital, state.identity.capital)
  const entry = after.timeline.at(-1)!
  assert.equal(entry.kind, 'event')
  assert.equal(entry.changes[0]!.why, 'The storm.')
})

test('a government with support of 50 or more is re-elected', () => {
  const content = electionPack(0)
  const before = toPollingDay(content)
  assert.equal(support(before), 50)
  const after = endDay(before, content)
  const entry = after.timeline.at(-1)!

  assert.equal(entry.kind, 'election')
  assert.equal(entry.day, TERM_DAYS)
  assert.equal(entry.headline, ELECTION_HEADLINES.won)
  assert.match(entry.text!, /Support stood at 50 on polling day/)
  assert.match(entry.text!, /First Minister/)
  assert.equal(after.indicators.legitimacy, before.indicators.legitimacy + 6)
  assert.equal(after.government, 1)
  assert.equal(after.promises.length, 1)
})

test('support between 43 and 50 returns the government with a reduced majority', () => {
  for (const [labour, polled] of [[-0.2, 49.9], [-14, 43]] as const) {
    const content = electionPack(labour)
    const before = toPollingDay(content)
    assert.equal(support(before), polled)
    const after = endDay(before, content)
    const entry = after.timeline.at(-1)!

    assert.equal(entry.headline, ELECTION_HEADLINES.reduced)
    assert.ok(entry.text!.includes(`Support stood at ${polled} on polling day`))
    assert.equal(after.indicators.legitimacy, before.indicators.legitimacy + 1)
    assert.equal(after.government, 1)
  }
})

test('support under 43 loses the election, which is handled like a fall', () => {
  const content = electionPack(-14.2)
  const before = toPollingDay(content)
  assert.equal(support(before), 42.9)
  const after = endDay(before, content)
  const entry = after.timeline.at(-1)!

  assert.equal(entry.kind, 'election')
  assert.equal(entry.headline, ELECTION_HEADLINES.lost)
  assert.match(entry.text!, /Support stood at 42.9 on polling day/)
  assert.equal(after.government, 2)
  assert.equal(after.indicators.legitimacy, 45)
  assert.equal(after.factions['labour']!.approval, 42.9)
  assert.deepEqual(after.promises, [])
  assert.ok('election_lost' in after.flags)
  assert.ok(!('government_fell' in after.flags))
  assert.match(entry.text!, /A new First Minister takes office in Test City/)
})

test('no election is held on a day the government collapses', () => {
  const content = electionPack(0, -50)
  const before = toPollingDay(content)
  const after = endDay(before, content)

  assert.equal(after.government, 2)
  assert.equal(after.indicators.legitimacy, 40)
  assert.equal(after.timeline.at(-1)!.kind, 'government')
  assert.ok(!after.timeline.some((e) => e.kind === 'election'))
})

test('a new nation carries the save version and the pack it was founded from', () => {
  const state = newNation(pack(), identity, 1)
  assert.equal(state.version, SAVE_VERSION)
  assert.deepEqual(state.pack, { id: 'test', version: '1.2.3' })
})

test('a save survives the round trip exactly', () => {
  const content = busyPack()
  let state = newNation(content, identity, 5)
  assert.deepEqual(deserialize(serialize(state)), state)

  state = endDay(state, content)
  state = decideSituation(decide(state, content, 'only', 'a'), content, 'up')
  assert.equal(state.pending.length, 2)
  assert.equal(state.promises.length, 1)
  assert.notEqual(state.situation, null)
  assert.deepEqual(state.pending.map((p) => 'when' in p), [false, true])
  assert.deepStrictEqual(deserialize(serialize(state)), state)
  assert.deepEqual(endDay(deserialize(serialize(state)), content), endDay(state, content))

  state = skip(state, content, TERM_DAYS)
  const back = deserialize(serialize(state))
  assert.deepStrictEqual(back, state)
  assert.equal(serialize(back), serialize(state))
  assert.deepEqual(endDay(back, content), endDay(state, content))
})

test('anything that is not a save of a supported version is refused', () => {
  const good = JSON.parse(serialize(newNation(pack(), identity, 1)))
  const save = (change: object) => JSON.stringify({ ...good, ...change })

  assert.throws(() => deserialize('not json at all'), /not a save file: it is not valid JSON/)
  assert.throws(() => deserialize('[1, 2, 3]'), /no version number/)
  assert.throws(() => deserialize('null'), /no version number/)
  assert.throws(() => deserialize('{"day": 1}'), /no version number/)
  assert.throws(() => deserialize(save({ version: 3 })), /this save is version 3, and only version 2 can be read/)
  assert.throws(() => deserialize(save({ version: '1' })), /no version number/)
  assert.throws(() => deserialize(save({ indicators: { fiscal: 50 } })), /indicators is missing or malformed/)
  assert.throws(() => deserialize(save({ timeline: 'long' })), /timeline is missing or malformed/)
  assert.throws(() => deserialize(save({ day: 0 })), /day is missing or malformed/)
  assert.throws(() => deserialize(save({ pack: undefined })), /pack is missing or malformed/)
  assert.throws(() => deserialize(save({ identity: { name: 'X' } })), /identity is missing or malformed/)
  assert.throws(() => deserialize(save({ agenda: { major: 3, minors: [], situation: false } })), /agenda is missing/)
})

test('a state shares no lists with the pack it is played from', () => {
  const content = busyPack()
  const full = content.dilemmas[0]!.options[0]!
  const state = decide(endDay(newNation(content, identity, 5), content), content, 'only', 'a')

  assert.deepEqual(state.pending[1]!.effects, full.later[1]!.effects)
  assert.notEqual(state.pending[1]!.effects, full.later[1]!.effects)
  assert.notEqual(state.pending[1]!.when, full.later[1]!.when)
  assert.notEqual(state.promises[0]!.kept, full.promise!.kept)
  assert.notEqual(state.promises[0]!.broken, full.promise!.broken)
})

test('a save with a malformed part is refused when it is read, not when it is played', () => {
  const content = busyPack()
  const state = decide(endDay(newNation(content, identity, 5), content), content, 'only', 'a')
  const good = JSON.parse(serialize(state))
  const refused = (part: string, value: unknown) =>
    assert.throws(
      () => deserialize(JSON.stringify({ ...good, [part]: value })),
      new RegExp(`${part} is missing or malformed`),
      `${part}: ${JSON.stringify(value)}`,
    )
  const pending = (change: object) => [{ ...good.pending[0], ...change }]
  const promise = (change: object) => [{ ...good.promises[0], ...change }]
  const entry = (change: object) => [{ ...good.timeline[0], ...change }]
  assert.equal(good.pending.length, 2)
  assert.equal(good.promises.length, 1)

  refused('pending', pending({ effects: [null] }))
  refused('pending', pending({ effects: [5, 'a'] }))
  refused('pending', pending({ effects: [{ indicator: 'mood', by: 1, why: 'x' }] }))
  refused('pending', pending({ effects: [{ indicator: 'living', by: '1', why: 'x' }] }))
  refused('pending', pending({ effects: [{ faction: 'labour', by: 1 }] }))
  refused('pending', pending({ effects: [{ policy: 'wealth_tax', to: 'yes' }] }))
  refused('pending', pending({ effects: [{ flag: 'done', clear: 1 }] }))
  refused('pending', pending({ effects: [{}] }))
  refused('pending', pending({ when: 'x' }))
  refused('pending', pending({ when: 7 }))
  refused('pending', pending({ when: { all: [{ flag: 'done' }, null] } }))
  refused('pending', pending({ when: { not: { indicator: 'debt', gte: 'high' } } }))
  refused('pending', pending({ when: { day: 3 } }))
  refused('pending', pending({ dueDay: 2.5 }))
  refused('promises', promise({ kept: {} }))
  refused('promises', promise({ broken: [7] }))
  refused('promises', promise({ broken: [null] }))
  refused('promises', promise({ dueDay: -1 }))

  refused('indicators', { ...good.indicators, debt: 1e9 })
  refused('indicators', { ...good.indicators, legitimacy: -5 })
  refused('factions', { ...good.factions, labour: { clout: 50, approval: 101 } })
  refused('cabinet', { finance: { name: 'Ana Kovic', standing: -1 } })
  refused('situation', { ...good.situation, stage: 1.5 })
  refused('situation', { ...good.situation, stage: -1 })
  refused('situation', { ...good.situation, gauge: 140 })
  refused('government', -2.5)
  refused('government', 0)
  refused('flags', { done: 'yesterday' })
  refused('answered', { only: 0.5 })

  refused('timeline', entry({ kind: 'banana' }))
  refused('timeline', entry({ day: -3 }))
  refused('timeline', entry({ text: 42 }))
  refused('timeline', entry({ changes: [{}] }))
  refused('timeline', entry({ changes: [{ kind: 'weather', target: 'x', by: 1, why: 'x' }] }))
  refused('timeline', entry({ changes: [{ kind: 'indicator', target: 'living', by: 1 }] }))
})

test('agendaItems resolves the day into dilemmas and the waiting situation stage', () => {
  const content = pack({
    dilemmas: [dilemma('big', [option('a'), option('b')]), dilemma('small', [option('a'), option('b')], { kind: 'minor' })],
    situations: [crisis({ start: 35 })],
  })
  let state = newNation(content, identity, 1)
  const first = agendaItems(state, content)
  assert.equal(first.major, content.dilemmas[0])
  assert.equal(first.situation, null)
  assert.deepEqual(first.minors.map((d) => d.id), state.agenda.minors)

  state = endDay(state, content)
  const items = agendaItems(state, content)
  assert.equal(items.situation!.situation, content.situations[0])
  assert.equal(items.situation!.stage, content.situations[0]!.stages[0])
  assert.equal(items.situation!.index, 0)
  assert.equal(items.situation!.gauge, 35)

  state = decideSituation(state, content, 'up')
  assert.equal(agendaItems(state, content).situation, null)
})

test('the day is complete once nothing is left to decide', () => {
  const content = pack({ situations: [crisis()] })
  let state = newNation(content, identity, 1)
  assert.equal(dayComplete(state), false)
  state = decide(state, content, 'only', 'a')
  assert.equal(dayComplete(state), true)

  state = endDay(state, content)
  assert.equal(dayComplete(state), false)
  assert.equal(dayComplete(decideSituation(state, content, 'down')), true)
})

test('a day with nothing to decide is legal and can be ended', () => {
  const content = pack({ dilemmas: [] })
  let state = newNation(content, identity, 1)
  assert.deepEqual(state.agenda, { major: null, minors: [], situation: false, bound: {} })
  assert.deepEqual(agendaItems(state, content), { major: null, minors: [], situation: null })
  assert.equal(dayComplete(state), true)

  state = skip(state, content, 10)
  assert.equal(state.day, 11)
  assert.equal(dayComplete(state), true)
})

test('a flag condition can ask how long ago the flag was set', () => {
  const content = pack({
    dilemmas: [
      dilemma('first', [option('a', { effects: [{ flag: 'done' }] }), option('b')], { priority: 1 }),
      dilemma('sequel', [option('a'), option('b')], { when: { flag: 'done', days: 3 } }),
    ],
  })
  let state = endDay(decide(newNation(content, identity, 1), content, 'first', 'a'), content)
  assert.equal(state.agenda.major, null)
  state = endDay(state, content)
  assert.equal(state.agenda.major, null)
  state = endDay(state, content)
  assert.equal(state.day, 4)
  assert.equal(state.agenda.major, 'sequel')
})

test('a repeating dilemma comes back after its rest and not before', () => {
  const content = pack({ dilemmas: [dilemma('routine', [option('a'), option('b')], { repeat: 7 })] })
  let state = decide(newNation(content, identity, 1), content, 'routine', 'a')
  assert.equal(isDue(content.dilemmas[0]!, state), false)
  state = skip(state, content, 6)
  assert.equal(state.day, 7)
  assert.equal(state.agenda.major, null)
  state = endDay(state, content)
  assert.equal(state.agenda.major, 'routine')
  state = endDay(decide(state, content, 'routine', 'b'), content)
  assert.equal(state.answered['routine'], 8)
  assert.equal(state.agenda.major, null)
})

test('a dilemma with no repeat never returns', () => {
  const content = pack()
  let state = decide(newNation(content, identity, 1), content, 'only', 'a')
  state = skip(state, content, 200)
  assert.equal(state.agenda.major, null)
})

function abroadPack(extra: Partial<Content> = {}): Content {
  return pack({
    neighbours: [
      {
        id: 'east',
        name: 'Eastmark',
        demonym: 'Eastmarker',
        leader: 'the Chancellor of Eastmark',
        description: '',
        standing: 10,
        needs: ['food'],
        surpluses: ['energy'],
        likes: ['green'],
        dislikes: ['hawkish'],
        pleased: '{neighbour} approves.',
        displeased: '{neighbour} disapproves.',
      },
      {
        id: 'west',
        name: 'Westmoor',
        demonym: 'Westmoorer',
        leader: 'the Doge of Westmoor',
        description: '',
        standing: -5,
        needs: ['energy'],
        surpluses: ['food'],
        likes: [],
        dislikes: [],
        pleased: 'Pleased.',
        displeased: 'Displeased.',
      },
    ],
    resources: [
      { id: 'energy', name: 'Energy', need: { policy: 'wealth_tax', is: true }, surplus: { day: { gte: 1000 } } },
      { id: 'food', name: 'Food', need: { day: { gte: 1000 } }, surplus: { day: { gte: 1 } } },
    ],
    treaties: [
      {
        id: 'gas',
        name: 'Gas Agreement',
        description: '',
        headline: 'Gas arrives from {neighbour}',
        weekly: [{ indicator: 'capacity', by: 1, why: 'Gas from {neighbour} keeps the factories running.' }],
        breaksBelow: -30,
      },
    ],
    ...extra,
  })
}

const gasOffer = (extra: Partial<Option> = {}) =>
  dilemma(
    'gas-offer',
    [
      option('sign', {
        effects: [
          { treaty: 'gas' },
          { standing: 10, why: '{neighbour} wanted a buyer.' },
          { indicator: 'fiscal', by: -2, why: 'Gas is not free.' },
        ],
        ...extra,
      }),
      option('refuse', { effects: [{ standing: -40, why: '{neighbour} took it badly.' }] }),
    ],
    { abroad: { supplies: 'energy' } },
  )

test('neighbours start at the standing the pack gives them, and resources are assessed', () => {
  const content = abroadPack()
  const state = newNation(content, identity, 1)
  assert.deepEqual(state.neighbours, { east: 10, west: -5 })
  assert.deepEqual(state.resources, { energy: 'even', food: 'surplus' })
})

test('a dilemma about another country only comes up with a neighbour that fits, and is bound to it', () => {
  const content = abroadPack({ dilemmas: [gasOffer()] })
  const state = newNation(content, identity, 1)
  assert.equal(state.agenda.major, 'gas-offer')
  assert.equal(state.agenda.bound['gas-offer'], 'east')

  const none = abroadPack({ dilemmas: [dilemma('wheat', [option('a'), option('b')], { abroad: { supplies: 'steel' } })] })
  assert.equal(newNation(none, identity, 1).agenda.major, null)
})

test('deciding acts on the bound neighbour, signs the treaty and names the neighbour in the record', () => {
  const content = abroadPack({ dilemmas: [gasOffer()] })
  const before = newNation(content, identity, 1)
  const ahead = forecastDecision(before, content, 'gas-offer', 'sign')
  const after = decide(before, content, 'gas-offer', 'sign')

  assert.equal(after.neighbours['east'], 20)
  assert.equal(after.neighbours['west'], -5)
  assert.deepEqual(after.treaties, [{ kind: 'gas', with: 'east', since: 1 }])
  const entry = after.timeline.at(-1)!
  assert.deepEqual(entry.changes[0], { kind: 'neighbour', target: 'east', by: 10, why: 'Eastmark wanted a buyer.' })
  assert.deepEqual(ahead.changes, entry.changes)
})

test('every neighbour reacts to the tags it cares about, whatever the decision was about', () => {
  const content = abroadPack({ dilemmas: [dilemma('home', [option('a', { tags: ['green', 'hawkish', 'green'] }), option('b', { tags: ['hawkish'] })])] })
  const state = newNation(content, identity, 1)
  const green = decide(state, content, 'home', 'a')
  const hawk = decide(state, content, 'home', 'b')
  assert.equal(green.neighbours['east'], 12)
  assert.equal(hawk.neighbours['east'], 8)
  assert.equal(green.neighbours['west'], -5)
  assert.match(hawk.timeline.at(-1)!.changes[1]!.why, /^Eastmark disapproves/)
})

test('a treaty pays out weekly, and the other side walks out if relations collapse', () => {
  const content = abroadPack({ dilemmas: [gasOffer()] })
  let state = decide(newNation(content, identity, 1), content, 'gas-offer', 'sign')
  const capacity = state.indicators.capacity
  state = skip(state, content, 7)
  const paid = state.timeline.find((e) => e.kind === 'treaty')!
  assert.equal(paid.headline, 'Gas arrives from Eastmark')
  assert.equal(state.treaties.length, 1)
  assert.ok(state.indicators.capacity > capacity)

  state.neighbours['east'] = -31
  state = skip(state, content, 7)
  assert.equal(state.treaties.length, 0)
  assert.equal(state.timeline.filter((e) => e.kind === 'treaty').at(-1)!.headline, 'Eastmark walks out of the gas agreement')
})

test('a treaty with an end date runs its course', () => {
  const content = abroadPack({
    dilemmas: [gasOffer({ effects: [{ treaty: 'gas', days: 7 }, { standing: 2, why: 'x' }, { indicator: 'fiscal', by: -1, why: 'x' }] })],
  })
  let state = decide(newNation(content, identity, 1), content, 'gas-offer', 'sign')
  assert.deepEqual(state.treaties, [{ kind: 'gas', with: 'east', since: 1, until: 8 }])
  state = skip(state, content, 14)
  assert.equal(state.treaties.length, 0)
  assert.ok(state.timeline.some((e) => e.headline === 'The gas agreement with Eastmark runs its course'))
})

test('resource and treaty conditions read the state', () => {
  const content = abroadPack({ dilemmas: [gasOffer()] })
  let state = newNation(content, identity, 1)
  assert.equal(holds({ resource: 'food', is: 'surplus' }, state), true)
  assert.equal(holds({ treaty: 'gas' }, state), false)
  state = decide(state, content, 'gas-offer', 'sign')
  assert.equal(holds({ treaty: 'gas' }, state), true)
})

test('a version 1 save loads with nobody abroad, and the next day fills the neighbours in', () => {
  const content = abroadPack()
  const old = JSON.parse(serialize(newNation(content, identity, 1)))
  delete old.neighbours
  delete old.treaties
  delete old.resources
  delete old.agenda.bound
  old.version = 1
  const loaded = deserialize(JSON.stringify(old))
  assert.equal(loaded.version, 2)
  assert.deepEqual(loaded.neighbours, {})
  const next = endDay(loaded, content)
  assert.deepEqual(next.neighbours, { east: 10, west: -5 })
})

const animalIssue = (): Dilemma =>
  dilemma('animal', [
    option('stag', { effects: [{ identity: 'animal', to: 'red stag' }, { indicator: 'living', by: 1, why: 'x' }] }),
    option('own', {
      custom: { field: 'animal', label: 'The national animal' },
      headline: '{nation} picks the {animal}',
    }),
  ], { when: { identity: 'animal', set: false } })

test('an identity issue names part of the nation, and stops coming once it has', () => {
  const content = pack({ dilemmas: [animalIssue()] })
  const state = newNation(content, identity, 1)
  assert.equal(state.agenda.major, 'animal')
  const after = decide(state, content, 'animal', 'stag')
  assert.equal(after.identity.animal, 'red stag')
  assert.equal(holds({ identity: 'animal', set: true }, after), true)
})

test('a write-your-own option takes the player\'s text, cleaned, and refuses an empty one', () => {
  const content = pack({ dilemmas: [animalIssue()] })
  const state = newNation(content, identity, 1)
  const named = decide(state, content, 'animal', 'own', '  Lesser\u0000   spotted‮ owl  ')
  assert.equal(named.identity.animal, 'Lesser spotted owl')
  assert.equal(named.timeline.at(-1)!.headline, 'Testland picks the Lesser spotted owl')
  assert.throws(() => decide(state, content, 'animal', 'own', ' ​ '), /animal needs a name/)
  assert.throws(() => decide(state, content, 'animal', 'own'), /animal needs a name/)
  assert.equal(cleanName('animal', 'x'.repeat(100)).length, 40)
})

test('the sandbox sets figures, records what it did and marks the nation for good', () => {
  const content = abroadPack()
  const state = newNation(content, identity, 1)
  assert.equal(state.sandbox, undefined)
  const after = adjust(state, content, [
    { indicator: 'debt', to: 90 },
    { faction: 'labour', to: 10 },
    { neighbour: 'east', to: -80 },
    { policy: 'wealth_tax', to: true },
  ])
  assert.equal(after.indicators.debt, 90)
  assert.equal(after.factions['labour']!.approval, 10)
  assert.equal(after.neighbours['east'], -80)
  assert.equal(after.policies['wealth_tax'], true)
  assert.equal(after.sandbox, true)
  const entry = after.timeline.at(-1)!
  assert.equal(entry.kind, 'sandbox')
  assert.deepEqual(entry.changes.map((c) => c.target), ['debt', 'labour', 'east'])
  assert.throws(() => adjust(state, content, [{ faction: 'nobody', to: 1 }]), /unknown faction/)
  assert.deepEqual(deserialize(serialize(after)), after)
})

test('the sandbox can call up any dilemma and start any crisis', () => {
  const content = abroadPack({
    dilemmas: [gasOffer(), dilemma('later', [option('a'), option('b')], { when: { day: { gte: 99 } } })],
    situations: [
      {
        id: 'crisis',
        title: 'The Crisis',
        description: 'It begins.',
        when: { day: { gte: 999 } },
        gauge: 'Level',
        start: 30,
        pressures: [],
        stages: [
          { title: 'One', description: '', options: [option('a'), option('b')] },
          { title: 'Two', description: '', options: [option('a'), option('b')] },
        ],
        outcomes: [{ headline: 'Over', text: 'Done.', effects: [] }],
      },
    ],
  })
  let state = newNation(content, identity, 1)
  state = callUp(state, content, 'later')
  assert.equal(state.agenda.major, 'later')
  state = startCrisis(state, content, 'crisis')
  assert.deepEqual(state.situation, { id: 'crisis', stage: 0, gauge: 30 })
  assert.equal(state.agenda.situation, true)
  assert.equal(state.sandbox, true)
  state = decide(state, content, 'later', 'a')
  assert.equal(state.answered['later'], 1)
})

test('quiet cheats change the nation, set the badge and write nothing in the record', () => {
  const content = abroadPack({ dilemmas: [gasOffer(), dilemma('later', [option('a'), option('b')], { when: { day: { gte: 99 } } })] })
  const state = newNation(content, identity, 1)
  const before = state.timeline.length
  let after = adjust(state, content, [{ indicator: 'debt', to: 90 }, { faction: 'labour', to: 10 }], { quiet: true })
  assert.equal(after.indicators.debt, 90)
  assert.equal(after.factions['labour']!.approval, 10)
  assert.equal(after.sandbox, true)
  after = callUp(after, content, 'later', { quiet: true })
  assert.equal(after.agenda.major, 'later')
  after = applyExternal(after, content, 'event', 'A storm', [{ indicator: 'health', by: -9, why: 'The storm.' }], undefined, { quiet: true })
  assert.equal(after.indicators.health, state.indicators.health - 9)
  assert.equal(after.timeline.length, before, 'no timeline entry')
  assert.deepEqual(deserialize(serialize(after)), after)
  assert.throws(() => adjust(state, content, [{ indicator: 'nonsense' as never, to: 1 }]), /unknown indicator/)
})
