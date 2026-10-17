import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { agendaItems, availableOptions, deserialize } from '@diplomat/engine'
import { loadContent } from '../src/server.ts'
import { harness, IDENTITY, settle, type Harness } from './helpers.ts'

const content = loadContent()
let h: Harness
before(async () => {
  h = await harness()
})
after(async () => {
  await h.close()
})

const found = async (form: string, mode = 'govern', name = IDENTITY.name) => {
  const r = await h.post('/api/nations', { identity: { ...IDENTITY, name }, answers: { livelihood: 'industry' }, form, mode, founder: { name: 'Aegis', title: 'Founder' } })
  assert.equal(r.status, 201, r.json?.error)
  return r.json
}

const optionsOf = (dilemmaId: string, state: Parameters<typeof availableOptions>[1]) =>
  availableOptions(content.dilemmas.find((d) => d.id === dilemmaId)!.options, state).map((o) => o.id)

// Takes a course the standing allows on every petition, then ends the day, through the API.
async function playDays(id: string, days: number) {
  for (let day = 0; day < days; day++) {
    const dockets = await settle(h, id)
    for (const d of dockets) assert.equal(d.status, 'ready', d.error)
    let nation = (await h.get(`/api/nations/${id}`)).json
    let state = deserialize(nation.nation.state)
    const items = agendaItems(state, content)
    for (const dilemma of [items.major, ...items.minors].filter((x) => x !== null)) {
      const docket = nation.government.dockets[dilemma.id]
      const s = docket?.standing
      const course = s ? (s.mustTake ?? s.vetoable ?? s.permitted.find((c: string) => c !== 'dismiss') ?? 'dismiss') : optionsOf(dilemma.id, state)[0]
      const r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: dilemma.id, course, text: 'The Old Way' })
      assert.equal(r.status, 200, `${dilemma.id} ${course}: ${r.json.error}`)
      assert.ok(r.json.entry, 'an entry comes back')
      assert.ok(r.json.nation && r.json.government && r.json.census)
      nation = r.json
      state = deserialize(nation.nation.state)
      assert.equal(nation.government.dockets[dilemma.id].status, 'decided')
    }
    if (items.situation) {
      const option = availableOptions(items.situation.stage.options, state)[0]!
      const r = await h.post(`/api/nations/${id}/situation`, { optionId: option.id })
      assert.equal(r.status, 200, r.json.error)
    }
    const before = state.day
    const end = await h.post(`/api/nations/${id}/end-day`)
    assert.equal(end.status, 200, end.json.error)
    assert.ok(Array.isArray(end.json.entries))
    assert.equal(deserialize(end.json.nation.state).day, before + 1)
    assert.ok(end.json.government.worldDays.includes(before))
    assert.ok(end.json.nation.history.some((s: any) => s.day === before))
  }
}

for (const form of ['commonwealth', 'presidential', 'absolute-monarchy']) {
  test(`a ${form} is founded and governed for five days through the API`, async () => {
    const made = await found(form, 'govern', `${form} land`)
    const id = made.id
    assert.equal(made.government.institutions.constitution.form, form)
    const state = deserialize(made.nation.state)
    if (form === 'absolute-monarchy') assert.equal(state.term, 0)
    else assert.equal(state.term, undefined)
    const law = await h.get(`/api/nations/${id}/archive?series=law`)
    assert.ok(law.json.total >= 2, 'the constitution and the charter are written')
    await playDays(id, 5)
    const almanac = await h.get(`/api/nations/${id}/archive?series=almanac`)
    assert.equal(almanac.json.total, 5)
    const petitions = await h.get(`/api/nations/${id}/archive?series=petition`)
    assert.ok(petitions.json.total >= 5)
    const list = await h.get('/api/nations')
    assert.ok(list.json.nations.some((n: any) => n.id === id && n.day === 6 && n.name && n.className && n.flag))
  })
}

test('the desk enforces the standing: barred, binding, veto with reasons, dismissal', async () => {
  const { id } = await found('commonwealth', 'govern', 'Ruleland')
  await settle(h, id)
  const n = h.running.game.store.open(id)
  const major = n.state.agenda.major!
  assert.equal(n.gov.dockets[major]!.status, 'ready')
  const options = optionsOf(major, n.state)
  assert.ok(options.length >= 2)
  const [a, b] = options as [string, string]
  const rig = (standing: object) => {
    n.gov.dockets[major] = { ...n.gov.dockets[major]!, standing: { permitted: options, barred: [], standstill: false, explanation: 'Rigged for the test.', ...standing } }
  }

  rig({ permitted: options.filter((c) => c !== a), barred: [a] })
  let r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: major, course: a, text: 'X' })
  assert.equal(r.status, 409)
  assert.match(r.json.error, /barred/)
  assert.match(r.json.error, /Rigged for the test/)

  rig({ permitted: [b], mustTake: b })
  r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: major, course: a, text: 'X' })
  assert.equal(r.status, 409)
  assert.match(r.json.error, /require/)

  rig({ vetoable: a })
  r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: major, course: b, text: 'X' })
  assert.equal(r.status, 409)
  assert.match(r.json.error, /reasons/)

  r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: major, course: 'dismiss' })
  assert.equal(r.status, 409, 'dismissal is open only at a standstill')

  r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: major, course: b, text: 'X', veto: 'The cost is too high for the year.' })
  assert.equal(r.status, 200, r.json.error)
  const decided = r.json.government.dockets[major]
  assert.equal(decided.status, 'decided')
  assert.deepEqual(decided.decision.veto, { course: a, reasons: 'The cost is too high for the year.' })
  const doc = await h.get(`/api/nations/${id}/archive/${decided.document}`)
  assert.equal(doc.json.document.series, 'petition')
  assert.match(doc.json.document.body, /Veto/)
  r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: major, course: b })
  assert.equal(r.status, 409)
  const dockets = (await h.get(`/api/nations/${id}/dockets`)).json.dockets
  assert.ok(!dockets.some((d: any) => d.dilemma === major), 'decided dockets leave the list')
})

test('a standstill is dismissed, and a Word may take a barred course at a cost', async () => {
  const { id } = await found('commonwealth', 'govern', 'Wordland')
  await settle(h, id)
  let n = h.running.game.store.open(id)
  let major = n.state.agenda.major!
  let options = optionsOf(major, n.state)
  n.gov.dockets[major] = { ...n.gov.dockets[major]!, standing: { permitted: ['dismiss'], barred: options, mustTake: 'dismiss', standstill: true, explanation: 'Every option is barred.' } }
  let r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: major, course: options[0], text: 'X' })
  assert.equal(r.status, 409)
  r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: major, course: 'dismiss' })
  assert.equal(r.status, 200, r.json.error)
  assert.equal(r.json.government.dockets[major].decision.by, 'standstill')
  assert.match(r.json.entry.headline, /dismissed/)

  assert.equal((await h.post(`/api/nations/${id}/end-day`)).status, 200)
  await settle(h, id)
  n = h.running.game.store.open(id)
  major = n.state.agenda.major!
  options = optionsOf(major, n.state)
  n.gov.dockets[major] = { ...n.gov.dockets[major]!, standing: { permitted: options.slice(1), barred: [options[0]!], standstill: false, explanation: 'The Court barred it.' } }
  r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: major, course: options[0], text: 'X' })
  assert.equal(r.status, 409, 'barred without a Word')
  r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: major, course: options[0], text: 'X', word: 'Let it be done, whatever the Court says.' })
  assert.equal(r.status, 200, r.json.error)
  assert.equal(r.json.government.dockets[major].decision.by, 'word')
  assert.ok(r.json.government.words.some((w: any) => w.overrules === major && w.confirmed))
  assert.ok(r.json.entries.some((e: any) => e.kind === 'word'), 'the Word cost something')
  const after = deserialize(r.json.nation.state)
  assert.ok(after.timeline.some((e) => e.kind === 'word' && e.changes.some((c) => c.target === 'legitimacy' && c.by < 0)))
})

test('a failed docket cannot be decided until convened, and convene sends it back to the bodies', async () => {
  const { id } = await found('commonwealth', 'govern', 'Waitland')
  await settle(h, id)
  const n = h.running.game.store.open(id)
  const major = n.state.agenda.major!
  n.gov.dockets[major] = { ...n.gov.dockets[major]!, status: 'failed', error: 'the Court could not be reached' }
  let r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: major, course: 'dismiss' })
  assert.equal(r.status, 409)
  assert.match(r.json.error, /Convene/)
  const number = n.gov.dockets[major]!.number
  r = await h.post(`/api/nations/${id}/dockets/${major}/convene`)
  assert.equal(r.status, 200, r.json.error)
  const dockets = await settle(h, id)
  const again = dockets.find((d) => d.dilemma === major)
  assert.equal(again.status, 'ready')
  assert.equal(again.number, number)
  assert.ok(again.progress.length > 0)
  assert.equal((await h.post(`/api/nations/${id}/dockets/not-a-dilemma/convene`)).status, 409)
})
