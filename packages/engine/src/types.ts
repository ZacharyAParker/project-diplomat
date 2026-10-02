export const INDICATORS = [
  'fiscal',
  'debt',
  'capacity',
  'employment',
  'living',
  'inequality',
  'health',
  'education',
  'environment',
  'liberty',
  'legitimacy',
  'administration',
] as const

export type IndicatorId = (typeof INDICATORS)[number]

// For these two, a rising number is bad news.
export const LOWER_IS_BETTER: ReadonlySet<IndicatorId> = new Set(['debt', 'inequality'])

export interface Compare {
  gt?: number
  gte?: number
  lt?: number
  lte?: number
}

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | ({ indicator: IndicatorId } & Compare)
  | ({ faction: string } & Compare)
  | { policy: string; is: boolean | number }
  | { flag: string }
  | { trait: string }
  | { day: Compare }

export type Effect =
  | { indicator: IndicatorId; by: number; why: string }
  | { faction: string; by: number; why: string }
  | { minister: string; by: number; why: string }
  | { situation: string; by: number; why: string }
  | { policy: string; to: boolean | number }
  | { flag: string; clear?: boolean }

export interface Delayed {
  after: number
  when?: Condition
  headline: string
  effects: Effect[]
}

export interface PromiseDef {
  id: string
  text: string
  due: number
  kept: Condition
  broken: Effect[]
}

export interface Option {
  id: string
  advocate: { name: string; role: string }
  speech: string
  when?: Condition
  tags: string[]
  effects: Effect[]
  later: Delayed[]
  promise?: PromiseDef
  headline: string
  result: string
}

export interface Dilemma {
  id: string
  version: number
  kind: 'major' | 'minor'
  title: string
  description: string
  tags: string[]
  when?: Condition
  priority: number
  weight: number
  author?: string
  options: Option[]
}

export interface Situation {
  id: string
  title: string
  description: string
  when: Condition
  gauge: string
  start: number
  pressures: { tag: string; by: number }[]
  stages: { title: string; description: string; options: Option[] }[]
  outcomes: ({ headline: string; text: string; effects: Effect[] } & Compare)[]
}

export interface Trait {
  id: string
  name: string
  description: string
  earn: Condition
  lose?: Condition
  opposes: string[]
  penalty: number
}

export interface Faction {
  id: string
  name: string
  description: string
  clout: number
}

export interface PolicyDef {
  id: string
  name: string
  description: string
  default: boolean | number
}

export interface Content {
  factions: Faction[]
  policies: PolicyDef[]
  traits: Trait[]
  portfolios: { id: string; title: string }[]
  names: { given: string[]; family: string[] }
  dilemmas: Dilemma[]
  situations: Situation[]
}

export interface Identity {
  name: string
  capital: string
  currency: string
  demonym: string
}

export interface Change {
  kind: 'indicator' | 'faction' | 'minister' | 'situation'
  target: string
  by: number
  why: string
}

export type EntryKind =
  | 'decision'
  | 'consequence'
  | 'promise'
  | 'trait'
  | 'cabinet'
  | 'government'
  | 'situation'
  | 'budget'

export interface TimelineEntry {
  day: number
  kind: EntryKind
  headline: string
  text?: string
  changes: Change[]
}

export interface Pending {
  dueDay: number
  when?: Condition
  headline: string
  effects: Effect[]
  source: string
}

export interface ActivePromise {
  id: string
  text: string
  dueDay: number
  kept: Condition
  broken: Effect[]
}

export interface NationState {
  seed: number
  day: number
  identity: Identity
  indicators: Record<IndicatorId, number>
  factions: Record<string, { clout: number; approval: number }>
  policies: Record<string, boolean | number>
  flags: Record<string, number>
  traits: string[]
  cabinet: Record<string, { name: string; standing: number }>
  promises: ActivePromise[]
  pending: Pending[]
  answered: Record<string, number>
  situation: { id: string; stage: number; gauge: number } | null
  situationsDone: string[]
  government: number
  timeline: TimelineEntry[]
}
