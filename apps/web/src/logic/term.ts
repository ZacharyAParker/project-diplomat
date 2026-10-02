import {
  ELECTION_HEADLINES,
  INDICATORS,
  INDICATOR_INFO,
  type IndicatorId,
  type TimelineEntry,
} from '@diplomat/engine'
import { direction, tone, totalMovement, type Direction, type Tone } from './changes.ts'
import type { Snapshot } from './saves.ts'

export type Verdict = 'won' | 'reduced' | 'lost' | 'fell'

// How a term ended, if this entry is the end of one.
export function verdictOf(entry: TimelineEntry): Verdict | null {
  if (entry.kind === 'government') return 'fell'
  if (entry.kind !== 'election') return null
  if (entry.headline === ELECTION_HEADLINES.won) return 'won'
  if (entry.headline === ELECTION_HEADLINES.lost) return 'lost'
  return 'reduced'
}

// The election or the fall among a night's entries. The engine never produces both.
export function nightMoment(entries: readonly TimelineEntry[]): TimelineEntry | null {
  return entries.find((entry) => verdictOf(entry) !== null) ?? null
}

export interface TermRow {
  id: IndicatorId
  name: string
  // Null when the save has no snapshot for that day.
  start: number | null
  end: number | null
  direction: Direction
  tone: Tone
}

export interface TermReport {
  verdict: Verdict
  // The first and last day of the term.
  from: number
  to: number
  // The figure the engine printed on polling day, or failing that the level the next
  // government starts on.
  support: { value: number; when: 'polling' | 'after' } | null
  rows: TermRow[]
  // The decisions that moved the most, biggest first.
  decisions: TimelineEntry[]
  kept: string[]
  broken: string[]
  // A change of government drops whatever was still promised and replaces the cabinet.
  cleared: boolean
}

const KEPT = 'Promise kept: '
const BROKEN = 'Promise broken: '
const TOP_DECISIONS = 5

function pollingFigure(entry: TimelineEntry): number | null {
  const match = /Support stood at (\d+(?:\.\d+)?)/.exec(entry.text ?? '')
  return match ? Number(match[1]) : null
}

function rows(start: Snapshot | undefined, end: Snapshot | undefined): TermRow[] {
  return INDICATORS.map((id) => {
    const from = start?.indicators[id] ?? null
    const to = end?.indicators[id] ?? null
    const by = from === null || to === null ? 0 : Math.round(to - from)
    return {
      id,
      name: INDICATOR_INFO[id].name,
      start: from,
      end: to,
      direction: direction(by),
      tone: tone({ kind: 'indicator', target: id, by }),
    }
  })
}

// The term that ended with this entry: from the morning after the last election or fall
// (or the founding) to the night this one happened.
export function termReport(
  ending: TimelineEntry,
  timeline: readonly TimelineEntry[],
  history: readonly Snapshot[],
): TermReport | null {
  const verdict = verdictOf(ending)
  if (!verdict) return null
  const to = ending.day
  let from = 1
  for (const entry of timeline) {
    if (entry.day >= to) break
    if (verdictOf(entry)) from = entry.day + 1
  }
  const within = timeline.filter((entry) => entry.day >= from && entry.day <= to)
  const promises = within.filter((entry) => entry.kind === 'promise').map((entry) => entry.headline)
  const end = history.find((s) => s.day === to)
  const polled = pollingFigure(ending)

  return {
    verdict,
    from,
    to,
    support:
      polled !== null
        ? { value: polled, when: 'polling' }
        : end
          ? { value: end.support, when: 'after' }
          : null,
    rows: rows(
      history.find((s) => s.day === from - 1),
      end,
    ),
    decisions: within
      .filter((entry) => (entry.kind === 'decision' || entry.kind === 'situation') && entry.changes.length)
      .map((entry, i) => ({ entry, i, moved: totalMovement(entry.changes) }))
      .sort((a, b) => b.moved - a.moved || a.i - b.i)
      .slice(0, TOP_DECISIONS)
      .map(({ entry }) => entry),
    kept: promises.filter((h) => h.startsWith(KEPT)).map((h) => h.slice(KEPT.length)),
    broken: promises.filter((h) => h.startsWith(BROKEN)).map((h) => h.slice(BROKEN.length)),
    cleared: verdict === 'lost' || verdict === 'fell',
  }
}

export const VERDICT_TITLES: Record<Verdict, string> = {
  won: 'Election night',
  reduced: 'Election night',
  lost: 'Election night',
  fell: 'The government falls',
}

export const VERDICT_LINES: Record<Verdict, string> = {
  won: 'Re-elected',
  reduced: 'Returned, with fewer seats',
  lost: 'Voted out',
  fell: 'Brought down',
}
