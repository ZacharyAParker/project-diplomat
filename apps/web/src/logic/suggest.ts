import { tidy, type IdentityField, type IdentityText } from './identity.ts'
import { pickOther, type Rng } from './rng.ts'

// Every name here is made up. If one turns out to be a real place, it should go.
export const NATIONS: readonly string[] = [
  'Vesland',
  'Halvenia',
  'Brennick',
  'Tarnholt',
  'Quillany',
  'Morvane',
  'Caldrey',
  'Luthmark',
  'Selvany',
  'Drennia',
  'Kestrow',
  'Albrecia',
  'Aldermoor',
  'Corvany',
  'Ysmere',
  'Belmarch',
  'Hartovia',
  'Sarrow',
  'Wendrake',
  'Fenmark',
  'Zembry',
  'Norvelle',
  'Pellucia',
  'Arvenne',
  'Vostrane',
  'Marrovia',
  'Eskmere',
  'Durnholm',
  'Lachery',
  'Ostwald Isles',
]

export const CAPITALS: readonly string[] = [
  'Port Averill',
  'Highmarch',
  'Stannard',
  'Lowenbridge',
  'St Corwen',
  'Tessenmouth',
  'Castle Varr',
  'Merrowby',
  'Brackmouth',
  'Hallowfield',
  'Kingsreach',
  "Abbot's Ferry",
  'Marchwell',
  'Ravenhythe',
  'Greyminster',
  'Easterhythe',
  'Lantern Hill',
  'Corrinford',
  'Summerhaugh',
  'Pallister',
  'Vanehaven',
  'Ashmarsh',
  'Caxby',
  'Ormsgate',
  'Tollerby',
  'Brindlemoor',
  'Nether Quay',
  'Oldwater',
]

export const CURRENCIES: readonly string[] = [
  'florin',
  'crown',
  'mark',
  'ducat',
  'thaler',
  'guilder',
  'groat',
  'laurel',
  'quill',
  'penning',
  'merk',
  'obol',
  'argent',
  'noble',
  'testoon',
  'bezant',
  'stiver',
  'sovereign',
]

export const LEADER_TITLES: readonly string[] = [
  'Prime Minister',
  'President',
  'Chancellor',
  'First Minister',
  'Premier',
  'Chief Minister',
  'First Secretary',
  'Lord Protector',
  'Consul',
  'Steward',
  'Chair of the Council',
]

// Longest ending first, so "land" wins over "d". The number is how many letters come off
// the name before the new ending goes on.
const ENDINGS: readonly [string, number, string][] = [
  ['land', 0, 'er'],
  ['mark', 0, 'er'],
  ['holm', 0, 'er'],
  ['holt', 0, 'er'],
  ['march', 0, 'er'],
  ['drake', 1, 'er'],
  ['moor', 0, 'ish'],
  ['mere', 1, 'ian'],
  ['vane', 1, 'ian'],
  ['trane', 1, 'ian'],
  ['elle', 1, 'ian'],
  ['enne', 1, 'ese'],
  ['row', 1, 'vian'],
  ['any', 1, 'ian'],
  ['ery', 1, 'ian'],
  ['ia', 0, 'n'],
  ['ick', 0, 'er'],
  ['ry', 1, 'ian'],
  ['ey', 0, 'an'],
  ['a', 0, 'n'],
  ['e', 1, 'ian'],
  ['y', 1, 'ian'],
]

// A guess at what the people of a made-up country are called. It only looks at the last
// word's ending, which is right often enough for a suggestion and no more.
export function demonymFor(nation: string): string {
  const name = tidy(nation)
  if (name === '') return ''
  const words = name.split(' ')
  const last = words[words.length - 1]!
  const plural = /^(isles|islands)$/i.test(last) && words.length > 1
  const stem = plural ? words.slice(0, -1).join(' ') : name
  const lower = stem.toLowerCase()
  for (const [ending, drop, add] of ENDINGS) {
    if (lower.endsWith(ending) && stem.length > ending.length) return stem.slice(0, stem.length - drop) + add
  }
  return `${stem}ian`
}

const LISTS: Record<Exclude<IdentityField, 'demonym'>, readonly string[]> = {
  name: NATIONS,
  capital: CAPITALS,
  currency: CURRENCIES,
  leaderTitle: LEADER_TITLES,
}

// A new value for one field, never the one already there. The demonym follows the name,
// so asking for a new name while the demonym still matches the old one moves both.
export function suggestField(field: IdentityField, current: IdentityText, rng: Rng): IdentityText {
  if (field === 'demonym') {
    const fromName = demonymFor(current.name)
    return { ...current, demonym: fromName || demonymFor(pickOther(rng, NATIONS, '')) }
  }
  const value = pickOther(rng, LISTS[field], current[field])
  const next = { ...current, [field]: value }
  const demonymFollowed = current.demonym === '' || current.demonym === demonymFor(current.name)
  if (field === 'name' && demonymFollowed) next.demonym = demonymFor(value)
  return next
}

export function suggestAll(current: IdentityText, rng: Rng): IdentityText {
  const name = pickOther(rng, NATIONS, current.name)
  return {
    name,
    capital: pickOther(rng, CAPITALS, current.capital),
    currency: pickOther(rng, CURRENCIES, current.currency),
    demonym: demonymFor(name),
    leaderTitle: pickOther(rng, LEADER_TITLES, current.leaderTitle),
  }
}
