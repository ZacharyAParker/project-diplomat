import type { Compare, Condition, NationState } from './types.ts'

export function compare(value: number, c: Compare): boolean {
  if (c.gt !== undefined && !(value > c.gt)) return false
  if (c.gte !== undefined && !(value >= c.gte)) return false
  if (c.lt !== undefined && !(value < c.lt)) return false
  if (c.lte !== undefined && !(value <= c.lte)) return false
  return true
}

export function holds(condition: Condition | undefined, state: NationState): boolean {
  if (condition === undefined) return true
  if ('all' in condition) return condition.all.every((c) => holds(c, state))
  if ('any' in condition) return condition.any.some((c) => holds(c, state))
  if ('not' in condition) return !holds(condition.not, state)
  if ('indicator' in condition) return compare(state.indicators[condition.indicator], condition)
  if ('faction' in condition) return compare(state.factions[condition.faction]?.approval ?? 0, condition)
  if ('policy' in condition) return state.policies[condition.policy] === condition.is
  if ('flag' in condition) return condition.flag in state.flags
  if ('trait' in condition) return state.traits.includes(condition.trait)
  return compare(state.day, condition.day)
}
