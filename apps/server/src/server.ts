// The server as a whole: the pack, the data folder, the AI, the routes. main.ts starts it
// from the command line; the tests start it on an ephemeral port.

import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join, resolve } from 'node:path'
import { checkPack } from '@diplomat/content'
import type { Content } from '@diplomat/engine'
import type { Series } from '@diplomat/government'
import { SERIES } from '@diplomat/government'
import { Ai } from './ai.ts'
import { Dockets } from './dockets.ts'
import { Game } from './game.ts'
import { handler, HttpError, Router, type Request } from './http.ts'
import { SettingsStore } from './settings.ts'
import { Store } from './store.ts'

export const ROOT = resolve(import.meta.dirname, '../../..')
export const VERSION: string = (JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as { version: string }).version

export interface Options {
  port?: number
  data?: string
  // The built web app. Defaults to apps/web/dist; null serves none.
  web?: string | null
  pack?: string
  devOrigins?: string[]
  log?: (line: string) => void
  // Resume dockets left sitting. On by default.
  resume?: boolean
}

export interface Running {
  server: Server
  url: string
  port: number
  game: Game
  ai: Ai
  close(): Promise<void>
}

let packCache: { dir: string; content: Content } | null = null

export function loadContent(dir = join(ROOT, 'packs/core')): Content {
  if (packCache?.dir === dir) return packCache.content
  const { content, problems } = checkPack(dir)
  if (problems.length) throw new Error(`The pack at ${dir} has ${problems.length} problem(s): ${problems.slice(0, 3).map((p) => `${p.where}: ${p.message}`).join('; ')}`)
  packCache = { dir, content }
  return content
}

const int = (v: string | null, what: string): number | undefined => {
  if (v === null || v === '') return undefined
  const n = Number(v)
  if (!Number.isSafeInteger(n) || n < 0) throw new HttpError(400, `${what} must be a whole number.`)
  return n
}

export function routes(game: Game, ai: Ai, settings: SettingsStore, content: Content): Router {
  const r = new Router()
  const id = (req: Request) => req.params['id']!

  r.on('GET', '/api/status', async () => ({ json: { version: VERSION, pack: { id: content.pack.id, name: content.pack.name, version: content.pack.version }, ai: await ai.status() } }))
  r.on('GET', '/api/settings', () => ({ json: settings.public() }))
  r.on('PUT', '/api/settings', async (req) => ({ json: await settings.update(req.body) }))
  r.on('POST', '/api/settings/test', async () => ({ json: await ai.test() }))

  r.on('GET', '/api/nations', () => ({ json: { nations: game.store.list() } }))
  r.on('POST', '/api/nations', async (req) => ({ status: 201, json: await game.found(req.body) }))
  r.on('POST', '/api/nations/import', async (req) => ({ status: 201, json: await game.importText(req.body) }), { maxBody: 200 * 1024 * 1024 })
  r.on('GET', '/api/nations/:id', (req) => ({ json: game.view(id(req)) }))
  r.on('DELETE', '/api/nations/:id', async (req) => ({ json: await game.remove(id(req)) }))
  r.on('GET', '/api/nations/:id/export', (req) => {
    const { text, filename } = game.exportText(id(req))
    return { text, type: 'application/json; charset=utf-8', headers: { 'Content-Disposition': `attachment; filename="${filename}"` } }
  })

  r.on('POST', '/api/nations/:id/decide', async (req) => ({ json: await game.decide(id(req), req.body) }))
  r.on('POST', '/api/nations/:id/situation', async (req) => ({ json: await game.situation(id(req), req.body) }))
  r.on('POST', '/api/nations/:id/end-day', async (req) => ({ json: await game.endDay(id(req)) }))
  r.on('POST', '/api/nations/:id/run', async (req) => ({ json: await game.run(id(req), req.body) }))
  r.on('GET', '/api/nations/:id/dockets', (req) => ({ json: game.dockets_(id(req)) }))
  r.on('POST', '/api/nations/:id/dockets/:dilemmaId/convene', async (req) => ({ json: await game.convene(id(req), req.params['dilemmaId']!) }))
  r.on('POST', '/api/nations/:id/sandbox', async (req) => ({ json: await game.sandbox(id(req), req.body) }))
  r.on('PUT', '/api/nations/:id/identity', async (req) => ({ json: await game.identity(id(req), req.body) }))
  r.on('PUT', '/api/nations/:id/mode', async (req) => ({ json: await game.mode(id(req), req.body) }))

  r.on('POST', '/api/nations/:id/words', async (req) => ({ json: await game.words(id(req), req.body) }))
  r.on('POST', '/api/nations/:id/questions/:qid', async (req) => ({ json: await game.question(id(req), req.params['qid']!, req.body) }))
  r.on('POST', '/api/nations/:id/letters/:lid', async (req) => ({ json: await game.letter(id(req), req.params['lid']!, req.body) }))
  r.on('POST', '/api/nations/:id/bills', async (req) => ({ json: await game.bill(id(req), req.body) }))

  r.on('GET', '/api/nations/:id/archive', (req) => {
    const q = req.query
    const series = q.get('series') || undefined
    if (series && !SERIES.includes(series as Series)) throw new HttpError(400, `There is no series “${series}”. The series are ${SERIES.join(', ')}.`)
    const n = game.store.open(id(req))
    const from = int(q.get('from'), 'from')
    const to = int(q.get('to'), 'to')
    const limit = int(q.get('limit'), 'limit')
    const offset = int(q.get('offset'), 'offset')
    return {
      json: n.archive.search({
        ...(series ? { series } : {}),
        ...(q.get('q') ? { q: q.get('q')! } : {}),
        ...(q.get('issuer') ? { issuer: q.get('issuer')! } : {}),
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to }),
        ...(limit === undefined ? {} : { limit }),
        ...(offset === undefined ? {} : { offset }),
      }),
    }
  })
  r.on('GET', '/api/nations/:id/archive/:docId', (req) => {
    const n = game.store.open(id(req))
    const document = n.archive.get(req.params['docId']!)
    if (!document) throw new HttpError(404, `There is no document ${req.params['docId']} in the Archive.`)
    return { json: { document, citedBy: n.archive.citedBy(document.id) } }
  })

  r.on('POST', '/api/nations/:id/factbooks/draft', async (req) => ({ json: await game.draftFactbook(id(req), req.body) }))
  r.on('POST', '/api/nations/:id/factbooks', async (req) => ({ json: await game.writeFactbook(id(req), req.body) }))
  r.on('PUT', '/api/nations/:id/factbooks/:fid', async (req) => ({ json: await game.editFactbook(id(req), req.params['fid']!, req.body) }))
  return r
}

export async function start(opts: Options = {}): Promise<Running> {
  const data = resolve(opts.data ?? join(ROOT, 'data'))
  const content = loadContent(opts.pack)
  const settings = new SettingsStore(join(data, 'settings.json'))
  const ai = new Ai(settings)
  const store = new Store(data, content)
  const dockets = new Dockets(store, ai, content, settings)
  const game = new Game(store, ai, dockets, content)
  const log = opts.log ?? (() => {})
  dockets.log = log
  dockets.onReady = (nation, dilemma) => game.autoDecide(nation, dilemma)
  let port = opts.port ?? 8150
  const web = opts.web === undefined ? join(ROOT, 'apps/web/dist') : opts.web
  const server = createServer(handler({ port: () => port, router: routes(game, ai, settings, content), web, devOrigins: opts.devOrigins ?? [], log }))
  server.keepAliveTimeout = 5_000
  await new Promise<void>((ok, fail) => {
    server.once('error', fail)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', fail)
      ok()
    })
  })
  const address = server.address()
  if (address && typeof address === 'object') port = address.port
  if (opts.resume !== false) dockets.resumeAll()
  return {
    server,
    url: `http://127.0.0.1:${port}`,
    port,
    game,
    ai,
    close: async () => {
      for (const nid of store.ids()) dockets.cancel(nid)
      server.closeAllConnections()
      await new Promise<void>((ok) => server.close(() => ok()))
      for (const nid of store.ids()) await dockets.idle(nid).catch(() => {})
    },
  }
}
