import { INDICATORS, endDay, serialize, support } from '@diplomat/engine'
import { describe, expect, it } from 'vitest'
import { content, founded, played } from '../test/fixtures.ts'
import {
  INDEX_KEY,
  SAVE_FORMAT,
  decode,
  encode,
  exportName,
  importSave,
  listNations,
  memoryStore,
  nationKey,
  newNationSave,
  openNation,
  randomId,
  randomSeed,
  rawText,
  removeNation,
  snapshot,
  storeNation,
  withDayEnd,
  type KeyValue,
  type Nation,
} from './saves.ts'

const NOW = '2030-01-01T09:00:00.000Z'
const LATER = '2030-01-02T09:00:00.000Z'

function nation(id = 'abc', days = 0): Nation {
  return newNationSave(played(days), id, NOW)
}

function expectProblem(text: string, pattern: RegExp) {
  const opened = decode(text, content, 'abc')
  expect(opened.ok).toBe(false)
  if (!opened.ok) {
    expect(opened.problem).toMatch(pattern)
    expect(opened.raw).toBe(text)
  }
}

describe('snapshots', () => {
  it('records the twelve indicators, support and every faction', () => {
    const state = founded()
    const shot = snapshot(state, 0)
    expect(Object.keys(shot.indicators).sort()).toEqual([...INDICATORS].sort())
    expect(shot.support).toBe(support(state))
    expect(Object.keys(shot.factions).sort()).toEqual(Object.keys(state.factions).sort())
    shot.indicators.debt = 99
    expect(state.indicators.debt).not.toBe(99)
  })

  it('starts a history at day 0 and adds one snapshot per day ended', () => {
    const start = founded()
    const save = newNationSave(start, 'abc', NOW)
    expect(save.history.map((s) => s.day)).toEqual([0])
    const next = endDay(start, content)
    const history = withDayEnd(save.history, next)
    expect(history.map((s) => s.day)).toEqual([0, 1])
    expect(withDayEnd(history, next).map((s) => s.day)).toEqual([0, 1])
    expect(history[1]!.indicators).toEqual(next.indicators)
  })
})

describe('the save file', () => {
  it("has the documented wrapper around the engine's own text", () => {
    const save = nation('abc', 3)
    const file = JSON.parse(encode(save))
    expect(Object.keys(file).sort()).toEqual(['createdAt', 'format', 'history', 'id', 'state', 'updatedAt'])
    expect(file.format).toBe(SAVE_FORMAT)
    expect(file.state).toBe(serialize(save.state))
  })

  it('round-trips exactly', () => {
    const save = nation('abc', 12)
    const opened = decode(encode(save), content)
    expect(opened).toEqual({ ok: true, nation: save })
  })

  it('explains anything that is not a save, and hands the text back', () => {
    expectProblem('', /not valid JSON/)
    expectProblem('{"half":', /not valid JSON/)
    expectProblem('[1,2,3]', /no format number/)
    expectProblem('"hello"', /no format number/)
    expectProblem('{"state":"x"}', /no format number/)
    expectProblem(
      JSON.stringify({ ...JSON.parse(encode(nation())), format: 2 }),
      /format 2.*only reads format 1/,
    )
  })

  it('explains a damaged wrapper or a damaged nation inside it', () => {
    const file = JSON.parse(encode(nation()))
    expectProblem(JSON.stringify({ ...file, state: undefined }), /state is missing/)
    expectProblem(JSON.stringify({ ...file, updatedAt: 7 }), /updatedAt is missing/)
    expectProblem(JSON.stringify({ ...file, state: 'not json' }), /Not a save file/)
    const broken = { ...JSON.parse(file.state), indicators: { fiscal: 'lots' } }
    expectProblem(
      JSON.stringify({ ...file, state: JSON.stringify(broken) }),
      /indicators is missing or malformed/,
    )
    const future = { ...JSON.parse(file.state), version: 99 }
    expectProblem(JSON.stringify({ ...file, state: JSON.stringify(future) }), /version 99/)
  })

  it('refuses a nation from a different pack, by name', () => {
    const file = JSON.parse(encode(nation()))
    const other = { ...JSON.parse(file.state), pack: { id: 'homebrew', version: '0.1.0' } }
    expectProblem(
      JSON.stringify({ ...file, state: JSON.stringify(other) }),
      /"homebrew".*"core".*cannot be opened/,
    )
  })

  it('refuses a save whose agenda names a dilemma this pack does not have', () => {
    const file = JSON.parse(encode(nation()))
    const state = JSON.parse(file.state)
    state.agenda.major = 'no-such-dilemma'
    expectProblem(
      JSON.stringify({ ...file, state: JSON.stringify(state) }),
      /does not fit the pack.*no-such-dilemma/,
    )
  })

  it('loads a different version of the same pack, with a notice', () => {
    const file = JSON.parse(encode(nation()))
    const older = { ...JSON.parse(file.state), pack: { id: content.pack.id, version: '0.0.9' } }
    const opened = decode(JSON.stringify({ ...file, state: JSON.stringify(older) }), content)
    expect(opened.ok).toBe(true)
    if (opened.ok) expect(opened.notice).toMatch(/version 0\.0\.9.*carries on/)
  })

  it('keeps the nation and restarts the charts when only the history is damaged', () => {
    const file = JSON.parse(encode(nation('abc', 2)))
    for (const history of [undefined, 'none', [{ day: 1 }], [{ ...file.history[0], support: 400 }]]) {
      const opened = decode(JSON.stringify({ ...file, history }), content)
      expect(opened.ok).toBe(true)
      if (opened.ok) {
        expect(opened.nation.history).toEqual([])
        expect(opened.notice).toMatch(/charts start again/)
      }
    }
  })
})

describe('storage', () => {
  it('stores one key per nation and an index', () => {
    const kv = memoryStore()
    expect(storeNation(kv, nation('one'), content)).toBeNull()
    expect(storeNation(kv, { ...nation('two', 2), updatedAt: LATER }, content)).toBeNull()
    expect(kv.length).toBe(3)
    expect(kv.getItem(nationKey('one'))).not.toBeNull()
    expect(kv.getItem(INDEX_KEY)).not.toBeNull()
    const listed = listNations(kv, content)
    expect(listed.map((s) => s.id)).toEqual(['two', 'one'])
    expect(listed[0]).toMatchObject({ name: 'Vesland', day: 3, updatedAt: LATER })
    expect(listed[0]!.className).not.toBe('')
  })

  it('opens what it stored', () => {
    const kv = memoryStore()
    const save = nation('one', 5)
    storeNation(kv, save, content)
    expect(openNation(kv, 'one', content)).toEqual({ ok: true, nation: save })
  })

  it('says so when asked for a nation that is not there', () => {
    const opened = openNation(memoryStore(), 'nobody', content)
    expect(opened).toMatchObject({ ok: false, id: 'nobody', raw: '' })
  })

  it('rebuilds a missing or corrupt index from the saves', () => {
    const kv = memoryStore()
    storeNation(kv, nation('one'), content)
    storeNation(kv, nation('two'), content)
    for (const damage of [
      null,
      'garbage',
      '{"format":1,"nations":[{"id":7}]}',
      '{"format":1,"nations":[]}',
    ]) {
      if (damage === null) kv.removeItem(INDEX_KEY)
      else kv.setItem(INDEX_KEY, damage)
      expect(
        listNations(kv, content)
          .map((s) => s.id)
          .sort(),
      ).toEqual(['one', 'two'])
      expect(JSON.parse(kv.getItem(INDEX_KEY)!).nations).toHaveLength(2)
    }
  })

  it('lists a corrupt save with its problem, and leaves it exactly where it was', () => {
    const kv = memoryStore()
    storeNation(kv, nation('good'), content)
    kv.setItem(nationKey('bad'), '{"format":1,"id":"bad","state":"###"')
    const listed = listNations(kv, content)
    expect(listed).toHaveLength(2)
    expect(listed.find((s) => s.id === 'bad')!.problem).toMatch(/not valid JSON/)
    expect(listed.find((s) => s.id === 'good')!.problem).toBeUndefined()
    expect(rawText(kv, 'bad')).toBe('{"format":1,"id":"bad","state":"###"')
    const opened = openNation(kv, 'bad', content)
    expect(opened).toMatchObject({ ok: false, id: 'bad', raw: '{"format":1,"id":"bad","state":"###"' })
  })

  it('ignores keys that belong to something else', () => {
    const kv = memoryStore({ theme: 'dark', 'other-app:nation:1': '{}' })
    expect(listNations(kv, content)).toEqual([])
    expect(kv.getItem('theme')).toBe('dark')
  })

  it('removes a nation and its line in the index, and nothing else', () => {
    const kv = memoryStore()
    storeNation(kv, nation('one'), content)
    storeNation(kv, nation('two'), content)
    removeNation(kv, 'one')
    expect(rawText(kv, 'one')).toBeNull()
    expect(listNations(kv, content).map((s) => s.id)).toEqual(['two'])
  })

  it('reports a store that refuses to write, without throwing', () => {
    const full: KeyValue = {
      ...memoryStore(),
      length: 0,
      setItem() {
        throw new Error('quota exceeded')
      },
    }
    expect(storeNation(full, nation(), content)).toMatch(/could not be saved \(quota exceeded\)/)
    expect(listNations(full, content)).toEqual([])
  })
})

describe('export and import', () => {
  it('brings an exported nation back exactly after it was deleted', () => {
    const kv = memoryStore()
    const save = nation('one', 8)
    storeNation(kv, save, content)
    const exported = rawText(kv, 'one')!
    removeNation(kv, 'one')
    expect(listNations(kv, content)).toEqual([])

    const opened = importSave(kv, exported, content, () => 'fresh')
    expect(opened).toEqual({ ok: true, nation: save })
    expect(openNation(kv, 'one', content)).toEqual({ ok: true, nation: save })
    expect(listNations(kv, content).map((s) => s.id)).toEqual(['one'])
  })

  it('stores an import beside a nation with the same id and never over it', () => {
    const kv = memoryStore()
    storeNation(kv, nation('one', 1), content)
    const ids = ['one', 'two']
    const opened = importSave(kv, encode(nation('one', 4)), content, () => ids.shift()!)
    expect(opened.ok && opened.nation.id).toBe('two')
    expect(
      listNations(kv, content)
        .map((s) => [s.id, s.day])
        .sort(),
    ).toEqual([
      ['one', 2],
      ['two', 5],
    ])
  })

  it('stores nothing when the file is not a save', () => {
    const kv = memoryStore()
    const opened = importSave(kv, '<html>', content, randomId)
    expect(opened.ok).toBe(false)
    expect(kv.length).toBe(0)
  })

  it('names the file after the nation and the day', () => {
    expect(exportName('New Vesland', 12)).toBe('new-vesland-day-12.json')
    expect(exportName('<script>/..\\', 1)).toBe('script-day-1.json')
    expect(exportName('***', 3)).toBe('nation-day-3.json')
  })

  it('makes ids and seeds that differ', () => {
    expect(randomId()).toMatch(/^[0-9a-f]{16}$/)
    expect(randomId()).not.toBe(randomId())
    expect(Number.isSafeInteger(randomSeed())).toBe(true)
  })
})
