// The supported back end: the player's own API key, the Messages API, called from the server
// only. Each task is one request: its prompt as a cached system prompt, its input as JSON in
// the user turn, and a single tool whose input schema is the task's output. The reply is the
// tool call's input.
//
// Tool choice is "auto", not forced: Claude Opus 5.5 and Sonnet 5.5 refuse a forced tool
// choice with a 400, and with thinking on (always, on Opus 5.5) a forced choice is not
// accepted anyway. The prompt and the user turn both say to answer through the tool, the
// reply is checked for the call, a JSON object in plain text is accepted in its place, and a
// reply with neither is asked for once more.

import { TASK_TIERS, type Provider, type ProviderStatus, type Task, type TaskInput, type Tier } from '@diplomat/government'
import {
  AiError,
  EFFORT,
  MAX_TOKENS,
  TIMEOUTS,
  deadline,
  extractJson,
  minutes,
  modelFor,
  tierOf,
  type TierOverrides,
  resolveModels,
  sleep,
  userMessage,
} from '../common.ts'
import { promptFor } from '../prompts.ts'
import { schemaFor } from '../schemas.ts'

export const ANTHROPIC_VERSION = '2023-06-01'
export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
// Server-side refusal fallback, "default" form: Anthropic picks the fallback model by the
// refusal's category. Offered for these models on the Claude API.
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-opus-5', 'claude-fable-5-1'])

export interface AnthropicSettings {
  apiKey: string
  models?: Partial<Record<Tier, string>>
  tiers?: TierOverrides
  fetch?: typeof fetch
  baseUrl?: string
  // Ask the API to re-run a refused request on its recommended fallback model. On by default.
  fallbacks?: boolean
  // Retries after an overloaded or failing service. Two by default.
  maxRetries?: number
  // The first wait before a retry; it doubles each time. 2 s by default.
  retryDelayMs?: number
  timeouts?: Partial<Record<Tier, number>>
}

export interface AnthropicProvider extends Provider {
  selfTest(): Promise<ProviderStatus>
}

export const toolName = (task: Task) => task.replace(/[^a-zA-Z0-9_-]/g, '_')

export function keyHint(apiKey: string): string {
  const key = apiKey.trim()
  return key.length >= 4 ? `Claude API key ending ${key.slice(-4)}` : 'Claude API key'
}

export interface BuiltRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

// The request for one task, exactly as it is sent. Exported for the tests.
export function buildRequest<T extends Task>(
  task: T,
  input: TaskInput[T],
  settings: Pick<AnthropicSettings, 'apiKey' | 'models' | 'baseUrl' | 'fallbacks' | 'tiers'>,
): BuiltRequest {
  const models = resolveModels(settings.models)
  const model = modelFor(task, models, settings.tiers)
  const tier = tierOf(task, settings.tiers)
  const name = toolName(task)
  const { json, instruction } = userMessage(
    task,
    input,
    `Give your complete answer by calling the \`${name}\` tool exactly once. Write nothing outside the tool call.`,
  )
  const fallbacks = settings.fallbacks !== false && FALLBACK_MODELS.has(model)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': settings.apiKey.trim(),
    'anthropic-version': ANTHROPIC_VERSION,
  }
  if (fallbacks) headers['anthropic-beta'] = FALLBACK_BETA
  const body: Record<string, unknown> = {
    model,
    max_tokens: MAX_TOKENS[task],
    stream: true,
    system: [{ type: 'text', text: promptFor(task), cache_control: { type: 'ephemeral' } }],
    tools: [
      {
        name,
        description: `Submit the finished ${task} record. Its input is the whole answer, in the shape given under "## Output".`,
        input_schema: schemaFor(task, input),
        eager_input_streaming: true,
      },
    ],
    tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    output_config: { effort: EFFORT[tier] },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: json },
          { type: 'text', text: instruction },
        ],
      },
    ],
  }
  if (fallbacks) body.fallbacks = 'default'
  const base = (settings.baseUrl ?? ANTHROPIC_BASE_URL).replace(/\/+$/, '')
  return { url: `${base}/v1/messages`, headers, body }
}

// --- Reading a reply ------------------------------------------------------------------

interface Block {
  type: string
  name?: string
  text: string
  json: string
  input?: unknown
}

export interface Reply {
  blocks: Block[]
  stopReason?: string
  stopDetails?: { category?: string | null; explanation?: string | null }
  model?: string
}

// Read a streamed (SSE) or plain JSON Messages API reply into its content blocks.
export async function readReply(response: Response): Promise<Reply> {
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('text/event-stream')) return fromMessage(await response.json())
  const reply: Reply = { blocks: [] }
  const text = response.body ? await streamText(response.body) : await response.text()
  for (const raw of text.split(/\r?\n\r?\n/)) {
    const data = raw
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (!data) continue
    let event: any
    try {
      event = JSON.parse(data)
    } catch {
      continue
    }
    switch (event.type) {
      case 'message_start':
        reply.model = event.message?.model
        break
      case 'content_block_start': {
        const b = event.content_block ?? {}
        reply.blocks[event.index] = { type: b.type, name: b.name, text: b.text ?? '', json: '' }
        break
      }
      case 'content_block_delta': {
        const block = reply.blocks[event.index]
        if (!block) break
        if (event.delta?.type === 'text_delta') block.text += event.delta.text ?? ''
        else if (event.delta?.type === 'input_json_delta') block.json += event.delta.partial_json ?? ''
        break
      }
      case 'message_delta':
        if (event.delta?.stop_reason) reply.stopReason = event.delta.stop_reason
        if (event.delta?.stop_details) reply.stopDetails = event.delta.stop_details
        break
      case 'error':
        throw apiError(event.error?.type, event.error?.message, 200)
    }
  }
  reply.blocks = reply.blocks.filter(Boolean)
  return reply
}

async function streamText(body: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder()
  let out = ''
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) out += decoder.decode(chunk, { stream: true })
  return out + decoder.decode()
}

function fromMessage(message: any): Reply {
  return {
    model: message?.model,
    stopReason: message?.stop_reason,
    stopDetails: message?.stop_details ?? undefined,
    blocks: (message?.content ?? []).map((b: any) => ({ type: b.type, name: b.name, text: b.text ?? '', json: '', input: b.input })),
  }
}

// The task's answer from a reply, or a reason it has none.
export function answerOf(reply: Reply, task: Task): Record<string, unknown> {
  if (reply.stopReason === 'refusal') {
    const why = reply.stopDetails?.category ? ` (${reply.stopDetails.category})` : ''
    throw new AiError('refused', `Claude declined to write the ${task} record${why}. The stand-in will take its place.`)
  }
  if (reply.stopReason === 'max_tokens') {
    throw new AiError('cut-off', `The ${task} reply ran past its length limit and was cut off.`)
  }
  const call = reply.blocks.find((b) => b.type === 'tool_use' && b.name === toolName(task))
  if (call) {
    if (call.input !== undefined && call.json === '') {
      if (call.input && typeof call.input === 'object' && !Array.isArray(call.input)) return call.input as Record<string, unknown>
    } else {
      try {
        const value: unknown = JSON.parse(call.json || '{}')
        if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
      } catch {
        // fall through to the text
      }
    }
  }
  const text = reply.blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  return extractJson(text)
}

// --- Errors ---------------------------------------------------------------------------

function apiError(type: string | undefined, message: string | undefined, status: number, retryAfter?: number): AiError {
  const said = message ? ` The service said: ${message}` : ''
  if (status === 401 || type === 'authentication_error') {
    return new AiError('auth', 'The API key was refused. Check it in Settings, or make a new one in the Claude Console.', { status })
  }
  if (status === 403 || type === 'permission_error') {
    return new AiError('auth', `The API key is not allowed to do this.${said}`, { status })
  }
  if (status === 402 || type === 'billing_error') {
    return new AiError('auth', `The Claude account behind this key has a billing problem.${said}`, { status })
  }
  if (status === 404 || type === 'not_found_error') {
    return new AiError('bad-request', `The model is not available to this API key. Choose another in Settings.${said}`, { status })
  }
  if (status === 429 || type === 'rate_limit_error') {
    const wait = retryAfter !== undefined ? ` Try again in about ${retryAfter} seconds.` : ' Try again in a minute.'
    return new AiError('rate-limited', `Claude is rate limiting this API key.${wait}`, {
      status,
      ...(retryAfter !== undefined ? { retryAfter } : {}),
    })
  }
  if (status === 529 || type === 'overloaded_error') {
    return new AiError('overloaded', 'Claude is overloaded just now. Try again in a few minutes.', {
      status,
      ...(retryAfter !== undefined ? { retryAfter } : {}),
    })
  }
  if (status >= 500 || type === 'api_error') {
    return new AiError('unavailable', `The Claude API had an internal error.${said}`, { status })
  }
  if (status === 413 || type === 'request_too_large') {
    return new AiError('bad-request', 'The request was too large for the Claude API.', { status })
  }
  return new AiError('bad-request', `The Claude API rejected the request.${said}`, { status })
}

const retryable = (error: AiError) => error.code === 'overloaded' || error.code === 'unavailable'

function retryAfterOf(response: Response): number | undefined {
  const value = response.headers.get('retry-after')
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds))
  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - Date.now()) / 1000))
}

async function errorOf(response: Response): Promise<AiError> {
  let type: string | undefined
  let message: string | undefined
  try {
    const body: any = await response.json()
    type = body?.error?.type
    message = body?.error?.message
  } catch {
    // no body worth reading
  }
  return apiError(type, message, response.status, retryAfterOf(response))
}

// --- The provider -----------------------------------------------------------------------

export function anthropicProvider(settings: AnthropicSettings): AnthropicProvider {
  const doFetch = settings.fetch ?? globalThis.fetch
  const models = resolveModels(settings.models)
  const maxRetries = settings.maxRetries ?? 2
  const firstDelay = settings.retryDelayMs ?? 2000
  const base = (settings.baseUrl ?? ANTHROPIC_BASE_URL).replace(/\/+$/, '')
  const hasKey = settings.apiKey.trim().length > 0

  async function once(request: BuiltRequest, signal: AbortSignal): Promise<Reply> {
    let response: Response
    try {
      response = await doFetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal,
      })
    } catch (error) {
      if (signal.aborted) throw error
      throw new AiError('unavailable', 'Could not reach the Claude API. Check the internet connection.', { cause: error })
    }
    if (!response.ok) throw await errorOf(response)
    return readReply(response)
  }

  return {
    async status(): Promise<ProviderStatus> {
      return {
        backend: 'anthropic',
        ok: hasKey,
        detail: hasKey ? keyHint(settings.apiKey) : 'No Claude API key is set',
        models,
      }
    },

    // A cheap check that the key works: look up the bulk model. No tokens are spent.
    async selfTest(): Promise<ProviderStatus> {
      const status = { backend: 'anthropic' as const, models }
      if (!hasKey) return { ...status, ok: false, detail: 'No Claude API key is set' }
      const hint = keyHint(settings.apiKey)
      let response: Response
      try {
        response = await doFetch(`${base}/v1/models/${encodeURIComponent(models.bulk)}`, {
          method: 'GET',
          headers: { 'x-api-key': settings.apiKey.trim(), 'anthropic-version': ANTHROPIC_VERSION },
          signal: AbortSignal.timeout(20_000),
        })
      } catch {
        return { ...status, ok: false, detail: `${hint}: could not reach the Claude API` }
      }
      if (response.ok) return { ...status, ok: true, detail: `${hint} works; ${models.bulk} is available` }
      const error = await errorOf(response)
      return { ...status, ok: false, detail: `${hint}: ${error.message}` }
    },

    async run<T extends Task>(task: T, input: TaskInput[T], options: { archivePath?: string; signal?: AbortSignal } = {}) {
      if (!hasKey) throw new AiError('auth', 'No Claude API key is set. Add one in Settings.')
      const tier = tierOf(task, settings.tiers)
      const limit = settings.timeouts?.[tier] ?? TIMEOUTS[tier]
      const { signal, timedOut } = deadline(limit, options.signal)
      const request = buildRequest(task, input, settings)
      let failures = 0
      let unanswered = 0
      for (;;) {
        try {
          const reply = await once(request, signal)
          try {
            return answerOf(reply, task)
          } catch (error) {
            // A reply with no tool call and no JSON is asked for once more.
            if (error instanceof AiError && error.code === 'not-json' && unanswered === 0) {
              unanswered++
              continue
            }
            throw error
          }
        } catch (error) {
          if (signal.aborted) {
            if (timedOut()) throw new AiError('timeout', `Claude took longer than ${minutes(limit)} over ${task} and was stopped.`)
            throw new AiError('aborted', `The ${task} request was cancelled.`)
          }
          if (error instanceof AiError && retryable(error) && failures < maxRetries) {
            const wait = error.retryAfter !== undefined ? error.retryAfter * 1000 : firstDelay * 2 ** failures
            failures++
            try {
              await sleep(Math.min(wait, 60_000), signal)
            } catch {
              if (timedOut()) throw new AiError('timeout', `Claude took longer than ${minutes(limit)} over ${task} and was stopped.`)
              throw new AiError('aborted', `The ${task} request was cancelled.`)
            }
            continue
          }
          throw error
        }
      }
    },
  }
}
