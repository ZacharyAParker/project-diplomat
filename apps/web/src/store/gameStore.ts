import {
  adjust,
  callUp,
  startCrisis,
  type Adjustment,
  decide,
  decideSituation,
  endDay,
  newNation,
  type Content,
  type GameState,
  type Identity,
  type TimelineEntry,
} from '@diplomat/engine'
import {
  encode,
  exportName,
  importSave,
  listNations,
  newNationSave,
  openNation,
  randomId,
  randomSeed,
  rawText,
  removeNation,
  storeNation,
  summarise,
  withDayEnd,
  type KeyValue,
  type Nation,
  type Snapshot,
  type Summary,
} from '../logic/saves.ts'

export interface Problem {
  id: string
  message: string
  // The stored text exactly as found, so it can be exported even though it cannot be played.
  raw: string
}

export interface GameModel {
  nations: Summary[]
  nation: Nation | null
  notice: string | null
  problem: Problem | null
  saveError: string | null
}

export interface Sources {
  id: () => string
  seed: () => number
  now: () => string
}

export interface GameStore {
  content: Content
  get(): GameModel
  subscribe(listener: () => void): () => void
  open(id: string): boolean
  close(): void
  found(identity: Identity, answers: Record<string, string>): string
  // text names the thing, for an option that asks the player to.
  decide(dilemmaId: string, optionId: string, text?: string): TimelineEntry
  decideSituation(optionId: string): TimelineEntry
  endDay(): TimelineEntry[]
  // The sandbox. Each marks the nation as sandboxed, apart from skipping days, which is
  // only ending them without deciding anything.
  adjust(adjustments: readonly Adjustment[]): void
  callUp(dilemmaId: string): void
  startCrisis(situationId: string): void
  skipDays(days: number): void
  setIdentity(identity: Identity): void
  remove(id: string): void
  exportSave(id: string): { filename: string; text: string } | null
  importSave(
    text: string,
  ): { ok: true; id: string; name: string; notice?: string } | { ok: false; problem: string }
  dismissNotice(): void
}

const DEFAULT_SOURCES: Sources = { id: randomId, seed: randomSeed, now: () => new Date().toISOString() }

// Everything that changes a nation goes through here: the engine works out the new
// state, it is written to storage, and only then do the screens hear about it.
export function createGameStore(
  kv: KeyValue,
  content: Content,
  sources: Sources = DEFAULT_SOURCES,
): GameStore {
  let model: GameModel = {
    nations: listNations(kv, content),
    nation: null,
    notice: null,
    problem: null,
    saveError: null,
  }
  const listeners = new Set<() => void>()

  function set(next: Partial<GameModel>) {
    model = { ...model, ...next }
    for (const listener of listeners) listener()
  }

  function playing(): Nation {
    if (!model.nation) throw new Error('no nation is open')
    return model.nation
  }

  function commit(state: GameState, history: Snapshot[] = playing().history) {
    const nation: Nation = { ...playing(), state, history, updatedAt: sources.now() }
    const saveError = storeNation(kv, nation, content)
    const others = model.nations.filter((s) => s.id !== nation.id)
    set({ nation, saveError, nations: [summarise(nation, content), ...others] })
  }

  return {
    content,
    get: () => model,

    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },

    open(id) {
      if (model.nation?.id === id) return true
      const opened = openNation(kv, id, content)
      if (!opened.ok) {
        set({ nation: null, notice: null, problem: { id, message: opened.problem, raw: opened.raw } })
        return false
      }
      set({ nation: opened.nation, notice: opened.notice ?? null, problem: null, saveError: null })
      // Adopting the current pack version means the notice about it is shown once, not on every visit.
      if (opened.nation.state.pack.version !== content.pack.version) {
        commit({ ...opened.nation.state, pack: { id: content.pack.id, version: content.pack.version } })
      }
      return true
    },

    close() {
      set({ nation: null, notice: null, problem: null, saveError: null })
    },

    found(identity, answers) {
      const state = newNation(content, identity, sources.seed(), answers)
      const taken = model.nations.map((s) => s.id)
      let id = sources.id()
      while (taken.includes(id)) id = sources.id()
      const nation = newNationSave(state, id, sources.now())
      set({ nation, notice: null, problem: null })
      commit(state)
      return id
    },

    decide(dilemmaId, optionId, text) {
      const next = decide(playing().state, content, dilemmaId, optionId, text)
      commit(next)
      return next.timeline[next.timeline.length - 1]!
    },

    decideSituation(optionId) {
      const next = decideSituation(playing().state, content, optionId)
      commit(next)
      return next.timeline[next.timeline.length - 1]!
    },

    endDay() {
      const before = playing()
      const next = endDay(before.state, content)
      commit(next, withDayEnd(before.history, next))
      return next.timeline.slice(before.state.timeline.length)
    },

    adjust(adjustments) {
      commit(adjust(playing().state, content, adjustments))
    },

    callUp(dilemmaId) {
      commit(callUp(playing().state, content, dilemmaId))
    },

    startCrisis(situationId) {
      commit(startCrisis(playing().state, content, situationId))
    },

    skipDays(days) {
      let { state, history } = playing()
      for (let i = 0; i < days; i++) {
        state = endDay(state, content)
        history = withDayEnd(history, state)
      }
      commit(state, history)
    },

    setIdentity(identity) {
      commit({ ...playing().state, identity: structuredClone(identity) })
    },

    remove(id) {
      removeNation(kv, id)
      const nations = model.nations.filter((s) => s.id !== id)
      if (model.nation?.id === id || model.problem?.id === id) {
        set({ nations, nation: null, notice: null, problem: null, saveError: null })
      } else {
        set({ nations })
      }
    },

    // The open nation is exported from memory, so a nation that could not be written
    // to storage can still be taken away as a file.
    exportSave(id) {
      if (model.nation?.id === id) {
        const { state } = model.nation
        return { filename: exportName(state.identity.name, state.day), text: encode(model.nation) }
      }
      const text = rawText(kv, id)
      if (text === null) return null
      const summary = model.nations.find((s) => s.id === id)
      const readable = summary && !summary.problem
      return {
        filename: readable ? exportName(summary.name, summary.day) : `unreadable-save-${id}.json`,
        text,
      }
    },

    importSave(text) {
      const opened = importSave(kv, text, content, sources.id)
      if (!opened.ok) return { ok: false, problem: opened.problem }
      set({ nations: listNations(kv, content) })
      const { id, state } = opened.nation
      return { ok: true, id, name: state.identity.name, ...(opened.notice ? { notice: opened.notice } : {}) }
    },

    dismissNotice() {
      set({ notice: null })
    },
  }
}
