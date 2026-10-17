import type { Adjustment, Content, Identity, TimelineEntry } from '@diplomat/engine'
import type { CensusFigure, Factbook, GovernmentState, Mode, ProviderStatus } from '@diplomat/government'
import type {
  AiSettings,
  AiSettingsChange,
  Api,
  ArchivePage,
  ArchiveQuery,
  Changed,
  DocumentPage,
  FactbookWrite,
  FoundRequest,
  LetterAction,
  NationPayload,
  QuestionAnswer,
  ServerStatus,
  WordRequest,
} from '../api.ts'
import { isActive } from '../logic/forms.ts'
import { anyActive, withDockets } from '../logic/docket.ts'
import { findLegacy, forgetLegacy, type LegacySave } from '../logic/legacy.ts'
import {
  MAX_IMPORT,
  SAVE_FORMAT,
  decode,
  exportName,
  summarise,
  type KeyValue,
  type Nation,
  type Summary,
} from '../logic/saves.ts'

export interface Problem {
  id: string
  message: string
}

export interface GameModel {
  nations: Summary[]
  // True once the server has been asked for the list, whatever it answered.
  loaded: boolean
  // Why the list could not be had: usually that the server is not running.
  offline: string | null
  nation: Nation | null
  government: GovernmentState | null
  census: CensusFigure[]
  notice: string | null
  problem: Problem | null
  status: ServerStatus | null
  statusError: string | null
  // Saves from 0.5 still in this browser's storage.
  legacy: LegacySave[]
}

export type ImportResult = { ok: true; id: string; name: string; notice?: string } | { ok: false; problem: string }

export interface MoveResult {
  moved: string[]
  failed: { name: string; problem: string }[]
}

export interface DecideExtra {
  text?: string
  veto?: string
  word?: string
}

export interface GameStore {
  content: Content
  // How often the desk asks after dockets that are sitting.
  pollMs: number
  get(): GameModel
  subscribe(listener: () => void): () => void

  start(): Promise<void>
  refreshNations(): Promise<void>
  loadStatus(): Promise<void>
  open(id: string): Promise<boolean>
  reload(): Promise<void>
  close(): void
  found(request: FoundRequest): Promise<string>

  // Every action below throws an Error whose message is the server's, ready to show.
  decide(dilemmaId: string, course: string, extra?: DecideExtra): Promise<TimelineEntry>
  decideSituation(optionId: string): Promise<TimelineEntry>
  endDay(): Promise<TimelineEntry[]>
  // Found mode: the executive decides every docket and the day is ended, up to a week.
  run(days: number): Promise<TimelineEntry[]>
  convene(dilemmaId: string): Promise<void>
  // Asks after the dockets. True while any is still being worked on.
  pollDockets(): Promise<boolean>

  adjust(adjustments: readonly Adjustment[]): Promise<void>
  callUp(dilemmaId: string): Promise<void>
  startCrisis(situationId: string): Promise<void>
  skipDays(days: number): Promise<void>
  setIdentity(identity: Identity): Promise<void>
  setMode(mode: Mode): Promise<void>

  giveWord(request: WordRequest): Promise<void>
  answerQuestion(questionId: string, answer: QuestionAnswer): Promise<void>
  letter(letterId: string, action: LetterAction): Promise<void>
  moveBill(bill: { title: string; summary: string }): Promise<void>
  writeFactbook(factbook: FactbookWrite): Promise<void>
  editFactbook(factbookId: string, factbook: FactbookWrite): Promise<void>
  draftFactbook(request: {
    title: string
    category: Factbook['category']
    notes: string
  }): Promise<{ title: string; body: string }>
  archive(query: ArchiveQuery): Promise<ArchivePage>
  document(docId: string): Promise<DocumentPage>

  remove(id: string): Promise<void>
  exportSave(id: string): Promise<{ filename: string; text: string }>
  importSave(text: string): Promise<ImportResult>
  moveLegacy(): Promise<MoveResult>
  dismissNotice(): void

  aiSettings(): Promise<AiSettings>
  saveAiSettings(change: AiSettingsChange): Promise<AiSettings>
  testAi(): Promise<ProviderStatus>
}

export interface StoreOptions {
  // The browser's storage, looked at only for saves left there by 0.5.
  kv?: KeyValue
  pollMs?: number
}

const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

// Everything that changes a nation is a request to the server. The nation comes back in
// the reply, is checked against the pack the same way a save file is, and only then do the
// screens hear about it. The engine is still here, but only to read: forecasts, the
// agenda, the classification and support are worked out from the state the server sent.
export function createGameStore(api: Api, content: Content, options: StoreOptions = {}): GameStore {
  const { kv } = options
  let model: GameModel = {
    nations: [],
    loaded: false,
    offline: null,
    nation: null,
    government: null,
    census: [],
    notice: null,
    problem: null,
    status: null,
    statusError: null,
    legacy: findLegacy(kv),
  }
  const listeners = new Set<() => void>()
  const opening = new Map<string, Promise<boolean>>()

  function set(next: Partial<GameModel>) {
    model = { ...model, ...next }
    for (const listener of listeners) listener()
  }

  function playing(): Nation {
    if (!model.nation) throw new Error('no nation is open')
    return model.nation
  }

  // The same checks a save file gets: the state parses, the pack is this one, the agenda
  // and the classification can be worked out.
  function read(payload: NationPayload) {
    return decode(JSON.stringify({ format: SAVE_FORMAT, ...payload }), content, payload.id)
  }

  function summaryFor(nation: Nation): Summary[] {
    const old = model.nations.find((s) => s.id === nation.id)
    const fresh = { ...old, ...summarise(nation, content) }
    return [fresh, ...model.nations.filter((s) => s.id !== nation.id)]
  }

  // Lays a reply over the open nation. A reply for a nation that is no longer open (the
  // player moved on while it was on its way) only refreshes the home screen's line.
  function take(id: string, changed: Changed) {
    const next: Partial<GameModel> = {}
    const current = model.nation?.id === id
    if (changed.nation) {
      const opened = read(changed.nation)
      if (!opened.ok) throw new Error(opened.problem)
      opened.nation.id = id
      next.nations = summaryFor(opened.nation)
      if (current) next.nation = opened.nation
    }
    if (current && changed.government) next.government = changed.government
    if (current && changed.census) next.census = changed.census
    set(next)
  }

  async function act(call: (id: string) => Promise<Changed>): Promise<void> {
    const id = playing().id
    take(id, await call(id))
  }

  function newest(before: number): TimelineEntry {
    const timeline = playing().state.timeline
    return timeline[Math.min(before, timeline.length - 1)]!
  }

  async function reload() {
    const nation = model.nation
    if (!nation) return
    take(nation.id, await api.nation(nation.id))
  }

  function fail(id: string, message: string) {
    set({ nation: null, government: null, census: [], notice: null, problem: { id, message } })
    return false
  }

  async function open(id: string): Promise<boolean> {
    if (model.nation?.id === id) return true
    const already = opening.get(id)
    if (already) return already
    const attempt = (async () => {
      try {
        const reply = await api.nation(id)
        const opened = read(reply.nation)
        if (!opened.ok) return fail(id, opened.problem)
        opened.nation.id = id
        set({
          nation: opened.nation,
          government: reply.government ?? null,
          census: reply.census ?? [],
          notice: opened.notice ?? null,
          problem: null,
          nations: summaryFor(opened.nation),
        })
        return true
      } catch (error) {
        return fail(id, messageOf(error, 'The nation could not be opened.'))
      } finally {
        opening.delete(id)
      }
    })()
    opening.set(id, attempt)
    return attempt
  }

  async function refreshNations() {
    try {
      const nations = await api.nations()
      set({ nations, loaded: true, offline: null })
    } catch (error) {
      set({ loaded: true, offline: messageOf(error, 'The nations could not be listed.') })
    }
  }

  async function loadStatus() {
    try {
      set({ status: await api.status(), statusError: null })
    } catch (error) {
      set({ status: null, statusError: messageOf(error, 'The server did not say how it is.') })
    }
  }

  async function importSave(text: string): Promise<ImportResult> {
    if (text.length > MAX_IMPORT) return { ok: false, problem: 'That file is too large to be a save from this game.' }
    try {
      const imported = await api.importSave(text)
      await refreshNations()
      const name = imported.name ?? model.nations.find((s) => s.id === imported.id)?.name ?? 'the nation'
      return { ok: true, id: imported.id, name, ...(imported.notice ? { notice: imported.notice } : {}) }
    } catch (error) {
      return { ok: false, problem: messageOf(error, 'The server would not take it.') }
    }
  }

  return {
    content,
    pollMs: options.pollMs ?? 2000,
    get: () => model,

    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },

    async start() {
      await Promise.all([refreshNations(), loadStatus()])
    },
    refreshNations,
    loadStatus,
    open,
    reload,

    close() {
      set({ nation: null, government: null, census: [], notice: null, problem: null })
    },

    async found(request) {
      const { id } = await api.found(request)
      await refreshNations()
      if (!(await open(id))) throw new Error(model.problem?.message ?? 'The new nation could not be opened.')
      return id
    },

    async decide(dilemmaId, course, extra = {}) {
      const id = playing().id
      const before = playing().state.timeline.length
      const reply = await api.decide(id, { dilemmaId, course, ...extra })
      take(id, reply)
      return reply.entry ?? newest(before)
    },

    async decideSituation(optionId) {
      const id = playing().id
      const before = playing().state.timeline.length
      const reply = await api.situation(id, optionId)
      take(id, reply)
      return reply.entry ?? newest(before)
    },

    async endDay() {
      const id = playing().id
      const before = playing().state.timeline.length
      const reply = await api.endDay(id)
      take(id, reply)
      return reply.entries ?? playing().state.timeline.slice(before)
    },

    async run(days) {
      const id = playing().id
      const before = playing().state.timeline.length
      const reply = await api.run(id, days)
      take(id, reply)
      return reply.entries ?? playing().state.timeline.slice(before)
    },

    convene: (dilemmaId) => act((id) => api.convene(id, dilemmaId)),

    async pollDockets() {
      const nation = model.nation
      if (!nation || !model.government) return false
      const dockets = await api.dockets(nation.id)
      const government = model.government
      if (model.nation?.id !== nation.id || !government) return false
      const before = government.dockets
      // A docket that was being worked on and is now decided, or has left the open list,
      // has changed the nation: the executive decided it in found mode.
      const finished =
        dockets.some((d) => d.status === 'decided' && before[d.dilemma]?.status !== 'decided') ||
        Object.values(before).some((d) => isActive(d.status) && !dockets.some((x) => x.dilemma === d.dilemma))
      set({ government: withDockets(government, dockets) })
      if (finished) await reload()
      return anyActive(model.government)
    },

    adjust: (adjustments) => act((id) => api.sandbox(id, { adjust: adjustments })),
    callUp: (dilemmaId) => act((id) => api.sandbox(id, { callUp: dilemmaId })),
    startCrisis: (situationId) => act((id) => api.sandbox(id, { crisis: situationId })),
    skipDays: (days) => act((id) => api.sandbox(id, { skip: days })),
    setIdentity: (identity) => act((id) => api.identity(id, identity)),
    setMode: (mode) => act((id) => api.mode(id, mode)),

    giveWord: (request) => act((id) => api.word(id, request)),
    answerQuestion: (questionId, answer) => act((id) => api.question(id, questionId, answer)),
    letter: (letterId, action) => act((id) => api.letter(id, letterId, action)),
    moveBill: (bill) => act((id) => api.moveBill(id, bill)),
    writeFactbook: (factbook) => act((id) => api.writeFactbook(id, factbook)),
    editFactbook: (factbookId, factbook) => act((id) => api.editFactbook(id, factbookId, factbook)),
    draftFactbook: (request) => api.draftFactbook(playing().id, request),
    archive: (query) => api.archive(playing().id, query),
    document: (docId) => api.document(playing().id, docId),

    async remove(id) {
      await api.remove(id)
      const nations = model.nations.filter((s) => s.id !== id)
      if (model.nation?.id === id || model.problem?.id === id) {
        set({ nations, nation: null, government: null, census: [], notice: null, problem: null })
      } else {
        set({ nations })
      }
    },

    async exportSave(id) {
      const text = await api.exportNation(id)
      const nation = model.nation?.id === id ? model.nation : null
      const summary = model.nations.find((s) => s.id === id)
      const filename = nation
        ? exportName(nation.state.identity.name, nation.state.day)
        : summary && !summary.problem
          ? exportName(summary.name, summary.day)
          : `unreadable-save-${id}.json`
      return { filename, text }
    },

    importSave,

    async moveLegacy() {
      const result: MoveResult = { moved: [], failed: [] }
      for (const save of findLegacy(kv)) {
        try {
          await api.importSave(save.text)
          if (kv) forgetLegacy(kv, save.id)
          result.moved.push(save.name)
        } catch (error) {
          result.failed.push({ name: save.name, problem: messageOf(error, 'The server would not take it.') })
        }
      }
      set({ legacy: findLegacy(kv) })
      await refreshNations()
      return result
    },

    dismissNotice() {
      set({ notice: null })
    },

    aiSettings: () => api.settings(),
    async saveAiSettings(change) {
      const saved = await api.saveSettings(change)
      await loadStatus()
      return saved
    },
    async testAi() {
      const status = await api.testSettings()
      await loadStatus()
      return status
    },
  }
}
