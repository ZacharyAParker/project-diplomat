// The stand-ins for the world and the rest of government's business: the almanac and the
// press, letters, bills, factbooks, replies. The world stand-in has no effects at all: with
// no AI, the country reacts in print and the numbers are left to the engine.

import { DISMISS, type Task, type TaskInput, type TaskOutput } from './types.ts'
import { between, pick, rngFor } from './util.ts'

const WEATHER: Record<string, string[]> = {
  winter: ['Hard frost overnight; the ferries ran late and the pigeons sulked.', 'Sleet from the north by mid-morning, rain by lunch, sleet again by the evening news.', 'A still, grey, freezing day. The kind that makes a country take committees seriously.'],
  spring: ['Bright spells and sharp showers, in that order and then the other.', 'The first warm day of the year. Every park bench in {capital} was occupied by noon.', 'Wind from the west, blossom on the pavements, umbrellas turned inside out.'],
  summer: ['Hot and close. Ice-cream vans outnumbered buses in {capital} by mid-afternoon.', 'A thunderstorm at teatime ended a heatwave nobody had enjoyed.', 'Long, warm and windless. The canals smelled of summer, which is to say of canals.'],
  autumn: ['Fog in the valleys until eleven, then a clear cold afternoon.', 'Gales overnight. Leaves blocked the drains and the drains blocked the roads.', 'Mild and damp. The kind of day the weather forecast describes as changeable and means it.'],
}

const SEASON: Record<string, string> = {
  December: 'winter', January: 'winter', February: 'winter', March: 'spring', April: 'spring', May: 'spring',
  June: 'summer', July: 'summer', August: 'summer', September: 'autumn', October: 'autumn', November: 'autumn',
}

const EVENTS = [
  { headline: 'Library reports overdue book returned after 41 years', text: 'A copy of a cookery book borrowed in {capital} has come back with a note of apology and three recipes crossed out as "not as described".' },
  { headline: '{animal} found asleep in a bank lobby', text: 'Staff in {capital} say the {animal} was polite, would not move, and was eventually coaxed out with a biscuit. A customer said it was the most useful thing to happen in the bank all year.' },
  { headline: 'Village wins national marrow competition for the ninth time', text: 'Judges were said to be "concerned" by the size of the winning marrow and have asked to see the soil.' },
  { headline: 'Choir breaks record for longest hymn sung in a lift', text: 'Thirty-two {demonym} singers held the final note between the third and fourth floors when the lift stopped. The fire brigade joined in.' },
  { headline: 'Cup final ends goalless after extra time and an argument', text: 'Both captains claimed victory. The trophy is being kept in a neutral town hall until somebody decides what happened.' },
  { headline: 'Bakery chain apologises for "excessively seasonal" bun', text: 'The bun contained eleven spices. Customers counted.' },
  { headline: 'Lost wedding ring found inside a supermarket pumpkin', text: 'The ring was lost in a field three summers ago. The couple, now divorced, are sharing custody of the pumpkin.' },
  { headline: 'Night bus driver retires after thirty years on the same route', text: 'Passengers organised a collection, a cake and a petition asking him to reconsider. He has agreed to drive the route once more, "for the cake".' },
  { headline: 'University discovers its oldest building is younger than its car park', text: 'The archive confirmed the car park was laid first. The vice-chancellor called it "an interesting finding" and declined to say more.' },
  { headline: 'Town clock stops at 4:17, town declines to fix it', text: 'Residents say they have grown used to it being 4:17 and the council has agreed it is "probably about right".' },
  { headline: 'Record crowds for the annual cheese-rolling, fewer injuries than feared', text: 'Two sprained ankles and one broken pair of spectacles were reported. The cheese was unharmed.' },
  { headline: 'Ferry passengers vote to keep on-board accordion player', text: 'A poll of the morning crossing found 61 per cent in favour, 30 against and 9 who said it depended on the tune.' },
]

const fill = (t: string, i: { brief: TaskInput['world.day']['brief'] }) =>
  t.replace(/\{capital\}/g, i.brief.nation.capital).replace(/\{demonym\}/g, i.brief.nation.demonym).replace(/\{animal\}/g, i.brief.nation.animal ?? 'heron')

function supportOf(standing: readonly string[]): number {
  const line = standing.find((s) => s.startsWith('Support for the government'))
  return Number(line?.match(/(\d+)\s*$/)?.[1] ?? 50)
}

function worldDay(input: TaskInput['world.day'], seed: number): TaskOutput['world.day'] {
  const rng = rngFor(seed, input.brief.day, 'world')
  const month = input.brief.date.split(' ')[2] ?? 'October'
  const weather = fill(pick(rng, WEATHER[SEASON[month] ?? 'autumn']!), input)
  const pool = [...EVENTS]
  const events = Array.from({ length: between(rng, 1, 2) }, () => {
    const e = pool.splice(Math.floor(rng() * pool.length), 1)[0]!
    return { headline: fill(e.headline, input), text: fill(e.text, input) }
  })
  const first = input.decisions[0]
  const press = input.press.map((outlet, i) => {
    const kind = /sober|record/i.test(outlet.line) ? 0 : /scept|commercial/i.test(outlet.line) ? 1 : /loud|populist/i.test(outlet.line) ? 2 : outlet.kind === 'broadcaster' ? 3 : i % 4
    if (!first) {
      return [
        { headline: 'A quiet day in government', text: 'Nothing was decided today, which some readers will regard as the government at its best.' },
        { headline: 'Markets steady as ministers rest', text: 'Traders reported a calm day and attributed it to the absence of announcements.' },
        { headline: 'NOTHING HAPPENED (AGAIN)', text: 'We pay for this lot, you know.' },
        { headline: 'The day in brief', text: `${events[0]!.headline}. Elsewhere, the weather: ${weather}` },
      ][kind]!
    }
    const more = input.decisions.length > 1 ? ` It was one of ${input.decisions.length} decisions today.` : ''
    return [
      { headline: `${first.title}: the government decides`, text: `${first.result}${more} The division lists and the court's opinion are printed in full on page four.` },
      { headline: `Who pays for "${first.title}"?`, text: `${first.course}. ${first.changes[0] ? `The forecast says: ${first.changes[0]}.` : 'The costs were not set out.'} Business will want to see the small print.` },
      { headline: `${first.title.toUpperCase()}: WHAT THEY'VE DONE NOW`, text: `They've only gone and done it. ${first.result} Our readers will remember this at the ballot box.` },
      { headline: `Tonight: ${first.title}`, text: `The government has announced its decision. ${first.result} We will be speaking to all sides, in turn, at length.` },
    ][kind]!
  }).map((x, i) => ({ outlet: input.press[i]!.name, ...x }))
  const mood = supportOf(input.brief.standing)
  const opinion =
    mood >= 60 ? 'The government is in favour, for now, and the pubs are saying so.' : mood >= 45 ? 'Opinion is divided, mostly along the usual lines, with the usual exceptions.' : 'The country is in a mood. Ministers are advised to avoid public transport.'
  const out: TaskOutput['world.day'] = {
    weather,
    events,
    reaction: first ? `The country spent the evening arguing about ${first.title.toLowerCase()}, and about the weather, in roughly equal measure.` : 'A quiet day. People talked about the weather and, in the case of the papers, about the absence of news.',
    press,
    opinion,
    matters: [],
    effects: [],
    almanac: '',
  }
  if (first && rng() < 0.5) {
    const approve = between(rng, 25, 60)
    const against = between(rng, 20, 100 - approve - 5)
    out.poll = { question: `Do you approve of the decision on ${first.title}?`, results: { approve, disapprove: against, 'do not know': 100 - approve - against } }
  }
  if (rng() < 0.3) {
    out.matters.push({ to: 'the Founder', text: `A citizen of ${input.brief.nation.capital} writes to ask whether the Founder ${first ? `approves of the decision on ${first.title}` : 'intends to say anything at all this week'}, and would be grateful for an answer in the Founder's own words.` })
  }
  out.almanac = [
    `## ${input.brief.date}`,
    '',
    `**Weather.** ${weather}`,
    '',
    ...events.flatMap((e) => [`**${e.headline}.** ${e.text}`, '']),
    `**The reaction.** ${out.reaction}`,
    '',
    '### The press',
    '',
    ...press.flatMap((p) => [`**${p.outlet}:** ${p.headline}. ${p.text}`, '']),
    `**Opinion.** ${opinion}`,
    ...(out.poll ? ['', `**Poll.** ${out.poll.question} ${Object.entries(out.poll.results).map(([k, v]) => `${k} ${v}%`).join(', ')}.`] : []),
  ].join('\n')
  return out
}

const GIVEN = ['Agnes', 'Bertram', 'Clemency', 'Dorian', 'Euphemia', 'Fergus', 'Hester', 'Ivo', 'Jocasta', 'Lionel', 'Maud', 'Percival', 'Rosamund', 'Silas', 'Winifred']
const FAMILY = ['Applegarth', 'Bramble', 'Crump', 'Dewhurst', 'Fenwick', 'Gosling', 'Hobday', 'Larkin', 'Mossop', 'Pocklington', 'Quarrie', 'Thistlewood', 'Underhill', 'Wetherby']
const LETTERS = [
  { text: 'I have lived on the same street for forty years and the bins have never once been collected on the day the council says. I do not expect the Founder to collect them. I do expect somebody to say which day it is.', draft: 'Thank you for your letter. The matter has been passed to the ministry responsible, with a request that it write to you with the day, and keep to it.' },
  { text: 'My granddaughter asks whether the Founder ever sleeps. I said I would find out.', draft: 'Thank you. You may tell your granddaughter that the Founder keeps sensible hours and recommends the same to everyone.' },
  { text: 'I write to complain about the decision this week, which nobody in our village wanted, and to say that we will remember it.', draft: 'Thank you for writing. Your letter has been read, and the reasons for the decision are published in full in the record, where you are welcome to find them wanting.' },
  { text: 'Our school roof leaks in three places, and the fourth bucket has been stolen. Please could somebody send a bucket.', draft: 'Thank you. The ministry has been asked to send a surveyor, and in the meantime a bucket.' },
  { text: 'I am ninety-one and have voted in every election. I would like to know why the forms are now longer than I am.', draft: 'Thank you for your letter and for every vote. The length of the forms has been raised with the office responsible for them, which has promised a shorter form explaining why.' },
]

function letters(input: TaskInput['letters.draft'], seed: number): TaskOutput['letters.draft'] {
  const rng = rngFor(seed, input.brief.day, 'letters')
  const n = Math.max(1, Math.min(input.count, 5))
  const pool = [...LETTERS]
  return {
    letters: Array.from({ length: n }, () => {
      const l = pool.splice(Math.floor(rng() * pool.length), 1)[0] ?? LETTERS[0]!
      return { from: `${pick(rng, GIVEN)} ${pick(rng, FAMILY)}`, place: input.brief.nation.capital, text: l.text, urgent: rng() < 0.1, draft: l.draft }
    }),
  }
}

const BILLS = [
  { title: 'The Public Benches (Repair) Bill', summary: 'Repairs every public bench found wanting by a survey of those who sit on them.', effect: { indicator: 'living' as const, by: 1, why: 'Public benches were repaired.' } },
  { title: 'The Forms (Shortening) Bill', summary: 'Requires every official form to fit on two sides of paper.', effect: { indicator: 'administration' as const, by: 1, why: 'The forms got shorter.' } },
  { title: 'The Street Trees Bill', summary: 'Plants a tree in every street that has none, and forbids felling one without a reason in writing.', effect: { indicator: 'environment' as const, by: 1, why: 'Street trees were planted.' } },
  { title: 'The Libraries (Opening Hours) Bill', summary: 'Keeps every public library open until eight on weekdays.', effect: { indicator: 'education' as const, by: 1, why: 'Libraries opened later.' } },
  { title: 'The Ministerial Diaries (Publication) Bill', summary: 'Publishes each minister\'s meetings at the end of every month.', effect: { indicator: 'legitimacy' as const, by: 1, why: 'Ministers\' diaries were published.' } },
]

function billSitting(input: TaskInput['bill.sitting'], seed: number): TaskOutput['bill.sitting'] {
  const rng = rngFor(seed, input.brief.day, `bills:${input.body.id}`)
  const size = input.body.size
  const members = input.body.members.filter((m) => m.party)
  const mover = () => (members.length ? pick(rng, members).name : input.body.name)
  const division = (reading: string) => {
    const aye = Math.round(size * (0.5 + rng() * 0.3))
    const abstain = Math.min(size - aye, Math.round(size * rng() * 0.05))
    return { reading, aye, no: size - aye - abstain, abstain }
  }
  const out: TaskOutput['bill.sitting']['bills'] = []
  for (const bill of input.bills) {
    if (bill.stage === 'introduced') out.push({ number: bill.number, title: bill.title, moved: bill.moved, summary: bill.summary, stage: 'committee' })
    else if (bill.stage === 'committee') {
      const d = division('third reading')
      out.push({ number: bill.number, title: bill.title, moved: bill.moved, summary: bill.summary, stage: d.aye > size / 2 ? 'passed' : 'failed', division: d })
    }
  }
  const open = input.bills.filter((b) => b.stage === 'introduced' || b.stage === 'committee').length
  if (open < 3 && rng() < 0.5) {
    const taken = new Set(input.bills.map((b) => b.title))
    const fresh = BILLS.filter((b) => !taken.has(b.title))
    if (fresh.length) {
      const b = pick(rng, fresh)
      out.push({ title: b.title, moved: mover(), summary: b.summary, stage: 'introduced', effects: [b.effect] })
    }
  }
  const hansard = [
    `## ${input.body.name}: the order paper`,
    '',
    `*${input.brief.date}.*`,
    '',
    ...(out.length
      ? out.flatMap((b) => [
          `**${b.title}** (moved by ${b.moved}): ${b.stage === 'introduced' ? 'read a first time' : b.stage === 'committee' ? 'sent to committee' : b.stage === 'passed' ? 'passed' : 'defeated'}.${b.division ? ` Ayes ${b.division.aye}, noes ${b.division.no}, abstaining ${b.division.abstain}.` : ''} ${b.summary}`,
          '',
        ])
      : ['No business on the order paper. The House rose early, which it described as scrutiny.']),
  ].join('\n')
  return { bills: out, hansard }
}

function reply(input: TaskInput['exchange.reply'], seed: number): TaskOutput['exchange.reply'] {
  const rng = rngFor(seed, input.brief.day, `reply:${input.body.id}:${input.petition?.dilemma ?? ''}:${input.exchange.kind}`)
  if (input.body.kind === 'court' || input.body.kind === 'council') {
    const target = input.barred?.[0]
    if (target && target !== DISMISS && rng() < 0.35) {
      const text = `${input.body.name} has considered the ${input.exchange.kind} from ${input.exchange.from}. On the narrower reading put to it, the course can be carried out lawfully, and the court permits it on that reading, with a marker that it goes no further.`
      return { text, changes: [{ course: target, verdict: 'permitted' }], document: `## Reply of ${input.body.name}\n\n${text}` }
    }
    const text = `${input.body.name} has considered the ${input.exchange.kind} from ${input.exchange.from} with care and holds to its opinion. Wanting a course does not make it lawful.`
    return { text, document: `## Reply of ${input.body.name}\n\n${text}` }
  }
  const text = `${input.body.name} has received the ${input.exchange.kind} from ${input.exchange.from}, debated it, and holds to its recommendation.`
  return { text, document: `## ${input.body.name}: on the ${input.exchange.kind}\n\n${text}` }
}

function factbook(input: TaskInput['factbook.draft']): TaskOutput['factbook.draft'] {
  const n = input.brief.nation
  const body = [
    `${n.name} is a ${input.brief.form.name.toLowerCase()} whose capital is ${n.capital} and whose currency is the ${n.currency}.`,
    n.motto ? `Its motto is "${n.motto}".` : '',
    n.animal ? `Its national animal is the ${n.animal}.` : '',
    '',
    input.notes || `This entry on ${input.category} has yet to be written in full.`,
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n')
  return { title: input.title || `${n.name}: ${input.category}`, body }
}

export function standInWorld<T extends Task>(task: T, input: TaskInput[T], seed: number): TaskOutput[T] {
  switch (task as Task) {
    case 'world.day':
      return worldDay(input as TaskInput['world.day'], seed) as TaskOutput[T]
    case 'letters.draft':
      return letters(input as TaskInput['letters.draft'], seed) as TaskOutput[T]
    case 'bill.sitting':
      return billSitting(input as TaskInput['bill.sitting'], seed) as TaskOutput[T]
    case 'exchange.reply':
      return reply(input as TaskInput['exchange.reply'], seed) as TaskOutput[T]
    case 'factbook.draft':
      return factbook(input as TaskInput['factbook.draft']) as TaskOutput[T]
    case 'founding.institutions':
      return { bodies: [], canon: [], lore: [] } as unknown as TaskOutput[T]
    default:
      throw new Error(`no stand-in plays ${String(task)}`)
  }
}

