import { z } from 'zod'
import { INDICATORS, type Condition } from '@diplomat/engine'

const id = z.string().regex(/^[a-z][a-z0-9_-]*$/, 'ids are lowercase with dashes or underscores')
const text = z.string().trim().min(1)
const indicator = z.enum(INDICATORS)

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
    z.strictObject({ flag: id }),
    z.strictObject({ trait: id }),
    z.strictObject({ day: z.strictObject(bounds) }),
  ]),
)

export const effect = z.union([
  z.strictObject({ indicator, by: z.number(), why: text }),
  z.strictObject({ faction: id, by: z.number(), why: text }),
  z.strictObject({ minister: id, by: z.number(), why: text }),
  z.strictObject({ situation: id, by: z.number(), why: text }),
  z.strictObject({ policy: id, to: z.union([z.boolean(), z.number()]) }),
  z.strictObject({ flag: id, clear: z.boolean().optional() }),
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

export const oneOrMany = <T extends z.ZodType>(item: T) => z.union([z.array(item), item.transform((one) => [one])])
