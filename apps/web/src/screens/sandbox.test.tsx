import { callUp } from '@diplomat/engine'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { content, founded } from '../test/fixtures.ts'
import { heading, holding, mount } from '../test/mount.tsx'

beforeEach(() => {
  window.location.hash = ''
})

afterEach(() => {
  cleanup()
})

describe('the sandbox', () => {
  it('changes a figure, says so in the record and marks the nation on every page', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/sandbox'
    const { store } = mount(holding(founded()))
    await heading('Sandbox')
    expect(screen.getByText('Before you touch anything')).toBeDefined()
    expect(screen.queryByText('Sandbox', { selector: '.sandbox-mark' })).toBeNull()

    await user.type(screen.getByRole('spinbutton', { name: 'Debt' }), '88')
    await user.click(screen.getByRole('button', { name: 'Apply the figures' }))

    const state = store.get().nation!.state
    expect(state.indicators.debt).toBe(88)
    expect(state.sandbox).toBe(true)
    expect(state.timeline.at(-1)!.kind).toBe('sandbox')
    expect(screen.getByText('This nation is sandboxed')).toBeDefined()
    expect(screen.getByText('Sandbox', { selector: '.sandbox-mark' })).toBeDefined()
  })

  it('skips days without marking the nation', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/sandbox'
    const { store } = mount(holding(founded()))
    await heading('Sandbox')
    await user.click(screen.getByRole('button', { name: 'Skip a week' }))
    expect(store.get().nation!.state.day).toBe(8)
    expect(store.get().nation!.state.sandbox).toBeUndefined()
  })
})

describe('naming the nation\'s animal', () => {
  it('asks for a name before accepting, then makes it part of the nation', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/desk'
    const { store } = mount(holding(callUp(founded(), content, 'national-animal'), { noDockets: true }))
    await heading('Issues')

    const issue = screen.getByRole('heading', { level: 3, name: 'A Beast for the Coat of Arms' }).closest('article')!
    const own = within(issue).getByRole('button', { name: /^Accept position 4: / })
    await user.click(own)
    expect(within(issue).getByText(/Write a name first/)).toBeDefined()
    expect(store.get().nation!.state.identity.animal).toBeUndefined()

    await user.type(within(issue).getByRole('textbox', { name: 'The national animal' }), 'Lesser spotted owl')
    await user.click(own)
    await waitFor(() => expect(store.get().nation!.state.identity.animal).toBe('Lesser spotted owl'))
  })
})

describe('the admin page', () => {
  it('asks for a password to be set, then for it every time it is locked', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/admin'
    mount()
    await heading('Admin')

    await user.type(screen.getByLabelText('Password'), 'short')
    await user.type(screen.getByLabelText('The same again'), 'short')
    await user.click(screen.getByRole('button', { name: 'Set the password' }))
    expect(screen.getByText('It needs at least 10 characters.')).toBeDefined()

    await user.clear(screen.getByLabelText('Password'))
    await user.clear(screen.getByLabelText('The same again'))
    await user.type(screen.getByLabelText('Password'), 'a long admin password')
    await user.type(screen.getByLabelText('The same again'), 'a long admin password')
    await user.click(screen.getByRole('button', { name: 'Set the password' }))
    expect(await screen.findByRole('heading', { name: 'Delete everything' })).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Lock the admin page' }))
    expect(screen.queryByRole('heading', { name: 'Delete everything' })).toBeNull()
    await user.type(screen.getByLabelText('Admin password'), 'a long admin password')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('heading', { name: 'Delete everything' })).toBeDefined()
  })
})
