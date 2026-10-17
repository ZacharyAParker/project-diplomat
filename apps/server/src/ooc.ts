// Out of character: data/nations/<id>/ooc/, a sibling of archive/ and never inside it, so no
// branch agent (confined to archive/) can ever read it. It holds the OOC log of cheats
// (log.jsonl), each branch's Claude Code session (sessions.json) and the Director's own
// session and transcript (director.json, director-transcript.jsonl).

import { existsSync, readFileSync } from 'node:fs'
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { electionTerm, type GameState } from '@diplomat/engine'
import type { BranchSession } from '@diplomat/ai'
import { guard, writeAtomic } from './archive.ts'

export const oocDir = (nationDir: string) => join(nationDir, 'ooc')

// ---------------------------------------------------------------------------------------
// The OOC log
// ---------------------------------------------------------------------------------------

export interface OocChange {
  target: string
  from: unknown
  to: unknown
}

export interface OocEntry {
  n: number
  at: string
  day: number
  action: string
  detail: string
  request: string
  changes?: OocChange[]
  // Worked out when the log is read: true once a later undo entry names this one.
  undone?: boolean
  undoes?: number
}

const logs = new Map<string, OocLog>()

export class OocLog {
  readonly file: string
  private entries: OocEntry[] | null = null

  constructor(nationDir: string) {
    this.file = join(oocDir(nationDir), 'log.jsonl')
  }

  static of(nationDir: string): OocLog {
    let log = logs.get(nationDir)
    if (!log) logs.set(nationDir, (log = new OocLog(nationDir)))
    return log
  }

  private load(): OocEntry[] {
    if (this.entries) return this.entries
    const out: OocEntry[] = []
    if (existsSync(this.file)) {
      for (const line of readFileSync(this.file, 'utf8').split('\n')) {
        if (!line.trim()) continue
        try {
          out.push(JSON.parse(line) as OocEntry)
        } catch {
          // A torn last line from a crash: skipped, never rewritten.
        }
      }
    }
    this.entries = out
    return out
  }

  // Oldest first, as written, with undone worked out.
  all(): OocEntry[] {
    const list = this.load()
    const undone = new Set(list.filter((e) => e.undoes !== undefined).map((e) => e.undoes))
    return list.map((e) => (undone.has(e.n) ? { ...structuredClone(e), undone: true } : structuredClone(e)))
  }

  get(n: number): OocEntry | undefined {
    return this.all().find((e) => e.n === n)
  }

  async append(entry: Omit<OocEntry, 'n' | 'at'>): Promise<OocEntry> {
    const list = this.load()
    const full: OocEntry = { n: Math.max(0, ...list.map((e) => e.n)) + 1, at: new Date().toISOString(), ...entry }
    guard(this.file)
    list.push(full)
    await mkdir(join(this.file, '..'), { recursive: true })
    await appendFile(this.file, `${JSON.stringify(full)}\n`, 'utf8')
    return full
  }
}

// ---------------------------------------------------------------------------------------
// Branch sessions
// ---------------------------------------------------------------------------------------

export interface SessionEntry {
  id: string
  startedDay: number
  calls: number
  term: string
}

// A session is fresh after this many calls, whatever else.
export const MAX_CALLS = 12
// In a nation that holds no elections, a term is this many days.
export const TERM_WITHOUT_ELECTIONS = 30

// The term a day falls in: a new one with every election (or change of government), or
// every 30 days where there are no elections.
export function termOf(state: GameState): string {
  const elections = state.timeline.filter((e) => e.kind === 'election').length
  return electionTerm(state) > 0 ? `g${state.government}-e${elections}` : `g${state.government}-p${Math.floor((state.day - 1) / TERM_WITHOUT_ELECTIONS)}`
}

// Which branch a task belongs to: each body has its own conversation, as do the world and
// the executive. One-off work (a factbook draft, the founding) keeps none.
export function branchOf(task: string, input: unknown): string | null {
  const body = (input as { body?: { id?: unknown } } | null)?.body?.id
  switch (task) {
    case 'legislature.sitting':
    case 'court.opinion':
    case 'council.sitting':
    case 'ministry.advice':
    case 'exchange.reply':
    case 'bill.sitting':
      return typeof body === 'string' ? `body:${body}` : null
    case 'electorate.referendum':
      return 'electorate'
    case 'executive.decision':
      return 'executive'
    case 'world.day':
    case 'letters.draft':
      return 'world'
    default:
      return null
  }
}

const sessionStores = new Map<string, Sessions>()

export class Sessions {
  readonly file: string
  private data: Record<string, SessionEntry> | null = null
  private locks = new Map<string, Promise<unknown>>()

  constructor(nationDir: string) {
    this.file = join(oocDir(nationDir), 'sessions.json')
  }

  static of(nationDir: string): Sessions {
    let s = sessionStores.get(nationDir)
    if (!s) sessionStores.set(nationDir, (s = new Sessions(nationDir)))
    return s
  }

  private load(): Record<string, SessionEntry> {
    if (this.data) return this.data
    try {
      this.data = existsSync(this.file) ? (JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, SessionEntry>) : {}
    } catch {
      this.data = {}
    }
    return this.data
  }

  entries(): Record<string, SessionEntry> {
    return structuredClone(this.load())
  }

  // The session to resume for this branch, or none when it should start afresh: a new term,
  // or as many calls as a session gets. A stale entry is dropped.
  current(key: string, term: string): BranchSession | undefined {
    const data = this.load()
    const e = data[key]
    if (!e) return undefined
    if (e.term !== term || e.calls >= MAX_CALLS) {
      delete data[key]
      return undefined
    }
    return { id: e.id, resume: true }
  }

  // Always keeps the id the call actually used.
  async record(key: string, id: string, day: number, term: string) {
    const data = this.load()
    const e = data[key]
    data[key] = e && e.id === id ? { ...e, calls: e.calls + 1 } : { id, startedDay: day, calls: 1, term }
    await this.save()
  }

  // Every branch starts afresh: after a cheat, or an amendment.
  async reset() {
    this.data = {}
    await this.save()
  }

  private saving: Promise<unknown> = Promise.resolve()

  // One write at a time, each of the latest data, so a slow write never lands after a newer one.
  private save(): Promise<void> {
    const run = this.saving.then(() => writeAtomic(this.file, `${JSON.stringify(this.data ?? {}, null, 2)}\n`))
    this.saving = run.catch(() => undefined)
    return run
  }

  // One writer per session: calls to one branch run one after another.
  lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const before = this.locks.get(key) ?? Promise.resolve()
    const run = before.then(fn, fn)
    const tail = run.catch(() => undefined)
    this.locks.set(key, tail)
    void tail.then(() => {
      if (this.locks.get(key) === tail) this.locks.delete(key)
    })
    return run
  }
}
