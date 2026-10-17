// Checks an imported nation folder: save.json parses as a SaveFile2, the engine
// deserializes its state, every document file round-trips through parseDocument and
// lives at its own documentPath, and every citation names a document that exists.
//
//   node scripts/claudetopia/verify.ts [data/nations/claudetopia]

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { deserialize } from '../../packages/engine/src/index.ts'
import { documentPath, parseDocument, serializeDocument } from '../../packages/government/src/documents.ts'
import type { ArchiveDocument, SaveFile2 } from '../../packages/government/src/types.ts'

const folder = resolve(process.argv[2] ?? join(import.meta.dirname, '../../data/nations/claudetopia'))
const problems: string[] = []
const save = JSON.parse(readFileSync(join(folder, 'save.json'), 'utf8')) as SaveFile2
if (save.format !== 2) problems.push('save.json: format is not 2')
const state = deserialize(save.state)
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))
const archive = join(folder, 'archive')
const docs: ArchiveDocument[] = []
for (const file of files(archive)) {
  const text = readFileSync(file, 'utf8')
  const parsed = parseDocument(text)
  const rel = relative(archive, file).replace(/\\/g, '/')
  if (!parsed.ok) {
    problems.push(`${rel}: ${parsed.problem}`)
    continue
  }
  if (documentPath(parsed.document) !== rel) problems.push(`${rel}: should be at ${documentPath(parsed.document)}`)
  if (serializeDocument(parsed.document) !== text) problems.push(`${rel}: does not write back byte for byte`)
  docs.push(parsed.document)
}
const ids = new Set(docs.map((d) => d.id))
for (const d of docs) for (const r of d.refs) if (!ids.has(r)) problems.push(`${d.id} cites ${r}, which is missing`)
const g = save.government
for (const w of g.words) if (!ids.has(w.document)) problems.push(`Word No. ${w.number}: document ${w.document} missing`)
for (const b of g.bills) if (b.document && !ids.has(b.document)) problems.push(`Bill No. ${b.number}: document ${b.document} missing`)
for (const d of g.directions) if (d.document && !ids.has(d.document)) problems.push(`a direction cites ${d.document}, missing`)
for (const q of g.questions) if (q.source && !ids.has(q.source)) problems.push(`${q.id}: source ${q.source} missing`)
const counts = new Map<string, number>()
for (const d of docs) counts.set(d.series, (counts.get(d.series) ?? 0) + 1)
console.log(`${folder}: day ${state.day}, ${state.timeline.length} timeline entries, ${docs.length} documents`)
console.log([...counts].sort().map(([s, n]) => `${s} ${n}`).join(', '))
if (problems.length) {
  console.error(`${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`)
  process.exit(1)
}
console.log('All documents round-trip; the save loads.')
