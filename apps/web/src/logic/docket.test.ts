import type { Docket, Standing } from '@diplomat/government'
import { describe, expect, it } from 'vitest'
import { DISMISS, courseLabel, courseState, dismissOpen, resultLine, safeHex, withDockets } from './docket.ts'
import { hemicycle, rowsFor } from './hemicycle.ts'

const options = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

function docket(standing: Partial<Standing>, patch: Partial<Docket> = {}): Docket {
  return {
    dilemma: 'd',
    day: 1,
    number: 4,
    status: 'ready',
    advice: [],
    sittings: [],
    reviews: [],
    exchanges: [],
    assents: [],
    standing: { permitted: ['a', 'b', 'c'], barred: [], standstill: false, explanation: 'Because.', ...standing },
    progress: [],
    document: 'petition-00004',
    ...patch,
  }
}

describe('the courses a standing leaves open', () => {
  it('labels courses as the desk numbers them', () => {
    expect(courseLabel('b', options)).toBe('Option 2')
    expect(courseLabel(DISMISS, options)).toBe('Dismissal')
  })

  it('leaves everything open without a docket', () => {
    expect(courseState(null, 'a', options, null).action).toBe('accept')
  })

  it('turns a barred course into one only a Word can take', () => {
    expect(courseState(docket({ permitted: ['b', 'c'], barred: ['a'] }), 'a', options, null)).toMatchObject({
      action: 'word-only',
      barred: true,
    })
  })

  it('leaves only the binding course when one must be taken', () => {
    const d = docket({ mustTake: 'b' })
    expect(courseState(d, 'b', options, null)).toMatchObject({ action: 'accept', must: true })
    expect(courseState(d, 'a', options, null).action).toBe('word-only')
    expect(courseState(d, 'a', options, null).notes.join(' ')).toMatch(/Option 2 must be taken/)
  })

  it('asks for reasons to set aside a carried course', () => {
    const d = docket({ vetoable: 'a' })
    expect(courseState(d, 'a', options, null).action).toBe('accept')
    expect(courseState(d, 'c', options, null)).toMatchObject({ action: 'veto', setsAside: 'a' })
  })

  it('waits while the bodies sit or after they failed, and marks advice that binds nobody', () => {
    expect(courseState(docket({}, { status: 'sitting', standing: null }), 'a', options, null).action).toBe('word-only')
    expect(courseState(docket({}, { status: 'failed', standing: null }), 'a', options, null).notes[0]).toMatch(/could not be heard/)
    const advised = docket(
      {},
      {
        reviews: [
          {
            body: 'court',
            kind: 'first',
            binding: false,
            rulings: [{ course: 'a', votes: { x: 'bar', y: 'bar', z: 'permit' }, verdict: 'barred', articles: [], markers: [] }],
            cautions: [],
            directions: [],
            document: 'court-00001',
            ai: true,
          },
        ],
      },
    )
    expect(courseState(advised, 'a', options, null)).toMatchObject({ action: 'accept', advisedAgainst: true })
    expect(courseState(advised, 'a', options, null).notes[0]).toBe('Court advised against it, 2 to 1. It stays open.')
  })

  it('offers dismissal only when the standing does', () => {
    expect(dismissOpen(docket({}).standing)).toBe(false)
    expect(dismissOpen(docket({ permitted: ['a', DISMISS] }).standing)).toBe(true)
    expect(dismissOpen(docket({ standstill: true, permitted: [] }).standing)).toBe(true)
  })

  it('lays polled dockets over the ones it had', () => {
    const government = { dockets: { d: docket({}), e: docket({}, { dilemma: 'e' }) } } as never
    const next = withDockets(government, [docket({}, { status: 'decided' })])
    expect(next.dockets['d']!.status).toBe('decided')
    expect(next.dockets['e']!.status).toBe('ready')
  })
})

describe('divisions and colours', () => {
  it('says the result in words', () => {
    const sitting = {
      division: { aye: 112, no: 30, abstain: 9, byParty: {} },
      carried: true,
      binding: true,
    } as never
    expect(resultLine(sitting, 'The Steward')).toBe('Carried and binding, 112 to 30, with 9 abstaining. The Steward must take it.')
  })

  it('draws only plain hex colours', () => {
    expect(safeHex('#a61b29')).toBe('#a61b29')
    expect(safeHex('red; background: url(x)')).toBe('#8d8c80')
  })
})

describe('the seat chart', () => {
  it('places every seat once, party by party from the left', () => {
    const chart = hemicycle([70, 50, 31])
    expect(chart.seats).toHaveLength(151)
    expect(chart.seats.filter((s) => s.party === 0)).toHaveLength(70)
    const leftmost = chart.seats.reduce((a, b) => (a.x < b.x ? a : b))
    const rightmost = chart.seats.reduce((a, b) => (a.x > b.x ? a : b))
    expect(leftmost.party).toBe(0)
    expect(rightmost.party).toBe(2)
    expect(chart.seats.every((s) => s.y <= chart.height && s.x >= 0 && s.x <= chart.width)).toBe(true)
    expect(chart.radius).toBeGreaterThan(0)
  })

  it('copes with a tiny council and an empty chamber', () => {
    expect(hemicycle([1]).seats).toHaveLength(1)
    expect(hemicycle([]).seats).toEqual([])
    expect(rowsFor(650)).toBe(12)
  })
})
