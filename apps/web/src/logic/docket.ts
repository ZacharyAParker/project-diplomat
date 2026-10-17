import type {
  Body,
  Course,
  Docket,
  GovernmentState,
  Review,
  Ruling,
  Sitting,
  Standing,
} from '@diplomat/government'
import { isActive } from './forms.ts'

// What the desk prints about a docket, and what the Accept buttons may do. The standing
// itself is worked out by the server (rules.ts); nothing here decides what the rules allow,
// it only reads the standing out in words and maps it onto the buttons.

export const DISMISS = 'dismiss'

export interface CourseOption {
  id: string
}

// "Option 2", or "Dismissal". Numbered as the desk numbers the positions.
export function courseLabel(course: Course, options: readonly CourseOption[]): string {
  if (course === DISMISS) return 'Dismissal'
  const at = options.findIndex((o) => o.id === course)
  return at < 0 ? `The course "${course}"` : `Option ${at + 1}`
}

export function bodyName(government: GovernmentState | null, id: string, short = false): string {
  const body = government?.institutions.bodies.find((b) => b.id === id)
  if (!body) return id
  return short ? body.shortName : body.name
}

export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export function executiveTitle(government: GovernmentState | null): string {
  return government?.institutions.constitution.rules.executive.title ?? 'The executive'
}

// What the Accept button under one course does.
//   accept     an ordinary Accept
//   veto       Accept asks first for written reasons for setting aside the carried course
//   word-only  Accept is off; only a Founder's Word can take this course
export type CourseAction = 'accept' | 'veto' | 'word-only'

export interface CourseState {
  course: Course
  action: CourseAction
  barred: boolean
  // A non-binding review was against it. It stays open.
  advisedAgainst: boolean
  // The rules leave this as the only course.
  must: boolean
  // The course a veto sets aside, when action is veto.
  setsAside?: Course
  // Lines printed under the course, in plain words.
  notes: string[]
}

export function split(ruling: Ruling): { permit: number; bar: number } {
  const votes = Object.values(ruling.votes)
  return { permit: votes.filter((v) => v === 'permit').length, bar: votes.filter((v) => v === 'bar').length }
}

// "5 to 2" for the side that won.
export function splitWords(ruling: Ruling): string {
  const { permit, bar } = split(ruling)
  return ruling.verdict === 'barred' ? `${bar} to ${permit}` : `${permit} to ${bar}`
}

export function verdictWord(ruling: Ruling, review: Pick<Review, 'binding'>): string {
  if (ruling.verdict === 'permitted') return 'Permitted'
  return review.binding ? 'Barred' : 'Advised against'
}

function rulingsOn(docket: Docket, course: Course): { review: Review; ruling: Ruling }[] {
  const found: { review: Review; ruling: Ruling }[] = []
  for (const review of docket.reviews) {
    for (const ruling of review.rulings) if (ruling.course === course) found.push({ review, ruling })
  }
  return found
}

// Why a course is barred, or advised against: "Barred by the Court, 5 to 2."
function reviewNotes(docket: Docket, course: Course, government: GovernmentState | null): string[] {
  const notes: string[] = []
  // Only the latest review by each body counts.
  const latest = new Map<string, { review: Review; ruling: Ruling }>()
  for (const found of rulingsOn(docket, course)) latest.set(found.review.body, found)
  for (const { review, ruling } of latest.values()) {
    if (ruling.verdict !== 'barred') continue
    const who = bodyName(government, review.body, true)
    notes.push(
      review.binding
        ? `Barred by ${who}, ${splitWords(ruling)}.`
        : `${capitalise(who)} advised against it, ${splitWords(ruling)}. It stays open.`,
    )
  }
  return notes
}

export function courseState(
  docket: Docket | null | undefined,
  course: Course,
  options: readonly CourseOption[],
  government: GovernmentState | null,
): CourseState {
  const base: CourseState = { course, action: 'accept', barred: false, advisedAgainst: false, must: false, notes: [] }
  if (!docket) return base
  if (docket.status === 'decided') return { ...base, action: 'word-only' }
  const standing = docket.standing
  if (!standing || isActive(docket.status) || docket.status === 'waiting' || docket.status === 'failed') {
    const why =
      docket.status === 'failed'
        ? 'The bodies could not be heard, so the rules give no standing yet.'
        : 'Waits for the bodies to finish.'
    return { ...base, action: 'word-only', notes: [why] }
  }

  const label = (c: Course) => courseLabel(c, options)
  const notes = reviewNotes(docket, course, government)
  const advisedAgainst = docket.reviews.some(
    (r) => !r.binding && r.rulings.some((x) => x.course === course && x.verdict === 'barred'),
  )
  const executive = executiveTitle(government)

  if (standing.barred.includes(course)) return { ...base, action: 'word-only', barred: true, advisedAgainst, notes }
  if (standing.standstill && course !== DISMISS) {
    return { ...base, action: 'word-only', advisedAgainst, notes: [...notes, 'Every course is barred. The petition is dismissed.'] }
  }
  if (standing.mustTake !== undefined) {
    if (course === standing.mustTake) {
      return { ...base, must: true, advisedAgainst, notes: [...notes, `The rules leave this as the only course for ${executive.toLowerCase()}.`] }
    }
    return {
      ...base,
      action: 'word-only',
      advisedAgainst,
      notes: [...notes, `${label(standing.mustTake)} must be taken. Only a Word can set that aside.`],
    }
  }
  if (!standing.permitted.includes(course) && !(course === DISMISS && dismissOpen(standing))) {
    return { ...base, action: 'word-only', advisedAgainst, notes: [...notes, 'Not open under the rules.'] }
  }
  if (standing.vetoable !== undefined && course !== standing.vetoable) {
    return {
      ...base,
      action: 'veto',
      setsAside: standing.vetoable,
      advisedAgainst,
      notes: [...notes, `${label(standing.vetoable)} was carried. Taking this instead needs written reasons.`],
    }
  }
  if (standing.vetoable === course) {
    return { ...base, advisedAgainst, notes: [...notes, 'Carried. It may be taken as it stands.'] }
  }
  return { ...base, advisedAgainst, notes }
}

// Dismissal is offered as a course of its own only when the standing allows it.
export function dismissOpen(standing: Standing | null | undefined): boolean {
  if (!standing) return false
  return standing.standstill || standing.permitted.includes(DISMISS) || standing.mustTake === DISMISS
}

export interface DivisionRow {
  party: string
  name: string
  colour: string
  aye: number
  no: number
  abstain: number
}

// The division table: one row per party, in the body's own order, then the whole House.
export function divisionRows(sitting: Sitting, body: Body | undefined): DivisionRow[] {
  const parties = body?.parties ?? []
  const rows: DivisionRow[] = []
  const seen = new Set<string>()
  for (const party of parties) {
    const votes = sitting.division.byParty[party.id]
    if (!votes) continue
    seen.add(party.id)
    rows.push({ party: party.id, name: party.name, colour: safeHex(party.colour), ...votes })
  }
  for (const [id, votes] of Object.entries(sitting.division.byParty)) {
    if (!seen.has(id)) rows.push({ party: id, name: id, colour: '#8d8c80', ...votes })
  }
  return rows
}

// A party colour is drawn, never trusted: anything but a plain hex becomes grey.
export function safeHex(value: string): string {
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value) ? value : '#8d8c80'
}

// "Carried, 90 to 50, with 11 abstaining. It does not bind." Worked out by the server;
// this only says it.
export function resultLine(sitting: Sitting, executive: string): string {
  const { aye, no, abstain } = sitting.division
  const count = `${aye} to ${no}${abstain ? `, with ${abstain} abstaining` : ''}`
  if (!sitting.carried) return `Not carried, ${count}.`
  if (sitting.binding) return `Carried and binding, ${count}. ${executive} must take it.`
  return `Carried, ${count}. It does not bind ${executive.toLowerCase()}.`
}

export const SITTING_KINDS: Record<Sitting['kind'], string> = {
  first: 'First sitting',
  reconciliation: 'Sitting again among the permitted courses',
  exchange: 'In answer to another body',
}

export function openDockets(government: GovernmentState | null): Docket[] {
  if (!government) return []
  return Object.values(government.dockets)
    .filter((d) => d.status !== 'decided')
    .sort((a, b) => a.number - b.number)
}

export function anyActive(government: GovernmentState | null): boolean {
  return Object.values(government?.dockets ?? {}).some((d) => isActive(d.status))
}

// The polled dockets laid over the ones the nation came with.
export function withDockets(government: GovernmentState, dockets: readonly Docket[]): GovernmentState {
  const next = { ...government.dockets }
  for (const docket of dockets) next[docket.dilemma] = docket
  return { ...government, dockets: next }
}

export const DECIDED_BY: Record<'executive' | 'body' | 'word' | 'standstill', string> = {
  executive: 'by the executive',
  body: 'by the vote itself',
  word: 'by the Founder’s Word',
  standstill: 'at a standstill',
}
