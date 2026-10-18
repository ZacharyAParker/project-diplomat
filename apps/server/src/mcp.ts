// The Director's tools as an MCP server, over stdio: JSON-RPC 2.0, one message per line, no
// dependencies. Each tool is a call to the running game server's Director endpoint,
// POST /api/director/<nation>/<tool>, with the token from <data>/director-token.
//
//   node apps/server/src/mcp.ts [--data <repo>/data] [--port 8150]      (or DIPLOMAT_URL)
//
// Registered for Claude Code in the repo's .mcp.json as the server "diplomat".

import { readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../../..')
const VERSION = '0.8.0'
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']
const CALL_TIMEOUT = 45 * 60_000

type Schema = Record<string, unknown>

const nation = { type: 'string', description: 'The nation’s id, as list_nations gives it.' }
const request = { type: 'string', description: 'Required. The Founder’s own words asking for this cheat, quoted exactly from the conversation. Never write one yourself.' }
const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: 'object', properties, required, additionalProperties: false })
const numbers = (what: string): Schema => ({ type: 'object', description: what, additionalProperties: { type: 'number' } })

export const TOOL_DEFS: { name: string; description: string; inputSchema: Schema }[] = [
  { name: 'list_nations', description: 'The nations on this machine: id, name, day, form, mode.', inputSchema: obj({}) },
  { name: 'nation_overview', description: 'The nation at a glance, out of character: day, figures, support, factions, neighbours, census, the form of government, the agenda and open petitions with their standing, the sandbox badge.', inputSchema: obj({ nation }, ['nation']) },
  { name: 'world_overview', description: 'The world beyond the borders, out of character: every nation with its relations, strength, temperament and status, which are important (on their own sessions), the wars and fronts, pacts, claims, the Assembly of Nations, and the foreign matters waiting with the Foreign Ministry’s advice.', inputSchema: obj({ nation }, ['nation']) },
  { name: 'read_dockets', description: 'Every open petition: progress, advice, sittings, rulings, exchanges, the rules’ standing (what the executive may do and why), and each option’s forecast.', inputSchema: obj({ nation }, ['nation']) },
  {
    name: 'search_archive',
    description: 'Search the in-world record, newest first. Returns document heads.',
    inputSchema: obj({ nation, q: { type: 'string' }, series: { type: 'string', description: 'petition, hansard, court, advice, papers, words, almanac, bills, letters, questions, factbook, law, lore, hearing, world or other' }, issuer: { type: 'string' }, from: { type: 'integer' }, to: { type: 'integer' }, limit: { type: 'integer' }, offset: { type: 'integer' } }, ['nation']),
  },
  { name: 'read_document', description: 'One document of the record in full, with what cites it.', inputSchema: obj({ nation, id: { type: 'string', description: 'A document id such as hansard-00012.' } }, ['nation', 'id']) },
  { name: 'read_ooc_log', description: 'The cheats done so far, newest first, with the figures before and after. Out of character: never pass it to a branch.', inputSchema: obj({ nation }, ['nation']) },
  { name: 'list_dilemmas', description: 'The issues the pack holds, to call up or forecast.', inputSchema: obj({ nation, q: { type: 'string', description: 'Words to look for in the id, title or tags.' } }, ['nation']) },
  { name: 'list_situations', description: 'The crises that could be started, and the one running.', inputSchema: obj({ nation }, ['nation']) },
  { name: 'forecast', description: 'What each option of a dilemma would do to the numbers, by the engine’s own dry run.', inputSchema: obj({ nation, dilemma: { type: 'string' } }, ['nation', 'dilemma']) },
  { name: 'convene', description: 'Send a petition through the bodies as the constitution says (advice, sittings, rulings, exchanges), or restart one. Waits for them unless wait is false.', inputSchema: obj({ nation, dilemma: { type: 'string' }, wait: { type: 'boolean' } }, ['nation', 'dilemma']) },
  { name: 'end_day', description: 'The evening (the world’s day, bills, letters), then the night. Undecided petitions lapse.', inputSchema: obj({ nation }, ['nation']) },
  { name: 'run_nation', description: 'Decide every petition by the executive and end each day, for 1 to 7 days.', inputSchema: obj({ nation, days: { type: 'integer', minimum: 1, maximum: 7 } }, ['nation']) },
  {
    name: 'give_word',
    description: 'Enter a Founder’s Word: the Founder’s own words, verbatim, only when the Founder asks. Review it first.',
    inputSchema: obj({ nation, text: { type: 'string', description: 'The Founder’s words, exactly as given.' }, overrules: { type: 'string', description: 'A petition’s dilemma id or a document id it overrules.' }, silence: { type: 'boolean' }, confirm: { type: 'boolean' } }, ['nation', 'text']),
  },
  { name: 'undo_cheat', description: 'Put back the figures from OOC log entry n, as they were before that cheat. Logged too.', inputSchema: obj({ nation, n: { type: 'integer' }, request: { type: 'string', description: 'The Founder’s words asking for the undo.' } }, ['nation', 'n']) },
  {
    name: 'cheat_set_figures',
    description: 'Cheat: set indicators (0-100), faction approvals (0-100), neighbours’ standing (-100 to 100), policies, or the census base. Quiet: OOC log only.',
    inputSchema: obj(
      {
        nation,
        request,
        indicators: numbers('Indicator id to value.'),
        factions: numbers('Faction id to approval.'),
        neighbours: numbers('Neighbour id to standing.'),
        policies: { type: 'object', additionalProperties: { type: ['boolean', 'number'] } },
        census: numbers('population, gdpPerHead, taxRate, crimePerHour, growth.'),
      },
      ['nation', 'request'],
    ),
  },
  { name: 'cheat_call_up', description: 'Cheat: put any issue on today’s desk.', inputSchema: obj({ nation, request, dilemma: { type: 'string' } }, ['nation', 'request', 'dilemma']) },
  { name: 'cheat_start_crisis', description: 'Cheat: start any crisis now.', inputSchema: obj({ nation, request, situation: { type: 'string' } }, ['nation', 'request', 'situation']) },
  { name: 'cheat_skip_days', description: 'Cheat: move the calendar on without running the days (1 to 60).', inputSchema: obj({ nation, request, days: { type: 'integer', minimum: 1, maximum: 60 } }, ['nation', 'request', 'days']) },
  {
    name: 'cheat_force_outcome',
    description: 'Cheat: set a petition’s sitting result or its rulings, as if the bodies had decided so. The rules then read the new votes.',
    inputSchema: obj(
      {
        nation,
        request,
        dilemma: { type: 'string' },
        sitting: { type: 'object', properties: { firstPreference: { type: 'string' }, ladder: { type: 'array', items: { type: 'string' } }, aye: { type: 'integer' }, no: { type: 'integer' }, abstain: { type: 'integer' } }, required: ['aye', 'no'] },
        rulings: { type: 'object', description: 'Course to "permitted" or "barred".', additionalProperties: { type: 'string', enum: ['permitted', 'barred'] } },
      },
      ['nation', 'request', 'dilemma'],
    ),
  },
  { name: 'cheat_decide', description: 'Cheat: decide a petition outright, whatever the rules say (a barred course too).', inputSchema: obj({ nation, request, dilemma: { type: 'string' }, course: { type: 'string', description: 'An option id or "dismiss".' }, text: { type: 'string', description: 'A name, for a course that asks for one.' } }, ['nation', 'request', 'dilemma', 'course']) },
  {
    name: 'cheat_world_event',
    description: 'Cheat: make something happen in the world with these effects, unbounded. Quiet: no timeline entry.',
    inputSchema: obj(
      {
        nation,
        request,
        headline: { type: 'string' },
        text: { type: 'string' },
        effects: {
          type: 'array',
          items: { type: 'object', description: '{indicator|faction|minister, by, why?} or {policy, to} or {flag, to?}', properties: { indicator: { type: 'string' }, faction: { type: 'string' }, minister: { type: 'string' }, policy: { type: 'string' }, flag: { type: 'string' }, by: { type: 'number' }, to: { type: ['number', 'boolean'] }, why: { type: 'string' } } },
        },
      },
      ['nation', 'request', 'headline', 'effects'],
    ),
  },
  {
    name: 'cheat_amend',
    description: 'Cheat: change the constitution or the form of government directly.',
    inputSchema: obj(
      {
        nation,
        request,
        form: { type: 'string', enum: ['commonwealth', 'presidential', 'parliamentary-monarchy', 'direct-democracy', 'one-party', 'absolute-monarchy', 'theocracy', 'junta', 'custom'] },
        rules: { type: 'object', description: 'Rules to change: vetoWithReasons, reconciliation, exchanges, dismissOnlyAtStandstill, minorsThroughBodies, steps, executive.' },
        articles: { type: 'array', items: { type: 'object', properties: { number: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' } }, required: ['number', 'title', 'text'] } },
        rights: { type: 'object', properties: { add: { type: 'array', items: { type: 'object' } }, remove: { type: 'array', items: { type: 'string' } } } },
      },
      ['nation', 'request'],
    ),
  },
  {
    name: 'cheat_world',
    description: 'Cheat: change the world beyond the borders. Exactly one of: war {attacker, defender} (start a war; "home" is the player\'s nation), peace {war, outcome: attackers|defenders|ceasefire, total?} (end one), relation {a, b, to} (set relations between two nations, -100 to 100), annex {target, ruler} (never the player\'s nation), free (restore an annexed nation), pact {a, b} or unpact {a, b}. A war started this way is fought, reported and joined by allies like any other.',
    inputSchema: obj(
      {
        nation,
        request,
        war: { type: 'object', properties: { attacker: { type: 'string' }, defender: { type: 'string' } } },
        peace: { type: 'object', properties: { war: { type: 'string' }, outcome: { type: 'string', enum: ['attackers', 'defenders', 'ceasefire'] }, total: { type: 'boolean' } } },
        relation: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' }, to: { type: 'number' } } },
        annex: { type: 'object', properties: { target: { type: 'string' }, ruler: { type: 'string' } } },
        free: { type: 'string' },
        pact: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } },
        unpact: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } },
      },
      ['nation', 'request'],
    ),
  },
  {
    name: 'cheat_identity',
    description: 'Cheat: change the nation’s name, capital, currency, demonym, leader’s title, animal, motto, faith or flag.',
    inputSchema: obj(
      {
        nation,
        request,
        name: { type: 'string' },
        capital: { type: 'string' },
        currency: { type: 'string' },
        demonym: { type: 'string' },
        leaderTitle: { type: 'string' },
        animal: { type: 'string' },
        motto: { type: 'string' },
        faith: { type: 'string' },
        flag: { type: 'object', properties: { layout: { type: 'string' }, colours: { type: 'array', items: { type: 'string' } } } },
      },
      ['nation', 'request'],
    ),
  },
]

// ---------------------------------------------------------------------------------------

interface Config {
  host: string
  port: number
  data: string
}

export function configFrom(argv: string[], env: NodeJS.ProcessEnv): Config {
  const value = (flag: string) => {
    const at = argv.indexOf(flag)
    return at >= 0 ? argv[at + 1] : undefined
  }
  const data = resolve(value('--data') ?? env['DIPLOMAT_DATA'] ?? join(ROOT, 'data'))
  let host = '127.0.0.1'
  let port = Number(value('--port') ?? 8150)
  if (!value('--port') && env['DIPLOMAT_URL']) {
    const url = new URL(env['DIPLOMAT_URL'])
    host = url.hostname
    port = Number(url.port || 80)
  }
  return { host, port, data }
}

function post(config: Config, path: string, body: unknown, token: string): Promise<{ status: number; json: any; text: string }> {
  return new Promise((ok, fail) => {
    const text = JSON.stringify(body ?? {})
    const req = httpRequest(
      {
        host: config.host,
        port: config.port,
        method: 'POST',
        path,
        headers: { Host: `${config.host}:${config.port}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), 'X-Diplomat': '1', 'X-Director-Token': token },
        timeout: CALL_TIMEOUT,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const out = Buffer.concat(chunks).toString('utf8')
          let json: unknown = null
          try {
            json = JSON.parse(out)
          } catch {
            json = null
          }
          ok({ status: res.statusCode ?? 0, json, text: out })
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error('the game server took too long to answer')))
    req.on('error', fail)
    req.end(text)
  })
}

export async function callTool(config: Config, name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  if (!TOOL_DEFS.some((t) => t.name === name)) return { text: `There is no tool “${name}”.`, isError: true }
  let token: string
  try {
    token = readFileSync(join(config.data, 'director-token'), 'utf8').trim()
  } catch {
    return { text: `There is no Director token in ${config.data}. Start the game server once (pnpm start) with this data folder, so it makes one.`, isError: true }
  }
  const { nation: n, ...rest } = args
  if (name !== 'list_nations' && (typeof n !== 'string' || !n)) return { text: 'Name the nation: every tool but list_nations takes `nation`. Use list_nations to find it.', isError: true }
  const path = name === 'list_nations' ? `/api/director/${name}` : `/api/director/${encodeURIComponent(n as string)}/${name}`
  try {
    const res = await post(config, path, rest, token)
    if (res.status >= 400) return { text: res.json?.error ?? `The game server refused that (${res.status}).`, isError: true }
    return { text: JSON.stringify(res.json, null, 1), isError: false }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
      return { text: `The game server is not running at http://${config.host}:${config.port}/. Ask the Founder to start it with pnpm start, then try again.`, isError: true }
    }
    return { text: `The game server could not be reached: ${(error as Error).message}`, isError: true }
  }
}

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any }

export async function handle(config: Config, msg: Message): Promise<object | null> {
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id ?? null, result })
  const error = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } })
  const isNotification = msg.id === undefined
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion
      return reply({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'diplomat', version: VERSION },
        instructions: 'The Director’s tools for Project Diplomat. They call the running game server; every tool but list_nations takes the nation’s id as `nation`. Cheat tools need `request`, the Founder’s own words.',
      })
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: TOOL_DEFS })
    case 'tools/call': {
      const name = msg.params?.name
      const args = msg.params?.arguments ?? {}
      if (typeof name !== 'string') return error(-32602, 'tools/call needs a tool name.')
      if (typeof args !== 'object' || Array.isArray(args)) return error(-32602, 'arguments must be an object.')
      const out = await callTool(config, name, args)
      return reply({ content: [{ type: 'text', text: out.text }], isError: out.isError })
    }
    default:
      if (isNotification) return null
      return error(-32601, `Method not found: ${String(msg.method)}`)
  }
}

export function serve(config: Config, input: NodeJS.ReadableStream, output: NodeJS.WritableStream) {
  let buffer = ''
  const write = (obj: object) => output.write(`${JSON.stringify(obj)}\n`)
  input.setEncoding?.('utf8')
  input.on('data', (chunk: string) => {
    buffer += chunk
    let at: number
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at).trim()
      buffer = buffer.slice(at + 1)
      if (!line) continue
      let msg: Message
      try {
        msg = JSON.parse(line) as Message
      } catch {
        write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
        continue
      }
      void handle(config, msg).then(
        (out) => out && write(out),
        (e: unknown) => write({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: (e as Error).message } }),
      )
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  serve(configFrom(process.argv.slice(2), process.env), process.stdin, process.stdout)
}
