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
    if (!existsSync(file)) {
      problems.push({ where, message: 'file is missing' })
      return undefined
    }
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
      .filter((name) => /\.ya?ml$/i.test(name))
      .sort()
      .flatMap((name) => read(join(path, name), schema.oneOrMany(item)) ?? [])
  }

  // A list can live in one file at the root, in a folder of files, or both.
  function readSplit<T extends z.ZodType>(name: string, item: T): z.output<T>[] {
    const root = join(dir, `${name}.yaml`)
    const folder = readAll(name, item)
    if (!existsSync(root) && existsSync(join(dir, name))) return folder
    return [...(read(root, item.array()) ?? []), ...folder]
  }

  // For the parts of a pack that are allowed to be absent.
  function readIfThere<T extends z.ZodType>(file: string, shape: T): z.output<T> | undefined {
    return existsSync(file) ? read(file, shape) : undefined
  }

  const cabinet = read(join(dir, 'cabinet.yaml'), schema.cabinet)
  const content: Content = {
    pack: read(join(dir, 'pack.yaml'), schema.pack) ?? { id: 'unknown', name: 'Unknown', version: '0.0.0' },
    factions: read(join(dir, 'factions.yaml'), schema.faction.array()) ?? [],
    policies: readSplit('policies', schema.policy),
    traits: readSplit('traits', schema.trait),
    founding: read(join(dir, 'founding.yaml'), schema.founding) ?? { questions: [] },
    classes: read(join(dir, 'classes.yaml'), schema.nationClass.array().min(2)) ?? [],
    portfolios: cabinet?.portfolios ?? [],
    names: cabinet?.names ?? { given: [], family: [] },
    dilemmas: readAll('dilemmas', schema.dilemma),
    situations: readAll('situations', schema.situation),
    // The five that border the player's nation, then the rest of the world.
    neighbours: [
      ...(readIfThere(join(dir, 'neighbours.yaml'), schema.neighbour.array()) ?? []),
      ...(readIfThere(join(dir, 'nations.yaml'), schema.neighbour.array()) ?? []),
    ],
    resources: readIfThere(join(dir, 'resources.yaml'), schema.resource.array()) ?? [],
    treaties: readIfThere(join(dir, 'treaties.yaml'), schema.treaty.array()) ?? [],
    world: readIfThere(join(dir, 'world.yaml'), schema.world) ?? { borderlands: [], matters: [] },
  }
  return { content, problems }
}
