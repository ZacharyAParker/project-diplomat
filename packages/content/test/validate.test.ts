import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Content, Dilemma, Option } from '@diplomat/engine'
import { checkPack, validate } from '../src/index.ts'

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
