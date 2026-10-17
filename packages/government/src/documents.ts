// The Archive's file format: front matter, then Markdown. One document per file, written
// once and never edited. See docs/design/government.md, "The record".

import { SERIES, type ArchiveDocument, type Series } from './types.ts'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// The nation's own date for an engine day. Day 1 is the calendar's start (an ISO date).
export function dateOf(start: string, day: number): Date {
  const [y, m, d] = start.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + day - 1))
}

export function formatDate(start: string, day: number): string {
  const date = dateOf(start, day)
  return `${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

// The engine day an ISO date falls on, for imports. Never less than 1.
export function dayOf(start: string, iso: string): number {
  const ms = dateOf(iso, 1).getTime() - dateOf(start, 1).getTime()
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
}

export const docId = (series: Series, seq: number) => `${series}-${String(seq).padStart(5, '0')}`

export function slug(title: string): string {
  const s = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return s || 'untitled'
}

// The file a document lives in, relative to the nation's archive folder.
export function documentPath(doc: Pick<ArchiveDocument, 'id' | 'series' | 'title'>): string {
  const seq = doc.id.slice(doc.series.length + 1)
  return `${doc.series}/${seq}-${slug(doc.title)}.md`
}

// Each field is one line. Strings are written as JSON strings so that a colon, a quote or a
// newline in a title cannot break the head. data is one line of JSON.
export function serializeDocument(doc: ArchiveDocument): string {
  const lines = [
    '---',
    `id: ${doc.id}`,
    `series: ${doc.series}`,
    `title: ${JSON.stringify(doc.title)}`,
    `day: ${doc.day}`,
    `date: ${JSON.stringify(doc.date)}`,
    `issuer: ${JSON.stringify(doc.issuer)}`,
    `kind: ${JSON.stringify(doc.kind)}`,
    `refs: ${JSON.stringify(doc.refs)}`,
  ]
  if (doc.data !== undefined) lines.push(`data: ${JSON.stringify(doc.data)}`)
  lines.push('---', '')
  return lines.join('\n') + doc.body.replace(/\r\n/g, '\n').trimEnd() + '\n'
}

export type Parsed = { ok: true; document: ArchiveDocument } | { ok: false; problem: string }

export function parseDocument(text: string): Parsed {
  const normal = text.replace(/\r\n/g, '\n')
  if (!normal.startsWith('---\n')) return { ok: false, problem: 'it does not start with a head' }
  const end = normal.indexOf('\n---\n', 4)
  if (end < 0) return { ok: false, problem: 'its head is never closed' }
  const fields: Record<string, string> = {}
  for (const line of normal.slice(4, end).split('\n')) {
    const at = line.indexOf(': ')
    if (at < 0) return { ok: false, problem: `a line in its head has no value: ${line.slice(0, 40)}` }
    fields[line.slice(0, at)] = line.slice(at + 2)
  }
  try {
    const series = fields['series'] as Series
    if (!SERIES.includes(series)) return { ok: false, problem: `unknown series ${fields['series']}` }
    const day = Number(fields['day'])
    if (!Number.isSafeInteger(day) || day < 0) return { ok: false, problem: 'its day is not a whole number' }
    const refs: unknown = JSON.parse(fields['refs'] ?? '[]')
    if (!Array.isArray(refs) || !refs.every((r) => typeof r === 'string')) {
      return { ok: false, problem: 'its refs are not a list of ids' }
    }
    const str = (key: string) => {
      const v: unknown = JSON.parse(fields[key] ?? '""')
      if (typeof v !== 'string') throw new Error(`${key} is not text`)
      return v
    }
    const document: ArchiveDocument = {
      id: fields['id'] ?? '',
      series,
      title: str('title'),
      day,
      date: str('date'),
      issuer: str('issuer'),
      kind: str('kind'),
      refs,
      body: normal.slice(end + 5).replace(/^\n/, '').replace(/\n$/, ''),
      ...(fields['data'] === undefined ? {} : { data: JSON.parse(fields['data']) as unknown }),
    }
    if (!/^[a-z]+-\d{5}$/.test(document.id) || !document.id.startsWith(`${series}-`)) {
      return { ok: false, problem: `its id ${document.id} does not fit its series` }
    }
    return { ok: true, document }
  } catch (error) {
    return { ok: false, problem: `its head could not be read: ${(error as Error).message}` }
  }
}
