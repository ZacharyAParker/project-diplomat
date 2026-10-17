// Builds a Project Diplomat 0.6 nation from the Claudetopia State Archive: the engine
// state, the government above it, and every public record as Archive documents. Reads
// the source folder only; writing is left to scripts/import-claudetopia.ts.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { checkPack } from '../../packages/content/src/index.ts'
import {
  INDICATORS,
  deserialize,
  newNation,
  buildAgenda,
  serialize,
  support,
  type GameState,
  type IndicatorId,
  type TimelineEntry,
} from '../../packages/engine/src/index.ts'
import { dayOf, docId, formatDate } from '../../packages/government/src/documents.ts'
import {
  GOVERNMENT_VERSION,
  type ArchiveDocument,
  type Article,
  type Bill,
  type Body,
  type Factbook,
  type GovernmentState,
  type Institutions,
  type Letter,
  type Member,
  type Party,
  type Question,
  type Right,
  type SaveFile2,
  type Series,
  type Word,
} from '../../packages/government/src/types.ts'
const CALENDAR_START_FOR_TERM = '2026-10-11'
import { bbcodeToMarkdown } from './bbcode.ts'
import { blocks, clip, divide, findDate, flat, headings, joinBody, level2Sections, readTables, slugify, stripMd } from './md.ts'
import {
  DRAFT_FIELDS,
  LETTER_FIELDS,
  REPLY_FIELDS,
  parseAlmanacDay,
  parseBillsRegister,
  parseCharter,
  parseConstitution,
  parseDirections,
  parseDivisions,
  parseFieldSection,
  parseInbox,
  parseJudiciary,
  parseLegislature,
  parseOrderPaperOutcomes,
  parsePetition,
  parseQuestionQueue,
  parseQuestionsPut,
  parseVotes,
  parseWord,
  type ParsedDirection,
} from './parsers.ts'

export const CALENDAR_START = '2026-10-11'
export const SEED = 20261011

// What the import could not do or chose not to do, and every reading problem, by source.
export interface ImportReport {
  counts: Partial<Record<Series, number>>
  unparsed: { source: string; why: string; document: string }[]
  problems: string[]
  skipped: string[]
}

export interface ImportResult {
  save: SaveFile2
  documents: ArchiveDocument[]
  report: ImportReport
  currentDay: number
  state: GameState
}

// ---------------------------------------------------------------------------------------
// Fixed knowledge: what the archive states in prose, carried over by hand with its source
// ---------------------------------------------------------------------------------------

// NationStates ratings (simulation/state.md, section 1; lore/economy.md section 11) to the
// engine's indicators, 0 to 100 with 50 neutral. Unlisted indicators keep the engine's start.
export const INDICATOR_MAPPING: { indicator: IndicatorId; value: number; from: string }[] = [
  { indicator: 'liberty', value: 76, from: 'Civil rights Excellent and political freedom Excellent (Superb until Petition #17): high, short of the top' },
  { indicator: 'legitimacy', value: 66, from: 'Political freedom Excellent, a working constitutional order; held below liberty for the open quarrel over Article 0' },
  { indicator: 'capacity', value: 57, from: 'Economy Good (222bn tokens, down from 226 at founding): above the middle' },
  { indicator: 'employment', value: 62, from: 'Census employment 66.14 after Petition #17; strong unions; no unemployment crisis recorded' },
  { indicator: 'living', value: 61, from: 'Average income about 44,400 tokens, a large welfare state (the Common Provision), crime very low' },
  { indicator: 'inequality', value: 32, from: 'Income spread 3.0x (richest to poorest; 3.6x at founding), "little inequality"' },
  { indicator: 'health', value: 63, from: 'Government priority: Healthcare (with Welfare and Education)' },
  { indicator: 'education', value: 64, from: 'Government priority: Education; the University of Glim' },
  { indicator: 'fiscal', value: 49, from: 'A small deficit: 0.4bn on 71.0bn of spending (lore/economy.md section 11)' },
  { indicator: 'debt', value: 20, from: 'Debt 38.0bn on a 222bn economy, about 17% of GDP; the engine bites past 80, so 17% maps to about 20' },
  { indicator: 'administration', value: 56, from: 'Crime 4.17 an hour ("almost non-existent"), written reasons for every decision; the storm handled within existing votes' },
]

// Pack portfolios to the nearest Claudetopian ministry.
const CABINET: Record<string, { name: string; ministry: string }> = {
  finance: { name: 'Perpetua Glim', ministry: 'treasury' },
  interior: { name: 'Garrick Snuff', ministry: 'home-affairs' },
  foreign: { name: 'Silas Reeve', ministry: 'foreign-affairs' },
  health: { name: 'Dr Lucan Sconce', ministry: 'health' },
  education: { name: 'Maren Vael', ministry: 'learning' },
  environment: { name: 'Odessa Ember', ministry: 'land-sea-weather' },
  defence: { name: 'Marshal Brannoch Tallow', ministry: 'lantern-guard' },
}

const MINISTRIES = [
  'treasury', 'health', 'learning', 'welfare-housing', 'justice', 'home-affairs',
  'enterprise-trade', 'land-sea-weather', 'science-inquiry', 'foreign-affairs', 'lantern-guard',
]

// Each party to the core pack's factions whose interests it carries, most important first.
const PARTY_FACTIONS: Record<string, string[]> = {
  'open-hand': ['labour', 'youth'], // social democratic, trade unionist: the dockers and delivery crews
  'charter-union': ['youth', 'mandarins'], // civil-libertarian liberals of Owlsreach and the university
  'enterprise-and-token-league': ['business'], // market liberals: low tax, free trade, sound money
  'keepers-fellowship': ['faithful', 'rural', 'grey'], // traditionalist Lantern Way, highland Sconce
  'safe-harbour-party': ['services', 'grey'], // law and order, a larger Lantern Guard
  'human-chair-league': ['rural', 'grey'], // a human in the chair; windswept Snuff
  'trust-and-tide': ['rural', 'youth'], // environmentalist, built on C17; Glim
}

// Charter rights to the core pack's option tags they protect against, and the indicators an
// option may not push down by more than the guard (the rules-based Court only).
const RIGHT_TAGS: Record<string, { against: string[]; guards: { indicator: IndicatorId; floor: number }[] }> = {
  C1: { against: [], guards: [{ indicator: 'inequality', floor: 0 }] },
  C2: { against: ['paternalist'], guards: [] },
  C3: { against: ['paternalist'], guards: [{ indicator: 'liberty', floor: 6 }] },
  C4: { against: ['anti_labour'], guards: [{ indicator: 'liberty', floor: 6 }] },
  C5: { against: ['surveillance'], guards: [{ indicator: 'liberty', floor: 4 }] },
  C6: { against: [], guards: [{ indicator: 'legitimacy', floor: 6 }] },
  C7: { against: ['surveillance'], guards: [] },
  C8: { against: [], guards: [] },
  C9: { against: [], guards: [] },
  C10: { against: ['paternalist'], guards: [] },
  C11: { against: ['austerity'], guards: [{ indicator: 'health', floor: 5 }, { indicator: 'education', floor: 5 }, { indicator: 'living', floor: 5 }] },
  C12: { against: ['anti_labour'], guards: [{ indicator: 'employment', floor: 6 }] },
  C13: { against: [], guards: [] },
  C14: { against: [], guards: [{ indicator: 'education', floor: 6 }] },
  C15: { against: [], guards: [] },
  C16: { against: [], guards: [] },
  C17: { against: ['polluting'], guards: [{ indicator: 'environment', floor: 5 }] },
  C18: { against: ['surveillance'], guards: [] },
  C19: { against: [], guards: [] },
  C20: { against: [], guards: [] },
}
// C1's inequality guard would be "may not rise", which a floor cannot say; it is dropped.
RIGHT_TAGS['C1']!.guards = []

const PRESS = [
  { id: 'chronicle', name: 'The Claudetopia Chronicle', line: 'sober, of record: liberal, procedural and earnest; prints divisions in full and corrections on the front page', kind: 'paper' as const },
  { id: 'herald', name: 'The Claudetopia Herald', line: 'city paper, sceptical, commercial: the voice of Wick and sound money; checks the Steward\'s reasons for errors each morning', kind: 'paper' as const },
  { id: 'sun', name: 'The Claudetopia Sun', line: 'loud, populist, capital letters: weather, sport, the silliest committee, the daily owl', kind: 'paper' as const },
  { id: 'wireless', name: 'Commonwealth Wireless', line: 'public broadcaster under a board the government does not appoint; carries the Steward\'s written reasons at six (Reasons at Six)', kind: 'broadcaster' as const },
]

// ---------------------------------------------------------------------------------------
// Documents in the making
// ---------------------------------------------------------------------------------------

interface Draft {
  series: Series
  seq?: number // fixed sequence, for petitions: their own number
  title: string
  day: number
  issuer: string
  kind: string
  body: string
  data?: unknown
  aliases: string[] // citation keys that name this document
  refs: string[] // citation keys it cites outright
  source: string
  order: number
  id?: string
}

// Citations recognised in a body, as keys the drafts register under.
const CITES: { re: RegExp; key: (m: RegExpMatchArray) => string }[] = [
  { re: /Petitions? #(\d+)/g, key: (m) => `petition:${Number(m[1])}` },
  { re: /\bIn re Petitions? (\d+)/g, key: (m) => `petition:${Number(m[1])}` },
  { re: /\bP-(\d+)\b/g, key: (m) => `petition:${Number(m[1])}` },
  { re: /\bWords? No\. (\d+)/g, key: (m) => `word:${Number(m[1])}` },
  { re: /\bBills? No\. (\d+)/g, key: (m) => `bill:${Number(m[1])}` },
  { re: /\b(L-\d{4})\b/g, key: (m) => `letter:${m[1]}` },
  { re: /\b(Q-\d{4})\b/g, key: (m) => `question:${m[1]}` },
  { re: /\b(Ref\.\s?\d+|P-\d+)\s?\/\s?YL\s?\d+/g, key: (m) => `court:${courtKey(m[1]!)}` },
  { re: /\b([A-Z]{3}\/YL\d+\/\d{3}[A-Z]?)\b/g, key: (m) => `advice:${m[1]}` },
  { re: /\b((?:Extraordinary )?(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|Twelfth|Thirteenth|Fourteenth|Fifteenth|Sixteenth) (?:Ordinary )?Sitting)\b/g, key: (m) => `hansard:${m[1]!.toLowerCase()}` },
  { re: /\b(Written Answer|Supply Proposal|Statement to the Assembly|Standing Instruction) No\. (\d+)/g, key: (m) => `steward:${m[1]!.toLowerCase()} ${m[2]}` },
]

const courtKey = (s: string) => s.replace(/\s+/g, '').toLowerCase()

// ---------------------------------------------------------------------------------------

export function buildImport(source: string, repo: string, id: string): ImportResult {
  const report: ImportReport = { counts: {}, unparsed: [], problems: [], skipped: [] }
  const handled = new Set<string>()
  const read = (rel: string): string | null => {
    const full = join(source, rel)
    if (!existsSync(full)) {
      report.problems.push(`${rel}: not found in the source archive`)
      return null
    }
    handled.add(rel.replace(/\\/g, '/'))
    return readFileSync(full, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  }
  const list = (dir: string, ext = '.md') =>
    existsSync(join(source, dir))
      ? readdirSync(join(source, dir)).filter((n) => n.toLowerCase().endsWith(ext) && statSync(join(source, dir, n)).isFile()).sort().map((n) => `${dir}/${n}`)
      : []

  // ----- the calendar
  const stateText = read('simulation/state.md') ?? ''
  const inworld = /\*\*In-world date:\*\*\s*(.*)/.exec(stateText)
  const nowIso = inworld ? findDate(inworld[1]!, false)?.iso : undefined
  if (!nowIso) report.problems.push('simulation/state.md: no “In-world date:” line could be read; the import uses the calendar start')
  const currentDay = nowIso ? dayOf(CALENDAR_START, nowIso) : 1
  const dayFrom = (iso: string | null | undefined, fallback: number) => {
    if (!iso) return fallback
    const d = dayOf(CALENDAR_START, iso)
    return d > currentDay ? fallback : d
  }

  const drafts: Draft[] = []
  let order = 0
  const add = (d: Omit<Draft, 'order' | 'aliases' | 'refs'> & { aliases?: string[]; refs?: string[] }): Draft => {
    const draft: Draft = { aliases: [], refs: [], ...d, order: order++, day: Math.min(Math.max(1, d.day), currentDay) }
    drafts.push(draft)
    return draft
  }
  const unparsed = (series: Series, title: string, body: string, src: string, why: string, day: number, issuer = 'The State Archive') => {
    const d = add({ series, title, day, issuer, kind: 'unparsed', body, source: src, data: { why } })
    report.unparsed.push({ source: src, why, document: '' })
    ;(d as Draft & { unparsedIndex?: number }).unparsedIndex = report.unparsed.length - 1
    return d
  }

  // ----- the bodies first: everything else names them
  const legislatureText = read('government/legislature.md') ?? ''
  const leg = parseLegislature(legislatureText)
  report.problems.push(...leg.problems.map((p) => `government/legislature.md: ${p}`))
  const judiciaryText = read('government/judiciary.md') ?? ''
  const jud = parseJudiciary(judiciaryText)
  report.problems.push(...jud.problems.map((p) => `government/judiciary.md: ${p}`))
  const surnames = jud.justices.map((j) => j.surname)
  const catalog = JSON.parse(readFileSync(join(source, 'site/catalog.json'), 'utf8')) as { party_colours?: Record<string, string> }
  const colours = Object.fromEntries(Object.entries(catalog.party_colours ?? {}).map(([k, v]) => [k.toLowerCase(), v]))

  // ----- petitions
  const petitionNumbers: number[] = []
  const timeline: TimelineEntry[] = []
  for (const rel of list('records/petitions')) {
    const text = read(rel)!
    const p = parsePetition(text)
    const body = text.replace(/^#\s+.*\n/, '').replace(/^\n+/, '')
    const received = dayFrom(p.received, 1)
    if (!Number.isFinite(p.number)) {
      unparsed('petition', stripMd(/^#\s+(.*)$/m.exec(text)?.[1] ?? rel), body, rel, p.problems.join('; '), received, "The Steward's Office (Docket)")
      continue
    }
    report.problems.push(...p.problems.map((x) => `${rel}: ${x}`))
    const decided = p.decision ? dayFrom(p.decision.date, received) : null
    petitionNumbers.push(p.number)
    const title = `Petition #${p.number} — ${p.title}`
    add({
      series: 'petition',
      seq: p.number,
      title,
      day: decided ?? received,
      issuer: "The Steward's Office (Docket)",
      kind: 'petition',
      body,
      source: rel,
      aliases: [`petition:${p.number}`],
      data: {
        number: p.number,
        received,
        options: p.options,
        decision: p.decision ? { course: p.decision.course, day: decided, byDecree: p.decision.decree } : null,
        assembly: p.assembly,
        rulings: p.rulings,
      },
    })
    if (p.decision && decided !== null) {
      const course = p.decision.course === 'dismiss' ? 'dismissed' : `Option ${p.decision.course} taken`
      timeline.push({
        day: decided,
        kind: 'decision',
        headline: `Petition #${p.number}, ${p.title}: ${course}`,
        text: p.decision.decree ? 'By decree of the Steward on Founding Day (Article 71), later reviewed by the Assembly and the Court.' : 'Decided by the Steward after the Assembly and the High Court. The NationStates effects are in the petition record, not the engine.',
        changes: [],
      })
    }
  }

  // ----- Hansard
  // the Speaker and the Deputy Speaker sit in divisions under their office, not their party
  const officers = Object.fromEntries(leg.members.filter((m) => /^(Deputy Speaker|Speaker)$/.test(m.office)).map((m) => [m.office.toLowerCase(), m.party]))
  {
    const rel = 'records/hansard.md'
    const text = read(rel) ?? ''
    const { fileTitle, parts } = divide(text, 1)
    let last = 1
    for (const part of parts) {
      if (part.title === null) {
        add({ series: 'hansard', title: `${fileTitle || 'Hansard'} (preface)`, day: 1, issuer: 'The Commonwealth Assembly', kind: 'preface', body: part.body, source: rel })
        continue
      }
      const bolds = blocks(part.body).map(flat).filter((b) => b.startsWith('**') && b.endsWith('**')).slice(0, 4)
      const day = dayFrom(findDate(bolds[0] ?? part.body.slice(0, 1500))?.iso, last)
      last = day
      const business = bolds.find((b) => /^\*\*Business/i.test(b))
      const div = parseDivisions(part.body, leg.parties, officers)
      report.problems.push(...div.problems.map((x) => `${rel}, ${part.title}: ${x}`))
      add({
        series: 'hansard',
        title: part.title,
        day,
        issuer: 'The Commonwealth Assembly',
        kind: 'sitting',
        body: part.body,
        source: `${rel}:${part.line + 1}`,
        aliases: [`hansard:${part.title.split(/\s+[—–]\s+/)[0]!.toLowerCase()}`],
        data: { business: business ? stripMd(business).replace(/^Business:\s*/, '') : null, divisions: div.divisions, ladders: div.ladders, summary: div.summary },
      })
    }
  }

  // ----- the Court's reports, and hearings
  {
    const rel = 'records/court-reports.md'
    const text = read(rel) ?? ''
    const { fileTitle, parts } = divide(text, 1)
    let last = 1
    for (const part of parts) {
      if (part.title === null) {
        add({ series: 'court', title: `${fileTitle || 'Reports of the High Court'} (preface)`, day: 1, issuer: 'The High Court of the Charter', kind: 'preface', body: part.body, source: rel })
        continue
      }
      const cite = blocks(part.body).map(flat).find((b) => b.startsWith('**') && b.endsWith('**')) ?? ''
      const delivered = /^\|\s*Delivered\s*\|\s*(.*?)\s*\|\s*$/m.exec(part.body)
      const day = dayFrom(findDate(delivered?.[1] ?? part.body.slice(0, 3000))?.iso, last)
      last = day
      const dockets = [...stripMd(cite).matchAll(/(Ref\.\s?\d+|P-\d+)\s?\/\s?YL\s?\d+/g)].map((m) => courtKey(m[1]!))
      const coram = /^\|\s*Coram\s*\|\s*(.*?)\s*\|\s*$/m.exec(part.body)
      const votes = parseVotes(part.body, surnames)
      if (votes.problems.length) report.problems.push(...votes.problems.map((x) => `${rel}, ${part.title}: ${x}`))
      const title = stripMd(part.title)
      add({
        series: 'court',
        title,
        day,
        issuer: 'The High Court of the Charter',
        kind: dockets[0]?.startsWith('ref') ? 'reference' : 'opinion',
        body: part.body,
        source: `${rel}:${part.line + 1}`,
        aliases: dockets.map((d) => `court:${d}`),
        data: {
          citation: stripMd(cite),
          coram: coram ? stripMd(coram[1]!) : null,
          practiceStatements: [...new Set([...part.body.matchAll(/Practice Statement No\. (\d+)/g)].map((m) => Number(m[1])))],
          votes: votes.rows,
        },
      })
    }
    for (const hrel of list('records/hearings')) {
      const htext = read(hrel)!
      const title = stripMd(/^#\s+(.*)$/m.exec(htext)?.[1] ?? hrel)
      const body = htext.replace(/^#\s+.*\n/, '').replace(/^\n+/, '')
      const sitting = /^\|\s*Sitting\s*\|\s*(.*?)\s*\|\s*$/m.exec(body)
      const fileDate = /(\d{4}-\d{2}-\d{2})/.exec(hrel)?.[1]
      const day = dayFrom(findDate(sitting?.[1] ?? '')?.iso ?? fileDate, 1)
      const cite = blocks(body).map(flat).find((b) => b.startsWith('**') && b.endsWith('**')) ?? ''
      const docket = /(Ref\.\s?\d+|P-\d+)\s?\/\s?YL\s?\d+/.exec(stripMd(cite))
      add({ series: 'hearing', title, day, issuer: /assembly/i.test(hrel) ? 'The Commonwealth Assembly' : 'The High Court of the Charter', kind: 'transcript', body, source: hrel, aliases: docket ? [`hearing:${courtKey(docket[1]!)}`] : [] })
    }
  }

  // ----- the Steward's papers and the Founder's Advocate
  const sectionsOf = (rel: string, series: Series, issuer: string, kindOf: (title: string) => string, aliasesOf: (title: string) => string[], preferInworld = true) => {
    const text = read(rel) ?? ''
    const { fileTitle, parts } = divide(text, 1)
    let last = 1
    for (const part of parts) {
      if (part.title === null) {
        add({ series, title: `${fileTitle} (preface)`, day: 1, issuer, kind: 'preface', body: part.body, source: rel })
        continue
      }
      const bolds = blocks(part.body).map(flat).filter((b) => b.startsWith('**')).slice(0, 3).join(' ')
      const day = dayFrom(findDate(bolds || part.body.slice(0, 2000), preferInworld)?.iso ?? findDate(part.body.slice(0, 2000), preferInworld)?.iso, last)
      last = day
      add({ series, title: part.title, day, issuer, kind: kindOf(part.title), body: part.body, source: `${rel}:${part.line + 1}`, aliases: aliasesOf(part.title) })
    }
  }
  const STEWARD_KINDS: [string, string][] = [
    ['notice', 'notice'], ['conformity note', 'conformity note'], ['record of', 'record'], ['transmission', 'transmission'],
    ['instruction', 'instruction'], ['supply proposal', 'supply proposal'], ['written answer', 'written answer'],
    ['statement', 'statement to the Assembly'], ['decision', 'decisions'], ['note', 'note'],
  ]
  sectionsOf(
    'records/steward-papers.md',
    'papers',
    'The Steward',
    (t) => STEWARD_KINDS.find(([k]) => t.toLowerCase().includes(k))?.[1] ?? 'paper',
    (t) => {
      const m = /^(Written Answer|Supply Proposal|Statement to the Assembly|Standing Instruction) No\. (\d+)/.exec(t)
      return m ? [`steward:${m[1]!.toLowerCase()} ${m[2]}`] : []
    },
  )
  sectionsOf('records/founders-advocate.md', 'papers', "The Founder's Advocate", () => 'submission of counsel', () => [])

  // ----- the Almanac
  const worldDays = new Set<number>()
  {
    const rel = 'records/almanac.md'
    const text = read(rel) ?? ''
    const { fileTitle, parts } = divide(text, 1)
    let last = 1
    for (const part of parts) {
      if (part.title === null) {
        add({ series: 'almanac', title: `${fileTitle} (preface)`, day: 1, issuer: 'The Isles', kind: 'preface', body: part.body, source: rel })
        continue
      }
      const day = dayFrom(findDate(part.title)?.iso, last)
      last = day
      worldDays.add(day)
      add({ series: 'almanac', title: part.title, day, issuer: 'The Isles', kind: 'day', body: part.body, source: `${rel}:${part.line + 1}`, data: parseAlmanacDay(part.body) })
    }
  }

  // ----- the ministries' papers (archive._ministry)
  const ministryNames: Record<string, string> = {}
  for (const slug of MINISTRIES) {
    const rel = `records/ministries/${slug}.md`
    const text = read(rel)
    if (text === null) continue
    const { heads, lines } = headings(text)
    const titleHead = heads.find((h) => h.level === 1 && h.line < 10)
    const name = (titleHead?.title ?? slug).replace(/^Papers of\s+/, '')
    ministryNames[slug] = name
    const after = heads.filter((h) => !titleHead || h.line > titleHead.line)
    const top = after.length ? Math.min(...after.map((h) => h.level)) : 0
    const marks = after.filter((h) => h.level === top)
    const prefaceEnd = marks[0]?.line ?? lines.length
    add({ series: 'advice', title: titleHead?.title ?? `Papers of ${name}`, day: 1, issuer: name, kind: 'register', body: joinBody(lines.slice(titleHead ? titleHead.line + 1 : 0, prefaceEnd)), source: rel })
    let last = 1
    marks.forEach((h, k) => {
      const body = joinBody(lines.slice(h.line + 1, k + 1 < marks.length ? marks[k + 1]!.line : lines.length))
      const head = body.slice(0, 600)
      const code = /\b[A-Z]{2,4}\/YL\d+\/\d+[A-Z]?\b/.exec(`${h.title} ${head.slice(0, 300)}`)?.[0]
      const subject = /\*\*Subject:\*\*\s*(.*)/.exec(head)?.[1]
      const title = code ? (subject ? `${code} — ${clip(stripMd(subject), 140)}` : code) : h.title
      const day = dayFrom(findDate(head)?.iso, last)
      last = day
      add({ series: 'advice', title, day, issuer: name, kind: 'paper', body, source: `${rel}:${h.line + 1}`, aliases: code ? [`advice:${code}`] : [], data: { code: code ?? null, subject: subject ? stripMd(subject) : null } })
    })
  }

  // ----- the Founder's Words
  const words: Word[] = []
  const wordDrafts = new Map<number, Draft>()
  {
    const rel = 'records/founders-words.md'
    const text = read(rel) ?? ''
    const { fileTitle, parts } = divide(text, 2)
    let last = 1
    for (const part of parts) {
      if (part.title === null) {
        add({ series: 'words', title: `${fileTitle} (preface)`, day: 1, issuer: 'The Founder', kind: 'preface', body: part.body, source: rel })
        continue
      }
      const w = parseWord(part.title, part.body)
      if (!w) {
        const day = dayFrom(findDate(`${part.title} ${part.body.slice(0, 1500)}`)?.iso, last)
        last = day
        add({ series: 'words', title: part.title, day, issuer: "The Steward's Office", kind: 'paper laid before the Founder', body: part.body, source: `${rel}:${part.line + 1}` })
        continue
      }
      // Words are entered in the order given, so none is dated before the one above it
      const day = Math.max(last, dayFrom(w.given, last))
      if (!w.given) report.problems.push(`${rel}, ${part.title}: no in-world date where it was given (only a real date, or none); dated as the entry before it, day ${day}`)
      last = day
      const d = add({
        series: 'words',
        title: part.title,
        day,
        issuer: 'The Founder',
        kind: 'word',
        body: part.body,
        source: `${rel}:${part.line + 1}`,
        aliases: [`word:${w.number}`, ...w.inner.map((x) => `word:${x.number}`)],
        data: { number: w.number, given: day, alsoEntered: w.inner.map((x) => x.number), silence: w.silence },
      })
      wordDrafts.set(w.number, d)
      words.push({ number: w.number, day, text: w.text, silence: w.silence, confirmed: true, remonstrances: [], document: '' })
      for (const inner of w.inner) {
        wordDrafts.set(inner.number, d)
        words.push({ number: inner.number, day, text: inner.text, silence: false, confirmed: true, remonstrances: [], document: '' })
      }
      timeline.push({ day, kind: 'word', headline: part.title, text: clip(w.text.replace(/\n+/g, ' '), 300), changes: [] })
      for (const inner of w.inner) timeline.push({ day, kind: 'word', headline: `Word No. ${inner.number}, given the same day`, text: clip(inner.text, 300), changes: [] })
    }
    words.sort((a, b) => a.number - b.number)
  }

  // ----- the Founder's inbox: what the Founder answered from the website (not imported as documents)
  const inboxText = read('inbox/aegis-inbox.md')
  const inbox = inboxText ? parseInbox(inboxText) : []

  // ----- questions
  const questions: Question[] = []
  const questionDrafts = new Map<string, Draft>()
  {
    const rel = 'inbox/questions-for-aegis.md'
    const text = read(rel) ?? ''
    const preface = divide(text, 2).parts.find((p) => p.title === null)
    if (preface) add({ series: 'questions', title: 'Questions for Aegis (the queue)', day: 1, issuer: "The Steward's Office", kind: 'preface', body: preface.body, source: rel })
    const { questions: parsed, malformed } = parseQuestionQueue(text)
    const kinds: Record<string, Question['kind']> = { court: 'court', assembly: 'legislature', counsel: 'counsel', press: 'press', ministry: 'ministry', citizen: 'citizen', review: 'review', other: 'other' }
    const raw = new Map(level2Sections(text).map((s) => [s.heading, s.lines.join('\n').replace(/^\n+/, '')]))
    for (const q of parsed) {
      const day = dayFrom(findDate(q.asked)?.iso, 1)
      const d = add({
        series: 'questions',
        title: `${q.number} — ${clip(q.question.replace(/\n+/g, ' '), 90)}`,
        day,
        issuer: q.from || "The Steward's Office",
        kind: 'question',
        body: joinBody((raw.get(q.number) ?? '').split('\n')),
        source: `${rel}#${q.number}`,
        aliases: [`question:${q.number}`],
        data: { number: q.number, kind: q.kind, status: q.status, source: q.source, review: q.review || null },
      })
      questionDrafts.set(q.number, d)
      report.problems.push(...q.problems.map((p) => `${rel}, ${q.number}: ${p}`))
      const sub = inbox.filter((e) => e.question === q.number)
      const lastSub = sub[sub.length - 1]
      const status: Question['status'] = q.answered ? 'answered' : lastSub?.response.toLowerCase().startsWith('ask me later') ? 'later' : lastSub?.response.toLowerCase().startsWith('no answer') ? 'no-answer' : 'open'
      const answerWords = sub.filter((e) => e.words.trim()).pop()?.words
      questions.push({
        id: q.number,
        from: q.from,
        kind: kinds[q.kind.trim().toLowerCase()] ?? 'other',
        day,
        text: q.question,
        status,
        ...(answerWords || q.answeredWhere ? { answer: answerWords ?? q.answeredWhere } : {}),
        source: '', // filled once ids are known: the Word that answered it, else this document
      })
      ;(questions[questions.length - 1] as Question & { _cite?: string })._cite = /Words? No\. (\d+)/.exec(q.answeredWhere)?.[1]
    }
    for (const m of malformed) unparsed('questions', `Unreadable section of the question queue: ${m.heading}`, m.raw, rel, m.why, currentDay, "The Steward's Office")
  }
  {
    const rel = 'records/questions-put-to-the-founder.md'
    const text = read(rel) ?? ''
    const { fileTitle, parts } = divide(text, 2)
    let last = 1
    for (const part of parts) {
      if (part.title === null) {
        add({ series: 'questions', title: `${fileTitle} (preface)`, day: 1, issuer: "The Steward's Office", kind: 'preface', body: part.body, source: rel })
        continue
      }
      const wordNo = /Word No\. (\d+)/.exec(part.title)?.[1]
      const wd = wordNo ? words.find((w) => w.number === Number(wordNo))?.day : undefined
      const day = wd ?? last
      last = day
      const items = parseQuestionsPut(part.body)
      const sec = /^(\d+)\./.exec(part.title)?.[1] ?? String(questions.length + 1)
      const d = add({ series: 'questions', title: part.title, day, issuer: "The Steward's Office", kind: 'questions put', body: part.body, source: `${rel}:${part.line + 1}`, data: { items } })
      if (!items.length) report.problems.push(`${rel}, ${part.title}: no “**Put:**” question could be read; the section is a document only`)
      items.forEach((it, k) => {
        const qid = `QP-${sec.padStart(2, '0')}${items.length > 1 ? String.fromCharCode(97 + k) : ''}`
        questions.push({
          id: qid,
          from: "The Steward's Office",
          kind: /Sun|Herald|Chronicle|Wireless|press/i.test(it.put.slice(0, 40)) ? 'press' : /counsel/i.test(part.title ?? "") ? "counsel" : "other",
          day,
          text: stripMd(it.put),
          status: it.chosen ? 'answered' : 'open',
          ...(it.chosen ? { answer: stripMd(it.chosen) } : {}),
          source: '',
        })
        questionDrafts.set(qid, d)
      })
    }
  }

  // ----- letters, replies and drafts
  const letters: Letter[] = []
  {
    const lrel = 'records/letters-to-the-founder.md'
    const ltext = read(lrel) ?? ''
    const lpre = divide(ltext, 2).parts.find((p) => p.title === null)
    if (lpre) add({ series: 'letters', title: 'Letters to the Founder (preface)', day: 1, issuer: 'The State Archive', kind: 'preface', body: lpre.body, source: lrel })
    const rrel = 'records/replies-to-letters.md'
    const rtext = read(rrel) ?? ''
    const drel = 'records/drafts/replies-to-letters-draft.md'
    const dtext = read(drel) ?? ''
    const replies = new Map<string, { text: string; fields: Record<string, string> }>()
    const draftsBy = new Map<string, { text: string; fields: Record<string, string>; noDraft: boolean }>()
    const seen = new Set<string>()
    const noReply = new Set<string>()
    const sectionBody = (lines: string[]) => joinBody(lines.filter((_, k, all) => !(k === all.length - 1 && /^\s*---\s*$/.test(all[k]!))))
    for (const s of level2Sections(ltext)) {
      const L = parseFieldSection(s.heading, s.lines, LETTER_FIELDS)
      const body = sectionBody(s.lines)
      if (!L || !L.text.trim() || seen.has(L.number)) {
        unparsed('letters', `Unreadable section of the letters file: ${s.heading}`, `## ${s.heading}\n\n${body}`, lrel, !L ? 'the heading is not a letter number' : seen.has(L.number) ? 'the number is used twice' : 'no block quote holds the letter', currentDay)
        continue
      }
      seen.add(L.number)
      const from = L.fields['from'] ?? ''
      const day = dayFrom(findDate(L.fields['dated'] ?? '', false)?.iso, 1)
      if (L.stray.length) report.problems.push(`${lrel}, ${L.number}: ${L.stray.length} line(s) outside the fields and the letter`)
      add({
        series: 'letters',
        title: `${L.number} — ${from && from.toLowerCase() !== 'unsigned' ? `from ${clip(from, 80)}` : 'unsigned'}${L.fields['about'] ? `: ${clip(L.fields['about'], 80)}` : ''}`,
        day,
        issuer: from || 'Unsigned',
        kind: 'letter',
        body,
        source: `${lrel}#${L.number}`,
        aliases: [`letter:${L.number}`],
        data: { number: L.number, from, place: L.fields['place'] ?? null, dated: L.fields['dated'] ?? null, cameBy: L.fields['came by'] ?? null, about: L.fields['about'] ?? null },
      })
      letters.push({ id: L.number, from, ...(L.fields['place'] ? { place: L.fields['place'] } : {}), day, text: L.text, urgent: false, status: 'unread' })
    }
    const rpre = divide(rtext, 2).parts.find((p) => p.title === null)
    if (rpre) add({ series: 'letters', title: 'Replies of the Founder to the Letters (preface)', day: 1, issuer: 'The Founder', kind: 'preface', body: rpre.body, source: rrel })
    for (const s of level2Sections(rtext)) {
      const R = parseFieldSection(s.heading, s.lines, REPLY_FIELDS, /^(?:Reply to )?(L-\d+)\b\s*(.*)$/)
      const body = sectionBody(s.lines)
      // "## L-0053: no reply": read, and at the office's advice not answered
      if (R && !R.text.trim() && (/no reply/i.test(s.heading) || /^none\b/i.test(R.fields['words'] ?? ''))) {
        noReply.add(R.number)
        const letter = letters.find((l) => l.id === R.number)
        add({ series: 'letters', title: `${R.number}: no reply`, day: letter?.day ?? currentDay, issuer: 'The Founder', kind: 'no reply', body, source: `${rrel}#${R.number}`, refs: [`letter:${R.number}`], data: { letter: R.number, words: R.fields['words'] ?? null, record: R.fields['record'] ?? null } })
        continue
      }
      if (!R || !R.text.trim()) {
        unparsed('letters', `Unreadable section of the replies file: ${s.heading}`, `## ${s.heading}\n\n${body}`, rrel, !R ? 'the heading is not “Reply to L-nnnn”' : 'no block quote holds the reply', currentDay, 'The Founder')
        continue
      }
      replies.set(R.number, { text: R.text, fields: R.fields })
      const letter = letters.find((l) => l.id === R.number)
      const day = dayFrom(findDate(R.fields['record'] ?? '', false)?.iso, letter?.day ?? currentDay)
      add({ series: 'letters', title: `Reply to ${R.number}${R.fields['to'] ? ` — to ${clip(R.fields['to'], 80)}` : ''}`, day: Math.max(day, letter?.day ?? 1), issuer: 'The Founder', kind: 'reply', body, source: `${rrel}#${R.number}`, refs: [`letter:${R.number}`], data: { letter: R.number, words: R.fields['words'] ?? null, record: R.fields['record'] ?? null } })
    }
    const dparts = level2Sections(dtext)
    const dpre = divide(dtext, 2).parts.find((p) => p.title === null)
    if (dpre) add({ series: 'letters', title: "Draft replies to the Letters (the Steward's Office; preface)", day: 1, issuer: "The Steward's Office", kind: 'preface', body: dpre.body, source: drel })
    for (const s of dparts) {
      const body = sectionBody(s.lines)
      if (/^referrals$/i.test(s.heading.trim())) {
        add({ series: 'letters', title: 'Draft replies: referrals', day: currentDay, issuer: "The Steward's Office", kind: 'register', body, source: `${drel}#referrals` })
        continue
      }
      const D = parseFieldSection(s.heading, s.lines, DRAFT_FIELDS)
      if (!D) {
        unparsed('letters', `Unreadable section of the drafts file: ${s.heading}`, `## ${s.heading}\n\n${body}`, drel, 'the heading is not a letter number', currentDay, "The Steward's Office")
        continue
      }
      draftsBy.set(D.number, { text: D.text, fields: D.fields, noDraft: D.noDraft })
      const letter = letters.find((l) => l.id === D.number)
      add({ series: 'letters', title: `Draft reply to ${D.number} (the Steward's Office)`, day: letter?.day ?? currentDay, issuer: "The Steward's Office", kind: 'draft', body, source: `${drel}#${D.number}`, refs: [`letter:${D.number}`], data: { letter: D.number, recommendation: D.fields['recommendation'] ?? null, urgent: D.fields['urgent'] ?? null, referral: D.fields['referral'] ?? null, noDraft: D.noDraft } })
    }
    for (const L of letters) {
      const D = draftsBy.get(L.id)
      const R = replies.get(L.id)
      const subs = inbox.filter((e) => e.letter === L.id)
      if (D) {
        L.urgent = /^yes\b/i.test(D.fields['urgent'] ?? '')
        if (D.text.trim()) L.draft = D.text
      }
      if (R) {
        L.reply = R.text
        L.status = 'replied'
      } else if (noReply.has(L.id) || subs.some((e) => /^read, no reply/i.test(e.response))) L.status = 'no-reply'
      else if (subs.length) L.status = 'read'
    }
  }

  // ----- bills
  const bills: Bill[] = []
  {
    const rel = 'law/bills.md'
    const text = read(rel) ?? ''
    const { fileTitle, parts } = divide(text, 2)
    const register = parts.filter((p) => p.title === null || /^Bills presented$/i.test(p.title)).map((p) => (p.title ? `## ${p.title}\n\n${p.body}` : p.body)).join('\n\n')
    add({ series: 'bills', title: fileTitle || 'The Register of Bills', day: currentDay, issuer: 'The Clerk of the Lamps', kind: 'register', body: register, source: rel, aliases: ['bills:register'] })
    for (const part of parts) {
      if (part.title === null || /^Bills presented$/i.test(part.title)) continue
      const named = [...part.title.matchAll(/No\. (\d+)/g)].map((m) => Number(m[1]))
      const range = /Bills No\. (\d+) to No\. (\d+)/.exec(part.title)
      const numbers = range ? Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, k) => Number(range[1]) + k) : named
      const day = dayFrom(findDate(part.title, false)?.iso ?? findDate(part.body.slice(0, 800), false)?.iso, currentDay)
      add({ series: 'bills', title: part.title, day, issuer: 'The Clerk of the Lamps', kind: /^Notices/i.test(part.title) ? 'notices' : 'bill', body: part.body, source: `${rel}:${part.line + 1}`, aliases: numbers.map((n) => `billtext:${n}`), data: { bills: numbers } })
    }
    const reg = parseBillsRegister(text)
    report.problems.push(...reg.problems.map((p) => `${rel}: ${p}`))
    const overlay = parseOrderPaperOutcomes(stateText)
    for (const b of reg.bills) {
      bills.push({
        number: b.number,
        title: b.title,
        body: 'assembly',
        moved: b.moved,
        summary: clip(`${b.title}. ${b.outcome}`, 600),
        stage: b.stage,
        divisions: b.divisions.map((d) => ({ day: dayFrom(d.iso, currentDay), reading: d.reading, aye: d.aye, no: d.no, abstain: d.abstain })),
        effects: [],
        document: '',
      })
    }
    for (const o of overlay) {
      let bill = bills.find((b) => b.number === o.number)
      if (!bill) {
        bill = { number: o.number, title: o.title || `Bill No. ${o.number}`, body: 'assembly', moved: '', summary: `From the order paper in simulation/state.md: ${o.note}`, stage: o.stage, divisions: [], effects: [], document: '' }
        bills.push(bill)
        report.problems.push(`law/bills.md has no row for Bill No. ${o.number}; it was taken from the order paper in simulation/state.md (“${o.note}”)`)
      }
      const before = bill.stage
      if (!(before === 'passed' && o.stage === 'law' && /people/.test(o.note))) bill.stage = before === 'passed' && /to the people/.test(o.note) ? 'passed' : o.stage
      if (o.vote && !bill.divisions.some((d) => d.aye === o.vote![0] && d.no === o.vote![1])) {
        bill.divisions.push({ day: dayFrom(o.iso, currentDay), reading: o.stage === 'failed' ? 'Dry Reading (refused)' : 'Final question', aye: o.vote[0], no: o.vote[1], abstain: o.vote[2] })
      }
    }
    bills.sort((a, b) => a.number - b.number)
  }

  // ----- the law
  const constitutionText = read('law/constitution.md') ?? ''
  const charterText = read('law/charter-of-rights.md') ?? ''
  const whole = (rel: string, series: Series, issuer: string, kind: string, day: number, aliases: string[] = []) => {
    const text = read(rel)
    if (text === null) return null
    const titleLine = /^#\s+(.*)$/m.exec(text)
    const title = titleLine ? stripMd(titleLine[1]!) : rel.split('/').pop()!.replace(/\.md$/, '')
    const body = titleLine && text.trimStart().startsWith('#') ? text.replace(/^\s*#\s+.*\n/, '').replace(/^\n+/, '') : text
    return add({ series, title, day, issuer, kind, body, source: rel, aliases })
  }
  whole('law/constitution.md', 'law', 'The Convention of Owlsreach', 'constitution', 1, ['law:constitution'])
  whole('law/charter-of-rights.md', 'law', 'The Convention of Owlsreach', 'charter', 1, ['law:charter'])
  whole('law/statute-book.md', 'law', "The Steward's Office", 'statute book', currentDay)
  whole('law/standing-orders.md', 'law', "The Steward's Office", 'standing orders', 1)
  for (const rel of list('law/drafts')) whole(rel, 'law', "The Steward's Office", 'draft', currentDay)

  // ----- directions to the Steward
  const directionsDoc = whole('government/directions-to-the-steward.md', 'papers', "The Steward's Office", 'directions', currentDay)
  const parsedDirections: ParsedDirection[] = directionsDoc ? parseDirections(directionsDoc.body) : []
  if (directionsDoc && !parsedDirections.length) report.problems.push('government/directions-to-the-steward.md: no table of directions could be read')

  // ----- lore, handbooks, registers, the story so far
  for (const rel of list('lore')) whole(rel, 'lore', 'The State Archive', rel.endsWith('canon.md') ? 'canon' : 'lore', 1)
  const handbooks: [string, string][] = [
    ['government/overview.md', 'The State Archive'],
    ['government/executive.md', "The Steward's Office"],
    ['government/legislature.md', 'The Commonwealth Assembly'],
    ['government/judiciary.md', 'The High Court of the Charter'],
    ['government/founders-advocate.md', "The Founder's Advocate"],
    ['government/digital-service.md', 'The Commonwealth Digital Service'],
  ]
  for (const [rel, issuer] of handbooks) whole(rel, 'other', issuer, 'handbook', 1)
  whole('governing-doctrine.md', 'papers', 'The Steward', 'doctrine', 1)
  whole('legislative-record.md', 'other', "The Steward's Office", 'legislative record', currentDay)
  whole('national-profile.md', 'other', "The Steward's Office", 'national profile', currentDay)
  whole('founding-record.md', 'other', "The Steward's Office", 'founding record', 1)
  whole('00-INDEX.md', 'other', 'The State Archive', 'index of the archive', currentDay)
  whole('simulation/README.md', 'other', "The Steward's Office", 'rules of the simulation', 1)
  add({ series: 'other', title: 'State of the Commonwealth', day: currentDay, issuer: "The Steward's Office", kind: 'state of the commonwealth', body: stateText.replace(/^#\s+.*\n/, '').replace(/^\n+/, ''), source: 'simulation/state.md' })
  whole('notebook/claudetopia-story-so-far.md', 'other', 'The State Archive', 'story so far', currentDay)
  {
    const rel = 'chronicle.md'
    const text = read(rel) ?? ''
    const { fileTitle, parts } = divide(text, 2)
    let last = 1
    for (const part of parts) {
      if (part.title === null) {
        add({ series: 'other', title: `${fileTitle} (preface)`, day: 1, issuer: "The Steward's Office", kind: 'preface', body: part.body, source: rel })
        continue
      }
      // the Chronicle is kept by real date; an in-world date in the heading wins, and an
      // entry is never dated before the one above it
      const day = Math.max(last, dayFrom(findDate(part.title)?.iso, last))
      last = day
      add({ series: 'other', title: `Chronicle: ${part.title}`, day, issuer: "The Steward's Office", kind: 'chronicle entry', body: part.body, source: `${rel}:${part.line + 1}` })
    }
  }

  // ----- factbooks
  const factbooks: Factbook[] = []
  {
    const files = [...list('factbooks', '.md'), ...list('factbooks', '.bb')]
    const categories: Record<string, Factbook['category']> = { overview: 'overview', history: 'history', constitution: 'law', 'charter-of-rights': 'law', geography: 'geography', culture: 'culture', economy: 'economy', government: 'government' }
    for (const rel of files) {
      const raw = read(rel)!
      const md = rel.endsWith('.bb') ? bbcodeToMarkdown(raw) : raw
      const titleLine = /^#\s+(.*)$/m.exec(md)
      const base = rel.split('/').pop()!.replace(/\.(md|bb)$/, '')
      const title = titleLine ? stripMd(titleLine[1]!) : base
      const body = titleLine && md.trimStart().startsWith('#') ? md.replace(/^\s*#\s+.*\n/, '').replace(/^\n+/, '') : md
      const fullTitle = `${title}${rel.endsWith('.bb') ? ' (NationStates factbook, from BBCode)' : ''}`
      add({ series: 'factbook', title: fullTitle, day: currentDay, issuer: 'The Steward', kind: 'factbook', body, source: rel, data: { file: rel, format: rel.endsWith('.bb') ? 'bbcode' : 'markdown' } })
      if (factbooks.some((f) => f.id === base)) continue
      factbooks.push({ id: base, title, category: categories[base] ?? 'other', body, updatedDay: currentDay, author: 'ai' })
    }
  }

  // ----- anything else in the public record that no reader above took
  const EXCLUDED = new Set(['.claude', 'tools', 'site', 'flag', 'counsel', 'confidential', 'coordination', 'notebook', 'inbox', 'factbooks', '%SystemDrive%', 'graphify-out', '.git'])
  const walk = (dir: string): string[] =>
    readdirSync(join(source, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = dir ? `${dir}/${e.name}` : e.name
      if (e.isDirectory()) return dir === '' && EXCLUDED.has(e.name) ? [] : e.name.startsWith('.') ? [] : walk(rel)
      return e.name.toLowerCase().endsWith('.md') ? [rel] : []
    })
  for (const rel of walk('')) {
    if (handled.has(rel)) continue
    const text = readFileSync(join(source, rel), 'utf8').replace(/\r\n/g, '\n')
    const title = stripMd(/^#\s+(.*)$/m.exec(text)?.[1] ?? rel)
    unparsed('other', title, text, rel, 'no reader knows this file; it is kept whole as an uncatalogued record', currentDay)
  }
  report.skipped.push(
    'H:\\claudetopia\\coordination: never read (backups and private coordination)',
    'confidential/: not imported (not part of the public record)',
    'counsel/: not imported; counsel\'s private advice and papers to the Founder (private-papers.md and advice-no-*.md) were never part of the public record, and the site excluded the folder. The Founder\'s Advocate\'s public papers come from records/founders-advocate.md',
    'inbox/aegis-inbox.md: not imported as documents (the Founder\'s own submissions from the website); read only to mark which questions and letters were answered, and in what words',
    'notebook/: only claudetopia-story-so-far.md is imported; the anthem files, the out-of-character plans and the orchestration monitor are not records',
    '.claude/: the agent definitions are read for the ministers and their remits only',
    'site/, tools/, flag/: the old website, tools and the flag image are not records (the flag is redrawn from its colours)',
  )

  // ---------------------------------------------------------------------------------------
  // ids, then citations
  // ---------------------------------------------------------------------------------------
  const bySeries = new Map<Series, Draft[]>()
  for (const d of drafts) bySeries.set(d.series, [...(bySeries.get(d.series) ?? []), d])
  for (const [series, ds] of bySeries) {
    const fixed = new Set(ds.filter((d) => d.seq !== undefined).map((d) => d.seq!))
    let next = 1
    const free = () => {
      while (fixed.has(next)) next++
      return next++
    }
    if (series === 'petition') {
      // petitions keep their own numbers; anything without one comes after the highest
      next = Math.max(0, ...fixed) + 1
    }
    for (const d of [...ds].sort((a, b) => a.day - b.day || a.order - b.order)) d.id = docId(series, d.seq ?? free())
  }
  const alias = new Map<string, Draft>()
  for (const d of drafts) for (const a of d.aliases) if (!alias.has(a)) alias.set(a, d)
  // a hearing answers to its docket where no report has been made yet
  for (const d of drafts) for (const a of d.aliases) if (a.startsWith('hearing:') && !alias.has(`court:${a.slice(8)}`)) alias.set(`court:${a.slice(8)}`, d)
  // a bill's text, where it has one, otherwise the register
  const billDoc = (n: number) => alias.get(`billtext:${n}`) ?? alias.get('bills:register')
  const resolve = (key: string): Draft | undefined => (key.startsWith('bill:') ? billDoc(Number(key.slice(5))) : alias.get(key))
  for (const d of drafts) {
    const refs = new Set<string>()
    for (const k of d.refs) {
      const t = resolve(k)
      if (t && t !== d) refs.add(t.id!)
    }
    for (const c of CITES) {
      for (const m of d.body.matchAll(c.re)) {
        const t = resolve(c.key(m))
        if (t && t !== d) refs.add(t.id!)
      }
    }
    d.refs = [...refs]
  }

  const documents: ArchiveDocument[] = drafts
    .sort((a, b) => a.id!.localeCompare(b.id!))
    .map((d) => ({
      id: d.id!,
      series: d.series,
      title: d.title,
      day: d.day,
      date: formatDate(CALENDAR_START, d.day),
      issuer: d.issuer,
      kind: d.kind,
      refs: d.refs,
      body: d.body.replace(/\r\n/g, '\n').replace(/^\n+/, '').trimEnd(),
      ...(d.data === undefined ? {} : { data: d.data }),
    }))
  for (const d of drafts) {
    const i = (d as Draft & { unparsedIndex?: number }).unparsedIndex
    if (i !== undefined) report.unparsed[i]!.document = d.id!
  }

  // fill in the document ids the state refers to
  for (const w of words) {
    const d = wordDrafts.get(w.number)!
    w.document = d.id!
    const remon = /\*\*Remonstrances? (?:received|of)[\s\S]*?(?=\n\*\*The Founder's last Word|\n\*\*The Steward's|$)/.exec(d.body)?.[0] ?? ''
    w.remonstrances = [...new Set(CITES.flatMap((c) => [...remon.matchAll(c.re)].map((m) => resolve(c.key(m)))).filter((t): t is Draft => !!t && (t.series === 'court' || t.series === 'hansard')).map((t) => t.id!))]
    if (/Remonstrance No\. 1 of the High Court/.test(remon) && /In re the Founder's Word\b/.test(remon)) {
      const court = drafts.find((x) => x.series === 'court' && x.title === "In re the Founder's Word")
      if (court && !w.remonstrances.includes(court.id!)) w.remonstrances.push(court.id!)
    }
  }
  for (const q of questions) {
    const cite = (q as Question & { _cite?: string })._cite
    delete (q as Question & { _cite?: string })._cite
    q.source = (cite && alias.get(`word:${cite}`)?.id) || questionDrafts.get(q.id)?.id || ''
  }
  for (const b of bills) b.document = billDoc(b.number)?.id ?? ''

  // ---------------------------------------------------------------------------------------
  // Institutions
  // ---------------------------------------------------------------------------------------
  const parties: Party[] = leg.parties.map((p) => {
    const colour = colours[p.colourName.toLowerCase()]
    if (!colour) report.problems.push(`site/catalog.json has no screen colour for “${p.colourName}” (${p.name}); grey is used`)
    return {
      id: p.id,
      name: p.name,
      ...(p.nickname ? { nickname: p.nickname } : {}),
      seats: p.seats,
      leader: p.leader,
      description: p.description || `${p.name}, ${p.side}.`,
      factions: PARTY_FACTIONS[p.id] ?? [],
      colour: colour ?? '#8a8a86',
    }
  })
  for (const p of parties) if (!PARTY_FACTIONS[p.id]) report.problems.push(`no faction mapping for party ${p.id}`)
  const assemblyMembers: Member[] = leg.members.map((m) => ({ id: m.id, name: m.name, party: m.party, office: m.office, character: m.character }))
  const speaker = assemblyMembers.find((m) => m.office === 'Speaker')
  if (speaker && leg.speaker) {
    const sec = /### 3\.1 The Speaker\s+([\s\S]*?)\n### /.exec(legislatureText)?.[1]
    if (sec) speaker.character = clip(stripMd(flat(sec.split(/\n\s*\n/).slice(1, 3).join(' '))), 400)
  }
  const assembly: Body = {
    id: 'assembly',
    kind: 'legislature',
    name: 'The Commonwealth Assembly',
    shortName: 'the Assembly',
    size: parties.reduce((s, p) => s + p.seats, 0),
    parties,
    members: assemblyMembers,
    description: 'The 151-member legislature at the Wick Hall, Owlsreach, elected by proportional representation from six island lists for four years. It debates every Petition, ranks the courses on the Ladder and counts lamps: 101 binds the Steward (Article 65). It holds the purse (Article 18).',
  }
  const court: Body = {
    id: 'high-court',
    kind: 'court',
    name: 'The High Court of the Charter',
    shortName: 'the Court',
    size: jud.justices.length,
    parties: [],
    members: jud.justices.map((j) => ({ id: j.id, name: j.name, party: '', office: j.office, character: j.character, philosophy: j.philosophy })),
    description: 'Seven justices at the Old Lighthouse, Owlsreach. On every Petition it says of each course whether the Charter permits it; four votes bar a course and five overrule an earlier decision (Judiciary Schedule, paragraph 6).',
  }
  const ministries: Body[] = []
  const executiveText = read('government/executive.md') ?? ''
  const cabinetTable = readTables(executiveText).find((t) => t.header[0]?.toLowerCase() === 'ministry')
  for (const slug of MINISTRIES) {
    const agentRel = `.claude/agents/ministry-${slug}.md`
    const agent = existsSync(join(source, agentRel)) ? readFileSync(join(source, agentRel), 'utf8').replace(/\r\n/g, '\n') : ''
    const you = /You are (The .+?) of the Commonwealth of Claudetopia, and its (?:Minister|Marshal), ([^:]+?):/.exec(agent)
    const remit = /\*\*Your remit:\*\*\s*(.*)/.exec(agent)?.[1] ?? ''
    const minister = you?.[2]?.trim() ?? ''
    const character = minister ? new RegExp(String.raw`\*\*${minister.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\.\*\*\s*(.*)`).exec(agent)?.[1] ?? '' : ''
    const row = cabinetTable?.rows.find((r) => minister && stripMd(r[1] ?? '').includes(minister.replace(/^Marshal\s+/, '')))
    if (!agent) report.problems.push(`${agentRel}: not found; the ministry ${slug} is built from the Cabinet table alone`)
    const portfolio = Object.entries(CABINET).find(([, v]) => v.ministry === slug)?.[0]
    const name = you?.[1] ?? ministryNames[slug] ?? slug
    ministries.push({
      id: `ministry-${slug}`,
      kind: 'ministry',
      name,
      shortName: name.replace(/^The /, 'the '),
      size: 1,
      parties: [],
      members: [{ id: slugify(minister || slug), name: minister || stripMd(row?.[1] ?? ''), party: '', office: slug === 'lantern-guard' ? 'Marshal of the Lantern Guard' : `Minister for ${name.replace(/^The Ministry of /, '').replace(/^The Treasury$/, 'the Treasury')}`, character: stripMd(character || row?.[2] || '') }],
      ...(portfolio ? { portfolio } : {}),
      description: remit ? `Remit: ${remit}` : stripMd(row?.[2] ?? ''),
    })
  }

  const articles: Article[] = parseConstitution(constitutionText)
  if (!articles.some((a) => a.number === '0')) report.problems.push('law/constitution.md: Article 0 could not be found')
  const lastArticle = Math.max(...articles.map((a) => Number(a.number)).filter(Number.isFinite))
  if (lastArticle !== 72) report.problems.push(`law/constitution.md: the last article read is ${lastArticle}, not 72`)
  const rights: Right[] = parseCharter(charterText).map((r) => ({
    id: r.id,
    title: r.title,
    text: r.text,
    against: RIGHT_TAGS[r.id]?.against ?? [],
    guards: RIGHT_TAGS[r.id]?.guards ?? [],
    absolute: r.absolute,
  }))
  if (rights.length !== 20) report.problems.push(`law/charter-of-rights.md: ${rights.length} rights read, not twenty`)
  const canonText = read('lore/canon.md') ?? ''
  const canon: string[] = []
  for (const b of blocks(canonText.split('\n').slice(1).join('\n'))) {
    if (/^#/.test(b)) continue
    if (b.trimStart().startsWith('|')) {
      for (const t of readTables(b)) for (const r of t.rows) if (r.some((c) => c.trim())) canon.push(stripMd(t.header[0] && t.header[1] ? `${r[0]}: ${r.slice(1).join('; ')}` : r.join('; ')))
      continue
    }
    const line = stripMd(flat(b.replace(/^[-*+]\s+/, '')))
    if (line && !RULE_LINE.test(line)) canon.push(line)
  }

  const institutions: Institutions = {
    constitution: {
      form: 'commonwealth',
      stateName: 'The Commonwealth of Claudetopia',
      formName: 'Commonwealth',
      since: 1,
      articles,
      rights,
      rules: {
        executive: { title: 'Steward', holder: 'The Steward' },
        steps: [
          { body: 'assembly', role: 'recommend', stage: 1, bindAt: 101 / 151, carryAt: 0.5 },
          { body: 'high-court', role: 'review', stage: 1, barVotes: 4, binding: true },
          ...ministries.map((m) => ({ body: m.id, role: 'advise' as const, stage: 1 })),
        ],
        vetoWithReasons: true,
        reconciliation: true,
        exchanges: 3,
        dismissOnlyAtStandstill: true,
        minorsThroughBodies: true,
      },
      amendment: articles.find((a) => a.number === '67')?.text ?? 'This Constitution is amended by a bill passed by 101 votes of the Assembly and approved by the people (Article 67).',
    },
    bodies: [assembly, court, ...ministries],
    press: PRESS,
    founder: { name: 'Aegis', title: 'the Founder' },
    calendar: { start: CALENDAR_START },
    canon,
  }

  // ---------------------------------------------------------------------------------------
  // The engine
  // ---------------------------------------------------------------------------------------
  const { content, problems: packProblems } = checkPack(join(repo, 'packs/core'))
  if (packProblems.length) throw new Error(`the core pack has problems: ${packProblems.map((p) => p.message).join('; ')}`)
  let state = newNation(
    content,
    {
      name: 'Claudetopia',
      capital: 'Owlsreach',
      currency: 'token',
      demonym: 'Claudetopian',
      leaderTitle: 'Steward',
      animal: 'lantern owl',
      motto: 'Think Carefully, Act Kindly',
      faith: 'the Lantern Way',
      // the real flag is a gold lantern owl at the hoist on midnight navy; a gold canton on
      // navy is the nearest layout the web app draws
      flag: { layout: 'canton', colours: ['#152a4f', '#d9a521'] },
    },
    SEED,
  )
  for (const m of INDICATOR_MAPPING) state.indicators[m.indicator] = m.value
  for (const [portfolio, c] of Object.entries(CABINET)) {
    if (!state.cabinet[portfolio]) report.problems.push(`the core pack has no portfolio ${portfolio}`)
    else state.cabinet[portfolio] = { name: c.name, standing: 50 }
  }
  for (const p of content.portfolios) if (!CABINET[p.id]) report.problems.push(`the core pack's portfolio ${p.id} has no Claudetopian minister; it keeps a generated name`)
  state.day = currentDay
  // The general election falls by 11 October 2030 (Constitution, Article 70), and every four
  // years after: not the engine's default term.
  state.electionDay = dayOf(CALENDAR_START_FOR_TERM, '2030-10-11')
  state.term = state.electionDay - 1
  state.agenda = buildAgenda(state, content)
  const founding = state.timeline.filter((e) => e.kind === 'founding')
  const rest = state.timeline.filter((e) => e.kind !== 'founding')
  state.timeline = [...founding, ...[...rest, ...timeline].sort((a, b) => a.day - b.day)]
  state = deserialize(serialize(state))

  const now = new Date().toISOString()
  const factionApproval = Object.fromEntries(Object.entries(state.factions).map(([k, v]) => [k, v.approval]))
  const government: GovernmentState = {
    version: GOVERNMENT_VERSION,
    mode: 'found',
    institutions,
    censusBase: { population: 5_000_000, gdpPerHead: 222_000_000_000 / 5_000_000, taxRate: 21.8, crimePerHour: 4.17, growth: 0.00002 },
    dockets: {},
    petitions: Math.max(0, ...petitionNumbers),
    words,
    questions,
    letters,
    bills,
    directions: parsedDirections.map((d) => ({ day: dayFrom(d.iso, 1), from: d.from, text: d.text, document: directionsDoc?.id ?? '', done: d.done })),
    factbooks,
    worldDays: [...worldDays].sort((a, b) => a - b),
    lastWorldDay: Math.max(0, ...worldDays),
    origin: 'claudetopia-archive',
  }
  const save: SaveFile2 = {
    format: 2,
    id,
    createdAt: now,
    updatedAt: now,
    state: serialize(state),
    history: [{ day: state.day, indicators: { ...state.indicators }, support: support(state), factions: factionApproval }],
    government,
  }
  for (const d of documents) report.counts[d.series] = (report.counts[d.series] ?? 0) + 1
  return { save, documents, report, currentDay, state }
}

const RULE_LINE = /^[-*_]{3,}$/

// The import's own report, as a document of the 'other' series.
export function reportDocument(result: Omit<ImportResult, 'save'> & { save: SaveFile2 }, seq: number): ArchiveDocument {
  const { report, currentDay, save } = result
  const g = save.government
  // this report is itself one of the 'other' documents
  const counts = { ...report.counts, other: (report.counts.other ?? 0) + 1 }
  const lines: string[] = []
  lines.push(
    'This nation was imported from the State Archive of the Commonwealth of Claudetopia, a NationStates nation whose government was played by Claude agents (H:\\claudetopia). Every public record was divided into documents as the old government website divided them. Bodies are the archive\'s own Markdown, unchanged. Nothing in the source was modified.',
    '',
    `The in-world date at import is ${formatDate(CALENDAR_START, currentDay)}, engine day ${currentDay} (day 1 is ${formatDate(CALENDAR_START, 1)}).`,
    '',
    '## Documents by series',
    '',
    '| Series | Documents |',
    '|---|---|',
    ...Object.entries(counts).map(([s, n]) => `| ${s} | ${n} |`),
    '',
    '## Indicators from the NationStates ratings',
    '',
    'The NationStates effects were never the engine\'s, so the timeline carries every decided petition and every Word with no changes, and the indicators are set once, here:',
    '',
    '| Indicator | Value | From |',
    '|---|---|---|',
    ...INDICATOR_MAPPING.map((m) => `| ${m.indicator} | ${m.value} | ${m.from} |`),
    `| environment | ${JSON.parse(save.state).indicators.environment} | No rating read; the engine's starting value is kept |`,
    '',
    'The census base is the NationStates figures: population 5,000,000; economy 222bn tokens (44,400 a head); income tax 21.8%; crime 4.17 an hour.',
    '',
    '## The cabinet',
    '',
    ...Object.entries(CABINET).map(([p, c]) => `- ${p}: ${c.name} (${c.ministry})`),
    '',
    '## Government state',
    '',
    `- Mode: found (the Steward governed; the Founder, Aegis, watched and gave Words).`,
    `- Petitions: the last number used is ${g.petitions} (Claudetopia's petitions carry their NationStates issue numbers).`,
    `- Words: ${g.words.length}. Questions: ${g.questions.length} (${g.questions.filter((q) => q.status === 'open').length} open). Letters: ${g.letters.length} (${g.letters.filter((l) => l.status === 'replied').length} replied). Bills: ${g.bills.length}. Directions: ${g.directions.length} (${g.directions.filter((d) => !d.done).length} owed). Factbooks: ${g.factbooks.length}.`,
    '',
    '## Not carried over',
    '',
    ...report.skipped.map((s) => `- ${s}`),
    '- The NationStates statistics after each petition stay in the petition records; the engine did not make them and does not replay them.',
    '- The engine holds its own elections every 45 days; Claudetopia\'s next general election is in 2030. The engine\'s first will fall on day 45.',
    '',
    '## Sections kept whole because they could not be read',
    '',
    ...(report.unparsed.length ? report.unparsed.map((u) => `- ${u.document}: ${u.source}: ${u.why}`) : ['None.']),
    '',
    '## Reading problems',
    '',
    ...(report.problems.length ? report.problems.map((p) => `- ${p}`) : ['None.']),
  )
  return {
    id: docId('other', seq),
    series: 'other',
    title: 'Import of the Claudetopia State Archive',
    day: currentDay,
    date: formatDate(CALENDAR_START, currentDay),
    issuer: 'Project Diplomat (import)',
    kind: 'import report',
    refs: [],
    body: lines.join('\n'),
    data: { counts, indicators: INDICATOR_MAPPING, unparsed: report.unparsed.length, problems: report.problems.length },
  }
}

export const relativeTo = (root: string, full: string) => relative(root, full).replace(/\\/g, '/')
export { INDICATORS }
