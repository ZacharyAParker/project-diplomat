// Branch memory and the airgap: each branch keeps its own Claude Code session in ooc/, and
// every branch call is sealed in to the archive folder by the CLI's own flags.

import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { after, before, test } from 'node:test'
import { claudeCliProvider, type SpawnFn } from '@diplomat/ai'
import { newNation } from '@diplomat/engine'
import { loadContent } from '../src/server.ts'
import { branchOf, MAX_CALLS, Sessions, termOf } from '../src/ooc.ts'
import { harness, IDENTITY, settle, type Harness } from './helpers.ts'

interface Call {
  args: string[]
  cwd: string | undefined
}

function fakeCli() {
  const calls: Call[] = []
  const spawn: SpawnFn = ((_file: string, args: readonly string[], options: { cwd?: string }) => {
    const child = new EventEmitter() as any
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.stdin = new Writable({ write: (_c, _e, done) => done() })
    child.kill = () => {}
    calls.push({ args: [...args], cwd: options.cwd })
    const at = args.indexOf('--session-id') >= 0 ? args.indexOf('--session-id') : args.indexOf('--resume')
    const session = at >= 0 ? args[at + 1] : undefined
    setImmediate(() => {
      // A reply that does not validate, so the stand-in plays: only the argv matters here.
      child.stdout.end(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '{"nothing":true}', session_id: session }))
      child.stderr.end()
      setImmediate(() => child.emit('close', 0))
    })
    return child
  }) as unknown as SpawnFn
  return { spawn, calls }
}

let h: Harness
before(async () => {
  h = await harness()
})
after(async () => {
  h.running.ai.override = null
  await h.close()
})

test('every branch call is sealed in to the archive, and ooc/ is outside it', async () => {
  const fake = fakeCli()
  h.running.ai.override = claudeCliProvider({ spawn: fake.spawn, platform: 'linux', concurrency: 4 })
  h.running.ai.overrideBackend = 'claude-cli'
  try {
    const made = await h.post('/api/nations', { identity: IDENTITY, answers: {}, form: 'commonwealth', mode: 'govern', founder: { name: 'Aegis', title: 'Founder' } })
    const id = made.json.id
    const dockets = await settle(h, id, 600)
    assert.equal(dockets[0].status, 'ready', dockets[0].error)
    const nationDir = join(h.data, 'nations', id)
    const archive = resolve(nationDir, 'archive')
    const ooc = resolve(nationDir, 'ooc')
    assert.ok(fake.calls.length >= 4, 'the branches were called')
    for (const call of fake.calls) {
      for (const flag of ['--safe-mode', '--strict-mcp-config', '--restricted', '--disable-slash-commands']) assert.ok(call.args.includes(flag), `${flag} in ${call.args.join(' ')}`)
      assert.equal(resolve(call.cwd!), archive, 'the working directory is the archive')
      assert.ok(!call.args.includes('--add-dir'), 'no other folder is added')
      assert.ok(!call.args.includes('--mcp-config'), 'no MCP server is given to a branch')
      assert.equal(call.args[call.args.indexOf('--tools') + 1], 'Read,Grep,Glob')
      assert.match(call.args[call.args.indexOf('--disallowedTools') + 1]!, /Bash/)
      assert.ok(call.args.includes('--session-id') || call.args.includes('--resume'), 'a branch keeps its own session')
      assert.ok(!call.args.join(' ').includes(ooc), 'ooc/ is never named to a branch')
    }
    // ooc/ is a sibling of archive/, never inside it: nothing confined to archive/ reaches it.
    const rel = relative(archive, ooc)
    assert.ok(rel.startsWith('..') && !rel.split(sep).includes('archive'), rel)
    const sessions = JSON.parse(readFileSync(join(ooc, 'sessions.json'), 'utf8'))
    assert.ok(sessions['body:assembly'] && sessions['body:court'], Object.keys(sessions).join(', '))
    // The validation retry resumed the same session it had just started.
    const assembly = fake.calls.filter((c) => c.args.includes(sessions['body:assembly'].id))
    assert.ok(assembly.length >= 2)
    assert.ok(assembly[0]!.args.includes('--session-id'))
    assert.ok(assembly[1]!.args.includes('--resume'))
    assert.equal(sessions['body:assembly'].calls, assembly.length)
    // No two branches share a session.
    const ids = Object.values(sessions).map((s: any) => s.id)
    assert.equal(new Set(ids).size, ids.length)
  } finally {
    h.running.ai.override = null
    h.running.ai.overrideBackend = 'anthropic'
  }
})

test('a branch session starts afresh on a new term, after twelve calls, and on reset', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'diplomat-sessions-'))
  try {
    const s = new Sessions(dir)
    assert.equal(s.current('world', 't1'), undefined)
    await s.record('world', '11111111-1111-4111-8111-111111111111', 1, 't1')
    assert.deepEqual(s.current('world', 't1'), { id: '11111111-1111-4111-8111-111111111111', resume: true })
    for (let i = 1; i < MAX_CALLS; i++) await s.record('world', '11111111-1111-4111-8111-111111111111', 2, 't1')
    assert.equal(s.entries()['world']!.calls, MAX_CALLS)
    assert.equal(s.current('world', 't1'), undefined, 'twelve calls is a full session')
    await s.record('world', '22222222-2222-4222-8222-222222222222', 3, 't1')
    assert.equal(s.current('world', 't2'), undefined, 'a new term')
    await s.record('executive', '33333333-3333-4333-8333-333333333333', 3, 't2')
    // The id the call actually used is always kept, even a new one for the same branch.
    await s.record('executive', '44444444-4444-4444-8444-444444444444', 3, 't2')
    assert.equal(s.entries()['executive']!.id, '44444444-4444-4444-8444-444444444444')
    assert.equal(s.entries()['executive']!.calls, 1)
    await s.reset()
    assert.deepEqual(s.entries(), {})
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'ooc', 'sessions.json'), 'utf8')), {})
    // One writer per session: two calls to one branch never overlap.
    const order: string[] = []
    await Promise.all([1, 2].map((n) => s.lock('court', async () => {
      order.push(`start ${n}`)
      await new Promise((ok) => setTimeout(ok, 10))
      order.push(`end ${n}`)
    })))
    assert.deepEqual(order, ['start 1', 'end 1', 'start 2', 'end 2'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('terms follow elections, or thirty days where there are none; branches are named by body', () => {
  const content = loadContent()
  const state = newNation(content, IDENTITY, 1)
  const t1 = termOf(state)
  assert.equal(termOf({ ...state, day: 30 }), t1)
  assert.equal(termOf({ ...state, timeline: [...state.timeline, { day: 2, kind: 'election', headline: 'x', changes: [] }] }) === t1, false)
  const none = { ...state, term: 0 }
  assert.equal(termOf({ ...none, day: 30 }), termOf({ ...none, day: 1 }))
  assert.notEqual(termOf({ ...none, day: 31 }), termOf({ ...none, day: 1 }))
  assert.equal(branchOf('legislature.sitting', { body: { id: 'assembly' } }), 'body:assembly')
  assert.equal(branchOf('bill.sitting', { body: { id: 'assembly' } }), 'body:assembly')
  assert.equal(branchOf('world.day', {}), 'world')
  assert.equal(branchOf('executive.decision', {}), 'executive')
  assert.equal(branchOf('factbook.draft', {}), null)
})
