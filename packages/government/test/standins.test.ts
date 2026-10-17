import assert from 'node:assert/strict'
import { test } from 'node:test'
import { brief, petitionBrief } from '../src/briefs.ts'
import { assess, standIn } from '../src/standins.ts'
import { DEFAULT_BOUNDS, DISMISS, type Body, type Standing, type Task, type TaskInput } from '../src/types.ts'
import { validate } from '../src/validate.ts'
import { content, FOUNDABLE, government, nation } from './fixtures.ts'

const SEEDS = [1, 2, 3, 4, 5, 6]

function passes<T extends Task>(task: T, input: TaskInput[T], seed: number) {
  const out = standIn(task, input, seed)
  const checked = validate(task, input, out)
  assert.ok(checked.ok, `${task} (seed ${seed}): ${checked.ok ? '' : checked.problems.join('; ')}`)
  return checked.ok ? checked.value : undefined
}

test('every body of every form plays every pack dilemma within the rules', () => {
  const state = nation(9)
  for (const form of FOUNDABLE) {
    const gov = government(form, state)
    const b = brief(state, gov, content, [])
    const c = gov.institutions.constitution
    const reviewStep = (body: Body) => c.rules.steps.find((s) => s.body === body.id && s.role === 'review')
    for (const dilemma of content.dilemmas) {
      const p = petitionBrief(state, content, dilemma.id, 1)
      for (const seed of SEEDS.slice(0, form === 'commonwealth' ? 6 : 2)) {
        for (const body of gov.institutions.bodies) {
          const review = reviewStep(body)
          if (body.kind === 'ministry') passes('ministry.advice', { brief: b, body, petition: p }, seed)
          else if (body.kind === 'electorate') passes('electorate.referendum', { brief: b, petition: p, mood: 'restless' }, seed)
          else if (review) {
            const input = { brief: b, body, petition: p, rights: c.rights, articles: c.articles, precedents: [], barVotes: review.barVotes ?? 1 }
            passes(body.kind === 'court' ? 'court.opinion' : 'council.sitting', input, seed)
          } else if (body.parties.length) {
            const input = { brief: b, body, petition: p, kind: 'first' as const, advice: [] }
            const out = passes(body.kind === 'legislature' ? 'legislature.sitting' : 'council.sitting', input, seed)
            // A reconciliation sitting ranks a permitted course first.
            const permitted = [p.options[0]!.course]
            const rec = passes(body.kind === 'legislature' ? 'legislature.sitting' : 'council.sitting', { ...input, kind: 'reconciliation', permitted, review: { document: 'court-00001', summary: 'Barred.' } }, seed) as { ladder: string[] } | undefined
            assert.ok(out && rec && [...permitted, DISMISS].includes(rec.ladder[0]!))
          } else {
            passes('ministry.advice', { brief: b, body, petition: p }, seed)
          }
        }
        const standing: Standing = { permitted: p.options.map((o) => o.course).slice(1), barred: [p.options[0]!.course], standstill: false, explanation: 'Option 1 is barred.' }
        const decided = passes('executive.decision', { brief: b, petition: p, standing, sittings: [], reviews: [], advice: [], doctrine: '' }, seed)
        assert.ok(decided && standing.permitted.includes(decided.course))
      }
    }
  }
})

test('the executive takes what it must, or the recommendation, or the best open course', () => {
  const state = nation(1)
  const gov = government('commonwealth', state)
  const b = brief(state, gov, content, [])
  const p = petitionBrief(state, content, 'street-cameras', 1)
  const base = { brief: b, petition: p, reviews: [], advice: [], doctrine: '' }
  const must: Standing = { permitted: ['ban'], barred: [], mustTake: 'ban', standstill: false, explanation: '' }
  assert.equal(standIn('executive.decision', { ...base, standing: must, sittings: [] }, 1).course, 'ban')
  const open: Standing = { permitted: ['roll-out', 'warrant-only', 'ban'], barred: [], vetoable: 'roll-out', standstill: false, explanation: '' }
  const followed = standIn('executive.decision', { ...base, standing: open, sittings: [{ body: 'The Assembly', summary: '', ladder: ['roll-out', 'ban'] }] }, 1)
  assert.equal(followed.course, 'roll-out')
  assert.equal(followed.veto, undefined)
  const barredRec: Standing = { permitted: ['warrant-only', 'ban'], barred: ['roll-out'], standstill: false, explanation: '' }
  const own = standIn('executive.decision', { ...base, standing: barredRec, sittings: [{ body: 'The Assembly', summary: '', ladder: ['roll-out'] }] }, 1)
  assert.ok(['warrant-only', 'ban'].includes(own.course))
})

test('the rules-based Court bars on absolute rights unanimously and reads the rest to save', () => {
  const state = nation(1)
  const gov = government('commonwealth', state)
  const c = gov.institutions.constitution
  const court = gov.institutions.bodies.find((b) => b.id === 'court')!
  const faith = petitionBrief(state, content, 'national-faith', 1)
  const established = faith.options.find((o) => o.course === 'established')!
  assert.equal(assess(established, c.rights, faith.tags).absolute, true)
  const opinion = standIn('court.opinion', { brief: brief(state, gov, content, []), body: court, petition: faith, rights: c.rights, articles: c.articles, precedents: [], barVotes: 4 }, 1)
  const ruling = opinion.rulings.find((r) => r.course === 'established')!
  assert.ok(Object.values(ruling.votes).every((v) => v === 'bar'))
  assert.ok(ruling.articles.includes('C2'))
  assert.ok(opinion.rulings.some((r) => r.course === DISMISS && Object.values(r.votes).every((v) => v === 'permit')))
  // An option with no tags and no guard breached is never barred.
  const secular = opinion.rulings.find((r) => r.course === 'own')!
  assert.ok(Object.values(secular.votes).every((v) => v === 'permit'))
  for (const m of court.members) assert.match(opinion.opinion, new RegExp(m.name))
})

test('the world, letters, bills, replies and factbooks pass validation with no effects from the world', () => {
  const state = nation(4)
  for (const form of FOUNDABLE) {
    const gov = government(form, state)
    const b = brief(state, gov, content, [])
    for (const seed of SEEDS) {
      const decisions = seed % 2 ? [{ title: 'Smile, You’re on Record', course: 'Option 2', result: 'Cameras with warrants.', changes: ['liberty down 1: warrants'] }] : []
      const world = passes('world.day', { brief: b, decisions, timeline: [], press: gov.institutions.press, bounds: DEFAULT_BOUNDS }, seed)!
      assert.deepEqual(world.effects, [])
      assert.equal(world.press.length, gov.institutions.press.length)
      passes('letters.draft', { brief: b, count: 2, recent: [] }, seed)
      passes('factbook.draft', { brief: b, category: 'history', title: 'A history', notes: 'Founded in a hurry.' }, seed)
      passes('founding.institutions', { brief: b, institutions: gov.institutions }, seed)
      const legislature = gov.institutions.bodies.find((x) => x.kind === 'legislature')
      if (legislature) {
        const open = [{ number: 1, title: 'A Bill', body: legislature.id, moved: 'Someone', summary: 'Does a thing.', stage: 'committee' as const, divisions: [], effects: [], document: 'hansard-00001' }]
        const out = passes('bill.sitting', { brief: b, body: legislature, bills: open, bounds: DEFAULT_BOUNDS }, seed)!
        assert.ok(out.bills.every((x) => !['signed', 'returned', 'law'].includes(x.stage)))
      }
      const court = gov.institutions.bodies.find((x) => x.kind === 'court')
      const p = petitionBrief(state, content, 'street-cameras', 1)
      if (court) passes('exchange.reply', { brief: b, body: court, exchange: { from: 'The House', kind: 'remonstrance', text: 'Think again.' }, petition: p, own: { document: 'court-00001', summary: 'Barred.' }, barred: ['roll-out'] }, seed)
    }
  }
})

test('stand-ins are deterministic for a seed', () => {
  const state = nation(1)
  const gov = government('commonwealth', state)
  const assembly = gov.institutions.bodies.find((b) => b.id === 'assembly')!
  const input = { brief: brief(state, gov, content, []), body: assembly, petition: petitionBrief(state, content, 'four-day-week', 1), kind: 'first' as const, advice: [] }
  assert.deepEqual(standIn('legislature.sitting', input, 5), standIn('legislature.sitting', input, 5))
})
