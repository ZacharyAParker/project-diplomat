import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse } from 'yaml'
import type { z } from 'zod'
import type { Content } from '@diplomat/engine'
import * as schema from './schema.ts'

export interface Problem {
  where: string
  message: string
}

export interface Loaded {
  content: Content
  problems: Problem[]
}

export function loadPack(dir: string): Loaded {
  const problems: Problem[] = []

  function read<T extends z.ZodType>(file: string, shape: T): z.output<T> | undefined {
    const where = relative(dir, file).replaceAll('\\', '/')
    let raw: unknown
    try {
      raw = parse(readFileSync(file, 'utf8'))
    } catch (error) {
      problems.push({ where, message: `not valid YAML: ${(error as Error).message}` })
      return undefined
    }
    const result = shape.safeParse(raw)
    if (result.success) return result.data
    for (const issue of result.error.issues) {
      problems.push({ where: `${where} ${issue.path.join('.')}`.trim(), message: issue.message })
    }
    return undefined
  }

  function readAll<T extends z.ZodType>(folder: string, item: T): z.output<T>[] {
    const path = join(dir, folder)
    if (!existsSync(path)) return []
    return readdirSync(path)
      .filter((name) => name.endsWith('.yaml'))
      .sort()
      .flatMap((name) => read(join(path, name), schema.oneOrMany(item)) ?? [])
  }

  const cabinet = read(join(dir, 'cabinet.yaml'), schema.cabinet)
  const content: Content = {
    factions: read(join(dir, 'factions.yaml'), schema.faction.array()) ?? [],
    policies: read(join(dir, 'policies.yaml'), schema.policy.array()) ?? [],
    traits: read(join(dir, 'traits.yaml'), schema.trait.array()) ?? [],
    portfolios: cabinet?.portfolios ?? [],
    names: cabinet?.names ?? { given: [], family: [] },
    dilemmas: readAll('dilemmas', schema.dilemma),
    situations: readAll('situations', schema.situation),
  }
  return { content, problems }
}
