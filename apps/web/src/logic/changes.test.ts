import { INDICATORS, type Change } from '@diplomat/engine'
import { describe as group, expect, it } from 'vitest'
import { content } from '../test/fixtures.ts'
import {
  dayLabel,
  describe,
  direction,
  electionLabel,
  groupChanges,
  percent,
  policyLine,
  sentence,
  size,
  targetName,
  tone,
  totalMovement,
} from './changes.ts'

const indicator = (target: string, by: number, why = 'Because.'): Change => ({
  kind: 'indicator',
  target,
  by,
  why,
})
const faction = content.factions[0]!
const portfolio = content.portfolios[0]!

group('direction and size', () => {
  it('reads the sign', () => {
    expect([direction(3), direction(-0.5), direction(0)]).toEqual(['up', 'down', 'none'])
  })

  it('sizes a move against the most that kind of number may move', () => {
    expect([1, 3, 4, 6, 7, 10].map((by) => size({ kind: 'indicator', by }))).toEqual([
      'small',
      'small',
      'moderate',
      'moderate',
      'large',
      'large',
    ])
    expect([4, 9, 10].map((by) => size({ kind: 'faction', by: -by }))).toEqual(['small', 'moderate', 'large'])
    expect([6, 12, 13].map((by) => size({ kind: 'minister', by }))).toEqual(['small', 'moderate', 'large'])
  })
})

group('good and bad', () => {
  it('treats a rise as good for most indicators', () => {
    expect(tone(indicator('health', 2))).toBe('good')
    expect(tone(indicator('health', -2))).toBe('bad')
  })

  it('treats a rise in debt or inequality as bad', () => {
    expect(tone(indicator('debt', 5))).toBe('bad')
    expect(tone(indicator('debt', -5))).toBe('good')
    expect(tone(indicator('inequality', 1))).toBe('bad')
    expect(tone(indicator('inequality', -1))).toBe('good')
  })

  it('counts approval and standing going up as good, and passes no verdict on a gauge', () => {
    expect(tone({ kind: 'faction', target: faction.id, by: 4 })).toBe('good')
    expect(tone({ kind: 'minister', target: portfolio.id, by: -4 })).toBe('bad')
    expect(tone({ kind: 'situation', target: 'anything', by: -9 })).toBe('neutral')
    expect(tone(indicator('health', 0))).toBe('neutral')
  })
})

group('words', () => {
  it('names targets from the engine and the pack, and falls back to the id', () => {
    expect(targetName(indicator('fiscal', 1), content)).toBe('Budget')
    expect(targetName({ kind: 'faction', target: faction.id }, content)).toBe(faction.name)
    expect(targetName({ kind: 'minister', target: portfolio.id }, content)).toBe(portfolio.title)
    expect(targetName({ kind: 'faction', target: 'ghosts' }, content)).toBe('ghosts')
  })

  it('describes debt going up a lot as up, large and for the worse', () => {
    const d = describe(indicator('debt', 8, 'The gap was borrowed.'), content)
    expect(d).toMatchObject({
      group: 'country',
      name: 'Debt',
      direction: 'up',
      size: 'large',
      tone: 'bad',
      movement: 'up a lot',
      verdict: 'for the worse',
      clause: 'the debt grows sharply',
      why: 'The gap was borrowed.',
    })
  })

  it('has a phrase for every indicator in both directions, with no figures in it', () => {
    for (const id of INDICATORS) {
      for (const by of [5, -5]) {
        const d = describe(indicator(id, by), content)
        expect(d.clause, id).not.toMatch(/\d/)
        expect(d.movement).toMatch(/^(up|down) /)
      }
    }
  })

  it('gets the grammar of a plural indicator right', () => {
    expect(describe(indicator('living', 5), content).clause).toBe('living standards rise')
    expect(describe(indicator('living', -9), content).clause).toBe('living standards fall sharply')
  })

  it('writes a single reason and its movement as one sentence', () => {
    expect(sentence(indicator('debt', 2, 'The week ended in deficit.'), content)).toBe(
      'The week ended in deficit; the debt grows a little.',
    )
  })

  it('keeps a longer reason intact and adds the movement after it', () => {
    const why = 'Some people cut back. Most assume the appeal is for other people.'
    expect(sentence({ kind: 'faction', target: faction.id, by: -6, why }, content)).toBe(
      `${why} Approval among ${faction.name.replace(/^The /, 'the ')} falls.`,
    )
    expect(sentence(indicator('liberty', 9, 'Is this wise?'), content)).toBe(
      'Is this wise? Liberty expands sharply.',
    )
    expect(sentence(indicator('liberty', 9, ''), content)).toBe('Liberty expands sharply.')
    expect(sentence(indicator('debt', 2, 'The gap was borrowed.'), content, 'and')).toBe(
      'The gap was borrowed, and the debt grows a little.',
    )
    expect(sentence(indicator('debt', 2, 'It was close, but it held.'), content, 'and')).toBe(
      'It was close, but it held; the debt grows a little.',
    )
  })

  it('speaks of ministers by office', () => {
    const change: Change = { kind: 'minister', target: portfolio.id, by: 3, why: 'A good week.' }
    expect(sentence(change, content)).toBe(`A good week; the ${portfolio.title}'s standing rises a little.`)
  })

  it('words a gauge as a rise or a fall, so its name need not agree with a verb', () => {
    for (const situation of content.situations) {
      const change: Change = { kind: 'situation', target: situation.id, by: 12, why: 'It rained.' }
      const line = sentence(change, content)
      expect(line).toMatch(/^It rained: a rise in /)
      expect(line).not.toMatch(/ rises| rise\./)
      expect(describe({ ...change, by: -2 }, content).clause).toMatch(/^a small fall in /)
    }
  })

  it('puts policy changes in words', () => {
    const on = content.policies.find((p) => typeof p.default === 'boolean')!
    expect(policyLine({ policy: on.id, to: true }, content)).toBe(`Introduces: ${on.name}`)
    expect(policyLine({ policy: on.id, to: false }, content)).toBe(`Ends: ${on.name}`)
    expect(policyLine({ policy: 'made_up', to: 3 }, content)).toBe('Sets made_up to 3')
  })

  it('formats the masthead figures', () => {
    expect(percent(50.4)).toBe('50%')
    expect(dayLabel(12)).toBe('Day 12')
    expect([electionLabel(0), electionLabel(1), electionLabel(33)]).toEqual([
      'Election tonight',
      'Election tomorrow',
      'Election in 33 days',
    ])
  })
})

group('grouping', () => {
  const changes: Change[] = [
    { kind: 'faction', target: faction.id, by: -3, why: '' },
    indicator('debt', 4),
    { kind: 'minister', target: portfolio.id, by: 2, why: '' },
    indicator('health', -1),
  ]

  it('sorts changes under the country, factions and cabinet, keeping their order', () => {
    const groups = groupChanges(changes)
    expect(groups.map((g) => g.label)).toEqual(['The country', 'Factions', 'Cabinet'])
    expect(groups[0]!.changes.map((c) => c.target)).toEqual(['debt', 'health'])
    expect(groupChanges([])).toEqual([])
  })

  it('adds up movement regardless of direction', () => {
    expect(totalMovement(changes)).toBe(10)
  })
})

group('changes abroad', () => {
  it('names the neighbour and words relations warming and cooling', () => {
    const warm: Change = { kind: 'neighbour', target: 'velsa', by: 8, why: 'They liked it.' }
    const cool: Change = { kind: 'neighbour', target: 'velsa', by: -2, why: 'They did not.' }
    expect(targetName(warm, content)).toBe('Velsa')
    expect(describe(warm, content).group).toBe('abroad')
    expect(describe(warm, content).clause).toBe('relations with Velsa warm')
    expect(describe(cool, content).clause).toBe('relations with Velsa cool a little')
    expect(tone(cool)).toBe('bad')
    expect(groupChanges([warm]).map((g) => g.label)).toEqual(['Abroad'])
  })
})
