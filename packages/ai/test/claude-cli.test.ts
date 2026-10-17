import assert from 'node:assert/strict'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { test } from 'node:test'
import { AiError, buildCall, childEnv, claudeCliProvider, parseEnvelope, promptFor, resolveCommand, selfTest } from '../src/index.ts'
import { adviceInput, brief } from './fixtures.ts'

interface Spawned {
  command: string
  args: readonly string[]
  options: SpawnOptions
  stdin: string
  killed: boolean
}

// A spawn that answers each call with the next scripted reply.
function mockSpawn(...replies: ({ stdout?: string; stderr?: string; code?: number } | 'hang' | 'enoent')[]) {
  const calls: Spawned[] = []
  const spawn = (command: string, args: readonly string[], options: SpawnOptions): ChildProcess => {
    const reply = replies.shift() ?? { stdout: '', code: 1 }
    const child = new EventEmitter() as EventEmitter & Partial<ChildProcess>
    const record: Spawned = { command, args, options, stdin: '', killed: false }
    calls.push(record)
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    Object.assign(child, {
      stdout,
      stderr,
      stdin: new Writable({
        write(chunk, _enc, done) {
          record.stdin += String(chunk)
          done()
        },
        final(done) {
          done()
          if (reply === 'hang') return
          setImmediate(() => {
            if (reply === 'enoent') return void child.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }))
            if (reply.stdout) stdout.write(reply.stdout)
            if (reply.stderr) stderr.write(reply.stderr)
            stdout.end()
            stderr.end()
            setImmediate(() => child.emit('close', reply.code ?? 0))
          })
        },
      }),
      kill() {
        record.killed = true
        setImmediate(() => child.emit('close', null))
        return true
      },
    })
    return child as ChildProcess
  }
  return { spawn, calls }
}

const ADVICE = { summary: 'Replace the lamps.', paper: '# Paper', favours: '1' }
const envelope = (fields: object) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: 'x', total_cost_usd: 0.001, ...fields })

const ENV = { PATH: '/usr/bin', HOME: '/home/p', ANTHROPIC_API_KEY: 'sk-ant-secret', ANTHROPIC_AUTH_TOKEN: 'tok', CLAUDECODE: '1', CLAUDE_CODE_OAUTH_TOKEN: 'keep' }

function flag(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : undefined
}

test('the call is print mode, JSON out, the tier model, the task prompt appended, read-only tools', () => {
  const archive = join('data', 'nations', 'n1', 'archive')
  const call = buildCall('ministry.advice', { ...adviceInput, brief: { ...brief, archivePath: archive } }, { env: ENV })
  assert.equal(call.args[0], '-p')
  assert.equal(flag(call.args, '--output-format'), 'json')
  assert.equal(flag(call.args, '--model'), 'claude-haiku-5-5')
  assert.equal(flag(call.args, '--effort'), 'low')
  assert.equal(flag(call.args, '--append-system-prompt'), promptFor('ministry.advice'))
  assert.equal(flag(call.args, '--tools'), 'Read,Grep,Glob')
  assert.equal(flag(call.args, '--allowedTools'), 'Read,Grep,Glob')
  const denied = flag(call.args, '--disallowedTools')!.split(',')
  for (const tool of ['Write', 'Edit', 'Bash', 'PowerShell', 'WebFetch', 'mcp__*']) assert.ok(denied.includes(tool), tool)
  assert.equal(flag(call.args, '--permission-mode'), 'dontAsk')
  for (const f of ['--strict-mcp-config', '--safe-mode', '--disable-slash-commands', '--no-session-persistence']) assert.ok(call.args.includes(f), f)
  assert.equal(JSON.parse(flag(call.args, '--json-schema')!).type, 'object')
  assert.ok(!call.args.includes('--bare'), 'bare mode would ignore the subscription login')
  assert.ok(!call.args.includes('--dangerously-skip-permissions'))
  assert.equal(call.cwd, archive)
  assert.ok(call.stdin.startsWith('{'))
  assert.deepEqual(JSON.parse(call.stdin.slice(0, call.stdin.indexOf('\n\n'))), { ...adviceInput, brief: { ...brief, archivePath: archive } })
  assert.match(call.stdin, /read your own past record/)
  // Credentials that would outrank the subscription login never reach the child.
  assert.equal(call.env.ANTHROPIC_API_KEY, undefined)
  assert.equal(call.env.ANTHROPIC_AUTH_TOKEN, undefined)
  assert.equal(call.env.CLAUDECODE, undefined)
  assert.equal(call.env.CLAUDE_CODE_OAUTH_TOKEN, 'keep')
  assert.equal(call.env.PATH, '/usr/bin')
})

test('with no archive there are no tools, and an options archivePath wins', () => {
  const bare = buildCall('court.opinion', { ...adviceInput, rights: [], articles: [], precedents: [], barVotes: 2 } as never, { env: ENV, models: { strategic: 'claude-opus-4-8' }, jsonSchema: false })
  assert.equal(flag(bare.args, '--tools'), '')
  assert.ok(!bare.args.includes('--allowedTools'))
  assert.ok(!bare.args.includes('--json-schema'))
  assert.equal(flag(bare.args, '--model'), 'claude-opus-4-8')
  assert.equal(flag(bare.args, '--effort'), 'high')
  assert.equal(bare.cwd, undefined)
  const given = buildCall('ministry.advice', adviceInput, { env: ENV }, { archivePath: 'X' })
  assert.equal(given.cwd, 'X')
  assert.deepEqual(childEnv({ anthropic_api_key: 'lower', Keep: '1' }), { Keep: '1' })
})

test('on Windows the command resolves to claude.exe, or to the npm shim\'s script under node', () => {
  const path = ['C:\\one', 'C:\\two'].join(';')
  const exe = resolveCommand('claude', 'win32', { PATH: path }, (p) => p === join('C:\\two', 'claude.exe'))
  assert.deepEqual(exe, { file: join('C:\\two', 'claude.exe'), prefix: [] })
  const script = join('C:\\one', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
  const shim = resolveCommand('claude', 'win32', { PATH: path }, (p) => p === join('C:\\one', 'claude.cmd') || p === script)
  assert.deepEqual(shim, { file: process.execPath, prefix: [script] })
  assert.deepEqual(resolveCommand('claude', 'linux', {}), { file: 'claude', prefix: [] })
})

test('run spawns without a shell, feeds stdin, and returns the structured output or the JSON in the result', async () => {
  const { spawn, calls } = mockSpawn(
    { stdout: envelope({ result: 'done', structured_output: ADVICE }) },
    { stdout: envelope({ result: 'Here it is:\n```json\n' + JSON.stringify(ADVICE) + '\n```' }) },
  )
  const ai = claudeCliProvider({ spawn, env: ENV, platform: 'linux' })
  assert.deepEqual(await ai.run('ministry.advice', adviceInput), ADVICE)
  assert.deepEqual(await ai.run('ministry.advice', adviceInput), ADVICE)
  assert.equal(calls[0]!.command, 'claude')
  assert.equal(calls[0]!.options.shell, false)
  assert.equal(calls[0]!.options.env!.ANTHROPIC_API_KEY, undefined)
  assert.ok(typeof calls[0]!.options.cwd === 'string' && calls[0]!.options.cwd.includes('diplomat-ai-'), 'runs in an empty scratch folder')
  assert.ok(calls[0]!.stdin.includes('"dilemma": "harbour_lights"'))
})

test('the envelope: arrays, errors, sign-in and limits', () => {
  assert.deepEqual(parseEnvelope(JSON.stringify([{ type: 'system' }, JSON.parse(envelope({ result: '{"a":1}' }))])), { a: 1 })
  assert.throws(
    () => parseEnvelope(envelope({ subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' })),
    (e: unknown) => e instanceof AiError && e.code === 'auth' && /sign in with \/login/.test(e.message),
  )
  assert.throws(
    () => parseEnvelope(envelope({ is_error: true, result: 'Claude usage limit reached. Your limit will reset at 5pm.' })),
    (e: unknown) => e instanceof AiError && e.code === 'rate-limited',
  )
  assert.throws(() => parseEnvelope(envelope({ subtype: 'error_max_structured_output_retries', result: '' })), (e: unknown) => e instanceof AiError && e.code === 'not-json')
  assert.throws(() => parseEnvelope(envelope({ result: 'I cannot help with that.' })), (e: unknown) => e instanceof AiError && e.code === 'not-json')
  assert.throws(() => parseEnvelope('garbage'), (e: unknown) => e instanceof AiError)
})

test('a missing command, a timeout and a cancel are clear errors', async () => {
  const missing = mockSpawn('enoent')
  await assert.rejects(claudeCliProvider({ spawn: missing.spawn, env: ENV, platform: 'linux' }).run('ministry.advice', adviceInput), /Claude Code was not found/)

  const hung = mockSpawn('hang')
  await assert.rejects(
    claudeCliProvider({ spawn: hung.spawn, env: ENV, platform: 'linux', timeouts: { bulk: 30 } }).run('ministry.advice', adviceInput),
    (e: unknown) => e instanceof AiError && e.code === 'timeout',
  )
  assert.equal(hung.calls[0]!.killed, true)

  const cancelled = mockSpawn('hang')
  const controller = new AbortController()
  const pending = claudeCliProvider({ spawn: cancelled.spawn, env: ENV, platform: 'linux' }).run('ministry.advice', adviceInput, { signal: controller.signal })
  setTimeout(() => controller.abort(), 10)
  await assert.rejects(pending, (e: unknown) => e instanceof AiError && e.code === 'aborted')
  assert.equal(cancelled.calls[0]!.killed, true)
})

test('status reports the version; selfTest says which credential, and never the account', async () => {
  const auth = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max', email: 'someone@example.com', orgName: 'Org' })
  const { spawn, calls } = mockSpawn(
    { stdout: '2.1.302 (Claude Code)\n' },
    { stdout: '2.1.302 (Claude Code)\n' },
    { stdout: auth },
    { stdout: '2.1.302 (Claude Code)\n' },
    { stdout: JSON.stringify({ loggedIn: false, authMethod: 'none' }), code: 1 },
  )
  const ai = claudeCliProvider({ spawn, env: ENV, platform: 'linux' })
  const status = await ai.status()
  assert.equal(status.ok, true)
  assert.equal(status.detail, 'Claude Code 2.1.302')
  assert.deepEqual(calls[0]!.args, ['--version'])
  const good = await selfTest(ai)
  assert.equal(good.ok, true)
  assert.match(good.detail, /signed in with a Claude subscription \(max\)/)
  assert.match(good.detail, /ANTHROPIC_API_KEY is set for the game, but it is not passed/)
  assert.doesNotMatch(good.detail, /someone|Org/)
  assert.deepEqual(calls[2]!.args, ['auth', 'status'])
  assert.equal(calls[2]!.options.env!.ANTHROPIC_API_KEY, undefined)
  const out = await selfTest(ai)
  assert.equal(out.ok, false)
  assert.match(out.detail, /not signed in/)

  const missing = mockSpawn('enoent')
  const gone = await claudeCliProvider({ spawn: missing.spawn, env: ENV, platform: 'linux' }).status()
  assert.equal(gone.ok, false)
  assert.match(gone.detail, /not found/)
})
