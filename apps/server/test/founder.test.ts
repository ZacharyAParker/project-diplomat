import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { availableOptions, deserialize } from '@diplomat/engine'
import { loadContent } from '../src/server.ts'
import { harness, IDENTITY, settle, type Harness } from './helpers.ts'

let h: Harness
let id: string
before(async () => {
  h = await harness()
  const r = await h.post('/api/nations', { identity: IDENTITY, answers: {}, form: 'commonwealth', mode: 'found', founder: { name: 'Aegis', title: 'Founder' } })
  id = r.json.id
  // Three days, so a letter has come and the order paper has moved once.
  await h.post(`/api/nations/${id}/run`, { days: 4 })
})
after(async () => {
  await h.close()
})

test('a Word is entered, laid before the bodies, and confirmed', async () => {
  let r = await h.post(`/api/nations/${id}/words`, { text: 'The harbour stays open to every ship.\n\nSo it is said.', silence: true })
  assert.equal(r.status, 200, r.json.error)
  const word = r.json.word
  assert.equal(word.confirmed, false)
  assert.equal(word.silence, true)
  const doc = await h.get(`/api/nations/${id}/archive/${word.document}`)
  assert.match(doc.json.document.body, /The harbour stays open to every ship\.\n\nSo it is said\./)
  r = await h.post(`/api/nations/${id}/words`, { number: word.number, confirm: true })
  assert.equal(r.status, 200, r.json.error)
  assert.ok(r.json.government.words.find((w: any) => w.number === word.number).confirmed)
  assert.equal((await h.post(`/api/nations/${id}/words`, { number: word.number, confirm: true })).status, 409)
  assert.equal((await h.post(`/api/nations/${id}/words`, { number: 99, confirm: true })).status, 404)
  assert.equal((await h.post(`/api/nations/${id}/words`, { text: '   ' })).status, 400)
  const cited = await h.get(`/api/nations/${id}/archive/${word.document}`)
  assert.ok(cited.json.citedBy.some((d: any) => d.kind === 'confirmation'), 'the confirmation cites the Word')
})

test('a Word that overrules a docket lets the desk take any course', async () => {
  await h.put(`/api/nations/${id}/mode`, { mode: 'govern' })
  // A new day in govern mode, so its petition waits for the desk.
  assert.equal((await h.post(`/api/nations/${id}/end-day`)).status, 200)
  await settle(h, id)
  const n = h.running.game.store.open(id)
  const major = n.state.agenda.major!
  n.gov.dockets[major] = { ...n.gov.dockets[major]!, standing: { permitted: ['dismiss'], barred: [], mustTake: 'dismiss', standstill: true, explanation: 'Rigged.' } }
  const course = availableOptions(loadContent().dilemmas.find((d) => d.id === major)!.options, n.state)[0]!.id
  assert.equal((await h.post(`/api/nations/${id}/decide`, { dilemmaId: major, course, text: 'X' })).status, 409)
  let r = await h.post(`/api/nations/${id}/words`, { text: 'Take the first course.', overrules: major })
  assert.equal((await h.post(`/api/nations/${id}/decide`, { dilemmaId: major, course, text: 'X' })).status, 409, 'not until it is confirmed')
  r = await h.post(`/api/nations/${id}/words`, { number: r.json.word.number, confirm: true })
  r = await h.post(`/api/nations/${id}/decide`, { dilemmaId: major, course, text: 'X' })
  assert.equal(r.status, 200, r.json.error)
  assert.equal(r.json.government.dockets[major].decision.by, 'word')
  await h.put(`/api/nations/${id}/mode`, { mode: 'found' })
})

test('questions are answered, left, or put off', async () => {
  const gov = (await h.get(`/api/nations/${id}`)).json.government
  const n = h.running.game.store.open(id)
  // A question of the court's, as an import or the evening would leave.
  n.gov = { ...n.gov, questions: [...gov.questions, { id: 'Q-0900', from: 'The High Court', kind: 'court', day: 1, text: 'Does Article 0 reach us?', status: 'open' }, { id: 'Q-0901', from: 'The Chronicle', kind: 'press', day: 1, text: 'Why?', status: 'open' }, { id: 'Q-0902', from: 'A citizen', kind: 'citizen', day: 1, text: 'When?', status: 'open' }] }
  let r = await h.post(`/api/nations/${id}/questions/Q-0900`, { answer: 'It reaches every branch.' })
  assert.equal(r.status, 200, r.json.error)
  const q = r.json.government.questions.find((x: any) => x.id === 'Q-0900')
  assert.equal(q.status, 'answered')
  assert.equal(q.answer, 'It reaches every branch.')
  r = await h.post(`/api/nations/${id}/questions/Q-0901`, { noAnswer: true })
  assert.equal(r.json.government.questions.find((x: any) => x.id === 'Q-0901').status, 'no-answer')
  r = await h.post(`/api/nations/${id}/questions/Q-0902`, { later: true })
  assert.equal(r.json.government.questions.find((x: any) => x.id === 'Q-0902').status, 'later')
  assert.equal((await h.post(`/api/nations/${id}/questions/Q-9999`, { later: true })).status, 404)
  assert.equal((await h.post(`/api/nations/${id}/questions/Q-0900`, {})).status, 400)
  const answers = await h.get(`/api/nations/${id}/archive?series=questions&q=every%20branch`)
  assert.equal(answers.json.total, 1)
})

test('letters arrive in the evening and are read, replied to, or left', async () => {
  const gov = (await h.get(`/api/nations/${id}`)).json.government
  assert.ok(gov.letters.length >= 2, 'letters came on day three')
  const [first, second] = gov.letters
  let r = await h.post(`/api/nations/${id}/letters/${first.id}`, { read: true })
  assert.equal(r.json.government.letters[0].status, 'read')
  r = await h.post(`/api/nations/${id}/letters/${first.id}`, { adopt: true })
  assert.equal(r.status, 200, r.json.error)
  assert.equal(r.json.government.letters[0].status, 'replied')
  assert.equal(r.json.government.letters[0].reply, first.draft)
  r = await h.post(`/api/nations/${id}/letters/${second.id}`, { reply: 'Thank you. It is in hand.' })
  assert.equal(r.json.government.letters[1].reply, 'Thank you. It is in hand.')
  if (gov.letters[2]) {
    r = await h.post(`/api/nations/${id}/letters/${gov.letters[2].id}`, { noReply: true })
    assert.equal(r.json.government.letters[2].status, 'no-reply')
  }
  assert.equal((await h.post(`/api/nations/${id}/letters/L-9999`, { read: true })).status, 404)
})

test('factbooks are written, edited and drafted', async () => {
  let r = await h.post(`/api/nations/${id}/factbooks`, { title: 'A short history', category: 'history', body: '## Beginnings\n\nIt began with a meeting.' })
  assert.equal(r.status, 200, r.json.error)
  const fb = r.json.government.factbooks.at(-1)
  assert.equal(fb.author, 'founder')
  r = await h.put(`/api/nations/${id}/factbooks/${fb.id}`, { title: 'A short history', category: 'history', body: 'It began with two meetings.' })
  assert.equal(r.json.government.factbooks.find((x: any) => x.id === fb.id).body, 'It began with two meetings.')
  assert.equal((await h.put(`/api/nations/${id}/factbooks/F-9999`, { title: 'x', category: 'history', body: 'y' })).status, 404)
  assert.equal((await h.post(`/api/nations/${id}/factbooks`, { title: 'x', category: 'nonsense', body: 'y' })).status, 400)
  const draft = await h.post(`/api/nations/${id}/factbooks/draft`, { title: 'The islands', category: 'geography', notes: 'Rocky, wet.' })
  assert.equal(draft.status, 200, draft.json.error)
  assert.ok(draft.json.title && draft.json.body)
  const docs = await h.get(`/api/nations/${id}/archive?series=factbook`)
  assert.equal(docs.json.total, 2, 'each version is its own document')
})

test('the Founder moves a bill onto the order paper', async () => {
  const r = await h.post(`/api/nations/${id}/bills`, { title: 'Harbours (Open Access) Bill', summary: 'Keeps the harbours open to all.' })
  assert.equal(r.status, 200, r.json.error)
  const bill = r.json.government.bills.at(-1)
  assert.equal(bill.title, 'Harbours (Open Access) Bill')
  assert.equal(bill.stage, 'introduced')
  assert.equal(bill.moved, 'Aegis, the Founder')
  assert.equal((await h.post(`/api/nations/${id}/bills`, { title: '' })).status, 400)
})

test('the archive is searched, filtered and paged, newest first, and documents show what cites them', async () => {
  const all = await h.get(`/api/nations/${id}/archive?limit=500`)
  assert.ok(all.json.total > 20)
  const days = all.json.documents.map((d: any) => d.day)
  assert.deepEqual(days, [...days].sort((a: number, b: number) => b - a), 'newest first')
  assert.ok(!('body' in all.json.documents[0]), 'heads only')
  const page = await h.get(`/api/nations/${id}/archive?limit=5&offset=5`)
  assert.equal(page.json.documents.length, 5)
  assert.deepEqual(page.json.documents.map((d: any) => d.id), all.json.documents.slice(5, 10).map((d: any) => d.id))
  const hansard = await h.get(`/api/nations/${id}/archive?series=hansard`)
  assert.ok(hansard.json.documents.every((d: any) => d.series === 'hansard'))
  const firstDay = await h.get(`/api/nations/${id}/archive?from=1&to=1`)
  assert.ok(firstDay.json.documents.every((d: any) => d.day === 1))
  const issuer = await h.get(`/api/nations/${id}/archive?issuer=${encodeURIComponent('the almanac')}`)
  assert.ok(issuer.json.total >= 4)
  const q = await h.get(`/api/nations/${id}/archive?q=${encodeURIComponent('Constitution')}`)
  assert.ok(q.json.documents.some((d: any) => d.kind === 'constitution'))
  assert.equal((await h.get(`/api/nations/${id}/archive?series=nonsense`)).status, 400)
  assert.equal((await h.get(`/api/nations/${id}/archive?limit=x`)).status, 400)
  const petition = all.json.documents.find((d: any) => d.series === 'petition')
  const sitting = petition.refs.find((r: string) => r.startsWith('hansard-'))
  const doc = await h.get(`/api/nations/${id}/archive/${sitting}`)
  assert.equal(doc.status, 200)
  assert.ok(doc.json.document.body.length > 0)
  assert.ok(doc.json.citedBy.some((d: any) => d.id === petition.id))
  assert.equal((await h.get(`/api/nations/${id}/archive/hansard-99999`)).status, 404)
})

test('the sandbox and the identity change the nation as 0.5 did', async () => {
  let r = await h.post(`/api/nations/${id}/sandbox`, { adjust: [{ indicator: 'liberty', to: 90 }] })
  assert.equal(r.status, 200, r.json.error)
  let state = deserialize(r.json.nation.state)
  assert.equal(state.indicators.liberty, 90)
  assert.equal(state.sandbox, true)
  r = await h.post(`/api/nations/${id}/sandbox`, { callUp: 'street-cameras' })
  assert.equal(r.status, 200, r.json.error)
  assert.ok(r.json.government.dockets['street-cameras'], 'a docket is opened for what was called up')
  const day = deserialize(r.json.nation.state).day
  r = await h.post(`/api/nations/${id}/sandbox`, { skip: 2 })
  assert.equal(deserialize(r.json.nation.state).day, day + 2)
  assert.equal((await h.post(`/api/nations/${id}/sandbox`, { adjust: [{ indicator: 'nonsense', to: 1 }] })).status, 400)
  assert.equal((await h.post(`/api/nations/${id}/sandbox`, {})).status, 400)
  r = await h.put(`/api/nations/${id}/identity`, { ...IDENTITY, name: 'New Vesland', motto: 'Onward' })
  assert.equal(r.status, 200, r.json.error)
  state = deserialize(r.json.nation.state)
  assert.equal(state.identity.name, 'New Vesland')
  assert.equal(state.identity.motto, 'Onward')
  assert.equal((await h.put(`/api/nations/${id}/identity`, { ...IDENTITY, name: '' })).status, 400)
})
