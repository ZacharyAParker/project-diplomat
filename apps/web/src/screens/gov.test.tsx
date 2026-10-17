import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeServer, JUSTICES, PARTIES, holding } from '../test/fakeServer.ts'
import { founded, played } from '../test/fixtures.ts'
import { heading, mount } from '../test/mount.tsx'

beforeEach(() => {
  window.location.hash = ''
})

afterEach(() => {
  cleanup()
})

const at = (path: string) => {
  window.location.hash = `#/n/kept/gov${path}`
}

describe("the Founder's page", () => {
  it('answers a question, sets one aside, and leaves one unanswered', async () => {
    const user = userEvent.setup()
    at('/founder')
    const { fake, store } = mount(holding(founded()))
    await heading('The Founder’s page')
    const questions = screen.getByRole('region', { name: 'Questions for you' })
    expect(within(questions).getByText('Will the Founder say what the country is for?')).toBeDefined()

    const first = within(questions).getByLabelText('Your answer to Q-0001').closest('li')!
    await user.click(within(first).getByRole('button', { name: 'Answer' }))
    expect(within(first).getByText(/Write an answer first/)).toBeDefined()
    expect(fake.calls.some((c) => c.name === 'question')).toBe(false)
    await user.type(within(first).getByLabelText('Your answer to Q-0001'), 'For <i>its</i> people.')
    await user.click(within(first).getByRole('button', { name: 'Answer' }))
    await waitFor(() => expect(store.get().government!.questions[0]!.status).toBe('answered'))
    expect(store.get().government!.questions[0]!.answer).toBe('For <i>its</i> people.')
    expect(within(questions).queryByLabelText('Your answer to Q-0001')).toBeNull()

    const second = within(questions).getByLabelText('Your answer to Q-0002').closest('li')!
    await user.click(within(second).getByRole('button', { name: 'Ask me later' }))
    expect(await within(questions).findByText('Set aside for later')).toBeDefined()
    expect(fake.calls.filter((c) => c.name === 'question').at(-1)!.args[2]).toEqual({ later: true })
    await user.click(within(within(questions).getByLabelText('Your answer to Q-0002').closest('li')!).getByRole('button', { name: 'No answer' }))
    await waitFor(() => expect(store.get().government!.questions[1]!.status).toBe('no-answer'))

    expect(within(questions).getByText('No question is waiting for your answer.')).toBeDefined()
    await user.click(within(questions).getByText('Answered (2)'))
    expect(within(questions).getByText('Your answer: For <i>its</i> people.')).toBeDefined()
    expect(document.querySelector('.md i, .founder-qs i')).toBeNull()
  })

  it('adopts a draft reply, marks a letter read, and writes one of its own', async () => {
    const user = userEvent.setup()
    at('/founder')
    const { store } = mount(holding(founded()))
    await heading('The Founder’s page')
    const letters = screen.getByRole('region', { name: 'Letters to you' })
    expect(within(letters).getByText(/The office’s draft reply/)).toBeDefined()
    expect(within(letters).getByText('Urgent')).toBeDefined()

    await user.click(within(letters).getByRole('button', { name: 'Adopt the draft reply to L-0001' }))
    await waitFor(() => expect(store.get().government!.letters[0]!.status).toBe('replied'))
    expect(within(letters).getByText('Replied by you')).toBeDefined()

    await user.click(within(letters).getByRole('button', { name: 'Mark L-0002 read' }))
    await waitFor(() => expect(store.get().government!.letters[1]!.status).toBe('read'))
    const second = within(letters).getByRole('heading', { name: /A fisherman/ }).closest('li')!
    await user.click(within(second).getByText('Write a reply'))
    await user.type(within(second).getByLabelText('Your reply to L-0002'), 'Try the other bay.')
    await user.click(within(second).getByRole('button', { name: 'Send this reply' }))
    await waitFor(() => expect(store.get().government!.letters[1]!).toMatchObject({ status: 'replied', reply: 'Try the other bay.' }))
  })

  it('gives a Word with Silence and what it overrules, then confirms it', async () => {
    const user = userEvent.setup()
    at('/founder')
    const { fake, store } = mount(holding(founded()))
    await heading('The Founder’s page')
    const form = screen.getByRole('region', { name: 'Give a Word' })
    await user.click(within(form).getByRole('button', { name: 'Give the Word' }))
    expect(within(form).getByText('A Word needs words.')).toBeDefined()

    await user.type(within(form).getByLabelText('The Word, exactly as it is to be entered'), 'Let the ferries run.')
    const petition = Object.values(fake.held().government.dockets)[0]!
    await user.selectOptions(within(form).getByLabelText('It overrules'), petition.dilemma)
    await user.click(within(form).getByRole('checkbox', { name: /^Silence/ }))
    await user.click(within(form).getByRole('button', { name: 'Give the Word' }))
    await waitFor(() => expect(store.get().government!.words).toHaveLength(1))
    expect(store.get().government!.words[0]).toMatchObject({
      text: 'Let the ferries run.',
      overrules: petition.dilemma,
      silence: true,
      confirmed: false,
    })

    const words = screen.getByRole('region', { name: 'Words already given' })
    expect(within(words).getByText('Not yet confirmed')).toBeDefined()
    expect(within(words).getByText('Silence')).toBeDefined()
    await user.click(within(words).getByRole('button', { name: 'Confirm Word No. 1' }))
    expect(await within(words).findByText('Confirmed')).toBeDefined()
    expect(store.get().government!.words[0]!.confirmed).toBe(true)
  })
})

describe('the government website', () => {
  it('opens at Today with the order of business and what is before the Founder', async () => {
    at('')
    const fake = holding(played(2))
    await fake.endDay('kept')
    mount(fake)
    await heading('Today')
    expect(screen.getByRole('navigation', { name: 'The government website' })).toBeDefined()
    expect(screen.getByText(/An official website of The Commonwealth of Vesland/)).toBeDefined()
    const business = screen.getByRole('region', { name: 'The order of business' })
    expect(within(business).getAllByText('Ready for a decision').length).toBeGreaterThan(0)
    const founder = screen.getByRole('region', { name: 'Before the Founder' })
    expect(within(founder).getByText('2 questions to answer')).toBeDefined()
    expect(within(founder).getByText('2 letters unread')).toBeDefined()
    const country = screen.getByRole('region', { name: 'The country' })
    expect(await within(country).findByText('The country is watchful.')).toBeDefined()
    expect(within(country).getByText('A quiet day')).toBeDefined()
    const newest = screen.getByRole('region', { name: 'Newest in the library' })
    expect((await within(newest).findAllByRole('link')).length).toBeGreaterThan(0)
    for (const link of screen.getAllByRole('link', { name: 'Today' })) expect(link.getAttribute('aria-current')).toBe('page')
  })

  it('searches the library by words and series, and pages through it', async () => {
    const user = userEvent.setup()
    at('/library')
    const fake = holding(founded())
    for (let i = 0; i < 12; i++) await fake.endDay('kept')
    mount(fake)
    await heading('The library')
    expect(await screen.findByText(/documents, page 1 of /)).toBeDefined()
    expect(screen.getAllByRole('link', { name: /./ }).length).toBeGreaterThan(25)

    await user.click(screen.getByRole('link', { name: 'Older' }))
    expect(await screen.findByText(/page 2 of /)).toBeDefined()
    expect(window.location.hash).toBe('#/n/kept/gov/library?page=2')

    await user.selectOptions(screen.getByLabelText('Series'), 'hansard')
    await user.type(screen.getByLabelText('Words'), 'sitting')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(window.location.hash).toBe('#/n/kept/gov/library?q=sitting&series=hansard'))
    await waitFor(() => expect(fake.calls.at(-1)!.args[1]).toMatchObject({ q: 'sitting', series: 'hansard', offset: 0 }))
    const results = await screen.findAllByText(/^Hansard, The Assembly/)
    expect(results.length).toBeGreaterThan(0)
  })

  it('shows a document with its head, its text as text, what it cites and what cites it', async () => {
    const user = userEvent.setup()
    const fake = holding(founded())
    const petition = Object.values(fake.held().government.dockets)[0]!.document
    at(`/doc/${petition}`)
    mount(fake)
    expect(await heading(/^Petition #1, /)).toBeDefined()
    expect(screen.getByRole('rowheader', { name: 'Issued by' })).toBeDefined()
    expect(screen.getByText('The Clerk')).toBeDefined()
    expect(screen.getByRole('heading', { level: 3, name: 'The issue' })).toBeDefined()
    const cited = screen.getByRole('region', { name: 'Cited by' })
    const hansard = within(cited).getByRole('link', { name: /first sitting/ })
    await user.click(hansard)
    expect(await heading(/first sitting$/)).toBeDefined()
    expect(screen.getByText('Ada Rook:')).toBeDefined()
    expect(screen.getByRole('link', { name: petition })).toBeDefined()
  })

  it('says so when a document is not in the Archive', async () => {
    at('/doc/hansard-09999')
    mount(holding(founded()))
    expect((await screen.findByRole('alert')).textContent).toMatch(/no document hansard-09999/)
  })

  it('draws the legislature: a seat chart, its parties by name, members and divisions', async () => {
    at('/body/assembly')
    mount(holding(founded()))
    await heading('The Assembly')
    const chart = screen.getByRole('img', { name: /^Seat chart of The Assembly: The Red Party 70; The Blue League 50; The Green Union 31/ })
    expect(chart.querySelectorAll('circle')).toHaveLength(151)
    const seats = screen.getByRole('table', { name: 'The parties and their seats' })
    for (const party of PARTIES) {
      expect(within(seats).getByRole('row', { name: new RegExp(`^${party.name} ${party.seats}`) })).toBeDefined()
      expect(screen.getByRole('heading', { level: 3, name: party.name })).toBeDefined()
    }
    expect(screen.getByText(/76 carry a question, 101 bind the steward/i, { selector: 'p' })).toBeDefined()
    expect(screen.getByRole('rowheader', { name: 'Tarry Aldermoss' })).toBeDefined()
    expect(screen.getByRole('table', { name: /^Division on Petition #1/ })).toBeDefined()
  })

  it('shows the court’s members and how they split, petition by petition', async () => {
    const fake = holding(founded())
    const dilemma = Object.keys(fake.held().government.dockets)[0]!
    const course = fake.held().government.dockets[dilemma]!.reviews[0]!.rulings[0]!.course
    fake.bar(dilemma, course)
    at('/body/court')
    mount(fake)
    await heading('The High Court')
    for (const justice of JUSTICES) expect(screen.getByRole('heading', { level: 3, name: justice.name })).toBeDefined()
    expect(screen.getAllByText('textualist').length).toBe(3)
    expect(screen.getByRole('cell', { name: 'Barred, 5 to 2' })).toBeDefined()
    const row = screen.getByRole('row', { name: /^Option 1 Barred/ })
    expect(within(row).getAllByText('Bar')).toHaveLength(5)
    expect(within(row).getAllByText('Permit')).toHaveLength(2)
  })

  it('has In force, the Executive and the Country', async () => {
    at('/in-force')
    const fake = holding(played(2))
    await fake.endDay('kept')
    mount(fake)
    await heading('In force')
    expect(screen.getByText('Keep the register open to inspection.')).toBeDefined()
    expect(screen.getByRole('rowheader', { name: /Ferries \(Timetables\) Bill/ })).toBeDefined()
    expect(screen.getByText('In committee')).toBeDefined()
    expect(await screen.findByRole('link', { name: 'The Constitution' })).toBeDefined()

    window.location.hash = '#/n/kept/gov/executive'
    await heading('The Steward')
    expect(screen.getByText(/You hold it\./)).toBeDefined()
    expect(screen.getAllByRole('rowheader', { name: /Ministry/ }).length).toBeGreaterThan(0)

    window.location.hash = '#/n/kept/gov/country'
    await heading('The country')
    expect(screen.getByRole('heading', { name: 'The census' })).toBeDefined()
    expect(screen.getByText('5,000,000 people')).toBeDefined()
    expect(await screen.findByRole('heading', { level: 3, name: 'The Chronicle' })).toBeDefined()
    expect(screen.getAllByText('The ferry is still late.').length).toBeGreaterThan(0)
  })

  it('takes the nation’s flag colours as its accents, and treats a body that is not there plainly', async () => {
    at('/body/senate')
    mount(holding(founded()))
    await heading('No such body')
    const site = document.querySelector<HTMLElement>('.gov')!
    expect(site.style.getPropertyValue('--flag-a')).toBe('#1d4e89')
    expect(site.style.getPropertyValue('--flag-b')).toBe('#f2efe6')
  })
})

describe('the nation page', () => {
  it('shows the census and the form of government, and switches the mode', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/nation'
    const { store } = mount(holding(founded()))
    await heading('Vesland')
    const census = screen.getByRole('heading', { name: 'The census' }).closest('section')!
    expect(within(census).getByText('Population')).toBeDefined()
    expect(within(census).getAllByText(/Superb|Good|Fair|Poor|Dire/).length).toBeGreaterThan(0)

    const government = screen.getByRole('heading', { name: 'Its government' }).closest('section')!
    expect(within(government).getByText('Commonwealth')).toBeDefined()
    expect((within(government).getByRole('radio', { name: /^Govern/ }) as HTMLInputElement).checked).toBe(true)
    await user.click(within(government).getByRole('radio', { name: /^Found/ }))
    await waitFor(() => expect(store.get().government!.mode).toBe('found'))
  })

  it('writes a factbook entry with a preview, drafts one with the AI, and edits it', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/nation'
    const fake = new FakeServer()
    fake.hold(founded())
    const { store } = mount(fake)
    await heading('Vesland')
    const sheet = screen.getByRole('heading', { name: 'Factbooks' }).closest('section')!
    expect(within(sheet).getByText(/has not yet written anything/)).toBeDefined()

    await user.click(within(sheet).getByRole('button', { name: 'Write an entry' }))
    await user.click(within(sheet).getByRole('button', { name: 'Save the entry' }))
    expect(within(sheet).getByText('An entry needs a title.')).toBeDefined()
    await user.type(within(sheet).getByLabelText('Title'), 'Overview')
    await user.type(within(sheet).getByLabelText('The entry, in Markdown'), '## Rain{enter}{enter}It **rains**. <script>x</script>')
    await user.click(within(sheet).getByRole('radio', { name: 'Preview' }))
    expect(within(sheet).getByRole('heading', { name: 'Rain' })).toBeDefined()
    expect(within(sheet).getByText('rains').tagName).toBe('STRONG')
    expect(sheet.querySelector('script')).toBeNull()
    await user.click(within(sheet).getByRole('radio', { name: 'Write' }))
    await user.click(within(sheet).getByRole('button', { name: 'Save the entry' }))
    await waitFor(() => expect(store.get().government!.factbooks).toHaveLength(1))

    await user.click(within(sheet).getByRole('button', { name: 'Edit Overview' }))
    await user.click(within(sheet).getByRole('button', { name: 'Draft with AI' }))
    await waitFor(() =>
      expect((within(sheet).getByLabelText('The entry, in Markdown') as HTMLTextAreaElement).value).toMatch(/with a meeting/),
    )
    await user.click(within(sheet).getByRole('button', { name: 'Save the entry' }))
    await waitFor(() => expect(store.get().government!.factbooks[0]!.body).toMatch(/with a meeting/))
    await user.click(within(sheet).getByRole('button', { name: 'Read it' }))
    expect(within(sheet).getByText(/It began, as these things do/)).toBeDefined()
  })
})
