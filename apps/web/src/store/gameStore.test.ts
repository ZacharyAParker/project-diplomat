import { agendaItems, availableOptions, forecastDecision, newNation, serialize } from '@diplomat/engine'
import { describe, expect, it, vi } from 'vitest'
import type { FoundRequest } from '../api.ts'
import { DISMISS } from '../logic/docket.ts'
import { encode, memoryStore, nationKey, newNationSave, type KeyValue } from '../logic/saves.ts'
import { FakeServer } from '../test/fakeServer.ts'
import { content, firstAnswers, founded, identity } from '../test/fixtures.ts'
import { createGameStore } from './gameStore.ts'

const request = (name = 'Vesland', mode: FoundRequest['mode'] = 'govern'): FoundRequest => ({
  identity: { ...identity, name },
  answers: firstAnswers(),
  form: 'commonwealth',
  mode,
  founder: { name: 'the Founder', title: 'Founder' },
})

async function start(fake = new FakeServer(), kv: KeyValue = memoryStore()) {
  const store = createGameStore(fake, content, { kv, pollMs: 5 })
  await store.start()
  const id = await store.found(request())
  return { fake, kv, store, id }
}

const stateOf = (store: ReturnType<typeof createGameStore>) => store.get().nation!.state

function major(store: ReturnType<typeof createGameStore>) {
  const state = stateOf(store)
  const dilemma = agendaItems(state, content).major!
  return { dilemma, options: availableOptions(dilemma.options, state) }
}

describe('founding', () => {
  it('founds on the server, opens the nation with its government, and lists it', async () => {
    const { fake, store, id } = await start()
    expect(id).toBe('nation-1')
    expect(fake.calls.find((c) => c.name === 'found')!.args[0]).toMatchObject({ form: 'commonwealth', mode: 'govern' })
    expect(serialize(stateOf(store))).toBe(serialize(newNation(content, identity, 7, firstAnswers())))
    expect(store.get().government!.institutions.constitution.form).toBe('commonwealth')
    expect(store.get().census.length).toBeGreaterThan(0)
    expect(store.get().nations.map((s) => s.id)).toEqual([id])
  })

  it('keeps several nations side by side', async () => {
    const { store } = await start()
    const second = await store.found(request('Zembry'))
    expect(second).toBe('nation-2')
    expect(store.get().nations.map((s) => s.name).sort()).toEqual(['Vesland', 'Zembry'])
    expect(await store.open('nation-1')).toBe(true)
    expect(stateOf(store).identity.name).toBe('Vesland')
  })
})

describe('playing through the server', () => {
  it('applies a decision exactly as forecast, from the state the server sends back', async () => {
    const { fake, store, id } = await start()
    const { dilemma, options } = major(store)
    const forecast = forecastDecision(stateOf(store), content, dilemma.id, options[0]!.id)
    const entry = await store.decide(dilemma.id, options[0]!.id)

    expect(entry.kind).toBe('decision')
    expect(entry.changes).toEqual([...forecast.changes, ...forecast.penalties, ...forecast.pressure])
    expect(stateOf(store).timeline.at(-1)).toEqual(entry)
    expect(serialize(stateOf(store))).toBe(serialize(fake.held(id).state))
    expect(store.get().government!.dockets[dilemma.id]!.status).toBe('decided')
  })

  it('passes the server’s refusal on as an error, and changes nothing', async () => {
    const { store } = await start()
    const before = store.get()
    await expect(store.decide('no-such-dilemma', 'x')).rejects.toThrow(/not on today's agenda/)
    expect(store.get()).toBe(before)
  })

  it('is refused a barred course unless a Word is given, and records the Word', async () => {
    const { fake, store, id } = await start()
    const { dilemma, options } = major(store)
    fake.bar(dilemma.id, options[0]!.id, id)
    await store.reload()
    await expect(store.decide(dilemma.id, options[0]!.id)).rejects.toThrow(/barred/)
    const entry = await store.decide(dilemma.id, options[0]!.id, { word: 'Take it anyway.' })
    expect(entry.kind).toBe('decision')
    expect(store.get().government!.words.at(-1)).toMatchObject({ text: 'Take it anyway.', overrules: dilemma.id })
    expect(store.get().government!.dockets[dilemma.id]!.decision!.by).toBe('word')
  })

  it('needs written reasons to set aside the carried course', async () => {
    const { fake, store } = await start()
    const { dilemma, options } = major(store)
    await expect(store.decide(dilemma.id, options[1]!.id)).rejects.toThrow(/written reasons/)
    await store.decide(dilemma.id, options[1]!.id, { veto: 'Too dear.' })
    expect(fake.calls.at(-1)!.args[1]).toMatchObject({ course: options[1]!.id, veto: 'Too dear.' })
    expect(store.get().government!.dockets[dilemma.id]!.decision!.veto).toEqual({ course: options[0]!.id, reasons: 'Too dear.' })
  })

  it('refuses dismissal while the rules do not allow it', async () => {
    const { store } = await start()
    const { dilemma } = major(store)
    await expect(store.decide(dilemma.id, DISMISS)).rejects.toThrow(/not open under the rules/)
  })

  it('ends the day, returns what the night produced, and opens the next day’s dockets', async () => {
    const { store } = await start()
    const length = stateOf(store).timeline.length
    const overnight = await store.endDay()
    expect(stateOf(store).day).toBe(2)
    expect(overnight).toEqual(stateOf(store).timeline.slice(length))
    expect(store.get().nation!.history.map((s) => s.day)).toEqual([0, 1])
    const dilemma = agendaItems(stateOf(store), content).major
    if (dilemma) expect(store.get().government!.dockets[dilemma.id]!.day).toBe(2)
    expect(store.get().nations[0]).toMatchObject({ day: 2 })
  })

  it('runs the nation in found mode: the executive decides and the days end', async () => {
    const fake = new FakeServer()
    const store = createGameStore(fake, content)
    const id = await store.found(request('Vesland', 'found'))
    expect(id).toBeDefined()
    const entries = await store.run(3)
    expect(stateOf(store).day).toBe(4)
    expect(entries.some((e) => e.kind === 'decision')).toBe(true)
    expect(fake.calls.find((c) => c.name === 'run')!.args).toEqual([id, 3])
  })

  it('tells its listeners once per change', async () => {
    const { store } = await start()
    const heard = vi.fn()
    const stop = store.subscribe(heard)
    await store.endDay()
    expect(heard).toHaveBeenCalledTimes(1)
    stop()
    await store.endDay()
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('renames the nation and changes its mode', async () => {
    const { store } = await start()
    const before = stateOf(store)
    await store.setIdentity({ ...identity, name: 'New Vesland' })
    expect(stateOf(store)).toEqual({ ...before, identity: { ...identity, name: 'New Vesland' } })
    expect(store.get().nations[0]!.name).toBe('New Vesland')
    await store.setMode('found')
    expect(store.get().government!.mode).toBe('found')
  })

  it('refuses to play with no nation open', async () => {
    const store = createGameStore(new FakeServer(), content)
    await expect(store.endDay()).rejects.toThrow(/no nation is open/)
  })
})

describe('dockets that sit', () => {
  it('polls until the bodies have finished, then says so', async () => {
    const { store } = await start(new FakeServer({ sittingPolls: 2 }))
    const { dilemma } = major(store)
    expect(store.get().government!.dockets[dilemma.id]!.status).toBe('sitting')
    expect(await store.pollDockets()).toBe(true)
    expect(await store.pollDockets()).toBe(false)
    const docket = store.get().government!.dockets[dilemma.id]!
    expect(docket.status).toBe('ready')
    expect(docket.standing!.permitted.length).toBeGreaterThan(0)
  })

  it('reloads the nation when the executive decides a docket on its own', async () => {
    const fake = new FakeServer({ sittingPolls: 1 })
    const store = createGameStore(fake, content)
    await store.found(request('Vesland', 'found'))
    const { dilemma } = major(store)
    expect(await store.pollDockets()).toBe(false)
    expect(store.get().government!.dockets[dilemma.id]!.status).toBe('decided')
    expect(agendaItems(stateOf(store), content).major).toBeNull()
    expect(stateOf(store).timeline.at(-1)!.kind).toBe('decision')
  })

  it('convenes a failed docket again', async () => {
    const { fake, store, id } = await start()
    const { dilemma } = major(store)
    fake.rig(dilemma.id, { status: 'failed', standing: null, error: 'The Assembly could not be reached.' }, id)
    await store.reload()
    expect(store.get().government!.dockets[dilemma.id]!.status).toBe('failed')
    await store.convene(dilemma.id)
    expect(store.get().government!.dockets[dilemma.id]!.status).toBe('ready')
  })
})

describe('the Founder and the record', () => {
  it('answers questions, deals with letters and gives Words', async () => {
    const { store } = await start()
    await store.answerQuestion('Q-0001', { answer: 'For its people.' })
    await store.answerQuestion('Q-0002', { later: true })
    await store.letter('L-0001', { adopt: true })
    await store.giveWord({ text: 'Let it be so.', silence: true })
    await store.giveWord({ number: 1, confirm: true })
    const government = store.get().government!
    expect(government.questions.map((q) => q.status)).toEqual(['answered', 'later'])
    expect(government.letters[0]).toMatchObject({ status: 'replied', reply: government.letters[0]!.draft })
    expect(government.words[0]).toMatchObject({ text: 'Let it be so.', silence: true, confirmed: true })
  })

  it('reads the archive and one document with what cites it', async () => {
    const { store } = await start()
    const page = await store.archive({ series: 'petition' })
    expect(page.total).toBe(1)
    const { document, citedBy } = await store.document(page.documents[0]!.id)
    expect(document.series).toBe('petition')
    expect(citedBy.map((d) => d.series)).toEqual(expect.arrayContaining(['hansard', 'court']))
    await expect(store.document('petition-09999')).rejects.toThrow(/no document/)
  })

  it('writes, edits and drafts factbooks', async () => {
    const { store } = await start()
    await store.writeFactbook({ title: 'Overview', category: 'overview', body: 'Small.' })
    const id = store.get().government!.factbooks[0]!.id
    await store.editFactbook(id, { title: 'Overview', category: 'overview', body: 'Small, and wet.' })
    expect(store.get().government!.factbooks[0]!.body).toBe('Small, and wet.')
    expect((await store.draftFactbook({ title: 'History', category: 'history', notes: '' })).body).toMatch(/History/)
  })
})

describe('opening and the server', () => {
  it('reports a nation the server does not have, and keeps nothing open', async () => {
    const store = createGameStore(new FakeServer(), content)
    expect(await store.open('nobody')).toBe(false)
    expect(store.get().nation).toBeNull()
    expect(store.get().problem).toMatchObject({ id: 'nobody', message: expect.stringMatching(/No nation/) })
  })

  it('says the server is not answering when it is not', async () => {
    const fake = new FakeServer()
    fake.down = true
    const store = createGameStore(fake, content)
    await store.start()
    expect(store.get().loaded).toBe(true)
    expect(store.get().offline).toMatch(/not answering/)
    expect(store.get().status).toBeNull()
  })

  it('refuses a nation from another pack, as it would a save', async () => {
    const fake = new FakeServer()
    fake.hold({ ...founded(), pack: { id: 'homebrew', version: '1' } }, { noDockets: true })
    const store = createGameStore(fake, content)
    expect(await store.open('kept')).toBe(false)
    expect(store.get().problem!.message).toMatch(/homebrew/)
  })

  it('opens an older version of the same pack with a notice', async () => {
    const fake = new FakeServer()
    fake.hold({ ...founded(), pack: { id: content.pack.id, version: '0.0.1' } })
    const store = createGameStore(fake, content)
    expect(await store.open('kept')).toBe(true)
    expect(store.get().notice).toMatch(/0\.0\.1/)
    store.dismissNotice()
    expect(store.get().notice).toBeNull()
  })

  it('drops a reply for a nation that is no longer open', async () => {
    const { fake, store, id } = await start()
    await store.found(request('Zembry'))
    let release: () => void = () => {}
    const slow = fake.endDay.bind(fake)
    fake.endDay = async (nation) => {
      await new Promise<void>((resolve) => (release = resolve))
      return slow(nation)
    }
    await store.open(id)
    const ending = store.endDay()
    store.close()
    await store.open('nation-2')
    release()
    await ending.catch(() => undefined)
    expect(stateOf(store).identity.name).toBe('Zembry')
    expect(stateOf(store).day).toBe(1)
  })
})

describe('export, delete, import', () => {
  it('exports from the server, deletes, and imports again', async () => {
    const { store, id } = await start()
    await store.endDay()
    const file = await store.exportSave(id)
    expect(file.filename).toBe('vesland-day-2.json')
    expect(JSON.parse(file.text).id).toBe(id)
    await store.remove(id)
    expect(store.get().nation).toBeNull()
    expect(store.get().nations).toEqual([])
  })

  it('imports a 0.5 save and explains one that is not', async () => {
    const { store } = await start()
    const save = encode(newNationSave(founded(), 'old', '2030-01-01T00:00:00.000Z'))
    const result = await store.importSave(save)
    expect(result).toEqual({ ok: true, id: 'old', name: 'Vesland' })
    expect(store.get().nations.map((n) => n.id)).toContain('old')
    const bad = await store.importSave('{"format":1}')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.problem).toMatch(/damaged/)
  })

  it('moves the saves 0.5 left in the browser, and removes each only once the server has it', async () => {
    const good = encode(newNationSave(founded(), 'old', '2030-01-01T00:00:00.000Z'))
    const kv = memoryStore({ [nationKey('old')]: good, [nationKey('broken')]: 'not a save', 'diplomat:index': '{}' })
    const fake = new FakeServer()
    const store = createGameStore(fake, content, { kv })
    expect(store.get().legacy.map((s) => s.id).sort()).toEqual(['broken', 'old'])
    const result = await store.moveLegacy()
    expect(result.moved).toEqual(['Vesland'])
    expect(result.failed).toHaveLength(1)
    expect(kv.getItem(nationKey('old'))).toBeNull()
    expect(kv.getItem(nationKey('broken'))).toBe('not a save')
    expect(kv.getItem('diplomat:index')).toBe('{}')
    expect(store.get().legacy.map((s) => s.id)).toEqual(['broken'])
    expect(fake.kept.has('old')).toBe(true)
  })
})

describe('the AI settings', () => {
  it('stores a key without ever reading it back, and refreshes the status', async () => {
    const { store } = await start()
    expect(store.get().status!.ai.backend).toBe('none')
    const saved = await store.saveAiSettings({ backend: 'anthropic', apiKey: 'sk-secret' })
    expect(saved).toMatchObject({ backend: 'anthropic', apiKeySet: true })
    expect(JSON.stringify(saved)).not.toContain('sk-secret')
    expect(store.get().status!.ai).toMatchObject({ backend: 'anthropic', ok: true })
    expect((await store.testAi()).detail).toMatch(/key ending/)
  })
})
