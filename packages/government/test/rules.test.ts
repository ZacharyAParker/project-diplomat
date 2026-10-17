import assert from 'node:assert/strict'
import { test } from 'node:test'
import { binding, carried, check, nextSteps, standing, verdictOf } from '../src/rules.ts'
import { DISMISS, type Body, type Docket, type FormId, type Institutions, type Review, type Sitting } from '../src/types.ts'
import { government, nation } from './fixtures.ts'

const OPTIONS = ['a', 'b', 'c', DISMISS]

function institutions(form: FormId): Institutions {
  return government(form, nation(1)).institutions
}

const bodyOf = (i: Institutions, id: string) => i.bodies.find((b) => b.id === id)!

function docket(extra: Partial<Docket> = {}): Docket {
  return { dilemma: 'x', day: 1, number: 1, status: 'sitting', advice: [], sittings: [], reviews: [], exchanges: [], assents: [], standing: null, progress: [], document: '', ...extra }
}

// A division with this many ayes, the parties filled in order, the rest voting no.
function divide(body: Body, aye: number) {
  let left = aye
  const byParty: Sitting['division']['byParty'] = {}
  for (const p of body.parties) {
    const a = Math.min(p.seats, left)
    left -= a
    byParty[p.id] = { aye: a, no: p.seats - a, abstain: 0 }
  }
  return { aye, no: body.size - aye, abstain: 0, byParty }
}

function sat(i: Institutions, body: string, fp: string, aye: number, kind: Sitting['kind'] = 'first'): Sitting {
  const b = bodyOf(i, body)
  const step = i.constitution.rules.steps.find((s) => s.body === body && s.role === 'recommend')!
  const division = divide(b, aye)
  return { body, kind, ladder: [fp, ...OPTIONS.filter((c) => c !== fp)], firstPreference: fp, division, carried: carried(division, step, b.size), binding: binding(division, step, b.size), document: 'hansard-00001', ai: false }
}

// bars: how many members bar each named course; the rest permit.
function ruled(i: Institutions, body: string, bars: Record<string, number>, kind: Review['kind'] = 'first'): Review {
  const b = bodyOf(i, body)
  const step = i.constitution.rules.steps.find((s) => s.body === body && s.role === 'review')!
  return {
    body,
    kind,
    rulings: OPTIONS.map((course) => {
      const votes = Object.fromEntries(b.members.map((m, k) => [m.id, k < (bars[course] ?? 0) ? ('bar' as const) : ('permit' as const)]))
      return { course, votes, verdict: verdictOf(votes, step.barVotes), articles: [], markers: [] }
    }),
    binding: step.binding !== false,
    cautions: [],
    directions: [],
    document: 'court-00001',
    ai: false,
  }
}

test('thresholds are counted against the whole body, whoever is absent', () => {
  const i = institutions('commonwealth')
  const step = i.constitution.rules.steps.find((s) => s.role === 'recommend')!
  const absent = { aye: 101, no: 0, abstain: 50, byParty: {} }
  assert.equal(binding(absent, step, 151), true)
  assert.equal(binding({ ...absent, aye: 100 }, step, 151), false)
  assert.equal(carried({ aye: 76, no: 0, abstain: 0, byParty: {} }, step, 151), true)
  assert.equal(carried({ aye: 75, no: 0, abstain: 0, byParty: {} }, step, 151), false)
  assert.equal(verdictOf({ a: 'bar', b: 'bar', c: 'permit' }, 2), 'barred')
  assert.equal(verdictOf({ a: 'bar', b: 'permit', c: 'permit' }, undefined), 'permitted')
})

test('commonwealth: 101 binds the Steward, fewer may be vetoed with reasons', () => {
  const i = institutions('commonwealth')
  const bound = standing(docket({ sittings: [sat(i, 'assembly', 'a', 101)], reviews: [ruled(i, 'court', {})] }), i, OPTIONS)
  assert.equal(bound.mustTake, 'a')
  assert.deepEqual(bound.permitted, ['a'])
  assert.match(bound.explanation, /101 of 151.*must take it/)
  assert.equal(check(bound, 'b').ok, false)

  const vetoable = standing(docket({ sittings: [sat(i, 'assembly', 'a', 100)], reviews: [ruled(i, 'court', {})] }), i, OPTIONS)
  assert.equal(vetoable.mustTake, undefined)
  assert.equal(vetoable.vetoable, 'a')
  assert.deepEqual(vetoable.permitted, ['a', 'b', 'c'])
  assert.deepEqual(check(vetoable, 'a'), { ok: true })
  assert.equal(check(vetoable, 'b').ok, false)
  assert.deepEqual(check(vetoable, 'b', { veto: 'It would damage political freedom.' }), { ok: true })
  // Dismissal is the last resort, even with reasons.
  assert.equal(check(vetoable, DISMISS, { veto: 'Too hard.' }).ok, false)
  assert.deepEqual(check(vetoable, DISMISS, { word: 'Let it lie.' }), { ok: true })

  const weak = standing(docket({ sittings: [sat(i, 'assembly', 'a', 70)], reviews: [ruled(i, 'court', {})] }), i, OPTIONS)
  assert.equal(weak.vetoable, undefined)
  assert.deepEqual(weak.permitted, ['a', 'b', 'c'])
})

test('commonwealth: a barred first preference sends the Assembly back to reconcile', () => {
  const i = institutions('commonwealth')
  const first = docket({ sittings: [sat(i, 'assembly', 'a', 120)], reviews: [ruled(i, 'court', { a: 4, b: 3 })] })
  const s = standing(first, i, OPTIONS)
  assert.deepEqual(s.barred, ['a'])
  assert.equal(s.mustTake, undefined)
  assert.match(s.explanation, /barred \(4 to 3\)|Option 1 \(4 to 3\)/)
  const next = nextSteps({ ...first, standing: s }, i, 'major', { advisers: [] })
  assert.equal(next?.kind, 'reconciliation')
  assert.equal(next?.steps[0]?.body, 'assembly')

  const reconciled = { ...first, sittings: [...first.sittings, sat(i, 'assembly', 'b', 105, 'reconciliation')] }
  assert.equal(standing(reconciled, i, OPTIONS).mustTake, 'b')
  assert.equal(nextSteps(reconciled, i, 'major', { advisers: [] }), null)
  assert.equal(check(standing(reconciled, i, OPTIONS), 'a', { word: 'I overrule the Court.' }).ok, true)
})

test('commonwealth: standstill only when every option is barred, or the sole one is rejected by 101', () => {
  const i = institutions('commonwealth')
  const all = standing(docket({ sittings: [sat(i, 'assembly', 'a', 120)], reviews: [ruled(i, 'court', { a: 7, b: 5, c: 4 })] }), i, OPTIONS)
  assert.equal(all.standstill, true)
  assert.equal(all.mustTake, DISMISS)
  assert.deepEqual(check(all, DISMISS), { ok: true })
  assert.equal(check(all, 'a').ok, false)

  const sole = { sittings: [sat(i, 'assembly', 'a', 120)], reviews: [ruled(i, 'court', { a: 7, b: 5 })] }
  const rejected = standing(docket({ ...sole, sittings: [...sole.sittings, sat(i, 'assembly', DISMISS, 101, 'reconciliation')] }), i, OPTIONS)
  assert.equal(rejected.standstill, true)
  const short = standing(docket({ ...sole, sittings: [...sole.sittings, sat(i, 'assembly', DISMISS, 100, 'reconciliation')] }), i, OPTIONS)
  assert.equal(short.standstill, false)
  assert.deepEqual(short.permitted, ['c'])
  assert.equal(check(short, DISMISS).ok, false)
})

test('presidential: two-thirds binds the President, a barred choice simply falls', () => {
  const i = institutions('presidential')
  assert.equal(standing(docket({ sittings: [sat(i, 'congress', 'b', 290)], reviews: [ruled(i, 'court', {})] }), i, OPTIONS).mustTake, 'b')
  const veto = standing(docket({ sittings: [sat(i, 'congress', 'b', 289)], reviews: [ruled(i, 'court', {})] }), i, OPTIONS)
  assert.equal(veto.vetoable, 'b')
  assert.ok(veto.permitted.includes(DISMISS))
  const barred = docket({ sittings: [sat(i, 'congress', 'b', 400)], reviews: [ruled(i, 'court', { b: 5 })] })
  const s = standing(barred, i, OPTIONS)
  assert.deepEqual(s.permitted, ['a', 'c', DISMISS])
  assert.equal(nextSteps(barred, i, 'major', { advisers: [] }), null)
  assert.equal(standing(docket({ reviews: [ruled(i, 'court', { b: 4 })] }), i, OPTIONS).barred.length, 0)
})

test('parliamentary monarchy: the majority decides and the Crown assents', () => {
  const i = institutions('parliamentary-monarchy')
  const decided = docket({ sittings: [sat(i, 'parliament', 'c', 326)], reviews: [ruled(i, 'court', {})] })
  const s = standing(decided, i, OPTIONS)
  assert.equal(s.mustTake, 'c')
  assert.match(s.explanation, /Its vote is the decision/)
  const next = nextSteps({ ...decided, standing: s }, i, 'major', { advisers: [] })
  assert.equal(next?.kind, 'assent')
  assert.equal(next?.steps[0]?.body, 'crown')
  const refused = standing({ ...decided, assents: [{ body: 'crown', given: false, reasons: 'No.', document: 'papers-00001' }] }, i, OPTIONS)
  assert.equal(refused.mustTake, undefined)
  assert.match(refused.explanation, /withheld assent/)
  // 325 of 650 is not more than half: no decision, the Prime Minister chooses.
  assert.equal(standing(docket({ sittings: [sat(i, 'parliament', 'c', 325)], reviews: [ruled(i, 'court', {})] }), i, OPTIONS).mustTake, undefined)
  assert.equal(standing(docket({ reviews: [ruled(i, 'court', { a: 7 })] }), i, OPTIONS).barred[0], 'a')
  assert.equal(standing(docket({ reviews: [ruled(i, 'court', { a: 6 })] }), i, OPTIONS).barred.length, 0)
})

test('direct democracy: the Council advises and the Court rules first, then the people decide', () => {
  const i = institutions('direct-democracy')
  const first = nextSteps(docket(), i, 'major', { advisers: ['federal-council'] })
  assert.equal(first?.stage, 1)
  assert.deepEqual(first?.steps.map((s) => s.body).sort(), ['court', 'federal-council'])
  const ruledFirst = docket({ advice: [{ body: 'federal-council', summary: '', document: 'advice-00001', ai: false }], reviews: [ruled(i, 'court', { a: 3 })] })
  const second = nextSteps(ruledFirst, i, 'major', { advisers: ['federal-council'] })
  assert.equal(second?.stage, 2)
  assert.equal(second?.steps[0]?.body, 'people')
  const voted = standing({ ...ruledFirst, sittings: [sat(i, 'people', 'b', 410)] }, i, OPTIONS)
  assert.equal(voted.mustTake, 'b')
  assert.deepEqual(voted.barred, ['a'])
})

test('one-party: the court only advises and the Congress never binds', () => {
  const i = institutions('one-party')
  const s = standing(docket({ reviews: [ruled(i, 'court', { a: 5 })], sittings: [sat(i, 'congress', 'a', 1990)] }), i, OPTIONS)
  assert.deepEqual(s.barred, [])
  assert.deepEqual(s.advisedAgainst, ['a'])
  assert.equal(s.mustTake, undefined)
  assert.ok(s.permitted.includes('a') && s.permitted.includes(DISMISS))
  assert.match(s.explanation, /does not bind/)
  assert.equal(nextSteps(docket(), i, 'major', { advisers: [] })?.steps[0]?.role, 'review')
})

test('absolute monarchy: the Monarch takes any course', () => {
  const i = institutions('absolute-monarchy')
  const s = standing(docket(), i, OPTIONS)
  assert.deepEqual(s.permitted, ['a', 'b', 'c', DISMISS])
  assert.match(s.explanation, /may take any permitted course/)
  assert.deepEqual(check(s, DISMISS), { ok: true })
})

test('theocracy: the Elders bar on doctrine and the Majlis never binds', () => {
  const i = institutions('theocracy')
  const s = standing(docket({ reviews: [ruled(i, 'elders', { b: 7 })], sittings: [sat(i, 'majlis', 'a', 280)] }), i, OPTIONS)
  assert.deepEqual(s.barred, ['b'])
  assert.equal(s.mustTake, undefined)
  assert.equal(s.vetoable, undefined)
  assert.equal(standing(docket({ reviews: [ruled(i, 'elders', { b: 6 })] }), i, OPTIONS).barred.length, 0)
})

test('junta: six of nine officers bind the Chairman', () => {
  const i = institutions('junta')
  assert.equal(standing(docket({ sittings: [sat(i, 'officers', 'c', 6)] }), i, OPTIONS).mustTake, 'c')
  const five = standing(docket({ sittings: [sat(i, 'officers', 'c', 5)] }), i, OPTIONS)
  assert.equal(five.mustTake, undefined)
  assert.ok(five.permitted.includes('a'))
})

test('a minor matter goes only to review unless minors go through the bodies', () => {
  const i = institutions('commonwealth')
  const minor = nextSteps(docket(), i, 'minor')
  assert.deepEqual(minor?.steps.map((s) => s.role), ['review'])
  assert.equal(nextSteps(docket({ reviews: [ruled(i, 'court', {})] }), i, 'minor'), null)
  const through = { ...i, constitution: { ...i.constitution, rules: { ...i.constitution.rules, minorsThroughBodies: true } } }
  assert.ok(nextSteps(docket(), through, 'minor')!.steps.some((s) => s.role === 'recommend'))
})

test('advise steps are narrowed to the advisers asked', () => {
  const i = institutions('commonwealth')
  const all = nextSteps(docket(), i, 'major')!
  assert.equal(all.steps.filter((s) => s.role === 'advise').length, 7)
  const two = nextSteps(docket(), i, 'major', { advisers: ['ministry-health'] })!
  assert.deepEqual(two.steps.filter((s) => s.role === 'advise').map((s) => s.body), ['ministry-health'])
})

// Found in review: a House that sat beside the Court and put dismissal first was passed over,
// and the executive made to take the one course the Court left, though the House never sat
// knowing that course was the only one.
test('a house that put dismissal first beside a barring court sits again, and its rejection then stands', () => {
  const i = institutions('commonwealth')
  const house = i.constitution.rules.steps.find((s) => s.role === 'recommend')!.body
  const court = i.constitution.rules.steps.find((s) => s.role === 'review')!.body
  const bar = i.constitution.rules.steps.find((s) => s.role === 'review')!.barVotes!
  const first = docket({ sittings: [sat(i, house, DISMISS, 120)], reviews: [ruled(i, court, { a: bar, b: bar })] })
  const next = nextSteps(first, i, 'major', { advisers: [] })
  assert.equal(next?.kind, 'reconciliation')
  const again = docket({ ...first, sittings: [...first.sittings, sat(i, house, DISMISS, 120, 'reconciliation')] })
  const s = standing(again, i, OPTIONS)
  assert.equal(s.standstill, true)
  assert.equal(s.mustTake, DISMISS)
  // Short of the binding share, the rejection does not stand and the course left is taken.
  const weak = docket({ ...first, sittings: [...first.sittings, sat(i, house, DISMISS, 90, 'reconciliation')] })
  assert.equal(standing(weak, i, OPTIONS).standstill, false)
})
