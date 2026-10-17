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

export interface IndicatorInfo {
  name: string
  description: string
  lowerIsBetter: boolean
}

const info = (id: IndicatorId, name: string, description: string): IndicatorInfo => ({
  name,
  description,
  lowerIsBetter: LOWER_IS_BETTER.has(id),
})

export const INDICATOR_INFO: Record<IndicatorId, IndicatorInfo> = {
  fiscal: info(
    'fiscal',
    'Budget',
    "This year's books. 50 is balanced, below is a deficit, above is a surplus.",
  ),
  debt: info('debt', 'Debt', 'What the country owes. Past 80 the interest starts to hurt.'),
  capacity: info(
    'capacity',
    'Economy',
    'How much the country can produce: industry, infrastructure, investment.',
  ),
  employment: info('employment', 'Employment', 'How many of the people who want work have it.'),
  living: info('living', 'Living standards', 'Day-to-day life: prices, housing, services that function.'),
  inequality: info('inequality', 'Inequality', 'The gap between the top and the bottom.'),
  health: info('health', 'Health', 'How well and how long people live.'),
  education: info('education', 'Education', 'Schools, universities and skills.'),
  environment: info('environment', 'Environment', 'Air, water, land and emissions.'),
  liberty: info('liberty', 'Liberty', 'Civil liberties: privacy, protest, the press.'),
  legitimacy: info(
    'legitimacy',
    'Legitimacy',
    'Whether people accept that the government has the right to govern.',
  ),
  administration: info(
    'administration',
    'Administration',
    'Whether the state can actually do things: capable ministries, short queues.',
  ),
}

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
  | { flag: string; days?: number }
  | { trait: string }
  | { day: Compare }
  | { resource: string; is: ResourceBalance }
  | { treaty: string }
  | { identity: IdentityField; set: boolean }

// Where the nation stands on one resource: short of it, with some to spare, or neither.
export type ResourceBalance = 'need' | 'surplus' | 'even'

export type Effect =
  | { indicator: IndicatorId; by: number; why: string }
  | { faction: string; by: number; why: string }
  | { minister: string; by: number; why: string }
  | { situation: string; by: number; why: string }
  | { policy: string; to: boolean | number }
  | { flag: string; clear?: boolean }
  // The next three act on the neighbour a dilemma was put on the desk with.
  | { standing: number; why: string }
  | { treaty: string; days?: number }
  | { endTreaty: string }
  // Names part of the nation: its capital, its currency, its national animal.
  | { identity: IdentityField; to: string }

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
  // An option where the player writes the name. Whatever they type becomes this field.
  custom?: { field: IdentityField; label: string }
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
  // Days before an answered dilemma may come round again. Most never do.
  repeat?: number
  // A dilemma about another country. It only comes up when a neighbour fits.
  abroad?: AbroadSelector
  author?: string
  options: Option[]
}

export interface SituationStage {
  title: string
  description: string
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
  stages: SituationStage[]
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

export interface AbroadSelector {
  // The neighbour has a surplus of this to offer.
  supplies?: string
  // The neighbour is short of this.
  wants?: string
  standing?: Compare
  // The neighbour already has, or has not got, this treaty with the nation.
  treaty?: string
  noTreaty?: string
  // Only a nation that borders the player's (a border river, fans crossing on foot).
  near?: boolean
}

export interface NeighbourDef {
  id: string
  name: string
  demonym: string
  leader: string
  description: string
  standing: number
  needs: string[]
  surpluses: string[]
  // Option tags this neighbour notices, whoever the decision was about.
  likes: string[]
  dislikes: string[]
  // What the papers report when this neighbour notices one of those tags.
  pleased: string
  displeased: string
  // Whether it borders the player's nation. The five in neighbours.yaml do; the rest don't.
  near: boolean
  // The other nations it borders, for claims and wars between them.
  borders: string[]
  // What drives its moves in the world week, each 0 to 100.
  temperament: Temperament
  // Its army and its economy as the world begins, 0 to 100.
  strength: number
  wealth: number
  // What kind of state it is, in a few words, for the papers.
  form: string
}

export interface Temperament {
  ambition: number
  aggression: number
  loyalty: number
  charity: number
}

// What a foreign matter's option does in the world, beyond its effects. Which of these a
// matter may use depends on its kind (MATTER_ACTIONS).
export const MATTER_KINDS = ['claim', 'aid', 'called', 'attacked', 'crimes', 'accused', 'pact', 'terms', 'victory', 'vote'] as const
export type MatterKind = (typeof MATTER_KINDS)[number]

export const MATTER_ACTIONS: Record<MatterKind, readonly string[]> = {
  claim: ['negotiate', 'refer', 'firm', 'cede'],
  aid: ['aid', 'token', 'none'],
  called: ['join', 'arms', 'abandon'],
  attacked: ['fight', 'appeal', 'capitulate'],
  crimes: ['condemn', 'tribunal', 'none'],
  accused: ['inquiry', 'deny'],
  pact: ['ally', 'none'],
  terms: ['peace', 'none'],
  victory: ['reparations', 'annex', 'peace'],
  vote: ['aye', 'no', 'abstain'],
}

export interface MatterOptionDef {
  id: string
  label: string
  does: string
  // On the player's nation. A standing effect is with the matter's subject.
  effects: Effect[]
  // Standing with the other party, if the matter has one.
  other?: number
  result: string
  headline: string
  // What happens if nobody decides within a week. One option per matter.
  lapse?: boolean
}

export interface MatterDef {
  kind: MatterKind
  title: string
  description: string
  options: MatterOptionDef[]
}

export interface WorldContent {
  // Names for the land nations quarrel over.
  borderlands: string[]
  matters: MatterDef[]
  // Where each nation lies, for the map (map.ts). Optional: a pack without one has no map.
  map?: WorldMapDef
}

export interface WorldMapDef {
  width: number
  height: number
  // A point for every nation, the player's as "home".
  sites: Record<string, [number, number]>
  // Points of open sea: the coast all round, and the straits between nations that do not border.
  sea: [number, number][]
}

export interface ResourceDef {
  id: string
  name: string
  need: Condition
  surplus: Condition
}

export interface TreatyDef {
  id: string
  name: string
  description: string
  // Printed each week the treaty pays out. {neighbour} is the other party.
  headline: string
  // Applied once a week for as long as the treaty stands.
  weekly: Effect[]
  // The other side walks away if standing falls this low.
  breaksBelow: number
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

export type FoundingEffect =
  | { indicator: IndicatorId; by: number; why: string }
  | { faction: string; by: number; why: string }
  | { policy: string; to: boolean | number }

export interface FoundingAnswer {
  id: string
  label: string
  effects: FoundingEffect[]
}

export interface FoundingQuestion {
  id: string
  prompt: string
  answers: FoundingAnswer[]
}

export interface ClassDef {
  id: string
  name: string
  description: string
  when?: Condition
}

export interface PackInfo {
  id: string
  name: string
  version: string
}

export interface Content {
  pack: PackInfo
  factions: Faction[]
  policies: PolicyDef[]
  traits: Trait[]
  portfolios: { id: string; title: string }[]
  names: { given: string[]; family: string[] }
  dilemmas: Dilemma[]
  situations: Situation[]
  founding: { questions: FoundingQuestion[] }
  classes: ClassDef[]
  // Every other nation in the world: the five neighbours first, then the rest.
  neighbours: NeighbourDef[]
  resources: ResourceDef[]
  treaties: TreatyDef[]
  world: WorldContent
}

export const IDENTITY_FIELDS = [
  'capital',
  'currency',
  'demonym',
  'leaderTitle',
  'animal',
  'motto',
  'faith',
] as const

export type IdentityField = (typeof IDENTITY_FIELDS)[number]

// The longest a name the player writes may be. A motto gets a sentence.
export const IDENTITY_LIMITS: Record<IdentityField, number> = {
  capital: 40,
  currency: 30,
  demonym: 30,
  leaderTitle: 40,
  animal: 40,
  motto: 100,
  faith: 60,
}

export interface Identity {
  name: string
  capital: string
  currency: string
  demonym: string
  leaderTitle: string
  // Settled by issues over time, so a new nation has none of them.
  animal?: string
  motto?: string
  faith?: string
  // The engine never looks inside the flag. Whoever draws it decides what the words mean.
  flag: { layout: string; colours: string[] }
}

export interface Change {
  kind: 'indicator' | 'faction' | 'minister' | 'situation' | 'neighbour'
  target: string
  by: number
  why: string
}

export const ENTRY_KINDS = [
  'founding',
  'election',
  'decision',
  'consequence',
  'promise',
  'trait',
  'cabinet',
  'government',
  'situation',
  'budget',
  'treaty',
  // The world week: wars, pacts, the Assembly of Nations, foreign matters decided.
  'world',
  'sandbox',
  // From the government above the engine: an event in the world, a law, a Founder's Word.
  'event',
  'law',
  'word',
] as const

export type EntryKind = (typeof ENTRY_KINDS)[number]

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
  neighbour?: string
}

export interface ActivePromise {
  id: string
  text: string
  dueDay: number
  kept: Condition
  broken: Effect[]
  neighbour?: string
}

export interface Treaty {
  kind: string
  with: string
  since: number
  until?: number
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
  // Standing with each neighbour, from -100 to 100.
  neighbours: Record<string, number>
  treaties: Treaty[]
  // Worked out at the start of each day from the pack's resource rules.
  resources: Record<string, ResourceBalance>
  // Set for good the first time the sandbox changes anything, so a doctored nation says so.
  sandbox?: boolean
  // Days between elections. Absent means TERM_DAYS; 0 means the nation holds none (a junta,
  // an absolute monarchy). Set by the government above the engine.
  term?: number
  // The day of the next election, when it is not simply the next multiple of the term
  // (an imported nation keeps its own calendar). Moves on by the term after each one.
  electionDay?: number
  // Everything beyond the borders that changes: the other nations, wars, pacts, the Assembly
  // of Nations, matters for the player. Made on the first day there is a world to make.
  world?: WorldState
}

export const HOME = 'home'

export interface WorldNation {
  id: string
  // False once annexed. ruler is who holds it then.
  free: boolean
  ruler?: string
  // The day it was annexed, if it was.
  annexed?: number
  strength: number
  wealth: number
  stability: number
  // With every other foreign nation, -100 to 100. With the player it is state.neighbours.
  relations: Record<string, number>
  // The last few things it did or had done to it, in its own words where the AI wrote them.
  memory: { day: number; text: string }[]
}

export interface War {
  id: string
  since: number
  attackers: string[]
  defenders: string[]
  cause: 'claim' | 'conquest' | 'punitive'
  region?: string
  // The attackers' strength against the defenders' when it began: under 1 is a gamble.
  odds?: number
  // -100 to 100. Positive means the attackers are winning.
  front: number
  weeks: number
  weariness: { attackers: number; defenders: number }
  crimes: { day: number; by: string; text: string }[]
  ended?: { day: number; outcome: 'ceasefire' | 'attackers' | 'defenders' | 'terms' | 'annexed' }
}

export interface Pact {
  id: string
  members: string[]
  since: number
}

export interface Claim {
  id: string
  by: string
  against: string
  region: string
  since: number
  // Waiting for the Assembly's arbitration.
  referred?: boolean
  settled?: { day: number; to: string; how: string }
}

export type MotionKind = 'ceasefire' | 'sanctions' | 'tribunal' | 'arbitration' | 'aid' | 'routine'

export interface Motion {
  id: string
  kind: MotionKind
  title: string
  target?: string
  war?: string
  claim?: string
  day: number
  votes?: Record<string, 'aye' | 'no' | 'abstain'>
  passed?: boolean
}

export interface Matter {
  id: string
  kind: MatterKind
  day: number
  expires: number
  subject: string
  other?: string
  region?: string
  war?: string
  claim?: string
  motion?: string
  // Extra words for the card: what the nation needs, the terms offered, the state of the front.
  vars: Record<string, string>
  decided?: { day: number; option: string }
}

export interface WorldState {
  nations: Record<string, WorldNation>
  wars: War[]
  pacts: Pact[]
  claims: Claim[]
  assembly: {
    members: string[]
    next: number
    motion: Motion | null
    past: Motion[]
    sanctions: { target: string; until: number }[]
  }
  matters: Matter[]
  home: { mobilised: boolean; lost: number; reparations: { to: string; until: number; by: number }[] }
  // Nations that matter to the player this week: each plays on its own session.
  important: string[]
  // What happened, week by week, for the World page and the AI's memory of the world.
  log: { day: number; text: string; nations: string[] }[]
  seq: number
}
