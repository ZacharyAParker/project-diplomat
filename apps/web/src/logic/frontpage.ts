import {
  render,
  type Change,
  type Content,
  type EntryKind,
  type GameState,
  type Identity,
  type TimelineEntry,
} from '@diplomat/engine'
import { groupChanges, sentence, totalMovement } from './changes.ts'
import { hash } from './rng.ts'

export interface Story {
  kind: EntryKind | 'quiet'
  kicker: string
  headline: string
  text?: string
  // The reasons set as copy, with no ids and no figures. The lead gets every reason, in
  // short paragraphs for the country, the factions and the cabinet. A brief gets one
  // paragraph of what moved most.
  paragraphs: string[]
}

export interface FrontPage {
  paper: string
  // The morning the paper is read on. It reports the day before.
  day: number
  lead: Story
  briefs: Story[]
  quiet: boolean
}

const TITLES: readonly ((identity: Identity) => string)[] = [
  (i) => `The ${i.capital} Courier`,
  (i) => `The ${i.capital} Gazette`,
  (i) => `The ${i.demonym} Dispatch`,
  (i) => `The ${i.capital} Intelligencer`,
  (i) => `The ${i.name} Mercury`,
  (i) => `The ${i.demonym} Examiner`,
  (i) => `The ${i.capital} Post`,
]

// Picked by the seed and not by the name, so the paper keeps its title style if the
// nation is renamed in settings.
export function paperName(identity: Identity, seed: number): string {
  return TITLES[hash(`paper:${seed}`) % TITLES.length]!(identity)
}

export const KICKERS: Record<EntryKind, string> = {
  founding: 'The founding',
  election: 'Election',
  decision: 'Politics',
  consequence: 'Aftermath',
  promise: 'Promises',
  trait: 'Reputation',
  cabinet: 'Cabinet',
  government: 'Government',
  situation: 'Crisis',
  budget: 'Treasury',
  treaty: 'Abroad',
  sandbox: 'Sandbox',
}

const QUIET: readonly { headline: string; text: string }[] = [
  {
    headline: 'Nothing happens',
    text:
      'The {leader} is understood to have taken a full lunch hour. Sources close to the government ' +
      'describe the mood as present.',
  },
  {
    headline: 'Country carries on unaided',
    text:
      'No decisions were taken yesterday, and {capital} woke to find everything roughly where it ' +
      'had been left.',
  },
  {
    headline: 'Slow news day confirmed',
    text: 'In the absence of events, this newspaper has reviewed the weather. It was adequate.',
  },
  {
    headline: 'Government governs quietly',
    text: 'Ministers met, agreed that matters were in hand, and adjourned. The minutes run to four lines.',
  },
]

// Day 1 has no yesterday, so its paper is the founding. After that the paper is everything
// stamped with the day before: that day's decisions and whatever its night brought.
export function editionEntries(state: Pick<GameState, 'day' | 'timeline'>): TimelineEntry[] {
  const wanted = state.day === 1 ? 1 : state.day - 1
  const found: TimelineEntry[] = []
  for (let i = state.timeline.length - 1; i >= 0; i--) {
    const entry = state.timeline[i]!
    if (entry.day < wanted) break
    if (entry.day !== wanted) continue
    if ((entry.kind === 'founding') === (state.day === 1)) found.unshift(entry)
  }
  return found
}

function situationEndings(state: GameState, content: Content): Set<string> {
  const headlines = content.situations.flatMap((s) =>
    s.outcomes.map((o) => render(o.headline, state, content)),
  )
  return new Set(headlines)
}

// An election, a fall or the end of a situation leads whatever else happened. Otherwise
// the story that moved the most numbers does, and the earlier one wins a tie.
export function leadIndex(entries: readonly TimelineEntry[], state: GameState, content: Content): number {
  const endings = situationEndings(state, content)
  const rank = (entry: TimelineEntry) => {
    if (entry.kind === 'government') return 3
    if (entry.kind === 'election') return 2
    if (entry.kind === 'situation' && endings.has(entry.headline)) return 1
    return 0
  }
  const beats = (entry: TimelineEntry, current: TimelineEntry) => {
    const byRank = rank(entry) - rank(current)
    return byRank > 0 || (byRank === 0 && totalMovement(entry.changes) > totalMovement(current.changes))
  }
  let best = -1
  for (let i = 0; i < entries.length; i++) {
    if (best === -1 || beats(entries[i]!, entries[best]!)) best = i
  }
  return best
}

// Two effects with the same target and the same reason are one piece of news.
function distinct(changes: readonly Change[]): Change[] {
  const merged: Change[] = []
  for (const change of changes) {
    const twin = merged.findIndex(
      (c) => c.kind === change.kind && c.target === change.target && c.why === change.why,
    )
    if (twin === -1) merged.push(change)
    else merged[twin] = { ...merged[twin]!, by: merged[twin]!.by + change.by }
  }
  return merged
}

const PARAGRAPH = 3

// Every other sentence is joined differently, so a column of reasons does not read as a
// list, and a long run is broken into paragraphs of three.
function prose(changes: readonly Change[], content: Content): string[] {
  const lines = changes.map((c, i) => sentence(c, content, i % 2 === 1 ? 'and' : 'semicolon'))
  const paragraphs: string[] = []
  for (let i = 0; i < lines.length; i += PARAGRAPH) paragraphs.push(lines.slice(i, i + PARAGRAPH).join(' '))
  return paragraphs
}

const BRIEF_WITH_TEXT = 2
const BRIEF_ALONE = 3

function biggest(changes: readonly Change[], count: number): Change[] {
  const ranked = changes
    .map((change, i) => ({ change, i }))
    .sort((a, b) => Math.abs(b.change.by) - Math.abs(a.change.by) || a.i - b.i)
    .slice(0, count)
  return ranked.sort((a, b) => a.i - b.i).map(({ change }) => change)
}

function story(entry: TimelineEntry, content: Content, lead: boolean): Story {
  const changes = distinct(entry.changes)
  const kept = biggest(changes, entry.text === undefined ? BRIEF_ALONE : BRIEF_WITH_TEXT)
  const paragraphs = lead
    ? groupChanges(changes).flatMap((group) => prose(group.changes, content))
    : prose(kept, content)
  return {
    kind: entry.kind,
    kicker: KICKERS[entry.kind],
    headline: entry.headline,
    ...(entry.text === undefined ? {} : { text: entry.text }),
    paragraphs,
  }
}

function quietStory(state: GameState, content: Content): Story {
  const line = QUIET[hash(`quiet:${state.seed}:${state.day}`) % QUIET.length]!
  return {
    kind: 'quiet',
    kicker: 'Home news',
    headline: line.headline,
    text: render(line.text, state, content),
    paragraphs: [],
  }
}

export function composeFrontPage(state: GameState, content: Content): FrontPage {
  const entries = editionEntries(state)
  const paper = paperName(state.identity, state.seed)
  const at = leadIndex(entries, state, content)
  if (at === -1) return { paper, day: state.day, lead: quietStory(state, content), briefs: [], quiet: true }
  return {
    paper,
    day: state.day,
    lead: story(entries[at]!, content, true),
    briefs: entries.filter((_, i) => i !== at).map((e) => story(e, content, false)),
    quiet: false,
  }
}
