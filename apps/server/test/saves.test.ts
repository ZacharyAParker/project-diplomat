import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { deserialize, endDay, newNation, serialize } from '@diplomat/engine'
import { loadContent } from '../src/server.ts'
import { snapshot } from '../src/store.ts'
import { harness, IDENTITY, type Harness } from './helpers.ts'

const content = loadContent()
let h: Harness
before(async () => {
  h = await harness()
})
after(async () => {
  await h.close()
})

test('a nation exported and imported again is the same nation, archive and all', async () => {
  const made = await h.post('/api/nations', { identity: { ...IDENTITY, name: 'Roundtrip' }, answers: {}, form: 'presidential', mode: 'found', founder: { name: 'Aegis', title: 'Founder' } })
  const id = made.json.id
  await h.post(`/api/nations/${id}/run`, { days: 2 })
  // The next morning's petition is already before the bodies; let them finish.
  await h.running.game.dockets.idle(id)
  const exported = await h.get(`/api/nations/${id}/export`)
  assert.equal(exported.status, 200)
  assert.match(String(exported.headers['content-disposition']), /attachment; filename="roundtrip-day-3\.json"/)
  const file = JSON.parse(exported.text)
  assert.equal(file.format, 2)
  assert.ok(file.state && file.government && Array.isArray(file.documents))
  const before = (await h.get(`/api/nations/${id}/archive?limit=500`)).json

  const imported = await h.post('/api/nations/import', { text: exported.text })
  assert.equal(imported.status, 201, imported.json.error)
  assert.notEqual(imported.json.id, id, 'an import never overwrites')
  assert.match(imported.json.notice, /already here/)
  assert.equal(imported.json.name, 'Roundtrip')
  const copy = imported.json.id
  const after = (await h.get(`/api/nations/${copy}/archive?limit=500`)).json
  assert.equal(after.total, before.total)
  assert.deepEqual(after.documents.map((d: any) => d.id), before.documents.map((d: any) => d.id))
  const a = (await h.get(`/api/nations/${id}`)).json
  const b = (await h.get(`/api/nations/${copy}`)).json
  assert.equal(b.nation.state, a.nation.state)
  assert.deepEqual(b.government, a.government)
  assert.deepEqual(b.nation.history, a.nation.history)
  const doc = before.documents[0]
  assert.deepEqual((await h.get(`/api/nations/${copy}/archive/${doc.id}`)).json.document, (await h.get(`/api/nations/${id}/archive/${doc.id}`)).json.document)
  // The copy plays on.
  assert.equal((await h.post(`/api/nations/${copy}/run`, { days: 1 })).status, 200)
})

test('a 0.5 save is brought over with a commonwealth government in govern mode', async () => {
  let state = newNation(content, { ...IDENTITY, name: 'Oldland' }, 42, {})
  const history = [snapshot(state, 0)]
  state = endDay(state, content)
  history.push(snapshot(state, 1))
  const save = { format: 1, id: 'oldland', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', state: serialize(state), history }
  const r = await h.post('/api/nations/import', { text: JSON.stringify(save) })
  assert.equal(r.status, 201, r.json.error)
  assert.equal(r.json.id, 'oldland')
  assert.equal(r.json.name, 'Oldland')
  assert.match(r.json.notice, /commonwealth/)
  const n = (await h.get('/api/nations/oldland')).json
  assert.equal(n.government.mode, 'govern')
  assert.equal(n.government.institutions.constitution.form, 'commonwealth')
  assert.equal(deserialize(n.nation.state).day, 2)
  assert.equal(n.nation.history.length, 2)
  assert.ok(n.census.length > 5)
  const law = (await h.get('/api/nations/oldland/archive?series=law')).json
  assert.ok(law.total >= 2)
  assert.ok(Object.keys(n.government.dockets).length >= 1, 'its petitions go to the bodies')

  assert.equal((await h.post('/api/nations/import', { text: 'not json' })).status, 400)
  assert.equal((await h.post('/api/nations/import', { text: JSON.stringify({ format: 1, id: 'x', state: '{}' }) })).status, 422)
  assert.equal((await h.post('/api/nations/import', { text: JSON.stringify({ ...save, state: serialize({ ...state, pack: { id: 'other', version: '1' } }) }) })).status, 422)
})

test('a nation deleted goes to the trash, not away', async () => {
  const made = await h.post('/api/nations', { identity: { ...IDENTITY, name: 'Gone' }, answers: {}, form: 'junta', mode: 'govern', founder: { name: 'Aegis', title: 'Founder' } })
  const id = made.json.id
  const r = await h.call('DELETE', `/api/nations/${id}`)
  assert.equal(r.status, 200, r.json.error)
  assert.equal((await h.get(`/api/nations/${id}`)).status, 404)
  assert.ok(!(await h.get('/api/nations')).json.nations.some((x: any) => x.id === id))
  assert.ok(readdirSync(join(h.data, 'trash')).some((d) => d.startsWith(`${id}-`)))
  assert.ok(!existsSync(join(h.data, 'nations', id)))
})

test('a save that cannot be read is listed with its problem', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  mkdirSync(join(h.data, 'nations', 'broken'), { recursive: true })
  writeFileSync(join(h.data, 'nations', 'broken', 'save.json'), '{"format":2}')
  const list = (await h.get('/api/nations')).json.nations
  const broken = list.find((x: any) => x.id === 'broken')
  assert.ok(broken.problem)
  assert.equal((await h.get('/api/nations/broken')).status, 422)
})
