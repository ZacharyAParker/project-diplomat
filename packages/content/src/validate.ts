import {
  INDICATORS,
  LOWER_IS_BETTER,
  MATTER_ACTIONS,
  MATTER_KINDS,
  START_INDICATORS,
  type Condition,
  type Content,
  type Effect,
  type FoundingEffect,
  type Option,
  IDENTITY_LIMITS,
} from '@diplomat/engine'
import type { Problem } from './load.ts'

// How far one effect may move a number. Delayed effects get a little more room.
export const LIMITS = { indicator: 10, faction: 15, minister: 20, situation: 20, standing: 15, laterBonus: 2 }

// Where founding may leave a starting indicator or a faction's approval, however it is answered.
export const FOUNDING_RANGE = { min: 25, max: 75 }

const MACROS = /\{([a-z]+)(?::([a-z_]+))?\}/g
const PLAIN_MACROS = new Set(['nation', 'capital', 'currency', 'demonym', 'leader', 'animal', 'motto', 'faith'])
const NEIGHBOUR_MACROS = new Set([undefined, 'demonym', 'leader'])
// What a foreign matter's text may also use, filled in by the engine when the matter is raised.
const MATTER_MACROS = new Set(['other', 'region', 'motion', 'ally', 'need', 'strength_word', 'weeks', 'terms', 'front', 'annexable'])
const BUILT_IN_FLAGS = new Set(['government_fell', 'election_lost'])

// Checks the things a schema can't: references, bounds, and the house rules.
export function validate(content: Content): Problem[] {
  const problems: Problem[] = []
  const say = (where: string, message: string) => problems.push({ where, message })

  const factions = new Set(content.factions.map((f) => f.id))
  const policies = new Map(content.policies.map((p) => [p.id, p.default]))
  const traits = new Set(content.traits.map((t) => t.id))
  const portfolios = new Set(content.portfolios.map((p) => p.id))
  const situations = new Set(content.situations.map((s) => s.id))
  const resources = new Set(content.resources.map((r) => r.id))
  const treaties = new Set(content.treaties.map((t) => t.id))
  // True while checking something that is about one particular neighbour.
  let abroad = false
  const flagsSet = new Set(BUILT_IN_FLAGS)
  const flagsRead = new Map<string, string>()
  const tagsUsed = new Set<string>()

  for (const [name, list] of Object.entries({
    faction: content.factions,
    policy: content.policies,
    trait: content.traits,
    dilemma: content.dilemmas,
    situation: content.situations,
    class: content.classes,
    'founding question': content.founding.questions,
    neighbour: content.neighbours,
    resource: content.resources,
    treaty: content.treaties,
  })) {
    const seen = new Set<string>()
    for (const item of list) {
      if (seen.has(item.id)) say(item.id, `duplicate ${name} id`)
      seen.add(item.id)
    }
  }

  // True while checking a foreign matter's text, where {subject} and the rest mean something.
  let matter = false

  function checkText(where: string, value: string) {
    for (const [whole, key, arg] of value.matchAll(MACROS)) {
      if (matter && key === 'subject' && NEIGHBOUR_MACROS.has(arg)) continue
      if (matter && key && !arg && MATTER_MACROS.has(key)) continue
      if (key === 'minister' && arg && portfolios.has(arg)) continue
      if (key && !arg && PLAIN_MACROS.has(key)) continue
      if (key === 'neighbour' && NEIGHBOUR_MACROS.has(arg)) {
        if (!abroad) say(where, `${whole} only means something in a dilemma about another country`)
        continue
      }
      say(where, `unknown macro ${whole}`)
    }
  }

  function checkCondition(where: string, c: Condition | undefined) {
    if (!c) return
    if ('all' in c) return c.all.forEach((inner) => checkCondition(where, inner))
    if ('any' in c) return c.any.forEach((inner) => checkCondition(where, inner))
    if ('not' in c) return checkCondition(where, c.not)
    const bounds = 'day' in c ? c.day : 'indicator' in c || 'faction' in c ? c : undefined
    if (bounds && [bounds.gt, bounds.gte, bounds.lt, bounds.lte].every((bound) => bound === undefined)) {
      say(where, 'a comparison with no gt, gte, lt or lte is always true')
    }
    if ('faction' in c && !factions.has(c.faction)) say(where, `unknown faction ${c.faction}`)
    if ('policy' in c && !policies.has(c.policy)) say(where, `unknown policy ${c.policy}`)
    if ('trait' in c && !traits.has(c.trait)) say(where, `unknown trait ${c.trait}`)
    if ('flag' in c && !flagsRead.has(c.flag)) flagsRead.set(c.flag, where)
    if ('resource' in c && !resources.has(c.resource)) say(where, `unknown resource ${c.resource}`)
    if ('treaty' in c && !treaties.has(c.treaty)) say(where, `unknown treaty ${c.treaty}`)
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
        const usual = policies.get(e.policy)
        if (usual === undefined) say(where, `unknown policy ${e.policy}`)
        else if (typeof usual !== typeof e.to) {
          say(where, `policy ${e.policy} is a ${typeof usual} and cannot be set to ${e.to}`)
        }
      } else if ('standing' in e) {
        if (!abroad) say(where, 'standing can only move in a dilemma about another country')
        if (Math.abs(e.standing) > LIMITS.standing + extra) {
          say(where, `standing moves by ${e.standing}; the limit is ${LIMITS.standing + extra}`)
        }
      } else if ('treaty' in e) {
        if (!treaties.has(e.treaty)) say(where, `unknown treaty ${e.treaty}`)
        if (!abroad) say(where, 'a treaty can only be signed in a dilemma about another country')
      } else if ('identity' in e) {
        if ([...e.to].length > IDENTITY_LIMITS[e.identity]) {
          say(where, `${e.identity} ${e.to} is longer than ${IDENTITY_LIMITS[e.identity]} characters`)
        }
      } else if ('endTreaty' in e) {
        if (!treaties.has(e.endTreaty)) say(where, `unknown treaty ${e.endTreaty}`)
      } else if (!e.clear) {
        flagsSet.add(e.flag)
      }
    }
  }

  // House rule: no option is free and no option is pure punishment.
  function checkTradeOff(where: string, effects: Effect[], what: string) {
    let good = false
    let bad = false
    for (const e of effects) {
      if ('standing' in e && e.standing !== 0) {
        if (e.standing > 0) good = true
        else bad = true
        continue
      }
      if (!('by' in e) || e.by === 0 || 'situation' in e) continue
      const helps = 'indicator' in e && LOWER_IS_BETTER.has(e.indicator) ? e.by < 0 : e.by > 0
      if (helps) good = true
      else bad = true
    }
    if (!good) say(where, `nothing good comes of this ${what}`)
    if (!bad) say(where, `this ${what} costs nothing`)
  }

  // Adds up the furthest founding could push one number in one direction: the
  // most extreme answer to every question at once.
  function foundingReach(target: (e: FoundingEffect) => boolean, sign: 1 | -1): number {
    return content.founding.questions.reduce((sum, question) => {
      const moves = question.answers.map((answer) =>
        answer.effects.reduce((total, e) => (target(e) && 'by' in e ? total + e.by : total), 0),
      )
      return sum + sign * Math.max(0, ...moves.map((move) => sign * move))
    }, 0)
  }

  function checkFoundingRange(name: string, start: number, target: (e: FoundingEffect) => boolean) {
    const low = start + foundingReach(target, -1)
    const high = start + foundingReach(target, 1)
    const { min, max } = FOUNDING_RANGE
    if (low < min) say('founding', `${name} can start at ${low}; the lowest allowed is ${min}`)
    if (high > max) say('founding', `${name} can start at ${high}; the highest allowed is ${max}`)
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
    if (needsTradeOff) checkTradeOff(where, [...option.effects, ...option.later.flatMap((l) => l.effects)], 'option')
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
    abroad = d.abroad !== undefined
    checkCondition(d.id, d.when)
    checkText(d.id, d.title)
    checkText(d.id, d.description)
    checkOptions(d.id, d.options, d.kind === 'major')
    if (d.abroad) checkAbroad(d.id, d.abroad)
  }
  abroad = false

  function checkAbroad(where: string, want: NonNullable<Content['dilemmas'][number]['abroad']>) {
    for (const r of [want.supplies, want.wants]) if (r !== undefined && !resources.has(r)) say(where, `unknown resource ${r}`)
    for (const t of [want.treaty, want.noTreaty]) if (t !== undefined && !treaties.has(t)) say(where, `unknown treaty ${t}`)
    const fits = content.neighbours.filter(
      (n) =>
        (want.supplies === undefined || n.surpluses.includes(want.supplies)) &&
        (want.wants === undefined || n.needs.includes(want.wants)),
    )
    if (fits.length === 0) say(where, 'no neighbour in the pack fits this dilemma')
    else if (want.near && !fits.some((n) => n.near)) say(where, 'no neighbour on the border fits this dilemma')
  }

  for (const n of content.neighbours) {
    const where = `neighbours/${n.id}`
    checkText(where, n.description)
    abroad = true
    checkText(where, n.pleased)
    checkText(where, n.displeased)
    abroad = false
    for (const r of [...n.needs, ...n.surpluses]) if (!resources.has(r)) say(where, `unknown resource ${r}`)
    const both = n.needs.filter((r) => n.surpluses.includes(r))
    if (both.length) say(where, `cannot both need and have to spare ${both.join(', ')}`)
    for (const b of n.borders) {
      const other = content.neighbours.find((o) => o.id === b)
      if (b === n.id) say(where, 'cannot border itself')
      else if (!other) say(where, `borders ${b}, which is not a nation in the pack`)
      else if (!other.borders.includes(n.id)) say(where, `borders ${b}, but ${b} does not list ${n.id} back`)
    }
  }

  // The world: the borderlands, and one card for every kind of foreign matter.
  if (content.neighbours.length && content.world.matters.length) {
    const kinds = new Set(content.world.matters.map((m) => m.kind))
    for (const kind of MATTER_KINDS) if (!kinds.has(kind)) say('world', `no foreign matter of kind ${kind}`)
    const borderlands = new Set<string>()
    for (const b of content.world.borderlands) {
      if (borderlands.has(b)) say('world/borderlands', `${b} is listed twice`)
      borderlands.add(b)
    }
    const seen = new Set<string>()
    abroad = true
    matter = true
    for (const m of content.world.matters) {
      const where = `world/${m.kind}`
      if (seen.has(m.kind)) say(where, 'two foreign matters of the same kind')
      seen.add(m.kind)
      checkText(where, m.title)
      checkText(where, m.description)
      const ids = new Set<string>()
      for (const o of m.options) {
        const at = `${where}/${o.id}`
        if (ids.has(o.id)) say(where, `duplicate option id ${o.id}`)
        ids.add(o.id)
        if (!MATTER_ACTIONS[m.kind].includes(o.does)) {
          say(at, `does ${o.does}, which a ${m.kind} matter cannot; it may ${MATTER_ACTIONS[m.kind].join(', ')}`)
        }
        for (const e of o.effects) {
          if (!('indicator' in e || 'faction' in e || 'standing' in e || 'flag' in e)) {
            say(at, 'a foreign matter may only move indicators, factions and standing, or set a flag')
          }
        }
        checkEffects(at, o.effects)
        for (const value of [o.label, o.result, o.headline]) checkText(at, value)
      }
      if (m.options.filter((o) => o.lapse).length !== 1) say(where, 'exactly one option must be marked lapse')
    }
    abroad = false
    matter = false
  }

  for (const r of content.resources) {
    const where = `resources/${r.id}`
    checkCondition(where, r.need)
    checkCondition(where, r.surplus)
    if (JSON.stringify([r.need, r.surplus]).includes('"resource"')) {
      say(where, 'a resource rule cannot depend on another resource')
    }
  }

  abroad = true
  for (const t of content.treaties) {
    const where = `treaties/${t.id}`
    checkText(where, t.headline)
    checkText(where, t.description)
    checkEffects(where, t.weekly)
  }
  abroad = false

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

  for (const q of content.founding.questions) {
    const where = `founding/${q.id}`
    checkText(where, q.prompt)
    const seen = new Set<string>()
    for (const answer of q.answers) {
      if (seen.has(answer.id)) say(where, `duplicate answer id ${answer.id}`)
      seen.add(answer.id)
      checkText(`${where}/${answer.id}`, answer.label)
      checkEffects(`${where}/${answer.id}`, answer.effects)
      checkTradeOff(`${where}/${answer.id}`, answer.effects, 'answer')
    }
  }
  for (const id of INDICATORS) {
    checkFoundingRange(id, START_INDICATORS[id], (e) => 'indicator' in e && e.indicator === id)
  }
  for (const f of content.factions) {
    checkFoundingRange(`${f.id} approval`, 50, (e) => 'faction' in e && e.faction === f.id)
  }

  content.classes.forEach((c, i) => {
    const last = i === content.classes.length - 1
    checkCondition(`classes/${c.id}`, c.when)
    checkText(`classes/${c.id}`, c.name)
    checkText(`classes/${c.id}`, c.description)
    if (last && c.when) {
      say(`classes/${c.id}`, 'the last class must have no when, so every nation is something')
    }
    if (!last && !c.when) {
      say(`classes/${c.id}`, 'only the last class may have no when; nothing after this one can be reached')
    }
  })
  if (content.classes.length === 0) say('classes', 'the pack needs at least one class')

  // Tags are only compared after every option has been read.
  for (const s of content.situations) {
    for (const p of s.pressures) if (!tagsUsed.has(p.tag)) say(s.id, `pressure tag ${p.tag} is not used by any option`)
  }
  for (const t of content.traits) {
    for (const tag of t.opposes) if (!tagsUsed.has(tag)) say(t.id, `opposed tag ${tag} is not used by any option`)
  }
  for (const n of content.neighbours) {
    for (const tag of [...n.likes, ...n.dislikes]) {
      if (!tagsUsed.has(tag)) say(`neighbours/${n.id}`, `tag ${tag} is not used by any option`)
    }
  }
  for (const [flag, where] of flagsRead) {
    if (!flagsSet.has(flag)) say(where, `checks flag ${flag}, which nothing sets`)
  }

  const clout = content.factions.reduce((sum, f) => sum + f.clout, 0)
  if (content.factions.length && clout !== 100) say('factions', `clout adds up to ${clout}, not 100`)

  return problems
}
