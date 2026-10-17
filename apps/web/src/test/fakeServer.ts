import {
  INDICATORS,
  INDICATOR_INFO,
  adjust,
  agendaItems,
  availableOptions,
  callUp,
  decide,
  decideSituation,
  dismiss,
  endDay,
  newNation,
  serialize,
  startCrisis,
  type GameState,
  type Identity,
} from '@diplomat/engine'
import type {
  ArchiveDocument,
  Body,
  CensusFigure,
  Docket,
  FormId,
  GovernmentState,
  Mode,
  ProviderStatus,
  Series,
  Standing,
} from '@diplomat/government'
import type {
  AiSettings,
  AiSettingsChange,
  Api,
  ArchiveQuery,
  Changed,
  DecideRequest,
  FoundRequest,
  NationPayload,
  ServerStatus,
} from '../api.ts'
import { UNREACHABLE } from '../api.ts'
import { DISMISS, dismissOpen } from '../logic/docket.ts'
import { FORMS } from '../logic/forms.ts'
import { decode, newNationSave, summarise, withDayEnd, type Snapshot, type Summary } from '../logic/saves.ts'
import { content } from './fixtures.ts'

// An in-memory stand-in for apps/server, built on the engine, for the web app's tests. It
// keeps nations, a simple government for each (an Assembly, a Court and the ministries),
// dockets that a test can rig to any standing, and an Archive of documents. It enforces the
// standing the way the real server must: a barred course is refused, a binding one is the
// only one allowed, and setting aside a carried one needs written reasons, unless a Word
// is given. Every reply goes through JSON, as it would over the wire.

interface Held {
  id: string
  createdAt: string
  updatedAt: string
  state: GameState
  history: Snapshot[]
  government: GovernmentState
  archive: ArchiveDocument[]
  // GET dockets calls left before a sitting docket is ready.
  polls: Record<string, number>
}

export interface FakeOptions {
  seed?: number
  // How many times the dockets must be asked after before a new one is ready. 0 is at once.
  sittingPolls?: number
  minorsThroughBodies?: boolean
}

export interface HoldOptions {
  id?: string
  form?: FormId
  mode?: Mode
  minorsThroughBodies?: boolean
  // Leave the day's business without dockets, as a nation with no bodies would be.
  noDockets?: boolean
}

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const START = '2026-10-01'

function dateOf(day: number): string {
  const date = new Date(Date.UTC(2026, 9, day))
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .replace(',', '')
}

export const PARTIES = [
  { id: 'reds', name: 'The Red Party', seats: 70, leader: 'Ada Rook', colour: '#a61b29' },
  { id: 'blues', name: 'The Blue League', seats: 50, leader: 'Bram Hale', colour: '#1d4e89' },
  { id: 'greens', name: 'The Green Union', seats: 31, leader: 'Cora Fenn', colour: '#2c7d31' },
] as const

export const JUSTICES = ['Marlow', 'Quince', 'Ashdown', 'Pell', 'Varga', 'Temple', 'Oduya'].map((name, i) => ({
  id: `j${i + 1}`,
  name: `Justice ${name}`,
  party: '',
  ...(i === 0 ? { office: 'Chief Justice' } : {}),
  character: `Justice ${name} reads slowly and writes short.`,
  philosophy: i % 2 ? 'textualist' : 'purposive',
}))

export function standInGovernment(
  identity: Identity,
  form: FormId,
  mode: Mode,
  founder: { name: string; title: string },
  minorsThroughBodies = false,
): GovernmentState {
  const info = FORMS.find((f) => f.id === form) ?? FORMS[0]!
  const assembly: Body = {
    id: 'assembly',
    kind: 'legislature',
    name: 'The Assembly',
    shortName: 'the Assembly',
    size: 151,
    parties: PARTIES.map((p) => ({
      ...p,
      description: `${p.name} wants what its voters want, and says so at length.`,
      factions: [],
    })),
    members: [
      { id: 'speaker', name: 'Tarry Aldermoss', party: 'greens', office: 'Speaker', character: 'Calm, and slow to call anyone.' },
      ...PARTIES.map((p) => ({ id: `lead-${p.id}`, name: p.leader, party: p.id, office: `Leader of ${p.name}`, character: 'Brisk.' })),
    ],
    description: 'The legislature: it debates each petition and ranks its courses.',
  }
  const court: Body = {
    id: 'court',
    kind: 'court',
    name: 'The High Court',
    shortName: 'the Court',
    size: 7,
    parties: [],
    members: JUSTICES,
    description: 'Seven justices who rule each course permitted or barred.',
  }
  const ministries: Body[] = content.portfolios.slice(0, 4).map((p) => ({
    id: `ministry-${p.id}`,
    kind: 'ministry',
    name: `The ${p.title.replace(/ Minister$/, '')} Ministry`,
    shortName: `the ${p.title.replace(/ Minister$/, '')} Ministry`,
    size: 1,
    parties: [],
    members: [{ id: `minister-${p.id}`, name: `Minister ${p.id}`, party: '', office: p.title, character: 'Careful.' }],
    portfolio: p.id,
    description: `Speaks for ${p.id}.`,
  }))
  return {
    version: 1,
    mode,
    institutions: {
      constitution: {
        form,
        stateName: `The ${info.name} of ${identity.name}`,
        formName: info.name,
        since: 1,
        articles: [{ number: '0', title: 'The Founder', text: 'The Founder stands above every branch.' }],
        rights: [
          { id: 'C1', title: 'Free speech', text: 'Everyone may say what they think.', against: [], guards: [], absolute: false },
        ],
        rules: {
          executive: { title: info.executive, holder: 'Sam Holloway' },
          steps: [
            { body: 'assembly', role: 'recommend', stage: 1, bindAt: 101 / 151, carryAt: 0.5 },
            { body: 'court', role: 'review', stage: 1, barVotes: 4, binding: true },
          ],
          vetoWithReasons: true,
          reconciliation: true,
          exchanges: 3,
          dismissOnlyAtStandstill: true,
          minorsThroughBodies,
        },
        amendment: 'By a bill carried by two thirds, then the people.',
      },
      bodies: [assembly, court, ...ministries],
      press: [
        { id: 'chronicle', name: 'The Chronicle', line: 'sober, of record', kind: 'paper' },
        { id: 'wireless', name: 'Commonwealth Wireless', line: 'measured', kind: 'broadcaster' },
      ],
      founder,
      calendar: { start: START },
      canon: [],
    },
    censusBase: { population: 5_000_000, gdpPerHead: 30_000, taxRate: 21, crimePerHour: 4, growth: 0.0001 },
    dockets: {},
    petitions: 0,
    words: [],
    questions: [
      { id: 'Q-0001', from: 'The Chronicle', kind: 'press', day: 1, text: 'Will the Founder say what the country is for?', status: 'open' },
      { id: 'Q-0002', from: 'The High Court', kind: 'court', day: 1, text: 'Does Article 0 reach the courts?', status: 'open' },
    ],
    letters: [
      {
        id: 'L-0001',
        from: 'Edna Small',
        place: 'Lower Ferry',
        day: 1,
        text: 'The ferry is late again. Somebody ought to know.',
        urgent: false,
        draft: 'Thank you for writing. The Ministry has been told.',
        status: 'unread',
      },
      { id: 'L-0002', from: 'A fisherman', day: 1, text: 'The nets are empty.', urgent: true, status: 'unread' },
    ],
    bills: [
      {
        number: 1,
        title: 'Ferries (Timetables) Bill',
        body: 'assembly',
        moved: 'Ada Rook',
        summary: 'Makes the ferries keep to time.',
        stage: 'committee',
        divisions: [{ day: 1, reading: 'second', aye: 99, no: 40, abstain: 12 }],
        effects: [],
        document: 'bills-00001',
      },
    ],
    directions: [{ day: 1, from: 'court', text: 'Keep the register open to inspection.', document: 'court-00001', done: false }],
    factbooks: [],
    worldDays: [],
    lastWorldDay: 0,
  }
}

function standingFor(options: string[]): Standing {
  return {
    permitted: [...options],
    barred: [],
    ...(options[0] ? { vetoable: options[0] } : {}),
    standstill: false,
    explanation:
      'The Assembly carried Option 1 by 90 of 151, short of the 101 that would bind. The executive may take it, or set it aside with written reasons.',
  }
}

export interface Call {
  name: string
  args: unknown[]
}

export class FakeServer implements Api {
  readonly kept = new Map<string, Held>()
  readonly calls: Call[] = []
  // When true, every request fails as if the server were not running.
  down = false
  aiSettingsHeld: AiSettings = {
    backend: 'none',
    apiKeySet: false,
    models: { bulk: 'claude-haiku-5-5', standard: 'claude-sonnet-5-5', strategic: 'claude-opus-5-5' },
    minorsThroughBodies: false,
  }
  private ids = 0
  private ticks = 0
  private readonly seed: number
  private readonly sittingPolls: number
  private readonly minors: boolean

  constructor(options: FakeOptions = {}) {
    this.seed = options.seed ?? 7
    this.sittingPolls = options.sittingPolls ?? 0
    this.minors = options.minorsThroughBodies ?? false
  }

  // ---------------------------------------------------------------- for the tests

  // Puts a nation on the server in the given state, as if it had been played to there.
  hold(state: GameState, options: HoldOptions = {}): string {
    const id = options.id ?? 'kept'
    const save = newNationSave(state, id, '2030-01-01T00:00:00.000Z')
    const held: Held = {
      ...save,
      government: standInGovernment(
        state.identity,
        options.form ?? 'commonwealth',
        options.mode ?? 'govern',
        { name: 'Aegis', title: 'Founder' },
        options.minorsThroughBodies ?? this.minors,
      ),
      archive: [],
      polls: {},
    }
    this.write(held, 'law', 'The Constitution', 'The Founder', 'constitution', '# The Constitution\n\n## Article 0\n\nThe Founder stands above every branch.')
    this.kept.set(id, held)
    if (!options.noDockets) this.openDockets(held)
    return id
  }

  held(id = 'kept'): Held {
    const held = this.kept.get(id)
    if (!held) throw new Error(`no nation ${id} on the fake server`)
    return held
  }

  // Changes a docket to suit a test: a barred course, a binding vote, a failure.
  rig(dilemmaId: string, patch: Partial<Docket>, id = 'kept') {
    const held = this.held(id)
    const docket = held.government.dockets[dilemmaId]
    if (!docket) throw new Error(`no docket for ${dilemmaId}`)
    held.government.dockets[dilemmaId] = { ...docket, ...patch }
  }

  // Bars one course by a ruling of the Court, five to two.
  bar(dilemmaId: string, course: string, id = 'kept') {
    const docket = this.held(id).government.dockets[dilemmaId]!
    const standing = docket.standing!
    const permitted = standing.permitted.filter((c) => c !== course)
    this.rig(
      dilemmaId,
      {
        reviews: docket.reviews.map((review) => ({
          ...review,
          rulings: review.rulings.map((r) =>
            r.course === course
              ? {
                  ...r,
                  verdict: 'barred' as const,
                  articles: ['C1'],
                  votes: Object.fromEntries(JUSTICES.map((j, i) => [j.id, i < 5 ? 'bar' : 'permit'] as const)),
                }
              : r,
          ),
        })),
        standing: {
          ...standing,
          permitted,
          barred: [...standing.barred, course],
          ...(standing.vetoable === course ? { vetoable: undefined } : {}),
          explanation: `The Court barred that course, 5 to 2.`,
        },
      },
      id,
    )
  }

  private time(): string {
    return `2030-01-01T00:${String(Math.floor(this.ticks / 60) % 60).padStart(2, '0')}:${String(this.ticks++ % 60).padStart(2, '0')}.000Z`
  }

  private log(name: string, ...args: unknown[]) {
    this.calls.push({ name, args: json(args) })
    if (this.down) throw new Error(UNREACHABLE)
  }

  // ---------------------------------------------------------------- the record

  private write(
    held: Held,
    series: Series,
    title: string,
    issuer: string,
    kind: string,
    body: string,
    refs: string[] = [],
    data?: unknown,
  ): string {
    const seq = held.archive.filter((d) => d.series === series).length + 1
    const id = `${series}-${String(seq).padStart(5, '0')}`
    const day = held.state.day
    held.archive.push({ id, series, title, day, date: dateOf(day), issuer, kind, refs, body, ...(data === undefined ? {} : { data }) })
    return id
  }

  private openDockets(held: Held) {
    const gov = held.government
    // Yesterday's decided dockets are closed; anything still open stays.
    for (const [key, docket] of Object.entries(gov.dockets)) {
      if (docket.status === 'decided' && docket.day < held.state.day) delete gov.dockets[key]
    }
    const agenda = agendaItems(held.state, content)
    const dilemmas = [agenda.major, ...(gov.institutions.constitution.rules.minorsThroughBodies ? agenda.minors : [])]
    for (const dilemma of dilemmas) {
      if (!dilemma || gov.dockets[dilemma.id]) continue
      this.makeDocket(held, dilemma.id)
    }
  }

  private makeDocket(held: Held, dilemmaId: string) {
    const gov = held.government
    const dilemma = content.dilemmas.find((d) => d.id === dilemmaId)!
    const options = availableOptions(dilemma.options, held.state).map((o) => o.id)
    const number = ++gov.petitions
    const petition = this.write(held, 'petition', `Petition #${number}, ${dilemma.title}`, 'The Clerk', 'petition', `## The issue\n\n${dilemma.title}.`, [dilemmaId])
    const ministries = gov.institutions.bodies.filter((b) => b.kind === 'ministry').slice(0, 2)
    const advice = ministries.map((body) => ({
      body: body.id,
      ...(options[0] ? { favours: options[0] } : {}),
      summary: `${body.name} favours Option 1 on cost.`,
      costing: 'about 0.2bn a year',
      document: this.write(held, 'advice', `${body.name} on Petition #${number}`, body.name, 'advice', 'Option 1 is cheapest.', [petition]),
      ai: false,
    }))
    const hansard = this.write(
      held,
      'hansard',
      `Petition #${number}, ${dilemma.title}: first sitting`,
      'The Assembly',
      'sitting',
      '**Ada Rook:** Option 1, and quickly.\n\n**Bram Hale:** Never.',
      [petition, dilemmaId],
    )
    const court = this.write(held, 'court', `In re Petition #${number}`, 'The High Court', 'opinion', 'Every course is permitted.', [petition])
    const sitting = {
      body: 'assembly',
      kind: 'first' as const,
      ladder: [...options, DISMISS],
      firstPreference: options[0] ?? DISMISS,
      division: {
        aye: 90,
        no: 50,
        abstain: 11,
        byParty: {
          reds: { aye: 70, no: 0, abstain: 0 },
          blues: { aye: 20, no: 30, abstain: 0 },
          greens: { aye: 0, no: 20, abstain: 11 },
        },
      },
      carried: true,
      binding: false,
      document: hansard,
      ai: false,
    }
    const review = {
      body: 'court',
      kind: 'first' as const,
      rulings: options.map((course) => ({
        course,
        votes: Object.fromEntries(JUSTICES.map((j) => [j.id, 'permit'] as const)),
        verdict: 'permitted' as const,
        articles: [],
        markers: [],
      })),
      binding: true,
      cautions: [],
      directions: [],
      document: court,
      ai: false,
    }
    const sitting_ = this.sittingPolls > 0
    held.polls[dilemmaId] = this.sittingPolls
    gov.dockets[dilemmaId] = {
      dilemma: dilemmaId,
      day: held.state.day,
      number,
      status: sitting_ ? 'sitting' : 'ready',
      advice: sitting_ ? [] : advice,
      sittings: sitting_ ? [] : [sitting],
      reviews: sitting_ ? [] : [review],
      exchanges: [],
      assents: [],
      standing: sitting_ ? null : standingFor(options),
      progress: sitting_ ? ['The ministries are writing their advice.', 'The Assembly is in debate.'] : ['The ministries have reported.', 'The Assembly has divided.', 'The Court has ruled.'],
      document: petition,
    }
    // Kept aside for when the sitting ends.
    this.pending[`${held.id}:${dilemmaId}`] = { advice, sitting, review, standing: standingFor(options) }
    if (!sitting_) this.foundModeDecides(held, dilemmaId)
  }

  private pending: Record<string, { advice: Docket['advice']; sitting: Docket['sittings'][number]; review: Docket['reviews'][number]; standing: Standing }> = {}

  // In found mode the executive decides as soon as the bodies have finished.
  private foundModeDecides(held: Held, dilemmaId: string) {
    const docket = held.government.dockets[dilemmaId]
    if (held.government.mode !== 'found' || !docket || docket.status !== 'ready' || !docket.standing) return
    const s = docket.standing
    const course = s.mustTake ?? s.vetoable ?? s.permitted[0] ?? DISMISS
    this.enact(held, { dilemmaId, course }, 'executive', 'The executive took the course the Assembly carried.')
  }

  private enact(held: Held, request: DecideRequest, by: 'executive' | 'word', reasons: string) {
    const { dilemmaId, course } = request
    held.state =
      course === DISMISS
        ? dismiss(held.state, content, dilemmaId, reasons)
        : decide(held.state, content, dilemmaId, course, request.text)
    const docket = held.government.dockets[dilemmaId]
    if (request.word) {
      const number = held.government.words.length + 1
      held.government.words.push({
        number,
        day: held.state.day,
        text: request.word,
        overrules: dilemmaId,
        silence: false,
        confirmed: true,
        remonstrances: [],
        document: this.write(held, 'words', `The Founder’s Word No. ${number}`, 'The Founder', 'word', request.word, [dilemmaId]),
      })
    }
    if (docket) {
      const veto = request.veto && docket.standing?.vetoable ? { course: docket.standing.vetoable, reasons: request.veto } : undefined
      docket.status = 'decided'
      docket.decision = {
        course,
        by: request.word ? 'word' : by,
        reasons: request.veto ?? reasons,
        ...(veto ? { veto } : {}),
        ...(request.word ? { word: request.word } : {}),
        day: held.state.day,
      }
      this.write(held, 'papers', `Decision on Petition #${docket.number}`, 'The Executive', 'decision', reasons || 'Decided.', [docket.document])
    }
    held.updatedAt = this.time()
  }

  private census(held: Held): CensusFigure[] {
    const { indicators } = held.state
    const rating = (v: number) => (v >= 80 ? 'Superb' : v >= 60 ? 'Good' : v >= 40 ? 'Fair' : v >= 20 ? 'Poor' : 'Dire')
    return [
      { id: 'population', name: 'Population', value: 5_000_000, unit: 'people', description: 'People living in the country.' },
      { id: 'tax', name: 'Tax', value: 21, unit: '%', description: 'The average rate.' },
      ...INDICATORS.slice(0, 4).map((id) => ({
        id,
        name: INDICATOR_INFO[id].name,
        value: Math.round(indicators[id]),
        unit: '',
        rating: rating(indicators[id]),
        description: INDICATOR_INFO[id].description,
      })),
    ]
  }

  private payload(held: Held): NationPayload {
    return { id: held.id, createdAt: held.createdAt, updatedAt: held.updatedAt, state: serialize(held.state), history: held.history }
  }

  private changed(held: Held): Required<Changed> {
    return json({ nation: this.payload(held), government: held.government, census: this.census(held) })
  }

  private freshId(): string {
    let id = `nation-${++this.ids}`
    while (this.kept.has(id)) id = `nation-${++this.ids}`
    return id
  }

  private endOneDay(held: Held) {
    const before = held.state
    held.state = endDay(before, content)
    held.history = withDayEnd(held.history, held.state)
    held.government.worldDays.push(before.day)
    held.government.lastWorldDay = before.day
    this.write(held, 'almanac', `The almanac for day ${before.day}`, 'The Almanac', 'day', 'Rain in the west. Nobody minded.', [], {
      opinion: 'The country is watchful.',
      press: [{ outlet: 'The Chronicle', headline: 'A quiet day', text: 'Nothing much.' }],
      matters: [{ to: 'founder', text: 'The ferry is still late.' }],
    })
    this.openDockets(held)
    held.updatedAt = this.time()
  }

  // ---------------------------------------------------------------- the API

  async status(): Promise<ServerStatus> {
    this.log('status')
    const { backend, apiKeySet, models } = this.aiSettingsHeld
    const ai: ProviderStatus =
      backend === 'none'
        ? { backend, ok: true, detail: 'AI is off', models }
        : { backend, ok: backend !== 'anthropic' || apiKeySet, detail: backend === 'anthropic' ? 'Claude API key ending 4f2a' : 'claude 2.3.1, signed in', models }
    return json({ version: '0.6.0', pack: { id: content.pack.id, name: content.pack.name, version: content.pack.version }, ai })
  }

  async settings(): Promise<AiSettings> {
    this.log('settings')
    return json(this.aiSettingsHeld)
  }

  async saveSettings(change: AiSettingsChange): Promise<AiSettings> {
    this.log('saveSettings', change)
    const { apiKey, models, ...rest } = change
    this.aiSettingsHeld = {
      ...this.aiSettingsHeld,
      ...rest,
      ...(models ? { models: { ...this.aiSettingsHeld.models, ...models } } : {}),
      ...(apiKey ? { apiKeySet: true } : {}),
    }
    return json(this.aiSettingsHeld)
  }

  async testSettings(): Promise<ProviderStatus> {
    this.log('testSettings')
    return (await this.status()).ai
  }

  async nations(): Promise<Summary[]> {
    this.log('nations')
    const list = [...this.kept.values()].map((held) =>
      summarise({ id: held.id, createdAt: held.createdAt, updatedAt: held.updatedAt, state: held.state, history: held.history }, content),
    )
    return json(list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)))
  }

  async found(request: FoundRequest): Promise<{ id: string }> {
    this.log('found', request)
    const id = this.freshId()
    const state = newNation(content, request.identity, this.seed, request.answers)
    const now = this.time()
    const held: Held = {
      ...newNationSave(state, id, now),
      government: standInGovernment(request.identity, request.form, request.mode, request.founder, this.minors),
      archive: [],
      polls: {},
    }
    this.write(held, 'law', 'The Constitution', request.founder.name, 'constitution', '# The Constitution\n\nIt is founded.')
    this.kept.set(id, held)
    this.openDockets(held)
    return { id }
  }

  async importSave(text: string) {
    this.log('importSave', text.slice(0, 40))
    const opened = decode(text, content)
    if (!opened.ok) throw new Error(opened.problem)
    const id = this.kept.has(opened.nation.id) ? this.freshId() : opened.nation.id
    const state = opened.nation.state
    this.kept.set(id, {
      ...opened.nation,
      id,
      government: standInGovernment(state.identity, 'commonwealth', 'govern', { name: 'the Founder', title: 'Founder' }),
      archive: [],
      polls: {},
    })
    return { id, name: state.identity.name, ...(opened.notice ? { notice: opened.notice } : {}) }
  }

  async nation(id: string) {
    this.log('nation', id)
    const held = this.kept.get(id)
    if (!held) throw new Error('No nation with that id is kept on this server.')
    return this.changed(held)
  }

  async exportNation(id: string): Promise<string> {
    this.log('exportNation', id)
    const held = this.held(id)
    return JSON.stringify({ format: 2, ...this.payload(held), government: held.government, documents: held.archive })
  }

  async remove(id: string) {
    this.log('remove', id)
    this.kept.delete(id)
  }

  async decide(id: string, request: DecideRequest) {
    this.log('decide', id, request)
    const held = this.held(id)
    const docket = held.government.dockets[request.dilemmaId]
    if (docket && !request.word) {
      const s = docket.standing
      if (docket.status === 'decided') throw new Error('That petition has already been decided.')
      if (!s || docket.status !== 'ready') throw new Error('The bodies have not finished with this petition. Wait for them, or give a Word.')
      if (s.barred.includes(request.course)) throw new Error(`That course is barred. ${s.explanation}`)
      if (s.mustTake !== undefined && request.course !== s.mustTake) throw new Error(`The rules leave one course only. ${s.explanation}`)
      if (request.course === DISMISS ? !dismissOpen(s) : !s.permitted.includes(request.course))
        throw new Error(`That course is not open under the rules. ${s.explanation}`)
      if (s.vetoable !== undefined && request.course !== s.vetoable && !request.veto?.trim())
        throw new Error('Setting aside a carried recommendation needs written reasons.')
    }
    this.enact(held, request, 'executive', '')
    return { ...this.changed(held), entry: json(held.state.timeline.at(-1)!) }
  }

  async situation(id: string, optionId: string) {
    this.log('situation', id, optionId)
    const held = this.held(id)
    held.state = decideSituation(held.state, content, optionId)
    held.updatedAt = this.time()
    return { ...this.changed(held), entry: json(held.state.timeline.at(-1)!) }
  }

  async endDay(id: string) {
    this.log('endDay', id)
    const held = this.held(id)
    const before = held.state.timeline.length
    this.endOneDay(held)
    return { ...this.changed(held), entries: json(held.state.timeline.slice(before)) }
  }

  async run(id: string, days: number) {
    this.log('run', id, days)
    const held = this.held(id)
    const before = held.state.timeline.length
    for (let i = 0; i < Math.min(7, Math.max(1, days)); i++) {
      for (const docket of Object.values(held.government.dockets)) {
        if (docket.status === 'decided') continue
        if (!docket.standing) this.finishSitting(held, docket.dilemma)
        const s = held.government.dockets[docket.dilemma]!.standing!
        const course = s.mustTake ?? s.vetoable ?? s.permitted[0] ?? DISMISS
        this.enact(held, { dilemmaId: docket.dilemma, course }, 'executive', 'Taken as the rules allowed.')
      }
      this.endOneDay(held)
    }
    return { ...this.changed(held), entries: json(held.state.timeline.slice(before)) }
  }

  private finishSitting(held: Held, dilemmaId: string) {
    const docket = held.government.dockets[dilemmaId]!
    const kept = this.pending[`${held.id}:${dilemmaId}`]!
    held.government.dockets[dilemmaId] = {
      ...docket,
      status: 'ready',
      advice: kept.advice,
      sittings: [kept.sitting],
      reviews: [kept.review],
      standing: kept.standing,
      progress: [...docket.progress, 'The Court has ruled.'],
    }
  }

  async convene(id: string, dilemmaId: string) {
    this.log('convene', id, dilemmaId)
    const held = this.held(id)
    const docket = held.government.dockets[dilemmaId]
    if (!docket) {
      this.makeDocket(held, dilemmaId)
    } else {
      delete docket.error
      held.polls[dilemmaId] = this.sittingPolls
      if (this.sittingPolls > 0) docket.status = 'sitting'
      else this.finishSitting(held, dilemmaId)
    }
    return this.changed(held)
  }

  async dockets(id: string): Promise<Docket[]> {
    this.log('dockets', id)
    const held = this.held(id)
    for (const docket of Object.values(held.government.dockets)) {
      if (docket.status !== 'sitting') continue
      const left = (held.polls[docket.dilemma] ?? 1) - 1
      held.polls[docket.dilemma] = left
      if (left <= 0) {
        this.finishSitting(held, docket.dilemma)
        this.foundModeDecides(held, docket.dilemma)
      }
    }
    return json(Object.values(held.government.dockets).filter((d) => d.status !== 'decided'))
  }

  async sandbox(id: string, request: Parameters<Api['sandbox']>[1]) {
    this.log('sandbox', id, request)
    const held = this.held(id)
    if ('adjust' in request) held.state = adjust(held.state, content, request.adjust)
    else if ('callUp' in request) {
      held.state = callUp(held.state, content, request.callUp)
      this.openDockets(held)
    } else if ('crisis' in request) held.state = startCrisis(held.state, content, request.crisis)
    else for (let i = 0; i < request.skip; i++) this.endOneDay(held)
    held.updatedAt = this.time()
    return this.changed(held)
  }

  async identity(id: string, identity: Identity) {
    this.log('identity', id, identity)
    const held = this.held(id)
    held.state = { ...held.state, identity: json(identity) }
    held.updatedAt = this.time()
    return this.changed(held)
  }

  async mode(id: string, mode: Mode) {
    this.log('mode', id, mode)
    const held = this.held(id)
    held.government.mode = mode
    return this.changed(held)
  }

  async word(id: string, request: Parameters<Api['word']>[1]) {
    this.log('word', id, request)
    const held = this.held(id)
    const words = held.government.words
    if ('confirm' in request) {
      const word = words.find((w) => w.number === request.number)
      if (!word) throw new Error(`There is no Word No. ${request.number}.`)
      word.confirmed = true
    } else {
      if (!request.text.trim()) throw new Error('A Word needs words.')
      const number = words.length + 1
      words.push({
        number,
        day: held.state.day,
        text: request.text,
        ...(request.overrules ? { overrules: request.overrules } : {}),
        silence: request.silence === true,
        confirmed: false,
        remonstrances: [],
        document: this.write(held, 'words', `The Founder’s Word No. ${number}`, 'The Founder', 'word', request.text),
      })
    }
    return this.changed(held)
  }

  async question(id: string, questionId: string, answer: Parameters<Api['question']>[2]) {
    this.log('question', id, questionId, answer)
    const held = this.held(id)
    const question = held.government.questions.find((q) => q.id === questionId)
    if (!question) throw new Error(`There is no question ${questionId}.`)
    if ('answer' in answer) {
      if (!answer.answer.trim()) throw new Error('An answer needs words. Choose No answer to leave it unanswered.')
      question.status = 'answered'
      question.answer = answer.answer
    } else if ('noAnswer' in answer) question.status = 'no-answer'
    else question.status = 'later'
    return this.changed(held)
  }

  async letter(id: string, letterId: string, action: Parameters<Api['letter']>[2]) {
    this.log('letter', id, letterId, action)
    const held = this.held(id)
    const letter = held.government.letters.find((l) => l.id === letterId)
    if (!letter) throw new Error(`There is no letter ${letterId}.`)
    if ('reply' in action) {
      letter.reply = action.reply
      letter.status = 'replied'
    } else if ('adopt' in action) {
      if (!letter.draft) throw new Error('There is no draft to adopt.')
      letter.reply = letter.draft
      letter.status = 'replied'
    } else if ('noReply' in action) letter.status = 'no-reply'
    else letter.status = 'read'
    return this.changed(held)
  }

  async moveBill(id: string, bill: { title: string; summary: string }) {
    this.log('moveBill', id, bill)
    const held = this.held(id)
    const number = held.government.bills.length + 1
    held.government.bills.push({
      number,
      title: bill.title,
      body: 'assembly',
      moved: held.government.institutions.founder.name,
      summary: bill.summary,
      stage: 'introduced',
      divisions: [],
      effects: [],
      document: this.write(held, 'bills', bill.title, 'The Founder', 'bill', bill.summary),
    })
    return this.changed(held)
  }

  async archive(id: string, query: ArchiveQuery) {
    this.log('archive', id, query)
    const held = this.held(id)
    const q = query.q?.toLowerCase()
    const found = held.archive
      .filter((d) => !query.series || d.series === query.series)
      .filter((d) => !query.issuer || d.issuer === query.issuer)
      .filter((d) => query.from === undefined || d.day >= query.from)
      .filter((d) => query.to === undefined || d.day <= query.to)
      .filter((d) => !q || d.title.toLowerCase().includes(q) || d.body.toLowerCase().includes(q))
      .reverse()
    const offset = query.offset ?? 0
    const limit = query.limit ?? 25
    return json({
      documents: found.slice(offset, offset + limit).map(({ body: _b, data: _d, ...head }) => head),
      total: found.length,
    })
  }

  async document(id: string, docId: string) {
    this.log('document', id, docId)
    const held = this.held(id)
    const document = held.archive.find((d) => d.id === docId)
    if (!document) throw new Error(`There is no document ${docId} in the Archive.`)
    const citedBy = held.archive.filter((d) => d.refs.includes(docId)).map(({ body: _b, data: _d, ...head }) => head)
    return json({ document, citedBy })
  }

  async writeFactbook(id: string, factbook: Parameters<Api['writeFactbook']>[1]) {
    this.log('writeFactbook', id, factbook)
    const held = this.held(id)
    if (!factbook.title.trim()) throw new Error('A factbook entry needs a title.')
    held.government.factbooks.push({ id: `fb-${held.government.factbooks.length + 1}`, ...factbook, updatedDay: held.state.day, author: 'founder' })
    return this.changed(held)
  }

  async editFactbook(id: string, factbookId: string, factbook: Parameters<Api['writeFactbook']>[1]) {
    this.log('editFactbook', id, factbookId, factbook)
    const held = this.held(id)
    const at = held.government.factbooks.findIndex((f) => f.id === factbookId)
    if (at < 0) throw new Error('There is no such factbook entry.')
    held.government.factbooks[at] = { ...held.government.factbooks[at]!, ...factbook, updatedDay: held.state.day }
    return this.changed(held)
  }

  async draftFactbook(id: string, request: Parameters<Api['draftFactbook']>[1]) {
    this.log('draftFactbook', id, request)
    return { title: request.title || 'A short history', body: `## ${request.title || 'A short history'}\n\nIt began, as these things do, with a meeting.` }
  }
}

// A server holding one nation in the given state, as if it had been played to there.
export function holding(state: GameState, options: HoldOptions & FakeOptions = {}): FakeServer {
  const fake = new FakeServer(options)
  fake.hold(state, options)
  return fake
}
