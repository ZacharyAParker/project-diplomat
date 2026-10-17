// A smoke test on a copy of the imported Claudetopia. The real folder is only read.

import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { deserialize } from '@diplomat/engine'
import { ROOT } from '../src/server.ts'
import { copyNation, harness, settle, type Harness } from './helpers.ts'

const SOURCE = join(ROOT, 'data/nations/claudetopia')
const present = existsSync(join(SOURCE, 'save.json'))
let h: Harness
let data: string
let stamp: number

before(async () => {
  if (!present) return
  stamp = statSync(join(SOURCE, 'save.json')).mtimeMs
  data = copyNation(SOURCE, 'claudetopia')
  h = await harness({ data })
})
after(async () => {
  if (!present) return
  await h.close()
  rmSync(data, { recursive: true, force: true })
  assert.equal(statSync(join(SOURCE, 'save.json')).mtimeMs, stamp, 'the real Claudetopia was not touched')
})

test('the imported Claudetopia loads, sits on its agenda and ends a day', { skip: !present && 'data/nations/claudetopia is not here' }, async () => {
  const list = (await h.get('/api/nations')).json.nations
  assert.ok(list.some((n: any) => n.id === 'claudetopia' && n.name === 'Claudetopia' && !n.problem))
  const got = await h.get('/api/nations/claudetopia')
  assert.equal(got.status, 200, got.json.error)
  assert.equal(got.json.government.institutions.constitution.form, 'commonwealth')
  assert.ok(got.json.census.some((f: any) => f.id === 'population'))
  const state = deserialize(got.json.nation.state)
  const archive = (await h.get('/api/nations/claudetopia/archive?limit=1')).json
  assert.ok(archive.total >= 795)
  const search = (await h.get('/api/nations/claudetopia/archive?q=Steward&series=petition&limit=5')).json
  assert.ok(search.total > 0)
  const doc = (await h.get(`/api/nations/claudetopia/archive/${search.documents[0].id}`)).json
  assert.ok(doc.document.body.length > 0)

  // Its current agenda goes to the bodies, played by the stand-ins.
  const major = state.agenda.major!
  assert.ok(major)
  const govern = await h.put('/api/nations/claudetopia/mode', { mode: 'govern' })
  assert.equal(govern.status, 200)
  const convened = await h.post(`/api/nations/claudetopia/dockets/${major}/convene`)
  assert.equal(convened.status, 200, convened.json.error)
  const dockets = await settle(h, 'claudetopia', 400)
  const docket = dockets.find((d) => d.dilemma === major)
  assert.equal(docket.status, 'ready', docket.error)
  assert.equal(docket.number, got.json.government.petitions + 1)
  assert.ok(docket.sittings.length >= 1 && docket.reviews.length >= 1)
  assert.ok(docket.standing.explanation)

  const almanacBefore = (await h.get('/api/nations/claudetopia/archive?series=almanac&limit=1')).json.total
  const end = await h.post('/api/nations/claudetopia/end-day')
  assert.equal(end.status, 200, end.json.error)
  assert.equal(deserialize(end.json.nation.state).day, state.day + 1)
  const almanac = (await h.get('/api/nations/claudetopia/archive?series=almanac&limit=1')).json
  assert.equal(almanac.total, almanacBefore + 1)
  assert.equal(almanac.documents[0].day, state.day)
  const saved = JSON.parse(readFileSync(join(data, 'nations/claudetopia/save.json'), 'utf8'))
  assert.equal(saved.format, 2)
  assert.equal(deserialize(saved.state).day, state.day + 1)
})
