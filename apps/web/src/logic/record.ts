import type { EntryKind, TimelineEntry } from '@diplomat/engine'

export interface Filter {
  id: string
  label: string
  // Null lets everything through.
  kinds: readonly EntryKind[] | null
}

export const FILTERS = [
  { id: 'all', label: 'Everything', kinds: null },
  { id: 'decisions', label: 'Decisions', kinds: ['decision'] },
  { id: 'crises', label: 'Crises', kinds: ['situation'] },
  { id: 'aftermath', label: 'Aftermath', kinds: ['consequence'] },
  { id: 'promises', label: 'Promises', kinds: ['promise'] },
  { id: 'treasury', label: 'Treasury', kinds: ['budget'] },
  { id: 'abroad', label: 'Abroad', kinds: ['treaty'] },
  { id: 'power', label: 'Power', kinds: ['founding', 'election', 'government', 'cabinet'] },
  { id: 'reputation', label: 'Reputation', kinds: ['trait'] },
] as const satisfies readonly Filter[]

export type FilterId = (typeof FILTERS)[number]['id']

export interface RecordEntry {
  // Its place in the timeline, which is the only thing about an entry that is unique.
  index: number
  entry: TimelineEntry
}

export interface RecordDay {
  day: number
  entries: RecordEntry[]
}

// Newest first, by day and within a day. One pass from the end, so a timeline of
// thousands costs no more than reading it.
export function recordDays(timeline: readonly TimelineEntry[], filter: FilterId = 'all'): RecordDay[] {
  const kinds: readonly EntryKind[] | null = FILTERS.find((f) => f.id === filter)?.kinds ?? null
  const days: RecordDay[] = []
  for (let index = timeline.length - 1; index >= 0; index--) {
    const entry = timeline[index]!
    if (kinds && !kinds.includes(entry.kind)) continue
    const last = days[days.length - 1]
    if (last && last.day === entry.day) last.entries.push({ index, entry })
    else days.push({ day: entry.day, entries: [{ index, entry }] })
  }
  return days
}

export const DAYS_PER_PAGE = 20

export function summaryLine(entries: number, day: number): string {
  const count = entries === 1 ? 'One entry' : `${entries} entries`
  return `${count} over ${day === 1 ? 'one day' : `${day} days`}`
}
