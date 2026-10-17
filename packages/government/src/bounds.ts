// The limits on what a model may do to the numbers. The world, a bill or a Word may nudge
// the engine; none of them may steer it. Every effect the AI proposes passes through here
// before applyExternal sees it, and whatever is cut is named so the record can say so.

import type { Effect, PolicyDef } from '@diplomat/engine'
import type { EffectBounds } from './types.ts'

const round = (n: number) => Math.round(n * 10) / 10

// The key a daily total is kept under: "indicator:liberty", "faction:labour".
export function targetOf(effect: Effect): string | null {
  if ('indicator' in effect) return `indicator:${effect.indicator}`
  if ('faction' in effect) return `faction:${effect.faction}`
  if ('minister' in effect) return `minister:${effect.minister}`
  return null
}

const describe = (effect: Effect) => JSON.stringify(effect).slice(0, 120)

export function bound(
  effects: readonly Effect[],
  bounds: EffectBounds,
  spentToday: Partial<Record<string, number>> = {},
  // A law may set a policy the pack defines, to a value of the policy's own kind. The world
  // and a Word may not set any. Flags belong to dilemmas alone, so nobody here may set one.
  options: { policies?: readonly PolicyDef[] } = {},
): { effects: Effect[]; dropped: string[] } {
  const spent: Record<string, number> = { ...spentToday } as Record<string, number>
  const kept: Effect[] = []
  const dropped: string[] = []
  for (const effect of effects) {
    // Only the kinds applyExternal takes. Identity, standing, treaties and situations are
    // the business of dilemmas, never of a model.
    const moves = 'indicator' in effect || 'faction' in effect || 'minister' in effect
    const setting = ('policy' in effect && !moves) || ('flag' in effect && !('identity' in effect))
    if (!moves && !setting) {
      dropped.push(`not a kind of effect the world may have: ${describe(effect)}`)
      continue
    }
    if (kept.length >= bounds.maxEffects) {
      dropped.push(`over the limit of ${bounds.maxEffects} effects: ${describe(effect)}`)
      continue
    }
    if (setting) {
      const def = 'policy' in effect ? options.policies?.find((p) => p.id === effect.policy) : undefined
      if (!def || !('to' in effect) || typeof effect.to !== typeof def.default) {
        dropped.push(`${'flag' in effect && !('policy' in effect) ? 'a flag, which only a dilemma may set' : 'a policy this cannot set'}: ${describe(effect)}`)
        continue
      }
      kept.push(structuredClone(effect))
      continue
    }
    const e = effect as Extract<Effect, { by: number; why: string }>
    const why = typeof e.why === 'string' ? e.why.trim() : ''
    if (!why) {
      dropped.push(`no reason given: ${describe(effect)}`)
      continue
    }
    if (typeof e.by !== 'number' || !Number.isFinite(e.by) || e.by === 0) {
      dropped.push(`no movement: ${describe(effect)}`)
      continue
    }
    const key = targetOf(effect)!
    const used = Math.abs(spent[key] ?? 0)
    const room = Math.max(0, bounds.perDay - used)
    const by = Math.sign(e.by) * Math.min(Math.abs(e.by), bounds.perEffect, room)
    if (round(by) === 0) {
      dropped.push(`${key} has already moved ${used} today, the most allowed: ${describe(effect)}`)
      continue
    }
    if (Math.abs(round(by)) < Math.abs(e.by)) dropped.push(`${key} cut from ${e.by} to ${round(by)}`)
    spent[key] = used + Math.abs(round(by))
    kept.push({ ...e, by: round(by), why } as Effect)
  }
  return { effects: kept, dropped }
}

// The daily totals after some effects have been applied, to pass to the next bound call.
export function spend(spentToday: Partial<Record<string, number>>, effects: readonly Effect[]): Record<string, number> {
  const out: Record<string, number> = { ...spentToday } as Record<string, number>
  for (const effect of effects) {
    const key = targetOf(effect)
    if (key && 'by' in effect) out[key] = (out[key] ?? 0) + Math.abs(effect.by)
  }
  return out
}
