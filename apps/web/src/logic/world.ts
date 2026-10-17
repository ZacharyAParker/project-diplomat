// The World page's reading of the engine's world: the matters waiting, the wars, the Assembly
// and every nation as a row. Pure, so it can be tested without the page.

import {
  HOME,
  activeWars,
  adviseMatter,
  allies,
  forbidden,
  frontText,
  matterCard,
  nameOf,
  openMatters,
  standingWith,
  warsOf,
  type Content,
  type GameState,
  type MatterCard,
  type War,
} from '@diplomat/engine'
import { temperamentWords } from '@diplomat/government'
import { moodWord } from './nation.ts'

export interface MatterView extends MatterCard {
  daysLeft: number
  advice?: { option: string; label: string; reason: string }
}

export function matterViews(state: GameState, content: Content): MatterView[] {
  return openMatters(state)
    .map((m) => {
      const card = matterCard(state, content, m)
      const advice = adviseMatter(state, content, m)
      const label = advice ? card.options.find((o) => o.id === advice.option)?.label : undefined
      return { ...card, daysLeft: Math.max(0, m.expires - state.day), ...(advice && label ? { advice: { ...advice, label } } : {}) }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft || a.id.localeCompare(b.id))
}

export function strengthWord(strength: number): string {
  if (strength >= 70) return 'Formidable'
  if (strength >= 55) return 'Strong'
  if (strength >= 40) return 'Middling'
  if (strength >= 20) return 'Weak'
  return 'Defenceless'
}

export interface WarView {
  id: string
  title: string
  week: number
  front: string
  ours: boolean
  // For the player's own war: who fights beside them, and how tired each side is.
  with?: string[]
  against?: string[]
  weariness?: { ours: number; theirs: number }
}

function warView(state: GameState, content: Content, war: War): WarView {
  const n = (id: string) => nameOf(state, content, id)
  const side = war.attackers.includes(HOME) ? 'attackers' : war.defenders.includes(HOME) ? 'defenders' : null
  const base = {
    id: war.id,
    title: `${war.attackers.map(n).join(' and ')} against ${war.defenders.map(n).join(' and ')}${war.region ? `, over ${war.region}` : ''}`,
    week: war.weeks,
  }
  if (!side) return { ...base, front: frontText(war, war.attackers[0]!), ours: false }
  const mine = side === 'attackers' ? war.attackers : war.defenders
  const theirs = side === 'attackers' ? war.defenders : war.attackers
  return {
    ...base,
    front: frontText(war, HOME),
    ours: true,
    with: mine.filter((x) => x !== HOME).map(n),
    against: theirs.map(n),
    weariness: { ours: war.weariness[side], theirs: war.weariness[side === 'attackers' ? 'defenders' : 'attackers'] },
  }
}

export function warViews(state: GameState, content: Content): { ours: WarView[]; elsewhere: WarView[] } {
  const all = activeWars(state).map((w) => warView(state, content, w))
  return { ours: all.filter((w) => w.ours), elsewhere: all.filter((w) => !w.ours) }
}

export interface NationRow {
  id: string
  name: string
  leader: string
  form: string
  description: string
  temperament: string
  near: boolean
  free: boolean
  ruler?: string
  standing: number
  mood: string
  strength: string
  // "In a pact with you", "At war with you", "At war", "Annexed by Kessmark".
  status: string[]
  important: boolean
  memory: string[]
  pact: { allowed: boolean; why?: string }
  war: { allowed: boolean; why?: string }
}

export function nationRows(state: GameState, content: Content): NationRow[] {
  const w = state.world
  if (!w) return []
  const mine = allies(state, HOME)
  return content.neighbours.map((def) => {
    const n = w.nations[def.id]
    const free = n?.free ?? true
    const standing = standingWith(state, content, def.id)
    const status: string[] = []
    if (!free) status.push(`Annexed by ${nameOf(state, content, n?.ruler ?? '')}`)
    if (mine.includes(def.id)) status.push('In a pact with you')
    for (const war of warsOf(state, def.id)) {
      if (war.attackers.includes(HOME) || war.defenders.includes(HOME)) {
        const together = (war.attackers.includes(HOME) && war.attackers.includes(def.id)) || (war.defenders.includes(HOME) && war.defenders.includes(def.id))
        status.push(together ? 'Fighting beside you' : 'At war with you')
      } else status.push('At war')
    }
    for (const c of w.claims) {
      if (c.settled) continue
      if (c.by === def.id && c.against === HOME) status.push(`Claims ${c.region} from you${c.referred ? ', before the Assembly' : ''}`)
      if (c.by === HOME && c.against === def.id) status.push(`You claim ${c.region} from it`)
    }
    if (w.assembly.sanctions.some((s) => s.target === def.id)) status.push('Under sanctions')
    const pactWhy = forbidden(state, content, { pact: def.id })
    const warWhy = forbidden(state, content, { war: def.id })
    return {
      id: def.id,
      name: def.name,
      leader: def.leader,
      form: def.form,
      description: def.description,
      temperament: temperamentWords(def.temperament),
      near: def.near,
      free,
      ...(n?.ruler ? { ruler: nameOf(state, content, n.ruler) } : {}),
      standing,
      mood: moodWord(standing),
      strength: strengthWord(n?.strength ?? def.strength),
      status,
      important: w.important.includes(def.id),
      memory: (n?.memory ?? []).slice(-3).reverse().map((m) => m.text),
      pact: pactWhy ? { allowed: false, why: pactWhy } : { allowed: true },
      war: warWhy ? { allowed: false, why: warWhy } : { allowed: true },
    }
  })
}

export interface AssemblyView {
  member: boolean
  next: number
  motion?: string
  past: { id: string; title: string; passed: boolean; ayes: number; noes: number; ours?: string }[]
  sanctions: string[]
}

export function assemblyView(state: GameState, content: Content): AssemblyView | null {
  const a = state.world?.assembly
  if (!a) return null
  const count = (votes: Record<string, string> | undefined, v: string) => Object.values(votes ?? {}).filter((x) => x === v).length
  return {
    member: a.members.includes(HOME),
    next: a.next,
    ...(a.motion ? { motion: a.motion.title } : {}),
    past: [...a.past]
      .reverse()
      .slice(0, 6)
      .map((m) => ({
        id: m.id,
        title: m.title.charAt(0).toUpperCase() + m.title.slice(1),
        passed: Boolean(m.passed),
        ayes: count(m.votes, 'aye'),
        noes: count(m.votes, 'no'),
        ...(m.votes?.[HOME] ? { ours: m.votes[HOME] } : {}),
      })),
    sanctions: a.sanctions.map((s) => nameOf(state, content, s.target)),
  }
}

// What happened abroad lately, newest first.
export function worldNews(state: GameState, days = 21): { day: number; text: string }[] {
  return (state.world?.log ?? []).filter((l) => state.day - l.day <= days).reverse().slice(0, 20)
}
