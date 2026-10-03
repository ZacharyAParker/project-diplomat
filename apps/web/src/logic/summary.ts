import { classify, render, type Content, type GameState, type IndicatorId } from '@diplomat/engine'

// Five bands for any 0 to 100 figure. Where a number sits decides which words it gets.
type Band = 0 | 1 | 2 | 3 | 4

export function band(value: number): Band {
  if (value < 25) return 0
  if (value < 42) return 1
  if (value < 58) return 2
  if (value < 75) return 3
  return 4
}

// The three figures shown as pills under the nation's name, each in words on a ladder.
export interface Pill {
  id: IndicatorId
  label: string
  word: string
  tone: 'low' | 'middling' | 'high'
}

const LADDERS: Record<'liberty' | 'capacity' | 'legitimacy', readonly string[]> = {
  liberty: ['Outlawed', 'Rationed', 'Average', 'Good', 'Excessive'],
  capacity: ['Basket Case', 'Struggling', 'Fair', 'Strong', 'Booming'],
  legitimacy: ['Collapsing', 'Grudging', 'Tolerated', 'Trusted', 'Adored'],
}

const PILL_LABELS = { liberty: 'Civil Liberties', capacity: 'Economy', legitimacy: 'Public Trust' } as const

export function pills(state: GameState): Pill[] {
  return (['liberty', 'capacity', 'legitimacy'] as const).map((id) => {
    const b = band(state.indicators[id])
    return {
      id,
      label: PILL_LABELS[id],
      word: LADDERS[id][b]!,
      tone: b <= 1 ? 'low' : b === 2 ? 'middling' : 'high',
    }
  })
}

// A phrase for each indicator at each band. Every phrase finishes a sentence that has
// already named its subject, so they can be strung together.
const SAY: Record<IndicatorId, readonly [string, string, string, string, string]> = {
  liberty: [
    'may say whatever the government has approved in advance',
    'may speak their minds, quietly and indoors',
    'enjoy the usual freedoms, most of the time',
    'speak, march and complain freely',
    'are free to do very nearly anything, and frequently do',
  ],
  capacity: [
    'an economy held together with string and optimism',
    'an economy that is mostly waiting for things to improve',
    'an unremarkable economy that pays its way',
    'a busy economy of factories, offices and loading bays',
    'a roaring economy that exports everything not nailed down',
  ],
  employment: [
    'Most working-age adults have no job to go to',
    'Work is hard to find outside the capital',
    'Most people who want work can find some',
    'Jobs are plentiful',
    'Anyone with a pulse can find work by lunchtime',
  ],
  living: [
    'and everyday life is a long queue for scarce things',
    'and households count every coin',
    'and ordinary life is ordinary',
    'and most households are comfortable',
    'and daily life is famously pleasant',
  ],
  inequality: [
    'Wealth is spread almost suspiciously evenly',
    'The gap between rich and poor is modest',
    'The rich are richer than everyone else, in the usual way',
    'The rich live in a different country from the poor, without leaving',
    'A small number of families own nearly everything, including the newspapers that report it',
  ],
  health: [
    'hospitals that are mainly waiting rooms',
    'stretched hospitals',
    'adequate hospitals',
    'good hospitals',
    'some of the healthiest citizens anywhere',
  ],
  education: [
    'schools that teach mostly patience',
    'schools that struggle',
    'decent schools',
    'very good schools',
    'schools that produce an alarming number of professors',
  ],
  environment: [
    'a landscape of slag heaps and warning signs',
    'tired rivers and grey skies',
    'a pleasant enough countryside',
    'clean rivers and green hills',
    'pristine wilderness that the government guards jealously',
  ],
  fiscal: [
    'The treasury is spending far more than it brings in',
    'The budget is in deficit',
    'The budget roughly balances',
    'The treasury runs a surplus',
    'The treasury is embarrassingly flush',
  ],
  debt: [
    'and owes almost nobody anything.',
    'and its debts are small.',
    'and its debts are manageable.',
    'and its debts are a regular subject of anxious editorials.',
    'and its lenders telephone daily.',
  ],
  legitimacy: [
    'Few people believe the government has any right to govern.',
    'The government is obeyed, grudgingly.',
    'Most people accept the government, without enthusiasm.',
    'The government is generally trusted.',
    'The government is trusted to a degree other governments find suspicious.',
  ],
  administration: [
    'the civil service loses more forms than it files',
    'the civil service is slow',
    'the civil service works, on the whole',
    'the civil service is efficient',
    'the civil service is so efficient it is faintly sinister',
  ],
}

const say = (state: GameState, id: IndicatorId) => SAY[id][band(state.indicators[id])]

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// The few paragraphs at the top of the nation page that describe the country as a
// travel writer with a grudge might: every clause comes from a figure the player can check.
export function summary(state: GameState, content: Content): string[] {
  const { identity } = state
  const people = `${identity.demonym}s`
  const nationClass = classify(state, content)
  const known = content.traits.filter((t) => state.traits.includes(t.id)).map((t) => t.name)
  const recent = [...state.timeline].reverse().find((entry) => entry.kind === 'decision')

  const first =
    `${identity.name} is a nation of ${say(state, 'environment')}, governed by its ` +
    `${identity.leaderTitle} from ${identity.capital}. Its ${people} ${say(state, 'liberty')}, ` +
    `${say(state, 'living')}.`

  const second =
    `The country runs on ${say(state, 'capacity')}. ${say(state, 'employment')}. ` +
    `${say(state, 'inequality')}. ${say(state, 'fiscal')}, ${say(state, 'debt')}`

  const third =
    `${identity.name} has ${say(state, 'health')} and ${say(state, 'education')}, and ` +
    `${say(state, 'administration')}. ${say(state, 'legitimacy')}`

  const reputation = known.length
    ? ` Abroad it is known as a ${known.join(' and a ')}.`
    : ''
  const fourth =
    `The world calls it ${render(nationClass.name, state, content)}.${reputation}` +
    (recent ? ` Most recently: ${recent.headline.replace(/[.!?]$/, '')}.` : '')

  return [first, second, third, fourth].map(capitalise)
}
