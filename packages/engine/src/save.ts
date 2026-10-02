import type { GameState } from './engine.ts'
import { ENTRY_KINDS, INDICATORS } from './types.ts'

export const SAVE_VERSION = 1

type Check = (value: unknown) => boolean

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isNumber: Check = (value) => typeof value === 'number' && Number.isFinite(value)
const isString: Check = (value) => typeof value === 'string'
const isBoolean: Check = (value) => typeof value === 'boolean'
const isSetting: Check = (value) => isBoolean(value) || isNumber(value)
const isScore: Check = (value) => isNumber(value) && (value as number) >= 0 && (value as number) <= 100
const isCount: Check = (value) => Number.isSafeInteger(value) && (value as number) >= 0
const isDay: Check = (value) => Number.isSafeInteger(value) && (value as number) >= 1
const oneOf = (list: readonly string[]): Check => (value) => list.includes(value as string)
const optional = (check: Check): Check => (value) => value === undefined || check(value)
const listOf = (item: Check): Check => (value) => Array.isArray(value) && value.every(item)
const mapOf = (item: Check): Check => (value) => isObject(value) && Object.values(value).every(item)
const shaped = (shape: Record<string, Check>): Check => (value) =>
  isObject(value) && Object.entries(shape).every(([key, check]) => check(value[key]))

const bound = optional(isNumber)
const BOUNDS = { gt: bound, gte: bound, lt: bound, lte: bound }
const isIndicator = oneOf(INDICATORS)

// The branches are tried in the order the engine reads a condition or an effect,
// so anything that passes here is read the same way when the day is played.
const isCondition: Check = (value) => {
  if (!isObject(value)) return false
  if ('all' in value) return listOf(isCondition)(value['all'])
  if ('any' in value) return listOf(isCondition)(value['any'])
  if ('not' in value) return isCondition(value['not'])
  if ('indicator' in value) return shaped({ indicator: isIndicator, ...BOUNDS })(value)
  if ('faction' in value) return shaped({ faction: isString, ...BOUNDS })(value)
  if ('policy' in value) return shaped({ policy: isString, is: isSetting })(value)
  if ('flag' in value) return shaped({ flag: isString, days: optional(isDay) })(value)
  if ('trait' in value) return isString(value['trait'])
  return shaped(BOUNDS)(value['day'])
}

const isEffect: Check = (value) => {
  if (!isObject(value)) return false
  const moves = { by: isNumber, why: isString }
  if ('indicator' in value) return shaped({ indicator: isIndicator, ...moves })(value)
  if ('faction' in value) return shaped({ faction: isString, ...moves })(value)
  if ('minister' in value) return shaped({ minister: isString, ...moves })(value)
  if ('situation' in value) return shaped({ situation: isString, ...moves })(value)
  if ('policy' in value) return shaped({ policy: isString, to: isSetting })(value)
  return shaped({ flag: isString, clear: optional(isBoolean) })(value)
}

const isChange = shaped({
  kind: oneOf(['indicator', 'faction', 'minister', 'situation']),
  target: isString,
  by: isNumber,
  why: isString,
})

const SHAPE: Record<string, Check> = {
  pack: shaped({ id: isString, version: isString }),
  seed: isNumber,
  day: isDay,
  identity: shaped({
    name: isString,
    capital: isString,
    currency: isString,
    demonym: isString,
    leaderTitle: isString,
    flag: shaped({ layout: isString, colours: listOf(isString) }),
  }),
  indicators: shaped(Object.fromEntries(INDICATORS.map((id) => [id, isScore]))),
  factions: mapOf(shaped({ clout: (value) => isNumber(value) && (value as number) >= 0, approval: isScore })),
  policies: mapOf(isSetting),
  flags: mapOf(isDay),
  traits: listOf(isString),
  cabinet: mapOf(shaped({ name: isString, standing: isScore })),
  promises: listOf(
    shaped({ id: isString, text: isString, dueDay: isDay, kept: isCondition, broken: listOf(isEffect) }),
  ),
  pending: listOf(
    shaped({
      dueDay: isDay,
      when: optional(isCondition),
      headline: isString,
      effects: listOf(isEffect),
      source: isString,
    }),
  ),
  answered: mapOf(isDay),
  situation: (value) => value === null || shaped({ id: isString, stage: isCount, gauge: isScore })(value),
  situationsDone: listOf(isString),
  government: isDay,
  timeline: listOf(
    shaped({
      day: isDay,
      kind: oneOf(ENTRY_KINDS),
      headline: isString,
      text: optional(isString),
      changes: listOf(isChange),
    }),
  ),
  agenda: shaped({
    major: (value) => value === null || isString(value),
    minors: listOf(isString),
    situation: isBoolean,
  }),
}

export function serialize(state: GameState): string {
  return JSON.stringify(state)
}

// Checks everything that can be checked without the pack: the shape of every part, all
// the way down, and that the numbers are in range. It cannot know whether the ids of
// factions, policies, dilemmas and situations exist. A save from another pack loads
// here, and it is the caller's job to turn it away by looking at state.pack.
export function deserialize(text: string): GameState {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('not a save file: it is not valid JSON')
  }
  if (!isObject(raw) || !isNumber(raw['version'])) {
    throw new Error('not a save file: it has no version number')
  }
  if (raw['version'] !== SAVE_VERSION) {
    throw new Error(`this save is version ${raw['version']}, and only version ${SAVE_VERSION} can be read`)
  }
  for (const [key, check] of Object.entries(SHAPE)) {
    if (!check(raw[key])) throw new Error(`not a save file: ${key} is missing or malformed`)
  }
  return raw as unknown as GameState
}
