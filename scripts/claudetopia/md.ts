// Markdown helpers for reading the Claudetopia State Archive. Ported from the archive's
// own government website (H:\claudetopia\site\cw\markdown.py, archive.py, facts.py), so
// that a file is divided into documents, and a table is read, exactly as the old site
// did it. Nothing here writes anything.

export const FENCE = /^\s*(```|~~~)/
const HEADING = /^(#{1,6})\s+(.*?)\s*$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
export const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/

const MONTHS: Record<string, number> = {}
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
MONTH_NAMES.forEach((m, i) => {
  MONTHS[m.toLowerCase()] = i + 1
  MONTHS[m.toLowerCase().slice(0, 3)] = i + 1
})
MONTHS['sept'] = 9

const DATE_WORDS_SRC =
  String.raw`\b(\d{1,2})(?:[–-]\d{1,2})? (January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.? (\d{4})\b`
const DATE_WORDS = new RegExp(DATE_WORDS_SRC)
const DATE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/
const INWORLD = new RegExp(String.raw`in-world[^.\n;|]*?` + DATE_WORDS_SRC)

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const iso = (y: string, mon: string, d: string) => {
  const key = mon.toLowerCase()
  return `${y}-${pad(MONTHS[key] ?? MONTHS[key.slice(0, 3)] ?? 1)}-${pad(Number(d))}`
}

// The first date in a text as an ISO date, and whether it was marked in-world. An
// "in-world" date wins over a real one, as archive.find_date has it.
export function findDate(text: string, preferInworld = true): { iso: string; kind: 'in-world' | 'record' } | null {
  if (preferInworld) {
    const m = INWORLD.exec(text)
    if (m) return { iso: iso(m[3]!, m[2]!, m[1]!), kind: 'in-world' }
  }
  let best: { at: number; iso: string } | null = null
  const w = DATE_WORDS.exec(text)
  if (w) best = { at: w.index, iso: iso(w[3]!, w[2]!, w[1]!) }
  const i = DATE_ISO.exec(text)
  if (i && (best === null || i.index < best.at)) best = { at: i.index, iso: i[0] }
  return best ? { iso: best.iso, kind: 'record' } : null
}

// Plain text of an inline Markdown fragment.
export function stripMd(text: string): string {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*+/g, '')
    .trim()
}

export const flat = (text: string) => text.split(/\s+/).filter(Boolean).join(' ')

export function slugify(text: string): string {
  const s = text
    .replace(/[*_`]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s.slice(0, 80).replace(/-+$/g, '') || 'section'
}

export function clip(text: string, n = 260): string {
  const t = flat(text)
  if (t.length <= n) return t
  const cut = t.slice(0, n)
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '))
  if (stop > n * 0.5) return cut.slice(0, stop + 1)
  return cut.slice(0, cut.lastIndexOf(' ')) + ' …'
}

// ---------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------

export interface Heading {
  level: number
  title: string // plain
  raw: string // as written
  line: number // 0-based index
  end: number // exclusive: the next heading of the same or higher level
}

// Every heading outside fenced code, with where its section ends.
export function headings(text: string): { heads: Heading[]; lines: string[] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const heads: Heading[] = []
  let inFence = false
  lines.forEach((line, i) => {
    if (FENCE.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const m = HEADING.exec(line)
    if (m) heads.push({ level: m[1]!.length, title: stripMd(m[2]!), raw: m[2]!, line: i, end: lines.length })
  })
  heads.forEach((h, k) => {
    const next = heads.slice(k + 1).find((h2) => h2.level <= h.level)
    if (next) h.end = next.line
  })
  return { heads, lines }
}

// Drops trailing blank lines and rules, the way the site trimmed a section.
export function trimTail(lines: string[]): string[] {
  const out = [...lines]
  while (out.length && ['', '---'].includes(out[out.length - 1]!.trim())) out.pop()
  return out
}

export const joinBody = (lines: string[]) => trimTail(lines).join('\n').replace(/^\n+/, '').replace(/\s+$/, '')

export interface Part {
  // null for the text before the first section (a file's preface).
  title: string | null
  rawTitle: string | null
  body: string
  line: number
}

// A file divided at one heading level, as archive._divide did with 'sections'. The text
// before the first section (after the file's own title when level is 1) is returned as a
// preface part, so that nothing is dropped. Headings inside fences never divide.
export function divide(text: string, level: number): { fileTitle: string; parts: Part[] } {
  const { heads, lines } = headings(text)
  let fileTitle = ''
  let start = 0
  const first = heads[0]
  if (first && first.level === 1 && lines.slice(0, first.line).every((l) => !l.trim())) {
    fileTitle = first.title
    start = first.line + 1
  }
  const marks = heads.filter((h) => h.level === level && h.line >= start)
  const parts: Part[] = []
  const prefaceEnd = marks.length ? marks[0]!.line : lines.length
  const preface = joinBody(lines.slice(start, prefaceEnd))
  if (preface.trim()) parts.push({ title: null, rawTitle: null, body: preface, line: start })
  marks.forEach((h, k) => {
    // a higher heading than the level closes the document, but its text belongs to the next
    // part or, failing that, is kept with this one: nothing is dropped
    const end = k + 1 < marks.length ? marks[k + 1]!.line : lines.length
    parts.push({ title: h.title, rawTitle: h.raw, body: joinBody(lines.slice(h.line + 1, end)), line: h.line })
  })
  return { fileTitle, parts }
}

// Markdown under the first heading matching the pattern.
export function sectionMd(text: string, pattern: RegExp): string | null {
  const { heads, lines } = headings(text)
  const h = heads.find((x) => pattern.test(x.title))
  if (!h) return null
  return joinBody(lines.slice(h.line + 1, h.end))
}

// ---------------------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------------------

export function splitRow(input: string): string[] {
  let line = input.trim()
  if (line.startsWith('|')) line = line.slice(1)
  if (line.endsWith('|') && !line.endsWith('\\|')) line = line.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  let inCode = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '\\' && line[i + 1] === '|') {
      cur += '|'
      i++
      continue
    }
    if (ch === '`') inCode = !inCode
    if (ch === '|' && !inCode) {
      cells.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  cells.push(cur.trim())
  return cells
}

// Joins a headerless block of pipe rows to the table above it, where only blank lines
// part them and the column count matches (markdown.heal_tables).
export function healTables(lines: string[]): string[] {
  const out: string[] = []
  let lastCols: number | null = null
  let blanks = 0
  let inFence = false
  let inTable = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (FENCE.test(line)) inFence = !inFence
    if (inFence) {
      out.push(line)
      lastCols = null
      inTable = false
      continue
    }
    if (line.trimStart().startsWith('|')) {
      if (!inTable) {
        const next = lines[i + 1] ?? ''
        const startsTable = TABLE_SEP.test(next) && next.includes('|')
        if (!startsTable && lastCols !== null && blanks > 0 && splitRow(line).length === lastCols) {
          for (let b = 0; b < blanks; b++) out.pop()
        } else if (startsTable) lastCols = splitRow(line).length
        else lastCols = null
        inTable = true
      }
      blanks = 0
      out.push(line)
    } else {
      inTable = false
      if (!line.trim()) blanks++
      else {
        lastCols = null
        blanks = 0
      }
      out.push(line)
    }
  }
  return out
}

export interface Table {
  header: string[] // plain
  rows: string[][] // raw cells
  line: number
  heading: string // nearest heading above
  lead: string // last non-blank, non-table line above
}

export function readTables(text: string): Table[] {
  const lines = healTables(text.replace(/\r\n/g, '\n').split('\n'))
  const tables: Table[] = []
  let heading = ''
  let lead = ''
  let inFence = false
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (FENCE.test(line)) {
      inFence = !inFence
      i++
      continue
    }
    if (inFence) {
      i++
      continue
    }
    const m = HEADING.exec(line)
    if (m) {
      heading = m[2]!.replace(/[*_`]/g, '').trim()
      lead = ''
      i++
      continue
    }
    const next = lines[i + 1]
    if (line.trimStart().startsWith('|') && next !== undefined && TABLE_SEP.test(next) && next.includes('|')) {
      const header = splitRow(line).map((c) => c.replace(/[*_`]/g, '').trim())
      let j = i + 2
      const rows: string[][] = []
      while (j < lines.length && lines[j]!.trimStart().startsWith('|')) rows.push(splitRow(lines[j++]!))
      tables.push({ header, rows, line: i + 1, heading, lead })
      i = j
      continue
    }
    if (line.trim()) lead = line.trim()
    i++
  }
  return tables
}

// The first table whose header begins with the given column names.
export function byHeader(tables: Table[], ...start: string[]): Table | undefined {
  const want = start.map((s) => s.toLowerCase())
  return tables.find((t) => {
    const head = t.header.slice(0, want.length).map((h) => h.toLowerCase())
    return head.length === want.length && head.every((h, k) => h.startsWith(want[k]!))
  })
}

// A row as an object keyed by lower-cased header.
export function rowObject(table: Table, row: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  table.header.forEach((h, k) => (out[h.toLowerCase()] = row[k] ?? ''))
  return out
}

export function num(cell: string): number | null {
  const m = /-?\d+/.exec(stripMd(cell).replace(/,/g, ''))
  return m ? Number(m[0]) : null
}

// Paragraphs and single list items, as facts.blocks did.
export function blocks(text: string): string[] {
  const out: string[] = []
  let cur: string[] = []
  let inFence = false
  for (const line of text.split('\n')) {
    if (FENCE.test(line)) inFence = !inFence
    if (inFence) {
      cur.push(line)
      continue
    }
    if (!line.trim()) {
      if (cur.length) out.push(cur.join('\n'))
      cur = []
      continue
    }
    if (/^([-*+]|\d+[.)])\s+/.test(line) && cur.length) {
      out.push(cur.join('\n'))
      cur = []
    }
    cur.push(line)
  }
  if (cur.length) out.push(cur.join('\n'))
  return out
}

// Every section of a text at '## ' (and only '## '), heading and lines, for the files whose
// sections are records with fields: letters, replies, drafts, the question queue.
export function level2Sections(text: string): { heading: string; lines: string[] }[] {
  const sections: { heading: string; lines: string[] }[] = []
  let cur: { heading: string; lines: string[] } | null = null
  for (const ln of text.replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^##(?!#)\s*(.*?)\s*$/.exec(ln)
    if (m) {
      cur = { heading: m[1]!, lines: [] }
      sections.push(cur)
    } else if (cur) cur.lines.push(ln)
  }
  return sections
}
