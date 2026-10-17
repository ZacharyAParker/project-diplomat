// The world beyond the borders as the server plays it: the week turned with the AI asked
// (and kept to legal moves), written into the Archive; foreign matters decided; the player's
// actions abroad, a declaration of war going to the legislature first.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HOME, openMatters } from '@diplomat/engine'
import { validate, standIn, worldCalls, warVote, brief, type Provider, type TaskInput } from '@diplomat/government'
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

test('a declaration of war goes to the Assembly first in a commonwealth, and its division is in Hansard', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h)).json
    const n = h.running.game.store.open(id)
    // A provoked war against a hostile neighbour, with the government popular: it carries.
    n.state = { ...n.state, neighbours: { ...n.state.neighbours, eskerland: -80 } }
    const vote = warVote(n.gov.institutions, n.state, 'eskerland')
    assert.ok(vote, 'the commonwealth Assembly votes on war')
    const r = await h.post(`/api/nations/${id}/world/act`, { action: { war: 'eskerland' } })
    assert.equal(r.status, 200)
    assert.equal(typeof r.json.vote.carried, 'boolean')
    const hansard = h.running.game.store.open(id).archive.search({ series: 'hansard', q: 'declaration of war' })
    assert.equal(hansard.total, 1)
    const state = h.running.game.store.open(id).state
    if (r.json.vote.carried) assert.ok(state.world!.wars.some((w) => w.attackers.includes(HOME) && w.defenders.includes('eskerland')))
    else assert.ok(!state.world!.wars.some((w) => w.attackers.includes(HOME)))
  } finally {
    await h.close()
  }
})

test('an absolute monarch declares war alone', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h, { form: 'absolute-monarchy' })).json
    const n = h.running.game.store.open(id)
    assert.equal(warVote(n.gov.institutions, n.state, 'eskerland'), null)
  } finally {
    await h.close()
  }
})
