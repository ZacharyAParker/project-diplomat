import { LOWER_IS_BETTER, type Condition, type Content, type Effect, type Option } from '@diplomat/engine'
import type { Problem } from './load.ts'

// How far one effect may move a number. Delayed effects get a little more room.
export const LIMITS = { indicator: 10, faction: 15, minister: 20, situation: 20, laterBonus: 2 }

const MACROS = /\{([a-z]+)(?::([a-z_]+))?\}/g
const PLAIN_MACROS = new Set(['nation', 'capital', 'currency', 'demonym'])
const BUILT_IN_FLAGS = new Set(['government_fell'])

// Checks the things a schema can't: references, bounds, and the house rules.
export function validate(content: Content): Problem[] {
  const problems: Problem[] = []
  const say = (where: string, message: string) => problems.push({ where, message })

  const factions = new Set(content.factions.map((f) => f.id))
  const policies = new Set(content.policies.map((p) => p.id))
  const traits = new Set(content.traits.map((t) => t.id))
  const portfolios = new Set(content.portfolios.map((p) => p.id))
  const situations = new Set(content.situations.map((s) => s.id))
  const flagsSet = new Set(BUILT_IN_FLAGS)
  const flagsRead = new Map<string, string>()
  const tagsUsed = new Set<string>()

  for (const [name, list] of Object.entries({
    faction: content.factions,
    policy: content.policies,
    trait: content.traits,
    dilemma: content.dilemmas,
    situation: content.situations,
  })) {
    const seen = new Set<string>()
    for (const item of list) {
      if (seen.has(item.id)) say(item.id, `duplicate ${name} id`)
      seen.add(item.id)
    }
  }

  function checkText(where: string, value: string) {
    for (const [whole, key, arg] of value.matchAll(MACROS)) {
      if (key === 'minister' && arg && portfolios.has(arg)) continue
      if (key && !arg && PLAIN_MACROS.has(key)) continue
      say(where, `unknown macro ${whole}`)
    }
  }

  function checkCondition(where: string, c: Condition | undefined) {
    if (!c) return
    if ('all' in c) return c.all.forEach((inner) => checkCondition(where, inner))
    if ('any' in c) return c.any.forEach((inner) => checkCondition(where, inner))
    if ('not' in c) return checkCondition(where, c.not)
    if ('faction' in c && !factions.has(c.faction)) say(where, `unknown faction ${c.faction}`)
    if ('policy' in c && !policies.has(c.policy)) say(where, `unknown policy ${c.policy}`)
    if ('trait' in c && !traits.has(c.trait)) say(where, `unknown trait ${c.trait}`)
    if ('flag' in c && !flagsRead.has(c.flag)) flagsRead.set(c.flag, where)
  }

  function checkEffects(where: string, effects: Effect[], extra = 0) {
    for (const e of effects) {
      const over = (limit: number) => 'by' in e && Math.abs(e.by) > limit + extra
      if ('why' in e) checkText(where, e.why)
      if ('indicator' in e) {
        if (over(LIMITS.indicator)) say(where, `${e.indicator} moves by ${e.by}; the limit is ${LIMITS.indicator + extra}`)
      } else if ('faction' in e) {
        if (!factions.has(e.faction)) say(where, `unknown faction ${e.faction}`)
        if (over(LIMITS.faction)) say(where, `${e.faction} moves by ${e.by}; the limit is ${LIMITS.faction + extra}`)
      } else if ('minister' in e) {
        if (!portfolios.has(e.minister)) say(where, `unknown portfolio ${e.minister}`)
        if (Math.abs(e.by) > LIMITS.minister) say(where, `minister standing moves by ${e.by}; the limit is ${LIMITS.minister}`)
      } else if ('situation' in e) {
        if (!situations.has(e.situation)) say(where, `unknown situation ${e.situation}`)
        if (Math.abs(e.by) > LIMITS.situation) say(where, `situation gauge moves by ${e.by}; the limit is ${LIMITS.situation}`)
      } else if ('policy' in e) {
        if (!policies.has(e.policy)) say(where, `unknown policy ${e.policy}`)
      } else if (!e.clear) {
        flagsSet.add(e.flag)
      }
    }
  }

  // House rule: no option is free and no option is pure punishment.
  function checkTradeOff(where: string, option: Option) {
    let good = false
    let bad = false
    for (const e of [...option.effects, ...option.later.flatMap((l) => l.effects)]) {
      if (!('by' in e) || e.by === 0 || 'situation' in e) continue
      const helps = 'indicator' in e && LOWER_IS_BETTER.has(e.indicator) ? e.by < 0 : e.by > 0
      if (helps) good = true
      else bad = true
    }
    if (!good) say(where, 'nothing good comes of this option')
    if (!bad) say(where, 'this option costs nothing')
  }

  function checkOption(where: string, option: Option, needsTradeOff: boolean) {
    option.tags.forEach((tag) => tagsUsed.add(tag))
    checkCondition(where, option.when)
    checkEffects(where, option.effects)
    for (const later of option.later) {
      checkCondition(where, later.when)
      checkEffects(where, later.effects, LIMITS.laterBonus)
      checkText(where, later.headline)
    }
    if (option.promise) {
      checkCondition(where, option.promise.kept)
      checkEffects(where, option.promise.broken)
    }
    for (const value of [option.advocate.name, option.advocate.role, option.speech, option.headline, option.result]) {
      checkText(where, value)
    }
    if (needsTradeOff) checkTradeOff(where, option)
  }

  function checkOptions(where: string, options: Option[], needsTradeOff: boolean) {
    const seen = new Set<string>()
    for (const option of options) {
      if (seen.has(option.id)) say(where, `duplicate option id ${option.id}`)
      seen.add(option.id)
      checkOption(`${where}/${option.id}`, option, needsTradeOff)
    }
    if (options.filter((o) => !o.when).length < 2) {
      say(where, 'needs at least two options that are always available')
    }
  }

  for (const d of content.dilemmas) {
    checkCondition(d.id, d.when)
    checkText(d.id, d.title)
    checkText(d.id, d.description)
    checkOptions(d.id, d.options, d.kind === 'major')
  }

  for (const s of content.situations) {
    checkCondition(s.id, s.when)
    s.stages.forEach((stage, i) => checkOptions(`${s.id}/stage${i + 1}`, stage.options, false))
    for (const outcome of s.outcomes) checkEffects(`${s.id}/outcome`, outcome.effects, LIMITS.laterBonus)
    const last = s.outcomes.at(-1)!
    if ([last.gt, last.gte, last.lt, last.lte].some((bound) => bound !== undefined)) {
      say(s.id, 'the last outcome must have no bounds, so every gauge value ends somewhere')
    }
  }

  for (const t of content.traits) {
    checkCondition(t.id, t.earn)
    checkCondition(t.id, t.lose)
  }

  // Tags are only compared after every option has been read.
  for (const s of content.situations) {
    for (const p of s.pressures) if (!tagsUsed.has(p.tag)) say(s.id, `pressure tag ${p.tag} is not used by any option`)
  }
  for (const t of content.traits) {
    for (const tag of t.opposes) if (!tagsUsed.has(tag)) say(t.id, `opposed tag ${tag} is not used by any option`)
  }
  for (const [flag, where] of flagsRead) {
    if (!flagsSet.has(flag)) say(where, `checks flag ${flag}, which nothing sets`)
  }

  const clout = content.factions.reduce((sum, f) => sum + f.clout, 0)
  if (content.factions.length && clout !== 100) say('factions', `clout adds up to ${clout}, not 100`)

  return problems
}
