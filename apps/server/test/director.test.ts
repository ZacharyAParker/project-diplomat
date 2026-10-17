import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { after, before, test } from 'node:test'
import type { SpawnFn } from '@diplomat/ai'
import { harness, IDENTITY, type Harness } from './helpers.ts'

interface Call {
  args: string[]
  cwd: string | undefined
  stdin: string
}

// A scripted Claude Code: --version and auth status answer at once; a turn plays the lines
// of `script`, one every few milliseconds, unless held open with `hold`.
function fakeClaude(script: () => object[], opts: { hold?: boolean; signedIn?: boolean } = {}) {
  const calls: Call[] = []
  const spawn: SpawnFn = ((_file: string, args: readonly string[], options: { cwd?: string }) => {
    const child = new EventEmitter() as any
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    const call: Call = { args: [...args], cwd: options.cwd, stdin: '' }
    child.stdin = new Writable({
      write(chunk, _enc, done) {
        call.stdin += String(chunk)
        done()
      },
    })
    let closed = false
    const close = (code: number) => {
      if (closed) return
      closed = true
      child.stdout.end()
      child.stderr.end()
      setImmediate(() => child.emit('close', code))
    }
    child.kill = () => close(143)
    if (args.includes('--version')) {
      setImmediate(() => {
        child.stdout.write('2.3.1 (Claude Code)\n')
        close(0)
      })
      return child
    }
    if (args.includes('auth')) {
      setImmediate(() => {
        child.stdout.write(JSON.stringify(opts.signedIn === false ? { loggedIn: false } : { loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' }))
        close(0)
      })
      return child
    }
    calls.push(call)
    const lines = script()
    let i = 0
    const next = () => {
      if (closed) return
      if (i < lines.length) {
        child.stdout.write(`${JSON.stringify(lines[i++])}\n`)
        setTimeout(next, 5)
      } else if (!opts.hold) close(0)
    }
    setTimeout(next, 5)
    return child
  }) as unknown as SpawnFn
  return { spawn, calls }
}

const delta = (text: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } })

let h: Harness
let id: string
before(async () => {
  h = await harness()
  id = (await h.post('/api/nations', { identity: IDENTITY, answers: {}, form: 'commonwealth', mode: 'govern', founder: { name: 'Aegis', title: 'Founder' } })).json.id
})
after(async () => {
  await h.close()
})

async function idle() {
  for (let i = 0; i < 300; i++) {
    const v = (await h.get(`/api/nations/${id}/director`)).json
    if (!v.busy) return v
    await new Promise((ok) => setTimeout(ok, 10))
  }
  throw new Error('the Director never finished')
}

test('a Director turn streams text, shows its tool use, ends with the result and is kept', async () => {
  const fake = fakeClaude(() => [
    { type: 'system', subtype: 'init', session_id: 'x' },
    delta('On the desk '),
    delta('today: one petition.'),
    { type: 'assistant', message: { content: [{ type: 'text', text: 'On the desk today: one petition.' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'mcp__diplomat__nation_overview', input: { nation: id } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }] } },
    delta('I would take Option 1.'),
    { type: 'result', subtype: 'success', is_error: false, result: 'I would take Option 1.', session_id: 'x' },
  ])
  h.running.director.spawn = fake.spawn
  const first = await h.get(`/api/nations/${id}/director`)
  assert.equal(first.json.available, true, first.json.detail)
  assert.equal(first.json.busy, false)
  const sent = await h.post(`/api/nations/${id}/director`, { text: 'What is on the desk?' })
  assert.equal(sent.status, 202, sent.json.error)
  assert.deepEqual(sent.json, { accepted: true })
  assert.equal((await h.post(`/api/nations/${id}/director`, { text: 'Again?' })).status, 409, 'one turn at a time')
  const v = await idle()
  const roles = v.messages.map((m: any) => m.role)
  assert.deepEqual(roles, ['founder', 'director', 'activity', 'director'])
  assert.equal(v.messages[1].text, 'On the desk today: one petition.', 'the full message is not added twice')
  assert.equal(v.messages[2].text, 'Used nation_overview')
  assert.equal(v.messages[3].text, 'I would take Option 1.')
  assert.ok(v.messages.every((m: any) => !m.streaming))
  // How Claude Code was started.
  const call = fake.calls[0]!
  assert.equal(call.cwd, join(h.data, 'nations', id))
  for (const flag of ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--strict-mcp-config', '--mcp-config', '--append-system-prompt', '--permission-mode', 'dontAsk', '--session-id']) assert.ok(call.args.includes(flag), flag)
  assert.equal(call.args[call.args.indexOf('--model') + 1], 'claude-opus-5-5')
  assert.equal(call.args[call.args.indexOf('--allowedTools') + 1], 'mcp__diplomat,Read,Grep,Glob')
  assert.match(call.args[call.args.indexOf('--disallowedTools') + 1]!, /Bash.*Write.*Edit.*WebFetch/)
  const config = JSON.parse(readFileSync(call.args[call.args.indexOf('--mcp-config') + 1]!, 'utf8'))
  assert.deepEqual(Object.keys(config.mcpServers), ['diplomat'])
  assert.ok(config.mcpServers.diplomat.args.includes(String(h.running.port)))
  assert.match(call.stdin, /What is on the desk\?/)
  const session = JSON.parse(readFileSync(join(h.data, 'nations', id, 'ooc', 'director.json'), 'utf8'))
  assert.equal(session.started, true)
  assert.equal(v.session.id, session.id)
  const kept = readFileSync(join(h.data, 'nations', id, 'ooc', 'director-transcript.jsonl'), 'utf8').trim().split('\n')
  assert.equal(kept.length, 4)
  // The next turn resumes the session.
  await h.post(`/api/nations/${id}/director`, { text: 'And then?' })
  await idle()
  assert.ok(fake.calls[1]!.args.includes('--resume'))
  assert.equal(fake.calls[1]!.args[fake.calls[1]!.args.indexOf('--resume') + 1], session.id)
})

test('stop ends a turn in progress; reset starts a new session and keeps the transcript', async () => {
  const fake = fakeClaude(() => [delta('Thinking about it')], { hold: true })
  h.running.director.spawn = fake.spawn
  assert.equal((await h.post(`/api/nations/${id}/director`, { text: 'Think hard.' })).status, 202)
  await new Promise((ok) => setTimeout(ok, 40))
  const during = (await h.get(`/api/nations/${id}/director`)).json
  assert.equal(during.busy, true)
  assert.equal(during.messages.at(-1).streaming, true)
  assert.equal(during.messages.at(-1).text, 'Thinking about it')
  assert.equal((await h.post(`/api/nations/${id}/director/reset`)).status, 409, 'not while it is answering')
  const stopped = await h.post(`/api/nations/${id}/director/stop`)
  assert.equal(stopped.json.stopped, true)
  const v = (await h.get(`/api/nations/${id}/director`)).json
  assert.equal(v.busy, false)
  assert.equal(v.messages.at(-1).text, 'Stopped by the Founder.')
  const before = v.session.id
  const count = v.messages.length
  const reset = await h.post(`/api/nations/${id}/director/reset`)
  assert.equal(reset.status, 200)
  const after = (await h.get(`/api/nations/${id}/director`)).json
  assert.notEqual(after.session.id, before)
  assert.equal(after.messages.length, count + 1, 'the transcript is kept')
  h.running.director.spawn = fakeClaude(() => [{ type: 'result', subtype: 'success', result: 'Fresh.', session_id: after.session.id }]).spawn
  const calls = fakeClaude(() => [{ type: 'result', subtype: 'success', result: 'Fresh.' }])
  h.running.director.spawn = calls.spawn
  await h.post(`/api/nations/${id}/director`, { text: 'Hello again.' })
  await idle()
  assert.ok(calls.calls[0]!.args.includes('--session-id'), 'a new session starts with --session-id')
  assert.equal(calls.calls[0]!.args[calls.calls[0]!.args.indexOf('--session-id') + 1], after.session.id)
})

test('the Director is unavailable when Claude Code is not signed in, or turned off', async () => {
  h.running.director.spawn = fakeClaude(() => [], { signedIn: false }).spawn
  await h.put('/api/settings', { director: { model: 'claude-sonnet-5-5' } })
  const v = (await h.get(`/api/nations/${id}/director`)).json
  assert.equal(v.available, false)
  assert.match(v.detail, /not signed in/)
  assert.equal((await h.post(`/api/nations/${id}/director`, { text: 'Hi' })).status, 503)
  await h.put('/api/settings', { director: { enabled: false } })
  const off = (await h.get(`/api/nations/${id}/director`)).json
  assert.equal(off.available, false)
  assert.match(off.detail, /turned off/)
  await h.put('/api/settings', { director: { enabled: true, model: 'claude-opus-5-5' } })
  assert.equal((await h.get('/api/nations/nobody/director')).status, 404)
  assert.ok(!existsSync(join(h.data, 'nations', id, 'archive', 'director.json')), 'nothing of the Director is in the archive')
})
