import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { deserialize } from '@diplomat/engine'
import { harness, IDENTITY, type Harness } from './helpers.ts'

let h: Harness
before(async () => {
  h = await harness()
})
after(async () => {
  await h.close()
})

test('in found mode the AI executive runs the nation for three days', async () => {
  const made = await h.post('/api/nations', { identity: { ...IDENTITY, name: 'Autoland' }, answers: {}, form: 'commonwealth', mode: 'found', founder: { name: 'Aegis', title: 'Founder' } })
  assert.equal(made.status, 201, made.json.error)
  const id = made.json.id
  const day = deserialize(made.json.nation.state).day
  const r = await h.post(`/api/nations/${id}/run`, { days: 3 })
  assert.equal(r.status, 200, r.json.error)
  assert.equal(deserialize(r.json.nation.state).day, day + 3)
  assert.ok(r.json.entries.some((e: any) => e.kind === 'decision'), 'the executive decided')
  const papers = await h.get(`/api/nations/${id}/archive?series=papers`)
  assert.ok(papers.json.documents.some((d: any) => d.kind === 'decision'), 'the executive wrote its papers')
  const almanac = await h.get(`/api/nations/${id}/archive?series=almanac`)
  assert.equal(almanac.json.total, 3)
  const petitions = await h.get(`/api/nations/${id}/archive?series=petition`)
  assert.ok(petitions.json.total >= 3)
  assert.equal((await h.post(`/api/nations/${id}/run`, { days: 8 })).status, 400)
})

test('run is refused in govern mode, and the mode can be switched', async () => {
  const made = await h.post('/api/nations', { identity: { ...IDENTITY, name: 'Switchland' }, answers: {}, form: 'junta', mode: 'govern', founder: { name: 'Aegis', title: 'Founder' } })
  assert.equal(made.status, 201, made.json.error)
  const id = made.json.id
  assert.equal(deserialize(made.json.nation.state).term, 0)
  assert.equal((await h.post(`/api/nations/${id}/run`, { days: 1 })).status, 409)
  const m = await h.put(`/api/nations/${id}/mode`, { mode: 'found' })
  assert.equal(m.json.government.mode, 'found')
  const r = await h.post(`/api/nations/${id}/run`, { days: 1 })
  assert.equal(r.status, 200, r.json.error)
  assert.equal((await h.put(`/api/nations/${id}/mode`, { mode: 'other' })).status, 400)
})
