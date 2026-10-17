// The Director behind the web panel: one Claude Code session per nation, out of character,
// run by the server with the nation's folder as its working directory and the diplomat MCP
// server (mcp.ts) as its only tools besides Read, Grep and Glob. Each Founder's message is
// one turn of `claude -p --output-format stream-json`; the reply streams into the panel as it
// comes. The session is resumed between turns (ooc/director.json) and the transcript kept
// (ooc/director-transcript.jsonl). See docs/design/government.md, "The Director (0.6.1)".

import { randomUUID } from 'node:crypto'
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { appendFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { childEnv, claudeCliProvider, directorPrompt, resolveCommand, type SpawnFn } from '@diplomat/ai'
import { guard, writeAtomic } from './archive.ts'
import { HttpError } from './http.ts'
import { oocDir } from './ooc.ts'
import type { SettingsStore } from './settings.ts'
import type { Store } from './store.ts'

export interface DirectorMessage {
  id: string
  role: 'founder' | 'director' | 'activity'
  text: string
  at: string
  streaming?: boolean
}

export interface DirectorSession {
  id: string
  startedAt: string
  // True once Claude Code holds the conversation, so the next turn resumes it.
  started: boolean
}

const AVAILABILITY_FOR = 60_000
const TURN_LIMIT = 30 * 60_000
const MAX_MESSAGE = 20_000

export const DIRECTOR_TOOLS_ALLOWED = ['mcp__diplomat', 'Read', 'Grep', 'Glob']
export const DIRECTOR_TOOLS_DENIED = ['Bash', 'PowerShell', 'Write', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch']

interface Turn {
  child: ChildProcess
  messages: DirectorMessage[]
  stopped: boolean
  timer: NodeJS.Timeout
}

export interface DirectorOptions {
  data: string
  port: () => number
  settings: SettingsStore
  store: Store
  log?: (line: string) => void
}

const now = () => new Date().toISOString()
const message = (role: DirectorMessage['role'], text: string, streaming = false): DirectorMessage => ({ id: randomUUID(), role, text, at: now(), ...(streaming ? { streaming: true } : {}) })
const toolName = (name: string) => name.replace(/^mcp__diplomat__/, '')

export class Director {
  private opts: DirectorOptions
  // For the tests: a fake Claude Code.
  spawn: SpawnFn = nodeSpawn as SpawnFn
  readonly mcpScript = resolve(import.meta.dirname, 'mcp.ts')
  private turns = new Map<string, Turn>()
  private transcripts = new Map<string, DirectorMessage[]>()
  private availability: { at: number; version: number; available: boolean; detail: string } | null = null
  private configFile: string | null = null

  constructor(opts: DirectorOptions) {
    this.opts = opts
  }

  private dirOf(id: string) {
    const dir = this.opts.store.dirOf(id)
    if (!this.opts.store.exists(id)) throw new HttpError(404, `There is no nation “${id}”.`)
    return dir
  }

  private command() {
    return this.opts.settings.get().command?.trim() || 'claude'
  }

  // Whether Claude Code is installed and signed in, asked of the CLI itself, now and then.
  async status(): Promise<{ available: boolean; detail: string }> {
    const s = this.opts.settings.get()
    if (!s.director.enabled) return { available: false, detail: 'The Director is turned off in the settings.' }
    const cached = this.availability
    if (cached && cached.version === this.opts.settings.version && Date.now() - cached.at < AVAILABILITY_FOR) return cached
    const tested = await claudeCliProvider({ command: this.command(), spawn: this.spawn }).selfTest()
    const result = {
      at: Date.now(),
      version: this.opts.settings.version,
      available: tested.ok,
      detail: tested.ok ? `${tested.detail} The Director uses ${s.director.model}.` : `${tested.detail} The Director runs on Claude Code: install it, run \`claude\` once in a terminal and sign in, then try again.`,
    }
    this.availability = result
    return result
  }

  private sessionFile(id: string) {
    return join(oocDir(this.dirOf(id)), 'director.json')
  }

  session(id: string): DirectorSession | null {
    const file = this.sessionFile(id)
    if (!existsSync(file)) return null
    try {
      const s = JSON.parse(readFileSync(file, 'utf8')) as DirectorSession
      return typeof s.id === 'string' ? s : null
    } catch {
      return null
    }
  }

  private async saveSession(id: string, s: DirectorSession) {
    await writeAtomic(this.sessionFile(id), `${JSON.stringify(s, null, 2)}\n`)
  }

  private transcriptFile(id: string) {
    return join(oocDir(this.dirOf(id)), 'director-transcript.jsonl')
  }

  private transcript(id: string): DirectorMessage[] {
    let list = this.transcripts.get(id)
    if (list) return list
    list = []
    const file = this.transcriptFile(id)
    if (existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue
        try {
          list.push(JSON.parse(line) as DirectorMessage)
        } catch {
          // a torn line
        }
      }
    }
    this.transcripts.set(id, list)
    return list
  }

  private async keep(id: string, m: DirectorMessage) {
    const { streaming: _s, ...done } = m
    this.transcript(id).push(done)
    const file = this.transcriptFile(id)
    guard(file)
    await mkdir(join(file, '..'), { recursive: true })
    await appendFile(file, `${JSON.stringify(done)}\n`, 'utf8')
  }

  async view(id: string) {
    this.dirOf(id)
    const turn = this.turns.get(id)
    const s = this.session(id)
    const { available, detail } = await this.status()
    return {
      messages: [...this.transcript(id), ...(turn ? turn.messages.map((m) => ({ ...m })) : [])],
      busy: Boolean(turn),
      session: s ? { id: s.id, startedAt: s.startedAt } : {},
      available,
      detail,
    }
  }

  busy(id: string) {
    return this.turns.has(id)
  }

  // The MCP configuration the Director is started with: the diplomat server only, pointed
  // at this game server's data folder and port. Written once, in the temporary folder.
  private mcpConfig(): string {
    if (this.configFile && existsSync(this.configFile)) return this.configFile
    const file = join(tmpdir(), `diplomat-director-mcp-${process.pid}-${randomUUID().slice(0, 8)}.json`)
    const config = { mcpServers: { diplomat: { type: 'stdio', command: process.execPath, args: [this.mcpScript, '--data', resolve(this.opts.data), '--port', String(this.opts.port())] } } }
    writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 })
    this.configFile = file
    return file
  }

  args(session: DirectorSession): string[] {
    const model = this.opts.settings.get().director.model
    return [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--model',
      model,
      '--append-system-prompt',
      directorPrompt(),
      '--mcp-config',
      this.mcpConfig(),
      '--strict-mcp-config',
      '--allowedTools',
      DIRECTOR_TOOLS_ALLOWED.join(','),
      '--disallowedTools',
      DIRECTOR_TOOLS_DENIED.join(','),
      '--permission-mode',
      'dontAsk',
      session.started ? '--resume' : '--session-id',
      session.id,
    ]
  }

  async send(id: string, input: unknown) {
    const dir = this.dirOf(id)
    const v = input as { text?: unknown } | null
    const text = typeof v?.text === 'string' ? v.text.replace(/\r\n/g, '\n').trim() : ''
    if (!text) throw new HttpError(400, 'Send the Founder’s message as { text }.')
    if (text.length > MAX_MESSAGE) throw new HttpError(400, `A message to the Director may be no longer than ${MAX_MESSAGE.toLocaleString('en-GB')} characters.`)
    if (this.turns.has(id)) throw new HttpError(409, 'The Director is still answering. Wait for it, or stop it.')
    const { available, detail } = await this.status()
    if (!available) throw new HttpError(503, detail)
    if (this.turns.has(id)) throw new HttpError(409, 'The Director is still answering. Wait for it, or stop it.')
    let session = this.session(id)
    if (!session) {
      session = { id: randomUUID(), startedAt: now(), started: false }
      await this.saveSession(id, session)
    }
    const founder = message('founder', text)
    await this.keep(id, founder)
    const resolved = resolveCommand(this.command())
    let child: ChildProcess
    try {
      child = this.spawn(resolved.file, [...resolved.prefix, ...this.args(session)], { cwd: dir, env: childEnv(process.env), shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      throw new HttpError(503, `Claude Code could not be started: ${(error as Error).message}`)
    }
    const turn: Turn = { child, messages: [], stopped: false, timer: setTimeout(() => this.stop(id, 'The turn took too long and was stopped.'), TURN_LIMIT) }
    turn.timer.unref?.()
    this.turns.set(id, turn)
    this.follow(id, turn, session)
    child.stdin?.on('error', () => {})
    child.stdin?.end(`Nation: ${id}\n\n${text}\n`)
    return { accepted: true }
  }

  private follow(id: string, turn: Turn, session: DirectorSession) {
    const { child } = turn
    let current: DirectorMessage | null = null
    let deltas = ''
    let spoke = false
    let ended = false
    let stderr = ''
    let buffer = ''
    const pending: Promise<unknown>[] = []
    const track = (p: Promise<unknown>) => void pending.push(p.catch(() => undefined))
    const close = () => {
      if (!current) return
      const done = current
      current = null
      delete done.streaming
      turn.messages = turn.messages.filter((m) => m !== done)
      if (done.text.trim()) track(this.keep(id, done))
    }
    const say = (text: string) => {
      if (!current) {
        current = message('director', '', true)
        turn.messages.push(current)
      }
      current.text += text
      spoke = true
    }
    const activity = (text: string) => {
      close()
      track(this.keep(id, message('activity', text)))
    }
    const handle = (obj: any) => {
      if (!obj || typeof obj !== 'object') return
      if (obj.type === 'stream_event') {
        const ev = obj.event
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') {
          say(ev.delta.text)
          deltas += ev.delta.text
        }
        return
      }
      if (obj.type === 'assistant') {
        for (const block of obj.message?.content ?? []) {
          if (block?.type === 'text' && typeof block.text === 'string') {
            if (!deltas.includes(block.text)) say(block.text)
          } else if (block?.type === 'tool_use' && typeof block.name === 'string' && block.name !== 'ToolSearch') {
            // (ToolSearch only loads the diplomat tools; it is not worth a line in the panel.)
            activity(`Used ${toolName(block.name)}`)
          }
        }
        deltas = ''
        return
      }
      if (obj.type === 'user') {
        for (const block of obj.message?.content ?? []) {
          if (block?.type === 'tool_result' && block.is_error) {
            const said = typeof block.content === 'string' ? block.content : Array.isArray(block.content) ? block.content.map((c: any) => c?.text ?? '').join(' ') : ''
            activity(`A tool failed: ${said.slice(0, 300)}`)
          }
        }
        return
      }
      if (obj.type === 'result') {
        ended = true
        if (obj.is_error === true || (obj.subtype && obj.subtype !== 'success')) {
          activity(`The Director stopped: ${String(obj.result ?? obj.subtype ?? 'an error').slice(0, 500)}`)
        } else if (!spoke && typeof obj.result === 'string' && obj.result.trim()) {
          say(obj.result)
        }
        close()
        session.started = true
        if (typeof obj.session_id === 'string' && obj.session_id) session.id = obj.session_id
        track(this.saveSession(id, session))
      }
    }
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk
      let at: number
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at).trim()
        buffer = buffer.slice(at + 1)
        if (!line) continue
        try {
          handle(JSON.parse(line))
        } catch {
          // not a line of JSON
        }
      }
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      if (stderr.length < 4000) stderr += chunk
    })
    const finish = (code: number | null, error?: Error) => {
      if (this.turns.get(id) !== turn) return
      if (buffer.trim()) {
        try {
          handle(JSON.parse(buffer.trim()))
        } catch {
          // ignore
        }
      }
      clearTimeout(turn.timer)
      close()
      if (/already in use|already exists/i.test(stderr)) {
        session.started = true
        track(this.saveSession(id, session))
      }
      if (!ended && !turn.stopped) {
        const why = error ? error.message : stderr.trim().slice(-400) || `exit code ${code}`
        const login = /not logged in|\/login|authenticat/i.test(why) ? ' Claude Code is not signed in: run `claude` in a terminal and sign in.' : ''
        track(this.keep(id, message('activity', `The Director’s session ended without a reply (${why}).${login}`)))
        this.availability = null
      }
      // The turn is over once what it wrote is on disk.
      void Promise.allSettled(pending).then(() => {
        if (this.turns.get(id) === turn) this.turns.delete(id)
      })
    }
    child.on('error', (error) => finish(null, error))
    child.on('close', (code) => finish(code))
  }

  stop(id: string, why = 'Stopped by the Founder.') {
    this.dirOf(id)
    const turn = this.turns.get(id)
    if (!turn) return { stopped: false }
    turn.stopped = true
    try {
      turn.child.kill()
    } catch {
      // gone already
    }
    clearTimeout(turn.timer)
    for (const m of turn.messages) {
      delete m.streaming
      if (m.text.trim()) this.keep(id, m).catch(() => undefined)
    }
    turn.messages = []
    this.keep(id, message('activity', why)).catch(() => undefined)
    this.turns.delete(id)
    return { stopped: true }
  }

  async reset(id: string) {
    this.dirOf(id)
    if (this.turns.has(id)) throw new HttpError(409, 'The Director is answering. Stop it first.')
    const session: DirectorSession = { id: randomUUID(), startedAt: now(), started: false }
    await this.saveSession(id, session)
    await this.keep(id, message('activity', 'A new session begins. The transcript before it is kept.'))
    return { session: { id: session.id, startedAt: session.startedAt } }
  }

  close() {
    for (const id of [...this.turns.keys()]) this.stop(id, 'The server stopped.')
    if (this.configFile) rmSync(this.configFile, { force: true })
  }
}
