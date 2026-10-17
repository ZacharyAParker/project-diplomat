// The whole import, against the real State Archive when it is on this machine. Skipped
// elsewhere. Nothing is written.

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { deserialize } from '../../../packages/engine/src/index.ts'
import { parseDocument, serializeDocument } from '../../../packages/government/src/documents.ts'
import { buildImport, reportDocument } from '../build.ts'

const SOURCE = process.env['CLAUDETOPIA'] ?? 'H:/claudetopia'
const repo = resolve(import.meta.dirname, '../../..')

test('the Claudetopia archive imports whole', { skip: !existsSync(`${SOURCE}/00-INDEX.md`) && 'no archive at H:/claudetopia' }, () => {
  const result = buildImport(SOURCE, repo, 'claudetopia')
  const { save, documents } = result
  const state = deserialize(save.state)
  assert.equal(state.day, result.currentDay)
  assert.equal(state.identity.name, 'Claudetopia')
  assert.equal(state.cabinet['finance']?.name, 'Perpetua Glim')
  const g = save.government
  assert.equal(g.mode, 'found')
  assert.equal(g.origin, 'claudetopia-archive')
  const assembly = g.institutions.bodies.find((b) => b.id === 'assembly')!
  assert.equal(assembly.parties.reduce((s, p) => s + p.seats, 0), 151)
  assert.equal(assembly.parties.length, 7)
  assert.equal(g.institutions.bodies.find((b) => b.id === 'high-court')!.members.length, 7)
  assert.equal(g.institutions.bodies.filter((b) => b.kind === 'ministry').length, 11)
  assert.equal(g.institutions.constitution.rights.length, 20)
  assert.ok(g.institutions.constitution.articles.some((a) => a.number === '0'))
  assert.equal(g.censusBase.gdpPerHead, 44_400)
  const all = [...documents, reportDocument(result, documents.filter((d) => d.series === 'other').length + 1)]
  const ids = new Set<string>()
  for (const doc of all) {
    assert.ok(!ids.has(doc.id), `${doc.id} is used twice`)
    ids.add(doc.id)
    const back = parseDocument(serializeDocument(doc))
    assert.ok(back.ok, `${doc.id}: ${back.ok ? '' : back.problem}`)
    assert.equal(back.document.body, doc.body, `${doc.id}: body`)
    for (const r of doc.refs) assert.ok(r !== doc.id)
  }
  for (const doc of all) for (const r of doc.refs) assert.ok(ids.has(r), `${doc.id} cites ${r}, which is not in the archive`)
  for (const w of g.words) assert.ok(ids.has(w.document))
  assert.ok(documents.some((d) => d.id === 'petition-00017'))
})
