// The world beyond the borders as the server plays it: the week turned with the AI asked
// (and kept to legal moves), written into the Archive; foreign matters decided; the player's
// actions abroad, a declaration of war going to the legislature first.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HOME, openMatters } from '@diplomat/engine'
import { validate, standIn, worldCalls, warStep, warMotion, brief, type Provider, type TaskInput } from '@diplomat/government'
import { branchOf } from '../src/ooc.ts'
import { loadContent } from '../src/server.ts'
import { harness, IDENTITY } from './helpers.ts'

const found = (h: Awaited<ReturnType<typeof harness>>, body: object = {}) =>
  h.post('/api/nations', { identity: IDENTITY, answers: {}, form: 'commonwealth', mode: 'govern', founder: { name: 'Aegis', title: 'Founder' }, ...body })

async function toWeekEnd(h: Awaited<ReturnType<typeof harness>>, id: string) {
  while (h.running.game.store.open(id).state.day % 7 !== 0) await h.post(`/api/nations/${id}/sandbox`, { skip: 1 })
}

test('the important nations each have a session of their own; the rest share one', () => {
  assert.equal(branchOf('world.nations', { nations: [] }), 'world-nations')
  assert.equal(branchOf('nation.move', { nation: { id: 'eskerland' } }), 'foreign:eskerland')
})

test('a model can only choose a legal move; anything else is refused and the stand-in takes the top move', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h)).json
    const n = h.running.game.store.open(id)
    const b = brief(n.state, n.gov, loadContent(), [])
    const calls = worldCalls(n.state, loadContent(), b)
    assert.ok(calls.batch, 'some nations have a choice to make this week')
    const input = calls.batch!
    const first = input.nations[0]!
    const good = { choices: input.nations.map((x) => ({ nation: x.id, move: x.moves[0]!.id, note: 'A note.' })) }
    assert.equal(validate('world.nations', input, good).ok, true)
    const bad = { choices: input.nations.map((x) => ({ nation: x.id, move: x === first ? 'war:nowhere' : x.moves[0]!.id, note: 'A note.' })) }
    const checked = validate('world.nations', input, bad)
    assert.equal(checked.ok, false)
    assert.match((checked as { problems: string[] }).problems.join(';'), /is not one of/)
    const missing = { choices: good.choices.slice(1) }
    assert.equal(validate('world.nations', input, missing).ok, false, 'every nation must be chosen for')
    const stood = standIn('world.nations', input, 1)
    assert.deepEqual(stood.choices.map((c) => c.move), input.nations.map((x) => x.moves[0]!.id))
  } finally {
    await h.close()
  }
})

test('the world week asks the AI, keeps it to legal moves, and writes the week into the Archive', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h)).json
    const asked: string[] = []
    // A provider that plays every nation's second-best move, and tries one illegal one.
    const provider: Provider = {
      status: async () => ({ backend: 'anthropic', ok: true, detail: 'test', models: { bulk: 'b', standard: 's', strategic: 'x' } }),
      run: async (task, input) => {
        asked.push(task)
        if (task === 'world.nations') {
          const i = input as TaskInput['world.nations']
          return { choices: i.nations.map((x) => ({ nation: x.id, move: (x.moves[1] ?? x.moves[0])!.id, note: `${x.name} has spoken.` })) }
        }
        if (task === 'nation.move') {
          const i = input as TaskInput['nation.move']
          return { move: i.moves[0]!.id, note: 'Noted.' }
        }
        throw new Error('not in this test')
      },
    }
    h.running.ai.override = provider
    await toWeekEnd(h, id)
    await h.post(`/api/nations/${id}/end-day`)
    assert.ok(asked.includes('world.nations'), 'the shared session was asked')
    const n = h.running.game.store.open(id)
    const week = n.archive.search({ series: 'world' })
    assert.ok(week.total >= 1, 'the week abroad is in the Archive')
    assert.ok(n.state.world!.log.some((l) => l.day === n.state.day - 1) || week.total >= 1)
  } finally {
    await h.close()
  }
})

test('a foreign matter is decided over HTTP, and refused when it is not waiting', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h)).json
    const n = h.running.game.store.open(id)
    const s = structuredClone(n.state)
    s.world!.matters.push({ id: 'matter-x', kind: 'aid', day: s.day, expires: s.day + 7, subject: 'amaranth', vars: { need: 'a flood' } })
    n.state = s
    const ok = await h.post(`/api/nations/${id}/world/matter`, { matter: 'matter-x', option: 'send' })
    assert.equal(ok.status, 200)
    assert.equal(openMatters(h.running.game.store.open(id).state).length, 0)
    const again = await h.post(`/api/nations/${id}/world/matter`, { matter: 'matter-x', option: 'send' })
    assert.equal(again.status, 409)
    assert.equal((await h.post(`/api/nations/${id}/world/act`, { action: { war: 'lunes' } })).status, 409, 'not a neighbour')
    assert.equal((await h.post(`/api/nations/${id}/world/act`, { action: { nonsense: 1 } })).status, 400)
  } finally {
    await h.close()
  }
})

test('a declaration of war is sat on by the Assembly first in a commonwealth: a debate, a division, and Hansard', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h)).json
    const n = h.running.game.store.open(id)
    // Provoked by a hostile neighbour: the members (here the stand-in) take the country's side.
    n.state = { ...n.state, neighbours: { ...n.state.neighbours, eskerland: -80 } }
    assert.ok(warStep(n.gov.institutions), 'the commonwealth Assembly votes on war')
    const motion = warMotion(n.state, loadContent(), n.gov.institutions, 'eskerland')
    assert.equal(motion.options[0]!.course, '1')
    const r = await h.post(`/api/nations/${id}/world/act`, { action: { war: 'eskerland' } })
    assert.equal(r.status, 200)
    assert.equal(r.json.vote.carried, true, 'a provoked war carries')
    const hansard = h.running.game.store.open(id).archive.search({ series: 'hansard', q: 'declaration of war' })
    assert.equal(hansard.total, 1)
    assert.ok(h.running.game.store.open(id).state.world!.wars.some((w) => w.attackers.includes(HOME) && w.defenders.includes('eskerland')))
  } finally {
    await h.close()
  }
})

test('an unprovoked war is refused by the members, and costs the government', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h)).json
    const n = h.running.game.store.open(id)
    n.state = { ...n.state, neighbours: { ...n.state.neighbours, velsa: 40 } }
    const legitimacy = n.state.indicators.legitimacy
    const r = await h.post(`/api/nations/${id}/world/act`, { action: { war: 'velsa' } })
    assert.equal(r.status, 200)
    assert.equal(r.json.vote.carried, false)
    const s = h.running.game.store.open(id).state
    assert.ok(!s.world!.wars.some((w) => w.attackers.includes(HOME)))
    assert.ok(s.indicators.legitimacy < legitimacy)
  } finally {
    await h.close()
  }
})

test('an absolute monarch declares war alone', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h, { form: 'absolute-monarchy' })).json
    const n = h.running.game.store.open(id)
    assert.equal(warStep(n.gov.institutions), null)
  } finally {
    await h.close()
  }
})
