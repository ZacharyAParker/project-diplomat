// A small Markdown reader for the Archive's documents and the factbooks. It turns text into
// a tree that ui/Markdown.tsx draws as React elements, so nothing is ever handed to the
// browser as HTML: a tag in the text is printed as the text of a tag. It reads headings,
// paragraphs, lists (nested by indentation), pipe tables, block quotes, fenced and indented
// code, rules, strong, emphasis, inline code and links. Anything else is text.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'br' }

export type Align = 'left' | 'right' | 'center' | null

export type Block =
  | { t: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; c: Inline[]; id: string }
  | { t: 'paragraph'; c: Inline[] }
  | { t: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { t: 'quote'; c: Block[] }
  | { t: 'code'; v: string }
  | { t: 'rule' }
  | { t: 'table'; head: Inline[][]; align: Align[]; rows: Inline[][][] }

// Deep enough for any real document, and a stop for text built to recurse forever.
const MAX_DEPTH = 12

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const RULE = /^ {0,3}((\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/
const QUOTE = /^ {0,3}>/
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)(.*)$/
const SEPARATOR = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/

export function slugify(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section'
  )
}

export function plainText(inlines: readonly Inline[]): string {
  return inlines
    .map((node) => {
      if (node.t === 'text' || node.t === 'code') return node.v
      if (node.t === 'br') return ' '
      return plainText(node.c)
    })
    .join('')
}

// ---------------------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------------------

const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/

function pushText(out: Inline[], text: string) {
  if (text === '') return
  const last = out[out.length - 1]
  if (last?.t === 'text') last.v += text
  else out.push({ t: 'text', v: text })
}

// The index of the closing bracket for an opening one at `from`, allowing nesting.
function closingBracket(text: string, from: number): number {
  let depth = 0
  for (let i = from; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

const isWord = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch)

export function parseInline(text: string, depth = 0): Inline[] {
  const out: Inline[] = []
  if (depth > MAX_DEPTH) {
    pushText(out, text)
    return out
  }
  let i = 0
  while (i < text.length) {
    const ch = text[i]!

    if (ch === '\\' && i + 1 < text.length && PUNCTUATION.test(text[i + 1]!)) {
      pushText(out, text[i + 1]!)
      i += 2
      continue
    }

    if (ch === '\n') {
      // Two spaces (or a backslash) before a line break keep it; otherwise it is a space.
      const before = out[out.length - 1]
      if (before?.t === 'text' && / {2,}$/.test(before.v)) {
        before.v = before.v.replace(/ +$/, '')
        out.push({ t: 'br' })
      } else pushText(out, ' ')
      i++
      continue
    }

    if (ch === '`') {
      let run = 1
      while (text[i + run] === '`') run++
      const fence = '`'.repeat(run)
      const end = text.indexOf(fence, i + run)
      if (end > 0) {
        out.push({ t: 'code', v: text.slice(i + run, end).replace(/\n/g, ' ').replace(/^ (.+) $/, '$1') })
        i = end + run
        continue
      }
      pushText(out, fence)
      i += run
      continue
    }

    if ((ch === '*' || ch === '_') && text[i + 1] === ch) {
      const marker = ch + ch
      const end = text.indexOf(marker, i + 2)
      if (end > i + 2 && !/\s/.test(text[i + 2]!) && !(ch === '_' && isWord(text[i - 1]))) {
        out.push({ t: 'strong', c: parseInline(text.slice(i + 2, end), depth + 1) })
        i = end + 2
        continue
      }
    }

    if (ch === '*' || ch === '_') {
      let end = i + 1
      // The next single marker that is not half of a double one.
      while (true) {
        end = text.indexOf(ch, end)
        if (end < 0 || text[end + 1] !== ch) break
        end += 2
      }
      const opens = text[i + 1] !== undefined && !/\s/.test(text[i + 1]!) && !(ch === '_' && isWord(text[i - 1]))
      if (end > i + 1 && opens && !/\s/.test(text[end - 1]!) && !(ch === '_' && isWord(text[end + 1]))) {
        out.push({ t: 'em', c: parseInline(text.slice(i + 1, end), depth + 1) })
        i = end + 1
        continue
      }
    }

    if (ch === '[') {
      const close = closingBracket(text, i)
      if (close > 0 && text[close + 1] === '(') {
        const end = text.indexOf(')', close + 2)
        if (end > 0) {
          const target = text.slice(close + 2, end).trim()
          // A title after the address ("x" or 'x') is dropped.
          const href = target.replace(/\s+(".*"|'.*')$/, '').replace(/^<(.*)>$/, '$1')
          out.push({ t: 'link', href, c: parseInline(text.slice(i + 1, close), depth + 1) })
          i = end + 1
          continue
        }
      }
    }

    pushText(out, ch)
    i++
  }
  return out
}

// ---------------------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------------------

const blank = (line: string) => line.trim() === ''

function splitRow(line: string): string[] {
  let row = line.trim()
  if (row.startsWith('|')) row = row.slice(1)
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1)
  const cells: string[] = []
  let cell = ''
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '\\' && row[i + 1] === '|') {
      cell += '|'
      i++
    } else if (row[i] === '|') {
      cells.push(cell.trim())
      cell = ''
    } else cell += row[i]
  }
  cells.push(cell.trim())
  return cells
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return null
}

function startsTable(lines: readonly string[], i: number): boolean {
  const line = lines[i]
  const next = lines[i + 1]
  return line !== undefined && next !== undefined && line.includes('|') && SEPARATOR.test(next) && next.includes('-')
}

function startsBlock(lines: readonly string[], i: number): boolean {
  const line = lines[i]!
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    ITEM.test(line) ||
    startsTable(lines, i)
  )
}

function indentOf(line: string): number {
  let n = 0
  for (const ch of line) {
    if (ch === ' ') n++
    else if (ch === '\t') n += 4 - (n % 4)
    else break
  }
  return n
}

// Takes up to `count` columns of indentation off a line.
function dedent(line: string, count: number): string {
  let taken = 0
  let i = 0
  while (i < line.length && taken < count) {
    if (line[i] === ' ') taken++
    else if (line[i] === '\t') taken += 4 - (taken % 4)
    else break
    i++
  }
  return line.slice(i)
}

function parseBlocks(lines: readonly string[], depth: number, ids: Map<string, number>): Block[] {
  const blocks: Block[] = []
  if (depth > MAX_DEPTH) {
    const text = lines.join('\n').trim()
    if (text) blocks.push({ t: 'paragraph', c: [{ t: 'text', v: text }] })
    return blocks
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (blank(line)) {
      i++
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const mark = fence[1]!
      const body: string[] = []
      i++
      while (i < lines.length && !new RegExp(`^ {0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}[ \\t]*$`).test(lines[i]!)) {
        body.push(lines[i]!)
        i++
      }
      i++
      blocks.push({ t: 'code', v: body.join('\n') })
      continue
    }

    if (indentOf(line) >= 4) {
      const body: string[] = []
      while (i < lines.length && (indentOf(lines[i]!) >= 4 || blank(lines[i]!))) {
        body.push(dedent(lines[i]!, 4))
        i++
      }
      while (body.length && blank(body[body.length - 1]!)) body.pop()
      blocks.push({ t: 'code', v: body.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const c = parseInline((heading[2] ?? '').trim(), depth)
      const base = slugify(plainText(c))
      const seen = ids.get(base) ?? 0
      ids.set(base, seen + 1)
      blocks.push({
        t: 'heading',
        level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6,
        c,
        id: seen ? `${base}-${seen + 1}` : base,
      })
      i++
      continue
    }

    if (RULE.test(line)) {
      blocks.push({ t: 'rule' })
      i++
      continue
    }

    if (QUOTE.test(line)) {
      const body: string[] = []
      while (i < lines.length && !blank(lines[i]!)) {
        const current = lines[i]!
        if (QUOTE.test(current)) body.push(current.replace(/^ {0,3}> ?/, ''))
        else if (body.length && !startsBlock(lines, i)) body.push(current)
        else break
        i++
      }
      blocks.push({ t: 'quote', c: parseBlocks(body, depth + 1, ids) })
      continue
    }

    if (startsTable(lines, i)) {
      const head = splitRow(line)
      const align = splitRow(lines[i + 1]!).map(alignOf)
      i += 2
      const rows: Inline[][][] = []
      while (i < lines.length && !blank(lines[i]!) && lines[i]!.includes('|')) {
        const cells = splitRow(lines[i]!)
        rows.push(head.map((_, k) => parseInline(cells[k] ?? '', depth)))
        i++
      }
      blocks.push({
        t: 'table',
        head: head.map((cell) => parseInline(cell, depth)),
        align: head.map((_, k) => align[k] ?? null),
        rows,
      })
      continue
    }

    const item = ITEM.exec(line)
    if (item) {
      const ordered = /\d/.test(item[2]!)
      const start = ordered ? Number.parseInt(item[2]!, 10) : 1
      const items: Block[][] = []
      const indent = item[1]!.length
      while (i < lines.length) {
        const head = ITEM.exec(lines[i]!)
        if (!head || head[1]!.length !== indent || /\d/.test(head[2]!) !== ordered) break
        const inner = head[1]!.length + head[2]!.length + Math.max(1, Math.min(4, head[3]!.length))
        const body = [head[4] ?? '']
        i++
        while (i < lines.length) {
          const next = lines[i]!
          if (blank(next)) {
            // A blank line ends the item unless what follows is indented to belong to it.
            let k = i + 1
            while (k < lines.length && blank(lines[k]!)) k++
            if (k < lines.length && indentOf(lines[k]!) >= inner) {
              for (; i < k; i++) body.push('')
              continue
            }
            break
          }
          if (indentOf(next) >= inner) body.push(dedent(next, inner))
          else if (ITEM.test(next) || startsBlock(lines, i)) break
          else body.push(next.trim())
          i++
        }
        items.push(parseBlocks(body, depth + 1, ids))
        // Blank lines between items keep the list going.
        let k = i
        while (k < lines.length && blank(lines[k]!)) k++
        const again = k < lines.length ? ITEM.exec(lines[k]!) : null
        if (again && again[1]!.length === indent && /\d/.test(again[2]!) === ordered) i = k
        else break
      }
      blocks.push({ t: 'list', ordered, start, items })
      continue
    }

    const body: string[] = []
    while (i < lines.length && !blank(lines[i]!) && (body.length === 0 || !startsBlock(lines, i))) {
      body.push(lines[i]!.replace(/^ {0,3}/, ''))
      i++
    }
    blocks.push({ t: 'paragraph', c: parseInline(body.join('\n').replace(/\s+$/, ''), depth) })
  }
  return blocks
}

export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  return parseBlocks(lines, 0, new Map())
}

// The document's own contents: its headings, for the side column.
export function headings(blocks: readonly Block[]): { level: number; text: string; id: string }[] {
  const found: { level: number; text: string; id: string }[] = []
  const walk = (list: readonly Block[]) => {
    for (const block of list) {
      if (block.t === 'heading') found.push({ level: block.level, text: plainText(block.c), id: block.id })
      else if (block.t === 'quote') walk(block.c)
    }
  }
  walk(blocks)
  return found
}
