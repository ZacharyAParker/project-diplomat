import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { deserialize, serialize } from '@diplomat/engine'
import { harness, IDENTITY, settle, type Harness } from './helpers.ts'

let h: Harness
let token: string
let id: string

before(async () => {
  h = await harness()
  token = readFileSync(join(h.data, 'director-token'), 'utf8').trim()
  const r = await h.post('/api/nations', { identity: IDENTITY, answers: {}, form: 'commonwealth', mode: 'govern', founder: { name: 'Aegis', title: 'Founder' } })
  id = r.json.id
  await settle(h, id)
})
after(async () => {
  await h.close()
})

const tool = (name: string, args: object = {}, nation: string | null = id) =>
  h.call('POST', nation ? `/api/director/${nation}/${name}` : `/api/director/${name}`, args, { 'X-Director-Token': token })

const engineState = async () => deserialize((await h.get(`/api/nations/${id}`)).json.nation.state)

test('the Director’s endpoints need the token, and the token is never sent back', async () => {
  assert.match(token, /^[0-9a-f]{64}$/)
  assert.equal((await h.call('POST', `/api/director/${id}/nation_overview`, {})).status, 401)
  assert.equal((await h.call('POST', `/api/director/${id}/nation_overview`, {}, { 'X-Director-Token': 'x'.repeat(64) })).status, 401)
  assert.equal((await h.call('POST', `/api/director/${id}/nation_overview`, {}, { 'X-Director-Token': token, Origin: 'http://evil.example' })).status, 403)
  const list = await tool('list_nations', {}, null)
  assert.equal(list.status, 200)
  assert.ok(list.json.nations.some((n: any) => n.id === id))
  const overview = await tool('nation_overview')
  assert.equal(overview.status, 200, overview.json.error)
  assert.equal(overview.json.id, id)
  assert.ok(overview.json.indicators.liberty.value > 0)
  assert.ok(overview.json.agenda.major)
  for (const path of ['/api/status', '/api/settings', '/api/nations', `/api/nations/${id}`, `/api/nations/${id}/export`, `/api/nations/${id}/director`, `/api/nations/${id}/ooc`, `/api/nations/${id}/archive?limit=500`]) {
    const r = await h.get(path)
    assert.ok(!r.text.includes(token), `${path} leaked the token`)
  }
  for (const t of ['read_dockets', 'read_ooc_log', 'list_dilemmas', 'list_situations']) {
    const r = await tool(t)
    assert.equal(r.status, 200, `${t}: ${r.json.error}`)
    assert.ok(!r.text.includes(token))
  }
  const docket = (await tool('read_dockets')).json.dockets[0]
  assert.ok(docket.standing && docket.options.length >= 2, 'dockets come with their standing and forecasts')
  const forecast = await tool('forecast', { dilemma: docket.dilemma })
  assert.ok(forecast.json.options.some((o: any) => o.forecast.length > 0))
  assert.equal((await tool('no_such_tool')).status, 404)
})

test('every cheat refuses without the Founder’s request', async () => {
  for (const name of ['cheat_set_figures', 'cheat_call_up', 'cheat_start_crisis', 'cheat_skip_days', 'cheat_force_outcome', 'cheat_decide', 'cheat_world_event', 'cheat_amend', 'cheat_identity']) {
    const r = await tool(name, { indicators: { liberty: 10 } })
    assert.equal(r.status, 400, name)
    assert.match(r.json.error, /request/)
    const blank = await tool(name, { request: '   ', indicators: { liberty: 10 } })
    assert.equal(blank.status, 400, name)
  }
  assert.equal((await tool('read_ooc_log')).json.log.length, 0)
})

test('a quiet cheat is logged with its request, leaves no timeline entry, sets the badge and undoes exactly', async () => {
  const before = await engineState()
  const govBefore = (await h.get(`/api/nations/${id}`)).json.government
  const r = await tool('cheat_set_figures', { request: '"Put liberty at 90, please."', indicators: { liberty: 90, debt: 5 }, factions: { [Object.keys(before.factions)[0]!]: 77 }, census: { taxRate: 12 } })
  assert.equal(r.status, 200, r.json.error)
  assert.equal(r.json.n, 1)
  const after = await engineState()
  assert.equal(after.indicators.liberty, 90)
  assert.equal(after.indicators.debt, 5)
  assert.equal(after.sandbox, true)
  assert.equal(after.timeline.length, before.timeline.length, 'no timeline entry')
  const log = (await h.get(`/api/nations/${id}/ooc`)).json.log
  assert.equal(log[0].request, '"Put liberty at 90, please."')
  assert.deepEqual(log[0].changes.find((c: any) => c.target === 'indicator:liberty'), { target: 'indicator:liberty', from: before.indicators.liberty, to: 90 })
  assert.equal((await h.get(`/api/nations/${id}`)).json.government.censusBase.taxRate, 12)
  // The archive never hears of it.
  const archive = (await h.get(`/api/nations/${id}/archive?q=liberty%2090`)).json
  assert.equal(archive.total, 0)

  const undo = await h.post(`/api/nations/${id}/ooc/1/undo`, { request: 'Take it back.' })
  assert.equal(undo.status, 200, undo.json.error)
  assert.ok(undo.json.nation && undo.json.government)
  const back = await engineState()
  assert.equal(serialize(back), serialize(before), 'the state is exactly as it was')
  assert.deepEqual(undo.json.government.censusBase, govBefore.censusBase)
  const log2 = (await h.get(`/api/nations/${id}/ooc`)).json.log
  assert.equal(log2[0].action, 'undo')
  assert.equal(log2[0].undoes, 1)
  assert.equal(log2[1].undone, true)
  assert.equal((await h.post(`/api/nations/${id}/ooc/1/undo`)).status, 409)
  assert.equal((await h.post(`/api/nations/${id}/ooc/2/undo`)).status, 409, 'an undo is not undone')
  assert.equal((await h.post(`/api/nations/${id}/ooc/99/undo`)).status, 404)
})

test('a cheat reconvenes the day’s open petitions and resets the branch sessions', async () => {
  const sessions = join(h.data, 'nations', id, 'ooc', 'sessions.json')
  const { writeFileSync } = await import('node:fs')
  await settle(h, id)
  writeFileSync(sessions, JSON.stringify({ 'body:assembly': { id: '11111111-1111-4111-8111-111111111111', startedDay: 1, calls: 3, term: 'x' } }))
  const n = h.running.game.store.open(id)
  const major = n.state.agenda.major!
  const number = n.gov.dockets[major]!.number
  const sittingDoc = n.gov.dockets[major]!.sittings[0]!.document
  const r = await tool('cheat_world_event', { request: 'Make it rain gold.', headline: 'Gold falls from the sky', effects: [{ indicator: 'fiscal', by: 20, why: 'Gold.' }] })
  assert.equal(r.status, 200, r.json.error)
  assert.ok(r.json.reconvened.includes(major))
  const dockets = await settle(h, id)
  const again = dockets.find((d) => d.dilemma === major)
  assert.equal(again.number, number, 'the same petition')
  assert.notEqual(again.sittings[0].document, sittingDoc, 'the bodies sat again')
  assert.deepEqual(JSON.parse(readFileSync(sessions, 'utf8')), {}, 'every branch starts afresh')
  const state = await engineState()
  assert.ok(!state.timeline.some((e) => e.headline === 'Gold falls from the sky'))
  await h.post(`/api/nations/${id}/ooc/${r.json.n}/undo`)
})

test('call up, crisis, identity, amend, force, decide and skip are each undoable', async () => {
  const n = h.running.game.store.open(id)
  const start = serialize(n.state)
  const startInstitutions = JSON.stringify(n.gov.institutions)
  const cheats: [string, object][] = [
    ['cheat_call_up', { dilemma: 'street-cameras' }],
    ['cheat_start_crisis', { situation: (await tool('list_situations')).json.situations[0].id }],
    ['cheat_identity', { name: 'Gilded Vesland', motto: 'More gold' }],
    ['cheat_amend', { form: 'absolute-monarchy' }],
  ]
  const numbers: number[] = []
  for (const [name, args] of cheats) {
    const r = await tool(name, { request: `Do ${name}.`, ...args })
    assert.equal(r.status, 200, `${name}: ${r.json.error}`)
    numbers.push(r.json.n)
  }
  let state = await engineState()
  assert.equal(state.agenda.major, 'street-cameras')
  assert.ok(state.situation)
  assert.equal(state.identity.name, 'Gilded Vesland')
  assert.equal(h.running.game.store.open(id).gov.institutions.constitution.form, 'absolute-monarchy')
  for (const k of [...numbers].reverse()) assert.equal((await h.post(`/api/nations/${id}/ooc/${k}/undo`)).status, 200)
  assert.equal(serialize(h.running.game.store.open(id).state), start)
  assert.equal(JSON.stringify(h.running.game.store.open(id).gov.institutions), startInstitutions)

  // Force an outcome: every course barred, so the rules call it a standstill.
  await settle(h, id)
  const major = h.running.game.store.open(id).state.agenda.major!
  const courses = (await tool('forecast', { dilemma: major })).json.options.map((o: any) => o.course).filter((c: string) => c !== 'dismiss')
  const forced = await tool('cheat_force_outcome', { request: 'Bar them all.', dilemma: major, rulings: Object.fromEntries(courses.map((c: string) => [c, 'barred'])) })
  assert.equal(forced.status, 200, forced.json.error)
  assert.equal(forced.json.result.standing.standstill, true)
  const docket = (await h.get(`/api/nations/${id}/dockets`)).json.dockets.find((d: any) => d.dilemma === major)
  assert.equal(docket.status, 'ready', 'a forced docket is not reconvened')
  assert.equal(docket.standing.standstill, true)
  // Decide a barred course outright: a cheat may.
  const before = serialize(h.running.game.store.open(id).state)
  const decided = await tool('cheat_decide', { request: 'Take the first one anyway.', dilemma: major, course: courses[0], text: 'X' })
  assert.equal(decided.status, 200, decided.json.error)
  assert.equal(h.running.game.store.open(id).gov.dockets[major]!.status, 'decided')
  assert.equal((await h.post(`/api/nations/${id}/ooc/${decided.json.n}/undo`)).status, 200)
  assert.equal(serialize(h.running.game.store.open(id).state), before)
  // Skip days.
  const skip = await tool('cheat_skip_days', { request: 'Skip two days.', days: 2 })
  assert.equal(skip.status, 200, skip.json.error)
  state = await engineState()
  assert.equal(state.day, deserialize(before).day + 2)
  assert.equal(state.sandbox, true)
  assert.equal((await h.post(`/api/nations/${id}/ooc/${skip.json.n}/undo`)).status, 200)
  assert.equal(serialize(h.running.game.store.open(id).state), before)
})

test('running the government needs no request, and a Word goes in verbatim', async () => {
  const word = await tool('give_word', { text: 'The harbour stays open.\n\nSo it is said.' })
  assert.equal(word.status, 200, word.json.error)
  assert.equal(word.json.word.text, 'The harbour stays open.\n\nSo it is said.')
  await h.running.game.dockets.idle(id)
  const major = h.running.game.store.open(id).state.agenda.major!
  const convened = await tool('convene', { dilemma: major })
  assert.equal(convened.status, 200, convened.json.error)
  assert.equal(convened.json.docket.status, 'ready')
  const day = (await engineState()).day
  const run = await tool('run_nation', { days: 1 })
  assert.equal(run.status, 200, run.json.error)
  assert.equal(run.json.day, day + 1, 'the Director runs the nation in govern mode too')
  const end = await tool('end_day')
  assert.equal(end.status, 200, end.json.error)
  assert.equal(end.json.day, day + 2)
})
