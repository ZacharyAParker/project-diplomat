import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renewInstitutions } from '../src/renew.ts'
import { government, nation } from './fixtures.ts'

// Found in review (Meta, Antigravity): the ministries and the seats were drawn at founding
// and never followed the engine through resignations and elections.

test('a ministry follows the engine cabinet when a minister is replaced', () => {
  const state = nation(1)
  const gov = government('commonwealth', state)
  const ministry = gov.institutions.bodies.find((b) => b.kind === 'ministry')!
  const after = structuredClone(state)
  after.cabinet[ministry.portfolio!] = { name: 'Ilse Rautio', standing: 50 }
  const r = renewInstitutions(gov.institutions, after, [])
  assert.equal(r.institutions.bodies.find((b) => b.id === ministry.id)!.members[0]!.name, 'Ilse Rautio')
  assert.equal(r.changes.length, 1)
  // Nothing else moved, and the input is untouched.
  assert.notEqual(gov.institutions.bodies.find((b) => b.id === ministry.id)!.members[0]!.name, 'Ilse Rautio')
})

test('after an election the legislature is reseated by its factions, and its size holds', () => {
  const state = nation(1)
  const gov = government('commonwealth', state)
  const house = gov.institutions.bodies.find((b) => b.kind === 'legislature')!
  const after = structuredClone(state)
  const favoured = house.parties.at(-1)!.factions
  for (const id of Object.keys(after.factions)) after.factions[id]!.approval = favoured.includes(id) ? 100 : 0
  const quiet = renewInstitutions(gov.institutions, after, [])
  assert.deepEqual(quiet.institutions.bodies.find((b) => b.id === house.id)!.parties, house.parties)
  const r = renewInstitutions(gov.institutions, after, [{ day: 45, kind: 'election', headline: 'x', changes: [] }])
  const now = r.institutions.bodies.find((b) => b.id === house.id)!
  assert.equal(now.parties.reduce((s, p) => s + p.seats, 0), house.size)
  const before = house.parties.find((p) => p.id === house.parties.at(-1)!.id)!.seats
  assert.ok(now.parties.find((p) => p.id === house.parties.at(-1)!.id)!.seats > before)
  assert.ok(r.changes.some((c) => /reseated/.test(c)))
})

// Found in review (Antigravity): facts a body had to invent were thrown away.
test('invented facts join the canon once each, a few at a time, and never crowd out founding ones', async () => {
  const { withCanon } = await import('../src/pipeline.ts')
  const canon = ['The capital is Owlsreach.']
  assert.equal(withCanon(canon, []), canon)
  assert.deepEqual(withCanon(canon, ['  The Speaker  is Tarry Aldermoss. ', 'The capital is Owlsreach.']), [...canon, 'The Speaker is Tarry Aldermoss.'])
  assert.equal(withCanon(canon, Array.from({ length: 20 }, (_, i) => `Fact ${i}.`)).length, canon.length + 6)
})
