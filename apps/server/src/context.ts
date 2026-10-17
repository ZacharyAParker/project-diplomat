// The pipeline's Context for one nation: its state and government as they stand, the AI
// through the run wrapper, the nation's Archive for writing and for the record a brief
// reads, and somewhere for progress lines to go.

import { resolve } from 'node:path'
import type { Content } from '@diplomat/engine'
import { formatDate, type Context } from '@diplomat/government'
import { seedFor, type Ai } from './ai.ts'
import type { Nation } from './store.ts'

export interface ContextOptions {
  progress?: (line: string) => void
  onProblem?: (line: string) => void
  cancelled?: () => boolean
}

export function contextFor(n: Nation, content: Content, ai: Ai, opts: ContextOptions = {}): Context {
  const state = n.state
  const gov = n.gov
  const archivePath = ai.backend() === 'claude-cli' ? resolve(n.archive.dir) : undefined
  const run = ai.runner({
    seed: (task, input) => {
      const i = input as { petition?: { number?: number }; body?: { id?: string } }
      return seedFor(state.seed, state.day, task, i.petition?.number ?? 0, i.body?.id ?? '')
    },
    ...(archivePath ? { archivePath } : {}),
    ...(opts.onProblem ? { onProblem: opts.onProblem } : opts.progress ? { onProblem: opts.progress } : {}),
    ...(opts.cancelled ? { cancelled: opts.cancelled } : {}),
  })
  return {
    state,
    gov,
    content,
    run,
    write: (doc) => n.archive.write({ ...doc, date: formatDate(gov.institutions.calendar.start, doc.day) }),
    record: async (query) => n.archive.record(query, query.body ? gov.institutions.bodies.find((b) => b.id === query.body)?.name : undefined),
    progress: opts.progress ?? (() => {}),
    ...(archivePath ? { archivePath } : {}),
  }
}
