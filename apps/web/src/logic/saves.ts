import {
  INDICATORS,
  agendaItems,
  classify,
  deserialize,
  serialize,
  support,
  type Content,
  type GameState,
  type IndicatorId,
} from '@diplomat/engine'
import type { FlagSpec } from './flags.ts'

export const SAVE_FORMAT = 1
export const INDEX_KEY = 'diplomat:index'
const NATION_PREFIX = 'diplomat:nation:'

export const nationKey = (id: string) => `${NATION_PREFIX}${id}`

// The part of the Web Storage API this file uses, so the tests can hand it a plain map.
export interface KeyValue {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function memoryStore(initial: Record<string, string> = {}): KeyValue {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

// What the charts are drawn from: the nation as it stood when a day ended. Day 0 is the
// nation as founded, before anything was decided.
export interface Snapshot {
  day: number
  indicators: Record<IndicatorId, number>
  support: number
  factions: Record<string, number>
}

export interface SaveFile {
  format: number
  id: string
  createdAt: string
  updatedAt: string
  state: string
  history: Snapshot[]
}

export interface Nation {
  id: string
  createdAt: string
  updatedAt: string
  state: GameState
  history: Snapshot[]
}

// A line on the home screen. A save that cannot be read still gets one, with the reason.
export interface Summary {
  id: string
  name: string
  flag: FlagSpec
  className: string
  day: number
  support: number
  updatedAt: string
  problem?: string
  // True once the sandbox has changed it.
  sandbox?: boolean
}

export type Opened =
  { ok: true; nation: Nation; notice?: string } | { ok: false; id: string; problem: string; raw: string }

export function snapshot(state: GameState, day: number): Snapshot {
  return {
    day,
    indicators: { ...state.indicators },
    support: support(state),
    factions: Object.fromEntries(Object.entries(state.factions).map(([id, f]) => [id, f.approval])),
  }
}

export function newNationSave(state: GameState, id: string, now: string): Nation {
  return { id, createdAt: now, updatedAt: now, state, history: [snapshot(state, 0)] }
}

// Called with the state endDay returned, which is already on the next morning, so the
// day that ended is the one before. Ending the same day twice cannot happen, but a
// second snapshot for a day replaces the first all the same.
export function withDayEnd(history: readonly Snapshot[], state: GameState): Snapshot[] {
  const ended = state.day - 1
  return [...history.filter((s) => s.day !== ended), snapshot(state, ended)]
}

export function encode(nation: Nation): string {
  const file: SaveFile = {
    format: SAVE_FORMAT,
    id: nation.id,
    createdAt: nation.createdAt,
    updatedAt: nation.updatedAt,
    state: serialize(nation.state),
    history: nation.history,
  }
  return JSON.stringify(file)
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isScore = (value: unknown) => typeof value === 'number' && value >= 0 && value <= 100
const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''

function isSnapshot(value: unknown): value is Snapshot {
  if (!isObject(value)) return false
  const { day, indicators, factions } = value
  if (!Number.isSafeInteger(day) || (day as number) < 0 || !isScore(value['support'])) return false
  if (!isObject(indicators) || !INDICATORS.every((id) => isScore(indicators[id]))) return false
  return isObject(factions) && Object.values(factions).every(isScore)
}

const sentenceCase = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`

// Reads a save file from text that could be anything: a save, half a save, a holiday
// photo. It never throws. A failure carries the text back so it can still be exported.
export function decode(text: string, content: Content, knownId = ''): Opened {
  const fail = (problem: string, id = knownId): Opened => ({ ok: false, id, problem, raw: text })

  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    return fail('This is not a save file. It is not valid JSON.')
  }
  if (!isObject(file) || typeof file['format'] !== 'number') {
    return fail('This is not a save file. It has no format number.')
  }
  const id = isText(file['id']) ? file['id'] : knownId
  if (file['format'] !== SAVE_FORMAT) {
    return fail(
      `This save is in file format ${file['format']}. This version only reads format ${SAVE_FORMAT}.`,
      id,
    )
  }
  for (const part of ['id', 'createdAt', 'updatedAt', 'state'] as const) {
    if (!isText(file[part])) return fail(`This save file is damaged. Its ${part} is missing.`, id)
  }

  let state: GameState
  try {
    state = deserialize(file['state'] as string)
  } catch (error) {
    return fail(sentenceCase(error instanceof Error ? error.message : 'the nation could not be read'), id)
  }
  if (state.pack.id !== content.pack.id) {
    return fail(
      `This nation was founded with the pack "${state.pack.id}". This game runs "${content.pack.id}", ` +
        'so it cannot be opened here.',
      id,
    )
  }
  // The engine checks the shape of a save and not whether its dilemmas and situations
  // exist in this pack. Asking for the agenda and the class finds out before a screen does.
  try {
    agendaItems(state, content)
    classify(state, content)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'something is missing'
    return fail(`This save does not fit the pack it names (${detail}).`, id)
  }

  const notices: string[] = []
  if (state.pack.version !== content.pack.version) {
    notices.push(
      `This nation was last played with version ${state.pack.version} of the pack and this is ` +
        `${content.pack.version}. It carries on as it was, though some dilemmas may have changed.`,
    )
  }
  const stored = file['history']
  const history = Array.isArray(stored) && stored.every(isSnapshot) ? stored : null
  if (!history)
    notices.push('The record of past days could not be read, so the charts start again from today.')

  const nation: Nation = {
    id: file['id'] as string,
    createdAt: file['createdAt'] as string,
    updatedAt: file['updatedAt'] as string,
    state,
    history: history ?? [],
  }
  return notices.length ? { ok: true, nation, notice: notices.join(' ') } : { ok: true, nation }
}

export function summarise(nation: Nation, content: Content): Summary {
  const { state } = nation
  return {
    id: nation.id,
    name: state.identity.name,
    flag: state.identity.flag,
    className: classify(state, content).name,
    day: state.day,
    support: support(state),
    updatedAt: nation.updatedAt,
    ...(state.sandbox ? { sandbox: true } : {}),
  }
}

function summariseDamaged(id: string, problem: string): Summary {
  return {
    id,
    name: 'A save that cannot be read',
    flag: { layout: 'plain', colours: [] },
    className: '',
    day: 0,
    support: 0,
    updatedAt: '',
    problem,
  }
}

function storedIds(kv: KeyValue): string[] {
  const ids: string[] = []
  for (let i = 0; i < kv.length; i++) {
    const key = kv.key(i)
    if (key?.startsWith(NATION_PREFIX)) ids.push(key.slice(NATION_PREFIX.length))
  }
  return ids
}

function isSummary(value: unknown): value is Summary {
  if (!isObject(value)) return false
  const flag = value['flag']
  return (
    isText(value['id']) &&
    typeof value['name'] === 'string' &&
    typeof value['className'] === 'string' &&
    typeof value['day'] === 'number' &&
    typeof value['support'] === 'number' &&
    typeof value['updatedAt'] === 'string' &&
    (value['problem'] === undefined || typeof value['problem'] === 'string') &&
    isObject(flag) &&
    typeof flag['layout'] === 'string' &&
    Array.isArray(flag['colours'])
  )
}

function readIndex(kv: KeyValue): Summary[] | null {
  try {
    const parsed: unknown = JSON.parse(kv.getItem(INDEX_KEY) ?? 'null')
    if (!isObject(parsed) || parsed['format'] !== SAVE_FORMAT) return null
    const nations = parsed['nations']
    return Array.isArray(nations) && nations.every(isSummary) ? nations : null
  } catch {
    return null
  }
}

function writeIndex(kv: KeyValue, nations: Summary[]) {
  kv.setItem(INDEX_KEY, JSON.stringify({ format: SAVE_FORMAT, nations }))
}

const newestFirst = (a: Summary, b: Summary) =>
  a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0

function summaryOf(opened: Opened, content: Content): Summary {
  return opened.ok ? summarise(opened.nation, content) : summariseDamaged(opened.id, opened.problem)
}

// The index is a convenience and the saves are the truth. If the index is missing,
// unreadable, or lists different nations from the ones actually stored, it is rebuilt
// from the saves. Nothing is ever removed for being unreadable.
export function listNations(kv: KeyValue, content: Content): Summary[] {
  const ids = storedIds(kv)
  const index = readIndex(kv)
  const agrees = index && index.length === ids.length && index.every((s) => ids.includes(s.id))
  if (index && agrees) return [...index].sort(newestFirst)

  const rebuilt = ids.map((id) => summaryOf(openNation(kv, id, content), content)).sort(newestFirst)
  try {
    writeIndex(kv, rebuilt)
  } catch {
    // A full or locked store still gets a list. It is rebuilt again next time.
  }
  return rebuilt
}

export function rawText(kv: KeyValue, id: string): string | null {
  return kv.getItem(nationKey(id))
}

export function openNation(kv: KeyValue, id: string, content: Content): Opened {
  const text = rawText(kv, id)
  if (text === null) return { ok: false, id, problem: 'No such nation is saved in this browser.', raw: '' }
  const opened = decode(text, content, id)
  if (opened.ok && opened.nation.id !== id) opened.nation.id = id
  return opened
}

// Returns what went wrong, or null. The usual failure is the browser's storage being full.
export function storeNation(kv: KeyValue, nation: Nation, content: Content): string | null {
  try {
    kv.setItem(nationKey(nation.id), encode(nation))
    const others = (readIndex(kv) ?? []).filter((s) => s.id !== nation.id)
    writeIndex(kv, [summarise(nation, content), ...others])
    return null
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'the browser refused'
    return `The nation could not be saved (${detail}). Export it from settings to keep a copy.`
  }
}

export function removeNation(kv: KeyValue, id: string) {
  kv.removeItem(nationKey(id))
  const index = readIndex(kv)
  if (index)
    writeIndex(
      kv,
      index.filter((s) => s.id !== id),
    )
}

// An import never overwrites. If a nation with the same id is already here, the
// imported one is stored beside it under a new id.
// Far bigger than any real save, and small enough that a hostile file cannot fill the
// browser's storage or stall the page while it is read.
export const MAX_IMPORT = 5_000_000

export function importSave(kv: KeyValue, text: string, content: Content, freshId: () => string): Opened {
  if (text.length > MAX_IMPORT) {
    return { ok: false, id: '', problem: 'That file is too large to be a save from this game.', raw: '' }
  }
  const opened = decode(text, content)
  if (!opened.ok) return opened
  const taken = storedIds(kv)
  if (taken.includes(opened.nation.id)) {
    let id = freshId()
    while (taken.includes(id)) id = freshId()
    opened.nation.id = id
  }
  const problem = storeNation(kv, opened.nation, content)
  return problem ? { ok: false, id: opened.nation.id, problem, raw: text } : opened
}

export function exportName(name: string, day: number): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
  return `${slug || 'nation'}-day-${day}.json`
}

export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!
}
