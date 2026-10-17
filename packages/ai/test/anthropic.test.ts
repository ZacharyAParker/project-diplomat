import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AiError, anthropicProvider, buildRequest, promptFor, selfTest } from '../src/index.ts'
import { FALLBACK_BETA } from '../src/providers/anthropic.ts'
import { adviceInput, courtInput } from './fixtures.ts'

const KEY = 'sk-ant-test-0000-4f2a'

// A streamed Messages API reply that calls the task's tool with `answer`.
function sse(events: object[]): Response {
  const body = events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function toolReply(name: string, answer: object, stop = 'tool_use'): Response {
  const json = JSON.stringify(answer)
  return sse([
    { type: 'message_start', message: { model: 'claude-haiku-5-5' } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name, input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: json.slice(0, 10) } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: json.slice(10) } },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: stop } },
    { type: 'message_stop' },
  ])
}

function textReply(text: string, stop = 'end_turn', extra: object = {}): Response {
  return sse([
    { type: 'message_start', message: { model: 'claude-haiku-5-5' } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: stop, ...extra } },
  ])
}

const errorReply = (status: number, type: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ type: 'error', error: { type, message: `${type} happened` } }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

function mockFetch(...replies: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = replies.shift()
    if (!next) throw new Error('no more replies')
    if (next instanceof Error) throw next
    return next
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

const ADVICE = { summary: 'Replace the lamps.', paper: '# Paper', favours: '1' }

test('the request has the key, the version, the model for the tier, one tool and a cached system prompt', () => {
  const req = buildRequest('ministry.advice', adviceInput, { apiKey: ` ${KEY} ` })
  assert.equal(req.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(req.headers['x-api-key'], KEY)
  assert.equal(req.headers['anthropic-version'], '2023-06-01')
  assert.equal(req.headers['content-type'], 'application/json')
  assert.equal(req.headers['anthropic-beta'], undefined, 'Haiku gets no fallback beta')
  const body = req.body as any
  assert.equal(body.model, 'claude-haiku-5-5')
  assert.equal(body.stream, true)
  assert.equal(body.max_tokens, 8000)
  assert.deepEqual(body.output_config, { effort: 'low' })
  assert.equal(body.system.length, 1)
  assert.equal(body.system[0].text, promptFor('ministry.advice'))
  assert.deepEqual(body.system[0].cache_control, { type: 'ephemeral' })
  assert.equal(body.tools.length, 1)
  assert.equal(body.tools[0].name, 'ministry_advice')
  assert.equal(body.tools[0].input_schema.type, 'object')
  assert.deepEqual(body.tools[0].input_schema.required, ['summary', 'paper'])
  assert.deepEqual(body.tool_choice, { type: 'auto', disable_parallel_tool_use: true })
  assert.equal(body.messages.length, 1)
  assert.equal(body.messages[0].role, 'user')
  assert.deepEqual(JSON.parse(body.messages[0].content[0].text), adviceInput)
  assert.match(body.messages[0].content[1].text, /calling the `ministry_advice` tool exactly once/)
  assert.equal(body.fallbacks, undefined)
})

test('strategic and standard tasks use their tier models, and opt into fallbacks', () => {
  const court = buildRequest('court.opinion', courtInput, { apiKey: KEY })
  assert.equal((court.body as any).model, 'claude-opus-5-5')
  assert.deepEqual((court.body as any).output_config, { effort: 'high' })
  assert.equal((court.body as any).fallbacks, 'default')
  assert.equal(court.headers['anthropic-beta'], FALLBACK_BETA)
  assert.deepEqual((court.body as any).tools[0].input_schema.required, ['rulings', 'opinion', 'cautions', 'directions'])

  const world = buildRequest('world.day', { brief: adviceInput.brief, decisions: [], timeline: [], press: [], bounds: { perEffect: 3, perDay: 5, maxEffects: 4 } }, { apiKey: KEY })
  assert.equal((world.body as any).model, 'claude-sonnet-5-5')

  const custom = buildRequest('court.opinion', courtInput, { apiKey: KEY, models: { strategic: 'claude-opus-4-8' }, fallbacks: true })
  assert.equal((custom.body as any).model, 'claude-opus-4-8')
  assert.equal((custom.body as any).fallbacks, undefined)
  const off = buildRequest('court.opinion', courtInput, { apiKey: KEY, fallbacks: false })
  assert.equal((off.body as any).fallbacks, undefined)
})

test('run returns the tool call input', async () => {
  const { fetch, calls } = mockFetch(toolReply('ministry_advice', ADVICE))
  const ai = anthropicProvider({ apiKey: KEY, fetch })
  assert.deepEqual(await ai.run('ministry.advice', adviceInput), ADVICE)
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.init.method, 'POST')
  assert.ok(calls[0]!.init.signal instanceof AbortSignal)
  assert.equal((calls[0]!.init.headers as Record<string, string>)['x-api-key'], KEY)
})

test('a JSON object in plain text is accepted, and a reply with neither is asked for once more', async () => {
  const text = mockFetch(textReply('```json\n{"summary":"s","paper":"p"}\n```'))
  assert.deepEqual(await anthropicProvider({ apiKey: KEY, fetch: text.fetch }).run('ministry.advice', adviceInput), {
    summary: 's',
    paper: 'p',
  })

  const twice = mockFetch(textReply('I would rather not say.'), toolReply('ministry_advice', ADVICE))
  assert.deepEqual(await anthropicProvider({ apiKey: KEY, fetch: twice.fetch }).run('ministry.advice', adviceInput), ADVICE)
  assert.equal(twice.calls.length, 2)

  const never = mockFetch(textReply('No.'), textReply('Still no.'))
  await assert.rejects(anthropicProvider({ apiKey: KEY, fetch: never.fetch }).run('ministry.advice', adviceInput), (e: unknown) => e instanceof AiError && e.code === 'not-json')
})

test('a refusal and a cut-off reply are errors', async () => {
  const refused = mockFetch(textReply('', 'refusal', { stop_details: { type: 'refusal', category: 'cyber' } }))
  await assert.rejects(anthropicProvider({ apiKey: KEY, fetch: refused.fetch }).run('ministry.advice', adviceInput), (e: unknown) => e instanceof AiError && e.code === 'refused' && /cyber/.test(e.message))
  const cut = mockFetch(toolReply('ministry_advice', ADVICE, 'max_tokens'))
  await assert.rejects(anthropicProvider({ apiKey: KEY, fetch: cut.fetch }).run('ministry.advice', adviceInput), (e: unknown) => e instanceof AiError && e.code === 'cut-off')
})

test('401 says the key was refused, and is not retried', async () => {
  const { fetch, calls } = mockFetch(errorReply(401, 'authentication_error'))
  await assert.rejects(anthropicProvider({ apiKey: KEY, fetch }).run('ministry.advice', adviceInput), (e: unknown) => e instanceof AiError && e.code === 'auth' && /API key was refused/.test(e.message))
  assert.equal(calls.length, 1)
})

test('429 reports the rate limit with its retry-after, and is not retried', async () => {
  const { fetch, calls } = mockFetch(errorReply(429, 'rate_limit_error', { 'retry-after': '37' }))
  await assert.rejects(anthropicProvider({ apiKey: KEY, fetch }).run('ministry.advice', adviceInput), (e: unknown) => e instanceof AiError && e.code === 'rate-limited' && e.retryAfter === 37 && /37 seconds/.test(e.message))
  assert.equal(calls.length, 1)
})

test('overloaded is retried twice with backoff, then given up', async () => {
  const ok = mockFetch(errorReply(529, 'overloaded_error'), errorReply(500, 'api_error'), toolReply('ministry_advice', ADVICE))
  assert.deepEqual(await anthropicProvider({ apiKey: KEY, fetch: ok.fetch, retryDelayMs: 1 }).run('ministry.advice', adviceInput), ADVICE)
  assert.equal(ok.calls.length, 3)

  const bad = mockFetch(errorReply(529, 'overloaded_error'), errorReply(529, 'overloaded_error'), errorReply(529, 'overloaded_error'))
  await assert.rejects(anthropicProvider({ apiKey: KEY, fetch: bad.fetch, retryDelayMs: 1 }).run('ministry.advice', adviceInput), (e: unknown) => e instanceof AiError && e.code === 'overloaded')
  assert.equal(bad.calls.length, 3)

  // An overloaded error in the middle of the stream counts too.
  const mid = mockFetch(sse([{ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }]), toolReply('ministry_advice', ADVICE))
  assert.deepEqual(await anthropicProvider({ apiKey: KEY, fetch: mid.fetch, retryDelayMs: 1 }).run('ministry.advice', adviceInput), ADVICE)
})

test('a timeout and a cancelled call stop the request', async () => {
  const hang = (async (_url: string | URL, init?: RequestInit) =>
    new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))) as typeof fetch
  await assert.rejects(anthropicProvider({ apiKey: KEY, fetch: hang, timeouts: { bulk: 20 } }).run('ministry.advice', adviceInput), (e: unknown) => e instanceof AiError && e.code === 'timeout')
  const controller = new AbortController()
  const pending = anthropicProvider({ apiKey: KEY, fetch: hang }).run('ministry.advice', adviceInput, { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, (e: unknown) => e instanceof AiError && e.code === 'aborted')
})

test('status names the key without calling out; selfTest looks up a model', async () => {
  const { fetch, calls } = mockFetch(new Response('{"id":"claude-haiku-5-5"}', { status: 200 }), errorReply(401, 'authentication_error'))
  const ai = anthropicProvider({ apiKey: KEY, fetch })
  const status = await ai.status()
  assert.deepEqual(status, {
    backend: 'anthropic',
    ok: true,
    detail: 'Claude API key ending 4f2a',
    models: { bulk: 'claude-haiku-5-5', standard: 'claude-sonnet-5-5', strategic: 'claude-opus-5-5' },
  })
  assert.equal(calls.length, 0)
  const good = await selfTest(ai)
  assert.equal(good.ok, true)
  assert.match(good.detail, /ending 4f2a works/)
  assert.equal(calls[0]!.url, 'https://api.anthropic.com/v1/models/claude-haiku-5-5')
  assert.equal(calls[0]!.init.method, 'GET')
  const bad = await selfTest(ai)
  assert.equal(bad.ok, false)
  assert.match(bad.detail, /API key was refused/)

  const none = anthropicProvider({ apiKey: '', fetch })
  assert.equal((await none.status()).ok, false)
  await assert.rejects(none.run('ministry.advice', adviceInput), /No Claude API key/)
})
