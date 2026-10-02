import { INDICATORS, type GameState } from '@diplomat/engine'
import { describe, expect, it } from 'vitest'
import { content, founded, played } from '../test/fixtures.ts'
import {
  cabinetRows,
  crisisRow,
  deadline,
  factionRows,
  hasPending,
  indicatorRows,
  listWords,
  ordinal,
  policyGroups,
  promiseRows,
  sparkPoints,
  tagWords,
  traitRows,
  trendValues,
  trendWords,
  yesterday,
} from './nation.ts'
import { snapshot, type Snapshot } from './saves.ts'

const flat = (day: number, value: number): Snapshot => ({
  day,
  support: value,
  indicators: Object.fromEntries(INDICATORS.map((id) => [id, value])) as Snapshot['indicators'],
  factions: Object.fromEntries(content.factions.map((f) => [f.id, value])),
})

describe('yesterday', () => {
  const history = [0, 1, 2, 3].map((day) => flat(day, 50 + day))

  it('is the morning of the day before', () => {
    expect(yesterday(history, 4)?.day).toBe(2)
    expect(yesterday(history, 2)?.day).toBe(0)
    expect(yesterday(history, 1)?.day).toBe(0)
  })

  it('is nothing when the save has no history', () => {
    expect(yesterday([], 9)).toBeNull()
  })
})

describe('trend lines', () => {
  it('takes the last thirty day ends in order, then today', () => {
    const history = Array.from({ length: 40 }, (_, day) => flat(day, day)).reverse()
    const values = trendValues(history, (s) => s.support, 99)
    expect(values).toHaveLength(31)
    expect(values[0]).toBe(10)
    expect(values.at(-2)).toBe(39)
    expect(values.at(-1)).toBe(99)
  })

  it('skips a faction the snapshot does not know', () => {
    expect(trendValues([flat(0, 5)], (s) => s.factions['nobody'], 7)).toEqual([7])
  })

  it('draws from the left edge to the right, higher values higher up', () => {
    const points = sparkPoints([40, 50, 60], 72, 18).split(' ')
    expect(points).toHaveLength(3)
    expect(points[0]).toBe('0,18')
    expect(points[2]).toBe('72,0')
  })

  it('does not turn a drift of one point into a cliff', () => {
    const [first, last] = sparkPoints([50, 51], 72, 18)
      .split(' ')
      .map((p) => Number(p.split(',')[1]))
    expect(Math.abs(first! - last!)).toBeLessThan(3)
  })

  it('draws nothing from a single value', () => {
    expect(sparkPoints([50], 72, 18)).toBe('')
  })

  it('says the trend in words', () => {
    expect(trendWords([50, 50])).toBe('No trend yet')
    expect(trendWords([50, 52, 50])).toBe('Where it was 2 days ago')
    expect(trendWords([50, 52, 54])).toBe('Higher than 2 days ago')
    expect(trendWords([60, 52, 41, 40])).toBe('Much lower than 3 days ago')
  })
})

describe('indicatorRows', () => {
  it('has all twelve with no movement and no trend on the first morning', () => {
    const state = founded()
    const rows = indicatorRows(state, [snapshot(state, 0)])
    expect(rows.map((r) => r.id)).toEqual([...INDICATORS])
    expect(rows.every((r) => r.since === null && r.was === r.value)).toBe(true)
    expect(rows.find((r) => r.id === 'debt')).toMatchObject({ name: 'Debt', lowerIsBetter: true })
    expect(trendWords(rows[0]!.trend)).toBe('No trend yet')
  })

  it('reports the move since yesterday morning as a change', () => {
    const state: GameState = { ...founded(), day: 3 }
    const before = flat(1, state.indicators.debt - 4)
    const rows = indicatorRows(state, [flat(0, 10), before, flat(2, 99)])
    const debt = rows.find((r) => r.id === 'debt')!
    expect(debt.was).toBe(state.indicators.debt - 4)
    expect(debt.since).toEqual({ kind: 'indicator', target: 'debt', by: 4, why: '' })
  })

  it('survives a save with no history', () => {
    const rows = indicatorRows(founded(), [])
    expect(rows.every((r) => r.was === null && r.since === null && r.trend.length === 1)).toBe(true)
  })
})

describe('factionRows', () => {
  it('gives each faction its share of the weight, adding up to the whole', () => {
    const state = founded()
    const rows = factionRows(state, content, [snapshot(state, 0)])
    expect(rows.map((r) => r.name)).toEqual(content.factions.map((f) => f.name))
    const total = rows.reduce((sum, r) => sum + r.share, 0)
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(rows.length)
    expect(rows[0]!.approval).toBe(state.factions[rows[0]!.id]!.approval)
  })
})

describe('cabinetRows', () => {
  it('lists every portfolio with its minister and flags the ones close to going', () => {
    const state = founded()
    const first = content.portfolios[0]!
    const shaken: GameState = {
      ...state,
      cabinet: { ...state.cabinet, [first.id]: { name: 'Una Marsh', standing: 14 } },
    }
    const rows = cabinetRows(shaken, content)
    expect(rows).toHaveLength(content.portfolios.length)
    expect(rows[0]).toEqual({
      id: first.id,
      title: first.title,
      name: 'Una Marsh',
      standing: 14,
      shaky: true,
    })
    expect(rows.slice(1).every((r) => !r.shaky)).toBe(true)
  })
})

describe('policyGroups', () => {
  const state = founded()
  const on = content.policies.find((p) => p.default === true)!
  const off = content.policies.find((p) => p.default === false)!
  const level = content.policies.find((p) => typeof p.default === 'number')

  it('puts every policy in exactly one group', () => {
    const groups = policyGroups(state, content)
    const ids = groups.flatMap((g) => g.policies.map((p) => p.id))
    expect([...ids].sort()).toEqual(content.policies.map((p) => p.id).sort())
    expect(groups.every((g) => g.policies.length > 0)).toBe(true)
  })

  it('sorts by what has happened to a policy since the country began', () => {
    const changed: GameState = { ...state, policies: { ...state.policies, [on.id]: false, [off.id]: true } }
    const groups = policyGroups(changed, content)
    const where = (id: string) => groups.find((g) => g.policies.some((p) => p.id === id))?.id
    expect(where(on.id)).toBe('ended')
    expect(where(off.id)).toBe('introduced')
    if (level) {
      expect(where(level.id)).toBe('levels')
      const row = groups.find((g) => g.id === 'levels')!.policies.find((p) => p.id === level.id)!
      expect(row.level).toBe(String(state.policies[level.id]))
    }
  })
})

describe('traits and their tags', () => {
  it('has plain words for every tag a trait in the pack opposes', () => {
    for (const tag of new Set(content.traits.flatMap((t) => t.opposes))) {
      expect(tagWords(tag), tag).not.toBe(tag.replace(/[_-]+/g, ' '))
    }
  })

  it('falls back to the tag itself with the underscores taken out', () => {
    expect(tagWords('very_new_tag')).toBe('very new tag')
  })

  it('joins a list the way a sentence would', () => {
    expect(listWords([])).toBe('')
    expect(listWords(['a'])).toBe('a')
    expect(listWords(['a', 'b', 'c'])).toBe('a, b or c')
  })

  it('is empty for a new nation, and describes a held trait without a brace or a tag', () => {
    expect(traitRows(founded(), content)).toEqual([])
    const all: GameState = { ...founded(), traits: content.traits.map((t) => t.id) }
    const rows = traitRows(all, content)
    expect(rows).toHaveLength(content.traits.length)
    for (const row of rows) {
      expect(row.description).not.toMatch(/[{}]/)
      expect(row.opposes).not.toMatch(/_/)
    }
    expect(rows.some((r) => r.opposes.startsWith('Costs legitimacy: '))).toBe(true)
  })
})

describe('promises and what is pending', () => {
  it('lists promises soonest first with the days left', () => {
    const state: GameState = {
      ...founded(),
      day: 10,
      promises: [
        { id: 'b', text: 'Later, in {capital}', dueDay: 30, kept: { flag: 'x' }, broken: [] },
        { id: 'a', text: 'Sooner', dueDay: 11, kept: { flag: 'x' }, broken: [] },
      ],
    }
    expect(promiseRows(state, content)).toEqual([
      { id: 'a', text: 'Sooner', daysLeft: 1 },
      { id: 'b', text: `Later, in ${state.identity.capital}`, daysLeft: 20 },
    ])
  })

  it('words the deadline', () => {
    expect(deadline(0)).toBe('Judged tonight')
    expect(deadline(1)).toBe('Judged tomorrow night')
    expect(deadline(12)).toBe('Judged in 12 days')
  })

  it('says whether anything is pending and nothing more', () => {
    const state = founded()
    expect(hasPending({ ...state, pending: [] })).toBe(false)
    const later = { dueDay: 9, headline: 'Secret', effects: [], source: 'x' }
    expect(hasPending({ ...state, pending: [later] })).toBe(true)
  })
})

describe('crisisRow', () => {
  it('is nothing in peacetime', () => {
    expect(crisisRow(founded(), content)).toBeNull()
  })

  it('describes the running situation, decided today or not', () => {
    const situation = content.situations[0]!
    const state: GameState = { ...played(1), situation: { id: situation.id, stage: 1, gauge: 37 } }
    expect(crisisRow(state, content)).toMatchObject({
      gauge: situation.gauge,
      value: 37,
      note: `Stage 2 of ${situation.stages.length}.`,
    })
  })
})

describe('ordinal', () => {
  it('spells the small ones and numbers the rest', () => {
    expect(ordinal(1)).toBe('first')
    expect(ordinal(9)).toBe('ninth')
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(22)).toBe('22nd')
    expect(ordinal(103)).toBe('103rd')
  })
})
