import type { Identity } from '@diplomat/engine'
import { DEFAULT_FLAG, fitColours, type FlagSpec } from './flags.ts'

export type IdentityField = 'name' | 'capital' | 'currency' | 'demonym' | 'leaderTitle'

export type IdentityText = Record<IdentityField, string>

export interface FieldInfo {
  id: IdentityField
  label: string
  hint: string
  max: number
}

export const MIN_LENGTH = 2

export const FIELDS: readonly FieldInfo[] = [
  { id: 'name', label: 'Name of the nation', hint: 'As it appears on the maps. No "The".', max: 40 },
  { id: 'capital', label: 'Capital', hint: 'Where the government sits.', max: 40 },
  { id: 'demonym', label: 'Its people are called', hint: 'One of them, as in "a Veslander".', max: 30 },
  { id: 'currency', label: 'Currency', hint: 'One of them, as in "a florin".', max: 24 },
  {
    id: 'leaderTitle',
    label: 'Your title',
    hint: 'What the papers call the head of government.',
    max: 40,
  },
]

export const EMPTY_TEXT: IdentityText = { name: '', capital: '', currency: '', demonym: '', leaderTitle: '' }

export function tidy(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

// Counted in characters as a reader sees them, so an accented letter is one and not two.
function length(value: string): number {
  return [...value].length
}

export function checkField(field: IdentityField, value: string): string | null {
  const info = FIELDS.find((f) => f.id === field)!
  const text = tidy(value)
  if (text === '') return 'This cannot be left blank.'
  if (length(text) < MIN_LENGTH) return `At least ${MIN_LENGTH} characters.`
  if (length(text) > info.max) return `No more than ${info.max} characters.`
  return null
}

export function checkIdentity(text: IdentityText): Partial<Record<IdentityField, string>> {
  const problems: Partial<Record<IdentityField, string>> = {}
  for (const { id } of FIELDS) {
    const problem = checkField(id, text[id])
    if (problem) problems[id] = problem
  }
  return problems
}

export function identityIsValid(text: IdentityText): boolean {
  return Object.keys(checkIdentity(text)).length === 0
}

export function buildIdentity(text: IdentityText, flag: FlagSpec = DEFAULT_FLAG): Identity {
  return {
    name: tidy(text.name),
    capital: tidy(text.capital),
    currency: tidy(text.currency),
    demonym: tidy(text.demonym),
    leaderTitle: tidy(text.leaderTitle),
    flag: { layout: flag.layout, colours: fitColours(flag.layout, flag.colours) },
  }
}

export function textOf(identity: Identity): IdentityText {
  return {
    name: identity.name,
    capital: identity.capital,
    currency: identity.currency,
    demonym: identity.demonym,
    leaderTitle: identity.leaderTitle,
  }
}

// For the typed confirmation before a nation is deleted. Case and stray spaces are
// forgiven, since the point is to make the player stop, not to set a spelling test.
export function sameName(typed: string, name: string): boolean {
  const plain = (text: string) => tidy(text).toLocaleLowerCase()
  return plain(typed) !== '' && plain(typed) === plain(name)
}
