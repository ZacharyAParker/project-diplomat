// What every back end shares: the default models, the size and patience each task gets, the
// errors a player can act on, and pulling a JSON object out of a model's text.

import { TASK_TIERS, type Task, type TaskInput, type Tier } from '@diplomat/government'

export const DEFAULT_MODELS: Readonly<Record<Tier, string>> = {
  bulk: 'claude-haiku-5-5',
  standard: 'claude-sonnet-5-5',
  strategic: 'claude-opus-5-5',
}

export function resolveModels(models?: Partial<Record<Tier, string>>): Record<Tier, string> {
  const out = { ...DEFAULT_MODELS }
  for (const tier of Object.keys(out) as Tier[]) {
    const given = models?.[tier]?.trim()
    if (given) out[tier] = given
  }
  return out
}

export const modelFor = (task: Task, models: Record<Tier, string>): string => models[TASK_TIERS[task]]

// Output budget per task. Thinking counts against it too, so it is generous: a reply cut off
// at the limit is thrown away, which costs more than the unused tokens would have.
export const MAX_TOKENS: Readonly<Record<Task, number>> = {
  'legislature.sitting': 32000,
  'court.opinion': 32000,
  'council.sitting': 24000,
  'electorate.referendum': 12000,
  'ministry.advice': 8000,
  'executive.decision': 16000,
  'world.day': 24000,
  'founding.institutions': 24000,
  'factbook.draft': 12000,
  'letters.draft': 12000,
  'exchange.reply': 16000,
  'bill.sitting': 20000,
}

// How long a call may take before it is abandoned, by tier.
export const TIMEOUTS: Readonly<Record<Tier, number>> = {
  bulk: 3 * 60_000,
  standard: 6 * 60_000,
  strategic: 10 * 60_000,
}

export const EFFORT: Readonly<Record<Tier, 'low' | 'medium' | 'high'>> = {
  bulk: 'low',
  standard: 'medium',
  strategic: 'high',
}

export type AiErrorCode =
  | 'off'
  | 'auth'
  | 'rate-limited'
  | 'overloaded'
  | 'timeout'
  | 'aborted'
  | 'refused'
  | 'cut-off'
  | 'not-json'
  | 'unavailable'
  | 'bad-request'

// Every failure a provider throws is one of these, with a message a player can act on.
export class AiError extends Error {
  readonly code: AiErrorCode
  // Seconds to wait, when the service said.
  readonly retryAfter?: number
  readonly status?: number
  constructor(code: AiErrorCode, message: string, extra: { retryAfter?: number; status?: number; cause?: unknown } = {}) {
    super(message, extra.cause === undefined ? undefined : { cause: extra.cause })
    this.name = 'AiError'
    this.code = code
    if (extra.retryAfter !== undefined) this.retryAfter = extra.retryAfter
    if (extra.status !== undefined) this.status = extra.status
  }
}

// The archive folder an agent may read, if the caller gave one.
export function archivePathOf(input: unknown, options?: { archivePath?: string }): string | undefined {
  if (options?.archivePath) return options.archivePath
  const brief = (input as { brief?: { archivePath?: unknown } } | null)?.brief
  return typeof brief?.archivePath === 'string' && brief.archivePath ? brief.archivePath : undefined
}

// What the model is sent as the user turn: the input as JSON, then one line saying how to
// answer. The JSON is data. The prompt says so; this line does not repeat the rules.
export function userMessage(task: Task, input: TaskInput[Task], how: string): { json: string; instruction: string } {
  return {
    json: JSON.stringify(input, null, 1),
    instruction: `The JSON above is the input for ${task}. ${how}`,
  }
}

// Pull one JSON object out of a model's text: the whole text, a ```json fenced block, or the
// first balanced {...} in it. Throws when there is no object to be had.
export function extractJson(text: string): Record<string, unknown> {
  const tried: string[] = []
  const attempt = (candidate: string | undefined): Record<string, unknown> | undefined => {
    if (candidate === undefined) return undefined
    const trimmed = candidate.trim()
    if (!trimmed || tried.includes(trimmed)) return undefined
    tried.push(trimmed)
    try {
      const value: unknown = JSON.parse(trimmed)
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
    } catch {
      // not this one
    }
    return undefined
  }

  if (typeof text !== 'string') throw new AiError('not-json', 'The reply was empty.')
  const whole = attempt(text)
  if (whole) return whole

  for (const match of text.matchAll(/```[ \t]*(?:json|JSON)?[ \t]*\r?\n([\s\S]*?)```/g)) {
    const found = attempt(match[1])
    if (found) return found
  }

  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    const end = balancedEnd(text, start)
    if (end < 0) continue
    const found = attempt(text.slice(start, end + 1))
    if (found) return found
  }

  throw new AiError('not-json', 'The reply did not contain a JSON object, so it could not be used.')
}

// The index of the brace that closes the one at `start`, skipping braces inside strings.
function balancedEnd(text: string, start: number): number {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// One signal for "the caller gave up or the time ran out", and a way to tell which.
export function deadline(ms: number, signal?: AbortSignal): { signal: AbortSignal; timedOut: () => boolean } {
  const timeout = AbortSignal.timeout(ms)
  return {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    timedOut: () => timeout.aborted && !signal?.aborted,
  }
}

export const minutes = (ms: number) => `${Math.round(ms / 60_000)} minute${Math.round(ms / 60_000) === 1 ? '' : 's'}`
