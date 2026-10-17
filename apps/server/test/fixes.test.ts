// The review's findings, each held to.

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadContent } from '../src/server.ts'
import { harness, IDENTITY, settle } from './helpers.ts'

const found = (h: Awaited<ReturnType<typeof harness>>, body: object = {}) =>
  h.post('/api/nations', { identity: IDENTITY, answers: {}, form: 'commonwealth', mode: 'govern', founder: { name: 'Aegis', title: 'Founder' }, ...body })

test('two foundings with the same name at once get two folders', async () => {
  const h = await harness()
  try {
    const [a, b, c] = await Promise.all([found(h), found(h), found(h)])
    assert.deepEqual([a.status, b.status, c.status], [201, 201, 201])
    assert.equal(new Set([a.json.id, b.json.id, c.json.id]).size, 3)
    for (const r of [a, b, c]) assert.equal((await h.get(`/api/nations/${r.json.id}/archive?series=law`)).json.total, 2, 'each has its own archive')
  } finally {
    await h.close()
  }
})

test('run decides only what the bodies finished: a failed docket is reconvened once, then skipped and reported', async () => {
  const h = await harness()
  try {
    const { id } = (await found(h, { mode: 'found' })).json
    await h.running.game.dockets.idle(id)
    // A court the rules name but the government lacks: every sitting of it fails.
    const n = h.running.game.store.open(id)
    const rules = n.gov.institutions.constitution.rules
    n.gov = { ...n.gov, institutions: { ...n.gov.institutions, constitution: { ...n.gov.institutions.constitution, rules: { ...rules, steps: [...rules.steps, { body: 'ghost', role: 'review', stage: 1 }] } } } }
    await h.post(`/api/nations/${id}/end-day`)
    await h.running.game.dockets.idle(id)
    const major = h.running.game.store.open(id).state.agenda.major!
    assert.equal(h.running.game.store.open(id).gov.dockets[major]!.status, 'failed')
    const day = h.running.game.store.open(id).state.day
    const r = await h.post(`/api/nations/${id}/run`, { days: 1 })
    assert.equal(r.status, 200, r.json.error)
    assert.ok(r.json.problems.some((p: string) => p.includes('was not decided today')), r.json.problems.join(' | '))
    assert.ok(!r.json.entries.some((e: any) => e.kind === 'decision' && e.headline.includes(loadContent().dilemmas.find((d) => d.id === major)!.title.slice(0, 10))), 'the failed petition was not enacted')
    assert.equal(h.running.game.store.open(id).state.day, day + 1, 'the day still ended')
  } finally {
    await h.close()
  }
})

test('after a restart, found mode decides a docket that was left ready', async () => {
  const data = mkdtempSync(join(tmpdir(), 'diplomat-restart-'))
  try {
    let h = await harness({ data })
    const { id } = (await found(h)).json
    await settle(h, id)
    const n = h.running.game.store.open(id)
    const major = n.state.agenda.major!
    assert.equal(n.gov.dockets[major]!.status, 'ready')
    // Saved ready in found mode, as if the server stopped before the executive was told.
    n.gov = { ...n.gov, mode: 'found' }
    await h.running.game.store.save(n)
    await h.close()
    h = await harness({ data })
    try {
      await h.running.game.dockets.idle(id)
      assert.equal(h.running.game.store.open(id).gov.dockets[major]!.status, 'decided')
    } finally {
      await h.close()
    }
  } finally {
    rmSync(data, { recursive: true, force: true })
  }
})

test('with the global setting on, a minor petition gets every body, not only the court', async () => {
  const h = await harness()
  try {
    await h.put('/api/settings', { minorsThroughBodies: true })
    const { id } = (await found(h)).json
    const minor = loadContent().dilemmas.find((d) => d.kind === 'minor' && d.id === 'clock-change')!
    assert.equal(h.running.game.store.open(id).gov.institutions.constitution.rules.minorsThroughBodies, false)
    await settle(h, id)
    await h.post(`/api/nations/${id}/sandbox`, { callUp: minor.id })
    const dockets = await settle(h, id)
    const d = dockets.find((x) => x.dilemma === minor.id)
    assert.ok(d, 'the minor has a docket')
    assert.equal(d.status, 'ready', d.error)
    assert.ok(d.sittings.length >= 1, 'the Assembly sat on it')
    assert.ok(d.advice.length >= 1, 'the ministries advised')
    assert.equal(h.running.game.store.open(id).gov.institutions.constitution.rules.minorsThroughBodies, false, 'the constitution is not changed')
  } finally {
    await h.close()
  }
})
