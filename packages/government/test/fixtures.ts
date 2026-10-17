// Shared by the government tests: the core pack, a nation, a government of any form, and an
// in-memory context that plays every task with the stand-ins and validates the result, as
// the server does with AI off.

import { fileURLToPath } from 'node:url'
import { checkPack } from '../../content/src/index.ts'
import { callUp, newNation, type Content, type GameState, type Identity } from '@diplomat/engine'
import { newGovernment } from '../src/government.ts'
import type { Context, RecordQuery } from '../src/pipeline.ts'
import { standIn } from '../src/standins.ts'
import { FORM_IDS, type ArchiveDocument, type FormId, type GovernmentState, type Task, type TaskInput, type TaskOutput } from '../src/types.ts'
import { validate } from '../src/validate.ts'

const loaded = checkPack(fileURLToPath(new URL('../../../packs/core', import.meta.url)))
if (loaded.problems.length) throw new Error(`the core pack has problems: ${loaded.problems[0]!.message}`)
export const content: Content = loaded.content

export const identity: Identity = {
  name: 'Vesland',
  capital: 'Ostra',
  currency: 'krona',
  demonym: 'Veslander',
  leaderTitle: 'Chancellor',
  flag: { layout: 'bands', colours: ['navy', 'gold'] },
}

export const FOUNDABLE = FORM_IDS.filter((f) => f !== 'custom') as Exclude<FormId, 'custom'>[]

export const founder = { name: 'Aegis', title: 'Founder' }

export function nation(seed = 1): GameState {
  return newNation(content, identity, seed, { origin: 'uprising', livelihood: 'industry' })
}

export function government(form: FormId, state: GameState, mode: 'govern' | 'found' = 'found', seed = 7): GovernmentState {
  return newGovernment(form, mode, state, content, { founder, calendarStart: '2026-10-11', seed, answers: { livelihood: 'industry' } })
}

// A state with this dilemma on the desk, whatever the agenda drew.
export const withDilemma = (state: GameState, id: string) => callUp(state, content, id)

export interface Memory {
  ctx: Context
  docs: ArchiveDocument[]
  runs: { task: Task; ok: boolean; problems: string[] }[]
  lines: string[]
}

export function memory(state: GameState, gov: GovernmentState, seed = 3): Memory {
  const docs: ArchiveDocument[] = []
  const runs: Memory['runs'] = []
  const lines: string[] = []
  const counters: Record<string, number> = {}
  const ctx: Context = {
    state,
    gov,
    content,
    async run<T extends Task>(task: T, input: TaskInput[T]) {
      const output = standIn(task, input, seed)
      const checked = validate(task, input, output)
      runs.push({ task, ok: checked.ok, problems: checked.ok ? [] : checked.problems })
      if (!checked.ok) throw new Error(`${task} stand-in failed validation: ${checked.problems.join('; ')}`)
      return { output: checked.value as TaskOutput[T], ai: false }
    },
    async write(doc) {
      counters[doc.series] = (counters[doc.series] ?? 0) + 1
      const id = `${doc.series}-${String(counters[doc.series]).padStart(5, '0')}`
      docs.push({ ...doc, id, date: `day ${doc.day}` })
      return id
    },
    async record(query: RecordQuery) {
      return docs
        .filter((d) => (!query.series || d.series === query.series) && (!query.dilemma || d.refs.includes(query.dilemma)))
        .slice(-(query.limit ?? 5))
        .reverse()
        .map((d) => ({ id: d.id, title: d.title, extract: d.body.slice(0, 200) }))
    },
    progress(line) {
      lines.push(line)
    },
  }
  return { ctx, docs, runs, lines }
}
