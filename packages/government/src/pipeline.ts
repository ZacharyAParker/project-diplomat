// How a petition moves through the bodies, and how the evening is written. Everything
// outside is injected: the caller runs the AI (with validation, the retry and the stand-in)
// and owns the Archive. Nothing here is mutated in place; each function returns new objects,
// and fileDocket and fileEvening fold them into a GovernmentState for the caller to save.

import { worldLines, type Content, type Effect, type GameState, type TimelineEntry } from '@diplomat/engine'
import { bound, spend } from './bounds.ts'
import { brief, mood, petitionBrief } from './briefs.ts'
import { binding, carried, check, latestReview, nextSteps, standing as standingOf, verdictOf } from './rules.ts'
import { areaOf, standIn } from './standins.ts'
import {
  DEFAULT_BOUNDS,
  DISMISS,
  type Advice,
  type ArchiveDocument,
  type Assent,
  type Bill,
  type Body,
  type Course,
  type Decision,
  type Docket,
  type Exchange,
  type GovernmentState,
  type Letter,
  type PetitionBrief,
  type Question,
  type Review,
  type Series,
  type Sitting,
  type Standing,
  type Step,
  type Task,
  type TaskInput,
  type TaskOutput,
  type WorldDay,
} from './types.ts'
import { courseName } from './util.ts'

export interface RecordQuery {
  dilemma?: string
  series?: Series
  body?: string
  tags?: string[]
  limit?: number
}

export interface Context {
  state: GameState
  gov: GovernmentState
  content: Content
  // Runs a task: the AI if it is on, validated and retried once, else the stand-in.
  run: <T extends Task>(task: T, input: TaskInput[T]) => Promise<{ output: TaskOutput[T]; ai: boolean }>
  // Writes a document to the Archive and returns its new id. The caller assigns id and date.
  write: (doc: Omit<ArchiveDocument, 'id' | 'date'>) => Promise<string>
  // Relevant record for a brief: titles and extracts, newest first.
  record: (query: RecordQuery) => Promise<{ id: string; title: string; extract: string }[]>
  progress: (line: string) => void
  archivePath?: string
}

const MAX_EXTRACT = 280
const MAX_ADVISERS = 2

const bodyOf = (ctx: Context, id: string): Body => {
  const body = ctx.gov.institutions.bodies.find((b) => b.id === id)
  if (!body) throw new Error(`the rules name a body ${id} that this government does not have`)
  return body
}

const dilemmaOf = (ctx: Context, id: string) => {
  const d = ctx.content.dilemmas.find((x) => x.id === id)
  if (!d) throw new Error(`no dilemma ${id} in the pack`)
  return d
}

const briefFor = async (ctx: Context, query: RecordQuery) => brief(ctx.state, ctx.gov, ctx.content, await ctx.record(query), ctx.archivePath)

const label = (p: PetitionBrief, c: Course) => courseName(c, p.options.map((o) => o.course))

export function openDocket(ctx: Context, dilemmaId: string): Docket {
  dilemmaOf(ctx, dilemmaId)
  return {
    dilemma: dilemmaId,
    day: ctx.state.day,
    number: ctx.gov.petitions + 1,
    status: 'waiting',
    advice: [],
    sittings: [],
    reviews: [],
    exchanges: [],
    assents: [],
    standing: null,
    progress: [],
    // The petition document is written whole when the docket is completed: the Archive
    // never edits a document, so its head waits for the decision.
    document: '',
  }
}

// The ministries worth asking: the ones whose area the options move most. Councils that
// advise are always asked.
export function advisersFor(ctx: Context, petition: PetitionBrief): string[] {
  const rules = ctx.gov.institutions.constitution.rules
  const advising = rules.steps.filter((s) => s.role === 'advise').map((s) => bodyOf(ctx, s.body))
  const councils = advising.filter((b) => b.kind !== 'ministry').map((b) => b.id)
  const scored = advising
    .filter((b) => b.kind === 'ministry')
    .map((b) => {
      const area = areaOf(b)
      const s = petition.options.reduce((t, o) => t + (o.indicators ?? []).reduce((u, x) => u + Math.abs((area[x.indicator] ?? 0) * x.by), 0), 0)
      return { id: b.id, s }
    })
    .sort((a, b) => b.s - a.s || a.id.localeCompare(b.id))
  const ministries = scored.filter((x) => x.s > 0).slice(0, MAX_ADVISERS).map((x) => x.id)
  if (ministries.length === 0 && scored[0]) ministries.push(scored[0].id)
  return [...councils, ...ministries]
}

function summariseSitting(s: Sitting, body: Body, p: PetitionBrief): string {
  return `${body.name} put ${label(p, s.firstPreference)} first (aye ${s.division.aye}, no ${s.division.no}, abstaining ${s.division.abstain}, of ${body.size}); ${s.binding ? 'binding' : s.carried ? 'carried' : 'not carried'}. Ladder: ${s.ladder.map((c) => label(p, c)).join(', ')}.`
}

function summariseReview(r: Review, body: Body, p: PetitionBrief, barVotes: number | undefined): string {
  return (
    `${body.name}: ` +
    r.rulings
      .filter((x) => x.course !== DISMISS)
      .map((x) => {
        const bars = Object.values(x.votes).filter((v) => v === 'bar').length
        return `${label(p, x.course)} ${verdictOf(x.votes, barVotes)} (${bars} to bar, ${Object.keys(x.votes).length - bars} to permit)${x.articles.length ? ` under ${x.articles.join(', ')}` : ''}`
      })
      .join('; ') +
    (r.binding ? '.' : '. The opinion does not bind.')
  )
}

const extract = (text: string) => text.replace(/\s+/g, ' ').slice(0, MAX_EXTRACT)

type Patch = (d: Docket) => Docket

async function advise(ctx: Context, d: Docket, step: Step, p: PetitionBrief): Promise<Patch> {
  const body = bodyOf(ctx, step.body)
  ctx.progress(`${body.name} is preparing its advice`)
  const { output, ai } = await ctx.run('ministry.advice', { brief: await briefFor(ctx, { dilemma: d.dilemma, body: body.id, limit: 6 }), body, petition: p })
  const document = await ctx.write({
    series: 'advice',
    title: `Petition #${d.number}, ${p.title}: advice of ${body.name}`,
    day: ctx.state.day,
    issuer: body.name,
    kind: 'advice',
    refs: [d.dilemma],
    body: output.paper + (ai ? '' : '\n\n*(Sat without the AI.)*'),
    data: { favours: output.favours ?? null, costing: output.costing ?? null },
  })
  const advice: Advice = { body: body.id, ...(output.favours ? { favours: output.favours } : {}), summary: output.summary, ...(output.costing ? { costing: output.costing } : {}), document, ai }
  return (x) => ({ ...x, advice: [...x.advice, advice], progress: [...x.progress, `${body.name} has advised`] })
}

function permittedSoFar(d: Docket, ctx: Context, p: PetitionBrief): Course[] | undefined {
  if (d.reviews.length === 0) return undefined
  const s = standingOf(d, ctx.gov.institutions, p.options.map((o) => o.course))
  return p.options.map((o) => o.course).filter((c) => c !== DISMISS && !s.barred.includes(c))
}

async function sit(ctx: Context, d: Docket, step: Step, kind: Sitting['kind'], p: PetitionBrief): Promise<Patch> {
  const body = bodyOf(ctx, step.body)
  const permitted = permittedSoFar(d, ctx, p)
  const lastReview = d.reviews.at(-1)
  const review = lastReview ? { document: lastReview.document, summary: summariseReview(lastReview, bodyOf(ctx, lastReview.body), p, ctx.gov.institutions.constitution.rules.steps.find((s) => s.body === lastReview.body && s.role === 'review')?.barVotes) } : undefined
  const sittingBrief = await briefFor(ctx, { dilemma: d.dilemma, body: body.id, series: 'hansard', limit: 8 })
  ctx.progress(kind === 'first' ? `${body.name} is sitting` : `${body.name} is sitting again`)
  let ladder: Course[]
  let division: Sitting['division']
  let extra: Pick<Sitting, 'remonstrance' | 'address' | 'canon'> = {}
  let text: string
  let ai: boolean
  if (body.kind === 'electorate') {
    // The people vote among what the law allows; a barred course is not on the ballot.
    const ballot = { ...p, options: p.options.filter((o) => !permitted || o.course === DISMISS || permitted.includes(o.course)) }
    const support = sittingBrief.standing.find((x) => x.startsWith('Support for the government')) ?? ''
    const run = await ctx.run('electorate.referendum', { brief: sittingBrief, petition: ballot, mood: `${support}. The country is ${mood(Number(support.match(/(\d+)\s*$/)?.[1] ?? 50))}.` })
    ai = run.ai
    const on = ballot.options.map((o) => o.course)
    const sorted = [...on].sort((a, b) => (run.output.results[b] ?? 0) - (run.output.results[a] ?? 0) || on.indexOf(a) - on.indexOf(b))
    ladder = [...sorted, ...p.options.map((o) => o.course).filter((c) => !on.includes(c))]
    const aye = Math.round(((run.output.results[ladder[0]!] ?? 0) / 100) * body.size)
    const party = body.parties[0]?.id ?? 'voters'
    division = { aye, no: body.size - aye, abstain: 0, byParty: { [party]: { aye, no: body.size - aye, abstain: 0 } } }
    text = `${run.output.campaign}\n\nTurnout: ${Math.round(run.output.turnout * 100)} per cent.`
  } else {
    const input: TaskInput['legislature.sitting'] = {
      brief: sittingBrief,
      body,
      petition: p,
      kind,
      step: { ...(step.bindAt === undefined ? {} : { bindAt: step.bindAt }), ...(step.carryAt === undefined ? {} : { carryAt: step.carryAt }), ...(step.decisive ? { decisive: true } : {}) },
      ...(permitted ? { permitted } : {}),
      ...(review && permitted ? { review } : {}),
      advice: d.advice.map((a) => ({ body: bodyOf(ctx, a.body).name, summary: a.summary })),
    }
    const run = body.kind === 'legislature' ? await ctx.run('legislature.sitting', input) : await ctx.run('council.sitting', input)
    ai = run.ai
    const out = run.output as TaskOutput['legislature.sitting']
    ladder = out.ladder
    division = out.division
    extra = { ...(out.remonstrance ? { remonstrance: out.remonstrance } : {}), ...(out.address ? { address: out.address } : {}) }
    text = out.debate
    if (out.canon?.length) extra = { ...extra, canon: out.canon }
  }
  const fp = ladder[0]!
  const isCarried = carried(division, step, body.size)
  const isBinding = binding(division, step, body.size)
  const document = await ctx.write({
    series: 'hansard',
    title: `Petition #${d.number}, ${p.title}: ${kind === 'first' ? 'first sitting' : kind === 'reconciliation' ? 'reconciliation sitting' : 'sitting on the exchange'}`,
    day: ctx.state.day,
    issuer: body.name,
    kind: body.kind === 'electorate' ? 'referendum' : 'sitting',
    refs: [d.dilemma, ...(review ? [review.document] : [])],
    body: text + (ai ? '' : '\n\n*(Sat without the AI.)*'),
    data: { kind, ladder, firstPreference: fp, division, carried: isCarried, binding: isBinding },
  })
  const sitting: Sitting = { body: body.id, kind, ladder, firstPreference: fp, division, carried: isCarried, binding: isBinding, ...extra, document, ai }
  return (x) => ({ ...x, sittings: [...x.sittings, sitting], progress: [...x.progress, `${body.name} has divided: ${label(p, fp)} first, ${division.aye} of ${body.size}`] })
}

async function review(ctx: Context, d: Docket, step: Step, p: PetitionBrief): Promise<Patch> {
  const body = bodyOf(ctx, step.body)
  const c = ctx.gov.institutions.constitution
  const barVotes = step.barVotes ?? Math.floor(body.size / 2) + 1
  ctx.progress(`${body.name} is in conference`)
  const input: TaskInput['court.opinion'] = {
    brief: await briefFor(ctx, { dilemma: d.dilemma, body: body.id, limit: 6 }),
    body,
    petition: p,
    rights: c.rights,
    articles: c.articles,
    precedents: await ctx.record({ series: 'court', tags: dilemmaOf(ctx, d.dilemma).tags, limit: 6 }),
    barVotes,
  }
  const run = body.kind === 'court' ? await ctx.run('court.opinion', input) : await ctx.run('council.sitting', input)
  const out = run.output as TaskOutput['court.opinion']
  const rulings = out.rulings.map((r) => ({ ...r, verdict: verdictOf(r.votes, barVotes) }))
  if (!rulings.some((r) => r.course === DISMISS)) {
    rulings.push({ course: DISMISS, votes: Object.fromEntries(body.members.map((m) => [m.id, 'permit' as const])), verdict: 'permitted', articles: [], markers: [] })
  }
  const document = await ctx.write({
    series: 'court',
    title: `Petition #${d.number}, ${p.title}: opinion of ${body.name}`,
    day: ctx.state.day,
    issuer: body.name,
    kind: 'opinion',
    refs: [d.dilemma, ...input.precedents.map((x) => x.id)],
    body: out.opinion + (run.ai ? '' : '\n\n*(Sat without the AI.)*'),
    data: { rulings, cautions: out.cautions, directions: out.directions },
  })
  const r: Review = { body: body.id, kind: 'first', rulings, binding: step.binding !== false, cautions: out.cautions, directions: out.directions, document, ai: run.ai, ...(out.canon?.length ? { canon: out.canon } : {}) }
  const barred = rulings.filter((x) => x.verdict === 'barred').length
  return (x) => ({ ...x, reviews: [...x.reviews, r], progress: [...x.progress, `${body.name} has ruled: ${barred ? `${barred} barred` : 'every course permitted'}`] })
}

async function assent(ctx: Context, d: Docket, steps: Step[], p: PetitionBrief, course: Course): Promise<Docket> {
  let out = d
  for (const step of steps) {
    const body = bodyOf(ctx, step.body)
    // A formality: the Crown signs, unless a court has said the course is unlawful.
    const against = d.reviews.some((r) => r.rulings.some((x) => x.course === course && x.verdict === 'barred'))
    const given = !against
    const signer = body.members[0]?.name ?? body.name
    const reasons = given
      ? `${signer} gives assent to ${label(p, course)}, as is the custom.`
      : `${signer} withholds assent to ${label(p, course)}, which a court has found unlawful, and returns the matter.`
    const document = await ctx.write({ series: 'papers', title: `Petition #${d.number}, ${p.title}: assent`, day: ctx.state.day, issuer: body.name, kind: 'assent', refs: [d.dilemma], body: reasons, data: { course, given } })
    const a: Assent = { body: body.id, given, reasons, document }
    out = { ...out, assents: [...out.assents, a], progress: [...out.progress, given ? `${body.name} has assented` : `${body.name} has withheld assent`] }
  }
  return out
}

// Courses a court barred that it could read down: none barred under a right that may not
// be limited at all.
// The stage a bill reaches at a sitting, as code reads it. A sitting may report a bill as
// introduced, in committee, passed or failed; it cannot sign it, return it or make it law.
// Passed needs a division carried at this sitting, failed one lost, or the bill stays put.
export function billStage(
  proposed: Bill['stage'],
  was: Bill['stage'],
  division?: { aye: number; no: number },
): Bill['stage'] {
  const want = proposed === 'signed' || proposed === 'law' ? 'passed' : proposed === 'returned' ? was : proposed
  if (want === 'passed') return division && division.aye > division.no ? 'passed' : division ? 'failed' : was
  if (want === 'failed') return division && division.aye <= division.no ? 'failed' : was
  return want
}

function readable(ctx: Context, r: Review): Course[] {
  const absolute = new Set(ctx.gov.institutions.constitution.rights.filter((x) => x.absolute).map((x) => x.id))
  return r.rulings.filter((x) => x.verdict === 'barred' && x.course !== DISMISS && !x.articles.some((a) => absolute.has(a))).map((x) => x.course)
}

async function exchanges(ctx: Context, input: Docket, p: PetitionBrief): Promise<Docket> {
  const rules = ctx.gov.institutions.constitution.rules
  let d = input
  const handled = new Set<string>()
  let used = 0
  const courses = p.options.map((o) => o.course)
  while (used < rules.exchanges) {
    const s = d.sittings.find((x) => (x.remonstrance || x.address) && !handled.has(x.document))
    if (!s) break
    handled.add(s.document)
    const from = bodyOf(ctx, s.body)
    if (s.address) {
      const e: Exchange = { from: s.body, to: 'executive', kind: 'address', text: s.address, document: s.document }
      d = { ...d, exchanges: [...d.exchanges, e], progress: [...d.progress, `${from.name} has sent an address to ${rules.executive.title.replace(/^The /, 'the ')}`] }
      used++
      if (!s.remonstrance || used >= rules.exchanges) continue
    }
    if (!s.remonstrance) continue
    const courtStep = rules.steps.find((x) => x.role === 'review')
    const last = courtStep && latestReview(d, courtStep.body)
    if (!courtStep || !last) continue
    const court = bodyOf(ctx, courtStep.body)
    d = { ...d, status: 'exchanging', exchanges: [...d.exchanges, { from: s.body, to: court.id, kind: 'remonstrance', text: s.remonstrance, document: s.document }] }
    used++
    ctx.progress(`${court.name} is considering a remonstrance from ${from.name}`)
    const { output, ai } = await ctx.run('exchange.reply', {
      brief: await briefFor(ctx, { dilemma: d.dilemma, body: court.id, series: 'court', limit: 6 }),
      body: court,
      exchange: { from: from.name, kind: 'remonstrance', text: s.remonstrance },
      petition: p,
      own: { document: last.document, summary: summariseReview(last, court, p, courtStep.barVotes) },
      barred: readable(ctx, last),
    })
    const document = await ctx.write({ series: 'court', title: `Petition #${d.number}, ${p.title}: reply of ${court.name}`, day: ctx.state.day, issuer: court.name, kind: 'reply', refs: [d.dilemma, last.document, s.document], body: output.document + (ai ? '' : '\n\n*(Sat without the AI.)*'), data: { changes: output.changes ?? [] } })
    d = { ...d, exchanges: [...d.exchanges, { from: court.id, to: s.body, kind: 'reply', text: output.text, document }] }
    const barVotes = courtStep.barVotes ?? Math.floor(court.size / 2) + 1
    // A changed verdict is carried into the votes, the strictest justices moving first, so
    // that the verdict worked out from them is the one the court gave.
    let changed = false
    // A reply answers a remonstrance against a barring, so the only change it can make is to
    // read a barred course down and permit it, and never one barred under an absolute right.
    // Whatever else the reply says it decided, code does not carry out.
    const open = new Set(readable(ctx, last))
    const rulings = last.rulings.map((r) => {
      const change = output.changes?.find(
        (x) => x.course === r.course && x.verdict === 'permitted' && r.verdict === 'barred' && open.has(r.course),
      )
      if (!change) return r
      changed = true
      const votes = { ...r.votes }
      const want = change.verdict === 'barred' ? 'bar' : 'permit'
      for (const id of Object.keys(votes)) {
        if (verdictOf(votes, barVotes) === change.verdict) break
        if (votes[id] !== want) votes[id] = want
      }
      return { ...r, votes, verdict: verdictOf(votes, barVotes), markers: change.verdict === 'permitted' ? [...r.markers, 'Permitted on the narrower reading put in the remonstrance, and no further.'] : r.markers }
    })
    if (!changed) continue
    d = { ...d, reviews: [...d.reviews, { ...last, kind: 'reply', rulings, cautions: [], directions: [], document, ai }] }
    d = { ...d, standing: standingOf(d, ctx.gov.institutions, courses) }
    const step = rules.steps.find((x) => x.body === s.body && x.role === 'recommend')
    if (step) d = (await sit(ctx, d, step, 'exchange', p))(d)
    d = { ...d, standing: standingOf(d, ctx.gov.institutions, courses) }
  }
  return d
}

export async function runDocket(ctx: Context, docket: Docket): Promise<Docket> {
  const inst = ctx.gov.institutions
  const { error: _error, ...rest } = structuredClone(docket)
  let d: Docket = { ...rest, status: 'sitting' }
  const dilemma = dilemmaOf(ctx, d.dilemma)
  const p = petitionBrief(ctx.state, ctx.content, d.dilemma, d.number)
  const courses = p.options.map((o) => o.course)
  const advisers = advisersFor(ctx, p)
  try {
    for (let guard = 0; guard < 16; guard++) {
      const next = nextSteps(d, inst, dilemma.kind, { advisers })
      if (!next || next.kind === 'assent') break
      if (next.kind === 'reconciliation') d = { ...d, status: 'reconciling' }
      const patches = await Promise.all(
        next.steps.map((step) =>
          step.role === 'advise'
            ? advise(ctx, d, step, p)
            : step.role === 'review'
              ? review(ctx, d, step, p)
              : sit(ctx, d, step, next.kind === 'reconciliation' ? 'reconciliation' : 'first', p),
        ),
      )
      for (const patch of patches) d = patch(d)
      d = { ...d, standing: standingOf(d, inst, courses) }
    }
    d = await exchanges(ctx, d, p)
    d = { ...d, standing: standingOf(d, inst, courses) }
    const next = nextSteps(d, inst, dilemma.kind, { advisers })
    if (next?.kind === 'assent' && d.standing?.mustTake) {
      d = await assent(ctx, d, next.steps, p, d.standing.mustTake)
      d = { ...d, standing: standingOf(d, inst, courses) }
    }
    d = { ...d, status: 'ready' }
    ctx.progress(`Petition #${d.number} is ready for decision`)
  } catch (error) {
    d = { ...d, status: 'failed', error: (error as Error).message }
  }
  return d
}

// A Decision for a course the rules allow, worked out the same way whoever chose it.
export function decisionFor(
  standing: Standing,
  ctx: Pick<Context, 'gov' | 'state'>,
  course: Course,
  opts: { reasons: string; veto?: { course: Course; reasons: string }; word?: string },
): Decision {
  const decisive = ctx.gov.institutions.constitution.rules.steps.some((s) => s.decisive)
  const by: Decision['by'] = opts.word ? 'word' : standing.standstill ? 'standstill' : decisive && standing.mustTake === course ? 'body' : 'executive'
  return { course, by, reasons: opts.reasons, ...(opts.veto ? { veto: opts.veto } : {}), ...(opts.word ? { word: opts.word } : {}), day: ctx.state.day }
}

export async function runExecutive(ctx: Context, docket: Docket): Promise<Decision> {
  const inst = ctx.gov.institutions
  const p = petitionBrief(ctx.state, ctx.content, docket.dilemma, docket.number)
  const standing = docket.standing ?? standingOf(docket, inst, p.options.map((o) => o.course))
  const barVotesOf = (body: string) => inst.constitution.rules.steps.find((s) => s.body === body && s.role === 'review')?.barVotes
  const input: TaskInput['executive.decision'] = {
    brief: await briefFor(ctx, { dilemma: docket.dilemma, series: 'papers', limit: 8 }),
    petition: p,
    standing,
    sittings: docket.sittings.map((s) => ({ body: bodyOf(ctx, s.body).name, summary: summariseSitting(s, bodyOf(ctx, s.body), p), ladder: s.ladder })),
    reviews: docket.reviews.map((r) => ({ body: bodyOf(ctx, r.body).name, summary: summariseReview(r, bodyOf(ctx, r.body), p, barVotesOf(r.body)) })),
    advice: docket.advice.map((a) => ({ body: bodyOf(ctx, a.body).name, summary: a.summary })),
    doctrine: '',
  }
  ctx.progress(`${inst.constitution.rules.executive.title} is deciding Petition #${docket.number}`)
  let { output, ai } = await ctx.run('executive.decision', input)
  let ok = check(standing, output.course, { ...(output.veto ? { veto: output.veto.reasons } : {}) })
  if (!ok.ok) {
    const again = await ctx.run('executive.decision', { ...input, doctrine: `Your last choice, "${output.course}", was refused: ${ok.reason} Choose again within the rules.` })
    output = again.output
    ai = again.ai
    ok = check(standing, output.course, { ...(output.veto ? { veto: output.veto.reasons } : {}) })
  }
  if (!ok.ok) {
    output = standIn('executive.decision', input, ctx.state.seed + docket.number)
    ai = false
  }
  const vetoReasons = output.veto?.reasons ?? (standing.vetoable && output.course !== standing.vetoable ? output.reasons : undefined)
  await ctx.write({
    series: 'papers',
    title: `Petition #${docket.number}, ${p.title}: the decision`,
    day: ctx.state.day,
    issuer: inst.constitution.rules.executive.title,
    kind: 'decision',
    refs: [docket.dilemma, ...docket.sittings.map((s) => s.document), ...docket.reviews.map((r) => r.document)],
    body: output.papers + (ai ? '' : '\n\n*(Decided without the AI.)*'),
    data: { course: output.course, veto: output.veto ?? null },
  })
  return decisionFor(standing, ctx, output.course, {
    reasons: output.reasons,
    ...(vetoReasons && standing.vetoable && output.course !== standing.vetoable ? { veto: { course: standing.vetoable, reasons: vetoReasons } } : {}),
  })
}

// What a Word that sets the rules aside costs. The country notices when its institutions
// are overruled: a ruling more than a vote.
export const WORD_COST_RULING = 2
export const WORD_COST_VOTE = 1

export function wordCost(standing: Standing, course: Course): Effect[] {
  const effects: Effect[] = []
  if (standing.standstill ? course !== DISMISS : standing.barred.includes(course)) {
    effects.push({ indicator: 'legitimacy', by: -WORD_COST_RULING, why: "The Founder's Word took a course the court had barred." })
  }
  if (!standing.standstill && standing.mustTake !== undefined && course !== standing.mustTake) {
    effects.push({ indicator: 'legitimacy', by: -WORD_COST_VOTE, why: "The Founder's Word set aside a binding vote." })
  }
  return effects
}

export async function completeDocket(ctx: Context, docket: Docket, decision: Decision, entry: TimelineEntry): Promise<Docket> {
  const inst = ctx.gov.institutions
  const p = petitionBrief(ctx.state, ctx.content, docket.dilemma, docket.number)
  let d = structuredClone(docket)
  const dilemma = dilemmaOf(ctx, d.dilemma)
  const next = nextSteps({ ...d, decision }, inst, dilemma.kind)
  if (next?.kind === 'assent') d = await assent(ctx, d, next.steps, p, decision.course)
  const name = (id: string) => inst.bodies.find((b) => b.id === id)?.name ?? id
  const barVotesOf = (body: string) => inst.constitution.rules.steps.find((s) => s.body === body && s.role === 'review')?.barVotes
  const lines = [
    `# Petition #${d.number}: ${p.title}`,
    '',
    p.description,
    '',
    '## The courses',
    '',
    ...p.options.flatMap((o) => [`**${label(p, o.course)}.** ${o.advocate}: "${o.speech}"`, '', ...o.forecast.map((f) => `- ${f}`), '']),
  ]
  if (d.advice.length) lines.push('## Advice', '', ...d.advice.map((a) => `- **${name(a.body)}:** ${a.summary}`), '')
  for (const s of d.sittings) lines.push(`## ${name(s.body)}: ${s.kind === 'first' ? 'sitting' : s.kind === 'reconciliation' ? 'reconciliation' : 'on the exchange'}`, '', summariseSitting(s, bodyOf(ctx, s.body), p), '')
  for (const r of d.reviews) lines.push(`## ${name(r.body)}: ${r.kind === 'first' ? 'opinion' : 'reply'}`, '', summariseReview(r, bodyOf(ctx, r.body), p, barVotesOf(r.body)), ...r.rulings.flatMap((x) => x.markers.map((m) => `- *Marker on ${label(p, x.course)}:* ${m}`)), '')
  if (d.exchanges.length) lines.push('## Exchanges', '', ...d.exchanges.map((e) => `- **${e.kind}**, ${name(e.from)} to ${e.to === 'executive' ? inst.constitution.rules.executive.title : name(e.to)}: ${extract(e.text)}`), '')
  for (const a of d.assents) lines.push(`## ${name(a.body)}`, '', a.reasons, '')
  if (d.standing) lines.push('## The standing', '', d.standing.explanation, '')
  lines.push('## The decision', '', `**${label(p, decision.course)}**, ${decision.by === 'word' ? "by the Founder's Word" : decision.by === 'body' ? 'by the vote of the body that decides' : decision.by === 'standstill' ? 'at a standstill' : `by ${inst.constitution.rules.executive.title.replace(/^The /, 'the ')}`}.`, '', decision.reasons, '')
  if (decision.veto) lines.push(`**Veto.** ${label(p, decision.veto.course)} was set aside: ${decision.veto.reasons}`, '')
  if (decision.word) lines.push(`**The Founder's Word.** ${decision.word}`, '')
  lines.push('## What it did', '', `**${entry.headline}.**${entry.text ? ` ${entry.text}` : ''}`, '', ...(entry.changes.length ? entry.changes.map((c) => `- ${c.kind} ${c.target} ${c.by > 0 ? '+' : ''}${c.by}: ${c.why}`) : ['Nothing measurable changed.']))
  const document = await ctx.write({
    series: 'petition',
    title: `Petition #${d.number}: ${p.title}`,
    day: ctx.state.day,
    issuer: inst.constitution.stateName,
    kind: 'petition',
    refs: [d.dilemma, ...d.advice.map((a) => a.document), ...d.sittings.map((s) => s.document), ...d.reviews.map((r) => r.document), ...d.assents.map((a) => a.document)],
    body: lines.join('\n'),
    data: { decision, standing: d.standing, changes: entry.changes },
  })
  return { ...d, status: 'decided', decision, document }
}

// Folds a docket into the government: stores it, keeps the petition count, and copies the
// reviews' directions and cautions into the register, once each.
export function fileDocket(gov: GovernmentState, docket: Docket): GovernmentState {
  const directions = [...gov.directions]
  for (const r of docket.reviews) {
    const from = gov.institutions.bodies.find((b) => b.id === r.body)?.name ?? r.body
    for (const text of [...r.directions, ...r.cautions.map((c) => `Caution: ${c}`)]) {
      if (!directions.some((x) => x.document === r.document && x.text === text)) directions.push({ day: docket.day, from, text, document: r.document, done: false })
    }
  }
  const canon = withCanon(gov.institutions.canon, [...docket.sittings, ...docket.reviews].flatMap((x) => x.canon ?? []))
  return {
    ...gov,
    dockets: { ...gov.dockets, [docket.dilemma]: structuredClone(docket) },
    petitions: Math.max(gov.petitions, docket.number),
    directions,
    ...(canon === gov.institutions.canon ? {} : { institutions: { ...gov.institutions, canon } }),
  }
}

// Facts a body or the world had to invent join the canon, so the next sitting does not
// contradict them. Each is one line, said once, and the canon is kept to a readable size:
// the oldest invented facts give way first, never the founding ones.
const CANON_LIMIT = 600
const CANON_EACH = 6
export function withCanon(canon: readonly string[], invented: readonly string[]): string[] {
  const fresh = [...new Set(invented.map((c) => c.replace(/\s+/g, ' ').trim()).filter((c) => c.length > 0 && c.length <= 300))]
    .filter((c) => !canon.includes(c))
    .slice(0, CANON_EACH)
  if (fresh.length === 0) return canon as string[]
  const next = [...canon, ...fresh]
  return next.length <= CANON_LIMIT ? next : next.slice(next.length - CANON_LIMIT)
}

export interface Evening {
  world: WorldDay
  effects: Effect[]
  questions: Question[]
  letters: Letter[]
  // New bills and bills that moved, in full.
  bills: Bill[]
}

const LETTER_EVERY = 3
const BILLS_EVERY = 4

const nextId = (prefix: string, ids: readonly string[]) => {
  const n = Math.max(0, ...ids.map((id) => Number(id.slice(prefix.length)) || 0)) + 1
  return `${prefix}${String(n).padStart(4, '0')}`
}

export async function runEvening(ctx: Context, todaysDecisions: TaskInput['world.day']['decisions']): Promise<Evening> {
  const { state, gov } = ctx
  const inst = gov.institutions
  const day = state.day
  ctx.progress('The world is writing the day')
  const b = await briefFor(ctx, { series: 'almanac', limit: 6 })
  const { output, ai } = await ctx.run('world.day', {
    brief: b,
    decisions: todaysDecisions,
    timeline: state.timeline.filter((e) => e.day === day).map((e) => e.headline),
    abroad: worldLines(state, ctx.content),
    press: inst.press,
    bounds: DEFAULT_BOUNDS,
  })
  const kept = bound(output.effects, DEFAULT_BOUNDS, {})
  const document = await ctx.write({
    series: 'almanac',
    title: `The almanac: ${b.date}`,
    day,
    issuer: 'The almanac',
    kind: 'day',
    refs: [],
    body: (output.almanac || `## ${b.date}\n\n${output.weather}`) + (ai ? '' : '\n\n*(Written without the AI.)*') + (kept.dropped.length ? `\n\n*Effects not applied: ${kept.dropped.join('; ')}.*` : ''),
    data: { weather: output.weather, events: output.events, press: output.press, poll: output.poll ?? null, matters: output.matters, effects: kept.effects },
  })
  const world: WorldDay = {
    day,
    weather: output.weather,
    events: output.events,
    reaction: output.reaction,
    press: output.press,
    opinion: output.opinion,
    ...(output.poll ? { poll: output.poll } : {}),
    matters: output.matters,
    effects: kept.effects,
    document,
    ai,
    ...(output.canon?.length ? { canon: output.canon } : {}),
  }

  const founder = inst.founder
  const toFounder = (to: string) => /founder/i.test(to) || to.includes(founder.name) || to.toLowerCase().includes(founder.title.toLowerCase())
  const questions: Question[] = []
  for (const m of output.matters.filter((x) => toFounder(x.to))) {
    const id = nextId('Q-', [...gov.questions, ...questions].map((q) => q.id))
    questions.push({ id, from: 'The almanac', kind: 'citizen', day, text: m.text, status: 'open', source: document })
  }

  const letters: Letter[] = []
  if (day % LETTER_EVERY === 0) {
    const run = await ctx.run('letters.draft', { brief: b, count: 2, recent: gov.letters.slice(-5).map((l) => extract(l.text)) })
    for (const l of run.output.letters) {
      const id = nextId('L-', [...gov.letters, ...letters].map((x) => x.id))
      await ctx.write({ series: 'letters', title: `Letter from ${l.from}`, day, issuer: l.from, kind: 'letter', refs: [], body: `${l.text}\n\n---\n\n*Draft reply:* ${l.draft}`, data: { id } })
      letters.push({ id, from: l.from, ...(l.place ? { place: l.place } : {}), day, text: l.text, urgent: l.urgent, draft: l.draft, status: 'unread' })
    }
  }

  const bills: Bill[] = []
  const legislature = inst.bodies.find((x) => x.kind === 'legislature')
  if (legislature && day % BILLS_EVERY === 0) {
    const open = gov.bills.filter((x) => x.stage === 'introduced' || x.stage === 'committee' || x.stage === 'passed')
    const run = await ctx.run('bill.sitting', { brief: b, body: legislature, bills: open, bounds: DEFAULT_BOUNDS })
    const hansard = await ctx.write({ series: 'hansard', title: `${legislature.name}: the order paper, ${b.date}`, day, issuer: legislature.name, kind: 'bills', refs: [], body: run.output.hansard + (run.ai ? '' : '\n\n*(Sat without the AI.)*'), data: { bills: run.output.bills } })
    let spent = spend({}, kept.effects)
    let number = Math.max(0, ...gov.bills.map((x) => x.number))
    for (const o of run.output.bills) {
      const division = o.division ? [{ day, ...o.division }] : []
      const was = o.number === undefined ? undefined : gov.bills.find((x) => x.number === o.number)
      const stage = billStage(o.stage, was?.stage ?? 'introduced', o.division)
      // A bill's effects are what it proposes until it passes; they are bounded, and count
      // against the day, only when it becomes law.
      const proposed = o.effects ?? was?.effects
      let effects = o.effects
      if (stage === 'passed' && proposed) {
        effects = bound(proposed, DEFAULT_BOUNDS, spent, { policies: ctx.content.policies }).effects
        spent = spend(spent, effects)
      }
      if (was) {
        bills.push({ ...structuredClone(was), stage, divisions: [...was.divisions, ...division], ...(effects ? { effects } : {}) })
      } else {
        number++
        bills.push({ number, title: o.title, body: legislature.id, moved: o.moved, summary: o.summary, stage, divisions: division, effects: effects ?? [], document: hansard })
      }
    }
    // A bill the House has passed is signed by the executive and becomes law. Code does
    // this, never the sitting: a model can say a bill passed only with a division to show it.
    for (const bill of bills) if (bill.stage === 'passed') bill.stage = 'law'
  }
  return { world, effects: kept.effects, questions, letters, bills }
}

// Folds an evening into the government.
export function fileEvening(gov: GovernmentState, evening: Evening): GovernmentState {
  const bills = [...gov.bills]
  for (const bill of evening.bills) {
    const at = bills.findIndex((x) => x.number === bill.number)
    if (at >= 0) bills[at] = bill
    else bills.push(bill)
  }
  return {
    ...gov,
    worldDays: gov.worldDays.includes(evening.world.day) ? gov.worldDays : [...gov.worldDays, evening.world.day],
    lastWorldDay: Math.max(gov.lastWorldDay, evening.world.day),
    institutions: { ...gov.institutions, canon: withCanon(gov.institutions.canon, evening.world.canon ?? []) },
    questions: [...gov.questions, ...evening.questions],
    letters: [...gov.letters, ...evening.letters],
    bills,
  }
}

// What the world is told about a decided docket.
export function decisionSummary(docket: Docket, entry: TimelineEntry, ctx: Pick<Context, 'state' | 'content'>): TaskInput['world.day']['decisions'][number] {
  const p = petitionBrief(ctx.state, ctx.content, docket.dilemma, docket.number)
  const course = docket.decision?.course ?? DISMISS
  const option = p.options.find((o) => o.course === course)
  return {
    title: p.title,
    course: course === DISMISS ? 'Dismissed' : `${label(p, course)}: ${option?.speech ?? course}`,
    result: entry.text ?? entry.headline,
    changes: entry.changes.map((c) => `${c.target} ${c.by > 0 ? 'up' : 'down'} ${Math.abs(c.by)}: ${c.why}`),
  }
}
