// The opt-in back end: the player's own installed, signed-in Claude Code, run as
// `claude -p` once per task. This is how Claudetopia ran: with the nation's archive folder as
// its working directory, an agent can read its own past sittings and opinions in full.
//
// What it promises (docs/research/04-ai-providers.md, sections 2 and 4):
// - It runs the unmodified binary found on PATH. It never bundles, patches or logs it in.
// - It never reads, copies or stores credentials. Sign-in is the player's, through
//   Anthropic's own flow, in a terminal.
// - ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN are removed from the child's environment, so
//   the player's subscription login is what the call uses (in -p mode a key in the
//   environment would otherwise always win, and bill the player's API account).
// - Read-only and sealed in: the built-in tools are cut down to Read, Grep and Glob (or none
//   when there is no archive), confined to the archive by --restricted (so ooc/, a sibling
//   of archive/, is out of reach), everything else is disallowed, permissions that would
//   prompt are refused, MCP servers, hooks, skills, plugins and CLAUDE.md files are not
//   loaded, and nothing is saved as a resumable session.

import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, extname, isAbsolute, join } from 'node:path'
import { TASK_TIERS, type Provider, type ProviderStatus, type Task, type TaskInput, type Tier } from '@diplomat/government'
import {
  AiError,
  EFFORT,
  TIMEOUTS,
  archivePathOf,
  extractJson,
  minutes,
  modelFor,
  resolveModels,
  userMessage,
} from '../common.ts'
import { promptFor } from '../prompts.ts'
import { schemaFor } from '../schemas.ts'

export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess

export interface ClaudeCliSettings {
  command?: string
  models?: Partial<Record<Tier, string>>
  spawn?: SpawnFn
  // Per tier, in milliseconds. Strategic tasks get ten minutes by default.
  timeouts?: Partial<Record<Tier, number>>
  // Pass the task's output schema with --json-schema, so Claude Code checks the shape before
  // it answers. On by default; the text answer is still accepted when it is absent.
  jsonSchema?: boolean
  // How many `claude -p` processes may run at once. Two by default: they share the player's
  // own usage limits with everything else they do in Claude.
  concurrency?: number
  // Where to look the command up. Defaults to this process's platform and environment.
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
}

// A branch's own Claude Code conversation, carried on between calls: `--session-id <id>` the
// first time, `--resume <id>` after. The id is a UUID the caller keeps (ooc/sessions.json).
export interface BranchSession {
  id: string
  resume: boolean
}

export interface SessionRunOptions {
  archivePath?: string
  signal?: AbortSignal
  session?: BranchSession
}

export interface SessionResult {
  output: unknown
  // The session the call actually used: the one given, or a new one when the given session
  // could not be resumed (or none was given). Store it and resume it next time.
  sessionId: string
}

export interface ClaudeCliProvider extends Provider {
  selfTest(): Promise<ProviderStatus>
  runWithSession<T extends Task>(task: T, input: TaskInput[T], options?: SessionRunOptions): Promise<SessionResult>
}

// Providers that keep a branch's conversation between calls. Only claude-cli does.
export type SessionProvider = Provider & Pick<ClaudeCliProvider, 'runWithSession'>

export function hasSessions(provider: Provider | null | undefined): provider is SessionProvider {
  return typeof (provider as Partial<SessionProvider> | null | undefined)?.runWithSession === 'function'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Tools the agent may use, when it has an archive to read, and tools it may never use.
export const READ_TOOLS = ['Read', 'Grep', 'Glob'] as const
export const DENIED_TOOLS = [
  'Bash',
  'PowerShell',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'Task',
  'Agent',
  'TodoWrite',
  'mcp__*',
] as const

// Credentials that would take precedence over the player's subscription login, and the
// marker that tells Claude Code it is being run from inside another Claude Code session.
export const STRIPPED_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDECODE'] as const

export function childEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  const stripped = new Set<string>(STRIPPED_ENV.map((name) => name.toUpperCase()))
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || stripped.has(name.toUpperCase())) continue
    out[name] = value
  }
  return out
}

// --- Finding the command ------------------------------------------------------------------

export interface Resolved {
  file: string
  // Arguments that go before Claude Code's own, e.g. the script path when it runs under node.
  prefix: string[]
}

// On Windows, spawn without a shell can run an .exe but not a .cmd shim. Look for
// claude.exe on PATH; failing that, find the npm shim and run the script it points at with
// this Node. Elsewhere the command is run as given.
export function resolveCommand(
  command: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
): Resolved {
  if (platform !== 'win32') return { file: command, prefix: [] }
  const ext = extname(command).toLowerCase()
  const candidates: string[] = []
  const names = ext ? [command] : [`${command}.exe`, `${command}.cmd`, command]
  if (isAbsolute(command) || command.includes('/') || command.includes('\\')) candidates.push(...names)
  else {
    const path = env.PATH ?? env.Path ?? ''
    for (const dir of path.split(delimiter).filter(Boolean)) for (const name of names) candidates.push(join(dir, name))
  }
  for (const candidate of candidates) {
    if (!exists(candidate)) continue
    const kind = extname(candidate).toLowerCase()
    if (kind === '.exe' || kind === '') return { file: candidate, prefix: [] }
    if (kind === '.cmd' || kind === '.bat') {
      const script = join(dirname(candidate), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
      if (exists(script)) return { file: process.execPath, prefix: [script] }
    }
  }
  return { file: command, prefix: [] }
}

// --- Building the call --------------------------------------------------------------------

export interface CliCall {
  args: string[]
  cwd?: string
  stdin: string
  env: NodeJS.ProcessEnv
}

export function buildCall<T extends Task>(
  task: T,
  input: TaskInput[T],
  settings: Pick<ClaudeCliSettings, 'models' | 'jsonSchema' | 'env'> = {},
  options: { archivePath?: string; session?: BranchSession } = {},
): CliCall {
  const models = resolveModels(settings.models)
  const archive = archivePathOf(input, options)
  const tier = TASK_TIERS[task]
  const args = [
    '-p',
    '--output-format',
    'json',
    '--model',
    modelFor(task, models),
    '--effort',
    EFFORT[tier],
    '--append-system-prompt',
    promptFor(task),
    // The built-in tool set: Read, Grep and Glob over the archive, or nothing.
    '--tools',
    archive ? READ_TOOLS.join(',') : '',
  ]
  if (archive) args.push('--allowedTools', READ_TOOLS.join(','))
  args.push(
    '--disallowedTools',
    DENIED_TOOLS.join(','),
    // Anything not allowed above is refused rather than asked about.
    '--permission-mode',
    'dontAsk',
    // No MCP servers from anywhere, and no CLAUDE.md, hooks, skills, plugins or agents.
    '--strict-mcp-config',
    '--safe-mode',
    // Confines Read, Grep and Glob to the working directory (the archive), so a branch cannot
    // read ooc/ or anything else beside it; also drops the user's settings files.
    '--restricted',
    '--disable-slash-commands',
  )
  // A branch session is kept on disk by Claude Code so it can be resumed; a one-off call is not.
  const session = options.session
  if (!session) args.push('--no-session-persistence')
  else args.push(session.resume ? '--resume' : '--session-id', session.id)
  if (settings.jsonSchema !== false) args.push('--json-schema', JSON.stringify(schemaFor(task, input)))
  const how = archive
    ? 'You may read your own past record in the working directory first. Then reply with the JSON object only.'
    : 'Reply with the JSON object only.'
  const { json, instruction } = userMessage(task, input, how)
  // In a carried-on conversation the earlier turns were earlier business. Say what this is.
  const date = (input as { brief?: { date?: unknown } } | null)?.brief?.date
  const heading = session
    ? `New business: ${task}${typeof date === 'string' && date ? `, ${date}` : ''}. Earlier turns in this conversation were earlier business and are settled; answer this one only, as your system prompt for ${task} says. Today's brief below is the current truth: where it and anything you remember disagree, the brief wins.\n\n`
    : ''
  return {
    args,
    ...(archive ? { cwd: archive } : {}),
    stdin: `${heading}${json}\n\n${instruction}\n`,
    env: childEnv(settings.env),
  }
}

// Windows refuses a command line over 32,767 characters. Count it as CreateProcess would see
// it (each argument quoted, quotes and backslashes escaped), with a little to spare.
export function commandLineLength(file: string, args: readonly string[]): number {
  return [file, ...args].reduce((sum, arg) => sum + arg.length + (arg.match(/["\\]/g)?.length ?? 0) + 3, 0)
}

// --- Reading the reply --------------------------------------------------------------------

// Claude Code's JSON envelope: { type: "result", subtype, is_error, result, structured_output,
// session_id, total_cost_usd, usage, ... }. Some versions print an array of messages ending
// in the result. Returns the task's answer, or throws with what went wrong.
export function parseEnvelope(stdout: string): Record<string, unknown> {
  let envelope: any
  try {
    envelope = JSON.parse(stdout.trim())
  } catch {
    const tail = stdout.trim().slice(-400)
    if (tail) throw failure(tail)
    throw new AiError('unavailable', 'Claude Code printed nothing.')
  }
  if (Array.isArray(envelope)) envelope = [...envelope].reverse().find((m) => m?.type === 'result') ?? envelope.at(-1)
  if (!envelope || typeof envelope !== 'object') throw new AiError('not-json', 'Claude Code replied with something other than its JSON result.')
  const text = typeof envelope.result === 'string' ? envelope.result : ''
  const subtype = String(envelope.subtype ?? '')
  if (envelope.is_error === true || (subtype && subtype !== 'success')) {
    if (subtype === 'error_max_structured_output_retries') {
      throw new AiError('not-json', 'Claude Code could not produce a reply in the required shape.')
    }
    throw failure(text || (Array.isArray(envelope.errors) ? envelope.errors.join('; ') : '') || subtype || 'unknown error')
  }
  const structured = envelope.structured_output
  if (structured && typeof structured === 'object' && !Array.isArray(structured)) return structured as Record<string, unknown>
  return extractJson(text)
}

// Turn what Claude Code said when it failed into something the player can act on.
export function failure(said: string): AiError {
  const text = said.trim().slice(0, 400)
  if (/no conversation found|session .*not found|could not find (a )?session/i.test(text)) {
    return new AiError('session-missing', `Claude Code has no conversation to resume: ${text}`)
  }
  if (/session id .*(already in use|already exists)/i.test(text)) {
    return new AiError('session-taken', `Claude Code already has a conversation with that id: ${text}`)
  }
  if (/not logged in|log ?in expired|please run \/login|\/login|invalid api key|authenticat|oauth token/i.test(text)) {
    return new AiError(
      'auth',
      'Claude Code is not signed in, or its sign-in has expired. Open a terminal, run `claude`, and sign in with /login.',
    )
  }
  if (/rate.?limit|usage limit|limit reached|limit will reset|too many requests|quota/i.test(text)) {
    return new AiError('rate-limited', `Claude Code has reached a usage limit for now. It said: ${text}`)
  }
  if (/overloaded|529/i.test(text)) return new AiError('overloaded', 'Claude is overloaded just now. Try again in a few minutes.')
  if (/credit balance|billing/i.test(text)) return new AiError('auth', `Claude Code reported a billing problem: ${text}`)
  return new AiError('unavailable', `Claude Code failed: ${text}`)
}

// --- Running it ---------------------------------------------------------------------------

interface Ran {
  code: number | null
  stdout: string
  stderr: string
}

function runChild(
  spawn: SpawnFn,
  resolved: Resolved,
  args: string[],
  options: { cwd?: string; env: NodeJS.ProcessEnv; stdin?: string; timeoutMs: number; signal?: AbortSignal },
): Promise<Ran> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess
    try {
      child = spawn(resolved.file, [...resolved.prefix, ...args], {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (error) {
      reject(spawnError(error))
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    let stopped: AiError | undefined
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      fn()
    }
    const stop = (reason: AiError) => {
      stopped = reason
      try {
        child.kill()
      } catch {
        // already gone
      }
      // If it will not die, do not wait for it.
      setTimeout(() => finish(() => reject(reason)), 5000).unref?.()
    }
    const timer = setTimeout(
      () => stop(new AiError('timeout', `Claude Code took longer than ${minutes(options.timeoutMs)} and was stopped.`)),
      options.timeoutMs,
    )
    const onAbort = () => stop(new AiError('aborted', 'The request was cancelled.'))
    if (options.signal?.aborted) onAbort()
    else options.signal?.addEventListener('abort', onAbort, { once: true })

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => (stdout += chunk))
    child.stderr?.on('data', (chunk: string) => (stderr += chunk))
    child.on('error', (error) => finish(() => reject(stopped ?? spawnError(error))))
    child.on('close', (code) => finish(() => (stopped ? reject(stopped) : resolve({ code, stdout, stderr }))))
    child.stdin?.on('error', () => {
      // The child may exit before reading everything; its exit code says what happened.
    })
    child.stdin?.end(options.stdin ?? '')
  })
}

function spawnError(error: unknown): AiError {
  const code = (error as { code?: string } | null)?.code
  if (code === 'ENOENT') {
    return new AiError('unavailable', 'Claude Code was not found. Install it, sign in once in a terminal, and try again.', { cause: error })
  }
  if (code === 'E2BIG' || code === 'ENAMETOOLONG') {
    return new AiError('bad-request', 'The prompt was too long to hand to Claude Code on this system.', { cause: error })
  }
  return new AiError('unavailable', `Claude Code could not be started: ${(error as Error)?.message ?? String(error)}`, { cause: error })
}

// A small queue, so the game never runs more than a couple of `claude -p` at once.
function limiter(size: number) {
  let running = 0
  const waiting: (() => void)[] = []
  return async <R>(work: () => Promise<R>): Promise<R> => {
    if (running >= size) await new Promise<void>((resolve) => waiting.push(resolve))
    running++
    try {
      return await work()
    } finally {
      running--
      waiting.shift()?.()
    }
  }
}

export function claudeCliProvider(settings: ClaudeCliSettings = {}): ClaudeCliProvider {
  const command = settings.command?.trim() || 'claude'
  const spawn = settings.spawn ?? (nodeSpawn as SpawnFn)
  const models = resolveModels(settings.models)
  const platform = settings.platform ?? process.platform
  const env = settings.env ?? process.env
  const queue = limiter(Math.max(1, settings.concurrency ?? 2))
  const resolved = () => resolveCommand(command, platform, env)

  async function version(): Promise<string> {
    const ran = await runChild(spawn, resolved(), ['--version'], { env: childEnv(env), timeoutMs: 20_000 })
    if (ran.code !== 0) throw failure(ran.stderr || ran.stdout || `exit code ${ran.code}`)
    return ran.stdout.trim().split(/\r?\n/)[0] ?? ''
  }

  async function once<T extends Task>(task: T, input: TaskInput[T], options: SessionRunOptions): Promise<Record<string, unknown>> {
    const call = buildCall(task, input, { ...settings, env }, options)
    const target = resolved()
    if (platform === 'win32' && commandLineLength(target.file, [...target.prefix, ...call.args]) > 32_000) {
      // The schema is the part that can go; the prompt cannot.
      const at = call.args.indexOf('--json-schema')
      if (at >= 0) call.args.splice(at, 2)
      if (commandLineLength(target.file, [...target.prefix, ...call.args]) > 32_000) {
        throw new AiError('bad-request', `The ${task} prompt is too long to pass to Claude Code on Windows.`)
      }
    }
    // With no archive to read, run in an empty folder the game owns.
    const scratch = call.cwd ? undefined : mkdtempSync(join(tmpdir(), 'diplomat-ai-'))
    try {
      const timeoutMs = settings.timeouts?.[TASK_TIERS[task]] ?? TIMEOUTS[TASK_TIERS[task]]
      const ran = await runChild(spawn, target, call.args, {
        cwd: call.cwd ?? scratch,
        env: call.env,
        stdin: call.stdin,
        timeoutMs,
        ...(options.signal ? { signal: options.signal } : {}),
      })
      if (!ran.stdout.trim()) throw failure(ran.stderr || `Claude Code exited with code ${ran.code} and printed nothing.`)
      return parseEnvelope(ran.stdout)
    } finally {
      if (scratch) rmSync(scratch, { recursive: true, force: true })
    }
  }

  return {
    async status(): Promise<ProviderStatus> {
      try {
        const v = await version()
        return { backend: 'claude-cli', ok: true, detail: `Claude Code ${v.replace(/\s*\(Claude Code\)\s*$/, '')}`, models }
      } catch (error) {
        return { backend: 'claude-cli', ok: false, detail: (error as Error).message, models }
      }
    },

    // Which credential the child would use, from `claude auth status`, run in the same
    // stripped environment. Only the method and the plan are read; nothing is kept.
    async selfTest(): Promise<ProviderStatus> {
      const base = { backend: 'claude-cli' as const, models }
      let v: string
      try {
        v = (await version()).replace(/\s*\(Claude Code\)\s*$/, '')
      } catch (error) {
        return { ...base, ok: false, detail: (error as Error).message }
      }
      const keyNote = env.ANTHROPIC_API_KEY ? ' ANTHROPIC_API_KEY is set for the game, but it is not passed to Claude Code.' : ''
      let ran: Ran
      try {
        ran = await runChild(spawn, resolved(), ['auth', 'status'], { env: childEnv(env), timeoutMs: 20_000 })
      } catch {
        return { ...base, ok: true, detail: `Claude Code ${v}. It did not say which credential it uses.${keyNote}` }
      }
      let auth: { loggedIn?: boolean; authMethod?: string; subscriptionType?: string } | undefined
      try {
        auth = JSON.parse(ran.stdout)
      } catch {
        auth = undefined
      }
      if (!auth || typeof auth !== 'object') {
        return { ...base, ok: ran.code === 0, detail: `Claude Code ${v}. It did not say which credential it uses.${keyNote}` }
      }
      const plan = typeof auth.subscriptionType === 'string' && /^[a-z0-9 _-]{1,20}$/i.test(auth.subscriptionType)
        ? ` (${auth.subscriptionType})`
        : ''
      switch (auth.loggedIn === false ? 'none' : auth.authMethod) {
        case 'claude.ai':
          return { ...base, ok: true, detail: `Claude Code ${v}, signed in with a Claude subscription${plan}.${keyNote}` }
        case 'oauth_token':
          return { ...base, ok: true, detail: `Claude Code ${v}, using a long-lived subscription token${plan}.${keyNote}` }
        case 'api_key':
        case 'api_key_helper':
          return { ...base, ok: true, detail: `Claude Code ${v}, using an API key of its own, not a subscription.${keyNote}` }
        case 'third_party':
          return { ...base, ok: true, detail: `Claude Code ${v}, using a third-party provider's credentials.${keyNote}` }
        case 'none':
          return { ...base, ok: false, detail: `Claude Code ${v} is not signed in. Run \`claude\` in a terminal and sign in with /login.` }
        default:
          return { ...base, ok: ran.code === 0, detail: `Claude Code ${v}. It did not say which credential it uses.${keyNote}` }
      }
    },

    run<T extends Task>(task: T, input: TaskInput[T], options: SessionRunOptions = {}) {
      return queue(() => once(task, input, options))
    },

    // One call in a branch's own conversation. A session Claude Code cannot resume is
    // replaced once by a fresh one with a new id; an id it already holds is resumed instead.
    runWithSession<T extends Task>(task: T, input: TaskInput[T], options: SessionRunOptions = {}): Promise<SessionResult> {
      return queue(async () => {
        if (!archivePathOf(input, options)) {
          // Claude Code files a conversation under its working directory. Without the archive
          // each call runs in a new scratch folder, and nothing could ever be resumed.
          throw new AiError('bad-request', "A branch session needs the nation's archive folder as its working directory.")
        }
        let session: BranchSession =
          options.session && UUID.test(options.session.id) ? options.session : { id: randomUUID(), resume: false }
        for (let attempt = 0; ; attempt++) {
          try {
            const output = await once(task, input, { ...options, session })
            return { output, sessionId: session.id }
          } catch (error) {
            if (attempt > 0 || !(error instanceof AiError)) throw error
            if (error.code === 'session-missing' && session.resume) session = { id: randomUUID(), resume: false }
            else if (error.code === 'session-taken' && !session.resume) session = { id: session.id, resume: true }
            else throw error
          }
        }
      })
    },
  }
}
