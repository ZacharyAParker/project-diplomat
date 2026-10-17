import { endDay } from '@diplomat/engine'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_KEY } from '../logic/settings.ts'
import { download } from '../store/browser.ts'
import { FakeServer } from '../test/fakeServer.ts'
import { content, founded, identity } from '../test/fixtures.ts'
import { heading, mount } from '../test/mount.tsx'

vi.mock('../store/browser.ts', async (original) => ({
  ...(await original<typeof import('../store/browser.ts')>()),
  download: vi.fn(),
}))

beforeEach(() => {
  window.location.hash = ''
})

afterEach(() => {
  cleanup()
})

// A nation a few days old, open on its settings page.
async function settled() {
  const fake = new FakeServer()
  const id = fake.hold(endDay(endDay(founded(), content), content), { id: 'vesland' })
  window.location.hash = `#/n/${id}/settings`
  const mounted = mount(fake)
  await heading('Settings')
  return { ...mounted, id }
}

describe('export, delete and import', () => {
  it('takes a nation out as a file from the server, and deletes it by name', async () => {
    const user = userEvent.setup()
    const { fake, store, id } = await settled()

    await user.click(screen.getByRole('button', { name: 'Export Vesland' }))
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1))
    const [filename, text] = vi.mocked(download).mock.calls[0]!
    expect(filename).toBe('vesland-day-3.json')
    expect(JSON.parse(text).id).toBe(id)

    await user.click(screen.getByRole('button', { name: 'Delete this nation' }))
    const dialog = screen.getByRole('heading', { name: 'Delete Vesland?' }).closest('dialog')!
    await user.click(within(dialog).getByRole('button', { name: 'Delete for good' }))
    expect(within(dialog).getByText('That is not its name.')).toBeDefined()
    expect(fake.kept.has(id)).toBe(true)

    await user.type(within(dialog).getByLabelText("Type the nation's name to confirm"), 'Veslan')
    await user.click(within(dialog).getByRole('button', { name: 'Delete for good' }))
    expect(fake.kept.has(id)).toBe(true)

    await user.type(within(dialog).getByLabelText("Type the nation's name to confirm"), 'd')
    await user.click(within(dialog).getByRole('button', { name: 'Delete for good' }))
    await heading('Run a country')
    expect(fake.kept.has(id)).toBe(false)
    expect(store.get().nation).toBeNull()
    expect(store.get().nations).toEqual([])
  })

  it('backs out of deleting without touching anything', async () => {
    const user = userEvent.setup()
    const { fake, id } = await settled()
    await user.click(screen.getByRole('button', { name: 'Delete this nation' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('heading', { name: 'Delete Vesland?' })).toBeNull()
    expect(fake.kept.has(id)).toBe(true)
  })

  it('imports beside the nation that is open and offers a way to it', async () => {
    const user = userEvent.setup()
    const { fake, store, id } = await settled()
    const text = await fake.exportNation(id)
    const save = JSON.stringify({ ...JSON.parse(text), format: 1 })
    await user.upload(screen.getByTestId('file-input'), new File([save], 'copy.json', { type: 'application/json' }))
    expect(await screen.findByText('Imported Vesland.')).toBeDefined()
    expect(store.get().nations).toHaveLength(2)
    const other = store.get().nations.find((n) => n.id !== id)!
    expect(screen.getByRole('link', { name: 'Open it' }).getAttribute('href')).toBe(`#/n/${other.id}/desk`)
  })

  it('explains a file that is not a save', async () => {
    const user = userEvent.setup()
    const { store } = await settled()
    await user.upload(screen.getByTestId('file-input'), new File(['{}'], 'x.json', { type: 'application/json' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/not imported.*no format number/)
    expect(store.get().nations).toHaveLength(1)
  })
})

describe('identity', () => {
  it('renames the nation and changes its flag, and refuses a blank name', async () => {
    const user = userEvent.setup()
    const { fake, store, id } = await settled()
    const timeline = store.get().nation!.state.timeline

    await user.click(screen.getByRole('button', { name: 'Save name and flag' }))
    expect(screen.getAllByText('Nothing has been changed.').length).toBeGreaterThan(0)

    const name = screen.getByLabelText('Name of the nation')
    await user.clear(name)
    await user.click(screen.getByRole('button', { name: 'Save name and flag' }))
    expect(screen.getByText('This cannot be left blank.')).toBeDefined()
    expect(store.get().nation!.state.identity.name).toBe('Vesland')

    await user.type(name, 'New Vesland')
    await user.click(screen.getByRole('radio', { name: 'Disc' }))
    await user.click(screen.getByRole('button', { name: 'Save name and flag' }))
    expect((await screen.findAllByText('Saved. The papers have been told.'))[0]).toBeDefined()

    const saved = store.get().nation!.state
    expect(saved.identity.name).toBe('New Vesland')
    expect(saved.identity.flag.layout).toBe('disc')
    expect(saved.identity.capital).toBe(identity.capital)
    expect(saved.timeline).toEqual(timeline)
    expect(fake.held(id).state.identity.name).toBe('New Vesland')
    expect(screen.getByRole('link', { name: 'New Vesland' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Export New Vesland' })).toBeDefined()
  })

  it('says why the server refused, and keeps the change on screen', async () => {
    const user = userEvent.setup()
    const { fake } = await settled()
    fake.identity = async () => {
      throw new Error('That name is taken by a neighbour. Pick another.')
    }
    await user.type(screen.getByLabelText('Name of the nation'), 'ia')
    await user.click(screen.getByRole('button', { name: 'Save name and flag' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/taken by a neighbour/)
    expect((screen.getByLabelText('Name of the nation') as HTMLInputElement).value).toBe('Veslandia')
  })
})

describe('the AI', () => {
  it('chooses a back end, takes a key it never shows again, sets the models and tests it', async () => {
    const user = userEvent.setup()
    const { fake } = await settled()
    const sheet = (await screen.findByRole('heading', { name: 'The AI' })).closest('section')!
    expect(within(sheet).getByText('Off')).toBeDefined()
    expect(screen.getByRole('link', { name: 'AI off' })).toBeDefined()

    await user.click(await within(sheet).findByRole('radio', { name: /^A Claude API key/ }))
    const key = within(sheet).getByLabelText('Claude API key') as HTMLInputElement
    expect(key.type).toBe('password')
    expect(within(sheet).getByText(/No key is set yet/)).toBeDefined()
    await user.type(key, 'sk-ant-secret')
    const strategic = within(sheet).getByLabelText('Model for the great bodies') as HTMLInputElement
    expect(strategic.value).toBe('claude-opus-5-5')
    await user.clear(strategic)
    await user.type(strategic, 'claude-sonnet-5-5')
    await user.click(within(sheet).getByRole('button', { name: 'Save the AI settings' }))

    expect(await within(sheet).findByText('Saved.')).toBeDefined()
    expect(fake.calls.find((c) => c.name === 'saveSettings')!.args[0]).toMatchObject({
      backend: 'anthropic',
      apiKey: 'sk-ant-secret',
      models: { strategic: 'claude-sonnet-5-5' },
    })
    expect((within(sheet).getByLabelText('Claude API key') as HTMLInputElement).value).toBe('')
    expect(within(sheet).getByText(/A key is set\. It is never shown again/)).toBeDefined()
    expect(document.body.textContent).not.toContain('sk-ant-secret')
    expect(await screen.findByRole('link', { name: 'AI on: Claude API key ending 4f2a' })).toBeDefined()

    await user.click(within(sheet).getByRole('button', { name: 'Test it' }))
    expect(await within(sheet).findByText('The test passed')).toBeDefined()
  })
})

describe('the Director’s settings', () => {
  it('switches the Director and sets its model, sent as director: { enabled, model }', async () => {
    const user = userEvent.setup()
    const { fake } = await settled()
    const sheet = (await screen.findByRole('heading', { name: 'The AI' })).closest('section')!
    const group = await within(sheet).findByRole('group', { name: 'The Director' })
    const model = within(group).getByLabelText("The Director's model") as HTMLInputElement
    expect(model.value).toBe('claude-opus-5-5')
    await user.clear(model)
    await user.type(model, 'claude-sonnet-5-5')
    await user.click(within(sheet).getByRole('button', { name: 'Save the AI settings' }))
    await within(sheet).findByText('Saved.')
    expect(fake.calls.find((c) => c.name === 'saveSettings')!.args[0]).toMatchObject({
      director: { enabled: true, model: 'claude-sonnet-5-5' },
    })
    await user.click(within(group).getByRole('checkbox', { name: 'Switch the Director on' }))
    expect(within(group).queryByLabelText("The Director's model")).toBeNull()
    await user.click(within(sheet).getByRole('button', { name: 'Save the AI settings' }))
    await waitFor(() => expect(fake.aiSettingsHeld.director).toEqual({ enabled: false, model: 'claude-sonnet-5-5' }))
  })
})

describe('edition', () => {
  it('switches theme and motion at once and remembers them', async () => {
    const user = userEvent.setup()
    const { kv } = await settled()
    const root = document.documentElement

    await user.click(screen.getByRole('radio', { name: 'Night' }))
    expect(root.dataset['theme']).toBe('dark')
    await user.click(screen.getByRole('radio', { name: 'Day' }))
    expect(root.dataset['theme']).toBe('light')

    await user.click(screen.getByRole('checkbox', { name: /^Reduce motion/ }))
    expect(root.dataset['motion']).toBe('reduced')
    expect(JSON.parse(kv.getItem(SETTINGS_KEY)!)).toEqual({ theme: 'light', reduceMotion: true })
    await user.click(screen.getByRole('checkbox', { name: /^Reduce motion/ }))
    expect(root.dataset['motion']).toBeUndefined()
  })
})

describe('about', () => {
  it('gives the versions, the licence and the disclaimer', async () => {
    await settled()
    const about = screen.getByRole('heading', { name: 'Project Diplomat' }).closest('section')!
    expect(within(about).getByText(/^Version \d+\.\d+\.\d+$/)).toBeDefined()
    expect(within(about).getByText(`${content.pack.name}, version ${content.pack.version}`)).toBeDefined()
    expect(within(about).getByText('MIT for the code, CC BY-SA 4.0 for the core pack')).toBeDefined()
    expect(within(about).getByText('Not affiliated with NationStates or Max Barry.')).toBeDefined()
  })

  it('links the terms, the privacy policy and the other papers, each in a new tab', async () => {
    await settled()
    const legal = screen.getByRole('list', { name: 'Legal' })
    const links = within(legal).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['Terms', 'Privacy', 'Notice', 'Licences', 'Copyright', 'Third-party notices', 'Security'])
    expect(links[0]!.getAttribute('href')).toBe('https://github.com/ZacharyAParker/project-diplomat/blob/main/TERMS.md')
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noreferrer noopener')
    }
  })
})
