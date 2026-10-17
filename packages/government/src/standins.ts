// The rules-based players: what sits when no AI is connected, and what takes over when the
// AI fails twice. They are plain and predictable on purpose. Parties vote for their
// factions, justices bar what the charter's tags and guards say to bar, ministries favour
// their own area. Everything is seeded, so a nation played without AI replays exactly.
// Their output passes validate.ts like anyone else's.

import { INDICATOR_INFO, type IndicatorId } from '@diplomat/engine'
import { hits } from './charter.ts'
import { verdictOf } from './rules.ts'
import { standInWorld } from './standins-world.ts'
import { DISMISS, type Body, type Course, type Member, type Party, type PetitionBrief, type Right, type Task, type TaskInput, type TaskOutput } from './types.ts'
import { apportion, pick, rngFor, type Rng } from './util.ts'

type Option = PetitionBrief['options'][number]

const optionsOf = (p: PetitionBrief) => p.options.filter((o) => o.course !== DISMISS)
const coursesOf = (p: PetitionBrief) => {
  const cs = p.options.map((o) => o.course)
  return cs.includes(DISMISS) ? cs : [...cs, DISMISS]
}
const label = (p: PetitionBrief, c: Course) => (c === DISMISS ? 'dismissal' : `Option ${p.options.find((o) => o.course === c)?.number ?? c}`)

// How good an option is for the people who care about everything at once: each indicator
// counts its own way (debt and inequality falling is good), legitimacy a little extra.
export function generalScore(o: Option | undefined): number {
  if (!o || o.course === DISMISS) return 0
  return (o.indicators ?? []).reduce((s, x) => {
    const sign = INDICATOR_INFO[x.indicator]?.lowerIsBetter ? -1 : 1
    return s + sign * x.by * (x.indicator === 'legitimacy' ? 1 : 0.5)
  }, 0)
}

// A party's view of an option: its factions' gains, most important first, plus a little
// regard for the country at large. Dismissal sits just below an option nobody minds,
// because the House is there to choose a solution.
export function partyScore(party: Pick<Party, 'factions'>, o: Option | undefined): number {
  if (!o) return 0
  if (o.course === DISMISS) return -1.5
  const weights = [1, 0.6, 0.4, 0.3]
  const own = party.factions.reduce((s, f, i) => s + (weights[i] ?? 0.2) * (o.effects ?? []).filter((e) => e.faction === f).reduce((a, e) => a + e.by, 0), 0)
  return own + 0.3 * generalScore(o)
}

function rankFor(rng: Rng, p: PetitionBrief, score: (o: Option | undefined) => number): Course[] {
  const courses = coursesOf(p)
  const noisy = new Map(courses.map((c) => [c, score(p.options.find((o) => o.course === c) ?? { course: DISMISS } as Option) + rng() * 0.6]))
  return [...courses].sort((a, b) => noisy.get(b)! - noisy.get(a)!)
}

const speakerOf = (body: Body) => body.members.find((m) => /speaker|chair/i.test(m.office ?? '')) ?? body.members[0]
const leaderOf = (body: Body, party: Party): string => party.leader || body.members.find((m) => m.party === party.id)?.name || `a member of ${party.name}`

function partyLine(rng: Rng, p: PetitionBrief, c: Course, score: number, kind: string): string {
  const name = label(p, c)
  if (c === DISMISS) {
    return pick(rng, [
      'Every course on this paper is worse than doing nothing, and we will say so in the record. Let it lie.',
      'We have read the options twice, the second time in hope. Let the matter rest.',
    ])
  }
  if (kind === 'reconciliation') {
    return pick(rng, [
      `The Court has spoken. We need not like it. Of what is left, ${name}.`,
      `We are choosing among what the law allows, which is a smaller room than we wanted. ${name}.`,
    ])
  }
  if (score > 2) {
    return pick(rng, [
      `We support ${name}. For once the people we speak for and the paper in front of us agree.`,
      `${name}, and without apology. It does what our members sent us here to do.`,
      `There is a good course on this order paper, which is rare enough to mention. It is ${name}.`,
    ])
  }
  if (score < -1) {
    return pick(rng, [
      `None of this is good. ${name} is merely the least bad, and the House should record that it knows the difference.`,
      `We will vote for ${name} with our eyes open and our noses held.`,
    ])
  }
  return pick(rng, [
    `${name} is the sensible course, which is not the same as a popular one.`,
    `We lean to ${name}, on balance, having weighed it against the others and found them lighter.`,
    `${name}. We have amendments to it in our heads, if not on paper.`,
  ])
}

function sitLegislature(input: TaskInput['legislature.sitting'], seed: number): TaskOutput['legislature.sitting'] {
  const { body, petition: p } = input
  const rng = rngFor(seed, input.brief.day, `sit:${body.id}:${p.dilemma}:${input.kind}`)
  const courses = coursesOf(p)
  const allowed = new Set<Course>([...(input.permitted ?? courses), DISMISS])
  const ladders = new Map(body.parties.map((party) => [party.id, rankFor(rng, p, (o) => partyScore(party, o))]))

  // The House's ladder is a Borda count weighted by seats, with what the law allows first.
  const points = new Map(courses.map((c) => [c, 0]))
  for (const party of body.parties) {
    const l = ladders.get(party.id)!
    l.forEach((c, i) => points.set(c, points.get(c)! + (courses.length - 1 - i) * party.seats))
  }
  const borda = [...courses].sort((a, b) => points.get(b)! - points.get(a)! || courses.indexOf(a) - courses.indexOf(b))
  const ladder = [...borda.filter((c) => allowed.has(c)), ...borda.filter((c) => !allowed.has(c))]
  const fp = ladder[0]!

  const byParty: Record<string, { aye: number; no: number; abstain: number }> = {}
  for (const party of body.parties) {
    const l = ladders.get(party.id)!.filter((c) => allowed.has(c))
    const rank = l.indexOf(fp)
    const single = body.parties.length === 1
    const share = rank === 0 ? (single ? 0.55 + rng() * 0.45 : 0.88 + rng() * 0.12) : rank === 1 ? 0.35 + rng() * 0.35 : 0.03 + rng() * 0.17
    const aye = Math.min(party.seats, Math.round(party.seats * share))
    const abstain = Math.min(party.seats - aye, Math.round(party.seats * rng() * 0.05))
    byParty[party.id] = { aye, no: party.seats - aye - abstain, abstain }
  }
  const division = {
    aye: Object.values(byParty).reduce((s, x) => s + x.aye, 0),
    no: Object.values(byParty).reduce((s, x) => s + x.no, 0),
    abstain: Object.values(byParty).reduce((s, x) => s + x.abstain, 0),
    byParty,
  }

  const chair = speakerOf(body)
  const heading = input.kind === 'first' ? 'sitting' : input.kind === 'reconciliation' ? 'reconciliation sitting' : 'sitting on the exchange'
  const lines = [
    `## ${body.name}: ${p.number ? `Petition #${p.number}, ` : ''}${p.title}: ${heading}`,
    '',
    `*${input.brief.date}. ${chair ? `${chair.name} in the chair` : 'The House in session'}. ${body.size} members.*`,
    '',
    `${p.number ? 'The petition is read' : 'The motion is read'}: ${p.description}`,
    '',
  ]
  if (input.review) lines.push(`The opinion of the court is read. ${input.review.summary}`, '')
  for (const a of input.advice.slice(0, 2)) lines.push(`The advice of ${a.body} is laid before the House: ${a.summary}`, '')
  for (const party of body.parties) {
    const top = ladders.get(party.id)!.filter((c) => allowed.has(c))[0]!
    const score = partyScore(party, p.options.find((o) => o.course === top))
    lines.push(`**${leaderOf(body, party)}** (${party.name}): "${partyLine(rng, p, top, score, input.kind)}"`, '')
  }
  const rebel = body.members.filter((m) => m.party && m !== chair && !body.parties.some((x) => x.leader === m.name))
  if (rebel.length && rng() < 0.6) {
    const m = pick(rng, rebel)
    lines.push(`**${m.name}** breaks with the front bench of ${body.parties.find((x) => x.id === m.party)?.name ?? 'the party'}: "I have read the forecast, which is more than the whips have. I will not vote for ${label(p, fp)} without saying what it costs."`, '')
  }
  lines.push('### The Ladder', '', '| Rank | Course |', '|---|---|')
  ladder.forEach((c, i) => lines.push(`| ${i + 1} | ${label(p, c)} |`))
  lines.push('', `### The division on ${label(p, fp)}`, '', '| Party | Aye | No | Abstain |', '|---|---|---|---|')
  for (const party of body.parties) {
    const r = byParty[party.id]!
    lines.push(`| ${party.name} | ${r.aye} | ${r.no} | ${r.abstain} |`)
  }
  lines.push(`| **Total** | **${division.aye}** | **${division.no}** | **${division.abstain}** |`, '')

  const out: TaskOutput['legislature.sitting'] = { debate: lines.join('\n'), ladder, division }
  if (input.kind === 'reconciliation' && input.review && rng() < 0.35) {
    out.remonstrance = `${body.name} asks the court to reconsider its barring, and in the alternative to say whether the barred course would be lawful if carried out in the narrowest way its words allow. The House divided on the motion and carried it.`
  } else if (rng() < 0.1) {
    out.address = `${body.name} presses the executive to take ${label(p, fp)}, and asks that any decision against it be explained to the House in writing.`
  }
  return out
}

// How readily a justice bars: the severity an option must reach. Read from their
// philosophy where it says; otherwise from where they sit on the bench.
export function threshold(member: Member, index: number): number {
  const ph = (member.philosophy ?? '').toLowerCase()
  const table: [RegExp, number][] = [
    [/deferential/, 6],
    [/minimalist|reformer/, 5],
    [/textualist|proceduralist/, 4.5],
    [/pragmatist|mystic/, 4],
    [/historian|old school|custom/, 3.5],
    [/purposive|literalist/, 3],
    [/maximalist/, 2],
  ]
  for (const [re, n] of table) if (re.test(ph)) return n
  return 3 + (index % 4) * 0.75
}

interface Assessment {
  option: Option
  severity: number
  absolute: boolean
  articles: string[]
  guards: string[]
}

const fall = (o: Option, indicator: IndicatorId) => -Math.min(0, (o.indicators ?? []).filter((x) => x.indicator === indicator).reduce((s, x) => s + x.by, 0))

export function assess(o: Option, rights: readonly Right[], dilemmaTags: readonly string[] = []): Assessment {
  const hit = rights.filter((r) => hits(r, o.tags, dilemmaTags).length > 0)
  const breaches = rights.flatMap((r) => r.guards.filter((g) => fall(o, g.indicator) > g.floor).map((g) => ({ r, g })))
  const absolute = hit.some((r) => r.absolute)
  const severity = absolute ? Infinity : hit.length * 2 + breaches.length * 3 + fall(o, 'liberty') / 2
  return {
    option: o,
    severity: hit.length === 0 && breaches.length === 0 ? 0 : severity,
    absolute,
    articles: [...new Set([...hit.map((r) => r.id), ...breaches.map((b) => b.r.id)])],
    guards: breaches.map((b) => `${INDICATOR_INFO[b.g.indicator].name.toLowerCase()} by more than ${b.g.floor}`),
  }
}

function rule(input: TaskInput['court.opinion'], seed: number): TaskOutput['court.opinion'] {
  const { body, petition: p } = input
  const rng = rngFor(seed, input.brief.day, `court:${body.id}:${p.dilemma}`)
  const members = body.members
  const assessed = optionsOf(p).map((o) => assess(o, input.rights, p.tags ?? []))
  const votesFor = (a: Assessment) =>
    Object.fromEntries(members.map((m, i) => [m.id, a.severity >= threshold(m, i) ? ('bar' as const) : ('permit' as const)]))
  const rulings = assessed.map((a) => ({ course: a.option.course, votes: votesFor(a), articles: a.articles, markers: [] as string[] }))

  // Read to save before you bar: if every option would fall, the least troubling one that
  // no absolute right forbids is permitted on its narrowest reading.
  if (rulings.length && rulings.every((r) => verdictOf(r.votes, input.barVotes) === 'barred')) {
    const saveable = assessed.filter((a) => !a.absolute).sort((a, b) => a.severity - b.severity)[0]
    if (saveable) {
      const r = rulings.find((x) => x.course === saveable.option.course)!
      const strictest = members.map((m, i) => ({ m, t: threshold(m, i) })).sort((a, b) => b.t - a.t)
      for (const { m } of strictest) {
        if (verdictOf(r.votes, input.barVotes) === 'permitted') break
        r.votes[m.id] = 'permit'
      }
      r.markers.push(`Permitted only on its narrowest fair reading, which the court has read to save rather than leave the state without a lawful course.`)
    }
  }
  for (const r of rulings) {
    const a = assessed.find((x) => x.option.course === r.course)!
    if (verdictOf(r.votes, input.barVotes) === 'permitted' && a.articles.length) {
      r.markers.push(`Permitted so far only as it is carried out within ${a.articles.map((x) => `Article ${x}`).join(' and ')}${a.guards.length ? `, and goes no further than the forecast on ${a.guards.join(', ')}` : ''}.`)
    }
  }
  rulings.push({ course: DISMISS, votes: Object.fromEntries(members.map((m) => [m.id, 'permit' as const])), articles: [], markers: [] })

  const cautions: string[] = []
  const directions: string[] = []
  for (const r of rulings) {
    const a = assessed.find((x) => x.option.course === r.course)
    if (!a || verdictOf(r.votes, input.barVotes) === 'barred' || !a.articles.length) continue
    cautions.push(`${label(p, r.course)} comes close to ${a.articles.map((x) => `Article ${x}`).join(' and ')}. The court will look hard at how it is carried out.`)
    if (a.guards.length && rng() < 0.5) directions.push(`If ${label(p, r.course)} is taken, the executive shall report to the court within thirty days on how it is kept within ${a.articles.map((x) => `Article ${x}`).join(' and ')}.`)
  }

  const chief = members.find((m) => /chief/i.test(m.office ?? '')) ?? members[0]
  const lines = [
    `## ${body.name}: Petition #${p.number}, ${p.title}`,
    '',
    `*${input.brief.date}. Coram: ${members.map((m) => m.name).join(', ')}.*`,
    '',
    `**Headnote.** The court rules on each course as written and whole, and asks whether it is lawful, not whether it is wise. A course is barred by ${input.barVotes} votes of ${members.length}.`,
    '',
  ]
  for (const r of rulings.filter((x) => x.course !== DISMISS)) {
    const verdict = verdictOf(r.votes, input.barVotes)
    const side = members.filter((m) => (r.votes[m.id] === 'bar') === (verdict === 'barred'))
    const others = members.filter((m) => !side.includes(m))
    const author = side.includes(chief!) ? chief! : side[0]
    const o = p.options.find((x) => x.course === r.course)!
    lines.push(`### ${label(p, r.course)}: ${verdict === 'barred' ? 'Barred' : 'Permitted'} (${side.length} to ${others.length})`, '')
    if (author) {
      lines.push(
        verdict === 'barred'
          ? `${author.name}, for the majority: "${o.advocate.split(',')[0]} asks the state to do what ${r.articles.map((x) => `Article ${x}`).join(' and ') || 'the Charter'} forbids it to do. Wanting it does not make it lawful."`
          : r.articles.length
            ? `${author.name}, for the majority: "The course touches ${r.articles.map((x) => `Article ${x}`).join(' and ')}, but it can be carried out within it, and we read it so."`
            : `${author.name}, for the majority: "Nothing in the Charter is engaged. Whether it is wise is a question for others."`,
        '',
      )
    }
    if (others.length) {
      const d = others[0]!
      lines.push(`${d.name}${others.length > 1 ? `, with ${others.slice(1).map((m) => m.name).join(' and ')},` : ''} dissenting: "${verdict === 'barred' ? 'I would read it to save. The majority bars what a narrower reading permits.' : 'I would bar it. The majority reads it more kindly than its authors wrote it.'}"`, '')
    }
    for (const m of r.markers) lines.push(`*Marker:* ${m}`, '')
  }
  lines.push('**Dismissal** is permitted, as it always is.', '')
  if (rulings.filter((x) => x.course !== DISMISS).every((x) => verdictOf(x.votes, input.barVotes) === 'barred')) {
    lines.push('Every option is barred. The petition is at a standstill and must be dismissed.', '')
  }
  return { rulings, opinion: lines.join('\n'), cautions, directions }
}

function referendum(input: TaskInput['electorate.referendum'], seed: number): TaskOutput['electorate.referendum'] {
  const p = input.petition
  const rng = rngFor(seed, input.brief.day, `referendum:${p.dilemma}`)
  const courses = coursesOf(p)
  // Shares from the factions' gains and the country's: a softmax, so a popular option wins
  // big and a close one is close.
  const score = (c: Course) => {
    const o = p.options.find((x) => x.course === c)
    if (!o || c === DISMISS) return -2
    return (o.effects ?? []).reduce((s, e) => s + e.by, 0) * 0.5 + generalScore(o) + rng()
  }
  const weights = courses.map((c) => Math.exp(score(c) / 3))
  const shares = apportion(100, weights)
  const results = Object.fromEntries(courses.map((c, i) => [c, shares[i]!]))
  const turnout = Math.round((0.38 + rng() * 0.4) * 1000) / 1000
  const winner = courses[shares.indexOf(Math.max(...shares))]!
  const campaign = [
    `## The referendum on ${p.number ? `Petition #${p.number}: ` : ''}${p.title}`,
    '',
    `Turnout was ${Math.round(turnout * 100)} per cent. ${label(p, winner)} led from the first count.`,
    '',
    ...courses.map((c) => `- ${label(p, c)}: ${results[c]}%`),
    '',
    `The campaign was ${input.mood || 'conducted mostly on doorsteps and in the letters pages'}.`,
  ].join('\n')
  return { results, turnout, campaign }
}

const AREAS: [RegExp, Partial<Record<IndicatorId, number>>][] = [
  [/financ|treasur|budget/i, { fiscal: 1, debt: -1, capacity: 0.4 }],
  [/interior|home|justice|police/i, { administration: 1, legitimacy: 0.5, liberty: 0.3 }],
  [/foreign|trade/i, { legitimacy: 0.6, capacity: 0.4 }],
  [/health/i, { health: 1, living: 0.3 }],
  [/educat|learn|school|science/i, { education: 1 }],
  [/environment|land|weather|energy/i, { environment: 1 }],
  [/defen|guard|army/i, { legitimacy: 0.6, administration: 0.4 }],
  [/welfare|housing|labour|work/i, { living: 1, inequality: -0.6, employment: 0.4 }],
]

export function areaOf(body: Body): Partial<Record<IndicatorId, number>> {
  const key = `${body.portfolio ?? ''} ${body.name}`
  return AREAS.find(([re]) => re.test(key))?.[1] ?? { legitimacy: 0.5, administration: 0.5 }
}

function advise(input: TaskInput['ministry.advice'], seed: number): TaskOutput['ministry.advice'] {
  const { body, petition: p } = input
  const area = areaOf(body)
  const rng = rngFor(seed, input.brief.day, `advice:${body.id}:${p.dilemma}`)
  const scored = optionsOf(p).map((o) => ({ o, s: (o.indicators ?? []).reduce((t, x) => t + (area[x.indicator] ?? 0) * x.by, 0) + rng() * 0.1 }))
  scored.sort((a, b) => b.s - a.s)
  const best = scored[0]
  const favours = best && best.s > 0.2 ? best.o.course : undefined
  const minister = body.members[0]
  const fiscal = (best?.o.indicators ?? []).find((x) => x.indicator === 'fiscal')?.by ?? 0
  const currency = input.brief.nation.currency
  const costing = favours
    ? fiscal < 0
      ? `a cost of about ${(Math.abs(fiscal) * 0.4).toFixed(1)}bn ${currency}s a year`
      : fiscal > 0
        ? `a saving of about ${(fiscal * 0.4).toFixed(1)}bn ${currency}s a year`
        : 'no significant cost to the books'
    : undefined
  const summary = favours
    ? `${body.name} favours ${label(p, favours)}, as the course that does most for its area${costing ? `, at ${costing}` : ''}.`
    : `${body.name} has no preference: no course does its area any good worth the name.`
  const paper = [
    `## ${body.name}: advice on Petition #${p.number}, ${p.title}`,
    '',
    `*${input.brief.date}. ${minister ? `${minister.office ?? 'Minister'} ${minister.name}` : body.name}.*`,
    '',
    summary,
    '',
    ...scored.map(({ o, s }) => `- ${label(p, o.course)}: ${s > 0.2 ? 'helps' : s < -0.2 ? 'harms' : 'leaves alone'} the ministry's area. ${o.forecast[0] ?? ''}`),
    '',
    'The ministry advises and costs. It does not decide.',
  ].join('\n')
  return { ...(favours ? { favours } : {}), summary, ...(costing ? { costing } : {}), paper }
}

function decide(input: TaskInput['executive.decision'], seed: number): TaskOutput['executive.decision'] {
  const { standing: s, petition: p } = input
  const rng = rngFor(seed, input.brief.day, `executive:${p.dilemma}`)
  const permitted = s.permitted.length ? s.permitted : [DISMISS]
  const advised = new Set(s.advisedAgainst ?? [])
  const recommended = input.sittings.find((x) => x.ladder?.length)?.ladder?.[0]
  let course: Course
  let why: string
  if (s.mustTake) {
    course = s.mustTake
    why = s.standstill ? 'Every course is barred, so the petition is dismissed.' : 'The rules require this course, and it is taken.'
  } else if (recommended && permitted.includes(recommended)) {
    course = recommended
    why = 'It is the recommendation, and it is lawful. The executive sees no reason strong enough to set it aside.'
  } else {
    const options = permitted.filter((c) => c !== DISMISS)
    const ranked = (options.length ? options : permitted)
      .map((c) => {
        const o = p.options.find((x) => x.course === c)
        return { c, v: generalScore(o) + (o?.effects ?? []).reduce((t, e) => t + e.by, 0) * 0.3 - (advised.has(c) ? 3 : 0) + rng() * 0.1 }
      })
      .sort((a, b) => b.v - a.v)
    course = ranked[0]!.c
    why = 'Of the courses the rules leave open, this one does the country the most good and the least harm, on the forecast.'
  }
  const veto = s.vetoable && course !== s.vetoable ? { course: s.vetoable, reasons: `The recommendation is set aside. ${why}` } : undefined
  const papers = [
    `## The decision on Petition #${p.number}, ${p.title}`,
    '',
    `*${input.brief.date}. ${input.brief.form.executive}.*`,
    '',
    `**Decision:** ${label(p, course)}.`,
    '',
    `**Reasons:** ${why}`,
    '',
    `**The standing:** ${s.explanation}`,
    ...(veto ? ['', `**Veto:** ${label(p, veto.course)} is set aside, with these reasons: ${veto.reasons}`] : []),
  ].join('\n')
  return { course, reasons: why, ...(veto ? { veto } : {}), papers }
}

export function standIn<T extends Task>(task: T, input: TaskInput[T], seed: number): TaskOutput[T] {
  switch (task as Task) {
    case 'legislature.sitting':
      return sitLegislature(input as TaskInput['legislature.sitting'], seed) as TaskOutput[T]
    case 'court.opinion':
      return rule(input as TaskInput['court.opinion'], seed) as TaskOutput[T]
    case 'council.sitting': {
      const i = input as TaskInput['council.sitting']
      return ('rights' in i ? rule(i, seed) : sitLegislature(i, seed)) as TaskOutput[T]
    }
    case 'electorate.referendum':
      return referendum(input as TaskInput['electorate.referendum'], seed) as TaskOutput[T]
    case 'ministry.advice':
      return advise(input as TaskInput['ministry.advice'], seed) as TaskOutput[T]
    case 'executive.decision':
      return decide(input as TaskInput['executive.decision'], seed) as TaskOutput[T]
    default:
      return standInWorld(task, input, seed)
  }
}

