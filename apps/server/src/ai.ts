// The AI as the server uses it: one provider made from the settings, the status the menu
// shows, and the run wrapper every task goes through. A task is sent to the provider,
// validated, retried once with the problems named, and played by the rules-based stand-in
// if it still fails. The record says which.

import { createHash } from 'node:crypto'
import { AiError, createProvider, hasSessions, resolveModels, selfTest } from '@diplomat/ai'
import { standIn, validate, type Context, type Provider, type ProviderStatus, type Task, type TaskInput, type TaskOutput } from '@diplomat/government'
import type { Sessions } from './ooc.ts'
import type { SettingsStore } from './settings.ts'

const STATUS_FOR = 15_000

export interface Problem {
  code: string
  message: string
  at: string
}

export interface RunOptions {
  // The seed the stand-in plays with, worked out from the nation and the task.
  seed: (task: Task, input: unknown) => number
  archivePath?: string
  // Told when the AI could not be used, in words for the screen.
  onProblem?: (line: string) => void
  // Checked before each call: true when the work is no longer wanted (the day ended).
  cancelled?: () => boolean
  signal?: AbortSignal
  // Branch memory (claude-cli only): the nation's session store, which branch a task is,
  // and the term and day the call falls in.
  sessions?: { store: Sessions; branch: (task: Task, input: unknown) => string | null; term: string; day: number }
}

export class Ai {
  private settings: SettingsStore
  private made = -1
  private current: Provider | null = null
  private cached: { at: number; status: ProviderStatus; version: number } | null = null
  // The last thing that went wrong that the player should act on: a key refused, a limit hit.
  problem: Problem | null = null
  // For the tests: a provider to use instead of the one the settings would make.
  override: Provider | null = null
  overrideBackend: 'anthropic' | 'claude-cli' = 'anthropic'

  constructor(settings: SettingsStore) {
    this.settings = settings
  }

  backend() {
    return this.override ? this.overrideBackend : this.settings.get().backend
  }

  provider(): Provider {
    if (this.override) return this.override
    if (!this.current || this.made !== this.settings.version) {
      const s = this.settings.get()
      this.current = createProvider({
        backend: s.backend,
        ...(s.apiKey ? { apiKey: s.apiKey } : {}),
        ...(Object.keys(s.models).length ? { models: s.models } : {}),
        ...(s.command ? { command: s.command } : {}),
      })
      this.made = this.settings.version
      this.problem = null
      this.cached = null
    }
    return this.current
  }

  async status(): Promise<ProviderStatus> {
    const provider = this.provider()
    const now = Date.now()
    let status: ProviderStatus
    if (this.cached && this.cached.version === this.settings.version && now - this.cached.at < STATUS_FOR) status = this.cached.status
    else {
      try {
        status = await provider.status()
      } catch (error) {
        status = { backend: this.settings.get().backend, ok: false, detail: (error as Error).message, models: resolveModels(this.settings.get().models) }
      }
      this.cached = { at: now, status, version: this.settings.version }
    }
    if (this.problem && (this.problem.code === 'auth' || this.problem.code === 'rate-limited')) {
      return { ...status, ok: false, detail: `${status.detail}. Last problem: ${this.problem.message}` }
    }
    return status
  }

  async test(): Promise<ProviderStatus> {
    this.cached = null
    try {
      const status = await selfTest(this.provider())
      if (status.ok) this.problem = null
      return status
    } catch (error) {
      return { backend: this.settings.get().backend, ok: false, detail: (error as Error).message, models: resolveModels(this.settings.get().models) }
    }
  }

  private note(error: unknown, task: Task, opts: RunOptions) {
    const code = error instanceof AiError ? error.code : 'unavailable'
    const message = (error as Error).message
    if (code === 'off') return
    this.problem = { code, message, at: new Date().toISOString() }
    if (code === 'auth') opts.onProblem?.(`The AI refused the credentials (${message}). The stand-in sat in its place; check the settings.`)
    else if (code === 'rate-limited') opts.onProblem?.(`The AI is rate-limited (${message}). The stand-in sat in its place.`)
    else opts.onProblem?.(`The AI could not play ${task} (${message}). The stand-in sat in its place.`)
  }

  // The run function a pipeline Context takes.
  runner(opts: RunOptions): Context['run'] {
    return async <T extends Task>(task: T, input: TaskInput[T]): Promise<{ output: TaskOutput[T]; ai: boolean }> => {
      if (opts.cancelled?.()) throw new Error('The work was set aside: the day it was for has ended.')
      if (this.backend() !== 'none') {
        const provider = this.provider()
        const options = { ...(opts.archivePath ? { archivePath: opts.archivePath } : {}), ...(opts.signal ? { signal: opts.signal } : {}) }
        const key = opts.sessions?.branch(task, input) ?? null
        const sessions = opts.sessions && key && opts.archivePath && hasSessions(provider) ? opts.sessions : null
        // In a branch's own conversation: resume it (or start one), and keep the id it used.
        const call = async (sent: TaskInput[T]): Promise<unknown> => {
          if (!sessions || !key || !hasSessions(provider)) return provider.run(task, sent, options)
          const session = sessions.store.current(key, sessions.term)
          const result = await provider.runWithSession(task, sent, { ...options, ...(session ? { session } : {}) })
          await sessions.store.record(key, result.sessionId, sessions.day, sessions.term)
          return result.output
        }
        const attempts = async (): Promise<{ output: TaskOutput[T]; ai: boolean } | null> => {
        let problems: string[] = []
        let reported = false
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const sent = attempt === 0 ? input : ({ ...input, __retry: `Your last reply could not be used: ${problems.join('; ')}. Answer again, fixing these.` } as TaskInput[T])
            const raw = await call(sent)
            if (opts.cancelled?.()) throw new Error('The work was set aside: the day it was for has ended.')
            const checked = validate(task, input, raw)
            if (checked.ok) {
              if (this.problem && (this.problem.code === 'auth' || this.problem.code === 'rate-limited')) this.problem = null
              return { output: checked.value as TaskOutput[T], ai: true }
            }
            problems = checked.problems
          } catch (error) {
            if (opts.cancelled?.()) throw error
            this.note(error, task, opts)
            reported = true
            // A refused key or a limit will not be better a second later.
            if (error instanceof AiError && ['auth', 'rate-limited', 'off', 'aborted'].includes(error.code)) break
            problems = [(error as Error).message]
          }
        }
        if (problems.length && !reported) {
          opts.onProblem?.(`The AI's answer for ${task} did not hold up (${problems.slice(0, 3).join('; ')}). The stand-in sat in its place.`)
        }
        return null
        }
        // One writer per session: a branch's calls run one at a time, whoever asked.
        const done = sessions && key ? await sessions.store.lock(key, attempts) : await attempts()
        if (done) return done
      }
      return { output: standIn(task, input, opts.seed(task, input)), ai: false }
    }
  }
}

// A seed for the stand-ins from the nation, the day and what is being played, so a nation
// played without AI replays exactly.
export function seedFor(...parts: (string | number)[]): number {
  return createHash('sha256').update(parts.join(':')).digest().readUInt32LE(0)
}
