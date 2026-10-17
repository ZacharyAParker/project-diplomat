import { INDICATORS, INDICATOR_INFO, type Change, type Content, type IndicatorId } from '@diplomat/engine'

export type Direction = 'up' | 'down' | 'none'
export type Size = 'small' | 'moderate' | 'large'
export type Tone = 'good' | 'bad' | 'neutral'
export type GroupId = 'country' | 'factions' | 'cabinet' | 'situation' | 'abroad'

export interface Described {
  group: GroupId
  name: string
  direction: Direction
  size: Size
  tone: Tone
  // "up a little", for next to the arrow.
  movement: string
  // "for the better", "for the worse" or nothing, so the tone never rests on colour.
  verdict: string
  // "the debt grows sharply", for use inside a sentence.
  clause: string
  why: string
}

// The most one effect is allowed to move each kind of number. The pack validator holds
// authors to the same figures, so a "large" move here is a large one by the house rules.
const FULL_SCALE: Record<Change['kind'], number> = {
  indicator: 10,
  faction: 15,
  minister: 20,
  situation: 20,
  neighbour: 15,
}

const GROUP_OF: Record<Change['kind'], GroupId> = {
  indicator: 'country',
  faction: 'factions',
  minister: 'cabinet',
  situation: 'situation',
  neighbour: 'abroad',
}

export const GROUP_LABELS: Record<GroupId, string> = {
  country: 'The country',
  factions: 'Factions',
  cabinet: 'Cabinet',
  situation: 'The situation',
  abroad: 'Abroad',
}

const GROUP_ORDER: readonly GroupId[] = ['situation', 'country', 'factions', 'cabinet', 'abroad']

export const SIZE_WORDS: Record<Size, string> = { small: 'a little', moderate: 'somewhat', large: 'a lot' }

export const VERDICTS: Record<Tone, string> = { good: 'for the better', bad: 'for the worse', neutral: '' }

// How each indicator is spoken of in a sentence: what it is called, and what it does
// when it goes up and when it goes down.
const INDICATOR_PHRASES: Record<IndicatorId, [subject: string, up: string, down: string]> = {
  fiscal: ['the budget', 'improves', 'worsens'],
  debt: ['the debt', 'grows', 'shrinks'],
  capacity: ['the economy', 'grows', 'shrinks'],
  employment: ['employment', 'rises', 'falls'],
  living: ['living standards', 'rise', 'fall'],
  inequality: ['inequality', 'widens', 'narrows'],
  health: ['public health', 'improves', 'declines'],
  education: ['education', 'improves', 'declines'],
  environment: ['the environment', 'recovers', 'suffers'],
  liberty: ['liberty', 'expands', 'contracts'],
  legitimacy: ['legitimacy', 'rises', 'falls'],
  administration: ['the machinery of state', 'speeds up', 'slows down'],
}

export function isIndicator(target: string): target is IndicatorId {
  return (INDICATORS as readonly string[]).includes(target)
}

export function direction(by: number): Direction {
  return by > 0 ? 'up' : by < 0 ? 'down' : 'none'
}

export function size(change: Pick<Change, 'kind' | 'by'>): Size {
  const share = Math.abs(change.by) / FULL_SCALE[change.kind]
  return share <= 0.3 ? 'small' : share <= 0.6 ? 'moderate' : 'large'
}

// A gauge belongs to whichever situation is running and the pack does not say which way
// is the good one, so a situation change is reported without a verdict.
export function tone(change: Pick<Change, 'kind' | 'target' | 'by'>): Tone {
  if (change.by === 0 || change.kind === 'situation') return 'neutral'
  const lowerIsBetter =
    change.kind === 'indicator' && isIndicator(change.target) && INDICATOR_INFO[change.target].lowerIsBetter
  return change.by > 0 !== lowerIsBetter ? 'good' : 'bad'
}

export function targetName(change: Pick<Change, 'kind' | 'target'>, content: Content): string {
  const { kind, target } = change
  if (kind === 'indicator') return isIndicator(target) ? INDICATOR_INFO[target].name : target
  if (kind === 'faction') return content.factions.find((f) => f.id === target)?.name ?? target
  if (kind === 'minister') return content.portfolios.find((p) => p.id === target)?.title ?? target
  if (kind === 'neighbour') return content.neighbours.find((n) => n.id === target)?.name ?? target
  return content.situations.find((s) => s.id === target)?.gauge ?? target
}

const lowerThe = (name: string) => name.replace(/^The /, 'the ')
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

function clause(change: Change, content: Content): string {
  const way = direction(change.by)
  const adverb = { small: ' a little', moderate: '', large: ' sharply' }[size(change)]
  const name = targetName(change, content)
  if (change.kind === 'indicator' && isIndicator(change.target)) {
    const [subject, up, down] = INDICATOR_PHRASES[change.target]
    return way === 'none'
      ? `nothing changes for ${subject}`
      : `${subject} ${way === 'up' ? up : down}${adverb}`
  }
  const moves = way === 'none' ? 'does not move' : `${way === 'up' ? 'rises' : 'falls'}${adverb}`
  if (change.kind === 'faction') return `approval among ${lowerThe(name)} ${moves}`
  if (change.kind === 'minister') return `the ${name}'s standing ${moves}`
  if (change.kind === 'neighbour') {
    if (way === 'none') return `relations with ${name} do not change`
    return `relations with ${name} ${way === 'up' ? 'warm' : 'cool'}${adverb}`
  }
  return gaugeClause(name, way, size(change))
}

// A gauge is named by the pack and can be singular or plural ("Reservoir level", "Shoppers
// who trust the shelves"), so its movement is worded as a noun and needs no verb to agree.
function gaugeClause(name: string, way: Direction, scale: Size): string {
  const gauge = /^\S+'s?\s/.test(name) ? lowerFirst(name) : `the ${lowerFirst(name)}`
  if (way === 'none') return `no change in ${gauge}`
  const degree = { small: 'a small ', moderate: 'a ', large: 'a sharp ' }[scale]
  return `${degree}${way === 'up' ? 'rise' : 'fall'} in ${gauge}`
}

export function describe(change: Change, content: Content): Described {
  const way = direction(change.by)
  const scale = size(change)
  const verdict = tone(change)
  return {
    group: GROUP_OF[change.kind],
    name: targetName(change, content),
    direction: way,
    size: scale,
    tone: verdict,
    movement: way === 'none' ? 'no change' : `${way} ${SIZE_WORDS[scale]}`,
    verdict: VERDICTS[verdict],
    clause: clause(change, content),
    why: change.why,
  }
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export type Join = 'semicolon' | 'and'

// One reason as the paper would print it. A reason that is a single plain sentence takes
// the movement after a semicolon, or after "and" when asked and the reason is simple
// enough not to become a run-on. Anything longer keeps its own punctuation and the
// movement follows as a sentence of its own.
export function sentence(change: Change, content: Content, join: Join = 'semicolon'): string {
  const why = change.why.trim()
  const moved = clause(change, content)
  if (why === '') return `${capital(moved)}.`
  const single = /^[^.!?]+\.$/.test(why)
  if (single && change.kind === 'situation') return `${why.slice(0, -1)}: ${moved}.`
  if (single && join === 'and' && !/[,;:]| and | but /.test(why)) return `${why.slice(0, -1)}, and ${moved}.`
  if (single) return `${why.slice(0, -1)}; ${moved}.`
  return `${/[.!?]["')]?$/.test(why) ? why : `${why}.`} ${capital(moved)}.`
}

export function groupChanges(
  changes: readonly Change[],
): { group: GroupId; label: string; changes: Change[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    changes: changes.filter((c) => GROUP_OF[c.kind] === group),
  })).filter((g) => g.changes.length > 0)
}

export function totalMovement(changes: readonly Change[]): number {
  return changes.reduce((sum, c) => sum + Math.abs(c.by), 0)
}

export function policyLine(change: { policy: string; to: boolean | number }, content: Content): string {
  const name = content.policies.find((p) => p.id === change.policy)?.name ?? change.policy
  if (change.to === true) return `Introduces: ${name}`
  if (change.to === false) return `Ends: ${name}`
  return `Sets ${name} to ${change.to}`
}

export function percent(value: number): string {
  return `${Math.round(value)}%`
}

export function dayLabel(day: number): string {
  return `Day ${day}`
}

// Null is a nation that holds no elections.
export function electionLabel(daysLeft: number | null): string {
  if (daysLeft === null) return 'No elections are held'
  if (daysLeft <= 0) return 'Election tonight'
  if (daysLeft === 1) return 'Election tomorrow'
  if (daysLeft >= 730) return `Next election in about ${Math.round(daysLeft / 365)} years`
  return `Election in ${daysLeft.toLocaleString('en-GB')} days`
}
