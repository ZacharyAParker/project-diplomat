import { classify, newNation } from '@diplomat/engine'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FORMS, MODES } from '../logic/forms.ts'
import { encode, memoryStore, nationKey, newNationSave } from '../logic/saves.ts'
import { FakeServer } from '../test/fakeServer.ts'
import { content, firstAnswers, founded, identity } from '../test/fixtures.ts'
import { heading, mount } from '../test/mount.tsx'

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
    expect(screen.getByRole('link', { name: 'AI off' })).toBeDefined()
  })

  it('says so when the server is not answering, and tries again when asked', async () => {
    const user = userEvent.setup()
    const fake = new FakeServer()
    fake.down = true
    mount(fake)
    expect(await heading('The server is not answering')).toBeDefined()
    expect(screen.getByRole('alert').textContent).toMatch(/pnpm start/)
    expect(screen.getByRole('link', { name: 'AI: the server is not answering' })).toBeDefined()
    fake.down = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await heading('Run a country')).toBeDefined()
  })
})

async function throughTheQuestions(user: ReturnType<typeof userEvent.setup>) {
  const { questions } = content.founding
  for (const [i] of questions.entries()) {
    await user.click(screen.getAllByRole('radio')[0]!)
    await user.click(
      screen.getByRole('button', { name: i === questions.length - 1 ? 'Next: the government' : 'Next question' }),
    )
  }
}

describe('founding a nation', () => {
  it('goes from the pitch to the first morning and on to the desk, founding it on the server', async () => {
    const user = userEvent.setup()
    const { fake, store } = mount()

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
    await user.click(
      screen.getByRole('button', { name: questions.length > 1 ? 'Next question' : 'Next: the government' }),
    )
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
      await user.click(screen.getByRole('button', { name: last ? 'Next: the government' : 'Next question' }))
    }

    // The form of government: the eight templates, each with a line.
    await heading('Its government')
    expect(window.location.hash).toBe('#/found/form')
    expect(screen.getAllByRole('radio')).toHaveLength(FORMS.length)
    expect(FORMS.map((f) => f.id)).not.toContain('custom')
    for (const form of FORMS) expect(screen.getByText(form.line)).toBeDefined()
    expect((screen.getByRole('radio', { name: /^Commonwealth/ }) as HTMLInputElement).checked).toBe(true)
    await user.click(screen.getByRole('radio', { name: /^Presidential republic/ }))
    await user.click(screen.getByRole('link', { name: 'Next: your part in it' }))

    // The mode, each explained in a sentence.
    await heading('Your part in it')
    expect(screen.getByText(/the office of the President/)).toBeDefined()
    for (const mode of MODES) expect(screen.getByText(mode.line)).toBeDefined()
    await user.click(screen.getByRole('radio', { name: /^Found/ }))
    await user.click(screen.getByRole('link', { name: 'Back' }))
    await heading('Its government')
    expect((screen.getByRole('radio', { name: /^Presidential republic/ }) as HTMLInputElement).checked).toBe(true)
    await user.click(screen.getByRole('link', { name: 'Next: your part in it' }))
    await heading('Your part in it')
    expect((screen.getByRole('radio', { name: /^Found/ }) as HTMLInputElement).checked).toBe(true)
    await user.click(screen.getByRole('link', { name: 'Next: the Founder' }))

    // The Founder, "the Founder" unless changed.
    await heading('The Founder')
    const founderName = screen.getByLabelText("The Founder's name") as HTMLInputElement
    expect(founderName.value).toBe('the Founder')
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Founder')
    await user.clear(founderName)
    await user.click(screen.getByRole('button', { name: 'Found <b>Testland</b>' }))
    expect(screen.getByText(/The Founder needs a name/)).toBeDefined()
    expect(fake.calls.some((c) => c.name === 'found')).toBe(false)
    await user.type(founderName, 'Aegis')
    await user.click(screen.getByRole('button', { name: 'Found <b>Testland</b>' }))

    expect(document.activeElement).toBe(await heading('The first morning'))
    const nation = store.get().nation!
    expect(window.location.hash).toBe(`#/n/${nation.id}/morning`)
    expect(fake.calls.find((c) => c.name === 'found')!.args[0]).toMatchObject({
      identity: { name: '<b>Testland</b>' },
      form: 'presidential',
      mode: 'found',
      founder: { name: 'Aegis', title: 'Founder' },
    })
    expect(nation.state.identity.flag.layout).toBe('cross')
    expect(nation.state.identity.flag.colours[1]).toBe('#d9a521')
    expect(document.querySelector('b')).toBeNull()
    expect(fake.held(nation.id).state).toEqual(nation.state)
    expect(store.get().government!.mode).toBe('found')

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
  }, 15_000)

  it('shows the server’s refusal at the last step and keeps everything entered', async () => {
    const user = userEvent.setup()
    const fake = new FakeServer()
    mount(fake)
    await user.click(await screen.findByRole('link', { name: 'Found a nation' }))
    await heading('Name the nation')
    await user.click(screen.getByRole('button', { name: 'Suggest everything' }))
    await user.click(screen.getByRole('button', { name: 'Next: the flag' }))
    await user.click(await screen.findByRole('link', { name: 'Next: its character' }))
    await heading('Its character')
    await throughTheQuestions(user)
    await user.click(await screen.findByRole('link', { name: 'Next: your part in it' }))
    await user.click(await screen.findByRole('link', { name: 'Next: the Founder' }))
    await heading('The Founder')
    fake.found = async () => {
      throw new Error('The data folder is full. Free some space and try again.')
    }
    await user.click(screen.getByRole('button', { name: /^Found / }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/data folder is full/)
    expect(window.location.hash).toBe('#/found/founder')
    expect((screen.getByLabelText("The Founder's name") as HTMLInputElement).value).toBe('the Founder')
  })

  it('sends a visitor who skips ahead back to the first step', async () => {
    window.location.hash = '#/found/founder'
    mount()
    expect(await heading('Name the nation')).toBeDefined()
    expect(window.location.hash).toBe('#/found')
  })
})

describe('coming back', () => {
  function seeded(): FakeServer {
    const fake = new FakeServer()
    fake.hold(newNation(content, identity, 3, firstAnswers()), { id: 'home-test' })
    return fake
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

  it('opens a nation straight from its address, with the Government group in the menu', async () => {
    window.location.hash = '#/n/home-test/desk'
    mount(seeded())
    expect(await heading('Issues')).toBeDefined()
    expect(screen.getByRole('link', { name: 'All nations' })).toBeDefined()
    const group = screen.getByRole('navigation', { name: 'Government' })
    for (const name of ['Today', 'Library', 'In force', 'The Assembly', 'The Court', 'Executive', 'Country']) {
      expect(within(group).getByRole('link', { name })).toBeDefined()
    }
    expect(within(group).getByRole('link', { name: /^Founder’s page/ }).textContent).toMatch(/waiting for you/)
  })

  it('imports a save file from the home screen', async () => {
    const user = userEvent.setup()
    const text = encode(newNationSave(founded(), 'from-file', '2030-01-01T00:00:00.000Z'))
    const { fake } = mount()
    await heading('Run a country')
    await user.upload(screen.getByTestId('file-input'), new File([text], 'vesland.json', { type: 'application/json' }))
    expect(await heading('Your nations')).toBeDefined()
    expect(screen.getByText('Imported Vesland.')).toBeDefined()
    expect(fake.kept.has('from-file')).toBe(true)
  })

  it('explains a file that is not a save', async () => {
    const user = userEvent.setup()
    mount()
    await heading('Run a country')
    await user.upload(screen.getByTestId('file-input'), new File(['hello'], 'notes.json', { type: 'application/json' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/not imported.*not valid JSON/)
  })

  it('offers to move the saves 0.5 left in this browser, and removes them once moved', async () => {
    const user = userEvent.setup()
    const kv = memoryStore({
      [nationKey('old')]: encode(newNationSave(founded(), 'old', '2030-01-01T00:00:00.000Z')),
    })
    const { fake } = mount(new FakeServer(), kv)
    await heading('Run a country')
    expect(screen.getByText('Nations from an earlier version')).toBeDefined()
    expect(screen.getByText(/saved by version 0\.5/).textContent).toMatch(/Vesland/)
    await user.click(screen.getByRole('button', { name: 'Move it to the server' }))
    expect(await heading('Your nations')).toBeDefined()
    expect(await screen.findByText('Moved Vesland.')).toBeDefined()
    expect(kv.getItem(nationKey('old'))).toBeNull()
    expect(fake.kept.has('old')).toBe(true)
  })

  it('shows what is wrong with a nation that will not open, and removes it only when asked', async () => {
    const user = userEvent.setup()
    const fake = seeded()
    fake.hold({ ...founded(), pack: { id: 'homebrew', version: '1' } }, { id: 'broken', noDockets: true })
    window.location.hash = '#/n/broken/desk'
    mount(fake)

    expect(await heading('This nation cannot be opened')).toBeDefined()
    expect(screen.getByRole('alert').textContent).toMatch(/homebrew/)
    expect(await screen.findByRole('button', { name: 'Export the raw save' })).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Remove it' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(fake.kept.has('broken')).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Remove it' }))
    await user.click(screen.getByRole('button', { name: 'Remove it for good' }))
    expect(await heading('Your nations')).toBeDefined()
    await waitFor(() => expect(fake.kept.has('broken')).toBe(false))
    expect(fake.kept.has('home-test')).toBe(true)
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
    expect(document.querySelectorAll('[data-theme="light"], [data-theme="dark"]').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByRole('meter').length).toBeGreaterThan(4)
  })
})
