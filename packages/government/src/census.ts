// NationStates-style figures, derived from the engine. The engine keeps twelve indicators
// from 0 to 100; a census reports people, money and crime. Each figure here is the census
// base (set at founding, or by import) moved by the indicators through a stated constant,
// so a figure can always be explained by the indicators that make it. Nothing is stored.

import { support, type Content, type GameState, type IndicatorId } from '@diplomat/engine'
import type { CensusBase, CensusFigure } from './types.ts'
import { rngFor } from './util.ts'

// How far each indicator moves a figure from its base. m(x, k) is 1 at a reading of 50,
// 1 + k at 100 and 1 - k at 0. The ks are first guesses, tuned so that a run of good or bad
// decisions moves the figures about as far as a NationStates nation's move in a month.
const m = (x: number, k: number) => 1 + (k * (x - 50)) / 50

const GDP_CAPACITY = 0.5
const GDP_EMPLOYMENT = 0.3
const GDP_EDUCATION = 0.15
const GROWTH_HEALTH = 1
const GROWTH_LIVING = 0.5
const LABOUR_SHARE = 0.55
const CRIME_ADMINISTRATION = -0.4
const CRIME_INEQUALITY = 0.4
const CRIME_LIBERTY = 0.1
const CRIME_EMPLOYMENT = -0.3
const TAX_FISCAL = 0.15
const TAX_POLICY = 0.6

const round = (n: number, places = 0) => Math.round(n * 10 ** places) / 10 ** places

// A word for a reading from 0 to 100, from a ladder of ten. Our own words, not NationStates'.
const ladderOf = (words: readonly string[]) => (x: number) => words[Math.min(words.length - 1, Math.max(0, Math.floor(x / (100 / words.length))))]!

export const RIGHTS_WORDS = ['Abolished', 'Nominal', 'Scarce', 'Few', 'Some', 'Fair', 'Good', 'Very Good', 'Excellent', 'Superb'] as const
export const FREEDOM_WORDS = ['Extinguished', 'Token', 'Scarce', 'Limited', 'Some', 'Fair', 'Good', 'Very Good', 'Excellent', 'Superb'] as const
export const ECONOMY_WORDS = ['Collapsed', 'Broken', 'Struggling', 'Weak', 'Fragile', 'Fair', 'Sound', 'Strong', 'Thriving', 'Booming'] as const

export const civilRights = ladderOf(RIGHTS_WORDS)
export const politicalFreedom = ladderOf(FREEDOM_WORDS)
export const economyRating = ladderOf(ECONOMY_WORDS)

const figure = (id: string, name: string, value: number, unit: string, description: string, rating?: string): CensusFigure => ({
  id,
  name,
  value,
  unit,
  ...(rating === undefined ? {} : { rating }),
  description,
})

export function population(state: GameState, base: CensusBase): number {
  const i = state.indicators
  const factor = m(i.health, GROWTH_HEALTH) * m(i.living, GROWTH_LIVING)
  // Growth is compounded daily from the base. At neutral readings it is the base's growth;
  // it stalls when health and living have fallen by about a fifth, and goes into reverse below.
  const daily = (base.growth * (factor - 0.6)) / 0.4
  return Math.round(base.population * (1 + daily) ** Math.max(0, state.day - 1))
}

export function gdpPerHead(state: GameState, base: CensusBase): number {
  const i = state.indicators
  return base.gdpPerHead * m(i.capacity, GDP_CAPACITY) * m(i.employment, GDP_EMPLOYMENT) * m(i.education, GDP_EDUCATION)
}

// A policy counts towards the tax rate if its name says it is a tax, a levy or a duty.
const TAXING = /tax|levy|duty|tariff/i

export function census(state: GameState, base: CensusBase, content: Content): CensusFigure[] {
  const i = state.indicators
  const people = population(state, base)
  const perHead = gdpPerHead(state, base)
  const gdp = people * perHead
  const currency = state.identity.currency
  const taxes = content.policies.filter((p) => TAXING.test(`${p.id} ${p.name}`) && state.policies[p.id] === true).length
  const tax = Math.min(90, Math.max(0, base.taxRate + (i.fiscal - 50) * TAX_FISCAL + taxes * TAX_POLICY))
  const crime =
    base.crimePerHour *
    (people / base.population) *
    m(i.administration, CRIME_ADMINISTRATION) *
    m(i.inequality, CRIME_INEQUALITY) *
    m(i.liberty, CRIME_LIBERTY) *
    m(i.employment, CRIME_EMPLOYMENT)
  const unemployment = 22 * (1 - i.employment / 100) ** 1.5
  const income = perHead * LABOUR_SHARE * (1 - (i.inequality - 50) / 250)
  const spread = 3 + i.inequality / 10
  const life = 62 + i.health * 0.3 + i.living * 0.06
  const literacy = 99.9 - 30 * (1 - i.education / 100) ** 2
  const carbon = 14 * (1 - i.environment / 120) * m(i.capacity, 0.3)
  const freedom = (i.liberty * 2 + i.legitimacy) / 3
  const economy = (i.capacity * 2 + i.employment + i.fiscal) / 4

  return [
    figure('population', 'Population', people, 'people', `${people.toLocaleString('en-GB')} people. It grows faster when health and living standards are good.`),
    figure('gdp', 'Gross domestic product', round(gdp), currency, `What the country produces in a year, in ${currency}s: population times output per head.`),
    figure('gdp-per-head', 'GDP per head', round(perHead), currency, 'Output per person, moved by the economy, employment and education.'),
    figure('income', 'Average income', round(income), currency, 'What a typical worker takes home in a year. Inequality pulls it below the average output.'),
    figure('income-spread', 'Income spread', round(spread, 1), 'times', 'How many times the income of the poorest tenth the richest tenth earns.'),
    figure('tax', 'Tax rate', round(tax, 1), '%', 'The share of income the state takes, all taxes together.'),
    figure('crime', 'Crime', round(crime, 2), 'per hour', 'Recorded crimes an hour. Capable administration and work keep it down; inequality pushes it up.'),
    figure('unemployment', 'Unemployment', round(unemployment, 1), '%', 'The share of people who want work and have none.'),
    figure('life', 'Life expectancy', round(life, 1), 'years', 'At birth, given health and living standards.'),
    figure('literacy', 'Literacy', round(Math.min(99.9, literacy), 1), '%', 'Adults who read and write with ease.'),
    figure('carbon', 'Emissions', round(carbon, 1), 'tonnes per head', 'Carbon a year per person. A cleaner environment and a smaller industry bring it down.'),
    figure('civil-rights', 'Civil rights', round(i.liberty), 'of 100', 'Privacy, protest and the press.', civilRights(i.liberty)),
    figure('political-freedom', 'Political freedom', round(freedom), 'of 100', 'Whether people may say who governs and be heard.', politicalFreedom(freedom)),
    figure('economy', 'Economy', round(economy), 'of 100', 'Output, work and the books together.', economyRating(economy)),
    ...rankings(state, base),
  ]
}

// The comic part of a census: figures nobody asked for and everybody reads first. Each is
// still derived from the indicators, so a nation's character shows in its absurdities.
function rankings(state: GameState, base: CensusBase): CensusFigure[] {
  const i = state.indicators
  const mood = support(state)
  const at = (id: IndicatorId) => i[id] / 100
  // A small seeded flavour per nation, fixed for good, so two nations with the same
  // readings still differ in their pigeons.
  const r = rngFor(state.seed, 0, 'census:quirks')
  const quirk = () => 0.8 + r() * 0.4
  const q = [quirk(), quirk(), quirk(), quirk(), quirk(), quirk(), quirk()]
  return [
    figure('forms', 'Forms per citizen', round((2 + (1 - at('administration')) * 18) * q[0]!, 1), 'forms a year', 'Official forms the average citizen fills in a year. Most ask for information on another form.'),
    figure('queues', 'Queue tolerance', round((5 + at('administration') * 40 + at('legitimacy') * 15) * q[1]!), 'minutes', 'How long a citizen will stand in a queue before writing to a newspaper about it.'),
    figure('letters', 'Letters to the editor', round((base.population / 50_000) * (0.5 + at('liberty')) * (1.5 - mood / 100) * q[2]!), 'a day', 'Letters to the editor a day, nationally. Freedom to complain and the wish to do so both count.'),
    figure('potholes', 'Pothole density', round((1 + (1 - at('capacity')) * 6 + (50 - Math.min(50, i.fiscal)) / 10) * q[3]!, 1), 'per kilometre', 'On roads the ministry describes as good.'),
    figure('pigeons', 'Pigeons per head', round((0.2 + at('environment') * 0.6 + (1 - at('administration')) * 0.3) * q[4]!, 2), 'pigeons', 'Feral pigeons per citizen. A greener country feeds more of them; a less tidy one leaves them more to eat.'),
    figure('tea', 'Hot drinks per committee', round((3 + at('administration') * 4 + (base.taxRate / 10)) * q[5]!, 1), 'cups', 'Hot drinks served at an average meeting of a government committee, before the first item.'),
    figure('sulk', 'National sulk index', round(Math.max(0, 100 - mood - i.legitimacy / 4) * q[6]!), 'of 100', 'How put out the country feels, measured by sighing in public.'),
  ]
}

const LIVELIHOOD: Record<string, number> = { industry: 1.0, land: 0.75, money: 1.35, state: 0.9 }
const BARGAIN: Record<string, number> = { cradle: 38, ladder: 17, stamps: 26 }
const ORDER: Record<string, number> = { courts: 3.2, police: 2.4, neighbours: 4.1 }

// The fixed points for a new nation, from its founding answers. Answers this table does not
// know (another pack's) leave the middle value. The seed varies the size of the country.
export function censusBase(answers: Record<string, string>, seed: number): CensusBase {
  const r = rngFor(seed, 0, 'census:base')
  const size = 0.4 + r() * 3.6
  return {
    population: Math.round((5_000_000 * size) / 1000) * 1000,
    gdpPerHead: Math.round((32_000 * (LIVELIHOOD[answers['livelihood'] ?? ''] ?? 1) * (0.9 + r() * 0.2)) / 100) * 100,
    taxRate: BARGAIN[answers['bargain'] ?? ''] ?? 27,
    crimePerHour: (ORDER[answers['order'] ?? ''] ?? 3.5) * size,
    growth: 0.00003,
  }
}
