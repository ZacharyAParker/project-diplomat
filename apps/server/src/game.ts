// What the player (or, in found mode, the AI executive) does to a nation, as the server does
// it. The engine sees decide, dismiss, decideSituation, applyExternal and endDay, as it would
// from a player; the government above it is folded in with the pipeline's own functions.
// Every action runs under the nation's lock and ends with the nation saved.

import { randomBytes } from 'node:crypto'
import {
  adjust,
  adviseMatter,
  applyExternal,
  decideMatter,
  forbidden,
  HOME,
  matterCard,
  nameOf,
  openMatters,
  worldAct,
  type WorldAction,
  type WorldChoices,
  availableOptions,
  callUp,
  decide,
  decideSituation,
  deserialize,
  dismiss,
  endDay,
  forecastSituation,
  agendaItems,
  INDICATOR_INFO,
  INDICATORS,
  newNation,
  render,
  serialize,
  startCrisis,
  type Adjustment,
  type Content,
  type GameState,
  type Identity,
  type IdentityField,
  type TimelineEntry,
} from '@diplomat/engine'
import {
  amend,
  bound,
  census,
  completeDocket,
  decisionFor,
  decisionSummary,
  DEFAULT_BOUNDS,
  DISMISS,
  fileDocket,
  fileEvening,
  FORM_IDS,
  founderDocuments,
  newGovernment,
  renewInstitutions,
  formatDate,
  petitionBrief,
  runEvening,
  runExecutive,
  slug,
  standing as standingOf,
  check,
  wordCost,
  brief,
  chooseWorld,
  warVote,
  type ArchiveDocument,
  type Course,
  type Docket,
  type Factbook,
  type FormId,
  type GovernmentState,
  type Mode,
  type Standing,
} from '@diplomat/government'
import type { Ai } from './ai.ts'
import { contextFor } from './context.ts'
import { OocLog, Sessions } from './ooc.ts'
import type { Dockets } from './dockets.ts'
import { HttpError } from './http.ts'
import { ID, readDocument, readSave, readState, snapshot, toSave, withDayEnd, type Nation, type Store, type TodayDecision } from './store.ts'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g

// One line of text the player wrote: no control characters, no runs of spaces.
function line(value: unknown, what: string, opts: { max: number; min?: number; optional?: boolean } = { max: 200 }): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (opts.optional) return undefined
    throw new HttpError(400, `${what} is missing.`)
  }
  if (typeof value !== 'string') throw new HttpError(400, `${what} must be text.`)
  const text = value.replace(CONTROL, '').replace(/\s+/g, ' ').trim()
  if (!text) {
    if (opts.optional) return undefined
    throw new HttpError(400, `${what} cannot be blank.`)
  }
  if ([...text].length < (opts.min ?? 1)) throw new HttpError(400, `${what} needs at least ${opts.min} characters.`)
  if ([...text].length > opts.max) throw new HttpError(400, `${what} may be no longer than ${opts.max} characters.`)
  return text
}

// Text with paragraphs: a Word, an answer, a letter, a factbook entry.
function prose(value: unknown, what: string, max = 20_000, optional = false): string | undefined {
  if (value === undefined || value === null || (optional && value === '')) {
    if (optional) return undefined
    throw new HttpError(400, `${what} is missing.`)
  }
  if (typeof value !== 'string') throw new HttpError(400, `${what} must be text.`)
  const text = value.replace(/\r\n/g, '\n').replace(CONTROL, '').trim()
  if (!text) {
    if (optional) return undefined
    throw new HttpError(400, `${what} cannot be blank.`)
  }
  if (text.length > max) throw new HttpError(400, `${what} may be no longer than ${max.toLocaleString('en-GB')} characters.`)
  return text
}

const body = (value: unknown): Record<string, unknown> => {
  if (!isObject(value)) throw new HttpError(400, 'Send a JSON object.')
  return value
}

// The engine throws plain errors for things a player can fix: a course that is not open, a
// name left blank. They become 400s with the engine's own words.
function engine<T>(fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (error instanceof HttpError) throw error
    const m = (error as Error).message
    throw new HttpError(400, `${m.charAt(0).toUpperCase()}${m.slice(1)}${/[.!?]$/.test(m) ? '' : '.'}`)
  }
}

const IDENTITY_MAX: Record<string, number> = { name: 40, capital: 40, currency: 30, demonym: 30, leaderTitle: 40, animal: 40, motto: 100, faith: 60 }
const IDENTITY_NAMES: Record<string, string> = { name: 'The name', capital: 'The capital', currency: 'The currency', demonym: 'The demonym', leaderTitle: 'The leader’s title', animal: 'The animal', motto: 'The motto', faith: 'The faith' }

export function readIdentity(value: unknown): Identity {
  const v = body(value)
  const out: Record<string, unknown> = {}
  for (const f of ['name', 'capital', 'currency', 'demonym', 'leaderTitle']) out[f] = line(v[f], IDENTITY_NAMES[f]!, { max: IDENTITY_MAX[f]!, min: 2 })
  for (const f of ['animal', 'motto', 'faith']) {
    const t = line(v[f], IDENTITY_NAMES[f]!, { max: IDENTITY_MAX[f]!, optional: true })
    if (t) out[f] = t
  }
  const flag = v['flag']
  if (!isObject(flag) || typeof flag['layout'] !== 'string' || !/^[a-z0-9-]{1,30}$/.test(flag['layout'])) throw new HttpError(400, 'The flag needs a layout.')
  const colours = flag['colours']
  if (!Array.isArray(colours) || colours.length > 8 || !colours.every((c) => typeof c === 'string' && /^[#a-zA-Z0-9(),. %-]{1,40}$/.test(c))) {
    throw new HttpError(400, 'The flag’s colours must be a list of up to eight colours.')
  }
  out['flag'] = { layout: flag['layout'], colours: [...colours] }
  return out as unknown as Identity
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The calendar start that puts `day` on today's date.
function startFor(day: number): string {
  const d = new Date()
  const start = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - (day - 1)))
  return start.toISOString().slice(0, 10)
}

const seed = () => randomBytes(4).readUInt32LE(0)

// A name for a course that asks for one, when the AI executive takes it: a quoted name in
// its reasons if it gave one, else something sensible for the field.
function nameFor(field: IdentityField, reasons: string, state: GameState): string {
  const quoted = reasons.match(/[“"‘']([^“”"'‘’\n]{2,40})[”"’']/)
  if (quoted?.[1]) return quoted[1].trim()
  const id = state.identity
  const defaults: Record<IdentityField, string> = {
    capital: `New ${id.capital}`.slice(0, 40),
    currency: `${id.demonym} crown`.slice(0, 30),
    demonym: id.demonym,
    leaderTitle: 'First Minister',
    animal: 'Heron',
    motto: 'Steady in all weathers',
    faith: 'The Common Faith',
  }
  return defaults[field] ?? 'The New Way'
}

export interface Payload {
  nation: { id: string; createdAt: string; updatedAt: string; state: string; history: Nation['history'] }
  government: GovernmentState
  census: ReturnType<typeof census>
}

const EXPORT_KIND = 'diplomat-nation'

export class Game {
  readonly store: Store
  readonly ai: Ai
  readonly dockets: Dockets
  readonly content: Content

  constructor(store: Store, ai: Ai, dockets: Dockets, content: Content) {
    this.store = store
    this.ai = ai
    this.dockets = dockets
    this.content = content
  }

  payload(n: Nation): Payload {
    return {
      nation: { id: n.id, createdAt: n.createdAt, updatedAt: n.updatedAt, state: serialize(n.state), history: n.history },
      government: n.gov,
      census: census(n.state, n.gov.censusBase, this.content),
    }
  }

  view(id: string) {
    return this.payload(this.store.open(id))
  }

  act<T>(id: string, fn: (n: Nation) => Promise<T>): Promise<T> {
    if (!ID.test(id)) throw new HttpError(400, 'A nation id is lower-case letters, digits and hyphens.')
    // An action that fails leaves the nation as it was: what it had changed in memory is
    // put back (documents it wrote stay, as the Archive never takes anything out).
    return this.store.lock(id, async () => {
      const n = this.store.open(id)
      const was = { state: n.state, gov: n.gov, history: n.history, today: n.today }
      try {
        return await fn(n)
      } catch (error) {
        Object.assign(n, was)
        throw error
      }
    })
  }

  async write(n: Nation, doc: Omit<ArchiveDocument, 'id' | 'date'>): Promise<string> {
    return contextFor(n, this.content, this.ai).write(doc)
  }

  founderName(n: Nation) {
    const f = n.gov.institutions.founder
    return `${f.name}, ${/^the /i.test(f.title) ? f.title.replace(/^The /, 'the ') : `the ${f.title}`}`
  }

  // ---------------------------------------------------------------------------------------
  // Nations
  // ---------------------------------------------------------------------------------------

  async found(input: unknown) {
    const v = body(input)
    const identity = readIdentity(v['identity'])
    const answers = v['answers'] ?? {}
    if (!isObject(answers) || !Object.values(answers).every((a) => typeof a === 'string')) throw new HttpError(400, 'The founding answers must be an object of question id to answer id.')
    const form = v['form'] as FormId
    if (!FORM_IDS.includes(form) || form === 'custom') throw new HttpError(400, `The form of government must be one of ${FORM_IDS.filter((f) => f !== 'custom').join(', ')}.`)
    const mode = (v['mode'] ?? 'govern') as Mode
    if (mode !== 'govern' && mode !== 'found') throw new HttpError(400, 'The mode must be govern or found.')
    const f = isObject(v['founder']) ? v['founder'] : {}
    const founder = { name: line(f['name'], 'The Founder’s name', { max: 60, min: 2 })!, title: line(f['title'], 'The Founder’s title', { max: 40, optional: true }) ?? 'Founder' }
    const s = seed()
    const state = engine(() => newNation(this.content, identity, s, answers as Record<string, string>))
    if (form === 'absolute-monarchy' || form === 'junta') state.term = 0
    const gov = engine(() => newGovernment(form, mode, state, this.content, { founder, calendarStart: todayIso(), seed: s, answers: answers as Record<string, string> }))
    const id = this.store.freshId(identity.name)
    const now = new Date().toISOString()
    // Made whole under the nation's lock, documents and first dockets included, before
    // anything can see it.
    return this.store.lock(id, async () => {
      let opened: string[] = []
      const n = await this.store.create({ id, createdAt: now, updatedAt: now, state, history: [snapshot(state, 0)], gov, today: { day: state.day, decisions: [] } }, [], async (made) => {
        for (const doc of founderDocuments(made.gov, made.state)) await made.archive.write(doc)
        opened = this.dockets.openFor(made)
      })
      this.dockets.start(id, opened)
      return { id, ...this.payload(n) }
    })
  }

  async importText(input: unknown) {
    const v = body(input)
    if (typeof v['text'] !== 'string' || !v['text']) throw new HttpError(400, 'Send the file’s text as { text }.')
    let file: unknown
    try {
      file = JSON.parse(v['text'])
    } catch {
      throw new HttpError(400, 'This is not a save file. It is not valid JSON.')
    }
    if (!isObject(file)) throw new HttpError(400, 'This is not a save file.')
    const now = new Date().toISOString()
    if (file['format'] === 1) return this.import05(file, now)
    const save = isObject(file['save']) ? file['save'] : file['format'] === 2 ? file : null
    if (!save) throw new HttpError(400, 'This is not a save file from this game. It has no format number.')
    let parts: ReturnType<typeof readSave>
    let documents: ArchiveDocument[]
    try {
      parts = readSave(save, this.content)
      const raw = Array.isArray(file['documents']) ? file['documents'] : []
      documents = raw.map((d, i) => readDocument(d, i))
    } catch (error) {
      throw new HttpError(422, (error as Error).message)
    }
    const seen = new Set<string>()
    for (const d of documents) {
      if (seen.has(d.id)) throw new HttpError(422, `The document ${d.id} is in the file twice.`)
      seen.add(d.id)
    }
    const id = ID.test(parts.id) && !this.store.exists(parts.id) ? parts.id : this.store.freshId(parts.state.identity.name)
    const notice = id === parts.id ? undefined : `A nation “${parts.id}” was already here, so this one was stored as “${id}”.`
    return this.store.lock(id, async () => {
      let send: string[] = []
      const n = await this.store.create({ ...parts, id }, documents, async (made) => {
        const left = Object.values(made.gov.dockets).filter((d) => ['waiting', 'sitting', 'reconciling', 'exchanging'].includes(d.status) && d.day === made.state.day)
        send = [...left.map((d) => d.dilemma), ...this.dockets.openFor(made)]
      })
      this.dockets.start(id, send)
      // A found-mode nation's executive takes up what its bodies had already finished.
      this.dockets.decideReady(id, n)
      return { id, name: n.state.identity.name, ...(notice ? { notice } : {}), ...this.payload(n) }
    })
  }

  private async import05(file: Record<string, unknown>, now: string) {
    if (typeof file['state'] !== 'string') throw new HttpError(422, 'This save file is damaged. Its state is missing.')
    let state: GameState
    try {
      state = readState(file['state'], this.content)
    } catch (error) {
      throw new HttpError(422, (error as Error).message)
    }
    const history = Array.isArray(file['history']) ? (file['history'] as Nation['history']) : []
    const gov = newGovernment('commonwealth', 'govern', state, this.content, {
      founder: { name: 'The Founder', title: 'Founder' },
      calendarStart: startFor(state.day),
      seed: state.seed,
      origin: 'save-0.5',
    })
    const wanted = typeof file['id'] === 'string' ? file['id'] : ''
    const id = ID.test(wanted) && !this.store.exists(wanted) ? wanted : this.store.freshId(state.identity.name)
    return this.store.lock(id, async () => {
      let opened: string[] = []
      const n = await this.store.create(
        { id, createdAt: typeof file['createdAt'] === 'string' ? file['createdAt'] : now, updatedAt: now, state, history, gov, today: { day: state.day, decisions: [] } },
        [],
        async (made) => {
          for (const doc of founderDocuments(made.gov, made.state)) await made.archive.write(doc)
          opened = this.dockets.openFor(made)
        },
      )
      this.dockets.start(id, opened)
      return {
        id,
        name: state.identity.name,
        notice: `${state.identity.name} came from version 0.5 and has been given a commonwealth government, with you holding the executive. Its record starts today.`,
        ...this.payload(n),
      }
    })
  }

  exportText(id: string): { text: string; filename: string } {
    const n = this.store.open(id)
    // The save's own fields, flat, with every document beside them: what the web app's fake
    // server exports, and what import reads back.
    const file = { ...toSave(n), kind: EXPORT_KIND, exportedAt: new Date().toISOString(), documents: n.archive.all() }
    return { text: JSON.stringify(file), filename: `${slug(n.state.identity.name) || 'nation'}-day-${n.state.day}.json` }
  }

  async remove(id: string) {
    this.store.dirOf(id)
    // Whatever is sitting is set aside and waited for (briefly: a model mid-call is not), so
    // no background work writes into the folder as it goes.
    this.dockets.cancel(id)
    await Promise.race([this.dockets.idle(id), new Promise((ok) => setTimeout(ok, 10_000).unref())])
    await this.store.lock(id, async () => {
      await this.store.remove(id)
    })
    this.dockets.cancel(id)
    return { ok: true }
  }

  // ---------------------------------------------------------------------------------------
  // The desk
  // ---------------------------------------------------------------------------------------

  onAgenda(n: Nation, dilemmaId: string) {
    const a = n.state.agenda
    return a.major === dilemmaId || a.minors.includes(dilemmaId)
  }

  courses(n: Nation, dilemmaId: string, number: number): Course[] {
    return petitionBrief(n.state, this.content, dilemmaId, number).options.map((o) => o.course)
  }

  standingOf(n: Nation, docket: Docket): Standing {
    return docket.standing ?? standingOf(docket, n.gov.institutions, this.courses(n, docket.dilemma, docket.number))
  }

  // The Word the Founder has confirmed overruling this petition, if any.
  // A confirmed Word given for this petition today, not yet spent on a decision. A Word from
  // an earlier day does not carry over to the same issue coming round again.
  private wordFor(n: Nation, dilemmaId: string) {
    const spent = (text: string, day: number) => Object.values(n.gov.dockets).some((d) => d.decision?.word === text && d.decision.day === day)
    return [...n.gov.words].reverse().find((w) => w.overrules === dilemmaId && w.confirmed && w.day === n.state.day && !spent(w.text, w.day))
  }

  pushToday(n: Nation, summary: TodayDecision) {
    n.today = n.today.day === n.state.day ? { day: n.today.day, decisions: [...n.today.decisions, summary] } : { day: n.state.day, decisions: [summary] }
  }

  // Enacts a course for a docketed petition: the engine, any Word's cost, the petition
  // document, the docket filed. n.state and n.gov are the morning's until this returns.
  async enact(
    n: Nation,
    docket: Docket,
    standing: Standing,
    course: Course,
    opts: { text?: string; reasons: string; veto?: string; word?: string },
    problems: string[] = [],
  ): Promise<TimelineEntry[]> {
    const pre = n.state
    const dilemma = this.content.dilemmas.find((d) => d.id === docket.dilemma)!
    let next = engine(() => (course === DISMISS ? dismiss(pre, this.content, docket.dilemma, opts.reasons) : decide(pre, this.content, docket.dilemma, course, opts.text)))
    const entry = next.timeline.at(-1)!
    const entries = [entry]
    if (opts.word) {
      const effects = bound(wordCost(standing, course), DEFAULT_BOUNDS).effects
      if (effects.length) {
        next = applyExternal(next, this.content, 'word', `The Founder’s Word on ${render(dilemma.title, pre, this.content, pre.agenda.bound[dilemma.id])}`, effects, opts.word)
        entries.push(next.timeline.at(-1)!)
      }
    }
    const vetoable = standing.vetoable
    const decision = decisionFor(standing, { gov: n.gov, state: pre }, course, {
      reasons: opts.reasons,
      ...(opts.veto && vetoable && course !== vetoable ? { veto: { course: vetoable, reasons: opts.veto } } : {}),
      ...(opts.word ? { word: opts.word } : {}),
    })
    // The petition document is written from the morning's state, so its context is made
    // before the decision is enacted.
    const ctx = contextFor(n, this.content, this.ai)
    // The decision is saved first, and only then written into the record: a crash between
    // the two leaves a decided petition missing its document, never a document for a
    // petition that was not decided.
    const decided: Docket = { ...docket, standing, status: 'decided', decision }
    const summary = decisionSummary(decided, entry, { state: pre, content: this.content })
    n.gov = fileDocket(n.gov, decided)
    n.state = next
    this.pushToday(n, summary)
    await this.store.save(n)
    try {
      const done = await completeDocket(ctx, { ...docket, standing }, decision, entry)
      n.gov = fileDocket(n.gov, done)
      await this.store.save(n)
    } catch (error) {
      const line = `Petition #${docket.number} was decided, but its record could not be written: ${(error as Error).message}`
      problems.push(line)
      await OocLog.of(n.dir)
        .append({ day: pre.day, action: 'record-failure', detail: line, request: '' })
        .catch(() => undefined)
    }
    return entries
  }

  // The docket a decision is filed on: the one the bodies sat on, or for a petition that
  // goes to the executive alone, a new one with nothing sat.
  docketFor(n: Nation, dilemmaId: string): { docket: Docket; fresh: boolean } {
    const existing = n.gov.dockets[dilemmaId]
    if (existing) return { docket: existing, fresh: false }
    return { docket: this.dockets.open(n, dilemmaId), fresh: true }
  }

  async decide(id: string, input: unknown) {
    const v = body(input)
    const dilemmaId = line(v['dilemmaId'], 'The petition (dilemmaId)', { max: 100 })!
    const course = line(v['course'], 'The course', { max: 100 })!
    const text = line(v['text'], 'The name', { max: 100, optional: true })
    const veto = prose(v['veto'], 'The reasons for the veto', 5000, true)
    const reasons = prose(v['reasons'], 'The reasons', 5000, true)
    const wordText = prose(v['word'], 'The Word', 20_000, true)
    return this.act(id, async (n) => {
      if (!this.onAgenda(n, dilemmaId)) throw new HttpError(409, `${dilemmaId} is not on today’s desk.`)
      const dilemma = this.content.dilemmas.find((d) => d.id === dilemmaId)!
      if (course !== DISMISS && !availableOptions(dilemma.options, n.state).some((o) => o.id === course)) {
        throw new HttpError(400, `“${course}” is not one of the courses open on this petition.`)
      }
      const { docket, fresh } = this.docketFor(n, dilemmaId)
      const word = wordText ?? this.wordFor(n, dilemmaId)?.text
      if (docket.status === 'decided') throw new HttpError(409, `Petition #${docket.number} has already been decided.`)
      if (n.gov.mode === 'found' && !word) {
        throw new HttpError(409, `In found mode the AI executive holds the office of ${n.gov.institutions.constitution.rules.executive.title.replace(/^The /, 'the ')} and decides each petition itself. Give a Founder’s Word to decide this one, or switch the nation to govern mode.`)
      }
      if (!word) {
        // Every petition has a docket, minors included: the rules decide which bodies sit
        // on it. A standing is only ever read from a docket the bodies have finished.
        if (fresh) throw new HttpError(409, 'The bodies have not been convened on this petition. Convene them first, or decide it by a Founder’s Word.')
        if (docket.status === 'failed') throw new HttpError(409, `The bodies could not finish Petition #${docket.number} (${docket.error ?? 'no reason given'}). Convene them again, or decide it by a Founder’s Word.`)
        if (!fresh && docket.status !== 'ready') throw new HttpError(409, `The bodies are still sitting on Petition #${docket.number}. Wait for them to finish, or decide it by a Founder’s Word.`)
      }
      const standing = this.standingOf(n, docket)
      if (!word) {
        const ok = check(standing, course, { ...(veto ? { veto } : {}) })
        if (!ok.ok) throw new HttpError(409, ok.reason)
      }
      const option = dilemma.options.find((o) => o.id === course)
      if (option?.custom && !text) throw new HttpError(400, `This course asks for a name: ${option.custom.label}. Send it as text.`)
      if (wordText) await this.enterWord(n, { text: wordText, overrules: dilemmaId, silence: false, confirmed: true })
      const exec = n.gov.institutions.constitution.rules.executive.title
      const said = reasons ?? veto ?? (word ? 'By the Founder’s Word.' : `Taken by ${exec.replace(/^The /, 'the ')}${course === DISMISS ? ', who let the matter rest' : ''}.`)
      if (fresh) n.gov = fileDocket(n.gov, docket)
      const problems: string[] = []
      const entries = await this.enact(n, n.gov.dockets[dilemmaId]!, standing, course, { ...(text ? { text } : {}), reasons: said, ...(veto ? { veto } : {}), ...(word ? { word } : {}) }, problems)
      await this.store.save(n)
      return { entry: entries[0], entries, ...(problems.length ? { problems } : {}), ...this.payload(n) }
    })
  }

  async situation(id: string, input: unknown) {
    const v = body(input)
    const optionId = line(v['optionId'], 'The option (optionId)', { max: 100 })!
    return this.act(id, async (n) => {
      const items = agendaItems(n.state, this.content)
      if (!items.situation) throw new HttpError(409, 'No crisis is waiting on a decision today.')
      const pre = n.state
      const next = engine(() => decideSituation(pre, this.content, optionId))
      const entry = next.timeline.at(-1)!
      const option = items.situation.stage.options.find((o) => o.id === optionId)
      n.state = next
      this.pushToday(n, {
        title: `${items.situation.situation.title}: ${items.situation.stage.title}`,
        course: option ? render(option.speech, pre, this.content) : optionId,
        result: entry.text ?? entry.headline,
        changes: entry.changes.map((c) => `${c.target} ${c.by > 0 ? 'up' : 'down'} ${Math.abs(c.by)}: ${c.why}`),
      })
      await this.store.save(n)
      return { entry, entries: [entry], ...this.payload(n) }
    })
  }

  // The evening and the night: the world's day, its effects, bills that became law, then
  // the engine's endDay; then the new morning's dockets are opened and sent to the bodies.
  private async nightfall(n: Nation): Promise<{ entries: TimelineEntry[]; problems: string[] }> {
    this.dockets.cancel(n.id)
    const problems: string[] = []
    let state = n.state
    let gov = n.gov
    const from = state.timeline.length
    // worldDays, not lastWorldDay: the Claudetopia import sets lastWorldDay to a day whose
    // almanac was never written.
    if (!gov.worldDays.includes(state.day)) {
      const ctx = contextFor(n, this.content, this.ai, { onProblem: (l) => problems.push(l) })
      const decisions = n.today.day === state.day ? n.today.decisions : []
      const evening = await runEvening(ctx, decisions)
      const before = gov.bills
      gov = fileEvening(gov, evening)
      if (evening.effects.length) {
        state = applyExternal(state, this.content, 'event', evening.world.events[0]?.headline ?? 'The day’s events', evening.effects, evening.world.reaction || undefined)
      }
      for (const bill of evening.bills) {
        if (bill.stage !== 'law' || before.find((b) => b.number === bill.number)?.stage === 'law') continue
        if (bill.effects.length) state = applyExternal(state, this.content, 'law', `${bill.title} becomes law`, bill.effects, bill.summary)
        if (bill.amendment) {
          gov = { ...gov, institutions: amend(gov.institutions, bill.amendment, state.day) }
          // A new constitution: every branch starts a fresh session and reads it afresh.
          await Sessions.of(n.dir).reset()
          await this.write({ ...n, gov }, {
            series: 'law',
            title: `${bill.title}: the constitution amended`,
            day: state.day,
            issuer: gov.institutions.constitution.stateName,
            kind: 'amendment',
            refs: [bill.document],
            body: `${bill.summary}\n\nThe constitution now reads as the ${gov.institutions.constitution.formName} of ${state.identity.name}.`,
            data: { amendment: bill.amendment },
          })
        }
      }
    }
    // The world week: the other nations choose their moves (the AI where it is on, among legal
    // moves only), then the engine plays them, fights the wars and sits the Assembly.
    let world: WorldChoices | undefined
    const weekDay = state.day
    if (state.world && weekDay % 7 === 0) {
      try {
        const ctx = contextFor({ ...n, state, gov }, this.content, this.ai, { onProblem: (l) => problems.push(l) })
        const b = brief(state, gov, this.content, await ctx.record({ series: 'world', limit: 4 }), ctx.archivePath)
        world = (await chooseWorld(state, this.content, b, ctx.run)).choices
      } catch (error) {
        problems.push(`The other nations could not be asked this week (${(error as Error).message}); each took its likeliest course.`)
      }
    }
    const night = state.timeline.length
    state = endDay(state, this.content, world ? { world } : {})
    if (state.world && weekDay % 7 === 0) {
      try {
        await this.writeWorldWeek({ ...n, state, gov }, weekDay, world)
      } catch (error) {
        problems.push(`The week abroad could not be written into the record: ${(error as Error).message}`)
      }
    }
    n.history = withDayEnd(n.history, state)
    // The engine may have replaced ministers or held an election overnight: the government's
    // own account of itself follows, and the record says so.
    const renewal = renewInstitutions(gov.institutions, state, state.timeline.slice(night))
    if (renewal.changes.length) {
      gov = { ...gov, institutions: renewal.institutions }
      try {
        await this.write({ ...n, state, gov }, {
          series: 'papers',
          title: `The government renewed: ${formatDate(gov.institutions.calendar.start, state.day)}`,
          day: state.day,
          issuer: gov.institutions.constitution.stateName,
          kind: 'renewal',
          refs: [],
          body: ['# The government renewed', '', ...renewal.changes.map((c) => `- ${c}`)].join(String.fromCharCode(10)),
          data: { changes: renewal.changes },
        })
      } catch (error) {
        problems.push(`The renewal of the government could not be written into the record: ${(error as Error).message}`)
      }
    }
    // Yesterday's dockets are done with: decided ones are in the record, and any left
    // undecided lapse with the day.
    gov = { ...gov, dockets: {} }
    n.state = state
    n.gov = gov
    n.today = { day: state.day, decisions: [] }
    return { entries: state.timeline.slice(from), problems }
  }

  // The week abroad in the Archive: what every nation did, what the important ones said, and
  // the Assembly's sitting if it sat.
  private async writeWorldWeek(n: Nation, day: number, choices: WorldChoices | undefined) {
    const w = n.state.world!
    const name = (id: string) => nameOf(n.state, this.content, id)
    const date = formatDate(n.gov.institutions.calendar.start, day)
    const lines = w.log.filter((l) => l.day === day).map((l) => `- ${l.text}`)
    const notes = w.important
      .filter((id) => choices?.notes[id])
      .map((id) => `**${name(id)}** (${this.content.neighbours.find((x) => x.id === id)?.leader ?? ''}): ${choices!.notes[id]}`)
    const body = [`# Abroad: the week to ${date}`, '', ...(lines.length ? lines : ['A quiet week beyond the borders.']), ...(notes.length ? ['', '## In their own words', '', ...notes.flatMap((x) => [x, ''])] : [])]
    await this.write(n, { series: 'world', title: `Abroad: the week to ${date}`, day, issuer: 'The Foreign Ministry', kind: 'week', refs: [], body: body.join('\n').trim(), data: { log: w.log.filter((l) => l.day === day), notes: choices?.notes ?? {} } })
    const sat = w.assembly.past.find((m) => m.day === day && m.votes)
    if (sat) {
      const votes = Object.entries(sat.votes!).map(([id, v]) => `| ${id === HOME ? n.state.identity.name : name(id)} | ${v} |`)
      const ayes = Object.values(sat.votes!).filter((v) => v === 'aye').length
      const noes = Object.values(sat.votes!).filter((v) => v === 'no').length
      const title = sat.title.charAt(0).toUpperCase() + sat.title.slice(1)
      await this.write(n, {
        series: 'world',
        title: `The Assembly of Nations: ${title}`,
        day,
        issuer: 'The Assembly of Nations',
        kind: 'sitting',
        refs: [],
        body: [`# ${title}`, '', `The motion was ${sat.passed ? 'carried' : 'defeated'}, ${ayes} to ${noes}.`, '', '| Member | Vote |', '|---|---|', ...votes].join('\n'),
        data: { motion: sat },
      })
    }
  }

  // A foreign matter decided by the executive: one card, no bodies. In found mode the AI
  // executive takes the Foreign Ministry's advice; the Founder may decide any matter.
  async decideMatter(id: string, input: unknown) {
    const v = body(input)
    const matterId = line(v['matter'], 'The matter', { max: 100 })!
    const optionId = line(v['option'], 'The option', { max: 100 })!
    return this.act(id, async (n) => {
      const matter = openMatters(n.state).find((m) => m.id === matterId)
      if (!matter) throw new HttpError(409, `${matterId} is not a foreign matter waiting for a decision.`)
      const card = matterCard(n.state, this.content, matter)
      if (!card.options.some((o) => o.id === optionId)) throw new HttpError(400, `“${optionId}” is not one of the options on this matter.`)
      n.state = decideMatter(n.state, this.content, matterId, optionId)
      const entry = n.state.timeline.at(-1)!
      this.pushToday(n, { title: card.title, course: card.options.find((o) => o.id === optionId)!.label, result: entry.text ?? entry.headline, changes: entry.changes.map((c) => `${c.target} ${c.by > 0 ? 'up' : 'down'} ${Math.abs(c.by)}: ${c.why}`) })
      await this.store.save(n)
      return { entry, entries: [entry], ...this.payload(n) }
    })
  }

  // The player acting abroad. A declaration of war goes to the legislature first when the
  // constitution lets it bind the executive; the division goes into Hansard either way.
  async worldAction(id: string, input: unknown) {
    const v = body(input)
    const action = parseAction(v['action'])
    return this.act(id, async (n) => {
      if (!n.state.world) throw new HttpError(409, 'This pack has no world beyond the borders.')
      const why = forbidden(n.state, this.content, action)
      if (why) throw new HttpError(409, why)
      let vote: { carried: boolean; aye: number; no: number; abstain: number; body: string } | undefined
      if ('war' in action) {
        const result = warVote(n.gov.institutions, n.state, action.war)
        if (result) {
          const target = nameOf(n.state, this.content, action.war)
          const parties = result.body.parties.map((p) => `| ${p.name} | ${result.division.byParty[p.id]?.aye ?? 0} | ${result.division.byParty[p.id]?.no ?? 0} | ${result.division.byParty[p.id]?.abstain ?? 0} |`)
          const executive = n.gov.institutions.constitution.rules.executive.title.replace(/^The /, 'the ')
          await this.write(n, {
            series: 'hansard',
            title: `${result.body.name}: a declaration of war against ${target}`,
            day: n.state.day,
            issuer: result.body.name,
            kind: 'division',
            refs: [],
            body: [
              `# A motion for a declaration of war against ${target}`,
              '',
              `${executive.charAt(0).toUpperCase() + executive.slice(1)} asked ${result.body.shortName} to declare war on ${target}. ${result.provoked ? 'Members were told the country had been provoked.' : 'Members were told the country had no choice; several asked what had changed.'}`,
              '',
              `**${result.carried ? 'Carried' : 'Defeated'}**, ${result.division.aye} to ${result.division.no}, with ${result.division.abstain} abstaining.`,
              ...(parties.length ? ['', '| Party | Aye | No | Abstain |', '|---|---|---|---|', ...parties] : []),
            ].join('\n'),
            data: { division: result.division, carried: result.carried, target: action.war },
          })
          vote = { carried: result.carried, aye: result.division.aye, no: result.division.no, abstain: result.division.abstain, body: result.body.name }
          if (!result.carried) {
            n.state = applyExternal(n.state, this.content, 'event', `${result.body.name} refuses to declare war on ${target}`, [{ indicator: 'legitimacy', by: -2, why: 'The government asked for a war and was refused.' }], `Defeated ${result.division.aye} to ${result.division.no}.`)
            await this.store.save(n)
            return { entry: n.state.timeline.at(-1)!, vote, ...this.payload(n) }
          }
        }
      }
      n.state = worldAct(n.state, this.content, action)
      const entry = n.state.timeline.at(-1)!
      await this.store.save(n)
      return { entry, ...(vote ? { vote } : {}), ...this.payload(n) }
    })
  }

  // Found mode: the AI executive takes the Foreign Ministry's advice on every open matter.
  private decideMattersByAdvice(n: Nation): TimelineEntry[] {
    const out: TimelineEntry[] = []
    for (const matter of openMatters(n.state)) {
      const advice = adviseMatter(n.state, this.content, matter)
      if (!advice) continue
      n.state = decideMatter(n.state, this.content, matter.id, advice.option)
      out.push(n.state.timeline.at(-1)!)
    }
    return out
  }

  async endDay(id: string) {
    return this.act(id, async (n) => {
      const { entries, problems } = await this.nightfall(n)
      const opened = this.dockets.openFor(n)
      await this.store.save(n)
      this.dockets.start(id, opened)
      return { entries, ...(problems.length ? { problems } : {}), ...this.payload(n) }
    })
  }

  // Found mode: the AI executive decides every petition on the desk, the crisis if there is
  // one, and the day is ended; up to seven days.
  // force: the Director runs the nation whatever the mode.
  async run(id: string, input: unknown, opts: { force?: boolean } = {}) {
    const v = body(input)
    const days = v['days'] === undefined ? 1 : v['days']
    if (!Number.isSafeInteger(days) || (days as number) < 1 || (days as number) > 7) throw new HttpError(400, 'days must be a whole number from 1 to 7.')
    const first = this.store.open(id)
    if (first.gov.mode !== 'found' && !opts.force) throw new HttpError(409, 'Run the nation is for found mode, where the AI holds the executive. Switch the mode on the nation’s settings first.')
    const entries: TimelineEntry[] = []
    const problems: string[] = []
    for (let day = 0; day < (days as number); day++) {
      // Make sure every petition is before the bodies, and wait for them.
      await this.act(id, async (n) => {
        const opened = this.dockets.openFor(n)
        const stuck = Object.values(n.gov.dockets).filter((d) => d.status !== 'ready' && d.status !== 'decided' && !this.dockets.busy(id))
        await this.store.save(n)
        this.dockets.start(id, [...opened, ...stuck.map((d) => d.dilemma).filter((d) => !opened.includes(d))])
      })
      await this.dockets.idle(id)
      // A docket that failed is sent back to the bodies once more, and waited for.
      const failed = await this.act(id, async (n) => {
        const list = Object.values(n.gov.dockets).filter((d) => d.status === 'failed' && this.onAgenda(n, d.dilemma))
        for (const d of list) n.gov = fileDocket(n.gov, this.dockets.open(n, d.dilemma, d.number))
        if (list.length) await this.store.save(n)
        this.dockets.start(id, list.map((d) => d.dilemma))
        return list.length
      })
      if (failed) await this.dockets.idle(id)
      const result = await this.act(id, async (n) => {
        if (n.gov.mode !== 'found' && !opts.force) throw new HttpError(409, 'The mode was changed to govern, so the run stopped.')
        const out: TimelineEntry[] = []
        for (const dilemmaId of this.dockets.agendaOf(n)) out.push(...(await this.executiveDecides(n, dilemmaId, problems)))
        out.push(...this.decideMattersByAdvice(n))
        const items = agendaItems(n.state, this.content)
        if (items.situation) {
          const choice = this.chooseSituation(n.state, items.situation.stage.options)
          const pre = n.state
          n.state = decideSituation(pre, this.content, choice)
          const entry = n.state.timeline.at(-1)!
          out.push(entry)
          this.pushToday(n, { title: items.situation.situation.title, course: choice, result: entry.text ?? entry.headline, changes: entry.changes.map((c) => `${c.target} ${c.by > 0 ? 'up' : 'down'} ${Math.abs(c.by)}`) })
        }
        const night = await this.nightfall(n)
        problems.push(...night.problems)
        const opened = this.dockets.openFor(n)
        await this.store.save(n)
        this.dockets.start(id, opened)
        return [...out, ...night.entries]
      })
      entries.push(...result)
    }
    const n = this.store.open(id)
    return { entries, ...(problems.length ? { problems } : {}), ...this.payload(n) }
  }

  // The AI executive (or its stand-in) decides one petition and it is enacted.
  private async executiveDecides(n: Nation, dilemmaId: string, problems: string[]): Promise<TimelineEntry[]> {
    const { docket, fresh } = this.docketFor(n, dilemmaId)
    if (docket.status === 'decided') return []
    if (fresh) {
      problems.push(`Petition ${dilemmaId} was not decided today: no body had been convened on it.`)
      return []
    }
    // Only what the bodies have finished is decided: a failed docket lacks a ruling or a
    // vote the rules need. It waits, and the day goes on without it.
    if (docket.status !== 'ready') {
      problems.push(`Petition #${docket.number} was not decided today: ${docket.status === 'failed' ? `the bodies could not finish it (${docket.error ?? 'no reason given'})` : `the bodies were still ${docket.status}`}.`)
      return []
    }
    if (fresh) n.gov = fileDocket(n.gov, docket)
    const standing = this.standingOf(n, n.gov.dockets[dilemmaId]!)
    // The screen polls while the executive thinks, so it says so rather than "ready".
    const executive = n.gov.institutions.constitution.rules.executive.title
    n.gov = {
      ...n.gov,
      dockets: {
        ...n.gov.dockets,
        [dilemmaId]: { ...n.gov.dockets[dilemmaId]!, status: 'deciding', progress: [...n.gov.dockets[dilemmaId]!.progress, `${/^the /i.test(executive) ? executive : `The ${executive}`} is considering the petition`] },
      },
    }
    const filed = n.gov.dockets[dilemmaId]!
    const ctx = contextFor(n, this.content, this.ai, { onProblem: (l) => problems.push(l) })
    const decision = await runExecutive(ctx, { ...filed, standing })
    const dilemma = this.content.dilemmas.find((d) => d.id === dilemmaId)!
    const option = dilemma.options.find((o) => o.id === decision.course)
    const text = option?.custom ? nameFor(option.custom.field, decision.reasons, n.state) : undefined
    return this.enact(
      n,
      filed,
      standing,
      decision.course,
      {
        reasons: decision.reasons,
        ...(text ? { text } : {}),
        ...(decision.veto ? { veto: decision.veto.reasons } : {}),
      },
      problems,
    )
  }

  // Found mode: as soon as the bodies have finished, the executive decides.
  async autoDecide(id: string, dilemmaId: string) {
    if (!this.store.exists(id)) return
    await this.act(id, async (n) => {
      const d = n.gov.dockets[dilemmaId]
      if (n.gov.mode !== 'found' || !d || d.status !== 'ready' || !this.onAgenda(n, dilemmaId)) return
      await this.executiveDecides(n, dilemmaId, [])
      await this.store.save(n)
    })
  }

  // The crisis option that does the most good by the indicators, as the stand-ins weigh it.
  private chooseSituation(state: GameState, options: { id: string }[]): string {
    let best = { id: '', score: -Infinity }
    for (const o of availableOptions(options as never, state)) {
      const f = forecastSituation(state, this.content, o.id)
      const score = [...f.changes, ...f.penalties]
        .filter((c) => c.kind === 'indicator')
        .reduce((t, c) => t + c.by * (INDICATOR_INFO[c.target as keyof typeof INDICATOR_INFO]?.lowerIsBetter ? -1 : 1), 0)
      if (score > best.score) best = { id: o.id, score }
    }
    if (!best.id) throw new HttpError(409, 'The crisis has no option open.')
    return best.id
  }

  async convene(id: string, dilemmaId: string) {
    return this.act(id, async (n) => {
      if (!this.onAgenda(n, dilemmaId)) throw new HttpError(409, `${dilemmaId} is not on today’s desk.`)
      const was = n.gov.dockets[dilemmaId]
      if (was?.status === 'decided') throw new HttpError(409, `Petition #${was.number} has already been decided.`)
      if (was && this.dockets.busy(id) && ['sitting', 'reconciling', 'exchanging'].includes(was.status)) {
        throw new HttpError(409, `The bodies are already sitting on Petition #${was.number}.`)
      }
      const docket = this.dockets.open(n, dilemmaId, was?.number)
      n.gov = fileDocket(n.gov, docket)
      await this.store.save(n)
      this.dockets.start(id, [dilemmaId])
      return { docket, ...this.payload(n) }
    })
  }

  dockets_(id: string) {
    const n = this.store.open(id)
    return { dockets: this.dockets.view(n) }
  }

  // ---------------------------------------------------------------------------------------
  // The sandbox, the identity, the mode
  // ---------------------------------------------------------------------------------------

  async sandbox(id: string, input: unknown) {
    const v = body(input)
    const keys = ['adjust', 'callUp', 'crisis', 'skip'].filter((k) => v[k] !== undefined)
    if (keys.length !== 1) throw new HttpError(400, 'Send one of adjust, callUp, crisis or skip.')
    return this.act(id, async (n) => {
      const entries: TimelineEntry[] = []
      if (v['adjust'] !== undefined) {
        if (!Array.isArray(v['adjust']) || v['adjust'].length > 50 || !v['adjust'].every(isObject)) throw new HttpError(400, 'adjust must be a list of changes.')
        for (const a of v['adjust'] as Record<string, unknown>[]) {
          if ('indicator' in a && !INDICATORS.includes(a['indicator'] as never)) throw new HttpError(400, `There is no indicator “${String(a['indicator'])}”.`)
          if ('to' in a && typeof a['to'] !== 'number' && typeof a['to'] !== 'boolean') throw new HttpError(400, 'Each change needs a value to set it to.')
        }
        const next = engine(() => adjust(n.state, this.content, v['adjust'] as Adjustment[]))
        engine(() => deserialize(serialize(next)))
        n.state = next
      } else if (v['callUp'] !== undefined) {
        const dilemma = line(v['callUp'], 'The dilemma to call up', { max: 100 })!
        n.state = engine(() => callUp(n.state, this.content, dilemma))
        if (n.gov.dockets[dilemma]?.status === 'decided') {
          const { [dilemma]: _gone, ...rest } = n.gov.dockets
          n.gov = { ...n.gov, dockets: rest }
        }
      } else if (v['crisis'] !== undefined) {
        const situation = line(v['crisis'], 'The crisis to start', { max: 100 })!
        n.state = engine(() => startCrisis(n.state, this.content, situation))
      } else {
        const days = v['skip']
        if (!Number.isSafeInteger(days) || (days as number) < 1 || (days as number) > 60) throw new HttpError(400, 'skip must be a whole number of days from 1 to 60.')
        this.dockets.cancel(id)
        const from = n.state.timeline.length
        for (let i = 0; i < (days as number); i++) {
          const weekDay = n.state.day
          n.state = endDay(n.state, this.content)
          n.history = withDayEnd(n.history, n.state)
          // Skipped weeks are played by the rules alone, but the world still writes them down.
          if (n.state.world && weekDay % 7 === 0) await this.writeWorldWeek(n, weekDay, undefined)
        }
        entries.push(...n.state.timeline.slice(from))
        n.gov = { ...n.gov, dockets: {}, lastWorldDay: Math.max(n.gov.lastWorldDay, n.state.day - 1) }
        n.today = { day: n.state.day, decisions: [] }
      }
      // Changed figures, an issue or a crisis put on the desk: no sitting may rest on what is
      // no longer true, so the day's open petitions go back to the bodies.
      const send = v['skip'] === undefined ? await this.reconvene(n) : this.dockets.openFor(n)
      await this.store.save(n)
      this.dockets.start(id, send)
      return { ...(entries.length ? { entries } : {}), ...this.payload(n) }
    })
  }

  // The day's open, undecided petitions are sent back to the bodies (keeping their numbers),
  // any no longer on the desk dropped, new ones opened, and every branch starts a fresh
  // session. Changes n; the caller saves, then starts what this returns.
  async reconvene(n: Nation, keep: readonly string[] = []): Promise<string[]> {
    this.dockets.cancel(n.id)
    const onDesk = new Set(this.dockets.agendaOf(n))
    const dockets = { ...n.gov.dockets }
    for (const [dilemma, d] of Object.entries(dockets)) {
      if (d.status !== 'decided' && !onDesk.has(dilemma)) delete dockets[dilemma]
    }
    n.gov = { ...n.gov, dockets }
    const send: string[] = []
    for (const d of Object.values(n.gov.dockets)) {
      if (d.status === 'decided' || keep.includes(d.dilemma)) continue
      n.gov = fileDocket(n.gov, this.dockets.open(n, d.dilemma, d.number))
      send.push(d.dilemma)
    }
    send.push(...this.dockets.openFor(n))
    await Sessions.of(n.dir).reset()
    return send
  }

  async identity(id: string, input: unknown) {
    const identity = readIdentity(input)
    return this.act(id, async (n) => {
      const next = { ...n.state, identity }
      engine(() => deserialize(serialize(next)))
      n.state = next
      const send = await this.reconvene(n)
      await this.store.save(n)
      this.dockets.start(id, send)
      return this.payload(n)
    })
  }

  async mode(id: string, input: unknown) {
    const mode = body(input)['mode']
    if (mode !== 'govern' && mode !== 'found') throw new HttpError(400, 'The mode must be govern or found.')
    return this.act(id, async (n) => {
      n.gov = { ...n.gov, mode }
      await this.store.save(n)
      // Into found mode: the executive takes up whatever the bodies have already finished.
      if (mode === 'found') this.dockets.decideReady(id, n)
      return this.payload(n)
    })
  }

  // ---------------------------------------------------------------------------------------
  // The Founder
  // ---------------------------------------------------------------------------------------

  async enterWord(n: Nation, w: { text: string; overrules?: string; silence: boolean; confirmed: boolean }) {
    const number = Math.max(0, ...n.gov.words.map((x) => x.number)) + 1
    const document = await this.write(n, {
      series: 'words',
      title: `The Founder’s Word No. ${number}`,
      day: n.state.day,
      issuer: this.founderName(n),
      kind: 'word',
      refs: w.overrules ? [w.overrules] : [],
      body: `${w.text}${w.silence ? '\n\n*Silence: the matter is closed, and no body may argue it further.*' : ''}${w.confirmed ? '' : '\n\n*Laid before the bodies. It takes effect when the Founder confirms it.*'}`,
      data: { number, overrules: w.overrules ?? null, silence: w.silence, confirmed: w.confirmed },
    })
    const word = { number, day: n.state.day, text: w.text, ...(w.overrules ? { overrules: w.overrules } : {}), silence: w.silence, confirmed: w.confirmed, remonstrances: [], document }
    n.gov = { ...n.gov, words: [...n.gov.words, word] }
    return word
  }

  async words(id: string, input: unknown) {
    const v = body(input)
    return this.act(id, async (n) => {
      if (v['number'] !== undefined) {
        if (v['confirm'] !== true) throw new HttpError(400, 'To confirm a Word, send { number, confirm: true }.')
        const word = n.gov.words.find((w) => w.number === v['number'])
        if (!word) throw new HttpError(404, `There is no Word No. ${String(v['number'])}.`)
        if (word.confirmed) throw new HttpError(409, `Word No. ${word.number} is already confirmed.`)
        await this.write(n, {
          series: 'words',
          title: `The Founder’s Word No. ${word.number}: confirmed`,
          day: n.state.day,
          issuer: this.founderName(n),
          kind: 'confirmation',
          refs: [word.document, ...word.remonstrances],
          body: `The Founder, having heard the bodies, confirms Word No. ${word.number}. It is final.`,
        })
        const confirmed = { ...word, confirmed: true }
        n.gov = { ...n.gov, words: n.gov.words.map((w) => (w.number === word.number ? confirmed : w)) }
        await this.store.save(n)
        return { word: confirmed, ...this.payload(n) }
      }
      const text = prose(v['text'], 'The Word')!
      const overrules = line(v['overrules'], 'What the Word overrules', { max: 100, optional: true })
      if (v['silence'] !== undefined && typeof v['silence'] !== 'boolean') throw new HttpError(400, 'silence must be true or false.')
      if (v['confirm'] !== undefined && typeof v['confirm'] !== 'boolean') throw new HttpError(400, 'confirm must be true or false.')
      const word = await this.enterWord(n, { text, ...(overrules ? { overrules } : {}), silence: v['silence'] === true, confirmed: v['confirm'] === true })
      await this.store.save(n)
      return { word, ...this.payload(n) }
    })
  }

  async question(id: string, qid: string, input: unknown) {
    const v = body(input)
    return this.act(id, async (n) => {
      const q = n.gov.questions.find((x) => x.id === qid)
      if (!q) throw new HttpError(404, `There is no question ${qid}.`)
      let next: typeof q
      if (v['answer'] !== undefined) {
        const answer = prose(v['answer'], 'The answer')!
        await this.write(n, {
          series: 'questions',
          title: `${q.id}: the Founder’s answer`,
          day: n.state.day,
          issuer: this.founderName(n),
          kind: 'answer',
          refs: q.source ? [q.source] : [],
          body: `**${q.from} asked:** ${q.text}\n\n**The Founder answered:** ${answer}`,
          data: { question: q.id },
        })
        next = { ...q, status: 'answered', answer }
      } else if (v['noAnswer'] === true) next = { ...q, status: 'no-answer' }
      else if (v['later'] === true) next = { ...q, status: 'later' }
      else throw new HttpError(400, 'Send { answer }, { noAnswer: true } or { later: true }.')
      n.gov = { ...n.gov, questions: n.gov.questions.map((x) => (x.id === qid ? next : x)) }
      await this.store.save(n)
      return { question: next, ...this.payload(n) }
    })
  }

  async letter(id: string, lid: string, input: unknown) {
    const v = body(input)
    return this.act(id, async (n) => {
      const l = n.gov.letters.find((x) => x.id === lid)
      if (!l) throw new HttpError(404, `There is no letter ${lid}.`)
      let next: typeof l
      const reply = v['reply'] !== undefined ? prose(v['reply'], 'The reply')! : v['adopt'] === true ? l.draft : undefined
      if (v['adopt'] === true && !l.draft) throw new HttpError(409, 'This letter has no draft reply to adopt. Write one instead.')
      if (reply !== undefined) {
        await this.write(n, {
          series: 'letters',
          title: `Reply to ${l.from}`,
          day: n.state.day,
          issuer: this.founderName(n),
          kind: 'reply',
          refs: [],
          body: `**${l.from}${l.place ? `, ${l.place}` : ''} wrote:** ${l.text}\n\n**The reply:** ${reply}`,
          data: { letter: l.id, adopted: v['adopt'] === true },
        })
        next = { ...l, status: 'replied', reply }
      } else if (v['noReply'] === true) next = { ...l, status: 'no-reply' }
      else if (v['read'] === true) next = l.status === 'unread' ? { ...l, status: 'read' } : l
      else throw new HttpError(400, 'Send { reply }, { adopt: true }, { noReply: true } or { read: true }.')
      n.gov = { ...n.gov, letters: n.gov.letters.map((x) => (x.id === lid ? next : x)) }
      await this.store.save(n)
      return { letter: next, ...this.payload(n) }
    })
  }

  // ---------------------------------------------------------------------------------------
  // Factbooks and bills
  // ---------------------------------------------------------------------------------------

  private factbookInput(input: unknown) {
    const v = body(input)
    const categories: Factbook['category'][] = ['overview', 'history', 'geography', 'culture', 'economy', 'law', 'government', 'other']
    const category = (v['category'] ?? 'other') as Factbook['category']
    if (!categories.includes(category)) throw new HttpError(400, `The category must be one of ${categories.join(', ')}.`)
    const author = v['author'] === 'ai' ? 'ai' : 'founder'
    return { title: line(v['title'], 'The title', { max: 120 })!, category, body: prose(v['body'], 'The entry', 60_000)!, author } as const
  }

  private async fileFactbook(n: Nation, f: Factbook, edited: boolean) {
    await this.write(n, {
      series: 'factbook',
      title: f.title,
      day: n.state.day,
      issuer: f.author === 'ai' ? `${n.state.identity.name}, a draft adopted by the Founder` : this.founderName(n),
      kind: edited ? 'factbook, revised' : 'factbook',
      refs: [],
      body: f.body,
      data: { factbook: f.id, category: f.category },
    })
  }

  async writeFactbook(id: string, input: unknown) {
    const f = this.factbookInput(input)
    return this.act(id, async (n) => {
      const num = Math.max(0, ...n.gov.factbooks.map((x) => Number(x.id.replace(/^\D+/, '')) || 0)) + 1
      const factbook: Factbook = { id: `F-${String(num).padStart(4, '0')}`, title: f.title, category: f.category, body: f.body, updatedDay: n.state.day, author: f.author }
      await this.fileFactbook(n, factbook, false)
      n.gov = { ...n.gov, factbooks: [...n.gov.factbooks, factbook] }
      await this.store.save(n)
      return { factbook, ...this.payload(n) }
    })
  }

  async editFactbook(id: string, fid: string, input: unknown) {
    const f = this.factbookInput(input)
    return this.act(id, async (n) => {
      const was = n.gov.factbooks.find((x) => x.id === fid)
      if (!was) throw new HttpError(404, `There is no factbook entry ${fid}.`)
      const factbook: Factbook = { ...was, title: f.title, category: f.category, body: f.body, updatedDay: n.state.day }
      await this.fileFactbook(n, factbook, true)
      n.gov = { ...n.gov, factbooks: n.gov.factbooks.map((x) => (x.id === fid ? factbook : x)) }
      await this.store.save(n)
      return { factbook, ...this.payload(n) }
    })
  }

  // Drafts an entry; nothing is saved until the Founder writes it.
  async draftFactbook(id: string, input: unknown) {
    const v = body(input)
    const categories: Factbook['category'][] = ['overview', 'history', 'geography', 'culture', 'economy', 'law', 'government', 'other']
    const category = (v['category'] ?? 'overview') as Factbook['category']
    if (!categories.includes(category)) throw new HttpError(400, `The category must be one of ${categories.join(', ')}.`)
    const title = line(v['title'], 'The title', { max: 120 })!
    const notes = prose(v['notes'], 'The notes', 10_000, true) ?? ''
    const n = this.store.open(id)
    const problems: string[] = []
    const ctx = contextFor(n, this.content, this.ai, { onProblem: (l) => problems.push(l) })
    const b = brief(n.state, n.gov, this.content, await ctx.record({ series: 'factbook', limit: 6 }), ctx.archivePath)
    const { output, ai } = await ctx.run('factbook.draft', { brief: b, category, title, notes })
    return { title: output.title, body: output.body, ai, ...(problems.length ? { problems } : {}) }
  }

  async bill(id: string, input: unknown) {
    const v = body(input)
    const title = line(v['title'], 'The bill’s title', { max: 160 })!
    const summary = prose(v['summary'], 'The bill’s summary', 5000)!
    const movedBy = line(v['moved'], 'The member moving it', { max: 100, optional: true })
    return this.act(id, async (n) => {
      // Only a legislature sits on bills (the evening's order paper); with none, a bill
      // would lie on the table for ever.
      const house = n.gov.institutions.bodies.find((b) => b.kind === 'legislature')
      if (!house) throw new HttpError(409, `${n.state.identity.name} has no legislature, so there is nobody to move a bill before. Change the law by a Founder’s Word, or by amending the constitution.`)
      const number = Math.max(0, ...n.gov.bills.map((b) => b.number)) + 1
      const moved = movedBy ?? this.founderName(n)
      const document = await this.write(n, {
        series: 'bills',
        title: `Bill ${number}: ${title}`,
        day: n.state.day,
        issuer: house.name,
        kind: 'bill',
        refs: [],
        body: `**Moved by ${moved}.**\n\n${summary}\n\n*On the order paper of ${house.name}.*`,
        data: { number, stage: 'introduced' },
      })
      const bill = { number, title, body: house.id, moved, summary, stage: 'introduced' as const, divisions: [], effects: [], document }
      n.gov = { ...n.gov, bills: [...n.gov.bills, bill] }
      await this.store.save(n)
      return { bill, ...this.payload(n) }
    })
  }
}

// The one action a request may carry, checked field by field.
function parseAction(raw: unknown): WorldAction {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new HttpError(400, 'Send the action as an object: { "pact": id }, { "war": id }, { "peace": warId }, { "assembly": "join" | "leave" } or { "mobilise": true | false }.')
  const a = raw as Record<string, unknown>
  const keys = Object.keys(a)
  if (keys.length !== 1) throw new HttpError(400, 'An action has exactly one field.')
  const id = (v: unknown) => {
    if (typeof v !== 'string' || !/^[a-z][a-z0-9_-]{0,60}$/.test(v)) throw new HttpError(400, 'That is not a nation or war id.')
    return v
  }
  if ('pact' in a) return { pact: id(a['pact']) }
  if ('war' in a) return { war: id(a['war']) }
  if ('peace' in a) return { peace: id(a['peace']) }
  if ('assembly' in a) {
    if (a['assembly'] !== 'join' && a['assembly'] !== 'leave') throw new HttpError(400, 'assembly must be join or leave.')
    return { assembly: a['assembly'] }
  }
  if ('mobilise' in a) {
    if (typeof a['mobilise'] !== 'boolean') throw new HttpError(400, 'mobilise must be true or false.')
    return { mobilise: a['mobilise'] }
  }
  throw new HttpError(400, `${keys[0]} is not an action.`)
}
