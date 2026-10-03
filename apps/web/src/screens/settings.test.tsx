import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryStore, nationKey } from '../logic/saves.ts'
import { SETTINGS_KEY } from '../logic/settings.ts'
import { download } from '../store/browser.ts'
import { createGameStore } from '../store/gameStore.ts'
import { content, firstAnswers, identity } from '../test/fixtures.ts'
import { fixedSources, heading, mount } from '../test/mount.tsx'

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
  const kv = memoryStore()
  const earlier = createGameStore(kv, content, fixedSources())
  const id = earlier.found(identity, firstAnswers())
  earlier.endDay()
  earlier.endDay()
  window.location.hash = `#/n/${id}/settings`
  const mounted = mount(kv)
  await heading('Settings')
  return { ...mounted, id }
}

describe('export, delete and import', () => {
  it('takes a nation out as a file, deletes it by name, and brings back the same nation', async () => {
    const user = userEvent.setup()
    const { kv, store, id } = await settled()
    const before = store.get().nation!

    await user.click(screen.getByRole('button', { name: 'Export Vesland' }))
    expect(download).toHaveBeenCalledTimes(1)
    const [filename, text] = vi.mocked(download).mock.calls[0]!
    expect(filename).toBe('vesland-day-3.json')
    expect(kv.getItem(nationKey(id))).toBe(text)

    await user.click(screen.getByRole('button', { name: 'Delete this nation' }))
    const dialog = screen.getByRole('heading', { name: 'Delete Vesland?' }).closest('dialog')!
    await user.click(within(dialog).getByRole('button', { name: 'Delete for good' }))
    expect(within(dialog).getByText('That is not its name.')).toBeDefined()
    expect(kv.getItem(nationKey(id))).not.toBeNull()

    await user.type(within(dialog).getByLabelText("Type the nation's name to confirm"), 'Veslan')
    await user.click(within(dialog).getByRole('button', { name: 'Delete for good' }))
    expect(kv.getItem(nationKey(id))).not.toBeNull()

    await user.type(within(dialog).getByLabelText("Type the nation's name to confirm"), 'd')
    await user.click(within(dialog).getByRole('button', { name: 'Delete for good' }))
    await heading('Run a country')
    expect(kv.getItem(nationKey(id))).toBeNull()
    expect(store.get().nation).toBeNull()
    expect(store.get().nations).toEqual([])

    await user.upload(
      screen.getByTestId('file-input'),
      new File([text], filename, { type: 'application/json' }),
    )
    await heading('Your nations')
    expect(screen.getByText('Imported Vesland.')).toBeDefined()
    await user.click(screen.getByRole('link', { name: 'Open Vesland' }))
    await heading('Issues')
    expect(store.get().nation).toEqual(before)
    expect(screen.getByText('Day 3')).toBeDefined()
  })

  it('backs out of deleting without touching anything', async () => {
    const user = userEvent.setup()
    const { kv, id } = await settled()
    await user.click(screen.getByRole('button', { name: 'Delete this nation' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('heading', { name: 'Delete Vesland?' })).toBeNull()
    expect(kv.getItem(nationKey(id))).not.toBeNull()
  })

  it('imports beside the nation that is open and offers a way to it', async () => {
    const user = userEvent.setup()
    const { kv, store, id } = await settled()
    const text = kv.getItem(nationKey(id))!
    await user.upload(
      screen.getByTestId('file-input'),
      new File([text], 'copy.json', { type: 'application/json' }),
    )
    expect(await screen.findByText('Imported Vesland.')).toBeDefined()
    expect(store.get().nations).toHaveLength(2)
    const other = store.get().nations.find((n) => n.id !== id)!
    expect(screen.getByRole('link', { name: 'Open it' }).getAttribute('href')).toBe(`#/n/${other.id}/desk`)
  })

  it('explains a file that is not a save', async () => {
    const user = userEvent.setup()
    const { store } = await settled()
    await user.upload(
      screen.getByTestId('file-input'),
      new File(['{}'], 'x.json', { type: 'application/json' }),
    )
    expect((await screen.findByRole('alert')).textContent).toMatch(/not imported.*no format number/)
    expect(store.get().nations).toHaveLength(1)
  })
})

describe('identity', () => {
  it('renames the nation and changes its flag, and refuses a blank name', async () => {
    const user = userEvent.setup()
    const { store } = await settled()
    const timeline = store.get().nation!.state.timeline

    await user.click(screen.getByRole('button', { name: 'Save name and flag' }))
    expect(screen.getByText('Nothing has been changed.')).toBeDefined()

    const name = screen.getByLabelText('Name of the nation')
    await user.clear(name)
    await user.click(screen.getByRole('button', { name: 'Save name and flag' }))
    expect(screen.getByText('This cannot be left blank.')).toBeDefined()
    expect(store.get().nation!.state.identity.name).toBe('Vesland')

    await user.type(name, 'New Vesland')
    await user.click(screen.getByRole('radio', { name: 'Disc' }))
    await user.click(screen.getByRole('button', { name: 'Save name and flag' }))
    expect(screen.getAllByText('Saved. The papers have been told.')[0]).toBeDefined()

    const saved = store.get().nation!.state
    expect(saved.identity.name).toBe('New Vesland')
    expect(saved.identity.flag.layout).toBe('disc')
    expect(saved.identity.capital).toBe(identity.capital)
    expect(saved.timeline).toEqual(timeline)
    expect(screen.getByRole('link', { name: 'New Vesland' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Export New Vesland' })).toBeDefined()
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
    expect(within(about).getByText('MIT')).toBeDefined()
    expect(within(about).getByText('Not affiliated with NationStates or Max Barry.')).toBeDefined()
  })
})
