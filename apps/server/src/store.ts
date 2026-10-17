// The nations on disk. Each is a folder under data/nations/<id>: save.json (the engine's
// state, the history the charts are drawn from, and the government, rewritten atomically)
// and archive/ (one file per document). A nation once opened stays in memory; every action
// on it runs under that nation's lock, one at a time.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  agendaItems,
  classify,
  deserialize,
  serialize,
  support,
  INDICATORS,
  type Content,
  type GameState,
  type IndicatorId,
} from '@diplomat/engine'
import {
  checkGovernment,
  parseDocument,
  problemsOf,
  serializeDocument,
  slug,
  type ArchiveDocument,
  type GovernmentState,
  type SaveFile2,
  type TaskInput,
} from '@diplomat/government'
import { Archive, writeAtomic } from './archive.ts'
import { HttpError } from './http.ts'

export interface Snapshot {
  day: number
  indicators: Record<IndicatorId, number>
  support: number
  factions: Record<string, number>
}

export type TodayDecision = TaskInput['world.day']['decisions'][number]

export interface Nation {
  id: string
  dir: string
  createdAt: string
  updatedAt: string
  state: GameState
  history: Snapshot[]
  gov: GovernmentState
  // What was decided today, as the world will be told it in the evening. Kept in save.json
  // beside the contract's fields, so a restart in the middle of a day loses nothing.
  today: { day: number; decisions: TodayDecision[] }
  archive: Archive
}

// save.json as written: the contract's SaveFile2 and the server's own note of the day.
export interface SaveOnDisk extends SaveFile2 {
  today?: Nation['today']
}

// What the home screen lists. The 0.5 summary, with the form and the mode.
export interface Summary {
  id: string
  name: string
  flag: { layout: string; colours: string[] }
  className: string
  day: number
  support: number
  updatedAt: string
  sandbox?: boolean
  problem?: string
  form?: string
  mode?: string
}

export const ID = /^[a-z0-9][a-z0-9-]{0,63}$/

export function snapshot(state: GameState, day: number): Snapshot {
  return {
    day,
    indicators: { ...state.indicators },
    support: support(state),
    factions: Object.fromEntries(Object.entries(state.factions).map(([id, f]) => [id, f.approval])),
  }
}

// state is the morning after: the day that ended is the one before.
export function withDayEnd(history: readonly Snapshot[], state: GameState): Snapshot[] {
  const ended = state.day - 1
  return [...history.filter((s) => s.day !== ended), snapshot(state, ended)]
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isScore = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 100

export function isSnapshot(value: unknown): value is Snapshot {
  if (!isObject(value)) return false
  const { day, indicators, factions } = value
  if (!Number.isSafeInteger(day) || (day as number) < 0 || !isScore(value['support'])) return false
  if (!isObject(indicators) || !INDICATORS.every((id) => isScore(indicators[id]))) return false
  return isObject(factions) && Object.values(factions).every(isScore)
}

const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? '' : '.'}`

// The engine's state, checked against the pack it must be played with.
export function readState(text: string, content: Content): GameState {
  let state: GameState
  try {
    state = deserialize(text)
  } catch (error) {
    throw new Error(sentence((error as Error).message))
  }
  if (state.pack.id !== content.pack.id) {
    throw new Error(`This nation was founded with the pack "${state.pack.id}". This server runs "${content.pack.id}", so it cannot be opened here.`)
  }
  try {
    agendaItems(state, content)
    classify(state, content)
  } catch (error) {
    throw new Error(`This save does not fit the pack it names (${(error as Error).message}).`)
  }
  return state
}

export function readGovernment(value: unknown): GovernmentState {
  if (!checkGovernment(value)) throw new Error(`The government in this save cannot be read: ${problemsOf(value).slice(0, 4).join('; ')}.`)
  return value
}

// A save.json, or the save inside an export.
export function readSave(raw: unknown, content: Content): Omit<Nation, 'dir' | 'archive'> {
  if (!isObject(raw) || raw['format'] !== 2) throw new Error('This is not a 0.6 save: its format is not 2.')
  for (const part of ['id', 'createdAt', 'updatedAt', 'state'] as const) {
    if (typeof raw[part] !== 'string' || raw[part] === '') throw new Error(`This save is damaged: its ${part} is missing.`)
  }
  const state = readState(raw['state'] as string, content)
  const gov = readGovernment(raw['government'])
  const history = Array.isArray(raw['history']) && raw['history'].every(isSnapshot) ? (raw['history'] as Snapshot[]) : []
  const today = isObject(raw['today']) && Number.isSafeInteger(raw['today']['day']) && Array.isArray(raw['today']['decisions']) ? (raw['today'] as Nation['today']) : { day: state.day, decisions: [] }
  return { id: raw['id'] as string, createdAt: raw['createdAt'] as string, updatedAt: raw['updatedAt'] as string, state, history, gov, today }
}

export function toSave(n: Nation): SaveOnDisk {
  return { format: 2, id: n.id, createdAt: n.createdAt, updatedAt: n.updatedAt, state: serialize(n.state), history: n.history, government: n.gov, today: n.today }
}

// A document from an import, checked by writing it out and reading it back.
export function readDocument(value: unknown, at: number): ArchiveDocument {
  if (!isObject(value)) throw new Error(`Document ${at + 1} in the file is not an object.`)
  let text: string
  try {
    text = serializeDocument(value as unknown as ArchiveDocument)
  } catch {
    throw new Error(`Document ${at + 1} in the file is damaged.`)
  }
  const back = parseDocument(text)
  if (!back.ok) throw new Error(`Document ${String(value['id'] ?? at + 1)} cannot be read: ${back.problem}.`)
  return back.document
}

export class Store {
  readonly data: string
  readonly nationsDir: string
  readonly trashDir: string
  private content: Content
  private cache = new Map<string, Nation>()
  private locks = new Map<string, Promise<unknown>>()

  constructor(data: string, content: Content) {
    this.data = data
    this.nationsDir = join(data, 'nations')
    this.trashDir = join(data, 'trash')
    this.content = content
  }

  dirOf(id: string) {
    if (!ID.test(id)) throw new HttpError(400, 'A nation id is lower-case letters, digits and hyphens.')
    return join(this.nationsDir, id)
  }

  ids(): string[] {
    if (!existsSync(this.nationsDir)) return []
    return readdirSync(this.nationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && ID.test(d.name) && existsSync(join(this.nationsDir, d.name, 'save.json')))
      .map((d) => d.name)
  }

  exists(id: string) {
    return this.cache.has(id) || (ID.test(id) && existsSync(join(this.nationsDir, id, 'save.json')))
  }

  summary(n: Pick<Nation, 'id' | 'state' | 'updatedAt' | 'gov'>): Summary {
    const { state } = n
    return {
      id: n.id,
      name: state.identity.name,
      flag: state.identity.flag,
      className: classify(state, this.content).name,
      day: state.day,
      support: support(state),
      updatedAt: n.updatedAt,
      ...(state.sandbox ? { sandbox: true } : {}),
      form: n.gov.institutions.constitution.form,
      mode: n.gov.mode,
    }
  }

  list(): Summary[] {
    const out: Summary[] = []
    for (const id of this.ids()) {
      const cached = this.cache.get(id)
      if (cached) {
        out.push(this.summary(cached))
        continue
      }
      try {
        const raw: unknown = JSON.parse(readFileSync(join(this.nationsDir, id, 'save.json'), 'utf8'))
        out.push(this.summary(readSave(raw, this.content)))
      } catch (error) {
        out.push({ id, name: 'A save that cannot be read', flag: { layout: 'plain', colours: [] }, className: '', day: 0, support: 0, updatedAt: '', problem: (error as Error).message })
      }
    }
    return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
  }

  // Opens a nation: its save, and its archive's index.
  open(id: string): Nation {
    const cached = this.cache.get(id)
    if (cached) return cached
    const dir = this.dirOf(id)
    const file = join(dir, 'save.json')
    if (!existsSync(file)) throw new HttpError(404, `There is no nation “${id}”.`)
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      throw new HttpError(422, `The save of “${id}” is not valid JSON, so it cannot be opened. It is at ${file}.`)
    }
    let parts: Omit<Nation, 'dir' | 'archive'>
    try {
      parts = readSave(raw, this.content)
    } catch (error) {
      throw new HttpError(422, (error as Error).message)
    }
    const archive = new Archive(join(dir, 'archive'))
    archive.load()
    const nation: Nation = { ...parts, id, dir, archive }
    this.cache.set(id, nation)
    return nation
  }

  async save(n: Nation) {
    n.updatedAt = new Date().toISOString()
    await writeAtomic(join(n.dir, 'save.json'), JSON.stringify(toSave(n)))
  }

  // A new nation's folder, its documents and its save. Never overwrites.
  async create(parts: Omit<Nation, 'dir' | 'archive'>, documents: readonly ArchiveDocument[] = []): Promise<Nation> {
    const dir = this.dirOf(parts.id)
    if (this.exists(parts.id) || existsSync(dir)) throw new HttpError(409, `A nation “${parts.id}” already exists.`)
    await mkdir(join(dir, 'archive'), { recursive: true })
    const archive = new Archive(join(dir, 'archive'))
    await archive.writeExisting(documents)
    const nation: Nation = { ...parts, dir, archive }
    this.cache.set(nation.id, nation)
    await writeAtomic(join(dir, 'save.json'), JSON.stringify(toSave(nation)))
    return nation
  }

  // A fresh id from a name: its slug, with a number after it if that is taken.
  freshId(name: string): string {
    const base = (slug(name) || 'nation').slice(0, 56).replace(/-+$/, '') || 'nation'
    if (!this.exists(base) && !existsSync(join(this.nationsDir, base))) return base
    for (let i = 2; ; i++) {
      const id = `${base}-${i}`
      if (!this.exists(id) && !existsSync(join(this.nationsDir, id))) return id
    }
  }

  // Moves the folder to data/trash, never deletes it.
  async remove(id: string) {
    const dir = this.dirOf(id)
    if (!existsSync(dir)) throw new HttpError(404, `There is no nation “${id}”.`)
    await mkdir(this.trashDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    this.cache.delete(id)
    await rename(dir, join(this.trashDir, `${id}-${stamp}`))
  }

  forget(id: string) {
    this.cache.delete(id)
  }

  // Runs fn alone among this nation's actions.
  lock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const before = this.locks.get(id) ?? Promise.resolve()
    const run = before.then(fn, fn)
    const tail = run.catch(() => undefined)
    this.locks.set(id, tail)
    void tail.then(() => {
      if (this.locks.get(id) === tail) this.locks.delete(id)
    })
    return run
  }

  async discardFolder(dir: string) {
    await rm(dir, { recursive: true, force: true })
  }
}
