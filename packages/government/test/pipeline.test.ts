import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decide, dismiss, endDay, applyExternal } from '@diplomat/engine'
import { bound } from '../src/bounds.ts'
import { parseDocument, serializeDocument } from '../src/documents.ts'
import { checkGovernment, founderDocuments } from '../src/government.ts'
import { completeDocket, decisionSummary, fileDocket, fileEvening, openDocket, runDocket, runEvening, runExecutive, wordCost } from '../src/pipeline.ts'
import { check } from '../src/rules.ts'
import { DEFAULT_BOUNDS, DISMISS, type Task, type TaskInput, type TaskOutput } from '../src/types.ts'
import { content, FOUNDABLE, government, memory, nation, withDilemma } from './fixtures.ts'

const DILEMMAS = ['street-cameras', 'national-faith', 'phone-records', 'four-day-week', 'hospital-queues']

for (const form of FOUNDABLE) {
  test(`a ${form} decides petitions and writes the evening with the stand-ins`, async () => {
    let state = nation(5)
    let gov = government(form, state)
    for (const [i, id] of DILEMMAS.entries()) {
      state = withDilemma(state, id)
      const mem = memory(state, gov, 11 + i)
      const opened = openDocket(mem.ctx, id)
      assert.equal(opened.number, gov.petitions + 1)
      const ready = await runDocket(mem.ctx, opened)
      assert.equal(ready.status, 'ready', ready.error)
      assert.ok(ready.standing, 'the docket has a standing')
      assert.ok(ready.standing.explanation.length > 0)
      assert.ok(mem.runs.every((r) => r.ok))
      // Every document the docket points at was written.
      for (const doc of [...ready.sittings.map((s) => s.document), ...ready.reviews.map((r) => r.document), ...ready.advice.map((a) => a.document)]) {
        assert.ok(mem.docs.some((d) => d.id === doc), `${doc} was written`)
      }
      const decision = await runExecutive(mem.ctx, ready)
      assert.deepEqual(check(ready.standing, decision.course, { ...(decision.veto ? { veto: decision.veto.reasons } : {}) }), { ok: true })
      state = decision.course === DISMISS ? dismiss(state, content, id, decision.reasons) : decide(state, content, id, decision.course, 'The Old Way')
      const entry = state.timeline.at(-1)!
      const done = await completeDocket({ ...mem.ctx, state }, ready, decision, entry)
      assert.equal(done.status, 'decided')
      assert.ok(mem.docs.some((d) => d.id === done.document && d.series === 'petition'))
      gov = fileDocket(gov, done)
      assert.equal(gov.petitions, i + 1)

      const evening = await runEvening({ ...mem.ctx, state, gov }, [decisionSummary(done, entry, { state, content })])
      assert.ok(evening.world.press.length >= 1)
      assert.deepEqual(evening.effects, [])
      state = applyExternal(state, content, 'event', 'The day', evening.effects)
      gov = fileEvening(gov, evening)
      state = endDay(state, content)
    }
    assert.ok(checkGovernment(JSON.parse(JSON.stringify(gov))), 'the government survives a save')
    // The pipeline never changed the government it was given.
    assert.equal(government(form, nation(5)).petitions, 0)
  })
}

test('a commonwealth reconciles when the Court bars the Assembly’s choice, and exchanges a remonstrance', async () => {
  const state = withDilemma(nation(1), 'phone-records')
  const gov = government('commonwealth', state)
  const mem = memory(state, gov, 1)
  const plain = mem.ctx.run
  // The House insists on the statute at its first sitting, and remonstrates when it is barred.
  mem.ctx.run = (async (task: Task, input: never) => {
    const result = await plain(task, input)
    if (task === 'legislature.sitting') {
      const out = result.output as TaskOutput['legislature.sitting']
      const kind = (input as TaskInput['legislature.sitting']).kind
      if (kind === 'first') out.ladder = ['statute', ...out.ladder.filter((c) => c !== 'statute')]
      if (kind === 'reconciliation') out.remonstrance = 'The House asks the Court to think again.'
    }
    return result
  }) as typeof mem.ctx.run
  const ready = await runDocket(mem.ctx, openDocket(mem.ctx, 'phone-records'))
  assert.equal(ready.status, 'ready', ready.error)
  assert.equal(ready.sittings[0]!.firstPreference, 'statute')
  assert.ok(ready.reviews[0]!.rulings.some((r) => r.course === 'statute' && r.verdict === 'barred'))
  const rec = ready.sittings.find((s) => s.kind === 'reconciliation')
  assert.ok(rec, 'the Assembly sat again')
  assert.ok(ready.exchanges.some((e) => e.kind === 'remonstrance'))
  assert.ok(ready.exchanges.some((e) => e.kind === 'reply'))
  assert.ok(ready.exchanges.length <= 2 * gov.institutions.constitution.rules.exchanges)
  assert.match(ready.standing!.explanation, /barred/)
  const filed = fileDocket(gov, ready)
  assert.equal(filed.petitions, 1)
  assert.equal(gov.petitions, 0)
})

test('a Word costs legitimacy only when it sets the rules aside', () => {
  const standing = { permitted: ['a'], barred: ['b'], mustTake: 'a', standstill: false, explanation: '' }
  assert.deepEqual(wordCost(standing, 'a'), [])
  assert.equal(wordCost(standing, 'b').reduce((s, e) => s + ('by' in e ? e.by : 0), 0), -3)
  assert.equal(wordCost({ ...standing, barred: [] }, 'c').length, 1)
  assert.deepEqual(check(standing, 'b', { word: 'I so order.' }), { ok: true })
  const kept = bound(wordCost(standing, 'b'), DEFAULT_BOUNDS, {})
  assert.equal(kept.effects.length, 2)
})

test('the founding documents round-trip through the Archive format', () => {
  for (const form of FOUNDABLE) {
    const state = nation(2)
    const gov = government(form, state)
    const docs = founderDocuments(gov, state)
    assert.ok(docs.some((d) => d.kind === 'constitution'))
    assert.ok(docs.some((d) => d.kind === 'charter'))
    docs.forEach((d, i) => {
      const doc = { ...d, id: `${d.series}-${String(i + 1).padStart(5, '0')}` }
      const parsed = parseDocument(serializeDocument(doc))
      assert.ok(parsed.ok, parsed.ok ? '' : parsed.problem)
      if (parsed.ok) assert.deepEqual(parsed.document, { ...doc, body: doc.body.trimEnd() })
    })
  }
})
