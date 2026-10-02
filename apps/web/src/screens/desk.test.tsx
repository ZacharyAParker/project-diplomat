import { ELECTION_HEADLINES, TERM_DAYS, agendaItems, endDay, type GameState } from '@diplomat/engine'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agendaCards } from '../logic/desk.ts'
import { paperName } from '../logic/frontpage.ts'
import { openNation } from '../logic/saves.ts'
import { content, founded, identity, played } from '../test/fixtures.ts'
import { heading, holding, mount } from '../test/mount.tsx'

beforeEach(() => {
  window.location.hash = ''
})

afterEach(() => {
  cleanup()
})

const paper = () => screen.getByRole('article', { name: /./ })
const box = () => screen.getByRole('region', { name: 'The agenda' })

async function endTheDay(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'End the day' }))
  const anyway = screen.queryByRole('button', { name: 'End the day anyway' })
  if (anyway) await user.click(anyway)
}

describe('a day at the desk, from the founding', () => {
  it('founds a nation, decides the dilemma, ends the day and reads about it in the morning', async () => {
    const user = userEvent.setup()
    const { kv, store } = mount()

    await user.click(await screen.findByRole('link', { name: 'Found a nation' }))
    await heading('Name the nation')
    await user.click(screen.getByRole('button', { name: 'Suggest everything' }))
    await user.click(screen.getByRole('button', { name: 'Next: the flag' }))
    await heading('Give it a flag')
    await user.click(screen.getByRole('link', { name: 'Next: its character' }))
    await heading('Its character')
    for (const [i] of content.founding.questions.entries()) {
      await user.click(screen.getAllByRole('radio')[0]!)
      const last = i === content.founding.questions.length - 1
      await user.click(screen.getByRole('button', { name: last ? /^Found / : 'Next question' }))
    }
    await heading('The first morning')
    await user.click(screen.getByRole('link', { name: 'To work' }))
    await heading('The desk')

    const first = store.get().nation!
    const name = first.state.identity.name
    expect(within(paper()).getByRole('heading', { level: 2 }).textContent).toBe(
      paperName(first.state.identity, first.state.seed),
    )
    expect(within(paper()).getByRole('heading', { level: 3, name: `${name} is founded` })).toBeDefined()
    expect(paper().textContent).not.toMatch(/[+-]\d/)

    const cards = agendaCards(agendaItems(first.state, content), first.state, content)
    const card = cards[0]!
    expect(within(box()).getByRole('heading', { level: 3, name: card.title })).toBeDefined()
    expect(within(box()).getByText(`0 of ${cards.length} decided.`)).toBeDefined()

    const sheet = within(box()).getByRole('heading', { level: 3, name: card.title }).closest('article')!
    expect(within(sheet).getAllByRole('radio')).toHaveLength(card.options.length)
    expect(within(sheet).getAllByText('What it will do')).toHaveLength(card.options.length)
    expect(sheet.textContent).not.toMatch(/[+-]\d/)

    await user.click(within(sheet).getByRole('button', { name: 'Confirm' }))
    expect(within(sheet).getByRole('alert').textContent).toMatch(/Nobody is picked yet/)
    expect(store.get().nation!.state.timeline).toHaveLength(first.state.timeline.length)

    const option = card.options[0]!
    await user.click(within(sheet).getAllByRole('radio')[0]!)
    expect(store.get().nation!.state.timeline).toHaveLength(first.state.timeline.length)
    await user.click(within(sheet).getByRole('button', { name: `Confirm: back ${option.name}` }))

    const decided = store.get().nation!.state
    const entry = decided.timeline.at(-1)!
    expect(entry.kind).toBe('decision')
    expect(decided.answered[card.key]).toBe(1)
    const result = within(box()).getByRole('heading', { level: 3, name: entry.headline })
    expect(document.activeElement).toBe(result)
    const resultSheet = result.closest('article')!
    expect(within(resultSheet).getByText(`Decided: ${card.title}`)).toBeDefined()
    if (entry.text) expect(within(resultSheet).getByText(entry.text)).toBeDefined()
    for (const change of entry.changes) {
      expect(within(resultSheet).getAllByText(change.why).length).toBeGreaterThan(0)
    }
    expect(within(resultSheet).queryByRole('radio')).toBeNull()
    expect(within(box()).getByText(`1 of ${cards.length} decided.`)).toBeDefined()

    await endTheDay(user)
    expect(document.activeElement).toBe(await heading('Overnight'))
    expect(screen.getByText('The night after day 1')).toBeDefined()
    const night = store.get().nation!
    expect(night.state.day).toBe(2)
    expect(night.history.map((s) => s.day)).toEqual([0, 1])
    const stored = openNation(kv, night.id, content)
    expect(stored.ok && stored.nation).toEqual(night)

    await user.click(screen.getByRole('button', { name: 'To the morning paper' }))
    expect(document.activeElement).toBe(await heading('The desk'))
    expect(screen.getByText('Day 2')).toBeDefined()
    expect(within(paper()).getByText(/^Morning edition, day 2\./)).toBeDefined()
    expect(within(paper()).getByRole('heading', { name: entry.headline })).toBeDefined()
    expect(within(paper()).queryByRole('heading', { name: `${name} is founded` })).toBeNull()
    expect(paper().textContent).not.toMatch(/[+-]\d/)
  })
})

describe('leaving things on the desk', () => {
  it('asks before ending a day with papers open, and lets the player back out', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/desk'
    const { store } = mount(holding(founded()))
    await heading('The desk')

    await user.click(screen.getByRole('button', { name: 'End the day' }))
    expect(screen.getByRole('heading', { name: 'End the day with papers on the desk?' })).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Back to the desk' }))
    expect(store.get().nation!.state.day).toBe(1)

    await user.click(screen.getByRole('button', { name: 'End the day' }))
    await user.click(screen.getByRole('button', { name: 'End the day anyway' }))
    await heading('Overnight')
    expect(store.get().nation!.state.day).toBe(2)
    expect(store.get().nation!.state.timeline.some((e) => e.kind === 'decision')).toBe(false)
  })

  it('does not ask again about papers already set aside, and lets them be picked back up', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/desk'
    const { store } = mount(holding(founded()))
    await heading('The desk')

    const leave = screen.getAllByRole('button', { name: /^Leave it on the desk: / })
    for (const button of leave) await user.click(button)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.getAllByText('Left on the desk')).toHaveLength(leave.length)

    await user.click(screen.getAllByRole('button', { name: /^Pick it back up: / })[0]!)
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(1)
    await user.click(screen.getAllByRole('button', { name: /^Leave it on the desk: / })[0]!)

    await user.click(screen.getByRole('button', { name: 'End the day' }))
    await heading('Overnight')
    expect(store.get().nation!.state.day).toBe(2)
  })
})

describe('a day with nothing in the box', () => {
  const spent = (): GameState => {
    const all = Object.fromEntries(content.dilemmas.map((d) => [d.id, 1]))
    return endDay({ ...founded(), answered: all }, content)
  }

  it('says once that the pack has run out, prints a quiet paper, and can still be ended', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/desk'
    const { store } = mount(holding(spent()))
    await heading('The desk')

    expect(screen.getByText('The pack has run out')).toBeDefined()
    expect(screen.getByText(/can still be run through quiet days/)).toBeDefined()
    expect(screen.getByText(/More dilemmas arrive with later versions/)).toBeDefined()
    expect(screen.getByText('Nothing needs deciding.')).toBeDefined()
    expect(screen.getByText(/^The box is empty/)).toBeDefined()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'End the day' }))
    await heading('Overnight')
    await user.click(screen.getByRole('button', { name: 'To the morning paper' }))
    await heading('The desk')
    expect(store.get().nation!.state.day).toBe(3)
    expect(screen.queryByText('The pack has run out')).toBeNull()
    expect(screen.queryByText('No major business today.')).toBeNull()
    expect(screen.getByText(/^The box is empty/)).toBeDefined()
    expect(within(paper()).getByText('Home news')).toBeDefined()
  })
})

describe('election night', () => {
  it('gets its own screen with the result and the term report, and the report stays within reach', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/desk'
    const { store } = mount(holding(played(TERM_DAYS - 1)))
    await heading('The desk')
    expect(screen.getByText('Election tonight')).toBeDefined()
    expect(screen.getByText(/The country votes tonight\.$/)).toBeDefined()

    await endTheDay(user)
    expect(document.activeElement).toBe(await heading('Election night'))
    const election = store.get().nation!.state.timeline.find((e) => e.kind === 'election')!
    expect(Object.values(ELECTION_HEADLINES)).toContain(election.headline)
    expect(screen.getByRole('heading', { level: 2, name: election.headline })).toBeDefined()
    expect(screen.getByRole('meter', { name: /^Support/ })).toBeDefined()
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(13)
    expect(within(table).getByRole('rowheader', { name: 'Debt' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'The decisions that counted' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Kept and broken' })).toBeDefined()

    const on = screen.getByRole('button', { name: /^(The rest of the night|To the morning paper)$/ })
    await user.click(on)
    if (on.textContent === 'The rest of the night') {
      await heading('Overnight')
      expect(screen.queryByRole('heading', { name: election.headline })).toBeNull()
      await user.click(screen.getByRole('button', { name: 'To the morning paper' }))
    }

    await heading('The desk')
    expect(within(paper()).getByRole('heading', { level: 3, name: election.headline })).toBeDefined()
    await user.click(within(paper()).getByRole('button', { name: 'Read the term report' }))
    await heading('Election night')
    expect(screen.getByRole('table')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Back to the desk' }))
    await heading('The desk')
  })
})

describe('the fall of a government', () => {
  it('is shown on its own, and the morning after leads with it', async () => {
    const user = userEvent.setup()
    const start = played(3)
    const doomed: GameState = { ...start, indicators: { ...start.indicators, legitimacy: 0 } }
    window.location.hash = '#/n/kept/desk'
    const { store } = mount(holding(doomed))
    await heading('The desk')

    await endTheDay(user)
    await heading('The government falls')
    expect(store.get().nation!.state.government).toBe(2)
    expect(screen.getByText('Brought down')).toBeDefined()
    expect(screen.getByText(/The cabinet has been replaced/)).toBeDefined()
    expect(screen.getByRole('meter', { name: 'Support as the new government starts' })).toBeDefined()

    const on = screen.getByRole('button', { name: /^(The rest of the night|To the morning paper)$/ })
    await user.click(on)
    if (on.textContent === 'The rest of the night') {
      await user.click(screen.getByRole('button', { name: 'To the morning paper' }))
    }
    await heading('The desk')
    expect(within(paper()).getByRole('heading', { level: 3, name: 'The government falls' })).toBeDefined()
    expect(within(paper()).getByRole('button', { name: 'Read the term report' })).toBeDefined()
  })
})

describe('awkward nations', () => {
  it('prints a very long name as text, wherever it appears', async () => {
    const long = { ...identity, name: 'The <i>Most</i> Serene and Indivisible Commonwealth of Upper Vesland' }
    window.location.hash = '#/n/kept/desk'
    mount(holding({ ...founded(), identity: long }))
    await heading('The desk')
    expect(screen.getByRole('link', { name: long.name })).toBeDefined()
    expect(document.querySelector('i')).toBeNull()
  })

  it('opens a nation from an older version of the pack with a notice, and plays on', async () => {
    const user = userEvent.setup()
    const old: GameState = { ...founded(), pack: { id: content.pack.id, version: '0.0.1' } }
    window.location.hash = '#/n/kept/desk'
    mount(holding(old))
    await heading('The desk')
    expect(screen.getByText(/last played with version 0\.0\.1/)).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Understood' }))
    expect(screen.queryByText(/last played with version 0\.0\.1/)).toBeNull()
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(1)
  })
})
