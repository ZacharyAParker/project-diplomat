// What the executive may do with a petition, worked out from what has been sat and ruled so
// far. This is "The executive's choice, in general" in docs/design/government.md, and it is
// never left to a model: the AI plays the bodies, and this file reads their votes.

import { countFor } from './constitution.ts'
import { DISMISS, type Body, type Course, type Division, type Docket, type Institutions, type Review, type Ruling, type Sitting, type Standing, type Step } from './types.ts'
import { capital, courseName, plural } from './util.ts'

// A share of the whole body, not of those present: 101 of 151 binds whoever stayed at home.
export function carried(division: Division, step: Step, size: number): boolean {
  if (step.carryAt === undefined) return division.aye > division.no
  return division.aye > step.carryAt * size
}

export function binding(division: Division, step: Step, size: number): boolean {
  if (!carried(division, step, size)) return false
  if (step.decisive) return true
  return step.bindAt !== undefined && division.aye >= countFor(step.bindAt, size)
}

// A court's verdict from its votes. Without a stated bar, a majority of those voting bars.
export function verdictOf(votes: Ruling['votes'], barVotes: number | undefined): Ruling['verdict'] {
  const bars = Object.values(votes).filter((v) => v === 'bar').length
  const needed = barVotes ?? Math.floor(Object.keys(votes).length / 2) + 1
  return bars >= needed ? 'barred' : 'permitted'
}

export const split = (votes: Ruling['votes']) => {
  const bars = Object.values(votes).filter((v) => v === 'bar').length
  return { bar: bars, permit: Object.keys(votes).length - bars }
}

// The body's latest word: a reply supersedes the first opinion, a reconciliation or
// exchange sitting supersedes the first sitting.
export const latestReview = (docket: Docket, body: string): Review | undefined => docket.reviews.filter((r) => r.body === body).at(-1)
export const latestSitting = (docket: Docket, body: string): Sitting | undefined => docket.sittings.filter((s) => s.body === body).at(-1)

const bodyOf = (institutions: Institutions, id: string): Body | undefined => institutions.bodies.find((b) => b.id === id)

// Courses barred by every binding review so far, and those a non-binding one advised against.
export function rulingsSoFar(docket: Docket, institutions: Institutions) {
  const barred = new Set<Course>()
  const advised = new Set<Course>()
  const reviews: { against: Ruling[]; name: string; step: Step; review: Review }[] = []
  for (const step of institutions.constitution.rules.steps.filter((s) => s.role === 'review')) {
    const review = latestReview(docket, step.body)
    if (!review) continue
    const name = bodyOf(institutions, step.body)?.name ?? step.body
    const against = review.rulings.filter((r) => r.course !== DISMISS && verdictOf(r.votes, step.barVotes) === 'barred')
    const into = step.binding === false ? advised : barred
    for (const r of against) into.add(r.course)
    reviews.push({ against, name, step, review })
  }
  return { barred, advised, reviews }
}

export function standing(docket: Docket, institutions: Institutions, options: Course[]): Standing {
  const rules = institutions.constitution.rules
  const courses = options.filter((c) => c !== DISMISS)
  const name = (c: Course) => courseName(c, courses)
  const exec = rules.executive.title.replace(/^The /, 'the ')
  const lines: string[] = []
  const { barred, advised, reviews } = rulingsSoFar(docket, institutions)

  for (const { against, name: body, step } of reviews) {
    if (against.length === 0) {
      lines.push(`${body} permitted every course.`)
      continue
    }
    const each = against.map((r) => {
      const s = split(r.votes)
      return `${name(r.course)} (${s.bar} to ${s.permit})`
    })
    lines.push(
      step.binding === false
        ? `${body} advised against ${list(each)}. Its opinion does not bind, and those courses stay open.`
        : `${body} barred ${list(each)}.`,
    )
  }

  const open = courses.filter((c) => !barred.has(c))
  const advisedAgainst = [...advised].filter((c) => courses.includes(c))
  const extra = advisedAgainst.length ? { advisedAgainst } : {}
  const barredList = courses.filter((c) => barred.has(c))
  if (courses.length > 0 && open.length === 0) {
    lines.push('Every option is barred, so the petition is at a standstill and is dismissed.')
    return { permitted: [DISMISS], barred: barredList, mustTake: DISMISS, standstill: true, explanation: lines.join(' '), ...extra }
  }

  const dismissOpen = !rules.dismissOnlyAtStandstill
  let mustTake: Course | undefined
  let vetoable: Course | undefined
  const recommends = rules.steps.filter((s) => s.role === 'recommend')
  const ordered = [...recommends.filter((s) => s.decisive), ...recommends.filter((s) => !s.decisive)]
  let sat = false
  for (const step of ordered) {
    const sitting = latestSitting(docket, step.body)
    if (!sitting) continue
    sat = true
    const body = bodyOf(institutions, step.body)
    const size = body?.size ?? 0
    const who = body?.name ?? step.body
    const fp = sitting.firstPreference
    const aye = sitting.division.aye
    const bind = step.bindAt === undefined ? undefined : countFor(step.bindAt, size)
    const by = `${aye} of ${size}`
    const again = sitting.kind === 'first' ? 'put' : 'sitting again, put'
    if (fp !== DISMISS && barred.has(fp)) {
      if (rules.reconciliation && sitting.kind === 'first') {
        lines.push(`${who} put ${name(fp)} first, but it is barred, so ${who.replace(/^The /, 'the ')} sits again to choose among the permitted courses.`)
      } else {
        lines.push(`${who} ${again} ${name(fp)} first, but it is barred and falls; ${exec} chooses among the permitted courses, having regard to its ranking.`)
      }
      continue
    }
    if (fp === DISMISS) {
      // Rejecting the sole permitted course counts once the body has sat knowing it is the only
      // one: on reconciliation, or at once where the rules hold no reconciliation.
      const knew = sitting.kind !== 'first' || !rules.reconciliation
      const rejects = knew && open.length === 1 && bind !== undefined && aye >= bind
      if (rules.dismissOnlyAtStandstill && rejects) {
        lines.push(`${who}, sitting again, rejected the only permitted course by ${by}, past the ${bind} that binds. That is a standstill, and the petition is dismissed.`)
        return { permitted: [DISMISS], barred: barredList, mustTake: DISMISS, standstill: true, explanation: lines.join(' '), ...extra }
      }
      if (!dismissOpen) {
        lines.push(`${who} ${again} dismissal first (${by}), but dismissal is open only at a standstill, so ${exec} must take one of the permitted courses.`)
        continue
      }
    }
    if (step.decisive) {
      if (carried(sitting.division, step, size)) {
        mustTake = fp
        lines.push(`${who} ${again} ${name(fp)} first and carried it by ${by}. Its vote is the decision.`)
        break
      }
      lines.push(`${who} put ${name(fp)} first with ${by}, short of carrying it, so its vote decides nothing.`)
      continue
    }
    if (binding(sitting.division, step, size)) {
      mustTake = fp
      lines.push(`${who} ${again} ${name(fp)} first and carried it by ${by}, past the ${bind} that binds, so ${exec} must take it.`)
      break
    }
    if (carried(sitting.division, step, size)) {
      if (rules.vetoWithReasons) {
        vetoable = fp
        lines.push(
          `${who} ${again} ${name(fp)} first and carried it by ${by}` +
            (bind === undefined ? '' : `, short of the ${bind} that binds`) +
            `. ${capital(exec)} may take it, or set it aside with written reasons for another permitted course.`,
        )
      } else {
        lines.push(`${who} ${again} ${name(fp)} first and carried it by ${by}. It is a recommendation, which ${exec} weighs and may decline.`)
      }
      break
    }
    lines.push(`${who} ranked ${name(fp)} first, but with only ${by} it did not carry. Its ranking is advice.`)
    break
  }

  if (mustTake && docket.assents.some((a) => !a.given)) {
    const refused = docket.assents.find((a) => !a.given)!
    lines.push(`${bodyOf(institutions, refused.body)?.name ?? refused.body} withheld assent, so the matter returns to ${exec}, who may take any permitted course.`)
    mustTake = undefined
  }
  if (!sat && recommends.length === 0) lines.push(`${capital(exec)} may take any permitted course.`)
  if (!mustTake && !dismissOpen && open.length > 0) lines.push('Dismissal is open only at a standstill.')

  const permitted = mustTake ? [mustTake] : [...open, ...(dismissOpen ? [DISMISS] : [])]
  return {
    permitted,
    barred: barredList,
    ...(mustTake ? { mustTake } : {}),
    ...(vetoable && !mustTake ? { vetoable } : {}),
    standstill: false,
    explanation: lines.join(' ') || `${capital(exec)} may take any permitted course.`,
    ...extra,
  }
}

const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

export interface NextSteps {
  stage: number
  steps: Step[]
  // 'first' for the steps of a stage, 'reconciliation' for a body that sits again among
  // the permitted courses, 'assent' for signing a decision already made.
  kind: 'first' | 'reconciliation' | 'assent'
}

// What to run next, or null when nothing is left before (or after) the decision.
// advisers narrows the advise steps to the bodies worth asking about this petition; a
// ministry that is not asked is not waited for.
export function nextSteps(
  docket: Docket,
  institutions: Institutions,
  kind: 'major' | 'minor',
  opts: { advisers?: string[] } = {},
): NextSteps | null {
  const rules = institutions.constitution.rules
  const minorAlone = kind === 'minor' && !rules.minorsThroughBodies
  const steps = rules.steps.filter(
    (s) => (!minorAlone || s.role === 'review') && (s.role !== 'advise' || !opts.advisers || opts.advisers.includes(s.body)),
  )
  const done = (s: Step) => {
    if (s.role === 'advise') return docket.advice.some((a) => a.body === s.body)
    if (s.role === 'recommend') return docket.sittings.some((x) => x.body === s.body)
    if (s.role === 'review') return docket.reviews.some((r) => r.body === s.body)
    if (s.role === 'assent') return docket.assents.some((a) => a.body === s.body)
    return true
  }
  const stages = [...new Set(steps.filter((s) => s.role !== 'assent' && s.role !== 'decide').map((s) => s.stage))].sort((a, b) => a - b)
  for (const stage of stages) {
    const pending = steps.filter((s) => s.stage === stage && s.role !== 'assent' && s.role !== 'decide' && !done(s))
    if (pending.length) return { stage, steps: pending, kind: 'first' }
  }
  if (minorAlone) return null
  if (rules.reconciliation) {
    const { barred } = rulingsSoFar(docket, institutions)
    const options = new Set(docket.reviews.flatMap((r) => r.rulings.map((x) => x.course)).filter((c) => c !== DISMISS))
    const anyOpen = [...options].some((c) => !barred.has(c))
    for (const step of steps.filter((s) => s.role === 'recommend')) {
      const last = latestSitting(docket, step.body)
      if (!last || last.kind !== 'first' || !anyOpen) continue
      // It sat beside the court, so it chose without knowing what would be barred. It sits
      // again if its choice was barred, or if it would sooner let the petition lie when that
      // is open only at a standstill: it must say so knowing what is left.
      const rejected = last.firstPreference === DISMISS && rules.dismissOnlyAtStandstill && barred.size > 0
      if (!barred.has(last.firstPreference) && !rejected) continue
      return { stage: step.stage, steps: [step], kind: 'reconciliation' }
    }
  }
  const decided = docket.decision !== undefined || docket.standing?.mustTake !== undefined
  const assents = steps.filter((s) => s.role === 'assent' && !done(s))
  if (decided && assents.length) return { stage: assents[0]!.stage, steps: assents, kind: 'assent' }
  return null
}

// Whether the executive may take a course. A Founder's Word overrides anything.
export function check(standing: Standing, course: Course, opts: { word?: string; veto?: string } = {}): { ok: true } | { ok: false; reason: string } {
  if (opts.word?.trim()) return { ok: true }
  const label = course === DISMISS ? 'Dismissal' : `The course "${course}"`
  if (standing.standstill) {
    return course === DISMISS ? { ok: true } : { ok: false, reason: `Every option is barred and the petition is at a standstill: it can only be dismissed. ${standing.explanation}` }
  }
  if (standing.barred.includes(course)) return { ok: false, reason: `${label} is barred. ${standing.explanation}` }
  if (standing.mustTake !== undefined && course !== standing.mustTake) {
    return { ok: false, reason: `The rules require the course "${standing.mustTake}". ${standing.explanation}` }
  }
  if (!standing.permitted.includes(course)) {
    return { ok: false, reason: `${label} is not open. ${standing.explanation}` }
  }
  if (standing.vetoable !== undefined && course !== standing.vetoable && !opts.veto?.trim()) {
    return { ok: false, reason: `Setting aside the carried recommendation ("${standing.vetoable}") needs written reasons. ${standing.explanation}` }
  }
  return { ok: true }
}

// The number of seats a step needs to bind, for the screens: "101 of 151".
export function thresholds(step: Step, size: number): { carry?: number; bind?: number } {
  return {
    ...(step.carryAt === undefined ? {} : { carry: Math.floor(step.carryAt * size) + 1 }),
    ...(step.bindAt === undefined ? {} : { bind: countFor(step.bindAt, size) }),
  }
}

export const describeDivision = (d: Division, size: number) => `${d.aye} aye, ${d.no} no, ${d.abstain} abstaining, of ${plural(size, 'member')}`
