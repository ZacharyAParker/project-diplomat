// The shared contract for everything above the engine: forms of government, the bodies in
// them, how a decision moves through them, the record they keep, and the work handed to the
// AI. The engine (packages/engine) still owns every number. This package owns who gets a say.
//
// Nothing here imports a platform. The server, the web app and the import script all read
// these types, and nothing else defines them.

import type { Change, Effect, IndicatorId } from '@diplomat/engine'

// ---------------------------------------------------------------------------------------
// Forms of government
// ---------------------------------------------------------------------------------------

// The forms a nation can be founded as, or turn into. Each is a template in forms.ts: the
// bodies it has and the rules that bind them. 'custom' is a nation whose constitution has
// been changed until it matches no template; it keeps its own bodies and rules.
export const FORM_IDS = [
  'commonwealth', // Claudetopia: an Assembly recommends, a Court may bar, a Steward decides under rules
  'presidential', // a Congress recommends, a Supreme Court may bar, a President decides and may veto
  'parliamentary-monarchy', // a Parliament decides by majority, a Crown gives assent, courts may bar
  'direct-democracy', // the people vote on every petition; a Council advises; a Court may bar
  'one-party', // the Party Congress recommends, the Politburo decides; courts advise only
  'absolute-monarchy', // the Monarch decides; a Privy Council advises; nobody may bar
  'theocracy', // a Council of Elders may bar on doctrine; a Supreme Leader decides
  'junta', // the Council of Officers votes and the Chairman decides; nothing else binds
  'custom',
] as const

export type FormId = (typeof FORM_IDS)[number]

// What a body is, which decides how it is drawn and which AI task plays it.
export type BodyKind =
  | 'legislature' // seats in parties; debates, ranks the options, divides
  | 'court' // justices; rules each option permitted or barred
  | 'council' // a small named group: advises, or votes like a court or a legislature
  | 'electorate' // the people, by referendum; their mood comes from the world
  | 'ministry' // one per portfolio; advises and costs, never decides

// What a body does with a petition. One body may hold several roles over time if the
// constitution is amended, but holds one per petition.
export type Role =
  | 'recommend' // ranks every option (and dismissal); its first preference may bind
  | 'review' // rules each option permitted or barred, by a vote among its members
  | 'decide' // the executive: takes one option, or dismisses
  | 'advise' // writes advice and a costing; binds nobody
  | 'assent' // a formality the body may refuse: it either signs the decision or does not

export interface Party {
  id: string
  name: string
  // "the Hands", "the Counters". Optional; the name is used if absent.
  nickname?: string
  seats: number
  leader: string
  // Two or three sentences: what it believes and how it behaves.
  description: string
  // The engine factions whose interests it carries, most important first. The rules-based
  // stand-in reads them to work out how the party votes when no AI is connected.
  factions: string[]
  // A CSS colour for the seat chart, drawn in both themes. Hex only.
  colour: string
}

export interface Member {
  id: string
  name: string
  // A party id for a legislature, otherwise empty.
  party: string
  // "Speaker", "Chief Justice", "Leader of the Open Hand", "Minister for Health".
  office?: string
  // One or two sentences in their own colours: what they care about, how they talk.
  character: string
  // For a court or a council: how they read the law. Free text, e.g. "textualist".
  philosophy?: string
}

export interface Body {
  id: string
  kind: BodyKind
  // "The Commonwealth Assembly", "The High Court of the Charter".
  name: string
  // "the Assembly", "the Court". Used in running text.
  shortName: string
  // For a legislature: total seats. For a court or council: the number of members.
  size: number
  parties: Party[]
  members: Member[]
  // For a ministry: the engine portfolio it speaks for.
  portfolio?: string
  description: string
}

// One step of how a petition moves. Steps run in the order listed; steps with the same
// stage number run at the same time (the Assembly and the Court sit in parallel).
export interface Step {
  body: string
  role: Role
  stage: number
  // For recommend: the share of the whole body that makes its first preference bind the
  // executive (101 of 151 is 2/3). Absent means it never binds.
  bindAt?: number
  // For recommend: the share needed to carry at all (a simple majority is 0.5, carried
  // means more than this share). Below it the recommendation is only a ranking.
  carryAt?: number
  // For review: how many members must vote to bar an option (4 of 7).
  barVotes?: number
  // For review: false makes the ruling advice only, as in a one-party state's courts.
  binding?: boolean
  // For recommend: true when the body's vote is the decision itself, with no executive
  // choice left (a parliament that decides, a referendum).
  decisive?: boolean
}

export interface Rules {
  // The executive office: who takes the decision unless a step is decisive.
  executive: { title: string; holder: string }
  steps: Step[]
  // The executive may set aside a carried (but not binding) recommendation, with written
  // reasons, and take another permitted option or dismiss.
  vetoWithReasons: boolean
  // When review bars the recommending body's first preference, it sits again to choose
  // among the permitted options only.
  reconciliation: boolean
  // Remonstrances, references, replies and addresses allowed per petition beyond the first
  // round. Claudetopia allows three.
  exchanges: number
  // Dismissal is the last resort: taken only when every option is barred, or the sole
  // permitted option is rejected on reconciliation by the binding share.
  dismissOnlyAtStandstill: boolean
  // Minor matters go through every step (true) or are decided by the executive alone,
  // still subject to review if a review step exists (false).
  minorsThroughBodies: boolean
}

export interface Article {
  // "0", "65", "C3" for a right.
  number: string
  title: string
  text: string
}

export interface Right {
  id: string // "C1"
  title: string
  text: string
  // For the rules-based Court: option tags this right protects against, and indicators an
  // option may not push down by more than the guard. Ignored when the AI plays the Court.
  against: string[]
  guards: { indicator: IndicatorId; floor: number }[]
  // Cannot be limited by any law. The rules-based Court bars on these whatever the vote.
  absolute: boolean
}

export interface Constitution {
  form: FormId
  // "The Commonwealth of Claudetopia" style long name for the state.
  stateName: string
  // "Commonwealth", "Republic", "Kingdom".
  formName: string
  // When it took effect, as an engine day. Amendments add a new version with a later day.
  since: number
  articles: Article[]
  rights: Right[]
  rules: Rules
  // The amendment rule in words. Amending is a bill or a Word; see Amendment below.
  amendment: string
}

export interface Press {
  id: string
  name: string
  // "sober, of record", "sceptical, commercial", "loud, populist, capital letters".
  line: string
  kind: 'paper' | 'broadcaster'
}

// Everything a nation's government is made of. Generated at founding (forms.ts, from the
// form, the pack's factions and portfolios, and the seed), optionally reworded by the AI,
// and kept in the save. It changes only by amendment, revolution, election or a Word.
export interface Institutions {
  constitution: Constitution
  bodies: Body[]
  press: Press[]
  // The player, above every branch: Aegis for Claudetopia.
  founder: { name: string; title: string }
  // How the nation's own days map to dates. Day 1 is this date.
  calendar: { start: string }
  // Fixed facts the AI must not contradict, one line each. The canon of the nation.
  canon: string[]
}

// ---------------------------------------------------------------------------------------
// Who plays the executive
// ---------------------------------------------------------------------------------------

// 'govern': the player holds the executive office and decides each petition within the
// rules. 'found': an AI executive decides and the player watches, stepping in by Word.
export type Mode = 'govern' | 'found'

// ---------------------------------------------------------------------------------------
// The petition: one dilemma moving through the bodies
// ---------------------------------------------------------------------------------------

export const DISMISS = 'dismiss'

// An option id from the dilemma, or DISMISS.
export type Course = string

export interface Division {
  aye: number
  no: number
  abstain: number
  // By party id. Each party's three numbers add up to its seats present.
  byParty: Record<string, { aye: number; no: number; abstain: number }>
}

export interface Sitting {
  body: string
  // 'first' for the first sitting, 'reconciliation' after review barred the first
  // preference, 'exchange' when answering another body.
  kind: 'first' | 'reconciliation' | 'exchange'
  // Every course, best first, including DISMISS.
  ladder: Course[]
  firstPreference: Course
  division: Division
  // Worked out by code from the division and the step, never taken from the model.
  carried: boolean
  binding: boolean
  // A message to another body, if the house moved one.
  remonstrance?: string
  address?: string
  document: string // the Hansard document id
  ai: boolean // false when the rules-based stand-in sat
  // Facts the sitting had to invent, to be added to the nation's canon.
  canon?: string[]
}

export interface Ruling {
  course: Course
  // Each member's vote. The verdict below is worked out from these by code.
  votes: Record<string, 'permit' | 'bar'>
  verdict: 'permitted' | 'barred'
  articles: string[]
  // Limits on a permitted option: "only if the register is not kept".
  markers: string[]
}

export interface Review {
  body: string
  kind: 'first' | 'reply'
  rulings: Ruling[]
  binding: boolean
  cautions: string[]
  // Directions to the executive that stay in force. Copied into the directions register.
  directions: string[]
  document: string
  ai: boolean
  canon?: string[]
}

export interface Advice {
  body: string
  // Which course the ministry favours, if any.
  favours?: Course
  summary: string
  // A costing in the nation's currency, as words: "about 0.3bn a year".
  costing?: string
  document: string
  ai: boolean
}

export interface Assent {
  body: string
  given: boolean
  reasons: string
  document: string
}

export interface Exchange {
  from: string
  to: string
  kind: 'remonstrance' | 'reference' | 'reply' | 'address' | 'message'
  text: string
  document: string
}

// What the rules leave the executive free to do, worked out by rules.ts from the sittings
// and reviews so far. The screens and the AI executive read this; neither works it out.
export interface Standing {
  permitted: Course[]
  barred: Course[]
  // Set when a binding recommendation (or a decisive vote) leaves exactly one course.
  mustTake?: Course
  // The executive may take any permitted course, but setting aside this one needs reasons.
  vetoable?: Course
  // Every option barred, or the sole permitted option rejected: the petition is dismissed.
  standstill: boolean
  // In plain words, for the screen: "The Assembly carried Option 2 by 112 of 151, so the
  // Steward must take it."
  explanation: string
  // Courses a non-binding review ruled against. They stay open; the screen marks them.
  advisedAgainst?: Course[]
}

export type DocketStatus =
  | 'waiting' // not yet sent to the bodies
  | 'sitting' // bodies are at work
  | 'reconciling'
  | 'exchanging'
  | 'ready' // the executive may decide
  | 'deciding' // the AI executive is at work (found mode)
  | 'decided'
  | 'failed' // a body could not be reached; the stand-in may be used

export interface Docket {
  dilemma: string
  day: number
  // The petition's number in the nation's record: Petition #1, #2...
  number: number
  status: DocketStatus
  advice: Advice[]
  sittings: Sitting[]
  reviews: Review[]
  exchanges: Exchange[]
  assents: Assent[]
  standing: Standing | null
  // Progress lines for the screen while bodies sit: "The Court is in conference".
  progress: string[]
  error?: string
  decision?: Decision
  document: string // the petition document id
}

export interface Decision {
  course: Course
  by: 'executive' | 'body' | 'word' | 'standstill'
  reasons: string
  // A veto of a carried recommendation, with the reasons the rules require.
  veto?: { course: Course; reasons: string }
  // A Founder's Word that overrode the rules for this decision.
  word?: string
  day: number
}

// ---------------------------------------------------------------------------------------
// The Founder
// ---------------------------------------------------------------------------------------

// The player speaking above every branch (Article 0 in Claudetopia). Entered word for word.
export interface Word {
  number: number
  day: number
  text: string
  // What it overrules: a docket's dilemma id, a document id, or nothing.
  overrules?: string
  // Expressly closes the matter: bodies may not argue it further.
  silence: boolean
  // Confirmed after the bodies were heard. An unconfirmed Word is laid before the bodies,
  // who may remonstrate, and takes effect when confirmed.
  confirmed: boolean
  remonstrances: string[] // document ids
  document: string
}

// Something put to the Founder: by the press, a court, a ministry, a citizen.
export interface Question {
  id: string // "Q-0017"
  from: string
  kind: 'court' | 'legislature' | 'counsel' | 'press' | 'ministry' | 'citizen' | 'other' | 'review'
  day: number
  text: string
  status: 'open' | 'answered' | 'no-answer' | 'later'
  answer?: string
  source?: string // a document id
}

export interface Letter {
  id: string
  from: string
  place?: string
  day: number
  text: string
  urgent: boolean
  // The executive's office drafts a reply; the Founder adopts it, changes it, or leaves it.
  draft?: string
  reply?: string
  status: 'unread' | 'read' | 'replied' | 'no-reply'
}

// ---------------------------------------------------------------------------------------
// The rest of government's business
// ---------------------------------------------------------------------------------------

// A bill: the legislature's own business between petitions. A bill may carry bounded
// effects on the engine, which pass through bounds.ts before they are applied.
export interface Bill {
  number: number
  title: string
  body: string // the legislature that has it
  moved: string // member name
  summary: string
  stage: 'introduced' | 'committee' | 'passed' | 'signed' | 'returned' | 'failed' | 'law'
  divisions: { day: number; reading: string; aye: number; no: number; abstain: number }[]
  effects: Effect[]
  // An amendment to the constitution. Applied by the server when the bill becomes law and
  // any referendum it needs has passed.
  amendment?: Amendment
  document: string
}

export interface Amendment {
  // Replace the whole form (a revolution, a new constitution) or change rules in place.
  form?: FormId
  rules?: Partial<Rules>
  articles?: Article[]
  rights?: { add?: Right[]; remove?: string[] }
}

// A factbook entry: the nation's public account of itself, as NationStates kept them.
// Written by the player, or drafted by the AI and then edited.
export interface Factbook {
  id: string
  title: string
  category: 'overview' | 'history' | 'geography' | 'culture' | 'economy' | 'law' | 'government' | 'other'
  body: string // Markdown
  updatedDay: number
  author: 'founder' | 'ai'
}

// ---------------------------------------------------------------------------------------
// The census: NationStates-style figures, derived from the engine
// ---------------------------------------------------------------------------------------

// The fixed points a nation's figures are scaled from. Set at founding (from the founding
// answers) or by import. The census moves them by the indicators; it never stores a result.
export interface CensusBase {
  population: number // people
  gdpPerHead: number // in the nation's currency per year
  taxRate: number // percent
  crimePerHour: number
  // Daily growth of the population at neutral indicators, as a fraction.
  growth: number
}

export interface CensusFigure {
  id: string
  name: string
  value: number
  unit: string
  // "Superb", "Excellent", "Good"... for the headline ratings; empty for plain figures.
  rating?: string
  description: string
}

// ---------------------------------------------------------------------------------------
// The world's day
// ---------------------------------------------------------------------------------------

export interface WorldDay {
  day: number
  weather: string
  events: { headline: string; text: string; island?: string }[]
  reaction: string
  press: { outlet: string; headline: string; text: string }[]
  opinion: string
  poll?: { question: string; results: Record<string, number> }
  matters: { to: string; text: string }[]
  // Bounded effects of the day's events, applied by the server through bounds.ts.
  effects: Effect[]
  document: string
  ai: boolean
  canon?: string[]
}

// ---------------------------------------------------------------------------------------
// What a save holds above the engine
// ---------------------------------------------------------------------------------------

export interface GovernmentState {
  version: number
  mode: Mode
  institutions: Institutions
  censusBase: CensusBase
  dockets: Record<string, Docket> // by dilemma id, today's and any still open
  petitions: number // the last petition number used
  words: Word[]
  questions: Question[]
  letters: Letter[]
  bills: Bill[]
  directions: { day: number; from: string; text: string; document: string; done: boolean }[]
  factbooks: Factbook[]
  worldDays: number[] // engine days the world has written
  // The day the last world day was written, so a reload does not write it twice.
  lastWorldDay: number
  // Where the nation came from, for an imported one: "claudetopia-archive".
  origin?: string
}

export const GOVERNMENT_VERSION = 1

// ---------------------------------------------------------------------------------------
// The Archive: every document the government and the world produce
// ---------------------------------------------------------------------------------------

export const SERIES = [
  'petition', // one per docket: the issue, each body's part, the decision, the effects
  'hansard', // sittings of a legislature
  'court', // opinions and replies
  'advice', // ministry papers
  'papers', // the executive's papers: decisions, vetoes, answers, instructions
  'words', // the Founder's Words and the remonstrances against them
  'almanac', // the world's days: events, the press, opinion
  'bills',
  'letters',
  'questions',
  'factbook',
  'law', // the constitution, the charter, statutes in force
  'lore', // history, geography, people, economy, canon
  'hearing',
  'other',
] as const

export type Series = (typeof SERIES)[number]

export interface DocumentHead {
  id: string // `${series}-${seq padded to 5}`
  series: Series
  title: string
  day: number
  date: string // the nation's own date, written out: "Tuesday 20 October 2026"
  issuer: string // "The Commonwealth Assembly"
  kind: string // "sitting", "opinion", "front page", "word"...
  refs: string[] // document ids it cites, and dilemma ids
}

export interface ArchiveDocument extends DocumentHead {
  body: string // Markdown. Rendered as text; no raw HTML ever passes through
  data?: unknown // the structured part, when the document came from a typed task
}

// ---------------------------------------------------------------------------------------
// AI tasks
// ---------------------------------------------------------------------------------------

// Each task is played by one prompt in packages/ai/prompts, asks for a tier, and returns
// JSON that validate.ts checks before anything is used. A task that fails validation is
// retried once, then the rules-based stand-in in standins.ts takes its place and the
// record says so.
export const TASKS = [
  'legislature.sitting',
  'court.opinion',
  'council.sitting', // a council that votes like a court or a legislature
  'electorate.referendum',
  'ministry.advice',
  'executive.decision', // found mode only
  'world.day',
  'founding.institutions', // reword a generated government in the nation's own colours
  'factbook.draft',
  'letters.draft', // letters to the Founder from the public, and the office's draft replies
  'exchange.reply', // a body answering a remonstrance, reference, address or message
  'bill.sitting', // the legislature's own business: bills, readings, divisions
] as const

export type Task = (typeof TASKS)[number]

export type Tier = 'bulk' | 'standard' | 'strategic'

export const TASK_TIERS: Record<Task, Tier> = {
  'legislature.sitting': 'strategic',
  'court.opinion': 'strategic',
  'council.sitting': 'standard',
  'electorate.referendum': 'standard',
  'ministry.advice': 'bulk',
  'executive.decision': 'strategic',
  'world.day': 'standard',
  'founding.institutions': 'standard',
  'factbook.draft': 'standard',
  'letters.draft': 'bulk',
  'exchange.reply': 'standard',
  'bill.sitting': 'standard',
}

// What every task is given. Everything a model reads about the nation comes through here,
// as data. Player-written text (names, Words, answers) is marked as such in the prompt.
export interface Brief {
  nation: {
    name: string
    demonym: string
    capital: string
    currency: string
    leaderTitle: string
    motto?: string
    animal?: string
    faith?: string
  }
  date: string
  day: number
  form: { id: FormId; name: string; executive: string }
  // The player, above every branch, so a body can name the Founder when it answers a Word.
  founder?: { name: string; title: string }
  // Indicators and support as words ("Liberty: high, 72"), the census headline figures.
  standing: string[]
  canon: string[]
  // The Founder's Words in force that bear on this, word for word.
  // confirmed: false is a Word laid before the bodies and not yet in force: they may argue
  // with it, and it binds nobody until the Founder confirms it.
  words: { number: number; text: string; silence: boolean; confirmed: boolean }[]
  // Recent and relevant record: titles and short extracts, newest first, bounded in size.
  record: { id: string; title: string; extract: string }[]
  // Set when the backend can read files: the nation's archive folder, so an agent can read
  // its own past sittings and opinions in full, as the Claudetopia agents did.
  archivePath?: string
}

// A petition as the bodies see it.
export interface PetitionBrief {
  number: number
  dilemma: string
  title: string
  description: string
  kind: 'major' | 'minor'
  neighbour?: string
  // The dilemma's own tags. The rules-based Court reads them with each option's tags.
  tags?: string[]
  options: {
    course: Course
    number: number
    advocate: string
    speech: string
    // The engine's forecast in words: "Liberty down a fair amount: cameras on every corner."
    forecast: string[]
    tags: string[]
    // The same forecast as numbers, for the rules-based stand-ins. Absent for dismissal.
    effects?: { faction: string; by: number }[]
    indicators?: { indicator: IndicatorId; by: number }[]
  }[]
}

// Bounded, per-day limits on what any AI-proposed effect may do. Enforced by bounds.ts.
export interface EffectBounds {
  perEffect: number // largest single indicator or faction move
  perDay: number // largest total movement of any one indicator from AI effects in a day
  maxEffects: number // per document
}

export const DEFAULT_BOUNDS: EffectBounds = { perEffect: 3, perDay: 5, maxEffects: 4 }

// A change that came from the government layer rather than a dilemma: a bill, an event, a
// Word. Recorded on the engine's timeline so every number keeps its reason.
export interface ExternalChange {
  kind: 'event' | 'law' | 'word'
  headline: string
  text?: string
  changes: Change[]
}

// ---------------------------------------------------------------------------------------
// Task inputs and outputs. Inputs are built by the server (packages/government/briefs.ts);
// outputs are what a model must return, checked by validate.ts. Numbers a model returns
// are re-derived or clamped by code wherever code can work them out.
// ---------------------------------------------------------------------------------------

export interface TaskInput {
  'legislature.sitting': {
    brief: Brief
    body: Body
    petition: PetitionBrief
    kind: Sitting['kind']
    // The thresholds this sitting is tested against, so members can vote with them in mind.
    step?: { bindAt?: number; carryAt?: number; decisive?: boolean }
    // For reconciliation: only these may be ranked first, and the review that barred the rest.
    permitted?: Course[]
    review?: { document: string; summary: string }
    advice: { body: string; summary: string }[]
  }
  'court.opinion': {
    brief: Brief
    body: Body
    petition: PetitionBrief
    rights: Right[]
    articles: Article[]
    // Earlier rulings to follow, distinguish or overrule.
    precedents: { id: string; title: string; extract: string }[]
    barVotes: number
  }
  'council.sitting': TaskInput['court.opinion'] | TaskInput['legislature.sitting']
  'electorate.referendum': { brief: Brief; petition: PetitionBrief; mood: string }
  'ministry.advice': { brief: Brief; body: Body; petition: PetitionBrief }
  'executive.decision': {
    brief: Brief
    petition: PetitionBrief
    standing: Standing
    // ladder: the body's ranking, best first, when it sat on the petition.
    sittings: { body: string; summary: string; ladder?: Course[] }[]
    reviews: { body: string; summary: string }[]
    advice: { body: string; summary: string }[]
    // The executive's own standing priorities, if the nation has written them down.
    doctrine: string
  }
  'world.day': {
    brief: Brief
    // What the government actually did today and what moved, as the record shows.
    decisions: { title: string; course: string; result: string; changes: string[] }[]
    timeline: string[]
    press: Press[]
    bounds: EffectBounds
  }
  'founding.institutions': { brief: Brief; institutions: Institutions }
  'factbook.draft': { brief: Brief; category: Factbook['category']; title: string; notes: string }
  'letters.draft': { brief: Brief; count: number; recent: string[] }
  'exchange.reply': {
    brief: Brief
    body: Body
    exchange: { from: string; kind: Exchange['kind']; text: string }
    petition?: PetitionBrief
    own: { document: string; summary: string }
    // For a court answering a remonstrance: the courses it barred that it could read down.
    barred?: Course[]
  }
  'bill.sitting': { brief: Brief; body: Body; bills: Bill[]; bounds: EffectBounds }
}

export interface TaskOutput {
  'legislature.sitting': {
    // Markdown: the debate with named speakers, in their own voices.
    debate: string
    ladder: Course[]
    division: Division
    remonstrance?: string
    address?: string
    canon?: string[]
  }
  'court.opinion': {
    rulings: { course: Course; votes: Record<string, 'permit' | 'bar'>; articles: string[]; markers: string[] }[]
    // Markdown: headnote, majority opinion with its author, concurrences, dissents.
    opinion: string
    cautions: string[]
    directions: string[]
    canon?: string[]
  }
  'council.sitting': TaskOutput['court.opinion'] | TaskOutput['legislature.sitting']
  'electorate.referendum': {
    // Shares of the vote by course, adding to 100. Turnout as a share.
    results: Record<Course, number>
    turnout: number
    campaign: string // Markdown
  }
  'ministry.advice': { favours?: Course; summary: string; costing?: string; paper: string }
  'executive.decision': {
    course: Course
    reasons: string
    veto?: { course: Course; reasons: string }
    papers: string // Markdown, for the executive's papers
  }
  'world.day': Omit<WorldDay, 'day' | 'document' | 'ai'> & { almanac: string; canon?: string[] }
  'founding.institutions': {
    bodies: { id: string; name?: string; shortName?: string; description?: string; parties?: Partial<Party>[]; members?: Partial<Member>[] }[]
    press?: Partial<Press>[]
    canon: string[]
    lore: { title: string; body: string }[]
  }
  'factbook.draft': { title: string; body: string }
  'letters.draft': { letters: { from: string; place?: string; text: string; urgent: boolean; draft: string }[] }
  'exchange.reply': { text: string; changes?: { course: Course; verdict?: 'permitted' | 'barred'; ladder?: Course[] }[]; document: string }
  'bill.sitting': {
    bills: { number?: number; title: string; moved: string; summary: string; stage: Bill['stage']; division?: { reading: string; aye: number; no: number; abstain: number }; effects?: Effect[] }[]
    hansard: string
  }
}

// ---------------------------------------------------------------------------------------
// The save file and the AI provider
// ---------------------------------------------------------------------------------------

// data/nations/<id>/save.json. state is the engine's own serialize() text.
export interface SaveFile2 {
  format: 2
  id: string
  createdAt: string
  updatedAt: string
  state: string
  history: { day: number; indicators: Record<IndicatorId, number>; support: number; factions: Record<string, number> }[]
  government: GovernmentState
}

export interface ProviderStatus {
  backend: 'none' | 'anthropic' | 'claude-cli'
  ok: boolean
  // Plain words: "Claude API key ending 4f2a", "claude 2.3.1, signed in", "AI is off".
  detail: string
  models: Record<Tier, string>
}

// Implemented by packages/ai. Returns the model's parsed JSON, unvalidated: the caller
// validates it. Throws (with a message a player can act on) when the provider cannot be
// reached, the reply is not JSON, or it is refused.
export interface Provider {
  status(): Promise<ProviderStatus>
  run<T extends Task>(task: T, input: TaskInput[T], options?: { archivePath?: string; signal?: AbortSignal }): Promise<unknown>
}
