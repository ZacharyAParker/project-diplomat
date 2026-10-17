// The people who sit in the bodies: names from the pack's lists, a line of character each,
// a reading of the law for the justices, and names for parties built from the factions they
// carry. All seeded, so the same nation always seats the same people.

import { pick, type Rng } from './util.ts'

// Draws names that have not been used yet. With 24 by 24 names in the core pack there are
// 576, which seats every named member of any form; past that a middle initial is added.
export function namer(rng: Rng, names: { given: readonly string[]; family: readonly string[] }, taken: Iterable<string> = []) {
  const used = new Set(taken)
  return (): string => {
    for (let tries = 0; tries < 40; tries++) {
      const name = `${pick(rng, names.given)} ${pick(rng, names.family)}`
      if (!used.has(name)) {
        used.add(name)
        return name
      }
    }
    const initial = String.fromCharCode(65 + Math.floor(rng() * 26))
    const name = `${pick(rng, names.given)} ${initial}. ${pick(rng, names.family)}`
    used.add(name)
    return name
  }
}

export const CHARACTERS = [
  'Speaks briefly and votes predictably, which the press have started calling a virtue.',
  'A former schoolteacher who still marks other members\' speeches out of ten, aloud.',
  'Arrives with a folder of figures and leaves with a reputation for being right too early.',
  'Has never once agreed with the front bench in public and rarely disagrees in private.',
  'Represents somewhere small and mentions it in every speech, by name, twice.',
  'Was a union steward for twenty years and negotiates the lunch order like a pay round.',
  'Ran a family firm into the ground and out again, and lectures the House on both.',
  'Quotes the founders from memory, sometimes accurately.',
  'Votes with the party and writes long letters to the newspapers explaining why not.',
  'A farmer who distrusts anything decided indoors, including this.',
  'Young, quick, and certain, and keeps the receipts of every promise made to the young.',
  'The best-dressed member of the House and the hardest to pin down on anything.',
  'A retired officer who calls every debate a briefing and every vote an order.',
  'Asks the question everybody else was hoping nobody would ask, every time.',
  'A doctor who still keeps surgery hours on Fridays and has the waiting list to show for it.',
  'Believes in compromise so firmly that nobody can remember what she believes.',
  'Has sat through four governments and expects to outlast this one with interest.',
  'Talks about the household budget, the national budget and her own allotment in the same breath.',
  'A lay preacher who sermonises on drains and, once, on the deficit.',
  'Keeps a running tally of ministerial U-turns and reads it out on anniversaries.',
  'Was elected by eleven votes and behaves as if every one of them is watching.',
  'Speaks in long careful paragraphs; the reporters go for coffee and come back for the conclusion.',
  'A former pensions clerk who knows the actuarial tables better than the ministry does.',
  'Joined politics over a closed library and has not forgiven anyone since.',
  'Says what the Chamber is thinking an hour before it thinks it.',
  'Has a reputation for kindness and a voting record that suggests otherwise.',
  'Reads every bill in full, including the schedules, and is unbearable about it.',
  'A broadcaster before she was elected and still finds the camera before the argument.',
]

export const PHILOSOPHIES = [
  'A textualist: reads the words as written and no further.',
  'A purposive reader: asks what each right is for, and protects that.',
  'A rights maximalist: gives every right its widest fair reading.',
  'Deferential to the elected branches: bars only the plain case.',
  'A pragmatist: weighs the harm done against the purpose served.',
  'A historian: reads the Charter by the fears of those who wrote it.',
  'A proceduralist: cares most whether a thing was done lawfully, less what it was.',
  'A minimalist: decides no more than the case in front of the court.',
]

export const ELDER_PHILOSOPHIES = [
  'A literalist of scripture: what is written is the whole of the law.',
  'A jurist of the old school: the commentaries first, the text second.',
  'A mystic: the spirit of the faith over its letter, and mercy over both.',
  'A reformer: the faith must live in this century or it will not live in the next.',
  'A guardian of custom: what the grandparents did is evidence of what is right.',
]

export const OFFICER_CHARACTERS = [
  'Commanded the northern garrison and has never let anyone forget the winter of it.',
  'A logistician who believes most wars and all governments are lost on supply.',
  'Came up from the ranks and votes like a sergeant: briefly and without regret.',
  'Runs the military police and attends every meeting with a notebook nobody has seen inside.',
  'The navy\'s man, who thinks the country is an island even where it is not.',
  'An air officer with a fondness for maps and a distrust of anything slower than a jet.',
  'Signed the declaration of the Council last and is first to say it should not last forever.',
  'Was a military attaché abroad and talks about other countries as if they might be listening.',
  'Writes the Council\'s communiqués and believes every word of them.',
]

// A party's name from the factions it carries. The pack's faction names are used as they
// stand ("The Unions"), so a pack with different factions gets different parties.
const ONE = ['The {a} Party', 'The {a} League', 'The Party of {A}', 'The {a} Movement', 'The {a} Front']
const TWO = ['The {a} and {b} Alliance', 'The Party of {A} and {B}', 'The {a}–{b} Union', 'The {a} and {b} Bloc']
const MORE = ['The Broad Alliance of {A}, {B} and {C}', 'The {a}, {b} and {c} Coalition', 'The Common List of {A}, {B} and {C}']
const TENDENCY = ['The {a} Tendency', 'The {a} Platform', 'The {a} Wing']

const bare = (name: string) => name.replace(/^The /, '')

export function partyName(rng: Rng, factionNames: readonly string[], kind: 'party' | 'tendency' = 'party'): string {
  const [a = 'Independent', b = '', c = ''] = factionNames.map(bare)
  // {A} keeps the article for "of" phrases: the Party of the Shires, not of Shires.
  const [A = 'Independents', B = '', C = ''] = factionNames.map((n) => n.replace(/^The /, 'the '))
  const fill = (t: string) => t.replace('{A}', A).replace('{B}', B).replace('{C}', C).replace('{a}', a).replace('{b}', b).replace('{c}', c)
  if (kind === 'tendency') return fill(pick(rng, TENDENCY))
  return fill(pick(rng, factionNames.length === 1 ? ONE : factionNames.length === 2 ? TWO : MORE))
}

// Colours for the seat chart, readable on light and dark backgrounds.
export const PARTY_COLOURS = ['#c0392b', '#2471a3', '#229954', '#d4ac0d', '#7d3c98', '#ca6f1e', '#17a589', '#839192', '#a93226']

export function partyDescription(factionNames: readonly string[], factionDescriptions: readonly string[]): string {
  const [lead] = factionDescriptions
  const named = factionNames.map((n) => n.replace(/^The /, 'the '))
  const carries = named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named.at(-1)}`
  return `Carries the interests of ${carries}. ${lead ?? ''}`.trim() + ' Votes as its people would, and says so at length.'
}
