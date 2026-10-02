import { INDICATOR_INFO, INDICATORS, type GameState } from '@diplomat/engine'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recordDays } from '../logic/record.ts'
import { content, founded, played } from '../test/fixtures.ts'
import { heading, holding, mount } from '../test/mount.tsx'

beforeEach(() => {
  window.location.hash = ''
})

afterEach(() => {
  cleanup()
})

describe('the nation', () => {
  it('has every empty state written for a nation with no history', async () => {
    const state = founded()
    window.location.hash = '#/n/kept/nation'
    mount(holding(state))
    await heading('The nation')

    for (const id of INDICATORS) {
      expect(screen.getByRole('meter', { name: INDICATOR_INFO[id].name })).toBeDefined()
    }
    for (const faction of content.factions) {
      expect(screen.getByRole('meter', { name: faction.name })).toBeDefined()
    }
    expect(screen.getAllByText('No change since yesterday').length).toBeGreaterThanOrEqual(INDICATORS.length)
    expect(screen.getAllByText('No trend yet').length).toBeGreaterThanOrEqual(INDICATORS.length)
    expect(screen.getByText(/^Nothing yet\. It takes a while/)).toBeDefined()
    expect(screen.getByText('No promises are outstanding.')).toBeDefined()
    expect(screen.getByRole('img', { name: /^The flag of Vesland/ })).toBeDefined()
    expect(screen.getByText(/^The first government/)).toBeDefined()
    expect(screen.getByRole('link', { name: 'Nation' }).getAttribute('aria-current')).toBe('page')
  })

  it('explains an indicator when it is opened, and says when lower is better', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/nation'
    mount(holding(founded()))
    await heading('The nation')
    const debt = screen.getByRole('meter', { name: 'Debt' }).closest('details')!
    await user.click(debt.querySelector('summary')!)
    expect(debt.open).toBe(true)
    expect(within(debt).getByText(/What the country owes\..*Lower is better here/)).toBeDefined()
  })

  it('shows traits, promises and a crisis, and keeps what is pending to itself', async () => {
    const start = played(20)
    const trait = content.traits[0]!
    const situation = content.situations[0]!
    const state: GameState = {
      ...start,
      traits: [trait.id],
      promises: [{ id: 'p', text: 'A bridge', dueDay: start.day + 5, kept: { flag: 'x' }, broken: [] }],
      pending: [{ dueDay: start.day + 3, headline: 'A secret headline', effects: [], source: 'x' }],
      situation: { id: situation.id, stage: 0, gauge: 40 },
    }
    window.location.hash = '#/n/kept/nation'
    mount(holding(state))
    await heading('The nation')

    expect(screen.getByRole('heading', { level: 3, name: trait.name })).toBeDefined()
    expect(screen.getByText(/^Costs legitimacy: /)).toBeDefined()
    expect(screen.getByText('A bridge')).toBeDefined()
    expect(screen.getByText('Judged in 5 days')).toBeDefined()
    expect(screen.getByRole('meter', { name: situation.gauge })).toBeDefined()
    expect(screen.getByText(/^Some decisions have not finished with the country yet/)).toBeDefined()
    expect(document.body.textContent).not.toContain('A secret headline')
    expect(screen.getAllByRole('meter').length).toBeGreaterThanOrEqual(
      INDICATORS.length + content.factions.length + content.portfolios.length + 2,
    )
  })
})

describe('the record', () => {
  it('lists a new nation as one day with the founding in it', async () => {
    const user = userEvent.setup()
    const state = founded()
    window.location.hash = '#/n/kept/record'
    mount(holding(state))
    await heading('The record')
    expect(screen.getByText('One entry over one day')).toBeDefined()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1)

    const founding = state.timeline[0]!
    const toggle = screen.getByRole('button', { name: new RegExp(founding.headline) })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(founding.changes[0]!.why)).toBeNull()
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByText(founding.changes[0]!.why).length).toBeGreaterThan(0)
    await user.click(toggle)
    expect(screen.queryByText(founding.changes[0]!.why)).toBeNull()

    await user.click(screen.getByRole('radio', { name: 'Promises' }))
    expect(screen.getByText(/^Nothing of that kind has happened yet/)).toBeDefined()
  })

  it('shows a long game a page of days at a time, newest first, and filters by kind', async () => {
    const user = userEvent.setup()
    const state = played(60)
    const days = recordDays(state.timeline)
    window.location.hash = '#/n/kept/record'
    mount(holding(state))
    await heading('The record')

    const dates = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(dates()).toEqual(days.slice(0, 20).map((d) => `Day ${d.day}`))
    await user.click(screen.getByRole('button', { name: /^Show earlier days/ }))
    expect(dates()).toHaveLength(Math.min(40, days.length))

    await user.click(screen.getByRole('radio', { name: 'Treasury' }))
    const budget = recordDays(state.timeline, 'treasury')
    expect(dates()).toEqual(budget.slice(0, 20).map((d) => `Day ${d.day}`))
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(
      budget.slice(0, 20).reduce((sum, d) => sum + d.entries.length, 0),
    )
  })

  it('opens an election into its term report', async () => {
    const user = userEvent.setup()
    const state = played(46)
    window.location.hash = '#/n/kept/record'
    mount(holding(state))
    await heading('The record')
    await user.click(screen.getByRole('radio', { name: 'Power' }))
    const election = state.timeline.find((e) => e.kind === 'election')!
    await user.click(screen.getByRole('button', { name: new RegExp(election.headline) }))
    expect(screen.getByRole('table')).toBeDefined()
    expect(screen.getByRole('meter', { name: 'Support on polling day' })).toBeDefined()
  })
})
