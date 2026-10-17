import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeServer, holding } from '../test/fakeServer.ts'
import { content, founded } from '../test/fixtures.ts'
import { createGameStore } from '../store/gameStore.ts'
import { heading, mount } from '../test/mount.tsx'

beforeEach(() => {
  window.location.hash = '#/n/kept/director'
})

afterEach(() => {
  cleanup()
})

const transcript = () => screen.getByRole('list', { name: 'The conversation with the Director' })
const box = () => screen.getByLabelText('Your message to the Director')

describe('the Director', () => {
  it('sends with Enter, streams the reply, shows the activity, and fetches the nation again at the end', async () => {
    const user = userEvent.setup()
    const fake = holding(founded())
    fake.directorHoldsAfterFirst = true
    const { store } = mount(fake)
    await heading('The Director')
    expect(screen.getByText(/Nothing said yet/)).toBeDefined()
    expect(screen.getByRole('navigation', { name: 'Out of character' })).toBeDefined()

    await user.type(box(), 'Set debt to 88.{Shift>}{Enter}{/Shift}Quietly.')
    expect((box() as HTMLTextAreaElement).value).toBe('Set debt to 88.\nQuietly.')
    await user.keyboard('{Enter}')

    expect(fake.calls.find((c) => c.name === 'tellDirector')!.args).toEqual(['kept', 'Set debt to 88.\nQuietly.'])
    expect(within(transcript()).getByText(/Set debt to 88\.\s+Quietly\./)).toBeDefined()
    expect((box() as HTMLTextAreaElement).value).toBe('')
    // Busy: Stop is offered and Send is not.
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDefined()
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(transcript()).getByText('(still writing)')).toBeDefined()
    fake.directorHoldsAfterFirst = false
    fake.directorPaused = false

    expect(await within(transcript()).findByText('Used cheat_set_figures')).toBeDefined()
    expect(await within(transcript()).findByText('The OOC log will.')).toBeDefined()
    expect(within(transcript()).getByText('debt').tagName).toBe('STRONG')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull())
    expect(within(transcript()).queryByText('(still writing)')).toBeNull()

    // The cheat is never invisible: the transcript says it was logged.
    expect(await within(transcript()).findByText(/^Cheat logged: set_figures\. Debt set to 88\./)).toBeDefined()
    expect(within(transcript()).getByRole('link', { name: 'In the OOC log, No. 1' }).getAttribute('href')).toBe('#/n/kept/ooc')
    expect((await fake.ooc('kept'))[0]!.request).toBe('Set debt to 88.\nQuietly.')
    // The Director changed the nation, so it was fetched again: the badge says so.
    await waitFor(() => expect(store.get().nation!.state.indicators.debt).toBe(88))
    expect(screen.getByRole('link', { name: 'Sandboxed (see the OOC log)' }).getAttribute('href')).toBe('#/n/kept/ooc')
    // Polling stops once the turn is over.
    const asked = fake.calls.filter((c) => c.name === 'director').length
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(fake.calls.filter((c) => c.name === 'director').length).toBe(asked)
  })

  it('stops a turn in progress', async () => {
    const user = userEvent.setup()
    const fake = holding(founded())
    fake.directorReply = 'A very long answer that will never be finished.'
    mount(fake)
    await heading('The Director')
    // Hold the Director at its first step so the test can press Stop.
    fake.directorHoldsAfterFirst = true
    await user.type(box(), 'Go on.{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Stop' }))
    expect(await within(transcript()).findByText('Stopped by the Founder')).toBeDefined()
    expect(fake.calls.some((c) => c.name === 'stopDirector')).toBe(true)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull())
  })

  it('asks before starting a new session, and keeps the transcript', async () => {
    const user = userEvent.setup()
    const fake = holding(founded())
    mount(fake)
    await heading('The Director')
    await user.type(box(), 'Hello.{Enter}')
    await within(transcript()).findByText('The OOC log will.')
    await waitFor(() => expect((screen.getByRole('button', { name: 'New session' }) as HTMLButtonElement).disabled).toBe(false))

    await user.click(screen.getByRole('button', { name: 'New session' }))
    const dialog = screen.getByRole('heading', { name: 'Start a new session?' }).closest('dialog')!
    expect(within(dialog).getByText(/The transcript so far is kept/)).toBeDefined()
    await user.click(within(dialog).getByRole('button', { name: 'Keep this one' }))
    expect(fake.calls.some((c) => c.name === 'resetDirector')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'New session' }))
    await user.click(screen.getByRole('button', { name: 'Start a new session' }))
    expect(await within(transcript()).findByText('A new session started')).toBeDefined()
    expect(within(transcript()).getByText('Hello.')).toBeDefined()
    expect(fake.directors.get('kept')!.state.session.id).toBe('session-2')
  })

  it('says why it is not available and how to fix it', async () => {
    const fake = holding(founded())
    fake.directorAvailable = false
    mount(fake)
    await heading('The Director')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/not installed on this computer/)
    expect(alert.textContent).toMatch(/installed and signed in/)
    expect(within(alert).getByRole('link', { name: /Settings, under The AI/ }).getAttribute('href')).toBe('#/n/kept/settings')
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps raw HTML in a reply as text, and links only inside the game', async () => {
    const user = userEvent.setup()
    const fake = holding(founded())
    fake.directorReply = '<img src=x onerror="alert(1)"> <script>alert(2)</script> [away](javascript:alert(3)) [court](#/n/kept/gov/body/court)'
    mount(fake)
    await heading('The Director')
    await user.type(box(), '<b>bold?</b>{Enter}')
    const reply = await within(transcript()).findByText(/onerror/, {}, { timeout: 2000 })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull())
    const list = transcript()
    expect(list.querySelector('img, script, b')).toBeNull()
    expect(list.textContent).toContain('<b>bold?</b>')
    expect(list.textContent).toContain('<script>alert(2)</script>')
    expect([...list.querySelectorAll('.director__reply a')].map((a) => a.getAttribute('href'))).toEqual(['#/n/kept/gov/body/court'])
    expect(reply).toBeDefined()
  })
})

describe('the drawer', () => {
  it('opens from the nation header beside the desk, talks, and draws no raw HTML', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/desk'
    const fake = holding(founded())
    fake.directorReply = 'Look at <i>this</i> and **that**.'
    mount(fake)
    await heading('Issues')
    expect(screen.queryByRole('complementary', { name: /The Director/ })).toBeNull()

    const toggle = screen.getByRole('button', { name: 'Talk to the Director' })
    await user.click(toggle)
    const drawer = screen.getByRole('complementary', { name: /The Director/ })
    expect(screen.getByRole('button', { name: 'Close the Director' }).getAttribute('aria-expanded')).toBe('true')
    // The desk is still there, with its Accept buttons.
    expect(screen.getAllByRole('button', { name: /^Accept position/ }).length).toBeGreaterThan(0)
    expect(document.querySelector('.shell--drawer')).not.toBeNull()

    await user.type(within(drawer).getByLabelText('Your message to the Director'), 'What now?{Enter}')
    expect(await within(drawer).findByText('that', {}, { timeout: 2000 })).toBeDefined()
    expect(drawer.querySelector('i')).toBeNull()
    expect(drawer.textContent).toContain('<i>this</i>')

    // It stays open on another page of the nation.
    window.location.hash = '#/n/kept/gov/library'
    await heading('The library')
    expect(screen.getByRole('complementary', { name: /The Director/ })).toBeDefined()
    await user.click(within(screen.getByRole('complementary', { name: /The Director/ })).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('complementary', { name: /The Director/ })).toBeNull()
  })

  it('is not offered on the Director’s own screen', async () => {
    mount(holding(founded()))
    await heading('The Director')
    expect(screen.queryByRole('button', { name: 'Talk to the Director' })).toBeNull()
  })
})

describe('the OOC log', () => {
  it('lists every change made by hand, newest first, with the figures before and after', async () => {
    const fake = holding(founded())
    fake.oocLogs.set('kept', [
      {
        n: 2,
        at: '2030-01-02T10:00:00.000Z',
        day: 4,
        action: 'force_outcome',
        detail: 'Petition #2 forced to Option 3.',
        request: 'Make it Option 3, whatever the Court says.',
        undone: true,
      },
      {
        n: 1,
        at: '2030-01-01T09:00:00.000Z',
        day: 2,
        action: 'set_figures',
        detail: 'Debt and liberty.',
        request: 'Debt to 88 <please>.',
        changes: [
          { target: 'debt', from: 40, to: 88 },
          { target: 'motto', from: undefined, to: '<b>Onward</b>' },
        ],
      },
    ])
    window.location.hash = '#/n/kept/ooc'
    mount(fake)
    await heading('The OOC log')
    const entries = await screen.findAllByRole('listitem', {}, {})
    const items = entries.filter((li) => li.classList.contains('ooc__entry'))
    expect(items.map((li) => li.querySelector('strong')!.textContent)).toEqual(['force_outcome', 'set_figures'])
    expect(within(items[1]!).getByText(/^debt: 40/).textContent).toMatch(/debt: 40 → to 88/)
    expect(within(items[1]!).getByText(/^motto:/).textContent).toMatch(/nothing → to <b>Onward<\/b>/)
    expect(items[1]!.querySelector('b')).toBeNull()
    expect(within(items[0]!).getByText('Make it Option 3, whatever the Court says.')).toBeDefined()
    expect(within(items[1]!).getByText('Debt to 88 <please>.')).toBeDefined()
    expect(within(items[0]!).getByText('Undone')).toBeDefined()
    expect(within(items[0]!).queryByRole('button', { name: /^Undo/ })).toBeNull()
    expect(within(items[1]!).getByRole('button', { name: 'Undo cheat No. 1' })).toBeDefined()
    expect(screen.getAllByRole('link', { name: 'OOC log' }).some((a) => a.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('undoes a cheat only once confirmed, and puts the figure back', async () => {
    const user = userEvent.setup()
    const fake = holding(founded())
    const before = fake.held().state.indicators.debt
    fake.held().state = { ...fake.held().state, indicators: { ...fake.held().state.indicators, debt: 88 }, sandbox: true }
    fake.logCheat('kept', { day: 1, action: 'set_figures', detail: 'Debt set to 88.', request: 'Debt to 88.', changes: [{ target: 'debt', from: before, to: 88 }] })
    window.location.hash = '#/n/kept/ooc'
    const { store } = mount(fake)
    await heading('The OOC log')
    await user.click(await screen.findByRole('button', { name: 'Undo cheat No. 1' }))
    await user.click(screen.getByRole('button', { name: 'Leave it' }))
    expect(fake.calls.some((c) => c.name === 'undoCheat')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Undo cheat No. 1' }))
    await user.click(screen.getByRole('button', { name: 'Undo it' }))
    await waitFor(() => expect(store.get().nation!.state.indicators.debt).toBe(before))
    expect(await screen.findByText('Undoes No. 1')).toBeDefined()
    expect(screen.getByText('Undone')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Undo cheat No. 1' })).toBeNull()
  })

  it('says so when nothing has been changed by hand', async () => {
    window.location.hash = '#/n/kept/ooc'
    mount(holding(founded()))
    expect(await screen.findByText(/Nothing has been changed by hand/)).toBeDefined()
  })
})

describe('the store', () => {
  it('polls while busy and reloads the nation when the turn ends', async () => {
    const fake = holding(founded())
    const store = createGameStore(fake, content)
    await store.open('kept')
    await store.loadDirector()
    expect(store.get().director!.busy).toBe(false)
    await store.tellDirector('Cheat, please.')
    expect(store.get().director!.busy).toBe(true)
    expect(await store.pollDirector()).toBe(true)
    expect(store.get().nation!.state.indicators.debt).not.toBe(88)
    expect(await store.pollDirector()).toBe(false)
    expect(store.get().nation!.state.indicators.debt).toBe(88)
    expect(store.get().nation!.state.sandbox).toBe(true)
    expect((await store.oocLog())[0]).toMatchObject({ n: 1, action: 'set_figures', request: 'Cheat, please.', changes: [{ target: 'debt', to: 88 }] })
    const last = store.get().director!.messages.at(-1)!.id
    expect(store.get().cheats[last]!.map((c) => c.n)).toEqual([1])
    await store.undoCheat(1)
    expect(store.get().nation!.state.indicators.debt).toBe(founded().indicators.debt)
    await expect(store.tellDirector('Again')).resolves.toBeUndefined()
    await expect(store.tellDirector('And again')).rejects.toThrow(/still answering/)
  })

  it('reads and writes the Director settings', async () => {
    const fake = new FakeServer()
    const store = createGameStore(fake, content)
    expect((await store.aiSettings()).director).toEqual({ enabled: true, model: 'claude-opus-5-5' })
    await store.saveAiSettings({ director: { enabled: false, model: 'claude-sonnet-5-5' } })
    expect((await store.aiSettings()).director).toEqual({ enabled: false, model: 'claude-sonnet-5-5' })
  })
})
