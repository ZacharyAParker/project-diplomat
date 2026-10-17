import { agendaItems, availableOptions } from '@diplomat/engine'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeServer, PARTIES, holding } from '../test/fakeServer.ts'
import { content, founded } from '../test/fixtures.ts'
import { heading, mount } from '../test/mount.tsx'

beforeEach(() => {
  window.location.hash = '#/n/kept/desk'
})

afterEach(() => {
  cleanup()
})

const state = founded()
const major = agendaItems(state, content).major!
const options = availableOptions(major.options, state)

function card() {
  return screen.getByRole('heading', { level: 3, name: major.title }).closest('article')!
}

const accept = (n: number) => within(card()).getByRole('button', { name: new RegExp(`^Accept position ${n}: `) })

describe('a petition before the bodies', () => {
  it('shows the advice, the sitting by party, the ruling and the standing in words', async () => {
    const user = userEvent.setup()
    mount(holding(state))
    await heading('Issues')
    const issue = within(card())

    expect(issue.getByText('Petition #1')).toBeDefined()
    expect(issue.getByText('Ready for a decision')).toBeDefined()
    expect(issue.getByText(/The Assembly carried Option 1 by 90 of 151/)).toBeDefined()

    await user.click(issue.getByText(/The ministries’ advice/))
    expect(issue.getAllByText(/^\s*favours Option 1$/).length).toBe(2)
    expect(issue.getAllByText(/Costing: about 0\.2bn a year/).length).toBe(2)

    // The division: every party by name beside its colour, and the result in words.
    const table = issue.getByRole('table', { name: 'How The Assembly divided, by party' })
    for (const party of PARTIES) expect(within(table).getByRole('rowheader', { name: party.name })).toBeDefined()
    expect(within(table).getByRole('row', { name: /The Red Party 70 0 0/ })).toBeDefined()
    expect(issue.getByText(/Carried, 90 to 50, with 11 abstaining\. It does not bind the steward\./)).toBeDefined()
    expect(issue.getAllByText('(sat without the AI)').length).toBeGreaterThan(0)
    expect(issue.getByText(/In order of preference:/).parentElement!.textContent).toMatch(/Option 1, then Option 2/)

    await user.click(issue.getByText(/every course permitted/))
    expect(issue.getAllByText('Permitted').length).toBe(options.length)
    expect(issue.getAllByText('7 to 0').length).toBe(options.length)
    expect(issue.getByRole('link', { name: 'The debate in Hansard' }).getAttribute('href')).toMatch(/^#\/n\/kept\/gov\/doc\/hansard-/)
  })

  it('disables a barred course and lets only a Word take it', async () => {
    const user = userEvent.setup()
    const fake = holding(state)
    fake.bar(major.id, options[1]!.id)
    const { store } = mount(fake)
    await heading('Issues')
    const issue = within(card())

    expect((accept(2) as HTMLButtonElement).disabled).toBe(true)
    expect((accept(1) as HTMLButtonElement).disabled).toBe(false)
    expect(within(accept(2).closest('li')!).getByText('Barred')).toBeDefined()
    expect(issue.getByText('Barred by the Court, 5 to 2.')).toBeDefined()
    await user.click(issue.getByText(/one course barred/))
    expect(issue.getByText(/Under C1/)).toBeDefined()

    const position = accept(2).closest('li')!
    await user.click(within(position).getByText('Overrule by the Founder’s Word'))
    await user.click(within(position).getByRole('button', { name: 'Take position 2 by the Founder\'s Word' }))
    expect(within(position).getByText(/Write the Word first/)).toBeDefined()
    expect(fake.calls.some((c) => c.name === 'decide')).toBe(false)

    await user.type(within(position).getByLabelText('Your Word, as it is to be recorded'), 'The Court is wrong.')
    await user.click(within(position).getByRole('button', { name: 'Take position 2 by the Founder\'s Word' }))
    await waitFor(() => expect(store.get().nation!.state.answered[major.id]).toBe(1))
    expect(fake.calls.find((c) => c.name === 'decide')!.args[1]).toMatchObject({
      course: options[1]!.id,
      word: 'The Court is wrong.',
    })
  })

  it('leaves only the binding course open', async () => {
    const fake = holding(state)
    const docket = fake.held().government.dockets[major.id]!
    fake.rig(major.id, {
      standing: { ...docket.standing!, mustTake: options[2]!.id, vetoable: undefined, explanation: 'Binding: Option 3.' },
    })
    mount(fake)
    await heading('Issues')
    options.forEach((_, i) => {
      expect((accept(i + 1) as HTMLButtonElement).disabled, `position ${i + 1}`).toBe(i !== 2)
    })
    expect(within(card()).getByText('Must be taken')).toBeDefined()
    expect(within(card()).getAllByText(/Option 3 must be taken/).length).toBe(options.length - 1)
  })

  it('asks for written reasons before setting aside the carried course', async () => {
    const user = userEvent.setup()
    const fake = holding(state)
    const { store } = mount(fake)
    await heading('Issues')

    await user.click(accept(2))
    const position = within(card()).getByLabelText('Your reasons for setting aside Option 1').closest('li')!
    await user.click(within(position).getByRole('button', { name: 'Accept position 2 with these reasons' }))
    expect(within(position).getByText(/Write the reasons first/)).toBeDefined()
    expect(fake.calls.some((c) => c.name === 'decide')).toBe(false)

    await user.click(within(position).getByRole('button', { name: 'Not this one after all' }))
    expect(within(card()).queryByLabelText('Your reasons for setting aside Option 1')).toBeNull()
    await user.click(accept(2))
    await user.type(within(card()).getByLabelText('Your reasons for setting aside Option 1'), 'It costs too much.')
    await user.click(within(card()).getByRole('button', { name: 'Accept position 2 with these reasons' }))
    await waitFor(() => expect(store.get().government!.dockets[major.id]!.status).toBe('decided'))
    expect(fake.calls.find((c) => c.name === 'decide')!.args[1]).toMatchObject({ course: options[1]!.id, veto: 'It costs too much.' })
  })

  it('shows dismissal as a course of its own only when the rules allow it', async () => {
    const user = userEvent.setup()
    const fake = holding(state)
    const docket = fake.held().government.dockets[major.id]!
    expect(fake.held().government.dockets[major.id]).toBeDefined()
    mount(fake)
    await heading('Issues')
    expect(within(card()).queryByRole('region', { name: 'Dismissal' })).toBeNull()
    cleanup()

    const open = holding(state)
    open.rig(major.id, {
      standing: { permitted: [], barred: options.map((o) => o.id), standstill: true, explanation: 'Every course is barred.' },
    })
    const { store } = mount(open)
    await heading('Issues')
    const dismissal = within(card()).getByRole('region', { name: 'Dismissal' })
    for (let i = 1; i <= options.length; i++) expect((accept(i) as HTMLButtonElement).disabled).toBe(true)
    await user.click(within(dismissal).getByRole('button', { name: /^Accept dismissal/ }))
    await waitFor(() => expect(store.get().nation!.state.timeline.at(-1)!.headline).toMatch(/dismissed/))
    expect(docket.number).toBe(1)
  })

  it('shows the server’s refusal and changes nothing', async () => {
    const user = userEvent.setup()
    const fake = holding(state)
    const { store } = mount(fake)
    await heading('Issues')
    // The bodies change their minds after the page was drawn.
    fake.bar(major.id, options[0]!.id)
    await user.click(accept(1))
    expect((await screen.findByRole('alert')).textContent).toMatch(/That course is barred/)
    expect(store.get().nation!.state.answered[major.id]).toBeUndefined()
  })

  it('says when the bodies could not be heard, and convenes them again', async () => {
    const user = userEvent.setup()
    const fake = holding(state)
    fake.rig(major.id, { status: 'failed', standing: null, error: 'The Assembly could not be reached.' })
    mount(fake)
    await heading('Issues')
    expect(within(card()).getByText(/The Assembly could not be reached\./)).toBeDefined()
    expect((accept(1) as HTMLButtonElement).disabled).toBe(true)
    await user.click(within(card()).getByRole('button', { name: 'Convene again' }))
    expect(await within(card()).findByText('Ready for a decision')).toBeDefined()
    expect((accept(1) as HTMLButtonElement).disabled).toBe(false)
  })

  it('follows a sitting while it lasts, and stops asking once it is done', async () => {
    const fake = new FakeServer({ sittingPolls: 2 })
    fake.hold(state)
    mount(fake)
    await heading('Issues')
    expect(within(card()).getByText('The bodies are sitting')).toBeDefined()
    expect(within(card()).getByText('The Assembly is in debate.')).toBeDefined()
    expect((accept(1) as HTMLButtonElement).disabled).toBe(true)

    expect(await within(card()).findByText('Ready for a decision', {}, { timeout: 2000 })).toBeDefined()
    expect((accept(1) as HTMLButtonElement).disabled).toBe(false)
    const asked = fake.calls.filter((c) => c.name === 'dockets').length
    expect(asked).toBe(2)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(fake.calls.filter((c) => c.name === 'dockets').length).toBe(asked)
  })

  it('stops asking when the desk is left', async () => {
    const fake = new FakeServer({ sittingPolls: 1000 })
    fake.hold(state)
    mount(fake)
    await heading('Issues')
    await waitFor(() => expect(fake.calls.filter((c) => c.name === 'dockets').length).toBeGreaterThan(0))
    window.location.hash = '#/n/kept/record'
    await heading('The record')
    const asked = fake.calls.filter((c) => c.name === 'dockets').length
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(fake.calls.filter((c) => c.name === 'dockets').length).toBe(asked)
  })
})

describe('found mode', () => {
  it('shows the executive’s decision, offers only Words, and runs the day', async () => {
    const user = userEvent.setup()
    const fake = new FakeServer({ sittingPolls: 1 })
    fake.hold(state, { mode: 'found' })
    const { store } = mount(fake)
    await heading('Issues')

    expect(screen.queryByRole('button', { name: 'End the day' })).toBeNull()
    expect(within(card()).queryByRole('button', { name: /^Accept position/ })).toBeNull()
    expect(within(card()).getAllByText('Overrule by the Founder’s Word').length).toBe(options.length)

    // The bodies finish and the executive decides on its own.
    const decided = await screen.findByText('Decided by the executive', { exact: false }, { timeout: 2000 })
    const sheet = decided.closest('article')!
    expect(within(sheet).getByText('Decided')).toBeDefined()
    expect(within(sheet).getByText(/Option 1\. The executive took the course the Assembly carried\./)).toBeDefined()
    expect(store.get().nation!.state.answered[major.id]).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Run the day' }))
    expect(await heading('Overnight')).toBeDefined()
    expect(store.get().nation!.state.day).toBe(2)
    expect(fake.calls.find((c) => c.name === 'run')!.args).toEqual(['kept', 1])
    await user.click(screen.getByRole('button', { name: 'To the morning paper' }))
    await heading('Issues')
    await user.click(screen.getByRole('button', { name: 'Run a week' }))
    await heading('Overnight')
    expect(store.get().nation!.state.day).toBe(9)
  })
})
