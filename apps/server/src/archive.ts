// One nation's Archive: every document on disk under archive/<series>/<seq>-<slug>.md, and an
// index of them in memory. Built at load by reading every file's head; kept up to date as
// documents are written. Documents are never edited: a correction is a new document.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import {
  documentPath,
  docId,
  parseDocument,
  serializeDocument,
  SERIES,
  type ArchiveDocument,
  type DocumentHead,
  type RecordQuery,
  type Series,
} from '@diplomat/government'

const EXTRACT = 600

interface Entry {
  doc: ArchiveDocument
  order: number
  // Lower-cased title, issuer and body, made when a search first needs it.
  haystack?: string
}

export interface SearchQuery {
  series?: string
  q?: string
  from?: number
  to?: number
  issuer?: string
  limit?: number
  offset?: number
}

export const headOf = (d: ArchiveDocument): DocumentHead => ({
  id: d.id,
  series: d.series,
  title: d.title,
  day: d.day,
  date: d.date,
  issuer: d.issuer,
  kind: d.kind,
  refs: [...d.refs],
})

export const extractOf = (body: string, size = EXTRACT) =>
  body
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, size)

// Nation folders that have been moved to the trash. Nothing may be written under one again,
// so a write still in flight when a nation was deleted can never recreate its folder.
const removed = new Set<string>()

export function markRemoved(dir: string) {
  removed.add(resolve(dir).toLowerCase())
}

export function unmarkRemoved(dir: string) {
  removed.delete(resolve(dir).toLowerCase())
}

export function guard(path: string) {
  const p = resolve(path).toLowerCase()
  for (const dir of removed) {
    if (p === dir || p.startsWith(dir + sep)) throw new Error('That nation has been deleted.')
  }
}

async function writeAtomic(path: string, text: string) {
  guard(path)
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  await writeFile(temp, text, 'utf8')
  await rename(temp, path)
}

export class Archive {
  readonly dir: string
  private entries = new Map<string, Entry>()
  private seqs = new Map<Series, number>()
  private cited = new Map<string, Set<string>>()
  private order = 0
  // Files that could not be read at load, with the reason. They are left where they are.
  readonly problems: string[] = []

  constructor(dir: string) {
    this.dir = dir
  }

  get size() {
    return this.entries.size
  }

  // Reads every document's file. Synchronous: it runs once, when a nation is opened.
  load() {
    const found: ArchiveDocument[] = []
    if (existsSync(this.dir)) {
      for (const series of readdirSync(this.dir, { withFileTypes: true })) {
        if (!series.isDirectory()) continue
        const folder = join(this.dir, series.name)
        for (const file of readdirSync(folder, { withFileTypes: true })) {
          if (!file.isFile() || !file.name.endsWith('.md')) continue
          const parsed = parseDocument(readFileSync(join(folder, file.name), 'utf8'))
          if (!parsed.ok) {
            this.problems.push(`${series.name}/${file.name}: ${parsed.problem}`)
            continue
          }
          found.push(parsed.document)
        }
      }
    }
    found.sort((a, b) => a.day - b.day || a.series.localeCompare(b.series) || a.id.localeCompare(b.id))
    for (const doc of found) {
      if (this.entries.has(doc.id)) {
        this.problems.push(`${doc.id}: the id is used twice; the second copy is not indexed`)
        continue
      }
      this.index(doc)
    }
  }

  private index(doc: ArchiveDocument) {
    this.entries.set(doc.id, { doc, order: this.order++ })
    const seq = Number(doc.id.slice(doc.series.length + 1))
    if (seq > (this.seqs.get(doc.series) ?? 0)) this.seqs.set(doc.series, seq)
    for (const ref of doc.refs) {
      let set = this.cited.get(ref)
      if (!set) this.cited.set(ref, (set = new Set()))
      set.add(doc.id)
    }
  }

  // Assigns the next id in a series and indexes the document at once, so that two writes in
  // flight never take the same number, then writes the file (temporary file, then rename).
  async write(doc: Omit<ArchiveDocument, 'id'>): Promise<string> {
    if (!SERIES.includes(doc.series)) throw new Error(`unknown series ${doc.series}`)
    const seq = (this.seqs.get(doc.series) ?? 0) + 1
    const full: ArchiveDocument = { ...structuredClone(doc), id: docId(doc.series, seq) } as ArchiveDocument
    const text = serializeDocument(full)
    const back = parseDocument(text)
    if (!back.ok) throw new Error(`a document could not be written: ${back.problem}`)
    // The number is taken at once, so two writes in flight never share it; the document is
    // indexed only once its file is on disk, so nothing cites a document that is not there.
    this.seqs.set(doc.series, seq)
    await writeAtomic(join(this.dir, documentPath(full)), text)
    this.index(back.document)
    return full.id
  }

  // For an import: documents that already have their ids.
  async writeExisting(docs: readonly ArchiveDocument[]) {
    for (const doc of docs) {
      if (this.entries.has(doc.id)) throw new Error(`${doc.id} is in the archive twice`)
      this.index(doc)
      await writeAtomic(join(this.dir, documentPath(doc)), serializeDocument(doc))
    }
  }

  get(id: string): ArchiveDocument | undefined {
    const e = this.entries.get(id)
    return e ? structuredClone(e.doc) : undefined
  }

  // Newest first: by day, then by the order they were written in.
  private sorted(filter: (e: Entry) => boolean): Entry[] {
    return [...this.entries.values()].filter(filter).sort((a, b) => b.doc.day - a.doc.day || b.order - a.order)
  }

  private hay(e: Entry): string {
    e.haystack ??= `${e.doc.title}\n${e.doc.issuer}\n${e.doc.body}`.toLowerCase()
    return e.haystack
  }

  search(query: SearchQuery): { documents: DocumentHead[]; total: number } {
    const terms = (query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    const issuer = query.issuer?.trim().toLowerCase()
    const all = this.sorted(
      (e) =>
        (!query.series || e.doc.series === query.series) &&
        (query.from === undefined || e.doc.day >= query.from) &&
        (query.to === undefined || e.doc.day <= query.to) &&
        (!issuer || e.doc.issuer.toLowerCase().includes(issuer)) &&
        terms.every((t) => this.hay(e).includes(t)),
    )
    const offset = Math.max(0, query.offset ?? 0)
    const limit = Math.min(500, Math.max(1, query.limit ?? 50))
    return { documents: all.slice(offset, offset + limit).map((e) => headOf(e.doc)), total: all.length }
  }

  citedBy(id: string): DocumentHead[] {
    const ids = this.cited.get(id)
    if (!ids) return []
    return this.sorted((e) => ids.has(e.doc.id)).map((e) => headOf(e.doc))
  }

  // What a brief is given: the record most relevant to the query, newest first. Documents
  // that match more of what was asked come first; if nothing matches, the most recent of
  // the series stand in.
  record(query: RecordQuery, bodyName?: string): { id: string; title: string; extract: string }[] {
    const limit = Math.max(1, Math.min(24, query.limit ?? 6))
    const pool = this.sorted((e) => !query.series || e.doc.series === query.series)
    const tags = (query.tags ?? []).map((t) => t.toLowerCase().replace(/[-_]/g, ' ')).filter(Boolean)
    const name = bodyName?.toLowerCase()
    const scored = pool
      .map((e) => {
        let score = 0
        if (query.dilemma && e.doc.refs.includes(query.dilemma)) score += 4
        if (name && e.doc.issuer.toLowerCase() === name) score += 2
        if (tags.length) score += tags.filter((t) => this.hay(e).includes(t)).length
        return { e, score }
      })
      .filter((x) => x.score > 0)
    const asked = query.dilemma || name || tags.length
    const chosen = (asked && scored.length ? scored.sort((a, b) => b.score - a.score || b.e.doc.day - a.e.doc.day || b.e.order - a.e.order).map((x) => x.e) : pool).slice(0, limit)
    chosen.sort((a, b) => b.doc.day - a.doc.day || b.order - a.order)
    return chosen.map((e) => ({ id: e.doc.id, title: e.doc.title, extract: extractOf(e.doc.body) }))
  }

  // Every document, oldest first, for an export.
  all(): ArchiveDocument[] {
    return [...this.entries.values()].sort((a, b) => a.order - b.order).map((e) => structuredClone(e.doc))
  }
}

export { writeAtomic }
