import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import {
  INDICATORS,
  START_INDICATORS,
  newNation,
  type ClassDef,
  type Content,
  type Dilemma,
  type FoundingAnswer,
  type FoundingEffect,
  type Option,
} from '@diplomat/engine'
import { FOUNDING_RANGE, checkPack, loadPack, validate } from '../src/index.ts'

function option(id: string, extra: Partial<Option> = {}): Option {
  return {
    id,
    advocate: { name: 'Someone', role: 'somebody' },
    speech: 'Do it.',
    tags: [],
    effects: [
      { indicator: 'living', by: 2, why: 'good' },
      { faction: 'labour', by: -2, why: 'bad' },
    ],
    later: [],
    headline: 'Chosen',
    result: 'It happened.',
    ...extra,
  }
}

function pack(options: Option[], extra: Partial<Dilemma> = {}): Content {
  return {
    pack: { id: 'test', name: 'Test Pack', version: '0.0.1' },
    founding: { questions: [] },
    neighbours: [],
    resources: [],
    treaties: [],
    classes: [{ id: 'plain', name: 'Plain', description: 'Plain.' }],
    factions: [{ id: 'labour', name: 'Labour', description: '', clout: 100 }],
    policies: [{ id: 'wealth_tax', name: 'Wealth tax', description: '', default: false }],
    traits: [],
    portfolios: [{ id: 'finance', title: 'Finance Minister' }],
    names: { given: [], family: [] },
    dilemmas: [
      { id: 'd', version: 1, kind: 'major', title: 'T', description: 'D', tags: [], priority: 0, weight: 1, options, ...extra },
    ],
    situations: [],
  }
}

const messages = (content: Content) => validate(content).map((p) => p.message)

test('the core pack is valid', () => {
  const { content, problems } = checkPack('packs/core')
  assert.deepEqual(problems, [])
  assert.ok(content.dilemmas.length >= 30)
  assert.deepEqual({ id: content.pack.id, name: content.pack.name }, { id: 'core', name: 'The Core Pack' })
  assert.match(content.pack.version, /^\d+\.\d+\.\d+$/)
})

test('the core pack has six to eight founding questions and twelve to sixteen classes', () => {
  const { content } = checkPack('packs/core')
  const questions = content.founding.questions
  assert.ok(questions.length >= 6 && questions.length <= 8)
  for (const q of questions) assert.ok(q.answers.length >= 3 && q.answers.length <= 4)
  assert.ok(content.classes.length >= 12 && content.classes.length <= 16)
  assert.equal(content.classes.at(-1)!.when, undefined)
})

test('no way of answering the core founding questions starts an indicator outside 25 to 75', () => {
  const { content } = checkPack('packs/core')
  const identity = {
    name: 'Testland',
    capital: 'Test City',
    currency: 'mark',
    demonym: 'Testlander',
    leaderTitle: 'President',
    flag: { layout: 'plain', colours: ['green'] },
  }
  const net = (answer: FoundingAnswer, id: string) =>
    answer.effects.reduce((sum, e) => ('indicator' in e && e.indicator === id ? sum + e.by : sum), 0)
  let widest = 0
  for (const id of INDICATORS) {
    const extreme = (sign: 1 | -1) =>
      Object.fromEntries(
        content.founding.questions.map((q) => {
          const best = q.answers.reduce((a, b) => (sign * net(b, id) > sign * net(a, id) ? b : a))
          return [q.id, best.id]
        }),
      )
    const low = newNation(content, identity, 1, extreme(-1)).indicators[id]
    const high = newNation(content, identity, 1, extreme(1)).indicators[id]
    assert.ok(low >= FOUNDING_RANGE.min, `${id} can start at ${low}`)
    assert.ok(high <= FOUNDING_RANGE.max, `${id} can start at ${high}`)
    assert.ok(low <= START_INDICATORS[id] && high >= START_INDICATORS[id])
    widest = Math.max(widest, high - low)
  }
  assert.ok(widest >= 20)
})

test('a well-formed dilemma passes', () => {
  assert.deepEqual(messages(pack([option('a'), option('b')])), [])
})

test('references to things that do not exist are caught', () => {
  const found = messages(
    pack([
      option('a', {
        effects: [
          { faction: 'nobody', by: 3, why: 'x' },
          { indicator: 'living', by: -1, why: 'x' },
          { policy: 'missing', to: true },
          { minister: 'navy', by: 1, why: 'x' },
        ],
      }),
      option('b', { when: { trait: 'ghost' } }),
      option('c'),
    ]),
  )
  assert.ok(found.includes('unknown faction nobody'))
  assert.ok(found.includes('unknown policy missing'))
  assert.ok(found.includes('unknown portfolio navy'))
  assert.ok(found.includes('unknown trait ghost'))
})

test('an effect past the limit is caught, with more room for delayed ones', () => {
  const tooBig = option('a', {
    effects: [
      { indicator: 'living', by: 11, why: 'x' },
      { faction: 'labour', by: -3, why: 'x' },
    ],
  })
  assert.ok(messages(pack([tooBig, option('b')])).some((m) => m.startsWith('living moves by 11')))

  const laterOk = option('a', { later: [{ after: 5, headline: 'h', effects: [{ indicator: 'living', by: 12, why: 'x' }] }] })
  assert.deepEqual(messages(pack([laterOk, option('b')])), [])
})

test('a major option must both help and hurt', () => {
  const free = option('a', { effects: [{ indicator: 'living', by: 2, why: 'x' }] })
  const cruel = option('b', { effects: [{ indicator: 'debt', by: 4, why: 'x' }] })
  const found = messages(pack([free, cruel, option('c'), option('d')]))
  assert.ok(found.includes('this option costs nothing'))
  assert.ok(found.includes('nothing good comes of this option'))

  assert.deepEqual(messages(pack([free, option('b')], { kind: 'minor' })), [])
})

test('falling debt counts as good news', () => {
  const payDown = option('a', {
    effects: [
      { indicator: 'debt', by: -5, why: 'x' },
      { faction: 'labour', by: -2, why: 'x' },
    ],
  })
  assert.deepEqual(messages(pack([payDown, option('b')])), [])
})

test('a policy set to the wrong kind of value is caught', () => {
  const wrong = 'policy wealth_tax is a boolean and cannot be set to 7'
  const numbered = option('a', { effects: [...option('a').effects, { policy: 'wealth_tax', to: 7 }] })
  assert.ok(messages(pack([numbered, option('b')])).includes(wrong))
  assert.ok(messages(founding([fair, [...fair, { policy: 'wealth_tax', to: 7 }], fair])).includes(wrong))

  const switched = option('a', { effects: [...option('a').effects, { policy: 'wealth_tax', to: true }] })
  assert.deepEqual(messages(pack([switched, option('b')])), [])
})

test('a comparison with no bounds is caught wherever it is nested', () => {
  const always = 'a comparison with no gt, gte, lt or lte is always true'
  const open = (when: Dilemma['when']) => messages(pack([option('a'), option('b')], { when }))
  assert.ok(open({ indicator: 'debt' }).includes(always))
  assert.ok(open({ faction: 'labour' }).includes(always))
  assert.ok(open({ day: {} }).includes(always))
  assert.ok(open({ all: [{ not: { any: [{ day: {} }] } }] }).includes(always))
  assert.deepEqual(open({ all: [{ indicator: 'debt', lt: 70 }, { day: { gte: 2 } }] }), [])
})

test('a flag that is checked but never set is caught', () => {
  const found = messages(pack([option('a'), option('b')], { when: { flag: 'orphan' } }))
  assert.ok(found.includes('checks flag orphan, which nothing sets'))
})

test('unknown macros are caught', () => {
  const found = messages(pack([option('a', { result: 'Blame {minister:navy} of {planet}.' }), option('b')]))
  assert.ok(found.includes('unknown macro {minister:navy}'))
  assert.ok(found.includes('unknown macro {planet}'))
})

test('a dilemma needs two options that are always there', () => {
  const found = messages(pack([option('a'), option('b', { when: { policy: 'wealth_tax', is: true } })]))
  assert.ok(found.includes('needs at least two options that are always available'))
})

function founding(answers: FoundingEffect[][], count = 2): Content {
  const questions = Array.from({ length: count }, (_, n) => ({
    id: `q${n + 1}`,
    prompt: 'How did {nation} begin?',
    answers: answers.map((effects, i) => ({ id: `answer${i}`, label: 'An answer', effects })),
  }))
  return { ...pack([option('a'), option('b')]), founding: { questions } }
}

const fair: FoundingEffect[] = [
  { indicator: 'living', by: 3, why: 'good' },
  { faction: 'labour', by: -3, why: 'bad' },
]

test('well-formed founding questions pass', () => {
  assert.deepEqual(messages(founding([fair, fair, fair])), [])
})

test('a founding answer must both help and hurt', () => {
  const found = messages(
    founding([fair, [{ indicator: 'living', by: 3, why: 'x' }], [{ indicator: 'inequality', by: 3, why: 'x' }]]),
  )
  assert.ok(found.includes('this answer costs nothing'))
  assert.ok(found.includes('nothing good comes of this answer'))
})

test('founding effects are checked for references, limits and macros', () => {
  const found = messages(
    founding([
      fair,
      [
        { faction: 'nobody', by: 2, why: 'x' },
        { policy: 'missing', to: true },
        { indicator: 'living', by: -11, why: 'Blame {planet}.' },
      ],
      fair,
    ]),
  )
  assert.ok(found.includes('unknown faction nobody'))
  assert.ok(found.includes('unknown policy missing'))
  assert.ok(found.includes('unknown macro {planet}'))
  assert.ok(found.some((m) => m.startsWith('living moves by -11')))
})

test('duplicate founding question and answer ids are caught', () => {
  const content = founding([fair, fair, fair])
  content.founding.questions[1]!.id = 'q1'
  content.founding.questions[0]!.answers[1]!.id = 'answer0'
  const found = messages(content)
  assert.ok(found.includes('duplicate founding question id'))
  assert.ok(found.includes('duplicate answer id answer0'))
})

test('founding that could start a number outside 25 to 75 is caught', () => {
  const steep = (by: number): FoundingEffect[] => [
    { indicator: 'liberty', by, why: 'x' },
    { faction: 'labour', by: -by * 1.4, why: 'x' },
  ]
  // Two questions: liberty can reach 55 + 20, which is allowed, and labour approval 50 - 28, which is not.
  const two = messages(founding([steep(10), steep(-10), fair]))
  assert.ok(!two.some((m) => m.startsWith('liberty can start')))
  assert.ok(two.includes('labour approval can start at 22; the lowest allowed is 25'))
  assert.ok(two.includes('labour approval can start at 78; the highest allowed is 75'))

  const four = messages(founding([steep(8), steep(-8), fair], 4))
  assert.ok(four.includes('liberty can start at 87; the highest allowed is 75'))
  assert.ok(four.includes('liberty can start at 23; the lowest allowed is 25'))
})

test('the leader macro is known', () => {
  assert.deepEqual(messages(pack([option('a', { result: 'The {leader} signs.' }), option('b')])), [])
})

test('only the last class may go without a condition, and it must', () => {
  const when = { indicator: 'debt' as const, gte: 70 }
  const classes = (list: ClassDef[]) => messages({ ...pack([option('a'), option('b')]), classes: list })
  const plain = { id: 'plain', name: 'Plain', description: 'Plain.' }

  assert.deepEqual(classes([{ id: 'broke', name: 'Broke', description: 'Broke.', when }, plain]), [])
  assert.ok(
    classes([plain, { id: 'broke', name: 'Broke', description: 'Broke.', when }]).some((m) => m.startsWith('only the last class')),
  )
  assert.ok(
    classes([{ id: 'broke', name: 'Broke', description: 'Broke.', when }]).some((m) => m.startsWith('the last class must have no when')),
  )
  assert.ok(classes([]).includes('the pack needs at least one class'))

  const open = classes([{ id: 'broke', name: 'Broke', description: 'Broke.', when: { indicator: 'debt' } }, plain])
  assert.deepEqual(open, ['a comparison with no gt, gte, lt or lte is always true'])
})

test('classes are checked for duplicate ids, references and macros', () => {
  const found = messages({
    ...pack([option('a'), option('b')]),
    classes: [
      { id: 'twin', name: 'One', description: 'In {planet}.', when: { trait: 'ghost' } },
      { id: 'twin', name: 'Two', description: 'Two.', when: { policy: 'missing', is: true } },
      { id: 'plain', name: 'Plain', description: 'Plain.' },
    ],
  })
  assert.ok(found.includes('duplicate class id'))
  assert.ok(found.includes('unknown trait ghost'))
  assert.ok(found.includes('unknown policy missing'))
  assert.ok(found.includes('unknown macro {planet}'))
})

const FOUNDING_YAML = `questions:
${['one', 'two', 'three', 'four', 'five', 'six']
  .map(
    (id) => `  - id: ${id}
    prompt: A question
    answers:
${['a', 'b', 'c']
  .map(
    (answer) => `      - id: ${answer}
        label: An answer
        effects:
          - { indicator: living, by: 1, why: good }
          - { faction: labour, by: -1, why: bad }`,
  )
  .join('\n')}`,
  )
  .join('\n')}
`

const BASE_FILES: Record<string, string> = {
  'pack.yaml': 'id: tiny\nname: Tiny Pack\nversion: 0.0.1\n',
  'cabinet.yaml':
    'portfolios:\n  - { id: finance, title: Finance Minister }\n' +
    'names:\n  given: [A, B, C, D, E, F, G, H]\n  family: [I, J, K, L, M, N, O, P]\n',
  'factions.yaml': '- { id: labour, name: Labour, description: Workers., clout: 100 }\n',
  'policies.yaml': '- { id: wealth_tax, name: Wealth tax, description: A levy. }\n',
  'traits.yaml': '[]\n',
  'founding.yaml': FOUNDING_YAML,
  'classes.yaml':
    '- { id: broke, name: Broke, description: Broke., when: { indicator: debt, gte: 70 } }\n' +
    '- { id: plain, name: Plain, description: Plain. }\n',
}

function withPack(changes: Record<string, string | null>, check: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'pack-'))
  try {
    for (const [name, body] of Object.entries({ ...BASE_FILES, ...changes })) {
      if (body === null) continue
      mkdirSync(dirname(join(dir, name)), { recursive: true })
      writeFileSync(join(dir, name), body)
    }
    check(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a small pack on disk loads with its metadata, founding questions and classes', () => {
  withPack({}, (dir) => {
    const { content, problems } = checkPack(dir)
    assert.deepEqual(problems, [])
    assert.deepEqual(content.pack, { id: 'tiny', name: 'Tiny Pack', version: '0.0.1' })
    assert.equal(content.founding.questions.length, 6)
    assert.deepEqual(content.classes.map((c) => c.id), ['broke', 'plain'])
  })
})

test('policies and traits are merged from the root file and the folder', () => {
  const files = {
    'policies/transport.yaml': '- { id: rail_public, name: Public railways, description: Trains. }\n',
    'policies/one.yaml': '{ id: sugar_tax, name: Sugar levy, description: A tax., default: true }\n',
    'traits.yaml': null,
    'traits/money.yaml': '- { id: rich, name: Rich State, description: Rich., earn: { indicator: fiscal, gte: 90 } }\n',
  }
  withPack(files, (dir) => {
    const { content, problems } = checkPack(dir)
    assert.deepEqual(problems, [])
    assert.deepEqual(content.policies.map((p) => p.id), ['wealth_tax', 'sugar_tax', 'rail_public'])
    assert.equal(content.policies[1]!.default, true)
    assert.deepEqual(content.traits.map((t) => t.id), ['rich'])
  })
})

test('the same id in two policy or trait files is a problem', () => {
  const trait = '- { id: rich, name: Rich State, description: Rich., earn: { indicator: fiscal, gte: 90 } }\n'
  const files = {
    'policies/more.yaml': '- { id: wealth_tax, name: Wealth tax again, description: A levy. }\n',
    'traits.yaml': trait,
    'traits/money.yaml': trait,
  }
  withPack(files, (dir) => {
    const found = checkPack(dir).problems.map((p) => `${p.where}: ${p.message}`)
    assert.ok(found.includes('wealth_tax: duplicate policy id'))
    assert.ok(found.includes('rich: duplicate trait id'))
  })
})

test('split files ending in .yml or in capitals are read like the rest', () => {
  const again = '- { id: wealth_tax, name: Wealth tax again, description: A levy. }\n'
  for (const name of ['policies/more.yml', 'policies/more.YAML']) {
    withPack({ [name]: again }, (dir) => {
      const { content, problems } = checkPack(dir)
      assert.equal(content.policies.length, 2)
      assert.deepEqual(problems.map((p) => `${p.where}: ${p.message}`), ['wealth_tax: duplicate policy id'])
    })
  }
})

test('missing and malformed pack files are reported, not thrown', () => {
  const files = {
    'pack.yaml': 'id: tiny\nname: Tiny Pack\nversion: first\n',
    'founding.yaml': 'questions: []\n',
    'classes.yaml': null,
    'policies.yaml': null,
  }
  withPack(files, (dir) => {
    const { content, problems } = loadPack(dir)
    const found = problems.map((p) => `${p.where}: ${p.message}`)
    assert.ok(found.includes('pack.yaml version: versions look like 0.1.0'))
    assert.ok(found.includes('classes.yaml: file is missing'))
    assert.ok(found.includes('policies.yaml: file is missing'))
    assert.ok(found.some((m) => m.startsWith('founding.yaml questions:')))
    assert.deepEqual(content.classes, [])
    assert.deepEqual(content.founding.questions, [])
  })
})

test('a founding answer may not schedule anything or touch flags and ministers', () => {
  const bad = FOUNDING_YAML.replace('- { faction: labour, by: -1, why: bad }', '- { flag: founded }')
  withPack({ 'founding.yaml': bad }, (dir) => {
    assert.ok(loadPack(dir).problems.some((p) => p.where.startsWith('founding.yaml questions.0.answers.0.effects.1')))
  })
})

const abroadParts: Pick<Content, 'neighbours' | 'resources' | 'treaties'> = {
  neighbours: [
    {
      id: 'east',
      name: 'Eastmark',
      demonym: 'Eastmarker',
      leader: 'the Chancellor',
      description: 'East.',
      standing: 0,
      needs: [],
      surpluses: ['energy'],
      likes: [],
      dislikes: [],
      pleased: '{neighbour} is pleased.',
      displeased: '{neighbour} is not.',
    },
  ],
  resources: [{ id: 'energy', name: 'Energy', need: { day: { gte: 99 } }, surplus: { day: { gte: 999 } } }],
  treaties: [],
}

test('standing and neighbour names only belong in dilemmas about another country', () => {
  const content = {
    ...pack([option('a', { effects: [{ standing: 4, why: '{neighbour} likes it.' }, { faction: 'labour', by: -2, why: 'x' }] }), option('b')]),
    ...abroadParts,
  }
  const found = messages(content)
  assert.ok(found.includes('standing can only move in a dilemma about another country'))
  assert.ok(found.includes('{neighbour} only means something in a dilemma about another country'))

  content.dilemmas[0]!.abroad = { supplies: 'energy' }
  assert.deepEqual(messages(content), [])
})

test('a dilemma about another country needs a neighbour that could fit it, and real resources', () => {
  const content = { ...pack([option('a'), option('b')], { abroad: { supplies: 'grain', wants: 'energy' } }), ...abroadParts }
  const found = messages(content)
  assert.ok(found.includes('unknown resource grain'))
  assert.ok(found.includes('no neighbour in the pack fits this dilemma'))
})

test('a resource rule cannot lean on another resource', () => {
  const content = { ...pack([option('a'), option('b')]), ...abroadParts }
  content.resources = [{ id: 'energy', name: 'Energy', need: { resource: 'energy', is: 'need' }, surplus: { day: { gte: 9 } } }]
  assert.ok(messages(content).includes('a resource rule cannot depend on another resource'))
})
