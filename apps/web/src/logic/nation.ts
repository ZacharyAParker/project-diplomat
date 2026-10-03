import {
  standingWith,
  INDICATORS,
  INDICATOR_INFO,
  render,
  type Change,
  type Content,
  type GameState,
  type IndicatorId,
} from '@diplomat/engine'
import type { Snapshot } from './saves.ts'

const TREND_DAYS = 30

// The morning of the day before: the snapshot taken as the day before that ended. On
// days 1 and 2 that is the nation as founded.
export function yesterday(history: readonly Snapshot[], day: number): Snapshot | null {
  const wanted = Math.max(0, day - 2)
  return history.find((s) => s.day === wanted) ?? null
}

// The last month of day ends, then the value as it stands now.
export function trendValues(
  history: readonly Snapshot[],
  read: (snapshot: Snapshot) => number | undefined,
  now: number,
): number[] {
  const past = [...history]
    .sort((a, b) => a.day - b.day)
    .slice(-TREND_DAYS)
    .flatMap((s) => {
      const value = read(s)
      return value === undefined ? [] : [value]
    })
  return [...past, now]
}

// Points for an SVG polyline. Scores run from 0 to 100, but a line drawn on that scale
// would be flat, so it is stretched to the range it covers, with a floor of ten points
// so that a drift of one does not look like a cliff.
export function sparkPoints(values: readonly number[], width: number, height: number): string {
  if (values.length < 2) return ''
  const low = Math.min(...values)
  const high = Math.max(...values)
  const span = Math.max(10, high - low)
  const base = (low + high) / 2 - span / 2
  const step = width / (values.length - 1)
  return values
    .map((value, i) => {
      const x = Math.round(i * step * 10) / 10
      const y = Math.round((height - ((value - base) / span) * height) * 10) / 10
      return `${x},${y}`
    })
    .join(' ')
}

// The trend line in words, for anyone who cannot see it. Worded as then against now, so
// it cannot be mistaken for the move since yesterday printed beside it.
export function trendWords(values: readonly number[]): string {
  if (values.length < 3) return 'No trend yet'
  const days = values.length - 1
  const moved = Math.round(values[values.length - 1]! - values[0]!)
  if (moved === 0) return `Where it was ${days} days ago`
  const far = Math.abs(moved) >= 10 ? 'Much ' : ''
  const way = moved > 0 ? 'higher' : 'lower'
  return `${far ? `${far}${way}` : way.charAt(0).toUpperCase() + way.slice(1)} than ${days} days ago`
}

export interface IndicatorRow {
  id: IndicatorId
  name: string
  description: string
  lowerIsBetter: boolean
  value: number
  was: number | null
  // The move since yesterday morning as a change, so it is worded like any other. Null
  // when it has not moved.
  since: Change | null
  trend: number[]
}

function movement(kind: Change['kind'], target: string, now: number, was: number | null): Change | null {
  if (was === null) return null
  const by = Math.round((now - was) * 10) / 10
  return by === 0 ? null : { kind, target, by, why: '' }
}

export function indicatorRows(state: GameState, history: readonly Snapshot[]): IndicatorRow[] {
  const before = yesterday(history, state.day)
  return INDICATORS.map((id) => {
    const value = state.indicators[id]
    const was = before?.indicators[id] ?? null
    return {
      id,
      ...INDICATOR_INFO[id],
      value,
      was,
      since: movement('indicator', id, value, was),
      trend: trendValues(history, (s) => s.indicators[id], value),
    }
  })
}

export interface FactionRow {
  id: string
  name: string
  description: string
  // Its share of everyone's clout, which is its weight in the support figure.
  share: number
  approval: number
  was: number | null
  since: Change | null
  trend: number[]
}

export function factionRows(state: GameState, content: Content, history: readonly Snapshot[]): FactionRow[] {
  const before = yesterday(history, state.day)
  const total = Object.values(state.factions).reduce((sum, f) => sum + f.clout, 0)
  return content.factions.flatMap((faction) => {
    const standing = state.factions[faction.id]
    if (!standing) return []
    const was = before?.factions[faction.id] ?? null
    return [
      {
        id: faction.id,
        name: faction.name,
        description: render(faction.description, state, content),
        share: total === 0 ? 0 : Math.round((standing.clout / total) * 100),
        approval: standing.approval,
        was,
        since: movement('faction', faction.id, standing.approval, was),
        trend: trendValues(history, (s) => s.factions[faction.id], standing.approval),
      },
    ]
  })
}

export interface MinisterRow {
  id: string
  title: string
  name: string
  standing: number
  // Close enough to the floor that one more bad day ends in a resignation.
  shaky: boolean
}

const SHAKY_STANDING = 25

export function cabinetRows(state: GameState, content: Content): MinisterRow[] {
  return content.portfolios.flatMap((portfolio) => {
    const minister = state.cabinet[portfolio.id]
    if (!minister) return []
    const { name, standing } = minister
    return [{ id: portfolio.id, title: portfolio.title, name, standing, shaky: standing <= SHAKY_STANDING }]
  })
}

export interface PolicyRow {
  id: string
  name: string
  description: string
  // Set for a policy that is a number and not a switch.
  level?: string
}

export interface PolicyGroup {
  id: 'introduced' | 'standing' | 'levels' | 'ended' | 'off'
  label: string
  note: string
  policies: PolicyRow[]
}

const POLICY_GROUPS: readonly Omit<PolicyGroup, 'policies'>[] = [
  { id: 'introduced', label: 'Brought in', note: 'In force now, and not how the country began.' },
  { id: 'standing', label: 'Long-standing', note: 'In force since before anyone was asked.' },
  { id: 'levels', label: 'Set by law', note: 'Things that are a number and not a yes or no.' },
  { id: 'ended', label: 'Ended', note: 'Once the way of things, now not.' },
  { id: 'off', label: 'Not in force', note: 'On the shelf.' },
]

// Policies sorted by what has happened to them, since the pack gives them no subjects.
// Empty groups are left out.
export function policyGroups(state: GameState, content: Content): PolicyGroup[] {
  const sorted: Record<PolicyGroup['id'], PolicyRow[]> = {
    introduced: [],
    standing: [],
    levels: [],
    ended: [],
    off: [],
  }
  for (const policy of content.policies) {
    const value = state.policies[policy.id] ?? policy.default
    const row: PolicyRow = {
      id: policy.id,
      name: policy.name,
      description: render(policy.description, state, content),
    }
    if (typeof value === 'number') sorted.levels.push({ ...row, level: String(value) })
    else if (value) sorted[policy.default === true ? 'standing' : 'introduced'].push(row)
    else sorted[policy.default === true ? 'ended' : 'off'].push(row)
  }
  return POLICY_GROUPS.map((group) => ({ ...group, policies: sorted[group.id] })).filter(
    (group) => group.policies.length > 0,
  )
}

// What the pack's tags mean to someone who has never seen a tag. A tag that is not
// listed is printed as its own words.
const TAG_WORDS: Record<string, string> = {
  spending: 'new spending',
  privacy: 'protecting privacy',
  anti_labour: 'moving against the unions',
  redistribution: 'taking from the top to give to the bottom',
  polluting: 'anything that pollutes',
  permissive: 'loosening the rules on how people live',
  dovish: 'backing down abroad or cutting the forces',
  green: 'putting the environment first',
  lenient: 'going easy on crime',
  free_trade: 'opening the borders to trade',
}

export function tagWords(tag: string): string {
  return TAG_WORDS[tag] ?? tag.replace(/[_-]+/g, ' ')
}

export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`
}

export interface TraitRow {
  id: string
  name: string
  description: string
  // "Goes against it: new spending or going easy on crime." Empty when it opposes nothing.
  opposes: string
}

export function traitRows(state: GameState, content: Content): TraitRow[] {
  return content.traits
    .filter((trait) => state.traits.includes(trait.id))
    .map((trait) => ({
      id: trait.id,
      name: trait.name,
      description: render(trait.description, state, content),
      opposes:
        trait.opposes.length && trait.penalty !== 0
          ? `Costs legitimacy: ${listWords(trait.opposes.map(tagWords))}.`
          : '',
    }))
}

export interface PromiseRow {
  id: string
  text: string
  daysLeft: number
}

export function promiseRows(state: GameState, content: Content): PromiseRow[] {
  return [...state.promises]
    .sort((a, b) => a.dueDay - b.dueDay)
    .map((promise) => ({
      id: promise.id,
      text: render(promise.text, state, content),
      daysLeft: Math.max(0, promise.dueDay - state.day),
    }))
}

export function deadline(daysLeft: number): string {
  if (daysLeft <= 0) return 'Judged tonight'
  if (daysLeft === 1) return 'Judged tomorrow night'
  return `Judged in ${daysLeft} days`
}

export interface CrisisRow {
  title: string
  gauge: string
  value: number
  note: string
}

// The running situation, whether or not today's stage has been dealt with.
export function crisisRow(state: GameState, content: Content): CrisisRow | null {
  const running = state.situation
  const situation = running && content.situations.find((s) => s.id === running.id)
  if (!running || !situation) return null
  const stages = situation.stages.length
  return {
    title: render(situation.title, state, content),
    gauge: render(situation.gauge, state, content),
    value: running.gauge,
    note: `Stage ${Math.min(running.stage + 1, stages)} of ${stages}.`,
  }
}

export interface NeighbourRow {
  id: string
  name: string
  leader: string
  description: string
  standing: number
  // "Warm", "Cool" and so on, so the figure never has to speak for itself.
  mood: string
  treaties: string[]
  wants: string
  offers: string
}

export function moodWord(standing: number): string {
  if (standing >= 60) return 'Close'
  if (standing >= 25) return 'Warm'
  if (standing >= -10) return 'Correct'
  if (standing >= -40) return 'Cool'
  return 'Hostile'
}

const resourceNames = (ids: readonly string[], content: Content) =>
  listWords(ids.map((id) => (content.resources.find((r) => r.id === id)?.name ?? id).toLowerCase()))

export function neighbourRows(state: GameState, content: Content): NeighbourRow[] {
  return content.neighbours.map((n) => {
    const standing = standingWith(state, content, n.id)
    return {
      id: n.id,
      name: n.name,
      leader: n.leader,
      description: render(n.description, state, content, n.id),
      standing,
      mood: moodWord(standing),
      treaties: state.treaties
        .filter((t) => t.with === n.id)
        .map((t) => {
          const name = content.treaties.find((d) => d.id === t.kind)?.name ?? t.kind
          return t.until === undefined ? name : `${name}, ${Math.max(0, t.until - state.day)} days left`
        }),
      wants: n.needs.length ? `Short of ${resourceNames(n.needs, content)}.` : '',
      offers: n.surpluses.length ? `Has ${resourceNames(n.surpluses, content)} to spare.` : '',
    }
  })
}

// What the nation itself is short of and has to spare, as two lines of plain words.
export function resourceLines(state: GameState, content: Content): { short: string; spare: string } {
  const named = (balance: string) =>
    content.resources.filter((r) => state.resources[r.id] === balance).map((r) => r.name.toLowerCase())
  const short = named('need')
  const spare = named('surplus')
  return {
    short: short.length ? `Short of ${listWords(short).replace(/ or ([^ ]+)$/, ' and $1')}.` : 'Short of nothing in particular.',
    spare: spare.length ? `Has ${listWords(spare).replace(/ or ([^ ]+)$/, ' and $1')} to spare.` : 'Nothing to spare.',
  }
}

// Never what or when, only whether.
export function hasPending(state: GameState): boolean {
  return state.pending.length > 0
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth']

export function ordinal(n: number): string {
  if (n >= 1 && n <= ORDINALS.length) return ORDINALS[n - 1]!
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${suffix}`
}
