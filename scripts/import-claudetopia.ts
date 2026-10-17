// Brings the nation of Claudetopia into Project Diplomat 0.6 from its State Archive.
//
//   node scripts/import-claudetopia.ts [--source H:\claudetopia] [--data <repo>/data] [--id claudetopia] [--dry-run] [--force]
//
// Writes data/nations/<id>/save.json and data/nations/<id>/archive/<series>/<seq>-<slug>.md,
// one document per file, and an import report (series 'other'). The source is only read.
// An existing nation folder is never overwritten without --force.

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { documentPath, parseDocument, serializeDocument } from '../packages/government/src/documents.ts'
import { buildImport, reportDocument } from './claudetopia/build.ts'

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const value = (flag: string, fallback: string) => {
  const at = args.indexOf(flag)
  return at >= 0 && args[at + 1] ? args[at + 1]! : fallback
}
const source = resolve(value('--source', 'H:\\claudetopia'))
const data = resolve(value('--data', join(root, 'data')))
const id = value('--id', 'claudetopia')
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')

if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
  console.error(`The id “${id}” must be lower-case letters, digits and hyphens.`)
  process.exit(1)
}
if (!existsSync(join(source, '00-INDEX.md'))) {
  console.error(`${source} does not look like the Claudetopia State Archive (no 00-INDEX.md). Pass --source.`)
  process.exit(1)
}
if (resolve(data).toLowerCase().startsWith(resolve(source).toLowerCase())) {
  console.error('The data folder may not be inside the source archive, which is read only.')
  process.exit(1)
}
const folder = join(data, 'nations', id)
if (!dryRun && existsSync(folder) && !force) {
  console.error(`${folder} already exists. Pass --force to replace it.`)
  process.exit(1)
}

const result = buildImport(source, root, id)
const otherCount = result.documents.filter((d) => d.series === 'other').length
const reportDoc = reportDocument(result, otherCount + 1)
const documents = [...result.documents, reportDoc]

// Every document must survive its own file format before anything is written.
const failures: string[] = []
const seen = new Set<string>()
for (const doc of documents) {
  if (seen.has(doc.id)) failures.push(`${doc.id}: the id is used twice`)
  seen.add(doc.id)
  const back = parseDocument(serializeDocument(doc))
  if (!back.ok) failures.push(`${doc.id}: ${back.problem}`)
  else if (back.document.body !== doc.body || back.document.title !== doc.title || JSON.stringify(back.document.data) !== JSON.stringify(doc.data)) {
    failures.push(`${doc.id}: does not read back as written`)
  }
}
if (failures.length) {
  console.error(`${failures.length} document(s) would not round-trip; nothing written:\n  ${failures.slice(0, 20).join('\n  ')}`)
  process.exit(1)
}

const counts = new Map<string, number>()
for (const d of documents) counts.set(d.series, (counts.get(d.series) ?? 0) + 1)
const g = result.save.government
console.log(`Claudetopia, in-world day ${result.currentDay} (${reportDoc.date})`)
console.log(`  documents: ${documents.length}`)
for (const [series, n] of [...counts].sort()) console.log(`    ${series.padEnd(10)} ${n}`)
console.log(`  bodies: ${g.institutions.bodies.length} (${g.institutions.bodies.find((b) => b.id === 'assembly')?.parties.length} parties, ${g.institutions.bodies.find((b) => b.id === 'assembly')?.members.length} members; ${g.institutions.bodies.find((b) => b.id === 'high-court')?.members.length} justices)`)
console.log(`  constitution: ${g.institutions.constitution.articles.length} articles, ${g.institutions.constitution.rights.length} rights; canon ${g.institutions.canon.length} lines`)
console.log(`  words ${g.words.length}, questions ${g.questions.length}, letters ${g.letters.length}, bills ${g.bills.length}, directions ${g.directions.length}, factbooks ${g.factbooks.length}`)
console.log(`  timeline entries: ${result.state.timeline.length}`)
console.log(`  unparsed sections kept whole: ${result.report.unparsed.length}; reading problems: ${result.report.problems.length} (see ${reportDoc.id})`)

if (dryRun) {
  console.log(`Dry run: nothing written. Would write ${folder}`)
  process.exit(0)
}

const temp = `${folder}.importing-${process.pid}`
rmSync(temp, { recursive: true, force: true })
mkdirSync(join(temp, 'archive'), { recursive: true })
writeFileSync(join(temp, 'save.json'), `${JSON.stringify(result.save, null, 2)}\n`)
for (const doc of documents) {
  const path = join(temp, 'archive', documentPath(doc))
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, serializeDocument(doc))
}
if (existsSync(folder)) rmSync(folder, { recursive: true, force: true })
mkdirSync(dirname(folder), { recursive: true })
renameSync(temp, folder)
console.log(`Written: ${folder}`)
