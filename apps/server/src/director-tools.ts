// The Director's tools, out of character: what the MCP server (mcp.ts) calls through
// POST /api/director/:nation/<tool>. Reads see everything. Running the government goes
// through the game as the player's own actions would. Cheats are quiet: the engine applies
// them without a timeline entry, they set the sandbox badge, and each is written to the OOC
// log with the Founder's request and every figure before and after, so it can be undone
// exactly. A cheat reconvenes the day's open petitions and starts every branch afresh.

import {
  adjust,
  agendaItems,
  applyExternal,
  availableOptions,
  callUp,
  activeWars,
  adviseMatter,
  classify,
  homeStrength,
  matterCard,
  openMatters,
  worldCheat,
  worldLines,
  decide,
  dismiss,
  endDay,
  INDICATORS,
  INDICATOR_INFO,
  nextElection,
  render,
  serialize,
  deserialize,
  startCrisis,
  support,
  type Adjustment,
  type Content,
  type Effect,
  type TimelineEntry,
} from '@diplomat/engine'
import {
  amend,
  binding,
  carried,
  census,
  decisionSummary,
  DISMISS,
  fileDocket,
  formatDate,
  FORM_IDS,
  petitionBrief,
  problemsOf,
  standing as standingOf,
  verdictOf,
  type Amendment,
  type CensusBase,
  type Docket,
  type FormId,
  type Ruling,
  type Sitting,
} from '@diplomat/government'
import { readIdentity, type Game } from './game.ts'
import { HttpError } from './http.ts'
import { OocLog, Sessions, type OocChange, type OocEntry } from './ooc.ts'
import { withDayEnd, type Nation } from './store.ts'
import { readWorldCheat } from './world-cheat.ts'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export const TOOLS = [
  'list_nations',
  'nation_overview',
  'world_overview',
  'read_dockets',
  'search_archive',
  'read_document',
  'read_ooc_log',
  'list_dilemmas',
  'list_situations',
  'forecast',
  'convene',
  'end_day',
  'run_nation',
  'give_word',
  'undo_cheat',
  'cheat_set_figures',
  'cheat_call_up',
  'cheat_start_crisis',
  'cheat_skip_days',
  'cheat_force_outcome',
  'cheat_decide',
  'cheat_world_event',
  'cheat_amend',
  'cheat_identity',
  'cheat_world',
] as const

export type Tool = (typeof TOOLS)[number]

const CENSUS_FIELDS: (keyof CensusBase)[] = ['population', 'gdpPerHead', 'taxRate', 'crimePerHour', 'growth']
const CONVENE_WAIT = 20 * 60_000

const entryOf = (e: TimelineEntry) => ({ day: e.day, kind: e.kind, headline: e.headline, ...(e.text ? { text: e.text } : {}), changes: e.changes.map((c) => `${c.target} ${c.by > 0 ? '+' : ''}${c.by}: ${c.why}`) })

function str(v: unknown, what: string, opts: { optional?: boolean; max?: number } = {}): string | undefined {
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return undefined
    throw new HttpError(400, `${what} is missing.`)
  }
  if (typeof v !== 'string') throw new HttpError(400, `${what} must be text.`)
  if (v.length > (opts.max ?? 2000)) throw new HttpError(400, `${what} is too long.`)
  return v
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(400, `${what} must be a number.`)
  return v
}

// ---------------------------------------------------------------------------------------
// What a cheat may touch, read and written back by name, so that an undo is exact.
// ---------------------------------------------------------------------------------------

function read(n: Nation, target: string): unknown {
  const [kind, key = ''] = target.split(/:(.*)/s) as [string, string?]
  const s = n.state
  switch (kind) {
    case 'indicator':
      return s.indicators[key as keyof typeof s.indicators]
    case 'faction':
      return s.factions[key]?.approval
    case 'neighbour':
      return s.neighbours[key]
    case 'policy':
      return s.policies[key]
    case 'minister':
      return s.cabinet[key] === undefined ? undefined : structuredClone(s.cabinet[key])
    case 'flag':
      return s.flags[key]
    case 'census':
      return n.gov.censusBase[key as keyof CensusBase]
    case 'identity':
      return structuredClone(s.identity)
    case 'agenda':
      return structuredClone(s.agenda)
    case 'situation':
      return { situation: structuredClone(s.situation), situationsDone: [...s.situationsDone], onDesk: s.agenda.situation }
    case 'sandbox':
      return s.sandbox
    case 'world':
      return s.world === undefined ? undefined : structuredClone(s.world)
    case 'institutions':
      return structuredClone(n.gov.institutions)
    case 'docket':
      return n.gov.dockets[key] === undefined ? undefined : structuredClone(n.gov.dockets[key])
    case 'nation':
      return { state: serialize(s), history: structuredClone(n.history), today: structuredClone(n.today), gov: structuredClone(n.gov) }
    default:
      throw new Error(`unknown target ${target}`)
  }
}

function write(n: Nation, target: string, value: unknown) {
  const [kind, key = ''] = target.split(/:(.*)/s) as [string, string?]
  const s = structuredClone(n.state)
  const setOrDelete = (obj: Record<string, unknown>, k: string, v: unknown) => {
    if (v === undefined) delete obj[k]
    else obj[k] = structuredClone(v)
  }
  switch (kind) {
    case 'indicator':
      s.indicators[key as keyof typeof s.indicators] = value as number
      break
    case 'faction':
      if (s.factions[key]) s.factions[key] = { ...s.factions[key]!, approval: value as number }
      break
    case 'neighbour':
      setOrDelete(s.neighbours, key, value)
      break
    case 'policy':
      setOrDelete(s.policies, key, value)
      break
    case 'minister':
      setOrDelete(s.cabinet, key, value)
      break
    case 'flag':
      setOrDelete(s.flags, key, value)
      break
    case 'census':
      n.gov = { ...n.gov, censusBase: { ...n.gov.censusBase, [key]: value as number } }
      return
    case 'identity':
      s.identity = structuredClone(value) as typeof s.identity
      break
    case 'agenda':
      s.agenda = structuredClone(value) as typeof s.agenda
      break
    case 'situation': {
      const v = value as { situation: typeof s.situation; situationsDone: string[]; onDesk: boolean }
      s.situation = structuredClone(v.situation)
      s.situationsDone = [...v.situationsDone]
      s.agenda = { ...s.agenda, situation: v.onDesk }
      break
    }
    case 'sandbox':
      if (value === undefined) delete s.sandbox
      else s.sandbox = value as boolean
      break
    case 'world':
      if (value === undefined) delete s.world
      else s.world = structuredClone(value) as NonNullable<typeof s.world>
      break
    case 'institutions':
      n.gov = { ...n.gov, institutions: structuredClone(value) as typeof n.gov.institutions }
      return
    case 'docket': {
      const dockets = { ...n.gov.dockets }
      setOrDelete(dockets, key, value)
      n.gov = { ...n.gov, dockets: dockets as typeof n.gov.dockets }
      return
    }
    case 'nation': {
      const v = value as { state: string; history: Nation['history']; today: Nation['today']; gov: Nation['gov'] }
      n.state = deserialize(v.state)
      n.history = structuredClone(v.history)
      n.today = structuredClone(v.today)
      n.gov = structuredClone(v.gov)
      return
    }
    default:
      throw new Error(`unknown target ${target}`)
  }
  n.state = s
}

interface Plan {
  detail: string
  targets: string[]
  // Dockets the cheat itself set: not reconvened.
  keep?: string[]
  apply: () => void | Promise<void>
  result?: () => unknown
}

export class DirectorTools {
  private game: Game
  private content: Content

  constructor(game: Game, content: Content) {
    this.game = game
    this.content = content
  }

  private open(id: string | null): Nation {
    if (!id) throw new HttpError(400, 'Name the nation: every tool but list_nations takes `nation`.')
    return this.game.store.open(id)
  }

  async call(tool: string, nation: string | null, raw: unknown): Promise<unknown> {
    if (!(TOOLS as readonly string[]).includes(tool)) throw new HttpError(404, `There is no Director tool “${tool}”. The tools are ${TOOLS.join(', ')}.`)
    const args = raw === undefined ? {} : raw
    if (!isObject(args)) throw new HttpError(400, 'Send the tool’s arguments as a JSON object.')
    if (tool !== 'list_nations' && !nation) throw new HttpError(400, 'Name the nation: every tool but list_nations takes `nation`.')
    const id = nation ?? ''
    switch (tool as Tool) {
      case 'list_nations':
        return { nations: this.game.store.list() }
      case 'nation_overview':
        return this.overview(this.open(id))
      case 'world_overview':
        return this.worldOverview(this.open(id))
      case 'read_dockets':
        return this.readDockets(this.open(id))
      case 'search_archive': {
        const n = this.open(id)
        const limit = args['limit'] === undefined ? 20 : num(args['limit'], 'limit')
        return n.archive.search({
          ...(str(args['q'], 'q', { optional: true }) ? { q: args['q'] as string } : {}),
          ...(str(args['series'], 'series', { optional: true }) ? { series: args['series'] as string } : {}),
          ...(str(args['issuer'], 'issuer', { optional: true }) ? { issuer: args['issuer'] as string } : {}),
          ...(args['from'] !== undefined ? { from: num(args['from'], 'from') } : {}),
          ...(args['to'] !== undefined ? { to: num(args['to'], 'to') } : {}),
          limit,
          ...(args['offset'] !== undefined ? { offset: num(args['offset'], 'offset') } : {}),
        })
      }
      case 'read_document': {
        const n = this.open(id)
        const docId = str(args['id'], 'id')!
        const document = n.archive.get(docId)
        if (!document) throw new HttpError(404, `There is no document ${docId}.`)
        return { document, citedBy: n.archive.citedBy(docId) }
      }
      case 'read_ooc_log':
        return this.oocLog(id)
      case 'list_dilemmas':
        return this.listDilemmas(this.open(id), str(args['q'], 'q', { optional: true }))
      case 'list_situations': {
        const n = this.open(id)
        return {
          running: n.state.situation ? { ...n.state.situation, title: this.content.situations.find((s) => s.id === n.state.situation!.id)?.title } : null,
          situations: this.content.situations.map((s) => ({ id: s.id, title: s.title, description: s.description, done: n.state.situationsDone.includes(s.id) })),
        }
      }
      case 'forecast':
        return this.forecast(this.open(id), str(args['dilemma'], 'dilemma')!)
      case 'convene': {
        const dilemma = str(args['dilemma'], 'dilemma')!
        const r = await this.game.convene(id, dilemma)
        if (args['wait'] !== false) await Promise.race([this.game.dockets.idle(id), new Promise((ok) => setTimeout(ok, CONVENE_WAIT).unref())])
        const n = this.open(id)
        return { convened: r.docket.number, docket: this.game.dockets.view(n).find((d) => d.dilemma === dilemma) ?? n.gov.dockets[dilemma] ?? null }
      }
      case 'end_day': {
        const r = await this.game.endDay(id)
        const n = this.open(id)
        return { day: n.state.day, date: formatDate(n.gov.institutions.calendar.start, n.state.day), entries: r.entries.map(entryOf), problems: 'problems' in r ? r.problems : [], agenda: this.agenda(n) }
      }
      case 'run_nation': {
        const days = args['days'] === undefined ? 1 : num(args['days'], 'days')
        const r = await this.game.run(id, { days }, { force: true })
        const n = this.open(id)
        return { day: n.state.day, entries: r.entries.map(entryOf), problems: 'problems' in r ? r.problems : [], agenda: this.agenda(n) }
      }
      case 'give_word': {
        const r = await this.game.words(id, {
          text: args['text'],
          ...(args['overrules'] !== undefined ? { overrules: args['overrules'] } : {}),
          ...(args['silence'] !== undefined ? { silence: args['silence'] } : {}),
          ...(args['confirm'] !== undefined ? { confirm: args['confirm'] } : {}),
        })
        return { word: r.word }
      }
      case 'undo_cheat': {
        const r = await this.undo(id, num(args['n'], 'n'), typeof args['request'] === 'string' ? args['request'] : '')
        return r.entry
      }
      default:
        return this.cheat(id, tool, args)
    }
  }

  // ---------------------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------------------

  private agenda(n: Nation) {
    const items = agendaItems(n.state, this.content)
    const say = (t: string, d?: string) => render(t, n.state, this.content, d ? n.state.agenda.bound[d] : undefined)
    return {
      major: items.major ? { id: items.major.id, title: say(items.major.title, items.major.id) } : null,
      minors: items.minors.map((d) => ({ id: d.id, title: say(d.title, d.id) })),
      situation: items.situation ? { id: items.situation.situation.id, title: items.situation.situation.title, stage: items.situation.stage.title, gauge: items.situation.gauge } : null,
    }
  }

  overview(n: Nation) {
    const s = n.state
    const c = n.gov.institutions.constitution
    return {
      id: n.id,
      name: s.identity.name,
      identity: s.identity,
      day: s.day,
      date: formatDate(n.gov.institutions.calendar.start, s.day),
      class: classify(s, this.content).name,
      form: c.form,
      stateName: c.stateName,
      mode: n.gov.mode,
      executive: c.rules.executive,
      founder: n.gov.institutions.founder,
      sandbox: s.sandbox === true,
      support: Math.round(support(s) * 10) / 10,
      indicators: Object.fromEntries(INDICATORS.map((i) => [i, { name: INDICATOR_INFO[i].name, value: s.indicators[i] }])),
      factions: this.content.factions.map((f) => ({ id: f.id, name: f.name, approval: s.factions[f.id]?.approval, clout: s.factions[f.id]?.clout })),
      neighbours: this.content.neighbours.map((x) => ({ id: x.id, name: x.name, standing: s.neighbours[x.id] })),
      nextElection: nextElection(s),
      census: census(s, n.gov.censusBase, this.content),
      censusBase: n.gov.censusBase,
      agenda: this.agenda(n),
      dockets: Object.values(n.gov.dockets).map((d) => ({ dilemma: d.dilemma, number: d.number, status: d.status, standing: d.standing?.explanation ?? null, decision: d.decision?.course ?? null })),
      petitions: n.gov.petitions,
      words: n.gov.words.length,
      openQuestions: n.gov.questions.filter((q) => q.status === 'open' || q.status === 'later').length,
      unreadLetters: n.gov.letters.filter((l) => l.status === 'unread').length,
      bills: n.gov.bills.filter((b) => !['law', 'failed'].includes(b.stage)).map((b) => ({ number: b.number, title: b.title, stage: b.stage })),
      cheats: OocLog.of(n.dir).all().filter((e) => e.undoes === undefined && !e.undone && e.action.startsWith('cheat_')).length,
      recent: s.timeline.slice(-8).map(entryOf),
    }
  }

  // The world as the Director sees it: everything, including what the nations would do and
  // what the Foreign Ministry would advise. Out of character; never for a branch.
  private worldOverview(n: Nation) {
    const s = n.state
    const w = s.world
    if (!w) return { world: null, note: 'This pack has no world beyond the borders.' }
    return {
      lines: worldLines(s, this.content),
      homeStrength: homeStrength(s),
      mobilised: w.home.mobilised,
      borderlandsLost: w.home.lost,
      important: w.important,
      nations: this.content.neighbours.map((d) => {
        const x = w.nations[d.id]
        return { id: d.id, name: d.name, near: d.near, free: x?.free ?? true, ruler: x?.ruler ?? null, standing: s.neighbours[d.id], strength: x?.strength, wealth: x?.wealth, stability: x?.stability, temperament: d.temperament, memory: x?.memory ?? [] }
      }),
      wars: activeWars(s),
      pacts: w.pacts,
      claims: w.claims.filter((c) => !c.settled),
      assembly: { members: w.assembly.members, next: w.assembly.next, motion: w.assembly.motion, queue: w.assembly.queue, recent: w.assembly.past.slice(-4), sanctions: w.assembly.sanctions },
      council: { ...w.council, past: w.council.past.slice(-4) },
      matters: openMatters(s).map((m) => ({ ...matterCard(s, this.content, m), advice: adviseMatter(s, this.content, m) })),
      recent: w.log.slice(-15),
    }
  }

  private readDockets(n: Nation) {
    return {
      dockets: this.game.dockets.view(n).map((d) => {
        let options: unknown[] = []
        try {
          options = petitionBrief(n.state, this.content, d.dilemma, d.number).options.map((o) => ({ course: o.course, number: o.number, advocate: o.advocate, speech: o.speech, forecast: o.forecast }))
        } catch {
          options = []
        }
        return { ...d, options }
      }),
    }
  }

  private listDilemmas(n: Nation, q?: string) {
    const terms = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    const onDesk = new Set([n.state.agenda.major, ...n.state.agenda.minors])
    const list = this.content.dilemmas
      .filter((d) => terms.every((t) => `${d.id} ${d.title} ${d.tags.join(' ')}`.toLowerCase().includes(t)))
      .map((d) => ({ id: d.id, title: render(d.title, n.state, this.content), kind: d.kind, tags: d.tags, onDesk: onDesk.has(d.id), lastAnswered: n.state.answered[d.id] ?? null }))
    return { total: list.length, dilemmas: list.slice(0, 80) }
  }

  private forecast(n: Nation, dilemmaId: string) {
    const d = this.content.dilemmas.find((x) => x.id === dilemmaId)
    if (!d) throw new HttpError(404, `There is no dilemma “${dilemmaId}” in the pack. Try list_dilemmas.`)
    const p = petitionBrief(n.state, this.content, dilemmaId, n.gov.dockets[dilemmaId]?.number ?? 0)
    return {
      dilemma: dilemmaId,
      title: p.title,
      description: p.description,
      onDesk: n.state.agenda.major === dilemmaId || n.state.agenda.minors.includes(dilemmaId),
      options: p.options.map((o) => ({ course: o.course, number: o.number, advocate: o.advocate, speech: o.speech, forecast: o.forecast, indicators: o.indicators ?? [], factions: o.effects ?? [] })),
      standing: n.gov.dockets[dilemmaId]?.standing ?? null,
    }
  }

  oocLog(id: string): { log: OocEntry[] } {
    const n = this.open(id)
    return { log: OocLog.of(n.dir).all().reverse() }
  }

  // ---------------------------------------------------------------------------------------
  // Cheats
  // ---------------------------------------------------------------------------------------

  // The day's open petitions go back to the bodies, any no longer on the desk are dropped,
  // and every branch starts afresh. Changes n; the caller saves; returns what to start.
  private async invalidate(n: Nation, keep: readonly string[] = []): Promise<string[]> {
    return this.game.reconvene(n, keep)
  }


  private async run(id: string, action: string, request: string, plan: (n: Nation) => Plan, undoes?: number) {
    return this.game.act(id, async (n) => {
      const p = plan(n)
      const targets = [...new Set([...p.targets, 'sandbox'])]
      const before = targets.map((t) => read(n, t))
      await p.apply()
      if (!undoes) n.state = { ...n.state, sandbox: true }
      const problems = problemsOf(JSON.parse(JSON.stringify(n.gov)))
      if (problems.length) throw new HttpError(400, `That would leave the government unreadable: ${problems.slice(0, 3).join('; ')}.`)
      try {
        deserialize(serialize(n.state))
      } catch (error) {
        throw new HttpError(400, `That would leave the nation unreadable: ${(error as Error).message}`)
      }
      const send = await this.invalidate(n, p.keep)
      const after = targets.map((t) => read(n, t))
      const changes: OocChange[] = targets.map((target, i) => ({ target, from: before[i], to: after[i] })).filter((c) => JSON.stringify(c.from) !== JSON.stringify(c.to) || c.target === 'nation')
      await Sessions.of(n.dir).reset()
      await this.game.store.save(n)
      const entry = await OocLog.of(n.dir).append({ day: n.state.day, action, detail: p.detail, request, changes, ...(undoes ? { undoes } : {}) })
      this.game.dockets.start(id, send)
      return { entry, result: p.result?.(), reconvened: send, payload: this.game.payload(n) }
    })
  }

  private async cheat(id: string, tool: string, args: Record<string, unknown>) {
    const request = typeof args['request'] === 'string' ? args['request'].trim() : ''
    if (!request) {
      throw new HttpError(400, 'A cheat needs `request`: the Founder’s own words asking for it, quoted. Only the Founder can ask for a cheat.')
    }
    if (request.length > 4000) throw new HttpError(400, 'The request is too long.')
    const r = await this.run(id, tool, request, (n) => this.plan(n, tool, args))
    const { changes, n: number, detail } = r.entry
    return { n: number, action: tool, detail, changes: (changes ?? []).filter((c) => c.target !== 'nation'), reconvened: r.reconvened, ...(r.result === undefined ? {} : { result: r.result }) }
  }

  private plan(n: Nation, tool: string, args: Record<string, unknown>): Plan {
    const c = this.content
    switch (tool) {
      case 'cheat_set_figures': {
        const adjustments: Adjustment[] = []
        const targets: string[] = []
        const parts: string[] = []
        const map = (key: string) => {
          const v = args[key]
          if (v === undefined) return {}
          if (!isObject(v)) throw new HttpError(400, `${key} must be an object of id to value.`)
          return v
        }
        for (const [k, v] of Object.entries(map('indicators'))) {
          if (!INDICATORS.includes(k as never)) throw new HttpError(400, `There is no indicator “${k}”. They are ${INDICATORS.join(', ')}.`)
          adjustments.push({ indicator: k as never, to: num(v, k) })
          targets.push(`indicator:${k}`)
          parts.push(`${k} ${v}`)
        }
        for (const [k, v] of Object.entries(map('factions'))) {
          if (!n.state.factions[k]) throw new HttpError(400, `There is no faction “${k}”.`)
          adjustments.push({ faction: k, to: num(v, k) })
          targets.push(`faction:${k}`)
          parts.push(`${k} ${v}`)
        }
        for (const [k, v] of Object.entries(map('neighbours'))) {
          if (!c.neighbours.some((x) => x.id === k)) throw new HttpError(400, `There is no neighbour “${k}”.`)
          adjustments.push({ neighbour: k, to: num(v, k) })
          targets.push(`neighbour:${k}`)
          parts.push(`${k} ${v}`)
        }
        for (const [k, v] of Object.entries(map('policies'))) {
          if (!c.policies.some((x) => x.id === k)) throw new HttpError(400, `There is no policy “${k}”.`)
          if (typeof v !== 'boolean' && typeof v !== 'number') throw new HttpError(400, `${k} must be true, false or a number.`)
          adjustments.push({ policy: k, to: v })
          targets.push(`policy:${k}`)
          parts.push(`${k} ${v}`)
        }
        const censusChange: Partial<CensusBase> = {}
        for (const [k, v] of Object.entries(map('census'))) {
          if (!CENSUS_FIELDS.includes(k as keyof CensusBase)) throw new HttpError(400, `The census base has ${CENSUS_FIELDS.join(', ')}; not “${k}”.`)
          const value = num(v, k)
          if (value < 0 || (k === 'taxRate' && value > 100)) throw new HttpError(400, `${k} is out of range.`)
          censusChange[k as keyof CensusBase] = value
          targets.push(`census:${k}`)
          parts.push(`${k} ${v}`)
        }
        if (!targets.length) throw new HttpError(400, 'Give at least one figure: indicators, factions, neighbours, policies or census.')
        return {
          detail: `Set ${parts.join(', ')}`,
          targets,
          apply: () => {
            if (adjustments.length) n.state = adjust(n.state, c, adjustments, { quiet: true })
            if (Object.keys(censusChange).length) n.gov = { ...n.gov, censusBase: { ...n.gov.censusBase, ...censusChange } }
          },
        }
      }
      case 'cheat_call_up': {
        const dilemma = str(args['dilemma'], 'dilemma')!
        const d = c.dilemmas.find((x) => x.id === dilemma)
        if (!d) throw new HttpError(404, `There is no dilemma “${dilemma}”. Try list_dilemmas.`)
        return {
          detail: `Called up ${dilemma} (${d.title})`,
          targets: ['agenda', `docket:${dilemma}`],
          apply: () => {
            n.state = callUp(n.state, c, dilemma, { quiet: true })
            if (n.gov.dockets[dilemma]?.status === 'decided') {
              const { [dilemma]: _gone, ...rest } = n.gov.dockets
              n.gov = { ...n.gov, dockets: rest }
            }
          },
        }
      }
      case 'cheat_start_crisis': {
        const situation = str(args['situation'], 'situation')!
        const s = c.situations.find((x) => x.id === situation)
        if (!s) throw new HttpError(404, `There is no crisis “${situation}”. Try list_situations.`)
        return { detail: `Started the crisis ${situation} (${s.title})`, targets: ['situation'], apply: () => void (n.state = startCrisis(n.state, c, situation, { quiet: true })) }
      }
      case 'cheat_skip_days': {
        const days = num(args['days'], 'days')
        if (!Number.isSafeInteger(days) || days < 1 || days > 60) throw new HttpError(400, 'days must be a whole number from 1 to 60.')
        return {
          detail: `Skipped ${days} day${days === 1 ? '' : 's'}, from day ${n.state.day}`,
          targets: ['nation'],
          apply: () => {
            this.game.dockets.cancel(n.id)
            for (let i = 0; i < days; i++) {
              n.state = endDay(n.state, c)
              n.history = withDayEnd(n.history, n.state)
            }
            n.gov = { ...n.gov, dockets: {}, lastWorldDay: Math.max(n.gov.lastWorldDay, n.state.day - 1) }
            n.today = { day: n.state.day, decisions: [] }
          },
        }
      }
      case 'cheat_force_outcome':
        return this.forceOutcome(n, args)
      case 'cheat_decide': {
        const dilemma = str(args['dilemma'], 'dilemma')!
        const course = str(args['course'], 'course')!
        const text = str(args['text'], 'text', { optional: true, max: 100 })
        if (!this.game.onAgenda(n, dilemma)) throw new HttpError(409, `${dilemma} is not on today’s desk. Call it up first.`)
        const d = c.dilemmas.find((x) => x.id === dilemma)!
        const option = d.options.find((o) => o.id === course)
        if (course !== DISMISS && !availableOptions(d.options, n.state).some((o) => o.id === course)) throw new HttpError(400, `“${course}” is not a course open on ${dilemma}.`)
        if (option?.custom && !text) throw new HttpError(400, `This course asks for a name (${option.custom.label}): give it as text.`)
        return {
          detail: `Decided ${dilemma}: ${course}${text ? ` (“${text}”)` : ''}`,
          targets: ['nation'],
          keep: [dilemma],
          apply: () => {
            const pre = n.state
            const { docket, fresh } = this.game.docketFor(n, dilemma)
            if (docket.status === 'decided') throw new HttpError(409, `Petition #${docket.number} is already decided.`)
            if (fresh) n.gov = fileDocket(n.gov, docket)
            const next = course === DISMISS ? dismiss(pre, c, dilemma, 'Dismissed.') : decide(pre, c, dilemma, course, text)
            const entry = next.timeline.at(-1)!
            const standing = docket.standing ?? standingOf(docket, n.gov.institutions, this.game.courses(n, dilemma, docket.number))
            const decided: Docket = { ...n.gov.dockets[dilemma]!, standing, status: 'decided', decision: { course, by: 'executive', reasons: 'Decided.', day: pre.day } }
            this.game.pushToday(n, decisionSummary(decided, entry, { state: pre, content: c }))
            n.gov = fileDocket(n.gov, decided)
            n.state = next
          },
        }
      }
      case 'cheat_world_event': {
        const headline = str(args['headline'], 'headline', { max: 300 })!
        const text = str(args['text'], 'text', { optional: true, max: 4000 })
        if (!Array.isArray(args['effects']) || args['effects'].length === 0 || args['effects'].length > 40) throw new HttpError(400, 'effects must be a list of one or more effects.')
        const effects: Effect[] = []
        const targets: string[] = []
        for (const e of args['effects']) {
          if (!isObject(e)) throw new HttpError(400, 'Each effect must be an object.')
          const why = typeof e['why'] === 'string' && e['why'] ? e['why'] : headline
          if (typeof e['indicator'] === 'string') {
            if (!INDICATORS.includes(e['indicator'] as never)) throw new HttpError(400, `There is no indicator “${e['indicator']}”.`)
            effects.push({ indicator: e['indicator'] as never, by: num(e['by'], 'by'), why })
            targets.push(`indicator:${e['indicator']}`)
          } else if (typeof e['faction'] === 'string') {
            if (!n.state.factions[e['faction']]) throw new HttpError(400, `There is no faction “${e['faction']}”.`)
            effects.push({ faction: e['faction'], by: num(e['by'], 'by'), why })
            targets.push(`faction:${e['faction']}`)
          } else if (typeof e['minister'] === 'string') {
            effects.push({ minister: e['minister'], by: num(e['by'], 'by'), why } as Effect)
            targets.push(`minister:${e['minister']}`)
          } else if (typeof e['policy'] === 'string') {
            if (!c.policies.some((p) => p.id === e['policy'])) throw new HttpError(400, `There is no policy “${e['policy']}”.`)
            if (typeof e['to'] !== 'boolean' && typeof e['to'] !== 'number') throw new HttpError(400, 'A policy effect needs `to`.')
            effects.push({ policy: e['policy'], to: e['to'] } as Effect)
            targets.push(`policy:${e['policy']}`)
          } else if (typeof e['flag'] === 'string') {
            effects.push({ flag: e['flag'], ...(typeof e['to'] === 'number' ? { to: e['to'] } : {}) } as Effect)
            targets.push(`flag:${e['flag']}`)
          } else throw new HttpError(400, 'An effect moves an indicator, a faction or a minister (with by), or sets a policy or a flag.')
        }
        return {
          detail: `World event: ${headline}`,
          targets,
          apply: () => void (n.state = applyExternal(n.state, c, 'event', headline, effects, text, { quiet: true })),
        }
      }
      case 'cheat_amend': {
        const amendment: Amendment = {}
        if (args['form'] !== undefined) {
          if (!FORM_IDS.includes(args['form'] as FormId)) throw new HttpError(400, `The form must be one of ${FORM_IDS.join(', ')}.`)
          amendment.form = args['form'] as FormId
        }
        if (args['rules'] !== undefined) {
          if (!isObject(args['rules'])) throw new HttpError(400, 'rules must be an object.')
          amendment.rules = args['rules'] as Amendment['rules']
        }
        if (args['articles'] !== undefined) {
          if (!Array.isArray(args['articles']) || !args['articles'].every((a) => isObject(a) && typeof a['number'] === 'string' && typeof a['title'] === 'string' && typeof a['text'] === 'string')) {
            throw new HttpError(400, 'articles must be a list of { number, title, text }.')
          }
          amendment.articles = args['articles'] as Amendment['articles']
        }
        if (args['rights'] !== undefined) {
          if (!isObject(args['rights'])) throw new HttpError(400, 'rights must be { add?, remove? }.')
          amendment.rights = args['rights'] as Amendment['rights']
        }
        if (!Object.keys(amendment).length) throw new HttpError(400, 'Give form, rules, articles or rights.')
        return {
          detail: `Amended the constitution: ${Object.keys(amendment).join(', ')}${amendment.form ? ` (form ${amendment.form})` : ''}`,
          targets: ['institutions'],
          apply: () => void (n.gov = { ...n.gov, institutions: amend(n.gov.institutions, amendment, n.state.day) }),
        }
      }
      case 'cheat_identity': {
        const fields = Object.fromEntries(Object.entries(args).filter(([k]) => !['request', 'nation'].includes(k)))
        if (!Object.keys(fields).length) throw new HttpError(400, 'Give the fields to change: name, capital, currency, demonym, leaderTitle, animal, motto, faith or flag.')
        const identity = readIdentity({ ...n.state.identity, ...fields })
        return { detail: `Identity: ${Object.keys(fields).join(', ')}`, targets: ['identity'], apply: () => void (n.state = { ...n.state, identity }) }
      }
      case 'cheat_world': {
        const cheat = readWorldCheat(args)
        // A war with or a peace for the player moves their own figures too: everything it could
        // touch is snapshotted, so the undo is exact.
        const targets = ['world', ...c.neighbours.map((x) => `neighbour:${x.id}`), ...INDICATORS.map((i) => `indicator:${i}`), 'flag:war_lost', 'agenda']
        let detail = ''
        return {
          // Read after the cheat is applied, so the log says what actually happened.
          get detail() {
            return detail || 'The world changed'
          },
          targets,
          apply: () => {
            const before = n.state.timeline.length
            try {
              n.state = worldCheat(n.state, c, cheat, { quiet: true })
            } catch (error) {
              throw new HttpError(400, (error as Error).message)
            }
            detail = n.state.timeline.slice(before).map((e) => e.headline).join('; ')
          },
          result: () => ({ what: detail || 'Done.', world: worldLines(n.state, c) }),
        }
      }
      default:
        throw new HttpError(404, `There is no Director tool “${tool}”.`)
    }
  }

  // Sets a petition's sitting or rulings as though the bodies had decided so. The rules
  // then read the new votes as they would any others.
  private forceOutcome(n: Nation, args: Record<string, unknown>): Plan {
    const dilemma = str(args['dilemma'], 'dilemma')!
    const docket = n.gov.dockets[dilemma]
    if (!docket || docket.status === 'decided') throw new HttpError(409, `There is no open docket for ${dilemma}. Convene it first.`)
    const inst = n.gov.institutions
    const rules = inst.constitution.rules
    const courses = this.game.courses(n, dilemma, docket.number)
    if (args['sitting'] === undefined && args['rulings'] === undefined) throw new HttpError(400, 'Give sitting, rulings, or both.')
    let next: Docket = structuredClone(docket)
    const parts: string[] = []
    if (args['sitting'] !== undefined) {
      const s = args['sitting']
      if (!isObject(s)) throw new HttpError(400, 'sitting must be { firstPreference? or ladder?, aye, no, abstain }.')
      const step = rules.steps.find((x) => x.role === 'recommend')
      if (!step) throw new HttpError(409, 'This government has no body that recommends.')
      const body = inst.bodies.find((b) => b.id === step.body)!
      let ladder: string[]
      if (Array.isArray(s['ladder'])) ladder = s['ladder'].map(String)
      else {
        const fp = str(s['firstPreference'], 'sitting.firstPreference')!
        ladder = [fp, ...courses.filter((x) => x !== fp)]
      }
      if (!ladder.every((x) => courses.includes(x)) || !ladder.length) throw new HttpError(400, `The ladder may hold only ${courses.join(', ')}.`)
      const division = { aye: num(s['aye'], 'aye'), no: num(s['no'], 'no'), abstain: num(s['abstain'] ?? 0, 'abstain'), byParty: {} }
      if (division.aye + division.no + division.abstain !== body.size) throw new HttpError(400, `The division must add up to ${body.size}, the seats of ${body.name}.`)
      const sitting: Sitting = { body: body.id, kind: 'first', ladder, firstPreference: ladder[0]!, division, carried: carried(division, step, body.size), binding: binding(division, step, body.size), document: '', ai: false }
      next = { ...next, sittings: [...next.sittings.filter((x) => x.body !== body.id), sitting] }
      parts.push(`${body.shortName} put ${ladder[0]} first, ${division.aye}-${division.no}-${division.abstain}`)
    }
    if (args['rulings'] !== undefined) {
      const r = args['rulings']
      if (!isObject(r)) throw new HttpError(400, 'rulings must be an object of course to "permitted" or "barred".')
      const step = rules.steps.find((x) => x.role === 'review')
      if (!step) throw new HttpError(409, 'This government has no body that reviews.')
      const body = inst.bodies.find((b) => b.id === step.body)!
      const barVotes = step.barVotes ?? Math.floor(body.size / 2) + 1
      const last = next.reviews.filter((x) => x.body === body.id).at(-1)
      const rulings: Ruling[] = courses.map((course) => {
        const was = last?.rulings.find((x) => x.course === course)
        return was ?? { course, votes: Object.fromEntries(body.members.map((m) => [m.id, 'permit' as const])), verdict: 'permitted', articles: [], markers: [] }
      })
      for (const [course, want] of Object.entries(r)) {
        if (!courses.includes(course)) throw new HttpError(400, `“${course}” is not a course of ${dilemma}.`)
        if (want !== 'permitted' && want !== 'barred') throw new HttpError(400, 'Each ruling is "permitted" or "barred".')
        const ruling = rulings.find((x) => x.course === course)!
        const ids = body.members.map((m) => m.id)
        const votes = Object.fromEntries(ids.map((m, i) => [m, want === 'barred' ? (i < barVotes ? 'bar' : 'permit') : 'permit'] as const))
        ruling.votes = votes
        ruling.verdict = verdictOf(votes, barVotes)
        parts.push(`${course} ${want}`)
      }
      next = { ...next, reviews: [...next.reviews.filter((x) => x.body !== body.id), { body: body.id, kind: 'first', rulings, binding: step.binding !== false, cautions: [], directions: [], document: '', ai: false }] }
    }
    const { error: _e, ...rest } = next
    const forced: Docket = { ...rest, status: 'ready' }
    forced.standing = standingOf(forced, inst, courses)
    return {
      detail: `Forced Petition #${docket.number} (${dilemma}): ${parts.join('; ')}`,
      targets: [`docket:${dilemma}`],
      keep: [dilemma],
      apply: () => void (n.gov = fileDocket(n.gov, forced)),
      result: () => ({ standing: forced.standing }),
    }
  }

  // Puts back the figures from one cheat, and logs that too.
  async undo(id: string, number: number, request = '') {
    const n0 = this.open(id)
    const log = OocLog.of(n0.dir)
    const e = log.get(number)
    if (!e) throw new HttpError(404, `There is no entry ${number} in the OOC log.`)
    if (e.undoes !== undefined) throw new HttpError(409, `Entry ${number} is itself an undo. Make the change again instead.`)
    if (e.undone) throw new HttpError(409, `Cheat ${number} has already been undone.`)
    if (!e.changes?.length) throw new HttpError(409, `Entry ${number} changed nothing that can be put back.`)
    const changes = e.changes
    const r = await this.run(
      id,
      'undo',
      request,
      (n) => ({
        detail: `Undid #${number}: ${e.detail}`,
        targets: changes.map((c) => c.target),
        apply: () => {
          // The badge last, so a whole-nation restore cannot put it back over the rule below.
          const ordered = [...changes.filter((c) => c.target !== 'sandbox').reverse(), ...changes.filter((c) => c.target === 'sandbox')]
          for (const c of ordered) {
            if (c.target === 'sandbox' && c.from === undefined) {
              // The badge stays while any other cheat still stands.
              const others = OocLog.of(n.dir).all().filter((x) => x.n !== number && x.undoes === undefined && !x.undone && x.action.startsWith('cheat_'))
              if (others.length) {
                write(n, 'sandbox', true)
                continue
              }
            }
            write(n, c.target, c.from)
          }
        },
      }),
      number,
    )
    return { entry: r.entry, ...r.payload }
  }
}

