import assert from 'node:assert/strict'
import { test } from 'node:test'
import { amend, buildInstitutions, formOf, FORMS } from '../src/forms.ts'
import { checkGovernment, problemsOf } from '../src/government.ts'
import { FORM_IDS } from '../src/types.ts'
import { content, FOUNDABLE, founder, government, nation } from './fixtures.ts'

const TAGS = new Set(content.dilemmas.flatMap((d) => [...d.tags, ...d.options.flatMap((o) => o.tags)]))

test('every form has a name, a description and an executive for the founding screen', () => {
  for (const form of FORM_IDS) {
    assert.ok(FORMS[form].name && FORMS[form].description && FORMS[form].executive)
  }
  assert.throws(() => buildInstitutions('custom', nation(), content, { founder, calendarStart: '2026-10-11', seed: 1 }), /amendment/)
})

for (const form of FOUNDABLE) {
  test(`a ${form} is seated in full`, () => {
    const state = nation(3)
    const gov = government(form, state)
    const i = gov.institutions
    assert.ok(checkGovernment(gov), problemsOf(gov).join('; '))
    assert.equal(i.constitution.form, form)
    assert.equal(formOf(i), form, 'it still matches its own template')
    for (const body of i.bodies) {
      if (body.parties.length) {
        assert.equal(body.parties.reduce((s, p) => s + p.seats, 0), body.size, `${body.name} seats add up`)
        assert.ok(body.parties.every((p) => p.seats >= 1 && /^#[0-9a-f]{6}$/i.test(p.colour)))
      }
      if (body.kind === 'legislature') {
        assert.ok(body.parties.every((p) => p.factions.length >= 1 && p.factions.length <= 3))
        const carried = body.parties.flatMap((p) => p.factions).sort()
        assert.deepEqual(carried, content.factions.map((f) => f.id).sort(), 'every faction has exactly one party')
        assert.ok(body.parties.every((p) => p.leader && body.members.some((m) => m.name === p.leader)))
      }
      if (body.kind === 'court' || body.kind === 'council') {
        assert.equal(body.members.length, body.size, `${body.name} has a member per seat`)
      }
      if (body.kind === 'court') assert.ok(body.members.every((m) => m.philosophy))
      assert.ok(body.members.every((m) => m.character && m.name), `${body.name} members are named with a character`)
      const ids = body.members.map((m) => m.id)
      assert.equal(new Set(ids).size, ids.length)
    }
    const ministries = i.bodies.filter((b) => b.kind === 'ministry')
    assert.equal(ministries.length, content.portfolios.length)
    for (const p of content.portfolios) {
      const m = ministries.find((b) => b.portfolio === p.id)!
      assert.equal(m.members[0]!.name, state.cabinet[p.id]!.name, 'the minister is the engine cabinet minister')
    }
    assert.equal(i.press.length, 4)
    assert.deepEqual(i.press.map((p) => p.kind), ['paper', 'paper', 'paper', 'broadcaster'])
    assert.ok(i.press.every((p) => /Ostra|Vesland|Veslander/.test(p.name)))
    const a0 = i.constitution.articles.find((a) => a.number === '0')!
    assert.match(a0.text, /Aegis/)
    assert.ok(i.constitution.articles.some((a) => a.title === 'The decision'))
    assert.ok(i.constitution.articles.every((a) => a.text.length > 20 && !a.text.includes('undefined')))
    const rights = i.constitution.rights
    assert.ok(rights.length >= 12 && rights.length <= 20)
    assert.ok(rights.some((r) => r.absolute))
    for (const r of rights) for (const entry of r.against) for (const tag of entry.split('+')) assert.ok(TAGS.has(tag), `${r.id} guards against ${tag}, a tag the pack uses`)
    assert.ok(i.canon.length >= 5)
    assert.ok(i.bodies.every((b) => b.name && b.shortName && b.description))
  })
}

test('the commonwealth follows Claudetopia: Article 0, the Article 65 rule, 101 of 151, 4 of 7', () => {
  const i = government('commonwealth', nation(1)).institutions
  const a65 = i.constitution.articles.find((a) => a.number === '65')!
  assert.equal(a65.title, 'The decision')
  assert.match(a65.text, /101 votes or more/)
  assert.match(a65.text, /4 of its 7/)
  assert.match(a65.text, /sits again/)
  assert.ok(['0', '27', '61', '62', '63', '64', '65', '66', '67'].every((n) => i.constitution.articles.some((a) => a.number === n)))
  assert.equal(i.constitution.rules.executive.holder, 'Claude')
  assert.equal(i.constitution.stateName, 'The Commonwealth of Vesland')
})

test('a government is the same for the same seed, and different for another', () => {
  const a = government('commonwealth', nation(1), 'found', 7)
  const b = government('commonwealth', nation(1), 'found', 7)
  const c = government('commonwealth', nation(1), 'found', 8)
  assert.deepEqual(a, b)
  assert.notDeepEqual(a.institutions.bodies, c.institutions.bodies)
})

test('in govern mode the Founder holds the executive office', () => {
  const g = government('presidential', nation(1), 'govern')
  assert.equal(g.institutions.constitution.rules.executive.holder, 'Aegis')
  assert.ok(g.institutions.canon.some((c) => c.includes('held by Aegis')))
})

test('an amendment to another form keeps the bodies that survive it', () => {
  const before = government('commonwealth', nation(1)).institutions
  const after = amend(before, { form: 'presidential' }, 30)
  assert.equal(after.constitution.form, 'presidential')
  assert.equal(after.constitution.since, 30)
  assert.equal(formOf(after), 'presidential')
  const oldCourt = before.bodies.find((b) => b.id === 'court')!
  const newCourt = after.bodies.find((b) => b.id === 'court')!
  assert.equal(newCourt.size, 9)
  assert.equal(newCourt.members.length, 9)
  assert.deepEqual(newCourt.members.slice(0, 7).map((m) => m.name), oldCourt.members.map((m) => m.name))
  assert.ok(after.bodies.some((b) => b.id === 'congress'))
  assert.ok(!after.bodies.some((b) => b.id === 'assembly'))
  // Ministers stay in their ministries.
  assert.deepEqual(after.bodies.filter((b) => b.kind === 'ministry').map((b) => b.members[0]!.name), before.bodies.filter((b) => b.kind === 'ministry').map((b) => b.members[0]!.name))
  assert.ok(checkGovernment({ ...government('commonwealth', nation(1)), institutions: after }))
})

test('a rule changed in place makes the constitution custom, and its decision article follows', () => {
  const before = government('commonwealth', nation(1)).institutions
  const after = amend(before, { rules: { exchanges: 5, vetoWithReasons: false } }, 12)
  assert.equal(after.constitution.form, 'custom')
  assert.equal(after.constitution.formName, 'Commonwealth')
  assert.equal(after.constitution.stateName, before.constitution.stateName)
  assert.equal(after.constitution.rules.exchanges, 5)
  const decision = after.constitution.articles.find((a) => a.title === 'The decision')!
  assert.match(decision.text, /up to 5/)
  assert.match(decision.text, /is a recommendation/)
  // Changing it back matches the template again.
  const back = amend(after, { rules: { exchanges: 3, vetoWithReasons: true } }, 13)
  assert.equal(back.constitution.form, 'commonwealth')
})

test('an amendment adds and removes rights and articles', () => {
  const before = government('commonwealth', nation(1)).institutions
  const after = amend(
    before,
    {
      rights: { remove: ['C13'], add: [{ id: 'C30', title: 'Rest', text: 'Everyone may rest.', against: [], guards: [], absolute: false }] },
      articles: [{ number: '4', title: 'A secular state', text: 'Rewritten.' }, { number: '99', title: 'New', text: 'A new article.' }],
    },
    20,
  )
  assert.ok(!after.constitution.rights.some((r) => r.id === 'C13'))
  assert.ok(after.constitution.rights.some((r) => r.id === 'C30'))
  assert.equal(after.constitution.articles.find((a) => a.number === '4')!.text, 'Rewritten.')
  assert.ok(after.constitution.articles.some((a) => a.number === '99'))
  assert.equal(after.constitution.form, 'commonwealth')
})

test('checkGovernment turns away a malformed save', () => {
  const g = government('junta', nation(1))
  assert.equal(checkGovernment({ ...g, mode: 'rule' }), false)
  assert.deepEqual(problemsOf({ ...g, petitions: -1 }), ['petitions is missing or malformed'])
  const broken = structuredClone(g)
  ;(broken.institutions.bodies[0] as unknown as Record<string, unknown>)['size'] = 'nine'
  assert.equal(checkGovernment(broken), false)
  assert.equal(checkGovernment(null), false)
})
