import { agendaItems, availableOptions, forecastDecision, newNation, serialize } from '@diplomat/engine'
import { describe, expect, it, vi } from 'vitest'
import { encode, memoryStore, nationKey, openNation, type KeyValue } from '../logic/saves.ts'
import { content, firstAnswers, identity } from '../test/fixtures.ts'
import { createGameStore, type Sources } from './gameStore.ts'

function sources(): Sources {
  let ids = 0
  let ticks = 0
  return {
    id: () => `nation-${++ids}`,
    seed: () => 7,
    now: () => `2030-01-01T00:00:${String(ticks++).padStart(2, '0')}.000Z`,
  }
}

function start(kv: KeyValue = memoryStore()) {
  const store = createGameStore(kv, content, sources())
  const id = store.found(identity, firstAnswers())
  return { kv, store, id }
}

const stateOf = (store: ReturnType<typeof createGameStore>) => store.get().nation!.state

function firstChoice(store: ReturnType<typeof createGameStore>) {
  const state = stateOf(store)
  const agenda = agendaItems(state, content)
  const dilemma = agenda.major ?? agenda.minors[0]!
  return { dilemma, option: availableOptions(dilemma.options, state)[0]! }
}

describe('founding', () => {
  it('founds through the engine, opens the nation and saves it', () => {
    const { kv, store, id } = start()
    expect(id).toBe('nation-1')
    expect(serialize(stateOf(store))).toBe(serialize(newNation(content, identity, 7, firstAnswers())))
    expect(store.get().nations.map((s) => s.id)).toEqual([id])
    const stored = openNation(kv, id, content)
    expect(stored.ok && stored.nation).toEqual(store.get().nation)
    expect(store.get().nation!.history.map((s) => s.day)).toEqual([0])
  })

  it('keeps several nations side by side', () => {
    const { store } = start()
    const second = store.found({ ...identity, name: 'Zembry' }, {})
    expect(second).toBe('nation-2')
    expect(store.get().nations.map((s) => s.name)).toEqual(['Zembry', 'Vesland'])
    expect(store.open('nation-1')).toBe(true)
    expect(stateOf(store).identity.name).toBe('Vesland')
  })
})

describe('playing', () => {
  it('applies a decision exactly as forecast, returns its entry and saves', () => {
    const { kv, store, id } = start()
    const { dilemma, option } = firstChoice(store)
    const forecast = forecastDecision(stateOf(store), content, dilemma.id, option.id)
    const entry = store.decide(dilemma.id, option.id)

    expect(entry.kind).toBe('decision')
    expect(entry.changes).toEqual([...forecast.changes, ...forecast.penalties, ...forecast.pressure])
    expect(stateOf(store).timeline.at(-1)).toEqual(entry)
    const stored = openNation(kv, id, content)
    expect(stored.ok && stored.nation.state).toEqual(stateOf(store))
  })

  it('lets the engine refuse a choice that is not on the agenda, and changes nothing', () => {
    const { store } = start()
    const before = store.get()
    expect(() => store.decide('no-such-dilemma', 'x')).toThrow(/not on today's agenda/)
    expect(store.get()).toBe(before)
  })

  it('ends the day, returns what the night produced, and adds a snapshot', () => {
    const { kv, store, id } = start()
    const { dilemma, option } = firstChoice(store)
    store.decide(dilemma.id, option.id)
    const length = stateOf(store).timeline.length

    const overnight = store.endDay()
    expect(stateOf(store).day).toBe(2)
    expect(overnight).toEqual(stateOf(store).timeline.slice(length))
    expect(store.get().nation!.history.map((s) => s.day)).toEqual([0, 1])
    const stored = openNation(kv, id, content)
    expect(stored.ok && stored.nation).toEqual(store.get().nation)
    expect(store.get().nations[0]).toMatchObject({ id, day: 2 })
  })

  it('plays sixty days without the save and the memory drifting apart', () => {
    const { kv, store, id } = start()
    for (let day = 0; day < 60; day++) {
      const state = stateOf(store)
      const agenda = agendaItems(state, content)
      if (agenda.situation)
        store.decideSituation(availableOptions(agenda.situation.stage.options, state)[0]!.id)
      if (agenda.major)
        store.decide(agenda.major.id, availableOptions(agenda.major.options, stateOf(store))[0]!.id)
      store.endDay()
    }
    expect(stateOf(store).day).toBe(61)
    expect(store.get().nation!.history).toHaveLength(61)
    const fresh = createGameStore(kv, content, sources())
    expect(fresh.open(id)).toBe(true)
    expect(fresh.get().nation).toEqual(store.get().nation)
  })

  it('tells its listeners once per change', () => {
    const { store } = start()
    const heard = vi.fn()
    const stop = store.subscribe(heard)
    store.endDay()
    expect(heard).toHaveBeenCalledTimes(1)
    stop()
    store.endDay()
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('renames the nation without touching anything else', () => {
    const { store } = start()
    const before = stateOf(store)
    store.setIdentity({ ...identity, name: 'New Vesland' })
    expect(stateOf(store)).toEqual({ ...before, identity: { ...identity, name: 'New Vesland' } })
    expect(store.get().nations[0]!.name).toBe('New Vesland')
  })

  it('refuses to play with no nation open', () => {
    const store = createGameStore(memoryStore(), content, sources())
    expect(() => store.endDay()).toThrow(/no nation is open/)
  })
})

describe('opening', () => {
  it('reports a corrupt save with its raw text and deletes nothing', () => {
    const kv = memoryStore({ [nationKey('bad')]: 'not a save' })
    const store = createGameStore(kv, content, sources())
    expect(store.get().nations[0]).toMatchObject({ id: 'bad' })
    expect(store.open('bad')).toBe(false)
    expect(store.get().nation).toBeNull()
    expect(store.get().problem).toMatchObject({ id: 'bad', raw: 'not a save' })
    expect(store.get().problem!.message).toMatch(/not valid JSON/)
    expect(kv.getItem(nationKey('bad'))).toBe('not a save')
    expect(store.exportSave('bad')).toEqual({ filename: 'unreadable-save-bad.json', text: 'not a save' })
  })

  it('refuses a save from another pack', () => {
    const { kv, store, id } = start()
    const nation = store.get().nation!
    kv.setItem(
      nationKey(id),
      encode({ ...nation, state: { ...nation.state, pack: { id: 'homebrew', version: '1' } } }),
    )
    const fresh = createGameStore(kv, content, sources())
    expect(fresh.open(id)).toBe(false)
    expect(fresh.get().problem!.message).toMatch(/homebrew/)
  })

  it('loads an older version of the same pack with a notice, once', () => {
    const { kv, store, id } = start()
    const nation = store.get().nation!
    const older = { ...nation.state, pack: { id: content.pack.id, version: '0.0.1' } }
    kv.setItem(nationKey(id), encode({ ...nation, state: older }))

    const fresh = createGameStore(kv, content, sources())
    expect(fresh.open(id)).toBe(true)
    expect(fresh.get().notice).toMatch(/0\.0\.1/)
    expect(fresh.get().nation!.state.pack.version).toBe(content.pack.version)
    fresh.dismissNotice()
    expect(fresh.get().notice).toBeNull()

    const again = createGameStore(kv, content, sources())
    expect(again.open(id)).toBe(true)
    expect(again.get().notice).toBeNull()
  })

  it('keeps playing and says so when the browser will not store the save', () => {
    const kv = memoryStore()
    const { store } = start(kv)
    kv.setItem = () => {
      throw new Error('quota exceeded')
    }
    store.endDay()
    expect(stateOf(store).day).toBe(2)
    expect(store.get().saveError).toMatch(/could not be saved/)
    expect(JSON.parse(store.exportSave('nation-1')!.text).id).toBe('nation-1')
  })
})

describe('export, delete, import', () => {
  it('gets the same nation back', () => {
    const { store, id } = start()
    store.endDay()
    store.endDay()
    const before = store.get().nation!
    const file = store.exportSave(id)!
    expect(file.filename).toBe('vesland-day-3.json')

    store.remove(id)
    expect(store.get().nation).toBeNull()
    expect(store.get().nations).toEqual([])
    expect(store.open(id)).toBe(false)

    const result = store.importSave(file.text)
    expect(result).toEqual({ ok: true, id, name: 'Vesland' })
    expect(store.get().nations.map((s) => s.id)).toEqual([id])
    expect(store.open(id)).toBe(true)
    expect(store.get().nation).toEqual(before)
  })

  it('explains an import that is not a save and stores nothing', () => {
    const { store } = start()
    const result = store.importSave('{"format":1}')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problem).toMatch(/damaged/)
    expect(store.get().nations).toHaveLength(1)
  })

  it('exports a nation that is not the open one from storage', () => {
    const { store } = start()
    store.found({ ...identity, name: 'Zembry' }, {})
    const file = store.exportSave('nation-1')!
    expect(file.filename).toBe('vesland-day-1.json')
    expect(JSON.parse(file.text).id).toBe('nation-1')
    expect(store.exportSave('nobody')).toBeNull()
  })
})
