// A nation's government as a whole: made at founding, checked when a save is loaded, and
// written into the record as its founding documents.

import type { Content, GameState } from '@diplomat/engine'
import { censusBase as baseFor } from './census.ts'
import { formatDate } from './documents.ts'
import { buildInstitutions, FORMS } from './forms.ts'
import {
  FORM_IDS,
  GOVERNMENT_VERSION,
  SERIES,
  type ArchiveDocument,
  type Body,
  type CensusBase,
  type FormId,
  type GovernmentState,
  type Mode,
} from './types.ts'
import { isObject } from './util.ts'

export function newGovernment(
  form: FormId,
  mode: Mode,
  state: GameState,
  content: Content,
  opts: {
    founder: { name: string; title: string }
    calendarStart: string
    seed: number
    answers?: Record<string, string>
    censusBase?: CensusBase
    origin?: string
  },
): GovernmentState {
  const institutions = buildInstitutions(form, state, content, opts)
  // In govern mode the player holds the executive office as well as standing above it.
  if (mode === 'govern') {
    institutions.constitution.rules.executive.holder = opts.founder.name
    institutions.canon = institutions.canon.map((c) =>
      c.startsWith('The executive is ') ? `The executive is ${institutions.constitution.rules.executive.title.replace(/^The /, 'the ')}, held by ${opts.founder.name}.` : c,
    )
  }
  return {
    version: GOVERNMENT_VERSION,
    mode,
    institutions,
    censusBase: opts.censusBase ?? baseFor(opts.answers ?? {}, opts.seed),
    dockets: {},
    petitions: 0,
    words: [],
    questions: [],
    letters: [],
    bills: [],
    directions: [],
    factbooks: [],
    worldDays: [],
    lastWorldDay: 0,
    ...(opts.origin ? { origin: opts.origin } : {}),
  }
}

// ---------------------------------------------------------------------------------------
// Loading: a deep shape check, as engine/save.ts does for the engine's state
// ---------------------------------------------------------------------------------------

type Check = (value: unknown) => boolean

const isNumber: Check = (v) => typeof v === 'number' && Number.isFinite(v)
const isString: Check = (v) => typeof v === 'string'
const isBoolean: Check = (v) => typeof v === 'boolean'
const isCount: Check = (v) => Number.isSafeInteger(v) && (v as number) >= 0
const oneOf = (list: readonly unknown[]): Check => (v) => list.includes(v)
const optional = (check: Check): Check => (v) => v === undefined || check(v)
const listOf = (item: Check): Check => (v) => Array.isArray(v) && v.every(item)
const mapOf = (item: Check): Check => (v) => isObject(v) && Object.values(v).every(item)
const shaped = (shape: Record<string, Check>): Check => (v) => isObject(v) && Object.entries(shape).every(([k, c]) => c(v[k]))
const strings = listOf(isString)

const isEffect: Check = (v) => isObject(v) && (('by' in v && isNumber(v['by'])) || 'policy' in v || 'flag' in v || 'identity' in v || 'treaty' in v || 'endTreaty' in v || 'standing' in v)

const isStep = shaped({
  body: isString,
  role: oneOf(['recommend', 'review', 'decide', 'advise', 'assent']),
  stage: isNumber,
  bindAt: optional(isNumber),
  carryAt: optional(isNumber),
  barVotes: optional(isCount),
  binding: optional(isBoolean),
  decisive: optional(isBoolean),
})

const isRules = shaped({
  executive: shaped({ title: isString, holder: isString }),
  steps: listOf(isStep),
  vetoWithReasons: isBoolean,
  reconciliation: isBoolean,
  exchanges: isCount,
  dismissOnlyAtStandstill: isBoolean,
  minorsThroughBodies: isBoolean,
})

const isArticle = shaped({ number: isString, title: isString, text: isString })
const isRight = shaped({
  id: isString,
  title: isString,
  text: isString,
  against: strings,
  guards: listOf(shaped({ indicator: isString, floor: isNumber })),
  absolute: isBoolean,
})

const isBody = shaped({
  id: isString,
  kind: oneOf(['legislature', 'court', 'council', 'electorate', 'ministry']),
  name: isString,
  shortName: isString,
  size: isCount,
  parties: listOf(shaped({ id: isString, name: isString, nickname: optional(isString), seats: isCount, leader: isString, description: isString, factions: strings, colour: isString })),
  members: listOf(shaped({ id: isString, name: isString, party: isString, office: optional(isString), character: isString, philosophy: optional(isString) })),
  portfolio: optional(isString),
  description: isString,
})

const isInstitutions = shaped({
  constitution: shaped({
    form: oneOf(FORM_IDS),
    stateName: isString,
    formName: isString,
    since: isCount,
    articles: listOf(isArticle),
    rights: listOf(isRight),
    rules: isRules,
    amendment: isString,
  }),
  bodies: listOf(isBody),
  press: listOf(shaped({ id: isString, name: isString, line: isString, kind: oneOf(['paper', 'broadcaster']) })),
  founder: shaped({ name: isString, title: isString }),
  calendar: shaped({ start: (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) }),
  canon: strings,
})

const isDivision = shaped({ aye: isCount, no: isCount, abstain: isCount, byParty: mapOf(shaped({ aye: isCount, no: isCount, abstain: isCount })) })
const isVotes = mapOf(oneOf(['permit', 'bar']))
const isStanding = shaped({
  permitted: strings,
  barred: strings,
  mustTake: optional(isString),
  vetoable: optional(isString),
  standstill: isBoolean,
  explanation: isString,
  advisedAgainst: optional(strings),
})
const isDecision = shaped({
  course: isString,
  by: oneOf(['executive', 'body', 'word', 'standstill']),
  reasons: isString,
  veto: optional(shaped({ course: isString, reasons: isString })),
  word: optional(isString),
  day: isCount,
})

const isDocket = shaped({
  dilemma: isString,
  day: isCount,
  number: isCount,
  status: oneOf(['waiting', 'sitting', 'reconciling', 'exchanging', 'ready', 'deciding', 'decided', 'failed']),
  advice: listOf(shaped({ body: isString, favours: optional(isString), summary: isString, costing: optional(isString), document: isString, ai: isBoolean })),
  sittings: listOf(
    shaped({
      body: isString,
      kind: oneOf(['first', 'reconciliation', 'exchange']),
      ladder: strings,
      firstPreference: isString,
      division: isDivision,
      carried: isBoolean,
      binding: isBoolean,
      remonstrance: optional(isString),
      address: optional(isString),
      document: isString,
      ai: isBoolean,
    }),
  ),
  reviews: listOf(
    shaped({
      body: isString,
      kind: oneOf(['first', 'reply']),
      rulings: listOf(shaped({ course: isString, votes: isVotes, verdict: oneOf(['permitted', 'barred']), articles: strings, markers: strings })),
      binding: isBoolean,
      cautions: strings,
      directions: strings,
      document: isString,
      ai: isBoolean,
    }),
  ),
  exchanges: listOf(shaped({ from: isString, to: isString, kind: oneOf(['remonstrance', 'reference', 'reply', 'address', 'message']), text: isString, document: isString })),
  assents: listOf(shaped({ body: isString, given: isBoolean, reasons: isString, document: isString })),
  standing: (v) => v === null || isStanding(v),
  progress: strings,
  error: optional(isString),
  decision: optional(isDecision),
  document: isString,
})

const SHAPE: Record<string, Check> = {
  version: (v) => v === GOVERNMENT_VERSION,
  mode: oneOf(['govern', 'found']),
  institutions: isInstitutions,
  censusBase: shaped({ population: isNumber, gdpPerHead: isNumber, taxRate: isNumber, crimePerHour: isNumber, growth: isNumber }),
  dockets: mapOf(isDocket),
  petitions: isCount,
  words: listOf(shaped({ number: isCount, day: isCount, text: isString, overrules: optional(isString), silence: isBoolean, confirmed: isBoolean, remonstrances: strings, document: isString })),
  questions: listOf(
    shaped({
      id: isString,
      from: isString,
      kind: oneOf(['court', 'legislature', 'counsel', 'press', 'ministry', 'citizen', 'other', 'review']),
      day: isCount,
      text: isString,
      status: oneOf(['open', 'answered', 'no-answer', 'later']),
      answer: optional(isString),
      source: optional(isString),
    }),
  ),
  letters: listOf(
    shaped({
      id: isString,
      from: isString,
      place: optional(isString),
      day: isCount,
      text: isString,
      urgent: isBoolean,
      draft: optional(isString),
      reply: optional(isString),
      status: oneOf(['unread', 'read', 'replied', 'no-reply']),
    }),
  ),
  bills: listOf(
    shaped({
      number: isCount,
      title: isString,
      body: isString,
      moved: isString,
      summary: isString,
      stage: oneOf(['introduced', 'committee', 'passed', 'signed', 'returned', 'failed', 'law']),
      divisions: listOf(shaped({ day: isCount, reading: isString, aye: isCount, no: isCount, abstain: isCount })),
      effects: listOf(isEffect),
      amendment: optional(isObject),
      document: isString,
    }),
  ),
  directions: listOf(shaped({ day: isCount, from: isString, text: isString, document: isString, done: isBoolean })),
  factbooks: listOf(
    shaped({
      id: isString,
      title: isString,
      category: oneOf(['overview', 'history', 'geography', 'culture', 'economy', 'law', 'government', 'other']),
      body: isString,
      updatedDay: isCount,
      author: oneOf(['founder', 'ai']),
    }),
  ),
  worldDays: listOf(isCount),
  lastWorldDay: isCount,
  origin: optional(isString),
}

// Every part of a saved government, all the way down. What it cannot know is whether the
// faction and portfolio ids exist in the pack; the server checks the pack as it does for
// the engine.
export function checkGovernment(value: unknown): value is GovernmentState {
  return problemsOf(value).length === 0
}

// The same check, saying which part failed, for an error a player can act on.
export function problemsOf(value: unknown): string[] {
  if (!isObject(value)) return ['the government is not an object']
  return Object.entries(SHAPE)
    .filter(([key, check]) => !check(value[key]))
    .map(([key]) => `${key} is missing or malformed`)
}

// ---------------------------------------------------------------------------------------
// The founding documents
// ---------------------------------------------------------------------------------------

function bodyDocument(body: Body): string {
  const lines = [`# ${body.name}`, '', body.description, '']
  if (body.parties.length && body.kind !== 'electorate') {
    lines.push('## Parties', '', '| Party | Seats | Leader | Carries |', '|---|---|---|---|')
    for (const p of body.parties) lines.push(`| ${p.name} | ${p.seats} | ${p.leader || '—'} | ${p.factions.join(', ')} |`)
    lines.push('')
    for (const p of body.parties) lines.push(`**${p.name}.** ${p.description}`, '')
  }
  if (body.members.length) {
    lines.push('## Members', '')
    for (const m of body.members) {
      lines.push(`- **${m.name}**${m.office ? `, ${m.office}` : ''}. ${m.character}${m.philosophy ? ` *${m.philosophy}*` : ''}`)
    }
  }
  return lines.join('\n')
}

export function founderDocuments(gov: GovernmentState, state: GameState): Omit<ArchiveDocument, 'id'>[] {
  const i = gov.institutions
  const c = i.constitution
  const day = Math.max(1, c.since)
  const date = formatDate(i.calendar.start, day)
  const issuer = c.stateName
  const doc = (series: (typeof SERIES)[number], title: string, kind: string, body: string, data?: unknown): Omit<ArchiveDocument, 'id'> => ({
    series,
    title,
    day,
    date,
    issuer,
    kind,
    refs: [],
    body,
    ...(data === undefined ? {} : { data }),
  })
  const constitution = [
    `# The Constitution of ${c.stateName.replace(/^The /, 'the ')}`,
    '',
    `*${FORMS[c.form].name}. In force from ${date}.*`,
    '',
    ...c.articles.flatMap((a) => [`**Article ${a.number}. ${a.title}.**`, '', a.text, '']),
    ...(c.articles.some((a) => a.title === 'Amendment') ? [] : ['## Amendment', '', c.amendment]),
  ].join('\n')
  const charter = [
    `# The Charter of Rights of ${state.identity.name}`,
    '',
    'Rights marked *not to be limited* may not be limited by any law, in an emergency or otherwise.',
    '',
    ...c.rights.flatMap((r) => [`## Article ${r.id}: ${r.title}${r.absolute ? ' *(not to be limited)*' : ''}`, '', r.text, '']),
  ].join('\n')
  const ministries = i.bodies.filter((b) => b.kind === 'ministry')
  const docs = [
    doc('law', `The Constitution of ${state.identity.name}`, 'constitution', constitution, { form: c.form, rules: c.rules }),
    doc('law', `The Charter of Rights of ${state.identity.name}`, 'charter', charter),
    ...i.bodies.filter((b) => b.kind !== 'ministry').map((b) => doc('lore', b.name, 'body', bodyDocument(b), { body: b.id })),
  ]
  if (ministries.length) {
    docs.push(
      doc(
        'lore',
        'The ministries',
        'body',
        ['# The ministries', '', ...ministries.map((m) => `- **${m.name}**: ${m.members[0]?.office ?? ''} ${m.members[0]?.name ?? ''}. ${m.description}`)].join('\n'),
      ),
    )
  }
  docs.push(doc('lore', 'The press', 'press', ['# The press', '', ...i.press.map((p) => `- **${p.name}** (${p.kind}): ${p.line}.`)].join('\n')))
  docs.push(doc('lore', 'The canon', 'canon', ['# The canon', '', 'Fixed facts of the nation. Where anything else disagrees, these win.', '', ...i.canon.map((x) => `- ${x}`)].join('\n')))
  return docs
}
