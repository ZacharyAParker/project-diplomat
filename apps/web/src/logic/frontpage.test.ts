import { ELECTION_HEADLINES, type GameState, type TimelineEntry } from '@diplomat/engine'
import { describe, expect, it } from 'vitest'
import { content, founded, identity, played } from '../test/fixtures.ts'
import { KICKERS, composeFrontPage, editionEntries, leadIndex, paperName } from './frontpage.ts'

function entry(
  day: number,
  kind: TimelineEntry['kind'],
  headline: string,
  moves: number[] = [],
): TimelineEntry {
  return {
    day,
    kind,
    headline,
    changes: moves.map((by) => ({ kind: 'indicator', target: 'health', by, why: 'A reason.' })),
  }
}

function onDay(day: number, timeline: TimelineEntry[]): GameState {
  return { ...founded(), day, timeline }
}

describe("the paper's name", () => {
  it('is the same every time for the same nation', () => {
    expect(paperName(identity, 42)).toBe(paperName(identity, 42))
  })

  it('is built from the nation and keeps its style when the nation is renamed', () => {
    const before = paperName(identity, 42)
    const after = paperName({ ...identity, name: 'Zembry', capital: 'Caxby', demonym: 'Zembrian' }, 42)
    expect(before).toMatch(/Highmarch|Vesland/)
    expect(after).toMatch(/Caxby|Zembr/)
    expect(after.replace(/Caxby|Zembrian|Zembry/, '*')).toBe(
      before.replace(/Highmarch|Veslander|Vesland/, '*'),
    )
  })

  it('varies between nations', () => {
    const names = new Set(Array.from({ length: 40 }, (_, seed) => paperName(identity, seed)))
    expect(names.size).toBeGreaterThan(2)
  })
})

describe('which entries make the edition', () => {
  const timeline = [
    entry(1, 'founding', 'Founded'),
    entry(1, 'decision', 'Day one decision'),
    entry(1, 'budget', 'Day one night'),
    entry(2, 'decision', 'Day two decision'),
  ]

  it('prints only the founding on day 1, even after a decision has been made', () => {
    expect(editionEntries({ day: 1, timeline }).map((e) => e.headline)).toEqual(['Founded'])
  })

  it('prints the day before on later days, without the founding', () => {
    expect(editionEntries({ day: 2, timeline }).map((e) => e.headline)).toEqual([
      'Day one decision',
      'Day one night',
    ])
    expect(editionEntries({ day: 3, timeline }).map((e) => e.headline)).toEqual(['Day two decision'])
    expect(editionEntries({ day: 9, timeline })).toEqual([])
  })
})

describe('choosing the lead', () => {
  const state = founded()

  it('leads with the story that moved the most, and the earlier one on a tie', () => {
    const entries = [
      entry(1, 'decision', 'a', [2, -2]),
      entry(1, 'decision', 'b', [-9]),
      entry(1, 'budget', 'c', [9]),
    ]
    expect(leadIndex(entries, state, content)).toBe(1)
    expect(leadIndex([], state, content)).toBe(-1)
  })

  it('leads with an election over anything bigger', () => {
    const entries = [entry(1, 'decision', 'a', [10, 10]), entry(1, 'election', ELECTION_HEADLINES.won, [6])]
    expect(leadIndex(entries, state, content)).toBe(1)
  })

  it('leads with a fallen government over an election', () => {
    const entries = [entry(1, 'election', 'x', [6]), entry(1, 'government', 'The government falls')]
    expect(leadIndex(entries, state, content)).toBe(1)
  })

  it('leads with the end of a situation, but not with its start or its stages', () => {
    const situation = content.situations[0]
    if (!situation) return
    const ending = situation.outcomes[0]!.headline
    const entries = [
      entry(1, 'decision', 'big', [10, 10]),
      entry(1, 'situation', situation.title),
      entry(1, 'situation', ending, [1]),
    ]
    expect(leadIndex(entries, state, content)).toBe(2)
    expect(leadIndex(entries.slice(0, 2), state, content)).toBe(0)
  })
})

describe('composing the page', () => {
  it('leads the first paper with the founding', () => {
    const state = founded()
    const page = composeFrontPage(state, content)
    expect(page.quiet).toBe(false)
    expect(page.day).toBe(1)
    expect(page.paper).toBe(paperName(state.identity, state.seed))
    expect(page.lead.kind).toBe('founding')
    expect(page.lead.kicker).toBe(KICKERS.founding)
    expect(page.lead.headline).toBe('Vesland is founded')
    expect(page.lead.paragraphs.length).toBeGreaterThan(0)
    expect(page.briefs).toEqual([])
  })

  it('splits a busy day into a lead and briefs, one story per entry', () => {
    const timeline = [
      entry(4, 'decision', 'Small', [1]),
      entry(4, 'consequence', 'Big', [8, -3]),
      entry(4, 'budget', 'Books'),
    ]
    const page = composeFrontPage(onDay(5, timeline), content)
    expect(page.lead.headline).toBe('Big')
    expect(page.lead.paragraphs).toEqual(['A reason; public health improves.'])
    expect(page.briefs.map((b) => b.headline)).toEqual(['Small', 'Books'])
    expect(page.briefs.map((b) => b.kicker)).toEqual([KICKERS.decision, KICKERS.budget])
  })

  it('sets the lead as copy: one paragraph per group, three reasons at most in each', () => {
    const faction = content.factions[0]!
    const lead: TimelineEntry = {
      day: 4,
      kind: 'decision',
      headline: 'Big',
      changes: [
        { kind: 'indicator', target: 'debt', by: 9, why: 'One.' },
        { kind: 'faction', target: faction.id, by: -4, why: 'Five.' },
        { kind: 'indicator', target: 'health', by: 2, why: 'Two.' },
        { kind: 'indicator', target: 'liberty', by: -2, why: 'Three.' },
        { kind: 'indicator', target: 'living', by: 2, why: 'Four.' },
      ],
    }
    const page = composeFrontPage(onDay(5, [lead]), content)
    expect(page.lead.paragraphs).toEqual([
      'One; the debt grows sharply. Two, and public health improves a little. Three; liberty contracts a little.',
      'Four, and living standards rise a little.',
      `Five; approval among ${faction.name.replace(/^The /, 'the ')} falls a little.`,
    ])
  })

  it('prints one reason once when two effects share it', () => {
    const twice: TimelineEntry = {
      day: 4,
      kind: 'decision',
      headline: 'Twice',
      changes: [
        { kind: 'indicator', target: 'debt', by: 1, why: 'The same.' },
        { kind: 'indicator', target: 'debt', by: 1, why: 'The same.' },
      ],
    }
    expect(composeFrontPage(onDay(5, [twice]), content).lead.paragraphs).toEqual([
      'The same; the debt grows a little.',
    ])
  })

  it('keeps a brief brief: what moved most, in the order it happened', () => {
    const small: TimelineEntry = {
      day: 4,
      kind: 'decision',
      headline: 'Small',
      text: 'It was agreed.',
      changes: [
        { kind: 'indicator', target: 'health', by: 1, why: 'Least.' },
        { kind: 'indicator', target: 'debt', by: 3, why: 'Most.' },
        { kind: 'indicator', target: 'liberty', by: 2, why: 'Middle.' },
      ],
    }
    const page = composeFrontPage(onDay(5, [entry(4, 'consequence', 'Big', [9]), small]), content)
    expect(page.briefs[0]!.paragraphs).toEqual([
      'Most; the debt grows a little. Middle, and liberty expands a little.',
    ])
  })

  it('prints a dry page for a day when nothing happened, the same one each time', () => {
    const state = onDay(30, [])
    const page = composeFrontPage(state, content)
    expect(page.quiet).toBe(true)
    expect(page.lead.kind).toBe('quiet')
    expect(page.lead.headline).not.toBe('')
    expect(page.lead.text).not.toMatch(/[{}]/)
    expect(composeFrontPage(state, content)).toEqual(page)
  })

  it('never prints an id, a macro or a bare figure in a composed sentence', () => {
    let state = played(0)
    for (let day = 0; day < 20; day++) {
      const page = composeFrontPage(state, content)
      for (const story of [page.lead, ...page.briefs]) {
        for (const line of story.paragraphs) {
          expect(line).not.toMatch(/[{}_]|[+-]\d/)
          expect(line).toMatch(/[.!?]["')]?$/)
        }
      }
      state = played(day + 1)
    }
  })
})
