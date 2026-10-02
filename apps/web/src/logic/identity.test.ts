import { describe, expect, it } from 'vitest'
import { DEFAULT_FLAG } from './flags.ts'
import {
  EMPTY_TEXT,
  FIELDS,
  buildIdentity,
  checkField,
  checkIdentity,
  identityIsValid,
  textOf,
  tidy,
} from './identity.ts'
import {
  CAPITALS,
  CURRENCIES,
  LEADER_TITLES,
  NATIONS,
  demonymFor,
  suggestAll,
  suggestField,
} from './suggest.ts'
import { seeded } from './rng.ts'

const good = {
  name: 'Vesland',
  capital: 'Highmarch',
  currency: 'florin',
  demonym: 'Veslander',
  leaderTitle: 'Premier',
}

describe('checking an identity', () => {
  it('rejects blank, too short and too long, and says which', () => {
    expect(checkField('name', '   ')).toMatch(/blank/)
    expect(checkField('name', 'V')).toMatch(/At least 2/)
    expect(checkField('name', 'x'.repeat(41))).toMatch(/No more than 40/)
    expect(checkField('name', 'x'.repeat(40))).toBeNull()
  })

  it('counts an accented letter, or one from outside the basic plane, as one character', () => {
    expect(checkField('currency', 'é'.repeat(24))).toBeNull()
    expect(checkField('name', '\u{1D538}')).toMatch(/At least 2/)
  })

  it('allows any characters at all', () => {
    expect(checkField('name', '<b>Vesland</b> & "Sons"')).toBeNull()
    expect(checkField('capital', '{nation}')).toBeNull()
  })

  it('reports every field of an empty form and none of a full one', () => {
    expect(Object.keys(checkIdentity(EMPTY_TEXT)).sort()).toEqual(FIELDS.map((f) => f.id).sort())
    expect(identityIsValid(good)).toBe(true)
    expect(identityIsValid({ ...good, capital: '' })).toBe(false)
  })

  it('tidies whitespace when it builds the identity and round-trips the text', () => {
    expect(tidy('  New   Vesland \n')).toBe('New Vesland')
    const identity = buildIdentity(
      { ...good, name: '  New   Vesland ' },
      { layout: 'disc', colours: ['#1d4e89'] },
    )
    expect(identity.name).toBe('New Vesland')
    expect(identity.flag.colours).toHaveLength(2)
    expect(textOf(buildIdentity(good, DEFAULT_FLAG))).toEqual(good)
  })
})

describe('suggestions', () => {
  it('has lists with no duplicates and nothing that fails its own checks', () => {
    const lists = {
      name: NATIONS,
      capital: CAPITALS,
      currency: CURRENCIES,
      leaderTitle: LEADER_TITLES,
    } as const
    for (const [field, list] of Object.entries(lists)) {
      expect(new Set(list).size, field).toBe(list.length)
      for (const value of list) expect(checkField(field as keyof typeof lists, value), value).toBeNull()
    }
  })

  it('does not reuse the places the core pack already talks about', () => {
    const taken = ['Harrowgate', 'Saltmere', 'Wickford', 'Dunmoor', 'Kessel']
    for (const name of [...NATIONS, ...CAPITALS]) expect(taken).not.toContain(name)
  })

  it('derives a demonym from the shape of the name', () => {
    expect(demonymFor('Vesland')).toBe('Veslander')
    expect(demonymFor('Halvenia')).toBe('Halvenian')
    expect(demonymFor('Kestrow')).toBe('Kestrovian')
    expect(demonymFor('Arvenne')).toBe('Arvennese')
    expect(demonymFor('Ostwald Isles')).toBe('Ostwaldian')
    expect(demonymFor('Aldermoor')).toBe('Aldermoorish')
    expect(demonymFor('Zog')).toBe('Zogian')
    expect(demonymFor('  ')).toBe('')
    for (const nation of NATIONS) expect(checkField('demonym', demonymFor(nation)), nation).toBeNull()
  })

  it('fills every field with something valid, repeatably', () => {
    const all = suggestAll(EMPTY_TEXT, seeded(1))
    expect(identityIsValid(all)).toBe(true)
    expect(all.demonym).toBe(demonymFor(all.name))
    expect(suggestAll(EMPTY_TEXT, seeded(1))).toEqual(all)
  })

  it('never suggests what is already there', () => {
    const rng = seeded(9)
    let text = suggestAll(EMPTY_TEXT, rng)
    for (let i = 0; i < 50; i++) {
      const next = suggestField('capital', text, rng)
      expect(next.capital).not.toBe(text.capital)
      text = next
    }
  })

  it('moves the demonym with the name only while the player has not written their own', () => {
    const rng = seeded(4)
    const followed = suggestField('name', { ...good }, rng)
    expect(followed.demonym).toBe(demonymFor(followed.name))
    const kept = suggestField('name', { ...good, demonym: 'Vez' }, rng)
    expect(kept.demonym).toBe('Vez')
  })

  it('suggests a demonym for the name as typed', () => {
    expect(suggestField('demonym', { ...good, name: 'Drennia', demonym: '' }, seeded(2)).demonym).toBe(
      'Drennian',
    )
    expect(suggestField('demonym', EMPTY_TEXT, seeded(2)).demonym).not.toBe('')
  })
})
