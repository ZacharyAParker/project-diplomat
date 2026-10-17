import { z } from 'zod'
import { IDENTITY_FIELDS, INDICATORS, MATTER_KINDS, type Condition } from '@diplomat/engine'

const id = z.string().regex(/^[a-z][a-z0-9_-]*$/, 'ids are lowercase with dashes or underscores')
const text = z.string().trim().min(1)
const indicator = z.enum(INDICATORS)
const identityField = z.enum(IDENTITY_FIELDS)

const bounds = {
  gt: z.number().optional(),
  gte: z.number().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
}

export const condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(condition).min(1) }),
    z.strictObject({ any: z.array(condition).min(1) }),
    z.strictObject({ not: condition }),
    z.strictObject({ indicator, ...bounds }),
    z.strictObject({ faction: id, ...bounds }),
    z.strictObject({ policy: id, is: z.union([z.boolean(), z.number()]) }),
    z.strictObject({ flag: id, days: z.number().int().min(1).max(120).optional() }),
    z.strictObject({ trait: id }),
    z.strictObject({ day: z.strictObject(bounds) }),
    z.strictObject({ resource: id, is: z.enum(['need', 'surplus', 'even']) }),
    z.strictObject({ treaty: id }),
    z.strictObject({ identity: identityField, set: z.boolean() }),
  ]),
)

export const effect = z.union([
  z.strictObject({ indicator, by: z.number(), why: text }),
  z.strictObject({ faction: id, by: z.number(), why: text }),
  z.strictObject({ minister: id, by: z.number(), why: text }),
  z.strictObject({ situation: id, by: z.number(), why: text }),
  z.strictObject({ policy: id, to: z.union([z.boolean(), z.number()]) }),
  z.strictObject({ flag: id, clear: z.boolean().optional() }),
  z.strictObject({ standing: z.number(), why: text }),
  z.strictObject({ treaty: id, days: z.number().int().min(7).max(365).optional() }),
  z.strictObject({ endTreaty: id }),
  z.strictObject({ identity: identityField, to: text }),
])

const option = z.strictObject({
  id,
  advocate: z.strictObject({ name: text, role: text }),
  speech: text,
  when: condition.optional(),
  tags: z.array(id).default([]),
  effects: z.array(effect).min(1),
  later: z
    .array(
      z.strictObject({
        after: z.number().int().min(1).max(120),
        when: condition.optional(),
        headline: text,
        effects: z.array(effect).min(1),
      }),
    )
    .default([]),
  promise: z
    .strictObject({
      id,
      text,
      due: z.number().int().min(1).max(120),
      kept: condition,
      broken: z.array(effect).min(1),
    })
    .optional(),
  custom: z.strictObject({ field: identityField, label: text }).optional(),
  headline: text,
  result: text,
})

export const dilemma = z.strictObject({
  id,
  version: z.number().int().min(1).default(1),
  kind: z.enum(['major', 'minor']).default('major'),
  title: text,
  description: text,
  tags: z.array(id).default([]),
  when: condition.optional(),
  priority: z.number().int().default(0),
  weight: z.number().positive().default(1),
  repeat: z.number().int().min(7).max(180).optional(),
  abroad: z
    .strictObject({
      supplies: id.optional(),
      wants: id.optional(),
      standing: z.strictObject(bounds).optional(),
      treaty: id.optional(),
      noTreaty: id.optional(),
      near: z.boolean().optional(),
    })
    .optional(),
  author: z.string().optional(),
  options: z.array(option).min(2).max(4),
})

export const situation = z.strictObject({
  id,
  title: text,
  description: text,
  when: condition,
  gauge: text,
  start: z.number().min(0).max(100),
  pressures: z.array(z.strictObject({ tag: id, by: z.number() })).default([]),
  stages: z
    .array(z.strictObject({ title: text, description: text, options: z.array(option).min(2).max(4) }))
    .min(2),
  outcomes: z.array(z.strictObject({ ...bounds, headline: text, text, effects: z.array(effect) })).min(1),
})

export const trait = z.strictObject({
  id,
  name: text,
  description: text,
  earn: condition,
  lose: condition.optional(),
  opposes: z.array(id).default([]),
  penalty: z.number().min(0).max(10).default(3),
})

export const faction = z.strictObject({ id, name: text, description: text, clout: z.number().positive() })

export const policy = z.strictObject({
  id,
  name: text,
  description: text,
  default: z.union([z.boolean(), z.number()]).default(false),
})

export const cabinet = z.strictObject({
  portfolios: z.array(z.strictObject({ id, title: text })).min(1),
  names: z.strictObject({ given: z.array(text).min(8), family: z.array(text).min(8) }),
})

export const pack = z.strictObject({
  id,
  name: text,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'versions look like 0.1.0'),
})

const foundingEffect = z.union([
  z.strictObject({ indicator, by: z.number(), why: text }),
  z.strictObject({ faction: id, by: z.number(), why: text }),
  z.strictObject({ policy: id, to: z.union([z.boolean(), z.number()]) }),
])

export const founding = z.strictObject({
  questions: z
    .array(
      z.strictObject({
        id,
        prompt: text,
        answers: z
          .array(z.strictObject({ id, label: text, effects: z.array(foundingEffect).min(1) }))
          .min(3)
          .max(4),
      }),
    )
    .min(6)
    .max(8),
})

export const nationClass = z.strictObject({ id, name: text, description: text, when: condition.optional() })

export const neighbour = z.strictObject({
  id,
  name: text,
  demonym: text,
  leader: text,
  description: text,
  standing: z.number().min(-100).max(100).default(0),
  needs: z.array(id).default([]),
  surpluses: z.array(id).default([]),
  likes: z.array(id).default([]),
  dislikes: z.array(id).default([]),
  pleased: text,
  displeased: text,
  near: z.boolean().default(true),
  borders: z.array(id).default([]),
  temperament: z
    .strictObject({
      ambition: z.number().min(0).max(100),
      aggression: z.number().min(0).max(100),
      loyalty: z.number().min(0).max(100),
      charity: z.number().min(0).max(100),
    })
    .default({ ambition: 50, aggression: 30, loyalty: 50, charity: 50 }),
  strength: z.number().min(0).max(100).default(50),
  wealth: z.number().min(0).max(100).default(50),
  form: text.default('republic'),
})

export const resource = z.strictObject({ id, name: text, need: condition, surplus: condition })

export const treaty = z.strictObject({
  id,
  name: text,
  description: text,
  headline: text,
  weekly: z.array(effect).min(1),
  breaksBelow: z.number().min(-100).max(0).default(-30),
})

const matterOption = z.strictObject({
  id,
  label: text,
  does: id,
  effects: z.array(effect),
  other: z.number().min(-50).max(50).optional(),
  result: text,
  headline: text,
  lapse: z.boolean().optional(),
})

export const world = z.strictObject({
  borderlands: z.array(text).min(8),
  matters: z.array(
    z.strictObject({ kind: z.enum(MATTER_KINDS), title: text, description: text, options: z.array(matterOption).min(2).max(4) }),
  ),
})

export const oneOrMany = <T extends z.ZodType>(item: T) => z.union([z.array(item), item.transform((one) => [one])])
