// Readers for the structured parts of the Claudetopia State Archive: seats and members,
// justices, divisions in Hansard, the Court's tables of votes, petitions, the Founder's
// Words, questions, letters, replies and drafts, bills, directions, the constitution and
// the charter. Each is a port of what the old site (H:\claudetopia\site\cw) already knew.
// Every reader returns what it could read and the problems it met; nothing is invented to
// cover a failed reading.

import {
  blocks,
  byHeader,
  divide,
  findDate,
  flat,
  headings,
  joinBody,
  level2Sections,
  num,
  readTables,
  rowObject,
  RULE,
  sectionMd,
  slugify,
  stripMd,
  type Table,
} from './md.ts'

export const ownId = (name: string) => slugify(name.replace(/^the\s+/i, ''))

// ---------------------------------------------------------------------------------------
// The Assembly (government/legislature.md)
// ---------------------------------------------------------------------------------------

export interface ParsedParty {
  id: string
  name: string
  nickname: string
  seats: number
  colourName: string
  side: string
  description: string
  leader: string
}

export interface ParsedMember {
  id: string
  name: string
  party: string
  office: string
  character: string
}

function bulletFields(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const b of blocks(text)) {
    const m = /^- \*\*(.+?):\*\*\s*([\s\S]*)$/.exec(b) ?? /^- \*(.+?):\*\s*([\s\S]*)$/.exec(b)
    if (!m) continue
    // the first bullet often carries "Colour: x. **Symbol:** y"
    out[m[1]!.trim()] = flat(m[2]!).split(/\s+\*\*[A-Z][a-z]+:\*\*/)[0]!.trim()
  }
  return out
}

// A member's paragraph: "**Name** — Office. Seat. Aged N." and the bullets under it.
function readMembers(text: string, party: string): ParsedMember[] {
  const members: ParsedMember[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /^\*\*([^*]+)\*\*\s+—\s+(.*)$/.exec(lines[i]!)
    if (!m) continue
    let head = m[2]!
    let j = i + 1
    while (j < lines.length && lines[j]!.trim() && !lines[j]!.startsWith('- ') && !/^\*\*[^*]+\*\*\s+—/.test(lines[j]!)) head += ' ' + lines[j++]!.trim()
    const start = j
    while (j < lines.length && !/^\*\*[^*]+\*\*\s+—/.test(lines[j]!) && !/^#/.test(lines[j]!)) j++
    const fields = bulletFields(lines.slice(start, j).join('\n'))
    const name = stripMd(m[1]!).trim()
    const office = stripMd(head.split(/\.\s/)[0]!).replace(/\.$/, '').trim()
    const character = [fields['Temperament'], fields['Speaking style'] && `Speaks: ${fields['Speaking style']}`, fields['Quote'] && `“${stripMd(fields['Quote']).replace(/^["“]|["”]$/g, '')}”`]
      .filter(Boolean)
      .map((s) => stripMd(s!))
      .join(' ')
    members.push({ id: slugify(name.replace(/"[^"]*"/g, '')), name, party, office, character: character || stripMd(head) })
    i = j - 1
  }
  return members
}

export function parseLegislature(text: string): { parties: ParsedParty[]; members: ParsedMember[]; speaker: string; problems: string[] } {
  const problems: string[] = []
  const tables = readTables(text)
  const t = byHeader(tables, 'Party', 'Nickname', 'Seats')
  const parties: ParsedParty[] = []
  if (!t) problems.push('The table of parties and seats (Party, Nickname, Seats) was not found in government/legislature.md.')
  else {
    let total: number | null = null
    for (const row of t.rows) {
      const c = rowObject(t, row)
      const name = stripMd(c['party'] ?? '')
      const seats = num(c['seats'] ?? '')
      if (name.toLowerCase() === 'total') {
        total = seats
        continue
      }
      if (seats === null) {
        problems.push(`The seats of “${name}” could not be read as a number.`)
        continue
      }
      parties.push({
        id: ownId(name),
        name,
        nickname: stripMd(c['nickname'] ?? ''),
        seats,
        colourName: stripMd(c['colour'] ?? ''),
        side: stripMd(c['side'] ?? ''),
        description: '',
        leader: '',
      })
    }
    const sum = parties.reduce((s, p) => s + p.seats, 0)
    if (total !== null && sum !== total) problems.push(`The parties' seats add to ${sum} but the table's total says ${total}.`)
  }
  const { heads, lines } = headings(text)
  const members: ParsedMember[] = []
  const find = (name: string) => parties.find((p) => p.id === ownId(name) || ownId(name).startsWith(p.id) || p.id.startsWith(ownId(name)))
  for (const h of heads) {
    const body = lines.slice(h.line + 1, h.end).join('\n')
    const pm = /^\d+\.\d+\s+(.*?)\s+—\s+["“](.*?)["”]\s+—\s+(\d+) seats/.exec(h.title)
    if (pm) {
      const p = find(pm[1]!)
      if (p) {
        const f = bulletFields(body)
        p.description = [f['Ideology'], f['How they talk']].filter(Boolean).map((s) => stripMd(s!)).join(' ')
        if (Number(pm[3]) !== p.seats) problems.push(`${p.name}: its own section says ${pm[3]} seats, the table ${p.seats}.`)
      }
    }
    const mm = /^10\.\d+\s+(.*)$/.exec(h.title)
    if (mm) {
      const p = find(mm[1]!)
      if (p) members.push(...readMembers(body, p.id))
    }
  }
  for (const p of parties) {
    const leader = members.find((m) => m.party === p.id && /^Leader\b/.test(m.office))
    if (leader) p.leader = leader.name
    else problems.push(`No member marked “Leader” was found for ${p.name} in section 10.`)
  }
  const speakerMatch = /###\s+3\.1 The Speaker\s+\*\*([^*]+)\*\*/.exec(text)
  return { parties, members, speaker: speakerMatch ? speakerMatch[1]!.trim() : '', problems }
}

// Which party a row of a division table speaks for. The Speaker sits in the Keepers' 22.
export function partyOfRow(name: string, parties: { id: string; name: string }[], officers: Record<string, string> = {}): string | null {
  const key = stripMd(name).toLowerCase().replace(/^the\s+/, '').replace(/\(.*\)/, '').trim()
  if (officers[key]) return officers[key]!
  if (key === 'speaker') return parties.find((p) => p.id.startsWith('keepers'))?.id ?? null
  const word = key.split(/[\s']+/)[0]
  return parties.find((p) => ownId(p.name).split('-')[0] === word)?.id ?? null
}

// ---------------------------------------------------------------------------------------
// The High Court (government/judiciary.md)
// ---------------------------------------------------------------------------------------

export interface ParsedJustice {
  id: string
  name: string
  office: string
  surname: string
  philosophy: string
  character: string
}

export function parseJudiciary(text: string): { justices: ParsedJustice[]; problems: string[] } {
  const problems: string[] = []
  const { heads, lines } = headings(text)
  const justices: ParsedJustice[] = []
  for (const h of heads) {
    const m = /^\d+\.\d+\s+(Chief Justice|Justice)\s+(.+)$/.exec(h.title)
    if (!m) continue
    const body = lines.slice(h.line + 1, h.end).join('\n')
    const para = (label: string) => {
      const p = new RegExp(String.raw`\*\*${label}\.\*\*\s*([\s\S]*?)(?:\n\s*\n|$)`).exec(body)
      return p ? flat(p[1]!) : ''
    }
    const name = m[2]!.trim()
    const philosophy = para('Philosophy')
    if (!philosophy) problems.push(`No paragraph marked “Philosophy.” was found for ${name}.`)
    justices.push({
      id: slugify(name),
      name,
      office: m[1]!,
      surname: name.split(/\s+/).pop()!,
      philosophy: stripMd(philosophy),
      character: stripMd([para('Temperament'), para('Signature line') && `Signature line: ${para('Signature line')}`].filter(Boolean).join(' ')),
    })
  }
  if (justices.length !== 7) problems.push(`Section 6 of the judiciary handbook yielded ${justices.length} justices, not seven.`)
  return { justices, problems }
}

// ---------------------------------------------------------------------------------------
// Hansard divisions
// ---------------------------------------------------------------------------------------

export interface ParsedDivision {
  question: string
  heading: string
  aye: number
  no: number
  abstain: number
  present: number
  byParty: Record<string, { aye: number; no: number; abstain: number }>
  result: string
  reached: string
  problem?: string
}

export function parseDivisions(body: string, parties: { id: string; name: string }[], officers: Record<string, string> = {}): { divisions: ParsedDivision[]; ladders: ParsedLadder[]; summary: { question: string; aye: number | null; no: number | null; abstain: number | null; result: string }[]; problems: string[] } {
  const problems: string[] = []
  const tables = readTables(body)
  const st = byHeader(tables, 'Question', 'Aye', 'No', 'Abstain')
  const summary = (st?.rows ?? []).map((row) => {
    const c = rowObject(st!, row)
    return {
      question: stripMd(c['question'] ?? ''),
      aye: num(c['aye'] ?? ''),
      no: num(c['no'] ?? ''),
      abstain: num(c['abstain'] ?? ''),
      result: stripMd(c['result'] ?? ''),
      reached: stripMd(c['reached 101'] ?? ''),
      used: false,
    }
  })
  const divisions: ParsedDivision[] = []
  const ladders: ParsedLadder[] = []
  for (const t of tables) {
    // "Low" is the Counting of Lamps' word for an abstention: a lamp kept low
    const head = t.header.map((h) => (h.toLowerCase() === 'low' ? 'abstain' : h.toLowerCase()))
    if (head[0] !== 'party' || !['present', 'aye', 'no', 'abstain'].every((c) => head.includes(c))) {
      if (head[0] === 'party' && head.includes('ballots')) ladders.push(readLadder(t, head, parties, officers))
      continue
    }
    const idx = ['present', 'aye', 'no', 'abstain'].map((c) => head.indexOf(c))
    const byParty: ParsedDivision['byParty'] = {}
    let total: (number | null)[] | null = null
    let present = 0
    let problem: string | undefined
    for (const row of t.rows) {
      const name = stripMd(row[0] ?? '')
      const vals = idx.map((k) => num(row[k] ?? ''))
      if (name.toLowerCase() === 'total') {
        total = vals
        continue
      }
      const id = partyOfRow(name, parties, officers)
      if (!id) {
        problem = `a row “${name}” names no party of the House`
        continue
      }
      const cur = byParty[id] ?? { aye: 0, no: 0, abstain: 0 }
      cur.aye += vals[1] ?? 0
      cur.no += vals[2] ?? 0
      cur.abstain += vals[3] ?? 0
      byParty[id] = cur
      present += vals[0] ?? 0
    }
    const sums = Object.values(byParty).reduce((s, p) => ({ aye: s.aye + p.aye, no: s.no + p.no, abstain: s.abstain + p.abstain }), { aye: 0, no: 0, abstain: 0 })
    if (!total || total.some((v) => v === null)) problem = problem ?? 'no readable total row'
    else if (total[1] !== sums.aye || total[2] !== sums.no || total[3] !== sums.abstain) {
      problem = problem ?? `the parties' figures (${sums.aye}–${sums.no}–${sums.abstain}) do not add to the printed total (${total[1]}–${total[2]}–${total[3]}); the total is kept as printed`
    }
    const aye = total?.[1] ?? sums.aye
    const no = total?.[2] ?? sums.no
    const abstain = total?.[3] ?? sums.abstain
    const match = summary.find((s) => !s.used && s.aye === aye && s.no === no && s.abstain === abstain)
    let question = ''
    let result = ''
    let reached = ''
    if (match) {
      match.used = true
      question = match.question
      result = match.result
      reached = match.reached
    } else {
      const m = /divided on (?:the )?(?:main )?question:?\s*(.*)$/i.exec(stripMd(t.lead))
      question = (m?.[1]?.trim().replace(/[ .*]+$/, '') || '') || t.heading
    }
    if (problem) problems.push(`division “${question}”: ${problem}`)
    divisions.push({ question, heading: t.heading, aye: aye ?? 0, no: no ?? 0, abstain: abstain ?? 0, present: total?.[0] ?? present, byParty, result, reached, ...(problem ? { problem } : {}) })
  }
  for (const s of summary) if (!s.used && s.aye !== null) problems.push(`the summary lists “${s.question}” (${s.aye}–${s.no}–${s.abstain}) with no party-by-party table`)
  return { divisions, ladders, summary: summary.map(({ used: _u, ...s }) => s), problems }
}

// The Ladder: first preferences by party ("Party | Ballots | Option 1 | … | Let it lie").
export interface ParsedLadder {
  heading: string
  courses: string[]
  byParty: Record<string, Record<string, number>>
  total: Record<string, number> | null
}

function readLadder(t: Table, head: string[], parties: { id: string; name: string }[], officers: Record<string, string>): ParsedLadder {
  const cols = head.map((h, k) => ({ h, k })).filter(({ h }) => h !== 'party' && h !== 'ballots')
  const course = (h: string) => (/^option (\d+)/.exec(h)?.[1] ?? (/let it lie|dismiss/.test(h) ? 'dismiss' : h))
  const byParty: ParsedLadder['byParty'] = {}
  let total: ParsedLadder['total'] = null
  for (const row of t.rows) {
    const name = stripMd(row[0] ?? '')
    const counts = Object.fromEntries(cols.map(({ h, k }) => [course(h), num(row[k] ?? '') ?? 0]))
    if (name.toLowerCase() === 'total') total = counts
    else {
      const id = partyOfRow(name, parties, officers) ?? name
      const cur = byParty[id] ?? {}
      for (const [c, n] of Object.entries(counts)) cur[c] = (cur[c] ?? 0) + n
      byParty[id] = cur
    }
  }
  return { heading: t.heading, courses: cols.map(({ h }) => course(h)), byParty, total }
}

// ---------------------------------------------------------------------------------------
// The Court's tables of votes
// ---------------------------------------------------------------------------------------

export type VoteMark = 'majority' | 'dissent' | 'not reached' | 'bar' | 'permit' | 'for' | 'against'

export interface ParsedVoteRow {
  question: string
  result: string
  split: [number, number] | null
  // Each justice's vote, by surname, as the table's own columns put it.
  votes: Record<string, VoteMark>
  reconciled: boolean | null
}

// The Court's table of votes. Its columns changed over the term: "Majority | Dissenting",
// "To bar | To permit", "Against | For", and "Vote | Dissenting or not joining". Each is
// read as the votes it lists; "All" means every justice not named in another column.
export function parseVotes(body: string, surnames: string[]): { rows: ParsedVoteRow[]; problems: string[] } {
  const problems: string[] = []
  const tables = readTables(body)
  const vt =
    tables.find((t) => /table of votes/i.test(t.heading)) ??
    byHeader(tables, 'Question', 'Result', 'Majority', 'Dissenting')
  if (!vt) return { rows: [], problems: ['no table of votes'] }
  const head = vt.header.map((h) => h.toLowerCase())
  const col = (name: string) => head.indexOf(name)
  const groups: { col: number; mark: VoteMark }[] = []
  let rest: VoteMark | null = null
  if (col('majority') >= 0) groups.push({ col: col('majority'), mark: 'majority' })
  if (col('dissenting') >= 0) groups.push({ col: col('dissenting'), mark: 'dissent' })
  if (col('to bar') >= 0) groups.push({ col: col('to bar'), mark: 'bar' })
  if (col('to permit') >= 0) groups.push({ col: col('to permit'), mark: 'permit' })
  if (col('against') >= 0) groups.push({ col: col('against'), mark: 'against' })
  if (col('for') >= 0) groups.push({ col: col('for'), mark: 'for' })
  const notJoining = head.findIndex((h) => h.startsWith('dissenting or'))
  if (notJoining >= 0) {
    groups.push({ col: notJoining, mark: 'dissent' })
    rest = 'majority'
  }
  if (!groups.length) return { rows: [], problems: [`the table of votes has columns ${vt.header.join(', ')}, which name no votes`] }
  const questionCols = ['question', 'matter', 'petition', 'option'].map(col).filter((k) => k >= 0)
  const resultCols = ['result', 'answer', 'vote'].map(col).filter((k) => k >= 0)
  const named = (text: string) => surnames.filter((s) => new RegExp(String.raw`\b${s}\b`).test(text))
  const rows: ParsedVoteRow[] = []
  for (const raw of vt.rows) {
    const cell = (k: number) => stripMd(raw[k] ?? '')
    const question = questionCols.map(cell).filter(Boolean).join(', option ').replace(/^(P-\d+), option /, '$1, option ')
    const result = resultCols.map(cell).filter(Boolean).join('; ')
    const split = /(\d+)\s*[–-]\s*(\d+)/.exec(result)
    const plain = !!split || /^\d+$/.test(result)
    const votes: ParsedVoteRow['votes'] = {}
    const everyone = (text: string) => /^All\b/.test(text) || /\bsame (six|five|four|seven)\b/i.test(text)
    // names inside "All (C5 ground: Halcyon, …)" are a gloss, not a list
    const explicit = groups.map((g) => ({ ...g, text: cell(g.col), names: everyone(cell(g.col)) ? [] : named(cell(g.col)) }))
    const listed = new Set(explicit.flatMap((g) => g.names))
    for (const g of explicit) {
      const notReached = /^Not reached/i.test(g.text)
      let names = g.names
      if (everyone(g.text)) names = surnames.filter((s) => !listed.has(s))
      if (plain) for (const s of names) votes[s] = notReached ? 'not reached' : g.mark
    }
    if (rest && plain) for (const s of surnames) if (!votes[s]) votes[s] = rest
    let reconciled: boolean | null = null
    if (split && plain) {
      const counts = Object.values(votes).filter((v) => v !== 'not reached')
      const tally = [...new Set(counts)].map((v) => counts.filter((c) => c === v).length).sort((a, b) => b - a)
      const want = [Number(split[1]), Number(split[2])].sort((a, b) => b - a)
      reconciled = (tally[0] ?? 0) === want[0] && (tally[1] ?? 0) === want[1]
      if (!reconciled) problems.push(`“${question.slice(0, 70)}”: the result says ${split[1]}–${split[2]} but the names give ${tally.join('–') || 'none'}`)
    }
    rows.push({ question, result, split: split ? [Number(split[1]), Number(split[2])] : null, votes, reconciled })
  }
  return { rows, problems }
}

// ---------------------------------------------------------------------------------------
// Petitions (records/petitions/*.md)
// ---------------------------------------------------------------------------------------

export interface ParsedPetition {
  number: number
  title: string
  received: string | null // ISO
  options: number
  decision: { course: string; date: string | null; decree: boolean } | null
  assembly: { firstPreference: string | null; aye: number | null; no: number | null; low: number | null } | null
  rulings: { course: string; verdict: 'permitted' | 'barred'; split: [number, number] | null }[]
  problems: string[]
}

export function parsePetition(text: string): ParsedPetition {
  const problems: string[] = []
  const titleLine = /^#\s+(.*)$/m.exec(text)?.[1] ?? ''
  const tm = /^Petition #(\d+)\s*[—–-]\s*(.*)$/.exec(stripMd(titleLine))
  if (!tm) problems.push(`the title “${titleLine}” is not of the form “Petition #N — Title”`)
  const received = /\*\*Received:\*\*\s*(.*)/.exec(text)
  const options = sectionMd(text, /^The options/) ?? ''
  const count = new Set([...options.matchAll(/\*\*Option (\d+)\.\*\*/g)].map((m) => m[1])).size
  const dec = sectionMd(text, /^The Steward's deci|^The Steward's decree/)
  let decision: ParsedPetition['decision'] = null
  if (dec === null) problems.push('no section “The Steward\'s decision” or “decree”')
  else {
    const plain = stripMd(dec)
    const firstPara = dec.split(/\n\s*\n/)[0] ?? ''
    const date = findDate(firstPara, false)?.iso ?? null
    const decree = /^#+\s+The Steward's decree/m.test(text)
    const om = /^Option (\d+)/i.exec(plain)
    if (om) decision = { course: om[1]!, date, decree }
    else if (/^Dismissed/i.test(plain)) decision = { course: 'dismiss', date, decree }
    else if (!/^Pending/i.test(plain)) problems.push(`the decision “${plain.slice(0, 60)}” names no option and is not a dismissal`)
  }
  const asm = sectionMd(text, /^The Assembly's recommendation/)
  let assembly: ParsedPetition['assembly'] = null
  if (asm) {
    const fp = /First preference:\s*(?:Option (\d+)|([^.*]+))/i.exec(asm)
    const count = /(\d+) Aye,\s*(\d+) No,\s*(\d+) low/i.exec(asm)
    assembly = {
      firstPreference: fp ? (fp[1] ?? fp[2]!.trim()) : null,
      aye: count ? Number(count[1]) : null,
      no: count ? Number(count[2]) : null,
      low: count ? Number(count[3]) : null,
    }
  }
  const court = sectionMd(text, /^The High Court's opinion/) ?? sectionMd(text, /^Ratification/) ?? ''
  const rulings: ParsedPetition['rulings'] = []
  for (const m of court.matchAll(/\*\*Option (\d+):\s*(Permitted|Barred)[^*]*?(?:(\d)\s*[–-]\s*(\d))?\*\*/g)) {
    rulings.push({ course: m[1]!, verdict: m[2] === 'Barred' ? 'barred' : 'permitted', split: m[3] ? [Number(m[3]), Number(m[4])] : null })
  }
  return {
    number: tm ? Number(tm[1]) : NaN,
    title: tm ? tm[2]!.trim() : stripMd(titleLine),
    received: received ? findDate(received[1]!)?.iso ?? null : null,
    options: count,
    decision,
    assembly,
    rulings,
    problems,
  }
}

// ---------------------------------------------------------------------------------------
// The Founder's Words (records/founders-words.md)
// ---------------------------------------------------------------------------------------

export interface ParsedWord {
  number: number
  subject: string
  given: string | null // ISO
  text: string
  silence: boolean
  inner: { number: number; text: string }[]
}

function quoteLines(lines: string[]): string {
  const out: string[] = []
  for (const l of lines) {
    const m = /^\s{0,3}>\s?(.*)$/.exec(l)
    if (m) out.push(m[1]!)
    else if (!l.trim() && out.length && out[out.length - 1] !== '') out.push('')
  }
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}

export function parseWord(title: string, body: string): ParsedWord | null {
  const m = /^Word No\. (\d+)\s*[—–-]\s*(.*)$/.exec(title)
  if (!m) return null
  const given = /\*\*(?:Given|Released)[^*:]*:\*\*\s*([\s\S]*?)(?:\n\s*\n|$)/.exec(body)
  const lines = body.split('\n')
  const label = lines.findIndex((l) => /^\*\*The Founder's (own |personal )?words[^*]*\*\*/i.test(l))
  let text = ''
  if (label >= 0) {
    let end = label + 1
    let seenQuote = false
    while (end < lines.length) {
      const l = lines[end]!
      if (/^\s{0,3}>/.test(l)) seenQuote = true
      else if (l.startsWith('**') || /^#/.test(l) || RULE.test(l)) {
        if (seenQuote || end > label + 1) break
      }
      end++
    }
    text = quoteLines(lines.slice(label + 1, end))
    if (!text) {
      const rest = lines[label]!.replace(/^\*\*The Founder's[^*]*\*\*\s*/i, '')
      text = joinBody([rest, ...lines.slice(label + 1, end)])
    }
  }
  if (!text) text = quoteLines(lines)
  if (!text) text = body
  const flatBody = flat(body)
  const inner = [...flatBody.matchAll(/\*\*Word No\. (\d+), given the same day:\*\*\s*(“[^”]*”|"[^"]*")/g)].map((x) => ({
    number: Number(x[1]),
    text: x[2]!.slice(1, -1),
  }))
  const overrules = /\*\*Overrules:\*\*\s*([\s\S]*?)(?:\n\s*\n|$)/.exec(body)?.[1] ?? ''
  const silence = /Silence (?:is )?ordered/i.test(overrules) && !/No Silence/i.test(overrules)
  // "12 October 2026 (real date)" is the day the Founder typed it, not the Commonwealth's
  // day; with no in-world date the Word's day is unknown and the caller places it in order
  const withoutReal = (t: string) =>
    flat(t)
      .replace(/real date:?\s*\d{4}-\d{2}-\d{2}/gi, '')
      .replace(/\d{4}-\d{2}-\d{2}\s*\(real( date)?\)/gi, '')
      .replace(/\d{1,2} [A-Z][a-z]+ \d{4}\s*\(real( date)?\)/g, '')
  const found = given ? findDate(withoutReal(given[1]!)) : null
  // the day it was entered in the record is the Commonwealth's own date, and stands in
  const entered = /\*\*Entered:\*\*\s*([^*]*)/.exec(body)
  const enteredIso = entered ? findDate(flat(entered[1]!))?.iso ?? null : null
  return { number: Number(m[1]), subject: m[2]!.trim(), given: found ? found.iso : enteredIso, text, silence, inner }
}

// ---------------------------------------------------------------------------------------
// Questions for the Founder (inbox/questions-for-aegis.md)
// ---------------------------------------------------------------------------------------

export interface ParsedQuestion {
  number: string
  from: string
  kind: string
  asked: string
  status: string
  source: string
  review: string
  question: string
  answered: boolean
  answeredWhere: string
  problems: string[]
}

const Q_FIELD = /^\s{0,3}[-*+]\s+\**(From|Kind|Asked|Status|Source|Review)\**\s*:\**\s*(.*)$/i

export function parseQuestionQueue(text: string): { questions: ParsedQuestion[]; malformed: { heading: string; why: string; raw: string }[] } {
  const questions: ParsedQuestion[] = []
  const malformed: { heading: string; why: string; raw: string }[] = []
  const seen = new Set<string>()
  for (const s of level2Sections(text)) {
    const q: ParsedQuestion = { number: s.heading, from: '', kind: '', asked: '', status: '', source: '', review: '', question: '', answered: false, answeredWhere: '', problems: [] }
    const quote: string[] = []
    const stray: string[] = []
    let last: keyof ParsedQuestion | null = null
    for (const ln of s.lines) {
      const fm = Q_FIELD.exec(ln)
      if (fm) {
        last = fm[1]!.toLowerCase() as keyof ParsedQuestion
        ;(q as unknown as Record<string, string>)[last] = fm[2]!.trim()
        continue
      }
      const qm = /^\s{0,3}>\s?(.*)$/.exec(ln)
      if (qm) {
        quote.push(qm[1]!.trimEnd())
        last = null
        continue
      }
      if (!ln.trim() || RULE.test(ln)) {
        if (!ln.trim() && quote.length && quote[quote.length - 1] !== '') quote.push('')
        last = null
        continue
      }
      if (last && /^\s{2,}\S/.test(ln)) {
        ;(q as unknown as Record<string, string>)[last] = `${(q as unknown as Record<string, string>)[last]} ${ln.trim()}`.trim()
        continue
      }
      stray.push(ln.trim())
      last = null
    }
    while (quote.length && quote[quote.length - 1] === '') quote.pop()
    q.question = quote.join('\n')
    const raw = `## ${s.heading}\n${s.lines.join('\n').replace(/^\n+|\n+$/g, '')}`
    let fatal = ''
    if (!/^Q-\d+$/.test(q.number)) fatal = `the heading “## ${s.heading}” is not a question number`
    else if (seen.has(q.number)) fatal = `the number ${q.number} is used by an earlier section`
    else if (!q.question.trim()) fatal = `${q.number} has no block quote`
    if (fatal) {
      malformed.push({ heading: s.heading, why: fatal, raw })
      continue
    }
    seen.add(q.number)
    const sm = /^(open|answered)\b[\s:;,.—–-]*(.*)$/i.exec(q.status)
    q.answered = !!sm && sm[1]!.toLowerCase() === 'answered'
    q.answeredWhere = q.answered ? sm![2]!.trim() : ''
    if (!sm) q.problems.push(`the Status line “${q.status}” begins with neither “open” nor “answered”`)
    if (stray.length) q.problems.push(`${stray.length} line(s) not a field or the quotation: “${stray.slice(0, 2).join('”, “')}”`)
    questions.push(q)
  }
  return { questions, malformed }
}

// records/questions-put-to-the-founder.md: each section holds one or more "**Put…:**"
// questions, a table of the answers offered, and "**Chosen:**".
export function parseQuestionsPut(body: string): { put: string; chosen: string }[] {
  const out: { put: string; chosen: string }[] = []
  let cur: { put: string; chosen: string } | null = null
  for (const b of blocks(body)) {
    const f = flat(b)
    // "**Put:** …" or "**Put (the *Sun*):** …"
    const pm = /^\*\*Put\b(.*?):\*\*\s*(.*)$/.exec(f)
    if (pm) {
      const who = stripMd(pm[1]!).replace(/[()]/g, '').trim()
      cur = { put: `${who ? `(${who}) ` : ''}${pm[2]!}`, chosen: '' }
      out.push(cur)
      continue
    }
    const cm = /^\*\*Chosen:\*\*\s*(.*)$/.exec(f)
    if (cm && cur) cur.chosen = cm[1]!
  }
  // the other form: a table of items, "Item | Question as put | … | Chosen"
  for (const t of readTables(body)) {
    const head = t.header.map((h) => h.toLowerCase())
    const q = head.findIndex((h) => h.startsWith('question'))
    const c = head.indexOf('chosen')
    if (q < 0 || c < 0) continue
    for (const row of t.rows) out.push({ put: `${head[0] === 'item' ? `(item ${stripMd(row[0] ?? '')}) ` : ''}${row[q] ?? ''}`, chosen: row[c] ?? '' })
  }
  return out
}

// ---------------------------------------------------------------------------------------
// Letters, replies and drafts
// ---------------------------------------------------------------------------------------

export interface FieldSection {
  number: string
  fields: Record<string, string>
  text: string
  stray: string[]
  noDraft: boolean
}

// One '## L-0001' section of fields and a block quote (letters.parse_section and
// drafts.parse_section are the same reading with different field names).
export function parseFieldSection(heading: string, lines: string[], fieldNames: string[], headRe = /^(L-\d+)\b\s*(.*)$/): FieldSection | null {
  const m = headRe.exec(heading.trim())
  if (!m) return null
  const fieldRe = new RegExp(String.raw`^\s{0,3}[-*+]\s+\**(${fieldNames.join('|')})\**\s*:\**\s*(.*)$`, 'i')
  const fields: Record<string, string> = {}
  const quote: string[] = []
  const stray: string[] = []
  let last: string | null = null
  let noDraft = false
  for (const ln of lines) {
    const fm = fieldRe.exec(ln)
    if (fm && !quote.length) {
      last = flat(fm[1]!.toLowerCase())
      fields[last] = fm[2]!.trim()
      continue
    }
    const qm = /^\s{0,3}>\s?(.*)$/.exec(ln)
    if (qm) {
      quote.push(qm[1]!.trimEnd())
      last = null
      continue
    }
    if (!ln.trim()) {
      if (quote.length && quote[quote.length - 1] !== '') quote.push('')
      last = null
      continue
    }
    if (RULE.test(ln)) {
      last = null
      continue
    }
    if (last && /^\s{2,}\S/.test(ln)) {
      fields[last] = `${fields[last]} ${ln.trim()}`.trim()
      continue
    }
    if (/^no draft\.?$/i.test(ln.trim())) {
      noDraft = true
      continue
    }
    stray.push(ln.trim())
    last = null
  }
  while (quote.length && quote[quote.length - 1] === '') quote.pop()
  return { number: m[1]!, fields, text: quote.join('\n'), stray, noDraft }
}

export const LETTER_FIELDS = ['From', 'Place', 'Dated', 'Came by', 'About']
export const REPLY_FIELDS = ['To', 'Place', 'Words', 'Record']
export const DRAFT_FIELDS = ['To', 'Recommendation', 'Note', 'Referral', 'Urgent']

// ---------------------------------------------------------------------------------------
// The Founder's inbox (inbox/aegis-inbox.md): used only to learn which questions and
// letters the Founder has answered from the website, and in what words.
// ---------------------------------------------------------------------------------------

export interface InboxEntry {
  id: string
  kind: string
  question: string
  letter: string
  response: string
  status: string
  words: string
}

export function parseInbox(text: string): InboxEntry[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: InboxEntry[] = []
  let i = 0
  while (i < lines.length) {
    const m = /^## Entry (\S+) — (.*)$/.exec(lines[i]!)
    if (!m) {
      i++
      continue
    }
    const e: InboxEntry = { id: m[1]!, kind: m[2]!.trim(), question: '', letter: '', response: '', status: '', words: '' }
    i++
    while (i < lines.length && !lines[i]!.startsWith('## Entry ')) {
      const line = lines[i]!
      const fm = /^(~{4,}|`{3,})text\s*$/.exec(line)
      if (fm) {
        const buf: string[] = []
        let j = i + 1
        while (j < lines.length && lines[j] !== fm[1]) buf.push(lines[j++]!)
        e.words = buf.join('\n')
        i = j + 1
        continue
      }
      const km = /^- \*\*(Status|Question|Letter|Response):\*\*\s*(.*)$/.exec(line)
      if (km) (e as unknown as Record<string, string>)[km[1]!.toLowerCase()] = km[2]!.trim()
      i++
    }
    e.question = /^(Q-\d+)\b/.exec(e.question)?.[1] ?? ''
    e.letter = e.question ? '' : (/^(L-\d+)\b/.exec(e.letter)?.[1] ?? '')
    out.push(e)
  }
  return out
}

// ---------------------------------------------------------------------------------------
// Bills (law/bills.md, overlaid with the order paper in simulation/state.md)
// ---------------------------------------------------------------------------------------

export interface ParsedBill {
  number: number
  title: string
  moved: string
  presented: string
  stageText: string
  finalVote: string
  outcome: string
  stage: 'introduced' | 'committee' | 'passed' | 'signed' | 'returned' | 'failed' | 'law'
  divisions: { iso: string | null; reading: string; aye: number; no: number; abstain: number }[]
}

const VOTE = /(\d+)\s*[–-]\s*(\d+)(?:\s*[–-]\s*(\d+))?/

export function stageOf(outcome: string, stageText: string): ParsedBill['stage'] {
  const o = stripMd(outcome)
  if (/^Passed/i.test(o)) {
    if (/no signature required|signed/i.test(o) && !/referendum|the people|Not yet in force/i.test(o)) return 'law'
    return 'passed'
  }
  if (/^(Defeated|Refused|Withdrawn|Vetoed|Lapsed)/i.test(o)) return 'failed'
  if (/committee/i.test(o) || /\breferred\b/i.test(stageText)) return 'committee'
  return 'introduced'
}

export function parseBillsRegister(text: string): { bills: ParsedBill[]; problems: string[] } {
  const problems: string[] = []
  const t = byHeader(readTables(text), 'No.', 'Short title')
  const bills: ParsedBill[] = []
  if (!t) return { bills, problems: ['the table of bills (No., Short title) was not found in law/bills.md'] }
  for (const row of t.rows) {
    const c = rowObject(t, row)
    const n = num(c['no.'] ?? '')
    if (n === null) {
      problems.push(`a row of the register has no number: “${row.join(' | ').slice(0, 80)}”`)
      continue
    }
    const stageText = c['stage'] ?? ''
    const divisions: ParsedBill['divisions'] = []
    for (const m of stripMd(stageText).matchAll(/([A-Z][A-Za-z' ]{2,40}?)\s+(?:passed|taken|carried|defeated|refused)?\s*(\d+)\s*[–-]\s*(\d+)\s*[–-]\s*(\d+)(?:\s+on\s+(\d{1,2} \w+ \d{4}))?/g)) {
      divisions.push({ reading: m[1]!.trim(), aye: Number(m[2]), no: Number(m[3]), abstain: Number(m[4]), iso: m[5] ? findDate(m[5], false)?.iso ?? null : null })
    }
    const fv = VOTE.exec(stripMd(c['final vote'] ?? ''))
    if (fv) {
      const when = findDate(c['outcome'] ?? '', false)?.iso ?? null
      divisions.push({ reading: 'Final question', aye: Number(fv[1]), no: Number(fv[2]), abstain: Number(fv[3] ?? 0), iso: when })
    }
    bills.push({
      number: n,
      title: stripMd(c['short title'] ?? ''),
      moved: stripMd(c['mover'] ?? ''),
      presented: stripMd(c['presented'] ?? ''),
      stageText: stripMd(stageText),
      finalVote: stripMd(c['final vote'] ?? ''),
      outcome: stripMd(c['outcome'] ?? ''),
      stage: stageOf(c['outcome'] ?? '', stageText),
      divisions,
    })
  }
  return { bills, problems }
}

// The order paper's "Passed and off the paper" and "Refused a first reading" lines, which
// are newer than the register. Returns what each bill became, with its vote if given.
export function parseOrderPaperOutcomes(stateText: string): { number: number; title: string; stage: ParsedBill['stage']; iso: string | null; vote: [number, number, number] | null; note: string }[] {
  const out: { number: number; title: string; stage: ParsedBill['stage']; iso: string | null; vote: [number, number, number] | null; note: string }[] = []
  const para = /\*\*Passed and off the paper:\*\*([\s\S]*?)(?:\n\s*\n|$)/.exec(stateText)?.[1]
  if (!para) return out
  const text = flat(para)
  const [passedPart = '', refusedPart = ''] = text.split(/\*\*Refused a first reading:\*\*/)
  const year = '2026'
  const read = (part: string, stage: ParsedBill['stage']) => {
    // "Bill No. 6, Railway Vendors (11 November, 121–14–15)" or "Bills No. 11, No. 12 and No. 13 (10 November)"
    for (const m of part.matchAll(/Bills? ((?:No\. \d+(?:, | and )?)+)(?:,\s*([^(]+?))?\s*\(([^)]*)\)/g)) {
      const numbers = [...m[1]!.matchAll(/No\. (\d+)/g)].map((x) => Number(x[1]))
      const inside = m[3]!
      const date = /(\d{1,2} \w+)/.exec(inside)
      const vote = VOTE.exec(inside)
      for (const n of numbers) {
        out.push({
          number: n,
          title: numbers.length === 1 ? (m[2] ?? '').trim() : '',
          stage: stage === 'passed' && /to the people/.test(inside) ? 'passed' : stage,
          iso: date ? findDate(`${date[1]} ${year}`, false)?.iso ?? null : null,
          vote: vote ? [Number(vote[1]), Number(vote[2]), Number(vote[3] ?? 0)] : null,
          note: inside,
        })
      }
    }
  }
  read(passedPart, 'law')
  read(refusedPart.split(/\*\*Petitions:\*\*/)[0] ?? '', 'failed')
  return out
}

// ---------------------------------------------------------------------------------------
// Directions to the Steward (government/directions-to-the-steward.md)
// ---------------------------------------------------------------------------------------

export interface ParsedDirection {
  from: string
  iso: string | null
  text: string
  done: boolean
}

export function parseDirections(text: string): ParsedDirection[] {
  const out: ParsedDirection[] = []
  const { heads, lines } = headings(text)
  for (const h of heads.filter((x) => x.level === 2)) {
    const body = lines.slice(h.line + 1, h.end).join('\n')
    const from = /Founder/.test(h.title.split(/\s+[—–]\s+/)[0]!) && !/Assembly|Court/.test(h.title.split(/\s+[—–]\s+/)[0]!)
      ? 'The Founder'
      : /High Court/.test(h.title)
        ? 'The High Court of the Charter'
        : /Assembly/.test(h.title)
          ? 'The Commonwealth Assembly'
          : h.title.replace(/^From\s+/, '').trim()
    const sectionDate = findDate(h.title, false)?.iso ?? null
    for (const t of readTables(body)) {
      const head = t.header.map((x) => x.toLowerCase())
      const textCol = ['direction', 'content', 'resolution', 'what'].map((c) => head.indexOf(c)).find((k) => k >= 0)
      if (textCol === undefined) continue
      for (const row of t.rows) {
        const cells = row.map(stripMd)
        const status = cells.slice(textCol + 1).join(' ')
        const dateCell = head[0] === 'date' ? cells[0] ?? '' : ''
        const label = head[textCol] === 'content' && head[0] === 'resolution' ? `${cells[0]}: ` : ''
        out.push({
          from,
          iso: (dateCell && findDate(dateCell)?.iso) || sectionDate,
          text: `${label}${cells[textCol] ?? ''}`.trim(),
          done: !/\bowed\b|\bpending\b|\bnot yet\b|\bdue\b/i.test(status),
        })
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------
// The Constitution and the Charter
// ---------------------------------------------------------------------------------------

export function parseConstitution(text: string): { number: string; title: string; text: string }[] {
  const out: { number: string; title: string; text: string }[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let cur: { number: string; title: string; lines: string[] } | null = null
  const close = () => {
    if (cur) out.push({ number: cur.number, title: cur.title, text: joinBody(cur.lines) })
    cur = null
  }
  for (const line of lines) {
    const am = /^\*\*Article (\d+[A-Z]?)\.\s*(.*?)\*\*\s*(.*)$/.exec(line)
    if (am) {
      close()
      cur = { number: am[1]!, title: am[2]!.replace(/\.$/, '').trim(), lines: am[3] ? [am[3]] : [] }
      continue
    }
    const hm = /^(#{1,6})\s+(.*)$/.exec(line)
    if (hm) {
      close()
      const title = stripMd(hm[2]!)
      if (/^Preamble$/i.test(title)) cur = { number: 'Preamble', title: 'Preamble', lines: [] }
      if (/^The Judiciary Schedule$/i.test(title)) cur = { number: 'Schedule', title: 'The Judiciary Schedule', lines: [] }
      continue
    }
    if (cur) cur.lines.push(line)
  }
  close()
  return out
}

export function parseCharter(text: string): { id: string; title: string; text: string; absolute: boolean }[] {
  return divide(text, 2)
    .parts.filter((p) => p.title && /^Article C\d+/.test(p.title))
    .map((p) => {
      const m = /^Article (C\d+)\s*[—–-]\s*(.*)$/.exec(p.title!)!
      return {
        id: m[1]!,
        title: m[2]!.replace(/\(non-derogable\)/i, '').trim(),
        text: p.body,
        absolute: /non-derogable/i.test(p.rawTitle ?? ''),
      }
    })
}

// ---------------------------------------------------------------------------------------
// Almanac days: the press line of each paper
// ---------------------------------------------------------------------------------------

export function parseAlmanacDay(body: string): { sections: string[]; press: { paper: string; headline: string }[] } {
  const { heads, lines } = headings(body)
  const sections: string[] = []
  let press = ''
  for (const h of heads.filter((x) => x.level === 2)) {
    const name = h.title.replace(/^\d+\.\s*/, '').trim()
    sections.push(name)
    if (/^the press$/i.test(name)) press = lines.slice(h.line + 1, h.end).join('\n')
  }
  const items: { paper: string; headline: string }[] = []
  for (const b of blocks(press)) {
    const m = /^\*\*([^*]+?)\*\*\s*[—–-]\s*\*([^*]+)\*/.exec(flat(b))
    if (m) items.push({ paper: m[1]!.trim(), headline: m[2]!.trim().replace(/\.$/, '') })
  }
  return { sections, press: items }
}

export type { Table }
