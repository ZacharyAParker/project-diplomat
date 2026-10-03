import { classify } from '@diplomat/engine'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '../App.tsx'
import { memoryStore, nationKey, openNation, type KeyValue } from '../logic/saves.ts'
import { GameProvider } from '../store/game.tsx'
import { createGameStore, type GameStore } from '../store/gameStore.ts'
import { SettingsProvider } from '../store/settings.tsx'
import { content, firstAnswers, identity } from '../test/fixtures.ts'
import { Announcer } from '../ui/index.ts'

function mount(kv: KeyValue = memoryStore()): { kv: KeyValue; store: GameStore } {
  const store = createGameStore(kv, content)
  render(
    <SettingsProvider kv={kv}>
      <GameProvider store={store}>
        <Announcer>
          <App />
        </Announcer>
      </GameProvider>
    </SettingsProvider>,
  )
  return { kv, store }
}

const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name })

beforeEach(() => {
  window.location.hash = ''
})

afterEach(() => {
  cleanup()
})

describe('a first visit', () => {
  it('shows the pitch and one way in', async () => {
    mount()
    expect(await heading('Run a country')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Found a nation' })).toBeDefined()
    expect(screen.queryByRole('list', { name: /nations/i })).toBeNull()
    expect(screen.getByText(/Not affiliated with NationStates or Max Barry/)).toBeDefined()
  })

  it('says so when nothing can be stored', async () => {
    const store = createGameStore(memoryStore(), content)
    render(
      <SettingsProvider kv={memoryStore()}>
        <GameProvider store={store}>
          <App persistent={false} />
        </GameProvider>
      </SettingsProvider>,
    )
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringMatching(/Nothing will be kept/),
    )
  })
})

describe('founding a nation', () => {
  it('goes from the pitch to the first morning and on to the desk, saving the nation', async () => {
    const user = userEvent.setup()
    const { kv, store } = mount()

    await user.click(await screen.findByRole('link', { name: 'Found a nation' }))
    const naming = await heading('Name the nation')
    expect(document.activeElement).toBe(naming)

    await user.click(screen.getByRole('button', { name: 'Next: the flag' }))
    expect(screen.getAllByText('This cannot be left blank.')).toHaveLength(5)
    expect(document.activeElement).toBe(screen.getByLabelText('Name of the nation'))
    expect(window.location.hash).toBe('#/found')

    await user.click(screen.getByRole('button', { name: 'Suggest everything' }))
    expect(screen.queryByText('This cannot be left blank.')).toBeNull()
    const name = screen.getByLabelText('Name of the nation') as HTMLInputElement
    expect(name.value).not.toBe('')
    const capital = (screen.getByLabelText('Capital') as HTMLInputElement).value
    await user.click(screen.getByRole('button', { name: 'Suggest a capital' }))
    expect((screen.getByLabelText('Capital') as HTMLInputElement).value).not.toBe(capital)

    await user.clear(name)
    await user.type(name, '<b>Testland</b>')
    await user.click(screen.getByRole('button', { name: 'Next: the flag' }))

    expect(document.activeElement).toBe(await heading('Give it a flag'))
    await user.click(screen.getByRole('radio', { name: 'Cross' }))
    const gold = within(screen.getByRole('group', { name: 'Cross' })).getByRole('radio', { name: 'Gold' })
    await user.click(gold)
    expect(screen.getByRole('img', { name: /The flag as it stands \(cross: .*gold\)/ })).toBeDefined()

    await user.click(screen.getByRole('link', { name: 'Back' }))
    await heading('Name the nation')
    expect((screen.getByLabelText('Name of the nation') as HTMLInputElement).value).toBe('<b>Testland</b>')
    await user.click(screen.getByRole('button', { name: 'Next: the flag' }))
    await heading('Give it a flag')
    expect((screen.getByRole('radio', { name: 'Cross' }) as HTMLInputElement).checked).toBe(true)

    await user.click(screen.getByRole('link', { name: 'Next: its character' }))
    await heading('Its character')

    const { questions } = content.founding
    await user.click(screen.getByRole('button', { name: questions.length > 1 ? 'Next question' : /^Found / }))
    expect(screen.getByRole('alert').textContent).toMatch(/Pick an answer first/)

    for (const [i, question] of questions.entries()) {
      expect(screen.getByText(`Question ${i + 1} of ${questions.length}`)).toBeDefined()
      const radios = screen.getAllByRole('radio')
      expect(radios).toHaveLength(question.answers.length)
      await user.click(radios[0]!)
      if (i === 1) {
        await user.click(screen.getByRole('button', { name: 'Back' }))
        expect((screen.getAllByRole('radio')[0] as HTMLInputElement).checked).toBe(true)
        await user.click(screen.getByRole('button', { name: 'Next question' }))
        expect((screen.getAllByRole('radio')[0] as HTMLInputElement).checked).toBe(true)
      }
      const last = i === questions.length - 1
      await user.click(screen.getByRole('button', { name: last ? 'Found <b>Testland</b>' : 'Next question' }))
    }

    expect(document.activeElement).toBe(await heading('The first morning'))
    const nation = store.get().nation!
    expect(window.location.hash).toBe(`#/n/${nation.id}/morning`)
    expect(nation.state.identity.name).toBe('<b>Testland</b>')
    expect(nation.state.identity.flag.layout).toBe('cross')
    expect(nation.state.identity.flag.colours[1]).toBe('#d9a521')
    expect(document.querySelector('b')).toBeNull()

    const stored = openNation(kv, nation.id, content)
    expect(stored.ok && stored.nation).toEqual(nation)

    const nationClass = classify(nation.state, content)
    expect(screen.getByRole('heading', { level: 2, name: nationClass.name })).toBeDefined()
    expect(screen.getByText(nationClass.description)).toBeDefined()
    const founding = nation.state.timeline[0]!
    expect(founding.kind).toBe('founding')
    for (const change of founding.changes) expect(screen.getAllByText(change.why).length).toBeGreaterThan(0)
    expect(screen.queryByText(/[+-]\d/)).toBeNull()

    await user.click(screen.getByRole('link', { name: 'To work' }))
    expect(document.activeElement).toBe(await heading('Issues'))
    expect(screen.getByRole('link', { name: 'Issues' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('Day 1')).toBeDefined()
  })

  it('sends a visitor who skips ahead back to the first step', async () => {
    window.location.hash = '#/found/questions'
    mount()
    expect(await heading('Name the nation')).toBeDefined()
    expect(window.location.hash).toBe('#/found')
  })
})

describe('coming back', () => {
  function seeded(): KeyValue {
    const kv = memoryStore()
    createGameStore(kv, content, {
      id: () => 'home-test',
      seed: () => 3,
      now: () => '2030-01-01T00:00:00.000Z',
    }).found(identity, firstAnswers())
    return kv
  }

  it('lists the nations with open, found another and import', async () => {
    mount(seeded())
    expect(await heading('Your nations')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Vesland' }).getAttribute('href')).toBe('#/n/home-test/desk')
    expect(screen.getByRole('link', { name: 'Open Vesland' })).toBeDefined()
    expect(screen.getByText(/Day 1/)).toBeDefined()
    expect(screen.getByRole('link', { name: 'Found another' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Import a save' })).toBeDefined()
  })

  it('opens a nation straight from its address', async () => {
    window.location.hash = '#/n/home-test/desk'
    mount(seeded())
    expect(await heading('Issues')).toBeDefined()
    expect(screen.getByRole('link', { name: 'All nations' })).toBeDefined()
  })

  it('imports a save file from the home screen', async () => {
    const user = userEvent.setup()
    const text = seeded().getItem(nationKey('home-test'))!
    mount()
    await heading('Run a country')
    await user.upload(
      screen.getByTestId('file-input'),
      new File([text], 'vesland.json', { type: 'application/json' }),
    )
    expect(await heading('Your nations')).toBeDefined()
    expect(screen.getByText('Imported Vesland.')).toBeDefined()
  })

  it('explains a file that is not a save', async () => {
    const user = userEvent.setup()
    mount()
    await heading('Run a country')
    await user.upload(
      screen.getByTestId('file-input'),
      new File(['hello'], 'notes.json', { type: 'application/json' }),
    )
    expect((await screen.findByRole('alert')).textContent).toMatch(/not imported.*not valid JSON/)
  })

  it('shows what is wrong with a corrupt save, offers the raw text, and removes it only when asked', async () => {
    const user = userEvent.setup()
    const kv = seeded()
    kv.setItem(nationKey('broken'), '{"format":1,')
    window.location.hash = '#/n/broken/desk'
    mount(kv)

    expect(await heading('This nation cannot be opened')).toBeDefined()
    expect(screen.getByRole('alert').textContent).toMatch(/not valid JSON/)
    expect(screen.getByRole('button', { name: 'Export the raw save' })).toBeDefined()
    expect(kv.getItem(nationKey('broken'))).toBe('{"format":1,')

    await user.click(screen.getByRole('button', { name: 'Remove it' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(kv.getItem(nationKey('broken'))).toBe('{"format":1,')

    await user.click(screen.getByRole('button', { name: 'Remove it' }))
    await user.click(screen.getByRole('button', { name: 'Remove it for good' }))
    expect(await heading('Your nations')).toBeDefined()
    expect(kv.getItem(nationKey('broken'))).toBeNull()
    expect(kv.getItem(nationKey('home-test'))).not.toBeNull()
  })

  it('has a page for a wrong address', async () => {
    window.location.hash = '#/somewhere/else'
    mount()
    expect(await heading('No such page')).toBeDefined()
  })
})

describe('the kit', () => {
  it('renders every base component in both themes without complaint', async () => {
    window.location.hash = '#/kit'
    mount()
    expect(await heading('The kit')).toBeDefined()
    expect(
      document.querySelectorAll('[data-theme="light"], [data-theme="dark"]').length,
    ).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByRole('meter').length).toBeGreaterThan(4)
  })
})
