// The world beyond the borders: twenty other nations that act once a week, wars between them
// and with the player, pacts, border claims, the Assembly of Nations, and the foreign matters
// that come to the player's desk. See docs/design/world.md.
//
// The week runs in three steps so the AI can choose in the middle: planWorld lists every
// nation's legal moves with a score, the caller picks one per nation (the top score if it has
// nothing better), and worldWeek applies them, fights the wars and sits the Assembly. The
// player's own nation can be beaten but is never annexed or destroyed.

import { applyEffects, recordEntry, render, type GameState } from './engine.ts'
import { pick, rngFor, type Rng } from './rng.ts'
import {
  ASSEMBLY_MOTIONS,
  COUNCIL_MOTIONS,
  HOME,
  type Change,
  type Claim,
  type Content,
  type Effect,
  type Matter,
  type MatterDef,
  type MatterKind,
  type MatterOptionDef,
  type Motion,
  type MotionKind,
  type NeighbourDef,
  type War,
  type WorldNation,
  type WorldState,
} from './types.ts'

export const WEEK = 7
export const SITTING_DAYS = 14
const MATTER_DAYS = 7
const MEMORY = 6
const LOG = 120
// How a nation's standing with the player makes it a close friend or an enemy.
export const FRIEND = 60
export const ENEMY = -40
// About one beaten nation in seven that stands alone is annexed; the rest pay and survive.
const ANNEX_CHANCE = 0.15
// A nation appeals to the player for aid at most this often.
const APPEAL_DAYS = 28
// A nation that has just fought cannot start another war for nine months, and two nations
// that fought each other cannot for a year and a half.
const REST_DAYS = 39 * WEEK
const FEUD_DAYS = 78 * WEEK

export type MoveKind = 'court' | 'pact' | 'claim' | 'war' | 'aid' | 'appeal' | 'peace' | 'rearm' | 'wait'

export interface Move {
  id: string
  kind: MoveKind
  target?: string
  war?: string
  score: number
  // Why the planner rates it, in a phrase, for the AI and the record.
  because: string
}

export interface NationPlan {
  nation: string
  important: boolean
  // Worth asking a model: the top moves are close, or one of them is a big step.
  choice: boolean
  moves: Move[]
}

export interface WorldPlan {
  day: number
  nations: NationPlan[]
}

// What the AI (or nobody) chose: a move id per nation, and a note in the nation's voice.
export interface WorldChoices {
  moves: Record<string, string>
  notes: Record<string, string>
}

export type WorldAction =
  | { pact: string }
  | { war: string }
  | { peace: string }
  | { assembly: 'join' | 'leave' }
  | { mobilise: boolean }
  | { propose: Proposal }
  | { council: 'stand' }

// A motion the player puts down: to the Assembly, or to the Security Council while it holds a
// seat. The kind and its target are what the rules act on; the wording is read out and kept.
export interface Proposal {
  body: 'assembly' | 'council'
  kind: MotionKind
  target?: string
  war?: string
  claim?: string
  resource?: string
  text?: string
}

// What each kind of proposal needs to name.
export const PROPOSAL_NEEDS: Record<MotionKind, 'nation' | 'war' | 'claim' | 'nation+resource' | 'none'> = {
  ceasefire: 'war',
  sanctions: 'nation',
  tribunal: 'nation',
  arbitration: 'claim',
  aid: 'nation',
  condemnation: 'nation',
  embargo: 'nation+resource',
  admit: 'nation',
  expel: 'nation',
  routine: 'none',
  'binding-ceasefire': 'war',
  'hard-sanctions': 'nation',
  peacekeepers: 'war',
  force: 'nation',
}

// Rounded to a tenth, and never minus zero, which a save would write back as plain zero.
const clamp = (n: number, lo = 0, hi = 100) => Math.round(Math.min(hi, Math.max(lo, n)) * 10) / 10 || 0
const clampStanding = (n: number) => clamp(n, -100, 100)

// ---------------------------------------------------------------------------------------
// Making the world
// ---------------------------------------------------------------------------------------

export function hasWorld(content: Content): boolean {
  return content.neighbours.length > 0 && content.world.matters.length > 0
}

// Made the first day there is a world to make, and topped up if the pack gains a nation.
export function ensureWorld(state: GameState, content: Content) {
  if (!hasWorld(content)) return
  if (!state.world) {
    state.world = {
      nations: {},
      wars: [],
      pacts: [],
      claims: [],
      assembly: { members: [HOME], next: nextSitting(state.day), motion: null, past: [], sanctions: [], queue: [] },
      council: { permanent: [], elected: [], next: nextCouncil(state.day), motion: null, past: [], queue: [], election: nextSitting(state.day + 12 * WEEK), candidates: [] },
      matters: [],
      home: { mobilised: false, lost: 0, reparations: [] },
      important: [],
      log: [],
      seq: 1,
    }
  }
  const w = state.world
  // Worlds made before the Security Council existed gain one.
  if (!w.assembly.queue) w.assembly.queue = []
  if (!w.council) w.council = { permanent: [], elected: [], next: nextCouncil(state.day), motion: null, past: [], queue: [], election: nextSitting(state.day + 12 * WEEK), candidates: [] }
  const added: string[] = []
  for (const n of content.neighbours) {
    if (w.nations[n.id]) continue
    w.nations[n.id] = { id: n.id, free: true, strength: n.strength, wealth: n.wealth, stability: 60, relations: {}, memory: [] }
    if (!w.assembly.members.includes(n.id)) w.assembly.members.push(n.id)
    added.push(n.id)
  }
  if (!added.length) return
  for (const a of content.neighbours) {
    for (const b of content.neighbours) {
      if (a.id >= b.id) continue
      if (w.nations[a.id]!.relations[b.id] !== undefined) continue
      const r = initialRelation(state, a, b)
      w.nations[a.id]!.relations[b.id] = r
      w.nations[b.id]!.relations[a.id] = r
    }
  }
  if (added.length === content.neighbours.length) formFirstPacts(state, content)
  if (!w.council.permanent.length) seatCouncil(state, content)
}

// The five strongest nations hold the permanent seats; the next four are the first elected,
// two of them for three months and two for six, so that two seats come up at each election.
function seatCouncil(state: GameState, content: Content) {
  const w = state.world!
  const ranked = content.neighbours.map((n) => n.id).filter((id) => w.nations[id]?.free).sort((a, b) => {
    const score = (id: string) => w.nations[id]!.strength + w.nations[id]!.wealth / 2
    return score(b) - score(a) || a.localeCompare(b)
  })
  w.council.permanent = ranked.slice(0, 5)
  w.council.elected = ranked.slice(5, 9).map((id, i) => ({ id, until: state.day + (i < 2 ? 13 : 26) * WEEK }))
}

export function nextCouncil(day: number): number {
  // Between the Assembly's sittings: a week after each.
  return nextSitting(day) + WEEK
}

export function councilMembers(state: GameState): string[] {
  const c = state.world?.council
  if (!c) return []
  return [...c.permanent, ...c.elected.map((e) => e.id)].filter((id) => isFree(state, id))
}

function initialRelation(state: GameState, a: NeighbourDef, b: NeighbourDef): number {
  const rng = rngFor(state.seed, 0, `relation:${a.id}:${b.id}`)
  const shared = a.likes.filter((t) => b.likes.includes(t)).length
  const opposed = a.likes.filter((t) => b.dislikes.includes(t)).length + b.likes.filter((t) => a.dislikes.includes(t)).length
  const trade = (a.surpluses.some((r) => b.needs.includes(r)) ? 5 : 0) + (b.surpluses.some((r) => a.needs.includes(r)) ? 5 : 0)
  const border = a.borders.includes(b.id)
  const rivals = border && a.temperament.aggression >= 50 && b.temperament.aggression >= 50 ? -30 : border ? -5 : 0
  return clamp(10 + shared * 8 - opposed * 8 + trade + rivals + (rng() * 20 - 10), -80, 80)
}

// Old friends start in pacts: the most loyal first, with whoever they like best.
function formFirstPacts(state: GameState, content: Content) {
  const w = state.world!
  const byLoyalty = [...content.neighbours].sort((a, b) => b.temperament.loyalty - a.temperament.loyalty || a.id.localeCompare(b.id))
  for (const a of byLoyalty) {
    if (a.temperament.loyalty < 45 || w.pacts.some((p) => p.members.includes(a.id))) continue
    const partner = byLoyalty
      .filter((b) => b.id !== a.id && b.temperament.loyalty >= 45 && rel(state, a.id, b.id) >= 25)
      .sort((x, y) => rel(state, a.id, y.id) - rel(state, a.id, x.id))[0]
    if (!partner) continue
    const theirs = w.pacts.find((p) => p.members.includes(partner.id))
    if (theirs) {
      if (theirs.members.length < 4 && theirs.members.every((m) => rel(state, a.id, m) >= 15)) theirs.members.push(a.id)
    } else {
      w.pacts.push({ id: nextId(w, 'pact'), members: [a.id, partner.id], since: state.day })
    }
  }
}

export function nextSitting(day: number): number {
  return Math.ceil((day + WEEK) / SITTING_DAYS) * SITTING_DAYS
}

function nextId(w: WorldState, kind: string): string {
  return `${kind}-${w.seq++}`
}

// ---------------------------------------------------------------------------------------
// Reading the world
// ---------------------------------------------------------------------------------------

export function nameOf(state: GameState, content: Content, id: string): string {
  if (id === HOME) return state.identity.name
  return content.neighbours.find((n) => n.id === id)?.name ?? id
}

function defOf(content: Content, id: string): NeighbourDef | undefined {
  return content.neighbours.find((n) => n.id === id)
}

export function rel(state: GameState, a: string, b: string): number {
  if (a === b) return 100
  if (a === HOME) return state.neighbours[b] ?? 0
  if (b === HOME) return state.neighbours[a] ?? 0
  return state.world?.nations[a]?.relations[b] ?? 0
}

function isFree(state: GameState, id: string): boolean {
  return id === HOME || state.world?.nations[id]?.free === true
}

export function activeWars(state: GameState): War[] {
  return state.world?.wars.filter((w) => !w.ended) ?? []
}

export function warsOf(state: GameState, id: string): War[] {
  return activeWars(state).filter((w) => w.attackers.includes(id) || w.defenders.includes(id))
}

function sideOf(war: War, id: string): 'attackers' | 'defenders' | null {
  if (war.attackers.includes(id)) return 'attackers'
  if (war.defenders.includes(id)) return 'defenders'
  return null
}

function enemiesIn(war: War, id: string): string[] {
  const side = sideOf(war, id)
  return side === 'attackers' ? war.defenders : side === 'defenders' ? war.attackers : []
}

export function atWar(state: GameState, a: string, b: string): boolean {
  return warsOf(state, a).some((w) => enemiesIn(w, a).includes(b))
}

export function allies(state: GameState, id: string): string[] {
  const out = new Set<string>()
  for (const p of state.world?.pacts ?? []) if (p.members.includes(id)) for (const m of p.members) if (m !== id) out.add(m)
  return [...out].filter((m) => isFree(state, m))
}

export function bordersOf(state: GameState, content: Content, id: string): string[] {
  const free = (list: string[]) => list.filter((x) => isFree(state, x))
  if (id === HOME) return free(content.neighbours.filter((n) => n.near).map((n) => n.id))
  const def = defOf(content, id)
  if (!def) return []
  return free([...def.borders, ...(def.near ? [HOME] : [])])
}

// The player's army: the economy and the state behind it, and more when mobilised.
export function homeStrength(state: GameState): number {
  const i = state.indicators
  const w = state.world
  const base = 15 + i.capacity * 0.3 + i.administration * 0.2 + i.legitimacy * 0.1 + (w?.home.mobilised ? 20 : 0) - (w?.home.lost ?? 0) * 2
  return clamp(base, 5, 95)
}

export function strengthOf(state: GameState, id: string): number {
  if (id === HOME) return homeStrength(state)
  return state.world?.nations[id]?.strength ?? 0
}

// A side's weight: its own army and half of each ally's who would come.
function weightOf(state: GameState, id: string): number {
  return strengthOf(state, id) + allies(state, id).reduce((sum, a) => sum + strengthOf(state, a) * 0.5, 0)
}

function openClaim(state: GameState, by: string, against: string): Claim | undefined {
  return state.world?.claims.find((c) => !c.settled && c.by === by && c.against === against)
}

export function importantNations(state: GameState): string[] {
  const w = state.world
  if (!w) return []
  return Object.values(w.nations)
    .filter((n) => n.free)
    .map((n) => n.id)
    .filter((id) => {
      const standing = state.neighbours[id] ?? 0
      return (
        standing >= FRIEND ||
        standing <= ENEMY ||
        allies(state, HOME).includes(id) ||
        warsOf(state, HOME).some((war) => war.attackers.includes(id) || war.defenders.includes(id)) ||
        w.claims.some((c) => !c.settled && ((c.by === id && c.against === HOME) || (c.by === HOME && c.against === id)))
      )
    })
    .sort()
}

// ---------------------------------------------------------------------------------------
// Planning: every legal move for every free nation, scored
// ---------------------------------------------------------------------------------------

export function planWorld(state: GameState, content: Content): WorldPlan {
  const w = state.world
  if (!w) return { day: state.day, nations: [] }
  const important = new Set(importantNations(state))
  const nations: NationPlan[] = []
  for (const def of content.neighbours) {
    if (!w.nations[def.id]?.free) continue
    // The best six, and any war it could start however poor its odds: a government in a fury
    // may choose one the arithmetic advises against. The rules alone rarely will.
    const all = movesFor(state, content, def).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    const moves = all.filter((m, i) => i < 6 || m.kind === 'war')
    const big = (m: Move) => m.kind === 'war' || m.kind === 'pact' || m.kind === 'claim' || m.kind === 'aid' || m.kind === 'peace'
    const choice = moves.length > 1 && (moves[0]!.score - moves[1]!.score < 4 || moves.slice(0, 3).some(big))
    nations.push({ nation: def.id, important: important.has(def.id), choice, moves })
  }
  return { day: state.day, nations }
}

function movesFor(state: GameState, content: Content, def: NeighbourDef): Move[] {
  const w = state.world!
  const me = w.nations[def.id]!
  const t = def.temperament
  const moves: Move[] = [{ id: 'wait', kind: 'wait', score: 10, because: 'nothing presses' }]
  const others = [...content.neighbours.map((n) => n.id).filter((id) => id !== def.id && isFree(state, id)), HOME]
  const neighbours = bordersOf(state, content, def.id)
  const myWars = warsOf(state, def.id)
  const threatened = neighbours.some((x) => rel(state, def.id, x) <= -40 && strengthOf(state, x) > me.strength)

  if (me.strength < 80) {
    moves.push({ id: 'rearm', kind: 'rearm', score: 6 + t.aggression / 6 + (threatened ? 10 : 0) + (myWars.length ? 8 : 0), because: threatened ? 'a stronger enemy on the border' : 'an army is a comfort' })
  }

  for (const x of others) {
    const r = rel(state, def.id, x)
    const theirs = x === HOME ? undefined : defOf(content, x)
    const enemies = atWar(state, def.id, x)

    if (!enemies && r > -40 && r < 35) {
      const trade = theirs?.surpluses.some((s) => def.needs.includes(s)) || (x === HOME && Object.entries(state.resources).some(([k, v]) => v === 'surplus' && def.needs.includes(k)))
      moves.push({ id: `court:${x}`, kind: 'court', target: x, score: 3 + t.loyalty / 15 + (trade ? 5 : 0) + (strengthOf(state, x) > me.strength + 15 ? 3 : 0), because: trade ? 'it has what we need' : 'a friend is worth having' })
    }

    // One pact each, four members at most: a bloc, not a web.
    const pacted = allies(state, def.id).includes(x)
    if (!pacted && !enemies && r >= (x === HOME ? 45 : 40) && t.loyalty >= 40 && canPact(state, def.id, x)) {
      const sharedEnemy = others.some((e) => e !== x && rel(state, def.id, e) <= -40 && rel(state, x, e) <= -40)
      moves.push({ id: `pact:${x}`, kind: 'pact', target: x, score: 5 + t.loyalty / 8 + (sharedEnemy ? 12 : 0) + (threatened ? 8 : 0), because: sharedEnemy ? 'a common enemy' : 'safety in friends' })
    }

    const border = neighbours.includes(x)
    if (border && !enemies && r <= 10 && t.ambition >= 50 && !openClaim(state, def.id, x)) {
      moves.push({ id: `claim:${x}`, kind: 'claim', target: x, score: t.ambition / 6 + t.aggression / 10 - 6 + (me.strength > strengthOf(state, x) ? 5 : 0), because: 'old maps say the land is ours' })
    }

    // War comes from how a nation feels: about the other country, its people, its government,
    // its wealth, an old defeat, a claim left to fester. Strength only shifts the odds: a weak
    // nation in a fury will now and then attack a stronger one, and usually regret it.
    if (border && !enemies && !myWars.length && rested(state, def.id, x) && me.stability >= 30 && t.aggression >= 30) {
      const grudge = grievances(state, content, def, x)
      if (grudge.animus >= WAR_ANIMUS) {
        const ratio = weightOf(state, def.id) / Math.max(1, weightOf(state, x))
        // An edge encourages; a disadvantage discourages, but never forbids.
        const power = ratio >= 1.15 ? 6 : ratio >= 0.9 ? 0 : -15 - (1 - ratio) * 35
        // Temper: some weeks a government is angrier than the arithmetic.
        const temper = rngFor(state.seed, state.day, `temper:${def.id}:${x}`)() * 14
        moves.push({
          id: `war:${x}`,
          kind: 'war',
          target: x,
          score: t.aggression / 5 + (grudge.animus - WAR_ANIMUS) / 3 + power + temper - 10,
          because: [...grudge.reasons.slice(0, 2), ratio < 0.9 ? 'whatever the odds' : ratio >= 1.15 ? 'and they are weaker' : ''].filter(Boolean).join('; '),
        })
      }
    }

    if (x !== HOME && !enemies && t.charity >= 50 && r >= 0 && me.wealth >= 40) {
      const them = w.nations[x]!
      const need = them.stability < 35 || them.wealth < 25 || warsOf(state, x).some((war) => war.defenders.includes(x))
      if (need) moves.push({ id: `aid:${x}`, kind: 'aid', target: x, score: t.charity / 6 + r / 10, because: 'they are in trouble' })
    }
  }

  const inNeed = me.stability < 35 || me.wealth < 25 || myWars.some((war) => war.defenders.includes(def.id))
  const asked = me.memory.some((m) => m.text.startsWith('Appealed to') && state.day - m.day < APPEAL_DAYS)
  if (inNeed && !asked) {
    const donor = others
      .filter((x) => !atWar(state, def.id, x) && rel(state, def.id, x) >= 10)
      .sort((a, b) => wealthOf(state, b) - wealthOf(state, a) || a.localeCompare(b))[0]
    if (donor) moves.push({ id: `appeal:${donor}`, kind: 'appeal', target: donor, score: 10 + (40 - me.stability) / 3, because: 'we cannot manage alone' })
  }

  for (const war of myWars) {
    const side = sideOf(war, def.id)!
    const tired = war.weariness[side]
    const losing = side === 'attackers' ? war.front < -30 : war.front > 30
    if (tired >= 55 || (losing && (side === 'attackers' ? war.front < -40 : war.front > 40))) {
      moves.push({ id: `peace:${war.id}`, kind: 'peace', war: war.id, score: tired / 3 + (losing ? 15 : 0), because: losing ? 'the war is being lost' : 'the country is tired of it' })
    }
  }
  return moves
}

function rested(state: GameState, a: string, b: string): boolean {
  for (const war of state.world!.wars) {
    if (!war.ended) continue
    const ago = state.day - war.ended.day
    if (ago < REST_DAYS && (sideOf(war, a))) return false
    if (ago < FEUD_DAYS && sideOf(war, a) && sideOf(war, b) && sideOf(war, a) !== sideOf(war, b)) return false
  }
  return true
}

// How far a nation's feelings towards another would carry it to war, and why, in its own terms.
const WAR_ANIMUS = 68

// Autocratic, free or somewhere between. The player's is read from the state of liberty.
export function regimeOf(state: GameState, content: Content, id: string): 'free' | 'mixed' | 'autocratic' {
  if (id === HOME) return state.indicators.liberty >= 55 ? 'free' : state.indicators.liberty <= 35 ? 'autocratic' : 'mixed'
  const form = defOf(content, id)?.form ?? ''
  if (/junta|one-party|theocracy|absolute/.test(form)) return 'autocratic'
  if (/monarchy|principality|kingdom|merchant|crowned/.test(form)) return 'mixed'
  return 'free'
}

export function grievances(state: GameState, content: Content, me: NeighbourDef, x: string): { animus: number; reasons: string[] } {
  const reasons: string[] = []
  let animus = 0
  const r = rel(state, me.id, x)
  // How it feels about the country: the plainest part.
  if (r < 0) animus += -r * 0.9
  if (r <= -40) reasons.push('they have wronged us too often')
  // Its government.
  const mine = regimeOf(state, content, me.id)
  const theirs = regimeOf(state, content, x)
  if (mine === 'autocratic' && theirs === 'free') {
    animus += 10 + me.temperament.aggression / 10
    reasons.push('their government is a standing insult to ours')
  } else if (mine === 'free' && theirs === 'autocratic') {
    animus += 6
    reasons.push('they rule their people by fear')
  }
  // Its people: what they prize is what we despise.
  const them = x === HOME ? undefined : defOf(content, x)
  const offended = them ? them.likes.filter((tag) => me.dislikes.includes(tag)).length : 0
  if (offended) {
    animus += offended * 8
    reasons.push('their people’s ways offend ours')
  }
  // Its wealth, to an ambitious and poorer nation.
  const gap = wealthOf(state, x) - wealthOf(state, me.id)
  if (gap >= 25 && me.temperament.ambition >= 50) {
    animus += gap / 2
    reasons.push('their wealth would be better spent by us')
  }
  // A claim, and longer still, one left to fester.
  const claim = openClaim(state, me.id, x)
  if (claim) {
    animus += 15 + (!claim.referred && state.day - claim.since >= 4 * WEEK ? 20 : 0)
    reasons.push(`${claim.region} is ours`)
  }
  // An old defeat at their hands.
  const lost = state.world!.wars.some((war) => war.ended && state.day - war.ended.day < 156 * WEEK && enemiesIn(war, me.id).includes(x) && ((war.ended.outcome === 'attackers' && war.defenders.includes(me.id)) || (war.ended.outcome === 'defenders' && war.attackers.includes(me.id))))
  if (lost) {
    animus += 15
    reasons.push('an old defeat to avenge')
  }
  // Votes to shame it in the Assembly.
  const shamed = state.world!.assembly.past.filter((m) => (m.kind === 'tribunal' || m.kind === 'sanctions') && m.target === me.id && m.passed && m.votes?.[x] === 'aye').length
  if (shamed) {
    animus += shamed * 8
    reasons.push('they voted to shame us before the Assembly')
  }
  return { animus, reasons }
}

function wealthOf(state: GameState, id: string): number {
  if (id === HOME) return state.indicators.capacity
  return state.world?.nations[id]?.wealth ?? 0
}

// ---------------------------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------------------------

interface Week {
  changes: Change[]
  lines: string[]
}

export function worldWeek(state: GameState, content: Content, choices?: WorldChoices) {
  const w = state.world
  if (!w) return
  const week: Week = { changes: [], lines: [] }
  const rng = rngFor(state.seed, state.day, 'world')

  lapseMatters(state, content)
  const plan = planWorld(state, content)
  for (const p of plan.nations) {
    if (!w.nations[p.nation]?.free) continue
    const chosen = p.moves.find((m) => m.id === choices?.moves[p.nation]) ?? p.moves[0]
    if (!chosen) continue
    const note = choices?.notes[p.nation]?.trim()
    applyMove(state, content, p.nation, chosen, note, week, rng)
  }
  for (const war of activeWars(state)) fight(state, content, war, week, rng)
  homeAtWar(state, content, week)
  sanctionsWeek(state, content, week)
  drift(state, content)
  assemblyWeek(state, content, week, rng)
  councilWeek(state, content, week)
  w.important = importantNations(state)
  if (week.lines.length || week.changes.length) {
    recordEntry(state, content, 'world', 'The world this week', week.changes, week.lines.join(' '))
  }
  if (w.log.length > LOG) w.log = w.log.slice(-LOG)
}

function log(state: GameState, week: Week, text: string, nations: string[], forHome = false) {
  state.world!.log.push({ day: state.day, text, nations })
  if (forHome || nations.includes(HOME)) week.lines.push(text)
}

function remember(state: GameState, id: string, text: string) {
  const n = state.world?.nations[id]
  if (!n) return
  n.memory.push({ day: state.day, text })
  if (n.memory.length > MEMORY) n.memory = n.memory.slice(-MEMORY)
}

// Moves relations both ways. With the player it is standing, recorded as a change.
function shift(state: GameState, a: string, b: string, by: number, why: string, changes?: Change[]) {
  if (a === b || by === 0) return
  if (a === HOME || b === HOME) {
    const other = a === HOME ? b : a
    if (!Object.hasOwn(state.neighbours, other)) return
    state.neighbours[other] = clampStanding(state.neighbours[other]! + by)
    changes?.push({ kind: 'neighbour', target: other, by, why })
    return
  }
  const na = state.world!.nations[a]
  const nb = state.world!.nations[b]
  if (!na || !nb) return
  na.relations[b] = clampStanding((na.relations[b] ?? 0) + by)
  nb.relations[a] = clampStanding((nb.relations[a] ?? 0) + by)
}

function applyMove(state: GameState, content: Content, id: string, move: Move, note: string | undefined, week: Week, rng: Rng) {
  const w = state.world!
  const me = w.nations[id]!
  const name = nameOf(state, content, id)
  const target = move.target
  const them = target ? nameOf(state, content, target) : ''
  const said = note ? ` Its note: “${note}”` : ''
  switch (move.kind) {
    case 'wait':
      return
    case 'rearm':
      me.strength = clamp(me.strength + 4)
      me.wealth = clamp(me.wealth - 2)
      remember(state, id, note ?? 'Rearmed.')
      // Only the papers near home notice an army growing: a neighbour, or a nation that matters.
      if (defOf(content, id)?.near || w.important.includes(id)) log(state, week, `${name} spends on its army.`, [id], true)
      return
    case 'court':
      if (!target) return
      shift(state, id, target, target === HOME ? 4 : 8, `${name} made friendly overtures.`, week.changes)
      remember(state, id, note ?? `Courted ${them}.`)
      // Courtesies between other nations are not news; one paid to the player is.
      if (target === HOME) log(state, week, `${name} courts ${them}.${said}`, [id, target])
      return
    case 'pact':
      if (!target) return
      if (target === HOME) {
        raise(state, content, 'pact', id, { vars: { strength_word: strengthWord(me.strength), ...(note ? { note } : {}) } })
        remember(state, id, note ?? `Offered ${them} a pact.`)
        log(state, week, `${name} proposes a defensive pact with ${them}.`, [id, HOME])
        return
      }
      if (rel(state, target, id) >= 40 && (defOf(content, target)?.temperament.loyalty ?? 0) >= 35) {
        joinPact(state, id, target)
        remember(state, id, note ?? `Signed a pact with ${them}.`)
        remember(state, target, `Signed a pact with ${name}.`)
        log(state, week, `${name} and ${them} sign a defensive pact.`, [id, target], allies(state, HOME).some((a) => a === id || a === target))
      } else {
        remember(state, id, `${them} turned down a pact.`)
      }
      return
    case 'claim': {
      if (!target) return
      const region = freeBorderland(state, content, rng)
      w.claims.push({ id: nextId(w, 'claim'), by: id, against: target, region, since: state.day })
      shift(state, id, target, -10, `${name} laid claim to ${region}.`, week.changes)
      remember(state, id, note ?? `Claimed ${region} from ${them}.`)
      log(state, week, `${name} claims ${region} from ${them}.`, [id, target])
      if (target === HOME) raise(state, content, 'claim', id, { region, claim: w.claims.at(-1)!.id, vars: note ? { note } : {} })
      return
    }
    case 'war': {
      if (!target) return
      const claim = openClaim(state, id, target)
      startWar(state, content, id, target, claim ? 'claim' : 'conquest', claim?.region, week, note)
      remember(state, id, note ?? `Went to war with ${them}.`)
      return
    }
    case 'aid':
      if (!target || target === HOME) return
      giveAid(state, id, target, 8, 3)
      me.wealth = clamp(me.wealth - 2)
      shift(state, id, target, 10, `${name} sent aid.`)
      remember(state, id, note ?? `Sent aid to ${them}.`)
      log(state, week, `${name} sends aid to ${them}.`, [id, target])
      return
    case 'appeal':
      if (!target) return
      remember(state, id, `Appealed to ${them} for help.`)
      if (target === HOME) {
        raise(state, content, 'aid', id, { vars: { need: needOf(state, content, id), ...(note ? { note } : {}) } })
        log(state, week, `${name} appeals to ${them} for help.`, [id, HOME])
        return
      }
      if ((defOf(content, target)?.temperament.charity ?? 0) >= 45 && rel(state, target, id) >= 0) {
        giveAid(state, target, id, 6, 2)
        shift(state, id, target, 8, 'Aid when it was asked for.')
        log(state, week, `${them} answers ${name}'s appeal for help.`, [id, target])
      }
      return
    case 'peace': {
      const war = w.wars.find((x) => x.id === move.war && !x.ended)
      if (!war) return
      const side = sideOf(war, id)!
      const enemies = enemiesIn(war, id)
      if (enemies.includes(HOME)) {
        raise(state, content, 'terms', id, { war: war.id, vars: { weeks: String(war.weeks), terms: termsText(state, content, war, id), front: frontText(war, HOME), ...(note ? { note } : {}) } })
        log(state, week, `${name} offers ${state.identity.name} terms.`, [id, HOME])
        remember(state, id, note ?? 'Offered terms.')
        return
      }
      const other = side === 'attackers' ? 'defenders' : 'attackers'
      const theirFront = other === 'attackers' ? war.front : -war.front
      // A side that is winning holds out for victory unless it is worn out too.
      if (theirFront >= 35 ? war.weariness[other] >= 60 : war.weariness[other] >= 35 || theirFront < 20 || rng() < 0.2) {
        endWar(state, content, war, Math.abs(war.front) < 35 ? 'ceasefire' : war.front > 0 ? 'attackers' : 'defenders', false, week, rng)
        remember(state, id, note ?? 'Made peace.')
      } else {
        remember(state, id, 'Offered terms, and was refused.')
      }
      return
    }
  }
}

function strengthWord(strength: number): string {
  return strength >= 65 ? 'one of the strongest powers on the continent' : strength >= 45 ? 'a middling power' : 'small and lightly armed'
}

function needOf(state: GameState, content: Content, id: string): string {
  const n = state.world!.nations[id]!
  const war = warsOf(state, id)[0]
  if (war) return `the war with ${enemiesIn(war, id).map((e) => nameOf(state, content, e)).join(' and ')} has emptied its hospitals and its granaries`
  if (n.wealth < 25) return 'a failed harvest and an empty treasury'
  return 'its government is close to collapse and the streets are not safe'
}

function giveAid(state: GameState, from: string, to: string, stability: number, wealth: number) {
  const n = state.world!.nations[to]
  if (!n) return
  n.stability = clamp(n.stability + stability)
  n.wealth = clamp(n.wealth + wealth)
  void from
}

function freeBorderland(state: GameState, content: Content, rng: Rng): string {
  const used = new Set(state.world!.claims.filter((c) => !c.settled).map((c) => c.region))
  const free = content.world.borderlands.filter((b) => !used.has(b))
  return pick(rng, free.length ? free : content.world.borderlands)
}

const PACT_SIZE = 4

// Whether a and b could end up in one pact: neither in a pact, or one joining the other's
// with room to spare. The player's pacts are their own and are not limited.
function canPact(state: GameState, a: string, b: string): boolean {
  const w = state.world!
  const mine = w.pacts.find((p) => p.members.includes(a) && !p.members.includes(HOME))
  const theirs = w.pacts.find((p) => p.members.includes(b) && !p.members.includes(HOME))
  if (a === HOME || b === HOME) return true
  if (mine && theirs) return false
  const joining = mine ?? theirs
  return !joining || joining.members.length < PACT_SIZE
}

function joinPact(state: GameState, a: string, b: string) {
  const w = state.world!
  if (a === HOME || b === HOME) {
    const other = a === HOME ? b : a
    const home = w.pacts.find((p) => p.members.includes(HOME))
    if (home) {
      if (!home.members.includes(other)) home.members.push(other)
    } else w.pacts.push({ id: nextId(w, 'pact'), members: [HOME, other], since: state.day })
    return
  }
  if (!canPact(state, a, b)) return
  const mine = w.pacts.find((p) => p.members.includes(a) && !p.members.includes(HOME))
  const theirs = w.pacts.find((p) => p.members.includes(b) && !p.members.includes(HOME))
  if (theirs) return void theirs.members.push(a)
  if (mine) return void mine.members.push(b)
  w.pacts.push({ id: nextId(w, 'pact'), members: [a, b], since: state.day })
}

function leavePacts(state: GameState, a: string, b: string) {
  const w = state.world!
  for (const p of w.pacts) {
    if (p.members.includes(a) && p.members.includes(b)) p.members = p.members.filter((m) => m !== a)
  }
  w.pacts = w.pacts.filter((p) => p.members.length >= 2)
}

// ---------------------------------------------------------------------------------------
// War
// ---------------------------------------------------------------------------------------

function startWar(state: GameState, content: Content, attacker: string, defender: string, cause: War['cause'], region: string | undefined, week: Week, note?: string) {
  const w = state.world!
  const war: War = {
    id: nextId(w, 'war'),
    since: state.day,
    attackers: [attacker],
    defenders: [defender],
    cause,
    ...(region ? { region } : {}),
    front: 0,
    weeks: 0,
    weariness: { attackers: 0, defenders: 0 },
    crimes: [],
    odds: Math.round((weightOf(state, attacker) / Math.max(1, weightOf(state, defender))) * 100) / 100,
  }
  w.wars.push(war)
  const a = nameOf(state, content, attacker)
  const d = nameOf(state, content, defender)
  shift(state, attacker, defender, -30, `${a} invaded.`, week.changes)
  // An aggressor is noticed by everyone, and by the Assembly.
  for (const other of Object.keys(w.nations)) {
    if (other !== attacker && other !== defender && w.nations[other]!.free) shift(state, attacker, other, -4, 'An aggressor is noticed.')
  }
  log(state, week, `${a} goes to war with ${d}${region ? ` over ${region}` : ''}.`, [attacker, defender], true)

  for (const ally of allies(state, defender)) {
    if (ally === attacker || sideOf(war, ally)) continue
    if (ally === HOME) {
      raise(state, content, 'called', defender, { other: attacker, war: war.id })
      continue
    }
    const loyal = (defOf(content, ally)?.temperament.loyalty ?? 0) >= 40 && rel(state, ally, defender) >= 15 && !atWar(state, ally, attacker) && !warsOf(state, ally).length
    if (loyal) {
      war.defenders.push(ally)
      shift(state, ally, attacker, -25, 'At war.')
      remember(state, ally, `Went to war beside ${d}.`)
      log(state, week, `${nameOf(state, content, ally)} honours its pact and joins ${d}.`, [ally, defender])
    } else {
      leavePacts(state, ally, defender)
      shift(state, ally, defender, -20, 'A pact was broken.')
      remember(state, ally, `Stayed out of ${d}'s war.`)
      log(state, week, `${nameOf(state, content, ally)} breaks its pact with ${d} and stays out.`, [ally, defender])
    }
  }
  if (defender === HOME) {
    raise(state, content, 'attacked', attacker, { war: war.id, ...(region ? { region } : { region: pick(rngFor(state.seed, state.day, `invasion:${war.id}`), content.world.borderlands) }), vars: note ? { note } : {} })
  }
}

function fight(state: GameState, content: Content, war: War, week: Week, rng: Rng) {
  const w = state.world!
  const side = (list: string[], tired: number) => list.filter((m) => isFree(state, m)).reduce((sum, m) => sum + strengthOf(state, m), 0) * (1 - tired / 160)
  const a = side(war.attackers, war.weariness.attackers)
  const d = side(war.defenders, war.weariness.defenders)
  war.front = clamp(war.front + ((a - d) / Math.max(1, a + d)) * 45 + (rng() * 2 - 1) * 12, -100, 100)
  war.weeks += 1
  const sanctioned = (list: string[]) => list.some((m) => w.assembly.sanctions.some((s) => s.target === m)) ? 3 : 0
  war.weariness.attackers = clamp(war.weariness.attackers + 4 + (war.front < 0 ? 4 : 0) + sanctioned(war.attackers))
  war.weariness.defenders = clamp(war.weariness.defenders + 3 + (war.front > 0 ? 4 : 0) + sanctioned(war.defenders))

  for (const [list, losing] of [[war.attackers, war.front < 0], [war.defenders, war.front > 0]] as const) {
    for (const m of list) {
      const n = w.nations[m]
      if (n) {
        n.strength = clamp(n.strength - 1.5)
        n.wealth = clamp(n.wealth - 2)
        n.stability = clamp(n.stability - (losing ? 4 : 2))
      }
      const def = defOf(content, m)
      const chance =
        m === HOME
          ? 0.02 + (state.indicators.liberty < 40 ? 0.05 : 0) + (state.indicators.administration < 40 ? 0.04 : 0) + (losing ? 0.03 : 0)
          : 0.03 + (def?.temperament.aggression ?? 0) / 1500 + ((n?.stability ?? 60) < 30 ? 0.05 : 0) + (losing ? 0.04 : 0)
      if (rng() < chance) crime(state, content, war, m, week)
    }
  }

  const name = (list: string[]) => list.map((m) => nameOf(state, content, m)).join(' and ')
  if (war.front >= 100) return endWar(state, content, war, 'attackers', true, week, rng)
  if (war.front <= -100) return endWar(state, content, war, 'defenders', true, week, rng)
  if (war.weariness.attackers >= 100 || war.weariness.defenders >= 100) {
    const outcome = war.front >= 35 ? 'attackers' : war.front <= -35 ? 'defenders' : 'ceasefire'
    return endWar(state, content, war, outcome, false, week, rng)
  }
  if (war.weeks % 3 === 0) log(state, week, `The war between ${name(war.attackers)} and ${name(war.defenders)} goes on. ${frontText(war, war.attackers[0]!)}`, [...war.attackers, ...war.defenders])
}

function crime(state: GameState, content: Content, war: War, by: string, week: Week) {
  const victims = enemiesIn(war, by)
  const where = war.region ?? 'the occupied towns'
  const text = by === HOME
    ? `Reports that ${state.identity.name}'s soldiers shot prisoners near ${where}.`
    : `Reports that ${nameOf(state, content, by)}'s forces shelled a market and burned villages near ${where}.`
  war.crimes.push({ day: state.day, by, text })
  log(state, week, text, [by, ...victims])
  if (by === HOME) {
    raise(state, content, 'accused', victims[0] ?? by, { war: war.id })
  } else if (!state.world!.matters.some((m) => !m.decided && m.kind === 'crimes' && m.war === war.id)) {
    raise(state, content, 'crimes', by, { other: victims[0] ?? HOME, war: war.id })
  }
}

// From one side's point of view, in words.
export function frontText(war: War, from: string): string {
  const s = sideOf(war, from) === 'defenders' ? -war.front : war.front
  if (s >= 60) return 'The front is deep in enemy country.'
  if (s >= 20) return 'The front is moving forward.'
  if (s > -20) return 'The front has barely moved.'
  if (s > -60) return 'The front is falling back.'
  return 'The front is collapsing.'
}

function termsText(state: GameState, content: Content, war: War, offering: string): string {
  const s = sideOf(war, offering) === 'defenders' ? -war.front : war.front
  if (s >= 35) return `${war.region ?? 'a borderland'} and reparations`
  if (s <= -35) return 'a ceasefire on today’s lines, and reparations paid to you'
  return 'a ceasefire on today’s lines, and nothing else'
}

export function endWar(state: GameState, content: Content, war: War, outcome: 'attackers' | 'defenders' | 'ceasefire', total: boolean, week: Week, rng: Rng) {
  const w = state.world!
  war.ended = { day: state.day, outcome }
  const winners = outcome === 'attackers' ? war.attackers : outcome === 'defenders' ? war.defenders : []
  const losers = outcome === 'attackers' ? war.defenders : outcome === 'defenders' ? war.attackers : []
  const name = (list: string[]) => list.map((m) => nameOf(state, content, m)).join(' and ')
  if (outcome === 'ceasefire') {
    log(state, week, `A ceasefire ends the war between ${name(war.attackers)} and ${name(war.defenders)}.`, [...war.attackers, ...war.defenders], true)
    // Exhaustion does what diplomacy could not: for a while, nobody wants another round.
    for (const a of war.attackers) for (const b of war.defenders) if (rel(state, a, b) < -35) shift(state, a, b, -35 - rel(state, a, b), 'The guns are quiet.')
    return
  }
  log(state, week, `${name(winners)} ${total ? 'win' : 'come out ahead in'} the war with ${name(losers)}.`, [...winners, ...losers], true)

  const claim = war.cause === 'claim' ? w.claims.find((c) => !c.settled && c.region === war.region) : undefined
  if (claim) claim.settled = { day: state.day, to: winners.includes(claim.by) ? claim.by : claim.against, how: 'war' }
  for (const a of winners) for (const b of losers) shift(state, a, b, -10, 'A war lost is not forgotten.')

  if (losers.includes(HOME)) return defeat(state, content, war, winners, total)
  if (winners.includes(HOME)) {
    const alone = losers.length === 1 && losers[0] !== HOME && w.nations[losers[0]!]?.free === true
    if (total) {
      raise(state, content, 'victory', losers[0]!, { war: war.id, vars: { annexable: alone ? ` ${nameOf(state, content, losers[0]!)} stands alone: it could be annexed.` : '' } })
    } else {
      w.home.reparations.push({ to: losers[0]!, until: state.day + 4 * WEEK, by: 2 })
      const changes: Change[] = []
      applyEffects(state, [{ indicator: 'legitimacy', by: 3, why: 'The war ended on our terms.' }], changes)
      recordEntry(state, content, 'world', `${state.identity.name} comes out ahead in the war with ${name(losers)}`, changes, 'Reparations will be paid for four weeks.')
    }
    return
  }
  // Between AI nations: the beaten pay, and one that stands alone may cease to be.
  const main = winners.find((x) => x !== HOME)!
  for (const l of losers) {
    const n = w.nations[l]
    if (!n) continue
    if (total && losers.length === 1 && rng() < ANNEX_CHANCE) {
      annex(state, content, l, main, week)
    } else {
      n.wealth = clamp(n.wealth - 8)
      n.stability = clamp(n.stability - 10)
      const winner = w.nations[main]
      if (winner) winner.wealth = clamp(winner.wealth + 5)
    }
  }
}

function defeat(state: GameState, content: Content, war: War, winners: string[], total: boolean) {
  const w = state.world!
  const winner = nameOf(state, content, winners[0]!)
  const ceded = war.cause === 'claim' || total
  if (ceded) w.home.lost += 1
  const effects: Effect[] = total
    ? [
        { indicator: 'capacity', by: -6, why: `The war with ${winner} was lost, and with it ${war.region ?? 'a borderland'}.` },
        { indicator: 'living', by: -4, why: 'Defeat: shortages, refugees, a broken economy.' },
        { indicator: 'legitimacy', by: -10, why: 'The government lost the war.' },
        { indicator: 'employment', by: -3, why: 'Factories in the lost lands are gone.' },
        { indicator: 'fiscal', by: -4, why: 'The first reparations are due at once.' },
      ]
    : [
        { indicator: 'capacity', by: ceded ? -3 : -1, why: `Peace on ${winner}'s terms.` },
        { indicator: 'legitimacy', by: -6, why: 'The war ended on the enemy’s terms.' },
        { indicator: 'fiscal', by: -2, why: 'Reparations.' },
      ]
  w.home.reparations.push({ to: winners[0]!, until: state.day + (total ? 8 : 4) * WEEK, by: -2 })
  state.flags['war_lost'] = state.day
  const changes: Change[] = []
  applyEffects(state, effects, changes)
  recordEntry(
    state,
    content,
    'world',
    `${state.identity.name} loses the war with ${winner}`,
    changes,
    `${ceded ? `${war.region ?? 'A borderland'} is ceded to ${winner}. ` : ''}Reparations will be paid for ${total ? 'eight' : 'four'} weeks.`,
  )
}

function annex(state: GameState, content: Content, target: string, ruler: string, week: Week) {
  const w = state.world!
  const n = w.nations[target]
  if (!n || target === HOME) return
  n.free = false
  n.ruler = ruler
  n.annexed = state.day
  w.pacts = w.pacts.map((p) => ({ ...p, members: p.members.filter((m) => m !== target) })).filter((p) => p.members.length >= 2)
  w.assembly.members = w.assembly.members.filter((m) => m !== target)
  for (const c of w.claims) if (!c.settled && (c.by === target || c.against === target)) c.settled = { day: state.day, to: ruler, how: 'annexation' }
  for (const m of w.matters) if (!m.decided && (m.subject === target || m.other === target)) m.expires = state.day
  state.treaties = state.treaties.filter((t) => t.with !== target)
  if (ruler !== HOME) {
    const r = w.nations[ruler]
    if (r) {
      r.strength = clamp(r.strength + 8)
      r.wealth = clamp(r.wealth + n.wealth / 4)
    }
  }
  log(state, week, `${nameOf(state, content, target)} is annexed by ${nameOf(state, content, ruler)}, and is a nation no longer.`, [target, ruler], true)
}

// What being at war costs the player each week, what reparations pay or cost, and what
// holding a conquered nation down costs.
function homeAtWar(state: GameState, content: Content, week: Week) {
  const w = state.world!
  const effects: Effect[] = []
  const wars = warsOf(state, HOME)
  if (wars.length) {
    const longest = Math.max(...wars.map((x) => x.weeks))
    effects.push({ indicator: 'fiscal', by: -2, why: 'The war is paid for week by week.' }, { indicator: 'living', by: -1, why: 'Rationing, and sons and daughters at the front.' })
    if (longest > 3) effects.push({ indicator: 'legitimacy', by: -1, why: 'The war drags on.' })
    if (w.home.mobilised) effects.push({ indicator: 'capacity', by: -1, why: 'Factories are making shells, not goods.' })
  } else if (w.home.mobilised) {
    effects.push({ indicator: 'fiscal', by: -1, why: 'An army on a war footing in peacetime.' })
  }
  for (const r of w.home.reparations) {
    if (r.until < state.day) continue
    effects.push({ indicator: 'fiscal', by: r.by, why: r.by > 0 ? `Reparations from ${nameOf(state, content, r.to)}.` : `Reparations to ${nameOf(state, content, r.to)}.` })
  }
  w.home.reparations = w.home.reparations.filter((r) => r.until >= state.day)
  for (const n of Object.values(w.nations)) {
    if (n.ruler !== HOME || n.annexed === undefined) continue
    if (state.day - n.annexed <= 8 * WEEK) {
      effects.push({ indicator: 'legitimacy', by: -1, why: `${nameOf(state, content, n.id)} is held down by force.` })
    }
  }
  applyEffects(state, effects, week.changes)
}

function sanctionsWeek(state: GameState, content: Content, week: Week) {
  const w = state.world!
  w.assembly.sanctions = w.assembly.sanctions.filter((s) => s.until >= state.day)
  for (const s of w.assembly.sanctions) {
    const depth = s.hard ? 2 : s.resource ? 0.5 : 1
    if (s.target === HOME) {
      const why = s.hard ? 'The Security Council’s sanctions bite.' : s.resource ? `The embargo on ${s.resource} bites.` : 'The Assembly’s sanctions bite.'
      applyEffects(state, [{ indicator: 'fiscal', by: -Math.max(1, Math.round(depth)), why }, { indicator: 'capacity', by: -1, why: 'Exports are blocked.' }], week.changes)
      continue
    }
    const n = w.nations[s.target]
    if (n) {
      n.wealth = clamp(n.wealth - 2 * depth)
      n.stability = clamp(n.stability - depth)
    }
  }
  void content
}

// At peace, nations slowly recover towards how they started. Relations drift back towards
// where they began, and rivals on a border grate on each other week by week.
function drift(state: GameState, content: Content) {
  const w = state.world!
  for (const n of Object.values(w.nations)) {
    if (!n.free) continue
    if (!warsOf(state, n.id).length) {
      n.stability = clamp(n.stability + (n.stability < 60 ? 2 : -0.5))
      n.wealth = clamp(n.wealth + 0.5)
    }
    for (const [other, r] of Object.entries(n.relations)) {
      if (n.id < other) {
        const settled = r - r * 0.03
        n.relations[other] = clampStanding(settled)
        const o = w.nations[other]
        if (o) o.relations[n.id] = clampStanding(settled)
      }
    }
  }
  for (const a of content.neighbours) {
    for (const b of a.borders) {
      if (a.id >= b) continue
      const bd = defOf(content, b)
      if (!bd || !isFree(state, a.id) || !isFree(state, b)) continue
      const temper = Math.max(a.temperament.aggression, bd.temperament.aggression)
      const grate = temper >= 70 ? -4 : temper >= 55 ? -2.5 : Math.min(a.temperament.ambition, bd.temperament.ambition) >= 50 ? -1 : 0
      if (grate) shift(state, a.id, b, grate, 'Border incidents.')
    }
    // Standing with the player drifts a little back towards where the pack began it, and an
    // aggressive neighbour on the border keeps it a little colder than that.
    const s = state.neighbours[a.id]
    const chill = a.near && a.temperament.aggression >= 55 ? -0.6 : 0
    if (s !== undefined && isFree(state, a.id)) state.neighbours[a.id] = clampStanding(s + (a.standing - s) * 0.03 + chill)
  }
}

// ---------------------------------------------------------------------------------------
// The Assembly of Nations
// ---------------------------------------------------------------------------------------

const ROUTINE = [
  'a convention on the safety of lighthouses',
  'a resolution on fishing quotas in the northern waters',
  'a common standard for railway gauges',
  'a motion to fund the Assembly’s archives in Saint Ivo',
  'a declaration on the rights of migratory birds',
  'a convention on the return of lost post',
]

function assemblyWeek(state: GameState, content: Content, week: Week, rng: Rng) {
  const a = state.world!.assembly
  if (a.motion && state.day >= a.next) {
    sit(state, content, a.motion, week)
    a.past.push(a.motion)
    if (a.past.length > 30) a.past = a.past.slice(-30)
    a.motion = null
    a.next = nextSitting(state.day)
  }
  if (state.day >= state.world!.council.election) councilElection(state, content, week)
  if (!a.motion && a.next - state.day <= WEEK) {
    // A proposal put down waits its turn; otherwise the Assembly sets its own business.
    const queued = a.queue.shift()
    a.motion = queued ? { ...queued, day: a.next } : chooseMotion(state, content, rng)
    if (a.members.includes(HOME) && a.motion.by !== HOME) raise(state, content, 'vote', a.motion.target ?? HOME, { motion: a.motion.id, vars: { motion: a.motion.title } })
  }
}

function chooseMotion(state: GameState, content: Content, rng: Rng): Motion {
  const w = state.world!
  const make = (kind: MotionKind, title: string, extra: Partial<Motion> = {}): Motion => ({ id: nextId(w, 'motion'), kind, title, day: w.assembly.next, ...extra })
  const n = (id: string) => nameOf(state, content, id)
  const wars = activeWars(state)
  const tried = (war: War, by: string) => w.assembly.past.some((m) => m.kind === 'tribunal' && m.war === war.id && m.target === by)
  const appealed = wars.find((war) => w.matters.some((m) => m.war === war.id && m.decided?.option === 'appeal'))
  if (appealed && !w.assembly.past.some((m) => m.kind === 'ceasefire' && m.war === appealed.id)) {
    return make('ceasefire', `a call for a ceasefire between ${appealed.attackers.map(n).join(' and ')} and ${appealed.defenders.map(n).join(' and ')}`, { war: appealed.id })
  }
  for (const war of wars) {
    const counts = new Map<string, number>()
    for (const c of war.crimes) counts.set(c.by, (counts.get(c.by) ?? 0) + 1)
    const requested = w.matters.some((m) => m.war === war.id && m.decided && ['tribunal'].includes(m.decided.option))
    const worst = [...counts].filter(([by, k]) => (k >= 2 || requested) && !tried(war, by)).sort((x, y) => y[1] - x[1])[0]
    if (worst) return make('tribunal', `a tribunal for war crimes by ${n(worst[0])}`, { target: worst[0], war: war.id })
  }
  const referred = w.claims.find((c) => c.referred && !c.settled)
  if (referred) return make('arbitration', `arbitration of ${n(referred.by)}'s claim to ${referred.region}`, { claim: referred.id, target: referred.by })
  const long = wars.find((war) => war.weeks >= 3 && !w.assembly.past.some((m) => m.war === war.id && m.kind === 'ceasefire' && state.day - m.day < 6 * WEEK))
  if (long) return make('ceasefire', `a call for a ceasefire between ${long.attackers.map(n).join(' and ')} and ${long.defenders.map(n).join(' and ')}`, { war: long.id })
  const aggressor = wars.map((war) => war.attackers[0]!).find((x) => !w.assembly.sanctions.some((s) => s.target === x))
  if (aggressor) return make('sanctions', `sanctions on ${n(aggressor)}`, { target: aggressor })
  const needy = Object.values(w.nations).filter((x) => x.free && x.stability < 30).sort((x, y) => x.stability - y.stability)[0]
  if (needy) return make('aid', `a humanitarian fund for ${n(needy.id)}`, { target: needy.id })
  return make('routine', pick(rng, ROUTINE))
}

function voteOf(state: GameState, content: Content, member: string, motion: Motion): 'aye' | 'no' | 'abstain' {
  const own = interestOf(state, content, member, motion)
  // The player's own proposal: friends lean its way, enemies against, unless it touches them.
  if (motion.by && motion.by !== member && motion.target !== member && !allies(state, motion.target ?? '').includes(member)) {
    const r = rel(state, member, motion.by)
    if (r >= 40 && own !== 'no') return 'aye'
    if (r <= -40 && own !== 'aye') return 'no'
  }
  return own
}

function interestOf(state: GameState, content: Content, member: string, motion: Motion): 'aye' | 'no' | 'abstain' {
  const t = defOf(content, member)?.temperament ?? { ambition: 50, aggression: 30, loyalty: 50, charity: 50 }
  const w = state.world!
  const war = motion.war ? w.wars.find((x) => x.id === motion.war) : undefined
  switch (motion.kind) {
    case 'binding-ceasefire':
    case 'peacekeepers':
    case 'ceasefire': {
      if (!war) return 'aye'
      const side = sideOf(war, member)
      if (!side) return t.aggression >= 70 ? 'abstain' : 'aye'
      const ahead = side === 'attackers' ? war.front > 20 : war.front < -20
      return ahead ? 'no' : 'aye'
    }
    case 'force': {
      // War on someone's behalf: only against a nation it already dislikes.
      const target = motion.target!
      if (member === target || allies(state, target).includes(member)) return 'no'
      const r = rel(state, member, target)
      if (r <= -10 && t.aggression >= 25) return 'aye'
      return r >= 30 ? 'no' : 'abstain'
    }
    case 'expel':
    case 'condemnation':
    case 'embargo':
    case 'hard-sanctions':
    case 'sanctions':
    case 'tribunal': {
      const target = motion.target!
      if (member === target || allies(state, target).includes(member)) return 'no'
      const r = rel(state, member, target)
      if (r <= 10) return 'aye'
      return r >= 40 ? 'no' : 'abstain'
    }
    case 'arbitration': {
      const claim = w.claims.find((c) => c.id === motion.claim)
      if (!claim) return 'abstain'
      if (member === claim.by) return 'aye'
      if (member === claim.against) return 'no'
      const lean = rel(state, member, claim.by) - rel(state, member, claim.against)
      return lean > 5 ? 'aye' : lean < -5 ? 'no' : 'abstain'
    }
    case 'aid':
      return t.charity >= 30 || rel(state, member, motion.target!) >= 0 ? 'aye' : 'abstain'
    case 'admit':
      return rel(state, member, motion.target!) <= -40 ? 'no' : 'aye'
    case 'routine':
      return t.ambition >= 75 ? 'abstain' : 'aye'
  }
}

function sit(state: GameState, content: Content, motion: Motion, week: Week) {
  const w = state.world!
  const votes: Record<string, 'aye' | 'no' | 'abstain'> = {}
  for (const m of w.assembly.members) {
    if (m === HOME) continue
    if (!w.nations[m]?.free) continue
    votes[m] = voteOf(state, content, m, motion)
  }
  if (w.assembly.members.includes(HOME)) votes[HOME] = motion.votes?.[HOME] ?? 'abstain'
  const ayes = Object.values(votes).filter((v) => v === 'aye').length
  const noes = Object.values(votes).filter((v) => v === 'no').length
  motion.votes = votes
  // Expelling a member takes two thirds of those voting; everything else a simple majority.
  motion.passed = motion.kind === 'expel' ? ayes >= ((ayes + noes) * 2) / 3 && ayes > 0 : ayes > noes
  const title = motion.title.charAt(0).toUpperCase() + motion.title.slice(1)
  const changes: Change[] = []
  const lines: string[] = [`The Assembly of Nations ${motion.passed ? 'adopts' : 'rejects'} ${motion.title}, ${ayes} to ${noes}.`]
  if (motion.text) lines.push(`${motion.by === HOME ? `${state.identity.name}'s` : 'The'} motion read: “${motion.text}”`)
  if (motion.passed) carry(state, content, motion, votes, changes, lines)
  else if (motion.kind === 'arbitration') {
    // The Assembly found against the claimant: the land stays where it is.
    const claim = w.claims.find((c) => c.id === motion.claim && !c.settled)
    if (claim) {
      claim.settled = { day: state.day, to: claim.against, how: 'arbitration' }
      lines.push(`${claim.region} stays with ${nameOf(state, content, claim.against)}.`)
    }
  }
  log(state, week, lines[0]!, motion.target ? [motion.target] : [], false)
  if (motion.kind !== 'routine' || votes[HOME]) {
    recordEntry(state, content, 'world', `The Assembly of Nations: ${title} ${motion.passed ? 'carried' : 'defeated'}`, changes, lines.join(' '))
  }
}

function carry(state: GameState, content: Content, motion: Motion, votes: Record<string, string>, changes: Change[], lines: string[]) {
  const w = state.world!
  const ayes = Object.keys(votes).filter((m) => votes[m] === 'aye')
  const target = motion.target
  const home = w.assembly.members.includes(HOME)
  switch (motion.kind) {
    case 'ceasefire': {
      const war = w.wars.find((x) => x.id === motion.war && !x.ended)
      if (war) {
        war.weariness.attackers = clamp(war.weariness.attackers + 25)
        war.weariness.defenders = clamp(war.weariness.defenders + 25)
        lines.push('Both sides are told to stop; neither will find it easier to go on.')
      }
      return
    }
    case 'sanctions':
      if (!target) return
      w.assembly.sanctions.push({ target, until: state.day + 8 * WEEK })
      if (target === HOME) {
        for (const a of ayes) shift(state, HOME, a, -5, 'It voted to sanction us.', changes)
        lines.push(`${state.identity.name} is under the Assembly’s sanctions for eight weeks.`)
      } else {
        for (const a of ayes) shift(state, a, target, -5, 'Sanctions.')
        if (home && state.treaties.some((t) => t.with === target)) {
          state.treaties = state.treaties.filter((t) => t.with !== target)
          lines.push(`${state.identity.name}'s treaties with ${nameOf(state, content, target)} are suspended under the sanctions.`)
        }
      }
      return
    case 'tribunal':
      if (!target) return
      if (target === HOME) {
        applyEffects(state, [{ indicator: 'legitimacy', by: -6, why: 'The Assembly found our forces guilty of war crimes.' }], changes)
        for (const a of ayes) shift(state, HOME, a, -5, 'It voted to try our commanders.', changes)
      } else {
        const n = w.nations[target]
        if (n) n.stability = clamp(n.stability - 10)
        for (const a of ayes) shift(state, a, target, -5, 'War crimes.')
        if (votes[HOME] === 'aye') shift(state, HOME, target, -5, 'We voted to try its commanders.', changes)
      }
      return
    case 'arbitration': {
      const claim = w.claims.find((c) => c.id === motion.claim && !c.settled)
      if (!claim) return
      claim.settled = { day: state.day, to: claim.by, how: 'arbitration' }
      if (claim.against === HOME) {
        w.home.lost += 1
        applyEffects(state, [{ indicator: 'capacity', by: -2, why: `${claim.region} is awarded to ${nameOf(state, content, claim.by)} by the Assembly.` }], changes)
      }
      lines.push(`${claim.region} is awarded to ${nameOf(state, content, claim.by)}.`)
      return
    }
    case 'aid':
      if (!target) return
      giveAid(state, HOME, target, 12, 5)
      if (home) applyEffects(state, [{ indicator: 'fiscal', by: -1, why: `Our share of the Assembly’s fund for ${nameOf(state, content, target)}.` }], changes)
      return
    case 'condemnation':
      if (!target) return
      if (target === HOME) {
        applyEffects(state, [{ indicator: 'legitimacy', by: -2, why: 'The Assembly condemned us.' }], changes)
        for (const a of ayes) shift(state, HOME, a, -3, 'It voted to condemn us.', changes)
      } else for (const a of ayes) shift(state, a, target, -4, 'Condemned before the Assembly.')
      return
    case 'embargo':
      if (!target) return
      w.assembly.sanctions.push({ target, until: state.day + 8 * WEEK, resource: motion.resource ?? 'trade' })
      if (target !== HOME && home && state.treaties.some((t) => t.with === target && (motion.resource ? t.kind.startsWith(motion.resource) : true))) {
        state.treaties = state.treaties.filter((t) => !(t.with === target && (motion.resource ? t.kind.startsWith(motion.resource) : true)))
        lines.push(`${state.identity.name}'s ${motion.resource ?? 'trade'} treaty with ${nameOf(state, content, target)} is suspended under the embargo.`)
      }
      return
    case 'admit':
      if (target && !w.assembly.members.includes(target)) w.assembly.members.push(target)
      return
    case 'expel':
      if (!target) return
      w.assembly.members = w.assembly.members.filter((m) => m !== target)
      if (target === HOME) {
        applyEffects(state, [{ indicator: 'legitimacy', by: -5, why: 'Expelled from the Assembly of Nations.' }], changes)
        for (const m of w.matters) if (!m.decided && m.kind === 'vote') m.expires = state.day
      }
      lines.push(`${nameOf(state, content, target)} is expelled from the Assembly.`)
      return
    case 'routine':
      return
    default:
      return
  }
}

// ---------------------------------------------------------------------------------------
// The Security Council
// ---------------------------------------------------------------------------------------

function councilWeek(state: GameState, content: Content, week: Week) {
  const c = state.world!.council
  if (c.motion && state.day >= c.next) {
    councilSit(state, content, c.motion, week)
    c.past.push(c.motion)
    if (c.past.length > 30) c.past = c.past.slice(-30)
    c.motion = null
    c.next = nextCouncil(state.day)
  }
  if (!c.motion && c.next - state.day <= WEEK) {
    const queued = c.queue.shift()
    const motion = queued ? { ...queued, day: c.next } : councilBusiness(state, content)
    if (!motion) {
      // Nothing worth the Council's time: it does not sit this fortnight.
      if (c.next - state.day <= 0) c.next = nextCouncil(state.day)
      return
    }
    c.motion = motion
    if (councilMembers(state).includes(HOME) && motion.by !== HOME) raise(state, content, 'council', motion.target ?? HOME, { motion: motion.id, vars: { motion: motion.title } })
  }
  if (!c.motion && c.next <= state.day) c.next = nextCouncil(state.day)
}

// What the Council takes up by itself: only war, and only when it has gone on long enough.
function councilBusiness(state: GameState, content: Content): Motion | null {
  const w = state.world!
  const n = (id: string) => nameOf(state, content, id)
  const recently = (war: War) => w.council.past.some((m) => m.war === war.id && state.day - m.day < 8 * WEEK)
  for (const war of activeWars(state)) {
    if (recently(war)) continue
    const aggressor = war.attackers[0]!
    const make = (kind: MotionKind, title: string, target?: string): Motion => ({ id: nextId(w, 'motion'), kind, title, day: w.council.next, war: war.id, ...(target ? { target } : {}) })
    const between = `${war.attackers.map(n).join(' and ')} and ${war.defenders.map(n).join(' and ')}`
    if (war.crimes.length >= 2 || (war.cause === 'conquest' && war.front >= 60)) return make('force', `force authorised against ${n(aggressor)}`, aggressor)
    if (war.weeks >= 6) return make('binding-ceasefire', `a binding ceasefire between ${between}`)
    if (w.assembly.sanctions.some((s) => s.target === aggressor) && war.weeks >= 3) return make('hard-sanctions', `hard sanctions on ${n(aggressor)}`, aggressor)
    if (war.weeks >= 3 && !war.peacekeepers) return make('peacekeepers', `peacekeepers between ${between}`)
  }
  return null
}

function councilSit(state: GameState, content: Content, motion: Motion, week: Week) {
  const w = state.world!
  const members = councilMembers(state)
  const votes: Record<string, 'aye' | 'no' | 'abstain'> = {}
  for (const m of members) votes[m] = m === HOME ? (motion.votes?.[HOME] ?? 'abstain') : voteOf(state, content, m, motion)
  const ayes = Object.values(votes).filter((v) => v === 'aye').length
  const noes = Object.values(votes).filter((v) => v === 'no').length
  const vetoed = w.council.permanent.filter((p) => votes[p] === 'no')
  motion.votes = votes
  motion.vetoed = vetoed
  motion.passed = ayes >= 5 && vetoed.length === 0
  const n = (id: string) => nameOf(state, content, id)
  const title = motion.title.charAt(0).toUpperCase() + motion.title.slice(1)
  const changes: Change[] = []
  const lines = [
    vetoed.length
      ? `The Security Council fails to adopt ${motion.title}: ${ayes} for, ${noes} against, vetoed by ${vetoed.map(n).join(' and ')}.`
      : `The Security Council ${motion.passed ? 'adopts' : 'rejects'} ${motion.title}, ${ayes} to ${noes}.`,
  ]
  if (motion.text) lines.push(`${motion.by === HOME ? `${state.identity.name}'s` : 'The'} resolution read: “${motion.text}”`)
  if (motion.passed) councilCarry(state, content, motion, changes, lines, week)
  log(state, week, lines[0]!, motion.target ? [motion.target] : [], true)
  recordEntry(state, content, 'world', `The Security Council: ${title} ${motion.passed ? 'adopted' : vetoed.length ? 'vetoed' : 'defeated'}`, changes, lines.join(' '))
}

function councilCarry(state: GameState, content: Content, motion: Motion, changes: Change[], lines: string[], week: Week) {
  const w = state.world!
  const war = motion.war ? w.wars.find((x) => x.id === motion.war && !x.ended) : undefined
  const n = (id: string) => nameOf(state, content, id)
  switch (motion.kind) {
    case 'binding-ceasefire':
      if (war) endWar(state, content, war, 'ceasefire', false, week, rngFor(state.seed, state.day, `council:${motion.id}`))
      lines.push('The guns are to stop, and they do.')
      return
    case 'peacekeepers':
      if (war) {
        war.peacekeepers = true
        war.weariness.attackers = clamp(war.weariness.attackers + 30)
        war.weariness.defenders = clamp(war.weariness.defenders + 30)
      }
      lines.push('Peacekeepers deploy along the front.')
      return
    case 'hard-sanctions':
      if (!motion.target) return
      w.assembly.sanctions.push({ target: motion.target, until: state.day + 12 * WEEK, hard: true })
      if (motion.target === HOME) applyEffects(state, [{ indicator: 'legitimacy', by: -3, why: 'The Security Council put us under sanctions.' }], changes)
      else if (state.treaties.some((t) => t.with === motion.target)) {
        state.treaties = state.treaties.filter((t) => t.with !== motion.target)
        lines.push(`${state.identity.name}'s treaties with ${n(motion.target)} are suspended.`)
      }
      return
    case 'force': {
      const target = motion.target
      if (!target) return
      const fight = war ?? activeWars(state).find((x) => sideOf(x, target))
      if (!fight) return
      const enemySide = sideOf(fight, target) === 'attackers' ? 'defenders' : 'attackers'
      for (const m of councilMembers(state)) {
        if (m === HOME || m === target || sideOf(fight, m) || allies(state, target).includes(m)) continue
        if ((defOf(content, m)?.temperament.aggression ?? 0) < 25 || rel(state, m, target) > -10) continue
        fight[enemySide].push(m)
        shift(state, m, target, -25, 'At war under the Council.')
        lines.push(`${n(m)} joins the coalition.`)
      }
      if (!sideOf(fight, HOME)) raise(state, content, 'coalition', target, { war: fight.id })
      return
    }
    default:
      return
  }
}

// Every three months the Assembly fills the Council seats that are up. Each member votes for
// the candidate it likes best; the player stands only if it put itself forward.
function councilElection(state: GameState, content: Content, week: Week) {
  const w = state.world!
  const c = w.council
  c.election = nextSitting(state.day + 12 * WEEK)
  const up = c.elected.filter((e) => e.until <= state.day + WEEK || !isFree(state, e.id))
  const seats = up.length
  if (!seats) return
  const sitting = new Set(councilMembers(state).filter((m) => !up.some((e) => e.id === m)))
  const free = content.neighbours.map((x) => x.id).filter((id) => isFree(state, id) && !sitting.has(id) && w.assembly.members.includes(id))
  const ranked = free.sort((a, b) => strengthOf(state, b) + (w.nations[b]?.wealth ?? 0) / 2 - (strengthOf(state, a) + (w.nations[a]?.wealth ?? 0) / 2) || a.localeCompare(b))
  const candidates = [...new Set([...c.candidates.filter((x) => x === HOME && w.assembly.members.includes(HOME) && !sitting.has(HOME)), ...ranked.slice(0, seats + 3)])]
  const tally = new Map(candidates.map((x) => [x, 0]))
  for (const m of w.assembly.members) {
    if (m === HOME) {
      if (tally.has(HOME)) tally.set(HOME, tally.get(HOME)! + 1)
      continue
    }
    if (!isFree(state, m)) continue
    // A member votes for as many as there are seats: the candidates it likes best.
    const liked = candidates.filter((x) => x !== m).sort((a, b) => rel(state, m, b) - rel(state, m, a) || a.localeCompare(b)).slice(0, seats)
    for (const x of liked) tally.set(x, tally.get(x)! + 1)
  }
  const winners = [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, seats).map(([x]) => x)
  c.elected = [...c.elected.filter((e) => !up.includes(e)), ...winners.map((id) => ({ id, until: state.day + 26 * WEEK }))]
  const n = (id: string) => nameOf(state, content, id)
  const stood = c.candidates.includes(HOME)
  c.candidates = []
  const text = `Elected to the Security Council for six months: ${winners.map((x) => `${n(x)} (${tally.get(x)} votes)`).join(', ')}.${stood && !winners.includes(HOME) ? ` ${state.identity.name} stood and was not elected, with ${tally.get(HOME) ?? 0} votes.` : ''}`
  log(state, week, text, winners, stood)
  if (stood || winners.includes(HOME)) recordEntry(state, content, 'world', winners.includes(HOME) ? `${state.identity.name} is elected to the Security Council` : `${state.identity.name} fails to win a seat on the Security Council`, [], text)
}

// ---------------------------------------------------------------------------------------
// Foreign matters
// ---------------------------------------------------------------------------------------

function raise(
  state: GameState,
  content: Content,
  kind: MatterKind,
  subject: string,
  extra: { other?: string; region?: string; war?: string; claim?: string; motion?: string; vars?: Record<string, string> } = {},
) {
  const w = state.world!
  if (!content.world.matters.some((m) => m.kind === kind)) return
  if (w.matters.some((m) => !m.decided && m.kind === kind && m.subject === subject && m.war === extra.war)) return
  const { vars = {}, ...rest } = extra
  w.matters.push({ id: nextId(w, 'matter'), kind, day: state.day, expires: state.day + MATTER_DAYS, subject, ...rest, vars })
}

export function openMatters(state: GameState): Matter[] {
  return state.world?.matters.filter((m) => !m.decided && m.expires > state.day) ?? []
}

function defFor(content: Content, matter: Matter): MatterDef {
  const def = content.world.matters.find((m) => m.kind === matter.kind)
  if (!def) throw new Error(`the pack has no foreign matter of kind ${matter.kind}`)
  return def
}

// The options that can be taken now: annexing only a beaten nation that stands alone.
export function matterOptions(state: GameState, content: Content, matter: Matter): MatterOptionDef[] {
  return defFor(content, matter).options.filter((o) => {
    if (o.does === 'annex') return Boolean(matter.vars['annexable']) && state.world?.nations[matter.subject]?.free === true
    return true
  })
}

export function fillMatter(text: string, state: GameState, content: Content, matter: Matter): string {
  const subject = matter.subject === HOME ? undefined : defOf(content, matter.subject)
  const words: Record<string, string> = {
    other: matter.other ? nameOf(state, content, matter.other) : '',
    region: matter.region ?? matter.vars['region'] ?? 'the borderland',
    motion: matter.vars['motion'] ?? '',
    ally: matter.vars['ally'] ?? '',
    need: matter.vars['need'] ?? '',
    strength_word: matter.vars['strength_word'] ?? '',
    weeks: matter.vars['weeks'] ?? '',
    terms: matter.vars['terms'] ?? '',
    front: (matter.vars['front'] ?? '').replace(/\.$/, '').toLowerCase(),
    annexable: matter.vars['annexable'] ?? '',
  }
  const filled = text.replace(/\{([a-z_]+)(?::([a-z_]+))?\}/g, (whole, key: string, arg?: string) => {
    if (key === 'subject') {
      if (matter.subject === HOME) return state.identity.name
      if (!subject) return whole
      if (arg === 'demonym') return subject.demonym
      if (arg === 'leader') return subject.leader
      return arg ? whole : subject.name
    }
    if (!arg && Object.hasOwn(words, key)) return words[key]!
    return whole
  })
  return render(filled, state, content)
}

export interface MatterCard {
  id: string
  kind: MatterKind
  day: number
  expires: number
  subject: string
  title: string
  description: string
  note?: string
  options: { id: string; label: string; lapse: boolean }[]
}

export function matterCard(state: GameState, content: Content, matter: Matter): MatterCard {
  const def = defFor(content, matter)
  return {
    id: matter.id,
    kind: matter.kind,
    day: matter.day,
    expires: matter.expires,
    subject: matter.subject,
    title: fillMatter(def.title, state, content, matter),
    description: fillMatter(def.description, state, content, matter),
    ...(matter.vars['note'] ? { note: matter.vars['note'] } : {}),
    options: matterOptions(state, content, matter).map((o) => ({ id: o.id, label: fillMatter(o.label, state, content, matter), lapse: Boolean(o.lapse) })),
  }
}

export function decideMatter(input: GameState, content: Content, matterId: string, optionId: string): GameState {
  const state = structuredClone(input)
  const matter = state.world?.matters.find((m) => m.id === matterId)
  if (!matter || matter.decided || matter.expires <= state.day) throw new Error(`${matterId} is not a foreign matter waiting for a decision`)
  const option = matterOptions(state, content, matter).find((o) => o.id === optionId)
  if (!option) throw new Error(`${optionId} is not an option on this matter`)
  settleMatter(state, content, matter, option, false)
  return state
}

function lapseMatters(state: GameState, content: Content) {
  for (const matter of state.world!.matters) {
    if (matter.decided || matter.expires > state.day) continue
    const option = matterOptions(state, content, matter).find((o) => o.lapse)
    if (option && state.world!.nations[matter.subject]?.free !== false) settleMatter(state, content, matter, option, true)
    else matter.decided = { day: state.day, option: 'lapsed' }
  }
  state.world!.matters = state.world!.matters.filter((m) => !m.decided || state.day - m.decided.day <= 4 * WEEK)
}

function settleMatter(state: GameState, content: Content, matter: Matter, option: MatterOptionDef, lapsed: boolean) {
  const w = state.world!
  const changes: Change[] = []
  const subject = matter.subject
  const effects = option.effects.map((e) => ('why' in e ? { ...e, why: fillMatter(e.why, state, content, matter) } : e))
  applyEffects(state, effects, changes, subject === HOME ? undefined : subject)
  if (option.other && matter.other) shift(state, HOME, matter.other, option.other, fillMatter(option.headline, state, content, matter), changes)
  const war = matter.war ? w.wars.find((x) => x.id === matter.war) : undefined
  const claim = matter.claim ? w.claims.find((c) => c.id === matter.claim) : undefined
  const week: Week = { changes, lines: [] }
  const rng = rngFor(state.seed, state.day, `matter:${matter.id}`)
  switch (option.does) {
    case 'negotiate':
      if (claim && rng() < 0.4) claim.settled = { day: state.day, to: HOME, how: 'talks' }
      break
    case 'refer':
      if (claim) claim.referred = true
      break
    case 'cede':
      if (claim) claim.settled = { day: state.day, to: claim.by, how: 'ceded' }
      w.home.lost += 1
      break
    case 'aid':
      giveAid(state, HOME, subject, 8, 3)
      break
    case 'token':
      giveAid(state, HOME, subject, 3, 1)
      break
    case 'join':
      if (war && !war.ended && !sideOf(war, HOME)) {
        // Called by an ally, or by the Council: either way, against the subject's enemy, or the subject.
        const against = matter.kind === 'coalition' ? subject : matter.other
        const side = against && sideOf(war, against) === 'attackers' ? 'defenders' : 'attackers'
        war[matter.kind === 'coalition' ? side : 'defenders'].push(HOME)
      }
      break
    case 'arms': {
      const n = w.nations[subject]
      if (n) n.strength = clamp(n.strength + 5)
      break
    }
    case 'abandon':
      leavePacts(state, HOME, subject)
      break
    case 'fight':
    case 'appeal':
      // The player is already a defender in the war; an appeal is read when the motion is set.
      break
    case 'capitulate':
      if (war && !war.ended) {
        war.ended = { day: state.day, outcome: 'terms' }
        w.home.lost += 1
      }
      break
    case 'ally':
      joinPact(state, HOME, subject)
      break
    case 'peace':
      if (war && !war.ended) makePeace(state, content, war, changes)
      break
    case 'reparations':
      w.home.reparations.push({ to: subject, until: state.day + 8 * WEEK, by: 2 })
      break
    case 'annex':
      annex(state, content, subject, HOME, week)
      applyEffects(state, [{ indicator: 'capacity', by: 3, why: `${nameOf(state, content, subject)}'s mines and harbours are ours now.` }], changes)
      break
    case 'aye':
    case 'no':
    case 'abstain': {
      const motion = matter.kind === 'council' ? w.council.motion : w.assembly.motion
      if (motion && motion.id === matter.motion) motion.votes = { ...(motion.votes ?? {}), [HOME]: option.does }
      break
    }
    case 'inquiry':
      if (war) war.crimes = war.crimes.filter((c) => c.by !== HOME)
      break
  }
  matter.decided = { day: state.day, option: option.id }
  const result = fillMatter(option.result, state, content, matter)
  recordEntry(state, content, 'world', fillMatter(option.headline, state, content, matter), changes, lapsed ? `No decision was taken in time. ${result}` : result)
  if (subject !== HOME) remember(state, subject, `${state.identity.name}: ${fillMatter(option.headline, state, content, matter)}.`)
}

// The player's war ends on the terms the front allows.
function makePeace(state: GameState, content: Content, war: War, changes: Change[]) {
  const w = state.world!
  const ahead = (sideOf(war, HOME) === 'defenders' ? -war.front : war.front) >= 35
  const behind = (sideOf(war, HOME) === 'defenders' ? -war.front : war.front) <= -35
  war.ended = { day: state.day, outcome: 'terms' }
  const enemy = enemiesIn(war, HOME)[0]
  if (!enemy) return
  if (ahead) w.home.reparations.push({ to: enemy, until: state.day + 4 * WEEK, by: 2 })
  if (behind) {
    w.home.lost += 1
    w.home.reparations.push({ to: enemy, until: state.day + 4 * WEEK, by: -2 })
    applyEffects(state, [{ indicator: 'capacity', by: -2, why: `${war.region ?? 'A borderland'} is ceded in the peace.` }], changes)
  }
  void content
}

// The Foreign Ministry's view, from the rules: shown on the card, and what an AI executive
// takes in found mode. Never a model call.
export function adviseMatter(state: GameState, content: Content, matter: Matter): { option: string; reason: string } | null {
  const options = matterOptions(state, content, matter)
  const take = (does: string, reason: string) => {
    const o = options.find((x) => x.does === does)
    return o ? { option: o.id, reason } : null
  }
  const w = state.world
  if (!w) return null
  const subject = matter.subject
  const mine = homeStrength(state)
  const theirs = strengthOf(state, subject)
  const war = matter.war ? w.wars.find((x) => x.id === matter.war) : undefined
  switch (matter.kind) {
    case 'claim':
      if (mine >= theirs * 1.1) return take('firm', 'We are the stronger, and a concession now invites the next claim.')
      if (w.assembly.members.includes(HOME)) return take('refer', 'Let the Assembly decide: a ruling we can live with beats a war we might lose.')
      return take('negotiate', 'Talk, and buy time.')
    case 'aid':
      if (state.indicators.fiscal >= 45 && (state.neighbours[subject] ?? 0) >= 0) return take('aid', 'We can afford it, and friends remember who came.')
      return take('token', 'The budget is tight: send something, and say so warmly.')
    case 'called': {
      const enemy = matter.other ? strengthOf(state, matter.other) : 0
      if (mine + theirs >= enemy * 0.9) return take('join', 'Together we can hold them, and a pact that is not kept is worthless.')
      return take('arms', 'We cannot win this war, but we can help them fight it.')
    }
    case 'attacked':
      if (mine >= theirs * 0.7) return take('appeal', 'Fight, and make the Assembly take our side.')
      return take('capitulate', 'We cannot hold them. Every week of war will cost more than the land.')
    case 'crimes':
      if ((state.neighbours[subject] ?? 0) < 20) return take('tribunal', 'This should be tried, and they are no friend of ours.')
      return take('condemn', 'Say it plainly, and leave the door open.')
    case 'accused':
      return take('inquiry', 'An inquiry now costs less than a tribunal later.')
    case 'pact':
      if ((state.neighbours[subject] ?? 0) >= 50 && !warsOf(state, subject).length) return take('ally', 'A friend worth having, and at peace.')
      return take('none', 'Their enemies would become ours. Not yet.')
    case 'terms': {
      const s = war ? (sideOf(war, HOME) === 'defenders' ? -war.front : war.front) : 0
      if (s >= 35) return take('none', 'We are winning. Their terms will improve.')
      return take('peace', 'Take the terms: the war is costing more than it can win.')
    }
    case 'victory':
      if (matter.vars['annexable'] && state.indicators.liberty < 45) return take('annex', 'They stand alone. Take the country, and hold it.')
      return take('reparations', 'Make them pay, and leave them a country to pay from.')
    case 'vote':
    case 'council': {
      const motion = matter.kind === 'vote' ? w.assembly.motion : w.council.motion
      if (!motion || motion.id !== matter.motion) return take('abstain', 'Nothing to vote on.')
      const v = interestOf(state, content, HOME, motion)
      const veto = matter.kind === 'council' && v === 'no' && w.council.permanent.includes(HOME)
      return take(v, v === 'aye' ? 'In our interest, and right.' : veto ? 'Against our interest: our no is a veto.' : v === 'no' ? 'Against our interest and our friends.' : 'Nothing in it for us either way.')
    }
    case 'coalition': {
      const enemy = strengthOf(state, subject)
      if (mine >= enemy * 0.6 && (state.neighbours[subject] ?? 0) < 0) return take('join', 'The Council has spoken, and the coalition is strong enough to win.')
      return take('none', 'Others can carry this one; our army is needed at home.')
    }
  }
}

// ---------------------------------------------------------------------------------------
// The player's own moves, from the World page
// ---------------------------------------------------------------------------------------

// Why the player may not take this action now, or null if they may.
export function forbidden(state: GameState, content: Content, action: WorldAction): string | null {
  const w = state.world
  if (!w) return 'There is no world in this pack.'
  if ('pact' in action || 'war' in action) {
    const id = 'pact' in action ? action.pact : action.war
    if (!w.nations[id]) return `${id} is not a nation.`
    if (!w.nations[id]!.free) return `${nameOf(state, content, id)} is no longer a nation.`
    if ('pact' in action) {
      if (allies(state, HOME).includes(id)) return `${state.identity.name} already has a pact with ${nameOf(state, content, id)}.`
      if (atWar(state, HOME, id)) return 'Not with a nation you are at war with.'
      return null
    }
    if (atWar(state, HOME, id)) return `${state.identity.name} is already at war with ${nameOf(state, content, id)}.`
    if (allies(state, HOME).includes(id)) return 'Break the pact before going to war with an ally.'
    const near = bordersOf(state, content, HOME).includes(id)
    const claimed = w.claims.some((c) => !c.settled && ((c.by === id && c.against === HOME) || (c.by === HOME && c.against === id)))
    const allyAtWar = allies(state, HOME).some((a) => atWar(state, a, id))
    if (!near && !claimed && !allyAtWar) return `${state.identity.name} can only go to war with a nation on its border, one in a dispute with it, or one at war with an ally.`
    return null
  }
  if ('peace' in action) {
    const war = w.wars.find((x) => x.id === action.peace && !x.ended)
    if (!war || !sideOf(war, HOME)) return `${state.identity.name} is not in that war.`
    return null
  }
  if ('assembly' in action) {
    const member = w.assembly.members.includes(HOME)
    if (action.assembly === 'join' && member) return 'Already a member.'
    if (action.assembly === 'leave' && !member) return 'Not a member.'
    return null
  }
  if ('council' in action) {
    if (!w.assembly.members.includes(HOME)) return 'Only a member of the Assembly can stand for the Security Council.'
    if (councilMembers(state).includes(HOME)) return `${state.identity.name} already sits on the Security Council.`
    if (w.council.candidates.includes(HOME)) return `${state.identity.name} is already standing.`
    return null
  }
  if ('propose' in action) return proposalProblem(state, content, action.propose)
  if (action.mobilise === w.home.mobilised) return action.mobilise ? 'Already mobilised.' : 'Not mobilised.'
  return null
}

function proposalProblem(state: GameState, content: Content, p: Proposal): string | null {
  const w = state.world!
  const council = p.body === 'council'
  if (council) {
    if (!(COUNCIL_MOTIONS as readonly string[]).includes(p.kind)) return `The Security Council takes ${COUNCIL_MOTIONS.join(', ')}.`
    if (!councilMembers(state).includes(HOME)) return `Only a member of the Security Council can put a resolution to it. Stand for a seat at the next election.`
    if (w.council.queue.some((m) => m.by === HOME) || w.council.motion?.by === HOME) return 'A resolution of yours is already before the Council.'
  } else {
    if (!(ASSEMBLY_MOTIONS as readonly string[]).includes(p.kind) || p.kind === 'routine') return `The Assembly takes ${ASSEMBLY_MOTIONS.filter((k) => k !== 'routine').join(', ')}.`
    if (!w.assembly.members.includes(HOME)) return `${state.identity.name} has left the Assembly; rejoin it to put down a motion.`
    if (w.assembly.queue.some((m) => m.by === HOME) || w.assembly.motion?.by === HOME) return 'A motion of yours is already before the Assembly.'
  }
  const need = PROPOSAL_NEEDS[p.kind]
  if (need === 'war') {
    if (!p.war || !w.wars.some((x) => x.id === p.war && !x.ended)) return 'Name a war that is going on.'
  } else if (need === 'claim') {
    if (!p.claim || !w.claims.some((c) => c.id === p.claim && !c.settled)) return 'Name a claim that is still open.'
  } else if (need === 'nation' || need === 'nation+resource') {
    if (!p.target || p.target === HOME || !w.nations[p.target]) return 'Name a nation.'
    if (!isFree(state, p.target)) return `${nameOf(state, content, p.target)} is no longer a nation.`
    if (p.kind === 'admit' && w.assembly.members.includes(p.target)) return `${nameOf(state, content, p.target)} is already a member.`
    if (p.kind === 'expel' && !w.assembly.members.includes(p.target)) return `${nameOf(state, content, p.target)} is not a member.`
    if (p.kind === 'force' && !warsOf(state, p.target).length) return `${nameOf(state, content, p.target)} is not at war: there is nothing to authorise force over.`
    if (need === 'nation+resource' && (!p.resource || !content.resources.some((r) => r.id === p.resource))) return `Name what to embargo: ${content.resources.map((r) => r.id).join(', ')}.`
  }
  if (p.text !== undefined && p.text.length > 600) return 'The wording is too long: keep it under 600 characters.'
  return null
}

// The title a proposal is known by on the order paper.
export function proposalTitle(state: GameState, content: Content, p: Proposal): string {
  const n = (id: string) => nameOf(state, content, id)
  const war = p.war ? state.world?.wars.find((x) => x.id === p.war) : undefined
  const between = war ? `${war.attackers.map(n).join(' and ')} and ${war.defenders.map(n).join(' and ')}` : ''
  const claim = p.claim ? state.world?.claims.find((c) => c.id === p.claim) : undefined
  const t = p.target ? n(p.target) : ''
  const resource = content.resources.find((r) => r.id === p.resource)?.name.toLowerCase() ?? p.resource ?? ''
  switch (p.kind) {
    case 'ceasefire': return `a call for a ceasefire between ${between}`
    case 'sanctions': return `sanctions on ${t}`
    case 'tribunal': return `a tribunal for war crimes by ${t}`
    case 'arbitration': return claim ? `arbitration of ${n(claim.by)}'s claim to ${claim.region}` : 'arbitration of a claim'
    case 'aid': return `a humanitarian fund for ${t}`
    case 'condemnation': return `a condemnation of ${t}`
    case 'embargo': return `an embargo on ${resource} for ${t}`
    case 'admit': return `admitting ${t} to the Assembly`
    case 'expel': return `expelling ${t} from the Assembly`
    case 'routine': return 'routine business'
    case 'binding-ceasefire': return `a binding ceasefire between ${between}`
    case 'hard-sanctions': return `hard sanctions on ${t}`
    case 'peacekeepers': return `peacekeepers between ${between}`
    case 'force': return `force authorised against ${t}`
  }
}

export function worldAct(input: GameState, content: Content, action: WorldAction): GameState {
  const state = structuredClone(input)
  const why = forbidden(state, content, action)
  if (why) throw new Error(why)
  const w = state.world!
  const changes: Change[] = []
  const week: Week = { changes, lines: [] }
  const rng = rngFor(state.seed, state.day, `act:${JSON.stringify(action)}`)
  let headline = ''
  let text = ''
  if ('pact' in action) {
    const them = nameOf(state, content, action.pact)
    const loyalty = defOf(content, action.pact)?.temperament.loyalty ?? 50
    if ((state.neighbours[action.pact] ?? 0) >= 40 && loyalty >= 35) {
      joinPact(state, HOME, action.pact)
      shift(state, HOME, action.pact, 5, 'A pact, signed.', changes)
      headline = `${state.identity.name} signs a defensive pact with ${them}`
      text = `Each will come to the other's aid if attacked. ${them}'s enemies are watching.`
    } else {
      shift(state, HOME, action.pact, -2, 'A pact offered and refused.', changes)
      headline = `${them} declines a pact with ${state.identity.name}`
      text = `${them} is not ready to bind itself to ${state.identity.name}. Better relations would help.`
    }
  } else if ('war' in action) {
    const claim = openClaim(state, HOME, action.war) ?? openClaim(state, action.war, HOME)
    const provoked = (state.neighbours[action.war] ?? 0) <= -20 || claim !== undefined || allies(state, HOME).some((a) => atWar(state, a, action.war))
    if (!provoked) applyEffects(state, [{ indicator: 'legitimacy', by: -4, why: 'An unprovoked war is a hard thing to explain.' }], changes)
    const allyWar = activeWars(state).find((x) => sideOf(x, action.war) && allies(state, HOME).some((a) => sideOf(x, a) && sideOf(x, a) !== sideOf(x, action.war)))
    if (allyWar) {
      const mySide = sideOf(allyWar, action.war) === 'attackers' ? 'defenders' : 'attackers'
      allyWar[mySide].push(HOME)
      shift(state, HOME, action.war, -30, 'We went to war against it.', changes)
    } else {
      startWar(state, content, HOME, action.war, claim ? 'claim' : 'punitive', claim?.region, week)
    }
    headline = `${state.identity.name} declares war on ${nameOf(state, content, action.war)}`
    text = provoked ? 'The government says it had no choice.' : 'The government says it had no choice. Abroad, few believe it.'
  } else if ('peace' in action) {
    const war = w.wars.find((x) => x.id === action.peace && !x.ended)!
    const enemy = enemiesIn(war, HOME)[0]!
    const enemySide = sideOf(war, enemy)!
    const enemyAhead = (enemySide === 'attackers' ? war.front : -war.front) >= 20
    if (!enemyAhead || war.weariness[enemySide] >= 40 || rng() < 0.25) {
      makePeace(state, content, war, changes)
      headline = `${state.identity.name} makes peace with ${nameOf(state, content, enemy)}`
      text = frontText(war, HOME)
    } else {
      headline = `${nameOf(state, content, enemy)} rejects ${state.identity.name}'s offer of peace`
      text = 'It thinks it is winning. The war goes on.'
    }
  } else if ('propose' in action) {
    const p = action.propose
    const title = proposalTitle(state, content, p)
    const wording = p.text?.trim()
    const motion: Motion = {
      id: nextId(w, 'motion'),
      kind: p.kind,
      title,
      day: p.body === 'council' ? w.council.next : w.assembly.next,
      by: HOME,
      ...(p.target ? { target: p.target } : {}),
      ...(p.war ? { war: p.war } : {}),
      ...(p.claim ? { claim: p.claim } : {}),
      ...(p.resource ? { resource: p.resource } : {}),
      ...(wording ? { text: wording } : {}),
      votes: { [HOME]: 'aye' },
    }
    ;(p.body === 'council' ? w.council.queue : w.assembly.queue).push(motion)
    const where = p.body === 'council' ? 'the Security Council' : 'the Assembly of Nations'
    headline = `${state.identity.name} puts ${title} before ${where}`
    text = wording ? `The wording: “${wording}”` : 'It will be taken at the next sitting with room on the order paper.'
  } else if ('council' in action) {
    w.council.candidates.push(HOME)
    headline = `${state.identity.name} stands for the Security Council`
    text = `The Assembly elects to the Council on day ${w.council.election}. Every member that likes ${state.identity.name} is a vote.`
  } else if ('assembly' in action) {
    if (action.assembly === 'leave') {
      w.assembly.members = w.assembly.members.filter((m) => m !== HOME)
      for (const m of w.matters) if (!m.decided && m.kind === 'vote') m.expires = state.day
      applyEffects(state, [{ indicator: 'legitimacy', by: -1, why: 'Walking out of the Assembly divides the country.' }], changes)
      for (const n of content.neighbours) if (n.temperament.charity >= 60) shift(state, HOME, n.id, -5, 'It left the Assembly of Nations.', changes)
      headline = `${state.identity.name} leaves the Assembly of Nations`
      text = 'Its seat in Saint Ivo stands empty. Its votes will not be counted, and nor will it be bound.'
    } else {
      w.assembly.members.push(HOME)
      headline = `${state.identity.name} rejoins the Assembly of Nations`
      text = 'Its delegation takes its seat again in Saint Ivo.'
    }
  } else {
    w.home.mobilised = action.mobilise
    if (action.mobilise) {
      applyEffects(state, [
        { indicator: 'fiscal', by: -3, why: 'Calling up the reserves.' },
        { indicator: 'employment', by: 2, why: 'Reservists are taken on, and factories hire to replace them.' },
        { indicator: 'capacity', by: -2, why: 'Factories turn to war work.' },
      ], changes)
      headline = `${state.identity.name} mobilises`
      text = 'The reserves are called up. Every neighbour has noticed.'
      for (const n of bordersOf(state, content, HOME)) shift(state, HOME, n, -3, 'It mobilised on our border.', changes)
    } else {
      headline = `${state.identity.name} stands its army down`
      text = 'The reservists go home.'
    }
  }
  recordEntry(state, content, 'world', headline, changes, [text, ...week.lines].filter(Boolean).join(' '))
  w.important = importantNations(state)
  return state
}

// ---------------------------------------------------------------------------------------
// The sandbox and the Director's cheats: the world changed by hand
// ---------------------------------------------------------------------------------------

export type WorldCheat =
  | { war: { attacker: string; defender: string } }
  | { peace: { war: string; outcome: 'attackers' | 'defenders' | 'ceasefire'; total?: boolean } }
  | { relation: { a: string; b: string; to: number } }
  | { annex: { target: string; ruler: string } }
  | { free: string }
  | { pact: { a: string; b: string } }
  | { unpact: { a: string; b: string } }

// What happens in the world happens: a war started this way is fought, reported and joined by
// allies like any other. The nation is marked as sandboxed; quiet (the Director's cheats) writes
// no sandbox entry of its own.
export function worldCheat(input: GameState, content: Content, cheat: WorldCheat, opts: { quiet?: boolean } = {}): GameState {
  const state = structuredClone(input)
  const w = state.world
  if (!w) throw new Error('This pack has no world beyond the borders.')
  const known = (id: string, home = true) => {
    if (id === HOME && home) return
    if (!w.nations[id]) throw new Error(`There is no nation “${id}”.`)
  }
  const free = (id: string) => {
    known(id)
    if (!isFree(state, id)) throw new Error(`${nameOf(state, content, id)} is no longer a nation.`)
  }
  const week: Week = { changes: [], lines: [] }
  const rng = rngFor(state.seed, state.day, `cheat:${JSON.stringify(cheat)}`)
  let what = ''
  if ('war' in cheat) {
    const { attacker, defender } = cheat.war
    free(attacker)
    free(defender)
    if (attacker === defender) throw new Error('A nation cannot go to war with itself.')
    if (atWar(state, attacker, defender)) throw new Error('They are already at war.')
    const claim = openClaim(state, attacker, defender)
    startWar(state, content, attacker, defender, claim ? 'claim' : 'conquest', claim?.region, week)
    what = `War started between ${nameOf(state, content, attacker)} and ${nameOf(state, content, defender)}`
  } else if ('peace' in cheat) {
    const war = w.wars.find((x) => x.id === cheat.peace.war && !x.ended)
    if (!war) throw new Error(`There is no war “${cheat.peace.war}” going on.`)
    endWar(state, content, war, cheat.peace.outcome, cheat.peace.total ?? cheat.peace.outcome !== 'ceasefire', week, rng)
    what = `War ended: ${cheat.peace.outcome}`
  } else if ('relation' in cheat) {
    const { a, b, to } = cheat.relation
    known(a)
    known(b)
    if (a === b) throw new Error('Pick two different nations.')
    shift(state, a, b, clampStanding(to) - rel(state, a, b), 'Set by hand in the sandbox.', week.changes)
    what = `Relations between ${nameOf(state, content, a)} and ${nameOf(state, content, b)} set to ${clampStanding(to)}`
  } else if ('annex' in cheat) {
    const { target, ruler } = cheat.annex
    if (target === HOME) throw new Error('The player’s nation can never be annexed.')
    free(target)
    free(ruler)
    if (target === ruler) throw new Error('A nation cannot annex itself.')
    for (const war of warsOf(state, target)) war.ended = { day: state.day, outcome: 'annexed' }
    annex(state, content, target, ruler, week)
    what = `${nameOf(state, content, target)} annexed by ${nameOf(state, content, ruler)}`
  } else if ('free' in cheat) {
    known(cheat.free, false)
    const n = w.nations[cheat.free]!
    if (n.free) throw new Error(`${nameOf(state, content, cheat.free)} is already free.`)
    n.free = true
    delete n.ruler
    delete n.annexed
    if (!w.assembly.members.includes(n.id)) w.assembly.members.push(n.id)
    log(state, week, `${nameOf(state, content, n.id)} is a nation again.`, [n.id], true)
    what = `${nameOf(state, content, n.id)} restored to independence`
  } else if ('pact' in cheat) {
    const { a, b } = cheat.pact
    free(a)
    free(b)
    if (atWar(state, a, b)) throw new Error('Not while they are at war with each other.')
    joinPact(state, a, b)
    if (!allies(state, a).includes(b)) throw new Error('Each is already in a full pact; break one first.')
    what = `${nameOf(state, content, a)} and ${nameOf(state, content, b)} put in a pact`
  } else {
    const { a, b } = cheat.unpact
    if (!allies(state, a).includes(b)) throw new Error('They are not in a pact.')
    leavePacts(state, a, b)
    leavePacts(state, b, a)
    what = `The pact between ${nameOf(state, content, a)} and ${nameOf(state, content, b)} broken`
  }
  w.important = importantNations(state)
  state.sandbox = true
  if (!opts.quiet) recordEntry(state, content, 'sandbox', `The world changed in the sandbox: ${what.charAt(0).toLowerCase() + what.slice(1)}`, week.changes, week.lines.join(' ') || undefined)
  return state
}

// ---------------------------------------------------------------------------------------
// For the AI and the papers: the world in a few lines
// ---------------------------------------------------------------------------------------

export function worldLines(state: GameState, content: Content): string[] {
  const w = state.world
  if (!w) return []
  const n = (id: string) => nameOf(state, content, id)
  const lines: string[] = []
  for (const war of activeWars(state)) {
    lines.push(`War: ${war.attackers.map(n).join(' and ')} against ${war.defenders.map(n).join(' and ')}, week ${war.weeks}${war.region ? `, over ${war.region}` : ''}. ${frontText(war, war.attackers[0]!)}`)
  }
  const mine = allies(state, HOME)
  if (mine.length) lines.push(`${state.identity.name} has a defensive pact with ${mine.map(n).join(', ')}.`)
  for (const c of w.claims.filter((x) => !x.settled && (x.by === HOME || x.against === HOME))) {
    lines.push(`${n(c.by)} claims ${c.region} from ${n(c.against)}${c.referred ? ', referred to the Assembly' : ''}.`)
  }
  for (const s of w.assembly.sanctions) lines.push(`${n(s.target)} is under the Assembly’s sanctions.`)
  if (w.assembly.motion) lines.push(`The Assembly of Nations sits on day ${w.assembly.next}: ${w.assembly.motion.title}${w.assembly.motion.by ? `, put down by ${n(w.assembly.motion.by)}` : ''}.${w.assembly.motion.text ? ` Its wording: “${w.assembly.motion.text}”` : ''}`)
  for (const m of w.assembly.queue) lines.push(`Waiting for the Assembly: ${m.title}${m.by ? `, put down by ${n(m.by)}` : ''}.${m.text ? ` Its wording: “${m.text}”` : ''}`)
  const council = councilMembers(state)
  if (council.length) lines.push(`The Security Council: ${w.council.permanent.filter((x) => council.includes(x)).map(n).join(', ')} (permanent, with a veto); ${w.council.elected.filter((e) => council.includes(e.id)).map((e) => n(e.id)).join(', ')} (elected).`)
  if (w.council.motion) lines.push(`The Security Council sits on day ${w.council.next}: ${w.council.motion.title}${w.council.motion.by ? `, put down by ${n(w.council.motion.by)}` : ''}.${w.council.motion.text ? ` Its wording: “${w.council.motion.text}”` : ''}`)
  if (w.council.candidates.includes(HOME)) lines.push(`${state.identity.name} is standing for the Security Council, elected on day ${w.council.election}.`)
  if (!w.assembly.members.includes(HOME)) lines.push(`${state.identity.name} has left the Assembly of Nations.`)
  if (w.home.mobilised) lines.push(`${state.identity.name} is mobilised.`)
  if (w.home.lost) lines.push(`${state.identity.name} has lost ${w.home.lost === 1 ? 'a borderland' : `${w.home.lost} borderlands`} to its neighbours.`)
  for (const x of Object.values(w.nations)) if (!x.free) lines.push(`${n(x.id)} was annexed by ${n(x.ruler ?? '')}.`)
  return lines
}

// How one nation sees things, for its own session.
export function nationLines(state: GameState, content: Content, id: string): string[] {
  const w = state.world
  const me = w?.nations[id]
  if (!w || !me) return []
  const n = (x: string) => nameOf(state, content, x)
  const lines = [
    `Strength ${me.strength}, wealth ${me.wealth}, stability ${me.stability}.`,
    `Relations with ${state.identity.name}: ${rel(state, id, HOME)}.`,
  ]
  const friends = Object.entries(me.relations).filter(([x, r]) => r >= 40 && isFree(state, x)).map(([x]) => n(x))
  const foes = Object.entries(me.relations).filter(([x, r]) => r <= -40 && isFree(state, x)).map(([x]) => n(x))
  if (friends.length) lines.push(`Friends: ${friends.join(', ')}.`)
  if (foes.length) lines.push(`Enemies: ${foes.join(', ')}.`)
  const pacts = allies(state, id)
  if (pacts.length) lines.push(`In a pact with ${pacts.map(n).join(', ')}.`)
  for (const war of warsOf(state, id)) lines.push(`At war with ${enemiesIn(war, id).map(n).join(' and ')}, week ${war.weeks}. ${frontText(war, id)}`)
  return lines
}

export function describeMove(state: GameState, content: Content, move: Move): string {
  const t = move.target ? nameOf(state, content, move.target) : ''
  switch (move.kind) {
    case 'wait': return 'Do nothing this week'
    case 'rearm': return 'Spend on the army'
    case 'court': return `Make friendly overtures to ${t}`
    case 'pact': return `Propose a defensive pact with ${t}`
    case 'claim': return `Press a claim to a borderland held by ${t}`
    case 'war': return `Declare war on ${t}`
    case 'aid': return `Send aid to ${t}`
    case 'appeal': return `Appeal to ${t} for aid`
    case 'peace': return 'Offer terms to end the war'
  }
}

