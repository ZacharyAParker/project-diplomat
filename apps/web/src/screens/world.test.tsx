import { HOME, type GameState } from '@diplomat/engine'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assemblyView, matterViews, nationRows, warViews } from '../logic/world.ts'
import { content, founded } from '../test/fixtures.ts'
import { heading, holding, mount } from '../test/mount.tsx'

beforeEach(() => {
  window.location.hash = ''
})

afterEach(() => {
  cleanup()
})

// A founded nation with a claim on its desk from Eskerland.
function claimed(): GameState {
  const s = founded()
  const w = structuredClone(s.world!)
  w.claims.push({ id: 'claim-t', by: 'eskerland', against: HOME, region: 'the Weir Valley', since: s.day })
  w.matters.push({ id: 'matter-t', kind: 'claim', day: s.day, expires: s.day + 7, subject: 'eskerland', region: 'the Weir Valley', claim: 'claim-t', vars: { note: 'Historic justice demands it.' } })
  return { ...s, world: w }
}

describe('the world, as the page reads it', () => {
  it('has twenty nations, five of them on the border', () => {
    const rows = nationRows(founded(), content)
    expect(rows).toHaveLength(20)
    expect(rows.filter((r) => r.near).map((r) => r.id)).toEqual(['eskerland', 'morvaine', 'caravel', 'velsa', 'ardune'])
    // War only with a neighbour on the border, or one in a dispute with you.
    expect(rows.find((r) => r.id === 'lunes')!.war.allowed).toBe(false)
    expect(rows.find((r) => r.id === 'eskerland')!.war.allowed).toBe(true)
  })

  it('shows a matter with the Foreign Ministry’s advice and how long it has', () => {
    const [m] = matterViews(claimed(), content)
    expect(m!.title).toBe('Eskerland claims the Weir Valley')
    expect(m!.note).toBe('Historic justice demands it.')
    expect(m!.daysLeft).toBe(7)
    expect(m!.advice).toBeDefined()
    expect(m!.options.map((o) => o.id)).toEqual(['negotiate', 'refer', 'firm', 'cede'])
  })

  it('knows the player is in the Assembly and at peace', () => {
    expect(assemblyView(founded(), content)!.member).toBe(true)
    expect(warViews(founded(), content).ours).toEqual([])
  })
})

describe('the World page', () => {
  it('decides a foreign matter, and it goes into the record', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/world'
    const { store } = mount(holding(claimed()))
    await heading('The world')
    const card = screen.getByRole('heading', { level: 3, name: 'Eskerland claims the Weir Valley' }).closest('article, section')!
    expect(within(card as HTMLElement).getByText('Historic justice demands it.')).toBeDefined()
    await user.click(within(card as HTMLElement).getByRole('button', { name: 'Put it to the Assembly of Nations' }))
    const state = store.get().nation!.state
    expect(state.world!.matters.find((x) => x.id === 'matter-t')!.decided?.option).toBe('refer')
    expect(state.world!.claims.find((c) => c.id === 'claim-t')!.referred).toBe(true)
    expect(state.timeline.at(-1)!.kind).toBe('world')
    expect(screen.getByText('No foreign government is waiting on an answer.')).toBeDefined()
  })

  it('offers a pact to a friend, and mobilises', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/world'
    const s = founded()
    const { store } = mount(holding({ ...s, neighbours: { ...s.neighbours, velsa: 80 } }))
    await heading('The world')
    const row = document.getElementById('nation-velsa')!
    await user.click(row.querySelector('summary')!)
    await user.click(within(row).getByRole('button', { name: 'Offer a pact' }))
    expect(store.get().nation!.state.world!.pacts.some((p) => p.members.includes(HOME) && p.members.includes('velsa'))).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Mobilise' }))
    expect(store.get().nation!.state.world!.home.mobilised).toBe(true)
    expect(screen.getByRole('button', { name: 'Stand the army down' })).toBeDefined()
  })

  it('draws the map, and picking a nation on it opens its row', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/world'
    mount(holding(founded()))
    await heading('The world')
    const map = screen.getByRole('group', { name: /A map of the world/ })
    const nations = within(map).getAllByRole('button')
    expect(nations).toHaveLength(21)
    await user.click(within(map).getByRole('button', { name: /^Velsa: / }))
    const row = document.getElementById('nation-velsa')!
    expect(row.querySelector('details')!.open).toBe(true)
  })

  it('puts a motion down with its wording, and stands for the Security Council', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/n/kept/world'
    const { store } = mount(holding(founded()))
    await heading('The world')
    const form = screen.getByRole('group', { name: 'Put down a motion' })
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Kind' }), 'condemnation')
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Nation' }), 'gorsk')
    await user.type(within(form).getByRole('textbox', { name: /The wording/ }), 'Gorsk has disgraced the continent.')
    await user.click(within(form).getByRole('button', { name: 'Put it down' }))
    const queued = store.get().nation!.state.world!.assembly.queue
    expect(queued.at(-1)).toMatchObject({ kind: 'condemnation', target: 'gorsk', by: 'home', text: 'Gorsk has disgraced the continent.' })
    expect(screen.getByText('Your motion')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Stand for a seat' }))
    expect(store.get().nation!.state.world!.council.candidates).toContain('home')
  })

  it('is pointed to from the desk when a matter is waiting', async () => {
    window.location.hash = '#/n/kept/desk'
    mount(holding(claimed(), { noDockets: true }))
    await heading('Issues')
    expect(screen.getByText('A foreign matter is waiting')).toBeDefined()
    expect(screen.getByRole('link', { name: 'To the World page' })).toBeDefined()
  })
})
