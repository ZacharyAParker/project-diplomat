// The forms of government as templates: which bodies each has, how big, and the rules that
// bind them (the table in docs/design/government.md). buildInstitutions seats a nation's
// government from a form, the pack's factions and portfolios, the engine's cabinet and a
// seed. amend changes it later, and anything that no longer matches a template is 'custom'.

import type { Content, GameState } from '@diplomat/engine'
import { charter } from './charter.ts'
import { amendmentText, articles, decisionParagraphs, FORM_NAMES, stateNameOf, type Frame } from './constitution.ts'
import {
  CHARACTERS,
  ELDER_PHILOSOPHIES,
  namer,
  OFFICER_CHARACTERS,
  PARTY_COLOURS,
  partyDescription,
  partyName,
  PHILOSOPHIES,
} from './people.ts'
import type { Amendment, Body, FormId, Institutions, Member, Party, Press, Right, Rules, Step } from './types.ts'
import { apportion, nationOf, pick, rngFor, shuffle, type Rng } from './util.ts'

export const FORMS: Record<FormId, { name: string; description: string; executive: string }> = {
  commonwealth: {
    name: 'Commonwealth',
    description:
      'An Assembly of 151 recommends, a High Court of seven may bar any course, and a Steward decides under written rules: bound by two-thirds of the Assembly, free to veto less with reasons. Claudetopia was one.',
    executive: 'The Steward',
  },
  presidential: {
    name: 'Presidential republic',
    description:
      'A Congress of 435 recommends and binds the President at two-thirds. A Supreme Court of nine may bar a course by five votes. The President may veto a lesser majority with reasons.',
    executive: 'The President',
  },
  'parliamentary-monarchy': {
    name: 'Parliamentary monarchy',
    description:
      'Parliament, 650 strong, decides each petition by majority. A Supreme Court of twelve may bar a course. The Crown signs what Parliament decides, and almost always does.',
    executive: 'The Prime Minister',
  },
  'direct-democracy': {
    name: 'Direct democracy',
    description:
      'The people vote on every petition, and the most votes wins. A Federal Council of seven advises and a Federal Court of five may strike a course off the ballot first.',
    executive: 'The President of the Federal Council',
  },
  'one-party': {
    name: 'One-party state',
    description:
      "The Party Congress of 2,000 recommends, the Politburo advises, and the General Secretary decides. The People's Court gives opinions nobody is obliged to follow.",
    executive: 'The General Secretary',
  },
  'absolute-monarchy': {
    name: 'Absolute monarchy',
    description: 'The Monarch decides. A Privy Council of nine advises. Nobody may bar anything, and nobody has tried for some time.',
    executive: 'The Monarch',
  },
  theocracy: {
    name: 'Theocracy',
    description:
      'A Council of twelve Elders may bar a course on doctrine. The Majlis of 290 recommends but never binds. The Supreme Leader decides.',
    executive: 'The Supreme Leader',
  },
  junta: {
    name: 'Military junta',
    description: 'The Council of Officers votes, and binds its Chairman at two-thirds. Nothing else binds, including, on occasion, the Council.',
    executive: 'The Chairman',
  },
  custom: {
    name: 'Custom',
    description: 'A constitution amended until it matches no template. It keeps whatever bodies and rules the amendments left.',
    executive: 'The executive',
  },
}

// What a government is built from. Taken from the engine at founding, or recovered from an
// existing government when it is amended into another form.
export interface Material {
  nation: string
  capital: string
  currency: string
  demonym: string
  factions: { id: string; name: string; description: string; weight: number }[]
  portfolios: { id: string; title: string; minister: string }[]
  names: { given: string[]; family: string[] }
}

type Spec = Omit<Body, 'parties' | 'members' | 'description'> & {
  description: string
  seats?: 'parties' | 'tendencies' | 'council'
  members: 'speaker' | 'justices' | 'elders' | 'officers' | 'council' | 'monarch' | 'none'
}

interface Template {
  specs: (m: Material) => Spec[]
  steps: (ministries: string[]) => Step[]
  rules: Omit<Rules, 'executive' | 'steps' | 'minorsThroughBodies'>
  ministryName: (area: string) => string
}

const advise = (ids: string[], stage = 1): Step[] => ids.map((body) => ({ body, role: 'advise', stage }))

const TEMPLATES: Record<Exclude<FormId, 'custom'>, Template> = {
  commonwealth: {
    specs: () => [
      { id: 'assembly', kind: 'legislature', name: 'The Commonwealth Assembly', shortName: 'the Assembly', size: 151, seats: 'parties', members: 'speaker', description: 'The legislature: 151 members in parties, elected by proportional representation. It debates each petition, takes the Ladder and divides.' },
      { id: 'court', kind: 'court', name: 'The High Court of the Charter', shortName: 'the Court', size: 7, members: 'justices', description: 'Seven justices who rule each course permitted or barred under the Charter. Barring takes four votes.' },
    ],
    steps: (ministries) => [
      { body: 'assembly', role: 'recommend', stage: 1, bindAt: 2 / 3, carryAt: 0.5 },
      { body: 'court', role: 'review', stage: 1, barVotes: 4, binding: true },
      ...advise(ministries),
    ],
    rules: { vetoWithReasons: true, reconciliation: true, exchanges: 3, dismissOnlyAtStandstill: true },
    ministryName: (area) => `The Ministry of ${area}`,
  },
  presidential: {
    specs: () => [
      { id: 'congress', kind: 'legislature', name: 'The Congress', shortName: 'Congress', size: 435, seats: 'parties', members: 'speaker', description: 'The legislature: 435 members. Two-thirds of the whole House binds the President.' },
      { id: 'court', kind: 'court', name: 'The Supreme Court', shortName: 'the Court', size: 9, members: 'justices', description: 'Nine justices. Five votes bar a course.' },
    ],
    steps: (ministries) => [
      { body: 'congress', role: 'recommend', stage: 1, bindAt: 2 / 3, carryAt: 0.5 },
      { body: 'court', role: 'review', stage: 1, barVotes: 5, binding: true },
      ...advise(ministries),
    ],
    rules: { vetoWithReasons: true, reconciliation: false, exchanges: 1, dismissOnlyAtStandstill: false },
    ministryName: (area) => `The Department of ${area}`,
  },
  'parliamentary-monarchy': {
    specs: () => [
      { id: 'parliament', kind: 'legislature', name: 'Parliament', shortName: 'Parliament', size: 650, seats: 'parties', members: 'speaker', description: 'The House of 650. Its majority decides each petition outright.' },
      { id: 'crown', kind: 'council', name: 'The Crown', shortName: 'the Crown', size: 1, members: 'monarch', description: 'The Monarch in council, who signs what Parliament decides.' },
      { id: 'court', kind: 'court', name: 'The Supreme Court', shortName: 'the Court', size: 12, members: 'justices', description: 'Twelve justices. Seven votes bar a course.' },
    ],
    steps: (ministries) => [
      { body: 'parliament', role: 'recommend', stage: 1, carryAt: 0.5, decisive: true },
      { body: 'court', role: 'review', stage: 1, barVotes: 7, binding: true },
      { body: 'crown', role: 'assent', stage: 2 },
      ...advise(ministries),
    ],
    rules: { vetoWithReasons: false, reconciliation: true, exchanges: 1, dismissOnlyAtStandstill: false },
    ministryName: (area) => `The Ministry of ${area}`,
  },
  'direct-democracy': {
    specs: () => [
      { id: 'people', kind: 'electorate', name: 'The People', shortName: 'the people', size: 1000, seats: 'council', members: 'none', description: 'Every adult citizen, voting on each petition. Counted here per thousand votes cast.' },
      { id: 'federal-council', kind: 'council', name: 'The Federal Council', shortName: 'the Council', size: 7, members: 'council', description: 'Seven councillors who advise on every petition and run the ministries between votes.' },
      { id: 'court', kind: 'court', name: 'The Federal Court', shortName: 'the Court', size: 5, members: 'justices', description: 'Five judges who may strike a course off the ballot. Three votes bar it.' },
    ],
    steps: (ministries) => [
      { body: 'federal-council', role: 'advise', stage: 1 },
      { body: 'court', role: 'review', stage: 1, barVotes: 3, binding: true },
      { body: 'people', role: 'recommend', stage: 2, carryAt: 0, decisive: true },
      ...advise(ministries),
    ],
    rules: { vetoWithReasons: false, reconciliation: false, exchanges: 0, dismissOnlyAtStandstill: false },
    ministryName: (area) => `The Federal Office of ${area}`,
  },
  'one-party': {
    specs: () => [
      { id: 'congress', kind: 'legislature', name: 'The Party Congress', shortName: 'the Congress', size: 2000, seats: 'tendencies', members: 'speaker', description: 'Two thousand delegates of the Party, in tendencies that are not factions, because factions are forbidden.' },
      { id: 'politburo', kind: 'council', name: 'The Politburo', shortName: 'the Politburo', size: 7, members: 'council', description: 'Seven members of the Party\'s leadership who advise the General Secretary.' },
      { id: 'court', kind: 'court', name: "The People's Court", shortName: 'the Court', size: 5, members: 'justices', description: 'Five judges whose opinions are published, studied and not binding.' },
    ],
    steps: (ministries) => [
      { body: 'court', role: 'review', stage: 1, barVotes: 3, binding: false },
      { body: 'congress', role: 'recommend', stage: 2, carryAt: 0.5 },
      { body: 'politburo', role: 'advise', stage: 2 },
      ...advise(ministries),
    ],
    rules: { vetoWithReasons: false, reconciliation: false, exchanges: 0, dismissOnlyAtStandstill: false },
    ministryName: (area) => `The People's Commissariat of ${area}`,
  },
  'absolute-monarchy': {
    specs: () => [
      { id: 'privy-council', kind: 'council', name: 'The Privy Council', shortName: 'the Privy Council', size: 9, members: 'council', description: 'Nine counsellors who advise the Monarch, in private, at length.' },
    ],
    steps: (ministries) => [{ body: 'privy-council', role: 'advise', stage: 1 }, ...advise(ministries)],
    rules: { vetoWithReasons: false, reconciliation: false, exchanges: 0, dismissOnlyAtStandstill: false },
    ministryName: (area) => `The Royal Office of ${area}`,
  },
  theocracy: {
    specs: () => [
      { id: 'majlis', kind: 'legislature', name: 'The Majlis', shortName: 'the Majlis', size: 290, seats: 'parties', members: 'speaker', description: 'The elected assembly of 290. It recommends; it never binds.' },
      { id: 'elders', kind: 'council', name: 'The Council of Elders', shortName: 'the Elders', size: 12, members: 'elders', description: 'Twelve Elders who may bar any course on doctrine, by seven votes.' },
    ],
    steps: (ministries) => [
      { body: 'majlis', role: 'recommend', stage: 1, carryAt: 0.5 },
      { body: 'elders', role: 'review', stage: 1, barVotes: 7, binding: true },
      ...advise(ministries),
    ],
    rules: { vetoWithReasons: false, reconciliation: false, exchanges: 1, dismissOnlyAtStandstill: false },
    ministryName: (area) => `The Ministry of ${area}`,
  },
  junta: {
    specs: () => [
      { id: 'officers', kind: 'council', name: 'The Council of Officers', shortName: 'the Council', size: 9, seats: 'council', members: 'officers', description: 'Nine officers of the armed services. Six votes bind the Chairman.' },
    ],
    steps: (ministries) => [{ body: 'officers', role: 'recommend', stage: 1, bindAt: 2 / 3, carryAt: 0.5 }, ...advise(ministries)],
    rules: { vetoWithReasons: false, reconciliation: false, exchanges: 0, dismissOnlyAtStandstill: false },
    ministryName: (area) => `The Directorate of ${area}`,
  },
}

export function materialFrom(state: GameState, content: Content): Material {
  return {
    nation: state.identity.name,
    capital: state.identity.capital,
    currency: state.identity.currency,
    demonym: state.identity.demonym,
    factions: content.factions.map((f) => {
      const live = state.factions[f.id]
      return { id: f.id, name: f.name, description: f.description, weight: (live?.clout ?? f.clout) * (0.5 + (live?.approval ?? 50) / 100) }
    }),
    portfolios: content.portfolios.map((p) => ({ id: p.id, title: p.title, minister: state.cabinet[p.id]?.name ?? '' })),
    names: { given: [...content.names.given], family: [...content.names.family] },
  }
}

// "Finance Minister" gives "Finance"; a title the pack wrote otherwise is used whole.
const areaOf = (title: string) => title.replace(/\s*(Minister|Secretary)\s*$/i, '').replace(/^Minister (of|for) /i, '') || title

const ROMAN = ['II', 'III', 'IV', 'V', 'VI', 'VII']

function seatParties(rng: Rng, spec: Spec, m: Material): Party[] {
  if (spec.seats === 'council') {
    const name = spec.kind === 'electorate' ? 'The voters' : spec.name
    return [{ id: spec.kind === 'electorate' ? 'voters' : spec.id, name, seats: spec.size, leader: '', description: spec.description, factions: m.factions.map((f) => f.id), colour: PARTY_COLOURS[7]! }]
  }
  // Factions are shuffled and dealt into parties of one to three, so each nation's
  // party system is its own but every faction has a home.
  const order = shuffle(rng, m.factions)
  const groups: (typeof order)[] = []
  while (order.length) {
    const size = Math.min(order.length, pick(rng, [1, 1, 2, 2, 2, 3]))
    groups.push(order.splice(0, size).sort((a, b) => b.weight - a.weight))
  }
  const seats = apportion(spec.size, groups.map((g) => g.reduce((s, f) => s + f.weight, 0)), 1)
  const colours = shuffle(rng, PARTY_COLOURS)
  return groups
    .map((g, i) => ({
      id: `p-${g[0]!.id}`,
      name: partyName(rng, g.map((f) => f.name), spec.seats === 'tendencies' ? 'tendency' : 'party'),
      seats: seats[i]!,
      leader: '',
      description: partyDescription(g.map((f) => f.name), g.map((f) => f.description)),
      factions: g.map((f) => f.id),
      colour: colours[i % colours.length]!,
    }))
    .sort((a, b) => b.seats - a.seats)
}

function seatMembers(rng: Rng, spec: Spec, parties: Party[], next: () => string): Member[] {
  const id = (n: number) => `${spec.id}-${n}`
  const character = () => pick(rng, CHARACTERS)
  switch (spec.members) {
    case 'none':
      return []
    case 'speaker': {
      const members: Member[] = [{ id: id(1), name: next(), party: parties[0]?.id ?? '', office: spec.seats === 'tendencies' ? 'Chair of the Congress' : 'Speaker', character: 'Keeps order, votes only to break a tie, and has by custom no opinions.' }]
      for (const party of parties) {
        const offices = ['Leader', 'Whip', undefined]
        for (const office of offices) {
          const m: Member = { id: id(members.length + 1), name: next(), party: party.id, character: character() }
          if (office) m.office = `${office} of ${party.name.replace(/^The /, 'the ')}`
          members.push(m)
        }
        party.leader = members[members.length - 3]!.name
      }
      return members
    }
    case 'justices':
    case 'elders': {
      const philosophies = shuffle(rng, spec.members === 'elders' ? ELDER_PHILOSOPHIES : PHILOSOPHIES)
      return Array.from({ length: spec.size }, (_, i) => {
        const m: Member = { id: id(i + 1), name: next(), party: '', character: character(), philosophy: philosophies[i % philosophies.length]! }
        if (i === 0) m.office = spec.members === 'elders' ? 'Chief Elder' : 'Chief Justice'
        return m
      })
    }
    case 'officers':
      return Array.from({ length: spec.size }, (_, i) => ({
        id: id(i + 1),
        name: `${pick(rng, ['General', 'Admiral', 'Air Marshal', 'Colonel', 'Brigadier'])} ${next()}`,
        party: spec.seats === 'council' ? spec.id : '',
        ...(i === 0 ? { office: 'Chairman of the Council' } : {}),
        character: OFFICER_CHARACTERS[i % OFFICER_CHARACTERS.length]!,
      }))
    case 'council':
      return Array.from({ length: spec.size }, (_, i) => ({
        id: id(i + 1),
        name: next(),
        party: '',
        ...(i === 0 ? { office: spec.id === 'politburo' ? 'General Secretary' : spec.id === 'privy-council' ? 'Lord President of the Council' : 'President of the Council' } : {}),
        character: character(),
      }))
    case 'monarch': {
      const name = next().split(' ')[0]!
      return [{ id: id(1), name: `${name} ${pick(rng, ROMAN)}`, party: '', office: 'The Monarch', character: 'Reigns, signs, opens things, and has views that are reported by people who were not there.' }]
    }
  }
}

function ministry(p: Material['portfolios'][number], name: (area: string) => string, rng: Rng): Body {
  // "Foreign Minister" names an adjective, not an area: the ministry is of Foreign Affairs.
  const raw = areaOf(p.title)
  const area = /^Foreign$/.test(raw) ? 'Foreign Affairs' : raw
  const of = /^(Interior|Treasury|Environment|Exchequer|Economy)$/.test(area) ? `the ${area}` : area
  return {
    id: `ministry-${p.id}`,
    kind: 'ministry',
    name: name(of),
    shortName: `the ${area} ministry`.replace('the The ', 'the '),
    size: 1,
    parties: [],
    members: [{ id: `ministry-${p.id}-1`, name: p.minister, party: '', office: p.title, character: pick(rng, CHARACTERS) }],
    portfolio: p.id,
    description: `Advises and costs every petition that touches ${area.toLowerCase()}. It never decides.`,
  }
}

function templateBodies(form: Exclude<FormId, 'custom'>, m: Material, rng: Rng, taken: string[]): Body[] {
  const t = TEMPLATES[form]
  const next = namer(rng, m.names, taken)
  const bodies = t.specs(m).map((spec): Body => {
    const parties = spec.seats ? seatParties(rng, spec, m) : []
    const members = seatMembers(rng, spec, parties, next)
    const { seats: _s, members: _m, ...body } = spec
    return { ...body, parties, members }
  })
  return [...bodies, ...m.portfolios.map((p) => ministry(p, t.ministryName, rng))]
}

function templateRules(form: Exclude<FormId, 'custom'>, bodies: Body[], holder: string): Rules {
  const t = TEMPLATES[form]
  const ministries = bodies.filter((b) => b.kind === 'ministry').map((b) => b.id)
  return { executive: { title: FORMS[form].executive, holder }, steps: t.steps(ministries), ...t.rules, minorsThroughBodies: false }
}

// The executive's first holder: the council member who leads it, where one does, or a
// fresh name. The Steward of a commonwealth is Claude, as Claudetopia's was.
function holderFor(form: Exclude<FormId, 'custom'>, bodies: Body[], rng: Rng, m: Material, taken: string[]): string {
  if (form === 'commonwealth') return 'Claude'
  if (form === 'junta') return bodies.find((b) => b.id === 'officers')?.members[0]?.name ?? 'the Chairman'
  if (form === 'one-party') return bodies.find((b) => b.id === 'politburo')?.members[0]?.name ?? 'the General Secretary'
  if (form === 'direct-democracy') return bodies.find((b) => b.id === 'federal-council')?.members[0]?.name ?? 'the President'
  const name = namer(rng, m.names, taken)()
  if (form === 'absolute-monarchy') return `${name.split(' ')[0]} ${pick(rng, ROMAN)}`
  return name
}

const PRESS: { line: string; kind: Press['kind']; names: string[] }[] = [
  { line: 'sober, of record; prints the division lists in full', kind: 'paper', names: ['The {capital} Chronicle', 'The {nation} Times', 'The {capital} Record'] },
  { line: 'sceptical, commercial; asks who pays and who profits', kind: 'paper', names: ['The {nation} Herald', 'The {capital} Courier', 'The {demonym} Ledger'] },
  { line: 'loud, populist, capital letters', kind: 'paper', names: ['The Daily {demonym}', 'The {capital} Sun', 'The {demonym} Clarion'] },
  { line: 'the national broadcaster, careful to the point of pain', kind: 'broadcaster', names: ['{nation} Broadcasting', '{nation} Wireless', 'The {demonym} Broadcasting Service'] },
]

export function pressFor(m: Pick<Material, 'nation' | 'capital' | 'demonym'>, rng: Rng): Press[] {
  return PRESS.map((p) => {
    const name = pick(rng, p.names).replace('{capital}', m.capital).replace('{nation}', m.nation).replace('{demonym}', m.demonym)
    return { id: name.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, line: p.line, kind: p.kind }
  })
}

function canonFor(i: Omit<Institutions, 'canon'>, m: Pick<Material, 'capital' | 'currency' | 'demonym'>): string[] {
  const c = i.constitution
  return [
    `${c.stateName} is governed under its Constitution, in force from day ${c.since}.`,
    `${i.founder.name}, the ${i.founder.title}, stands above every branch under Article 0.`,
    `The capital is ${m.capital}; the currency is the ${m.currency}; the people are ${m.demonym}.`,
    `The executive is ${c.rules.executive.title.replace(/^The /, 'the ')}, held by ${c.rules.executive.holder}.`,
    ...i.bodies.filter((b) => b.kind !== 'ministry').map((b) => `${b.name} has ${b.size} ${b.kind === 'court' ? 'justices' : b.kind === 'electorate' ? 'votes per thousand cast' : 'members'}.`),
    `The press: ${i.press.map((p) => p.name).join(', ')}.`,
  ]
}

function constitutionFor(form: FormId, m: Material, bodies: Body[], rules: Rules, founder: Institutions['founder'], since: number, rights?: Right[], formName?: string, stateName?: string) {
  const frame: Frame = { form, nation: m.nation, capital: m.capital, currency: m.currency, demonym: m.demonym, founder, bodies, rules }
  return {
    form,
    stateName: stateName ?? stateNameOf(form, m.nation),
    formName: formName ?? FORM_NAMES[form],
    since,
    articles: articles(frame),
    rights: rights ?? charter(m.nation, form === 'theocracy' ? 'doctrinal' : 'secular'),
    rules,
    amendment: amendmentText(frame),
  }
}

export function buildInstitutions(
  form: FormId,
  state: GameState,
  content: Content,
  opts: { founder: { name: string; title: string }; calendarStart: string; seed: number },
): Institutions {
  if (form === 'custom') throw new Error('a custom government is made by amendment, not founded')
  const m = materialFrom(state, content)
  const rng = rngFor(opts.seed, 0, `institutions:${form}`)
  const taken = [opts.founder.name, ...m.portfolios.map((p) => p.minister)]
  const bodies = templateBodies(form, m, rng, taken)
  const holder = holderFor(form, bodies, rng, m, [...taken, ...bodies.flatMap((b) => b.members.map((x) => x.name))])
  const rules = templateRules(form, bodies, holder)
  const base = {
    constitution: constitutionFor(form, m, bodies, rules, opts.founder, state.day),
    bodies,
    press: pressFor(m, rng),
    founder: { ...opts.founder },
    calendar: { start: opts.calendarStart },
  }
  return { ...base, canon: canonFor(base, m) }
}

// Recovers the material from a government already seated: names from its members, factions
// from its parties, portfolios from its ministries. Used when no engine state is to hand.
export function materialOf(i: Institutions): Material {
  const people = i.bodies.flatMap((b) => b.members.map((m) => m.name.replace(/^(General|Admiral|Air Marshal|Colonel|Brigadier) /, '').split(' ')))
  const given = [...new Set(people.map((p) => p[0]!).filter(Boolean))]
  const family = [...new Set(people.map((p) => p.at(-1)!).filter((n) => n && !/^[IVX]+$/.test(n)))]
  const parties = i.bodies.find((b) => b.kind === 'legislature')?.parties ?? []
  const seen = new Map<string, Material['factions'][number]>()
  for (const p of parties) {
    for (const f of p.factions) if (!seen.has(f)) seen.set(f, { id: f, name: `The ${f.charAt(0).toUpperCase()}${f.slice(1)}`, description: '', weight: p.seats / p.factions.length })
  }
  if (seen.size === 0) for (const f of i.bodies.flatMap((b) => b.parties.flatMap((p) => p.factions))) seen.set(f, { id: f, name: `The ${f.charAt(0).toUpperCase()}${f.slice(1)}`, description: '', weight: 1 })
  const capitalLine = i.canon.find((c) => c.startsWith('The capital is '))
  const [, capital = 'the capital', currency = 'currency', demonym = 'citizens'] = capitalLine?.match(/^The capital is (.+?); the currency is the (.+?); the people are (.+?)\.$/) ?? []
  return {
    nation: nationOf(i.constitution.stateName),
    capital,
    currency,
    demonym,
    factions: [...seen.values()],
    portfolios: i.bodies.filter((b) => b.kind === 'ministry').map((b) => ({ id: b.portfolio ?? b.id.replace(/^ministry-/, ''), title: b.members[0]?.office ?? b.name, minister: b.members[0]?.name ?? '' })),
    names: { given: given.length ? given : ['Ana'], family: family.length ? family : ['Novak'] },
  }
}

// A seated body carried into a new form: same members and parties, seats rescaled.
function carry(old: Body, fresh: Body): Body {
  if (old.kind !== fresh.kind) return fresh
  const parties = old.parties.length
    ? (() => {
        const seats = apportion(fresh.size, old.parties.map((p) => p.seats), 1)
        return old.parties.map((p, i) => ({ ...p, seats: seats[i]! }))
      })()
    : fresh.parties
  const members = old.kind === 'court' || old.kind === 'council' ? [...old.members.slice(0, fresh.size), ...fresh.members.slice(old.members.length)].slice(0, fresh.size) : old.members
  return { ...fresh, parties, members }
}

const shapeOf = (rules: Rules) => JSON.stringify({ ...rules, executive: rules.executive.title, steps: [...rules.steps].sort((a, b) => `${a.body}${a.role}`.localeCompare(`${b.body}${b.role}`)) })

// The template a government still matches, or 'custom'.
export function formOf(i: Pick<Institutions, 'bodies' | 'constitution'>): FormId {
  const ids = i.bodies.map((b) => `${b.id}:${b.kind}:${b.size}`).sort().join(',')
  for (const form of Object.keys(TEMPLATES) as Exclude<FormId, 'custom'>[]) {
    const m: Material = { nation: '', capital: '', currency: '', demonym: '', factions: [], names: { given: ['A'], family: ['B'] }, portfolios: i.bodies.filter((b) => b.kind === 'ministry').map((b) => ({ id: b.portfolio ?? '', title: '', minister: '' })) }
    const bodies = TEMPLATES[form].specs(m).map((s) => `${s.id}:${s.kind}:${s.size}`)
    const ministries = i.bodies.filter((b) => b.kind === 'ministry')
    const expected = [...bodies, ...ministries.map((b) => `${b.id}:ministry:1`)].sort().join(',')
    if (expected !== ids) continue
    const rules = templateRules(form, i.bodies, i.constitution.rules.executive.holder)
    rules.minorsThroughBodies = i.constitution.rules.minorsThroughBodies
    if (shapeOf(rules) === shapeOf(i.constitution.rules)) return form
  }
  return 'custom'
}

export function amend(institutions: Institutions, amendment: Amendment, day: number): Institutions {
  const old = structuredClone(institutions)
  const m = materialOf(old)
  let bodies = old.bodies
  let rules = old.constitution.rules
  if (amendment.form && amendment.form !== 'custom' && amendment.form !== old.constitution.form) {
    const form = amendment.form
    const rng = rngFor(day, day, `amend:${form}`)
    const taken = old.bodies.flatMap((b) => b.members.map((x) => x.name))
    const fresh = templateBodies(form, m, rng, taken)
    bodies = fresh.map((b) => {
      const was = old.bodies.find((o) => o.id === b.id)
      return was ? carry(was, b) : b
    })
    const holder = FORMS[form].executive === rules.executive.title ? rules.executive.holder : holderFor(form, bodies, rng, m, taken)
    rules = { ...templateRules(form, bodies, holder), minorsThroughBodies: rules.minorsThroughBodies }
  }
  if (amendment.rules) {
    rules = { ...rules, ...structuredClone(amendment.rules), executive: { ...rules.executive, ...amendment.rules.executive } }
  }
  const named = { bodies, constitution: { ...old.constitution, rules } }
  const form = amendment.form === 'custom' ? 'custom' : formOf(named)
  let rights = old.constitution.rights
  if (amendment.form && amendment.form !== old.constitution.form && form !== 'custom') {
    rights = charter(m.nation, form === 'theocracy' ? 'doctrinal' : 'secular')
  }
  if (amendment.rights?.remove) rights = rights.filter((r) => !amendment.rights!.remove!.includes(r.id))
  if (amendment.rights?.add) rights = [...rights.filter((r) => !amendment.rights!.add!.some((a) => a.id === r.id)), ...structuredClone(amendment.rights.add)]
  const keepName = form === 'custom'
  const constitution = constitutionFor(form, m, bodies, rules, old.founder, day, rights, keepName ? old.constitution.formName : undefined, keepName ? old.constitution.stateName : undefined)
  if (form === 'custom') {
    // A custom constitution keeps its own articles; only the decision rule is rewritten,
    // so it still says what the code does.
    const frame: Frame = { form, nation: m.nation, capital: m.capital, currency: m.currency, demonym: m.demonym, founder: old.founder, bodies, rules }
    const decision = { number: '', title: 'The decision', text: decisionParagraphs(frame).map((p, i) => `${i + 1}. ${p}`).join('\n') }
    constitution.articles = old.constitution.articles.map((a) => (a.title === 'The decision' ? { ...decision, number: a.number } : a))
  }
  for (const a of amendment.articles ?? []) {
    const at = constitution.articles.findIndex((x) => x.number === a.number)
    if (at >= 0) constitution.articles[at] = { ...a }
    else constitution.articles.push({ ...a })
  }
  const base = { ...old, bodies, constitution }
  return { ...base, canon: canonFor(base, m) }
}
