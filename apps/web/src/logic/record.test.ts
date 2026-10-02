import { ENTRY_KINDS, type TimelineEntry } from '@diplomat/engine'
import { describe, expect, it } from 'vitest'
import { played } from '../test/fixtures.ts'
import { FILTERS, recordDays, summaryLine } from './record.ts'

const entry = (day: number, kind: TimelineEntry['kind'], headline: string): TimelineEntry => ({
  day,
  kind,
  headline,
  changes: [],
})

const timeline = [
  entry(1, 'founding', 'Founded'),
  entry(1, 'decision', 'First'),
  entry(1, 'decision', 'Second'),
  entry(2, 'consequence', 'It came back'),
  entry(4, 'budget', 'Books'),
  entry(4, 'election', 'Vote'),
]

describe('recordDays', () => {
  it('groups by day, newest first, and newest first within a day', () => {
    const days = recordDays(timeline)
    expect(days.map((d) => d.day)).toEqual([4, 2, 1])
    expect(days[0]!.entries.map((e) => e.entry.headline)).toEqual(['Vote', 'Books'])
    expect(days[2]!.entries.map((e) => e.entry.headline)).toEqual(['Second', 'First', 'Founded'])
  })

  it('keeps each entry with its place in the timeline', () => {
    for (const day of recordDays(timeline)) {
      for (const item of day.entries) expect(timeline[item.index]).toBe(item.entry)
    }
  })

  it('filters by kind and drops the days left empty', () => {
    expect(recordDays(timeline, 'decisions').map((d) => [d.day, d.entries.length])).toEqual([[1, 2]])
    expect(recordDays(timeline, 'power').flatMap((d) => d.entries.map((e) => e.entry.kind))).toEqual([
      'election',
      'founding',
    ])
    expect(recordDays(timeline, 'reputation')).toEqual([])
  })

  it('is empty for an empty timeline', () => {
    expect(recordDays([])).toEqual([])
  })

  it('accounts for every entry of a real game exactly once', () => {
    const state = played(50)
    const days = recordDays(state.timeline)
    expect(days.reduce((sum, d) => sum + d.entries.length, 0)).toBe(state.timeline.length)
    expect(days.map((d) => d.day)).toEqual([...days.map((d) => d.day)].sort((a, b) => b - a))
  })

  it('gets through ten thousand entries without fuss', () => {
    const long = Array.from({ length: 10000 }, (_, i) =>
      entry(1 + Math.floor(i / 4), 'decision', `Entry ${i}`),
    )
    const started = performance.now()
    const days = recordDays(long)
    expect(days).toHaveLength(2500)
    expect(performance.now() - started).toBeLessThan(200)
  })
})

describe('the filters', () => {
  it('between them cover every kind of entry once', () => {
    const covered = FILTERS.flatMap((f) => f.kinds ?? [])
    expect([...covered].sort()).toEqual([...ENTRY_KINDS].sort())
  })
})

describe('summaryLine', () => {
  it('counts entries and days in words that agree', () => {
    expect(summaryLine(1, 1)).toBe('One entry over one day')
    expect(summaryLine(240, 91)).toBe('240 entries over 91 days')
  })
})
