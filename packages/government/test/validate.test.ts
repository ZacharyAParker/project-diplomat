import assert from 'node:assert/strict'
import { test } from 'node:test'
import { brief, petitionBrief } from '../src/briefs.ts'
import { standIn } from '../src/standins.ts'
import { DEFAULT_BOUNDS, DISMISS, type TaskInput } from '../src/types.ts'
import { MAX_MARKDOWN, validate } from '../src/validate.ts'
import { content, government, nation } from './fixtures.ts'

const state = nation(1)
const gov = government('commonwealth', state)
const b = brief(state, gov, content, [])
const p = petitionBrief(state, content, 'street-cameras', 1)
const assembly = gov.institutions.bodies.find((x) => x.id === 'assembly')!
const court = gov.institutions.bodies.find((x) => x.id === 'court')!
const sitting: TaskInput['legislature.sitting'] = { brief: b, body: assembly, petition: p, kind: 'first', advice: [] }
const opinion: TaskInput['court.opinion'] = { brief: b, body: court, petition: p, rights: gov.institutions.constitution.rights, articles: [], precedents: [], barVotes: 4 }

const good = () => structuredClone(standIn('legislature.sitting', sitting, 1)) as unknown as Record<string, any>
const fails = (task: Parameters<typeof validate>[0], input: unknown, out: unknown, pattern: RegExp) => {
  const r = validate(task, input as never, out)
  assert.equal(r.ok, false, 'it should be refused')
  if (!r.ok) assert.ok(r.problems.some((x) => pattern.test(x)), r.problems.join('; '))
}

test('a sitting whose arithmetic does not add up is refused', () => {
  assert.equal(validate('legislature.sitting', sitting, good()).ok, true)
  const party = assembly.parties[0]!.id
  const off = good()
  off['division'].byParty[party].aye += 1
  fails('legislature.sitting', sitting, off, /seats/)
  const totals = good()
  totals['division'].aye += 1
  fails('legislature.sitting', sitting, totals, /add up to/)
  const missing = good()
  delete missing['division'].byParty[party]
  fails('legislature.sitting', sitting, missing, /every party/)
  const stranger = good()
  stranger['division'].byParty['p-nobody'] = { aye: 0, no: 0, abstain: 0 }
  fails('legislature.sitting', sitting, stranger, /not a party/)
  const fraction = good()
  fraction['division'].byParty[party].aye = 1.5
  fails('legislature.sitting', sitting, fraction, /whole number/)
})

test('a ladder must rank every course once, and a reconciliation must put a permitted course first', () => {
  const short = good()
  short['ladder'] = short['ladder'].slice(1)
  fails('legislature.sitting', sitting, short, /leaves out/)
  const twice = good()
  twice['ladder'] = [twice['ladder'][0], ...twice['ladder'].slice(0, -1)]
  fails('legislature.sitting', sitting, twice, /more than once/)
  const invented = good()
  invented['ladder'][0] = 'option-99'
  fails('legislature.sitting', sitting, invented, /not one of the courses/)
  const rec = { ...sitting, kind: 'reconciliation' as const, permitted: ['ban'] }
  const out = good()
  out['ladder'] = ['roll-out', ...out['ladder'].filter((c: string) => c !== 'roll-out')]
  fails('legislature.sitting', rec, out, /barred/)
  out['ladder'] = [DISMISS, ...out['ladder'].filter((c: string) => c !== DISMISS)]
  assert.equal(validate('legislature.sitting', rec, out).ok, true)
})

test('a court must rule on every option with every justice voting', () => {
  const ruled = () => structuredClone(standIn('court.opinion', opinion, 1)) as unknown as Record<string, any>
  assert.equal(validate('court.opinion', opinion, ruled()).ok, true)
  const absent = ruled()
  delete absent['rulings'][0].votes[court.members[0]!.id]
  fails('court.opinion', opinion, absent, /every member votes/)
  const stranger = ruled()
  stranger['rulings'][0].votes['someone'] = 'bar'
  fails('court.opinion', opinion, stranger, /not a member/)
  const partial = ruled()
  partial['rulings'] = partial['rulings'].slice(1)
  fails('court.opinion', opinion, partial, /leave out/)
  const maybe = ruled()
  maybe['rulings'][0].votes[court.members[1]!.id] = 'abstain'
  fails('court.opinion', opinion, maybe, /permit.*bar/)
  // Dismissal may be left out; it is filled in as permitted by everyone.
  const noDismiss = ruled()
  noDismiss['rulings'] = noDismiss['rulings'].filter((r: { course: string }) => r.course !== DISMISS)
  const filled = validate('court.opinion', opinion, noDismiss)
  assert.ok(filled.ok)
  if (filled.ok) {
    const d = filled.value.rulings.find((r) => r.course === DISMISS)!
    assert.ok(Object.values(d.votes).every((v) => v === 'permit'))
  }
})

test('validation tidies what it can: trims, drops unknown fields, caps Markdown, upper-case votes', () => {
  const out = good()
  out['debate'] = `   ${'x'.repeat(MAX_MARKDOWN + 500)}   `
  out['remonstrance'] = '   '
  out['secret'] = 'drop me'
  const r = validate('legislature.sitting', sitting, out)
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.value.debate.length, MAX_MARKDOWN)
    assert.equal('secret' in r.value, false)
    assert.equal(r.value.remonstrance, undefined)
  }
  const shouted = structuredClone(standIn('court.opinion', opinion, 1)) as unknown as Record<string, any>
  shouted['rulings'][0].votes[court.members[0]!.id] = ' BAR '
  const c = validate('court.opinion', opinion, shouted)
  assert.ok(c.ok)
  if (c.ok) assert.equal(c.value.rulings[0]!.votes[court.members[0]!.id], 'bar')
})

test('a council with no party breakdown may give its totals alone', () => {
  const junta = government('junta', state)
  const officers = junta.institutions.bodies.find((x) => x.id === 'officers')!
  const input = { brief: b, body: officers, petition: p, kind: 'first' as const, advice: [] }
  const out = { debate: 'The Council met.', ladder: p.options.map((o) => o.course), division: { aye: 6, no: 3, abstain: 0, byParty: {} } }
  const r = validate('council.sitting', input, out)
  assert.ok(r.ok, r.ok ? '' : r.problems.join('; '))
  fails('council.sitting', input, { ...out, division: { aye: 6, no: 2, abstain: 0, byParty: {} } }, /9 members/)
})

test('a referendum adds up to 100 and its turnout is a share', () => {
  const input: TaskInput['electorate.referendum'] = { brief: b, petition: p, mood: '' }
  const results = Object.fromEntries(p.options.map((o, i) => [o.course, i === 0 ? 70 : 10]))
  const r = validate('electorate.referendum', input, { results, turnout: 61, campaign: 'Doorsteps.' })
  assert.ok(r.ok)
  if (r.ok) assert.equal(r.value.turnout, 0.61)
  fails('electorate.referendum', input, { results: { ...results, ban: 50 }, turnout: 0.5, campaign: 'x' }, /add up to/)
  fails('electorate.referendum', input, { results, turnout: 0, campaign: 'x' }, /turnout/)
  fails('electorate.referendum', input, { results: { ...results, nonsense: 0 }, turnout: 0.5, campaign: 'x' }, /not a course/)
})

test('an executive must take a real course; the world must name its own press', () => {
  const input = { brief: b, petition: p, standing: { permitted: ['ban'], barred: [], standstill: false, explanation: '' }, sittings: [], reviews: [], advice: [], doctrine: '' }
  fails('executive.decision', input, { course: 'option-9', reasons: 'Because.', papers: 'x' }, /not one of the courses/)
  fails('executive.decision', input, { course: 'ban', reasons: '', papers: 'x' }, /reasons is empty/)
  const world = { brief: b, decisions: [], timeline: [], press: gov.institutions.press, bounds: DEFAULT_BOUNDS }
  const day = structuredClone(standIn('world.day', world, 1)) as unknown as Record<string, any>
  assert.equal(validate('world.day', world, day).ok, true)
  day['press'][0].outlet = 'The Moon Gazette'
  fails('world.day', world, day, /not one of the nation's press/)
  const effects = structuredClone(standIn('world.day', world, 1)) as unknown as Record<string, any>
  effects['effects'] = [{ indicator: 'happiness', by: 2, why: 'x' }]
  fails('world.day', world, effects, /indicator effect/)
})

test('a bill division adds up to the House', () => {
  const input = { brief: b, body: assembly, bills: [], bounds: DEFAULT_BOUNDS }
  fails('bill.sitting', input, { bills: [{ title: 'A Bill', moved: 'X', summary: 'Y', stage: 'passed', division: { reading: 'third', aye: 80, no: 70, abstain: 0 } }], hansard: 'h' }, /151 members/)
  fails('bill.sitting', input, { bills: [{ number: 4, title: 'A Bill', moved: 'X', summary: 'Y', stage: 'committee' }], hansard: 'h' }, /not a bill before/)
  fails('bill.sitting', input, { bills: [{ title: 'A Bill', moved: 'X', summary: 'Y', stage: 'enacted' }], hansard: 'h' }, /not one of/)
  assert.equal(validate('bill.sitting', input, { bills: [{ title: 'A Bill', moved: 'X', summary: 'Y', stage: 'introduced' }], hansard: 'h' }).ok, true)
})

test('a reply that is not an object is refused', () => {
  fails('factbook.draft', { brief: b, category: 'history', title: 't', notes: '' }, 'just text', /not a JSON object/)
  fails('letters.draft', { brief: b, count: 2, recent: [] }, { letters: [] }, /empty/)
})
