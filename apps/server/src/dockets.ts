// The dockets: each petition that goes through the bodies is opened in the morning and sent
// to them at once, in the background, so the bodies sit while the player reads the paper.
// One docket sits at a time per nation (they append to the same series in the Archive).
// Progress lines are kept in memory and written to the docket as the bodies report; the
// finished docket is filed when the last of them has sat.

import { ownContent, type Content } from '@diplomat/engine'
import { fileDocket, openDocket, runDocket, type Context, type Docket } from '@diplomat/government'
import type { Ai } from './ai.ts'
import { contextFor } from './context.ts'
import type { SettingsStore } from './settings.ts'
import type { Nation, Store } from './store.ts'

const UNFINISHED: readonly Docket['status'][] = ['waiting', 'sitting', 'reconciling', 'exchanging', 'deciding']

export class Dockets {
  private store: Store
  private ai: Ai
  private content: Content
  private settings: SettingsStore
  private queues = new Map<string, Promise<void>>()
  private live = new Map<string, Map<string, string[]>>()
  private generations = new Map<string, number>()
  // One per nation and generation: cancel aborts it, so model calls in flight stop at once
  // instead of holding the queue until they finish.
  private aborts = new Map<string, AbortController>()
  log: (line: string) => void = () => {}
  // Called when a docket is ready: in found mode the executive decides it at once.
  onReady: ((id: string, dilemma: string) => Promise<void>) | null = null

  constructor(store: Store, ai: Ai, content: Content, settings: SettingsStore) {
    this.store = store
    this.ai = ai
    this.content = content
    this.settings = settings
  }

  generation(id: string) {
    return this.generations.get(id) ?? 0
  }

  // Sets aside whatever is sitting for this nation: its day has ended, or it was deleted.
  cancel(id: string) {
    this.generations.set(id, this.generation(id) + 1)
    this.live.delete(id)
    this.aborts.get(id)?.abort()
    this.aborts.delete(id)
  }

  private signalFor(id: string): AbortSignal {
    let controller = this.aborts.get(id)
    if (!controller) {
      controller = new AbortController()
      this.aborts.set(id, controller)
    }
    return controller.signal
  }

  // Majors always go through the bodies; minors when the rules or the settings say so.
  throughBodies(n: Nation, dilemmaId: string): boolean {
    const dilemma = this.content.dilemmas.find((d) => d.id === dilemmaId)
    if (!dilemma) return false
    return dilemma.kind === 'major' || n.gov.institutions.constitution.rules.minorsThroughBodies || this.settings.get().minorsThroughBodies
  }

  agendaOf(n: Nation): string[] {
    const a = n.state.agenda
    return a.major === null ? [...a.minors] : [a.major, ...a.minors]
  }

  // Opens a docket for each petition on today's agenda that goes through the bodies and has
  // none yet. Changes n.gov; the caller saves. Returns the dilemmas opened.
  openFor(n: Nation): string[] {
    const opened: string[] = []
    for (const id of this.agendaOf(n)) {
      // Every petition gets a docket. The rules say which bodies sit on it: a minor that does
      // not go through the bodies still goes before the court, and with no court it is
      // ready at once.
      if (n.gov.dockets[id]) continue
      n.gov = fileDocket(n.gov, this.open(n, id))
      opened.push(id)
    }
    return opened
  }

  open(n: Nation, dilemmaId: string, number?: number): Docket {
    const docket = openDocket({ state: n.state, gov: n.gov, content: ownContent(n.state, this.content) } as Context, dilemmaId)
    return number === undefined ? docket : { ...docket, number }
  }

  // Sends dockets to the bodies, one after another.
  start(id: string, dilemmas: readonly string[]) {
    const gen = this.generation(id)
    for (const dilemma of dilemmas) {
      const before = this.queues.get(id) ?? Promise.resolve()
      const next = before
        .then(() => this.sit(id, dilemma, gen))
        .catch((error: unknown) => this.log(`docket ${id}/${dilemma}: ${(error as Error).stack ?? String(error)}`))
      this.queues.set(id, next)
      void next.then(() => {
        if (this.queues.get(id) === next) this.queues.delete(id)
      })
    }
  }

  // Resolves when nothing is sitting or waiting to sit for this nation.
  async idle(id: string) {
    for (;;) {
      const q = this.queues.get(id)
      if (!q) return
      await q
    }
  }

  busy(id: string) {
    return this.queues.has(id)
  }

  private lines(id: string, dilemma: string): string[] | undefined {
    return this.live.get(id)?.get(dilemma)
  }

  private async sit(id: string, dilemma: string, gen: number) {
    if (gen !== this.generation(id) || !this.store.exists(id)) return
    const n = this.store.open(id)
    let docket: Docket | undefined
    await this.store.lock(id, async () => {
      const d = n.gov.dockets[dilemma]
      if (gen !== this.generation(id) || !d || !(UNFINISHED.includes(d.status) || d.status === 'failed')) return
      if (d.day !== n.state.day) return
      const { error: _e, ...rest } = d
      docket = { ...rest, status: 'sitting' }
      n.gov = fileDocket(n.gov, docket)
      await this.store.save(n)
    })
    if (!docket) return
    const started = docket
    const lines: string[] = []
    const problems: string[] = []
    let byNation = this.live.get(id)
    if (!byNation) this.live.set(id, (byNation = new Map()))
    byNation.set(dilemma, lines)
    const current = () => {
      const d = n.gov.dockets[dilemma]
      return gen === this.generation(id) && d && d.number === started.number && d.status !== 'decided' && d.status !== 'ready' ? d : undefined
    }
    const progress = (line: string) => {
      lines.push(line)
      void this.store
        .lock(id, async () => {
          const d = current()
          if (!d) return
          n.gov = { ...n.gov, dockets: { ...n.gov.dockets, [dilemma]: { ...d, progress: [...lines] } } }
          await this.store.save(n)
        })
        .catch((error: unknown) => this.log(`progress ${id}/${dilemma}: ${(error as Error).message}`))
    }
    const ctx = contextFor(n, ownContent(n.state, this.content), this.ai, {
      minorsThroughBodies: this.settings.get().minorsThroughBodies,
      progress,
      onProblem: (line) => {
        problems.push(line)
        progress(line)
      },
      cancelled: () => gen !== this.generation(id),
      signal: this.signalFor(id),
    })
    const result = await runDocket(ctx, started)
    let filed = false
    await this.store.lock(id, async () => {
      byNation!.delete(dilemma)
      if (!current() || n.state.day !== started.day) return
      filed = result.status === 'ready'
      const last = lines.at(-1)
      const finished: Docket = {
        ...result,
        progress: [...result.progress, ...problems, ...(result.status === 'ready' && last && !result.progress.includes(last) ? [last] : [])],
      }
      n.gov = fileDocket(n.gov, finished)
      await this.store.save(n)
    })
    if (filed && this.onReady && gen === this.generation(id)) await this.onReady(id, dilemma)
  }

  // Every docket of the nation, with the lines of any still sitting.
  view(n: Nation): Docket[] {
    return Object.values(n.gov.dockets).filter((d) => d.status !== 'decided').map((d) => {
      const lines = this.lines(n.id, d.dilemma)
      return lines && UNFINISHED.includes(d.status) && d.status !== 'deciding' ? { ...structuredClone(d), progress: [...lines] } : structuredClone(d)
    })
  }

  // Found mode: the executive decides the day's dockets the bodies have finished, through
  // the nation's queue. For a restart, a switch into found mode, or an import.
  decideReady(id: string, n: Nation) {
    if (n.gov.mode !== 'found' || !this.onReady) return
    const ready = Object.values(n.gov.dockets).filter((d) => d.status === 'ready' && d.day === n.state.day).map((d) => d.dilemma)
    if (!ready.length) return
    const decide = this.onReady
    const before = this.queues.get(id) ?? Promise.resolve()
    const next = before
      .then(async () => {
        for (const dilemma of ready) await decide(id, dilemma)
      })
      .catch((error: unknown) => this.log(`decide ${id}: ${(error as Error).message}`))
    this.queues.set(id, next)
    void next.then(() => {
      if (this.queues.get(id) === next) this.queues.delete(id)
    })
  }

  // On start: dockets left sitting when the server stopped are sent back to the bodies.
  resumeAll() {
    for (const id of this.store.ids()) {
      try {
        const n = this.store.open(id)
        const left = Object.values(n.gov.dockets)
          .filter((d) => UNFINISHED.includes(d.status) && d.day === n.state.day)
          .map((d) => d.dilemma)
        // A nation that arrived by import, or was last saved before its morning was
        // convened, has petitions on the desk that no body has seen. Convene them now.
        const fresh = this.openFor(n)
        // In found mode, a docket filed ready just before the server stopped never reached
        // the executive. It decides now.
        this.decideReady(id, n)
        const send = () => this.start(id, [...left, ...fresh])
        if (fresh.length) {
          this.store.save(n).then(send, (error: unknown) => this.log(`resume ${id}: ${(error as Error).message}`))
        } else if (left.length) send()
      } catch (error) {
        this.log(`resume ${id}: ${(error as Error).message}`)
      }
    }
  }
}
