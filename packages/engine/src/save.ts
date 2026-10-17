import type { GameState } from './engine.ts'
import { ASSEMBLY_MOTIONS, COUNCIL_MOTIONS, ENTRY_KINDS, IDENTITY_FIELDS, INDICATORS, MATTER_KINDS } from './types.ts'

export const SAVE_VERSION = 3

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
const isStanding: Check = (value) => isNumber(value) && (value as number) >= -100 && (value as number) <= 100
const isBalance: Check = (value) => value === 'need' || value === 'surplus' || value === 'even'
const oneOf = (list: readonly string[]): Check => (value) => list.includes(value as string)
const optional = (check: Check): Check => (value) => value === undefined || check(value)
const listOf = (item: Check): Check => (value) => Array.isArray(value) && value.every(item)
const mapOf = (item: Check): Check => (value) => isObject(value) && Object.values(value).every(item)
const shaped = (shape: Record<string, Check>): Check => (value) =>
  isObject(value) && Object.entries(shape).every(([key, check]) => check(value[key]))

const bound = optional(isNumber)
const BOUNDS = { gt: bound, gte: bound, lt: bound, lte: bound }
const isIndicator = oneOf(INDICATORS)
const isField = oneOf(IDENTITY_FIELDS)

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
  if ('resource' in value) return shaped({ resource: isString, is: isBalance })(value)
  if ('identity' in value) return shaped({ identity: isField, set: isBoolean })(value)
  if ('treaty' in value) return isString(value['treaty'])
  return shaped(BOUNDS)(value['day'])
}

const isEffect: Check = (value) => {
  if (!isObject(value)) return false
  const moves = { by: isNumber, why: isString }
  if ('identity' in value) return shaped({ identity: isField, to: isString })(value)
  if ('standing' in value) return shaped({ standing: isNumber, why: isString })(value)
  if ('treaty' in value) return shaped({ treaty: isString, days: optional(isDay) })(value)
  if ('endTreaty' in value) return isString(value['endTreaty'])
  if ('indicator' in value) return shaped({ indicator: isIndicator, ...moves })(value)
  if ('faction' in value) return shaped({ faction: isString, ...moves })(value)
  if ('minister' in value) return shaped({ minister: isString, ...moves })(value)
  if ('situation' in value) return shaped({ situation: isString, ...moves })(value)
  if ('policy' in value) return shaped({ policy: isString, to: isSetting })(value)
  return shaped({ flag: isString, clear: optional(isBoolean) })(value)
}

const isChange = shaped({
  kind: oneOf(['indicator', 'faction', 'minister', 'situation', 'neighbour']),
  target: isString,
  by: isNumber,
  why: isString,
})

const isText: Check = (value) => isString(value) && (value as string).length <= 2000
const isSide = listOf(isString)
const isVote = oneOf(['aye', 'no', 'abstain'])
const isMotion = shaped({
  id: isString,
  kind: oneOf([...ASSEMBLY_MOTIONS, ...COUNCIL_MOTIONS]),
  title: isText,
  target: optional(isString),
  war: optional(isString),
  claim: optional(isString),
  resource: optional(isString),
  day: isDay,
  by: optional(isString),
  text: optional(isText),
  votes: optional(mapOf(isVote)),
  passed: optional(isBoolean),
  vetoed: optional(listOf(isString)),
})

// A world made for this nation alone (generate.ts): its nations and its map.
const isPoint: Check = (value) => Array.isArray(value) && value.length === 2 && value.every(isNumber)
const isTemperament = shaped({ ambition: isScore, aggression: isScore, loyalty: isScore, charity: isScore })
const isGenerated = shaped({
  name: isString,
  seed: isNumber,
  borderlands: listOf(isString),
  nations: listOf(
    shaped({
      id: isString,
      name: isString,
      capital: optional(isString),
      demonym: isString,
      leader: isString,
      description: isString,
      standing: isStanding,
      needs: listOf(isString),
      surpluses: listOf(isString),
      likes: listOf(isString),
      dislikes: listOf(isString),
      pleased: isString,
      displeased: isString,
      near: isBoolean,
      borders: listOf(isString),
      temperament: isTemperament,
      strength: isScore,
      wealth: isScore,
      form: isString,
    }),
  ),
  map: shaped({
    width: isNumber,
    height: isNumber,
    spacing: optional(isNumber),
    seed: optional(isNumber),
    warp: optional(isNumber),
    margin: optional(isNumber),
    sites: mapOf(isPoint),
    sea: listOf(isPoint),
  }),
})

// The world beyond the borders (world.ts), checked as closely as the rest.
const isWorld = shaped({
  nations: mapOf(
    shaped({
      id: isString,
      free: isBoolean,
      ruler: optional(isString),
      annexed: optional(isDay),
      strength: isScore,
      wealth: isScore,
      stability: isScore,
      relations: mapOf(isStanding),
      memory: listOf(shaped({ day: isDay, text: isText })),
    }),
  ),
  wars: listOf(
    shaped({
      id: isString,
      since: isDay,
      attackers: isSide,
      defenders: isSide,
      cause: oneOf(['claim', 'conquest', 'punitive']),
      region: optional(isString),
      odds: optional(isNumber),
      front: isStanding,
      peacekeepers: optional(isBoolean),
      weeks: isCount,
      weariness: shaped({ attackers: isScore, defenders: isScore }),
      crimes: listOf(shaped({ day: isDay, by: isString, text: isText })),
      ended: optional(shaped({ day: isDay, outcome: oneOf(['ceasefire', 'attackers', 'defenders', 'terms', 'annexed']) })),
    }),
  ),
  pacts: listOf(shaped({ id: isString, members: isSide, since: isDay })),
  claims: listOf(
    shaped({
      id: isString,
      by: isString,
      against: isString,
      region: isString,
      since: isDay,
      referred: optional(isBoolean),
      settled: optional(shaped({ day: isDay, to: isString, how: isString })),
    }),
  ),
  assembly: shaped({
    members: isSide,
    next: isDay,
    motion: (value) => value === null || isMotion(value),
    past: listOf(isMotion),
    sanctions: listOf(shaped({ target: isString, until: isDay, hard: optional(isBoolean), resource: optional(isString) })),
    queue: optional(listOf(isMotion)),
  }),
  council: optional(
    shaped({
      permanent: isSide,
      elected: listOf(shaped({ id: isString, until: isDay })),
      next: isDay,
      motion: (value) => value === null || isMotion(value),
      past: listOf(isMotion),
      queue: listOf(isMotion),
      election: isDay,
      candidates: isSide,
    }),
  ),
  matters: listOf(
    shaped({
      id: isString,
      kind: oneOf(MATTER_KINDS),
      day: isDay,
      expires: isDay,
      subject: isString,
      other: optional(isString),
      region: optional(isString),
      war: optional(isString),
      claim: optional(isString),
      motion: optional(isString),
      vars: mapOf(isText),
      decided: optional(shaped({ day: isDay, option: isString })),
    }),
  ),
  home: shaped({
    mobilised: isBoolean,
    lost: isCount,
    reparations: listOf(shaped({ to: isString, until: isDay, by: isNumber })),
  }),
  important: listOf(isString),
  log: listOf(shaped({ day: isDay, text: isText, nations: isSide })),
  seq: isCount,
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
    animal: optional(isString),
    motto: optional(isString),
    faith: optional(isString),
    flag: shaped({ layout: isString, colours: listOf(isString) }),
  }),
  indicators: shaped(Object.fromEntries(INDICATORS.map((id) => [id, isScore]))),
  factions: mapOf(shaped({ clout: (value) => isNumber(value) && (value as number) >= 0, approval: isScore })),
  policies: mapOf(isSetting),
  flags: mapOf(isDay),
  traits: listOf(isString),
  cabinet: mapOf(shaped({ name: isString, standing: isScore })),
  promises: listOf(
    shaped({
      id: isString,
      text: isString,
      dueDay: isDay,
      kept: isCondition,
      broken: listOf(isEffect),
      neighbour: optional(isString),
    }),
  ),
  pending: listOf(
    shaped({
      dueDay: isDay,
      when: optional(isCondition),
      headline: isString,
      effects: listOf(isEffect),
      source: isString,
      neighbour: optional(isString),
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
  neighbours: mapOf(isStanding),
  treaties: listOf(shaped({ kind: isString, with: isString, since: isDay, until: optional(isDay) })),
  resources: mapOf(isBalance),
  sandbox: optional(isBoolean),
  term: optional(isCount),
  electionDay: optional(isDay),
  world: optional(isWorld),
  generated: optional(isGenerated),
  agenda: shaped({
    major: (value) => value === null || isString(value),
    minors: listOf(isString),
    situation: isBoolean,
    bound: mapOf(isString),
  }),
}

// Version 1 saves predate other countries. They load with nobody abroad yet; the engine
// fills in each neighbour at its starting standing the next time a day ends.
// Version 2 saves predate the world: they load with none, and the engine makes it the next
// time the day turns.
function upgrade(raw: Record<string, unknown>) {
  if (raw['version'] === 1) {
    raw['neighbours'] = {}
    raw['treaties'] = []
    raw['resources'] = {}
    if (isObject(raw['agenda'])) raw['agenda']['bound'] = {}
    raw['version'] = 2
  }
  if (raw['version'] === 2) raw['version'] = 3
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
  upgrade(raw)
  if (raw['version'] !== SAVE_VERSION) {
    throw new Error(`this save is version ${raw['version']}, and only version ${SAVE_VERSION} can be read`)
  }
  for (const [key, check] of Object.entries(SHAPE)) {
    if (!check(raw[key])) throw new Error(`not a save file: ${key} is missing or malformed`)
  }
  return raw as unknown as GameState
}
