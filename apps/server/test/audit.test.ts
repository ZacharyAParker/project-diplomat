// The second round of review findings, each held to.

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { availableOptions, deserialize } from '@diplomat/engine'
import { Archive, markRemoved } from '../src/archive.ts'
import { loadContent } from '../src/server.ts'
import { harness, IDENTITY, settle, type Harness } from './helpers.ts'

const content = loadContent()
const found = (h: Harness, body: object = {}) =>
  h.post('/api/nations', { identity: IDENTITY, answers: {}, form: 'commonwealth', mode: 'govern', founder: { name: 'Aegis', title: 'Founder' }, ...body })
const optionsOf = (h: Harness, id: string, dilemma: string) => availableOptions(content.dilemmas.find((d) => d.id === dilemma)!.options, h.running.game.store.open(id).state).map((o) => o.id)

test('a minor petition goes before the court even when it does not go through every body', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h)).json
    await settle(h, id)
    assert.equal(h.running.game.store.open(id).gov.institutions.constitution.rules.minorsThroughBodies, false)
    await h.post(`/api/nations/${id}/sandbox`, { callUp: 'statue' })
    const d = (await settle(h, id)).find((x) => x.dilemma === 'statue')
    assert.ok(d, 'the minor has a docket')
    assert.equal(d.status, 'ready')
    assert.ok(d.reviews.length >= 1, 'the court ruled on it')
    assert.equal(d.sittings.length, 0, 'the Assembly did not sit, as the rules say')
    // A course the court barred stays barred.
    const n = h.running.game.store.open(id)
    const [a] = optionsOf(h, id, 'statue') as [string]
    n.gov.dockets['statue'] = { ...n.gov.dockets['statue']!, standing: { ...n.gov.dockets['statue']!.standing!, barred: [a], permitted: n.gov.dockets['statue']!.standing!.permitted.filter((c) => c !== a) } }
    const r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: 'statue', course: a, text: 'X' })
    assert.equal(r.status, 409)
    // With no docket at all, nothing is decided.
    const { statue: _s, ...rest } = n.gov.dockets
    n.gov = { ...n.gov, dockets: rest }
    assert.equal((await h.post(`/api/nations/${id}/decide`, { dilemmaId: 'statue', course: a, text: 'X' })).status, 409)
  } finally {
    await h.close()
  }
})

test('a Word is good for its petition on its day only', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h)).json
    await settle(h, id)
    const major = h.running.game.store.open(id).state.agenda.major!
    // A Word given for this issue on day 1, then the issue comes round on a later day.
    let r = await h.post(`/api/nations/${id}/words`, { text: 'Take what you like.', overrules: 'statue', confirm: true })
    assert.equal(r.status, 200)
    for (const d of Object.values(h.running.game.store.open(id).gov.dockets)) void d
    await h.post(`/api/nations/${id}/end-day`)
    await h.post(`/api/nations/${id}/sandbox`, { callUp: 'statue' })
    await settle(h, id)
    const n = h.running.game.store.open(id)
    const [a] = optionsOf(h, id, 'statue') as [string]
    n.gov.dockets['statue'] = { ...n.gov.dockets['statue']!, standing: { permitted: [], barred: [a], standstill: false, explanation: 'Barred.' } }
    r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: 'statue', course: a, text: 'X' })
    assert.equal(r.status, 409, 'yesterday’s Word does not carry over')
    assert.ok(major)
  } finally {
    await h.close()
  }
})

test('in found mode the desk decides only by a Word, and switching into found mode decides what is ready', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h)).json
    await settle(h, id)
    const n = h.running.game.store.open(id)
    const major = n.state.agenda.major!
    assert.equal(n.gov.dockets[major]!.status, 'ready')
    await h.put(`/api/nations/${id}/mode`, { mode: 'found' })
    await h.running.game.dockets.idle(id)
    assert.equal(h.running.game.store.open(id).gov.dockets[major]!.status, 'decided', 'the executive took it up')
    const progress = h.running.game.store.open(id).gov.dockets[major]!.progress.join(' ')
    assert.ok(!/The The /.test(progress), progress)
    assert.match(progress, /Steward is considering/)
    // The desk, in found mode, without a Word: refused. With one: decided.
    const other = (await found(h, { identity: { ...IDENTITY, name: 'Deskland' } })).json.id
    await settle(h, other)
    await h.running.game.dockets.idle(other)
    const o = h.running.game.store.open(other)
    o.gov = { ...o.gov, mode: 'found' }
    const m = o.state.agenda.major!
    const course = optionsOf(h, other, m)[0]
    const r = await h.post(`/api/nations/${other}/decide`, { dilemmaId: m, course, text: 'X' })
    assert.equal(r.status, 409)
    assert.match(r.json.error, /found mode/)
    const w = await h.post(`/api/nations/${other}/decide`, { dilemmaId: m, course, text: 'X', word: 'Do it.' })
    assert.equal(w.status, 200, w.json.error)
  } finally {
    await h.close()
  }
})

test('changing figures, the desk or the identity in the sandbox sends the day’s petitions back to the bodies', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h)).json
    await settle(h, id)
    const major = h.running.game.store.open(id).state.agenda.major!
    const first = h.running.game.store.open(id).gov.dockets[major]!.sittings[0]!.document
    for (const body of [{ adjust: [{ indicator: 'liberty', to: 10 }] }, { crisis: content.situations[0]!.id }]) {
      const r = await h.post(`/api/nations/${id}/sandbox`, body)
      assert.equal(r.status, 200, r.json.error)
      const d = (await settle(h, id)).find((x) => x.dilemma === major)
      assert.notEqual(d.sittings[0].document, first, `${Object.keys(body)[0]} reconvened the petition`)
    }
    const before = h.running.game.store.open(id).gov.dockets[major]!.sittings[0]!.document
    await h.put(`/api/nations/${id}/identity`, { ...IDENTITY, name: 'Otherland' })
    const d = (await settle(h, id)).find((x) => x.dilemma === major)
    assert.notEqual(d.sittings[0].document, before, 'a new identity reconvened it too')
  } finally {
    await h.close()
  }
})

test('deleting a nation while its bodies sit leaves no folder behind', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h)).json
    const r = await h.call('DELETE', `/api/nations/${id}`)
    assert.equal(r.status, 200, r.json.error)
    await new Promise((ok) => setTimeout(ok, 200))
    assert.ok(!existsSync(join(h.data, 'nations', id)), 'nothing recreated the folder')
  } finally {
    await h.close()
  }
})

test('a document is indexed only once its file is written', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'diplomat-archive-'))
  try {
    const archive = new Archive(join(dir, 'archive'))
    await archive.write({ series: 'other', title: 'One', day: 1, date: 'd', issuer: 'x', kind: 'k', refs: [], body: 'b' })
    markRemoved(dir)
    await assert.rejects(archive.write({ series: 'other', title: 'Two', day: 1, date: 'd', issuer: 'x', kind: 'k', refs: [], body: 'b' }))
    assert.equal(archive.search({}).total, 1, 'the failed write is not in the index')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a nation with no legislature cannot be moved a bill', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h, { form: 'junta' })).json
    const r = await h.post(`/api/nations/${id}/bills`, { title: 'A Bill', summary: 'It does things.' })
    assert.equal(r.status, 409)
    assert.match(r.json.error, /no legislature/)
  } finally {
    await h.close()
  }
})

test('after the night, the government follows the engine’s cabinet and says so in the papers', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h)).json
    await settle(h, id)
    const n = h.running.game.store.open(id)
    const ministry = n.gov.institutions.bodies.find((b) => b.kind === 'ministry' && b.portfolio && n.state.cabinet[b.portfolio])!
    n.state = { ...n.state, cabinet: { ...n.state.cabinet, [ministry.portfolio!]: { ...n.state.cabinet[ministry.portfolio!]!, name: 'Newly Appointed' } } }
    const r = await h.post(`/api/nations/${id}/end-day`)
    assert.equal(r.status, 200, r.json.error)
    assert.equal(r.json.government.institutions.bodies.find((b: any) => b.id === ministry.id).members[0].name, 'Newly Appointed')
    const papers = (await h.get(`/api/nations/${id}/archive?series=papers`)).json.documents
    assert.ok(papers.some((d: any) => d.kind === 'renewal'))
    assert.ok(deserialize(r.json.nation.state).day > 1)
  } finally {
    await h.close()
  }
})

test('a found-mode nation imported with petitions ready has them decided', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h)).json
    await settle(h, id)
    const major = h.running.game.store.open(id).state.agenda.major!
    const file = JSON.parse((await h.get(`/api/nations/${id}/export`)).text)
    file.government.mode = 'found'
    file.id = 'imported-found'
    const r = await h.post('/api/nations/import', { text: JSON.stringify(file) })
    assert.equal(r.status, 201, r.json.error)
    await h.running.game.dockets.idle('imported-found')
    assert.equal(h.running.game.store.open('imported-found').gov.dockets[major]!.status, 'decided')
  } finally {
    await h.close()
  }
})
