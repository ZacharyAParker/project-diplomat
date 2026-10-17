// A small router over node:http, the checks every request passes before it is routed, and
// the static web app. See docs/design/government.md, "Server API".
//
// Every request must carry a Host of 127.0.0.1:<port> or localhost:<port> (this stops DNS
// rebinding). Every request that changes anything must also carry X-Diplomat: 1, which a
// page on another site cannot add without a preflight this server never grants, and, if it
// has an Origin, this server's own. Together they stop another web page from driving the
// game through the browser.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface Request {
  method: string
  path: string
  params: Record<string, string>
  query: URLSearchParams
  body: unknown
  headers: IncomingMessage['headers']
}

export type Reply =
  | { status?: number; json: unknown; headers?: Record<string, string> }
  | { status?: number; text: string; type: string; headers?: Record<string, string> }

export type Handler = (req: Request) => Promise<Reply> | Reply

interface Route {
  method: string
  parts: string[]
  handler: Handler
  maxBody: number
}

export const MAX_BODY = 10 * 1024 * 1024

const BASE_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}

export class Router {
  private routes: Route[] = []

  on(method: string, pattern: string, handler: Handler, opts: { maxBody?: number } = {}) {
    this.routes.push({ method, parts: pattern.split('/').filter(Boolean), handler, maxBody: opts.maxBody ?? MAX_BODY })
  }

  match(method: string, path: string): { route: Route; params: Record<string, string> } | { allowed: string[] } | null {
    const parts = path.split('/').filter(Boolean)
    const allowed: string[] = []
    for (const route of this.routes) {
      if (route.parts.length !== parts.length) continue
      const params: Record<string, string> = {}
      let ok = true
      for (let i = 0; i < parts.length; i++) {
        const want = route.parts[i]!
        let got: string
        try {
          got = decodeURIComponent(parts[i]!)
        } catch {
          ok = false
          break
        }
        if (want.startsWith(':')) params[want.slice(1)] = got
        else if (want !== got) {
          ok = false
          break
        }
      }
      if (!ok) continue
      if (route.method === method || (method === 'HEAD' && route.method === 'GET')) return { route, params }
      allowed.push(route.method)
    }
    return allowed.length ? { allowed } : null
  }
}

export interface ServeOptions {
  port: () => number
  router: Router
  // The built web app, or null to serve none.
  web: string | null
  // Further origins allowed to change things: the development server, when it proxies.
  devOrigins: readonly string[]
  log?: (line: string) => void
}

function send(res: ServerResponse, status: number, headers: Record<string, string>, body: string | Buffer, head = false) {
  const buf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  res.writeHead(status, { ...BASE_HEADERS, 'Content-Length': String(buf.length), ...headers })
  res.end(head ? undefined : buf)
}

function sendJson(res: ServerResponse, status: number, value: unknown, head = false, extra: Record<string, string> = {}) {
  send(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': API_CSP, ...extra }, JSON.stringify(value), head)
}

const fail = (res: ServerResponse, status: number, error: string) => sendJson(res, status, { error })

function readBody(req: IncomingMessage, max: number): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const declared = Number(req.headers['content-length'] ?? 0)
    if (declared > max) {
      reject(new HttpError(413, `That is more than the ${Math.round(max / 1024 / 1024)} MB this server takes in one request.`))
      req.resume()
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > max) {
        reject(new HttpError(413, `That is more than the ${Math.round(max / 1024 / 1024)} MB this server takes in one request.`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// The page's own policy: what vite.config.ts writes into the built page, plus framing,
// which only a header can forbid. The inline theme script is allowed by its hash.
const pageCache = new Map<string, { mtime: number; html: string; csp: string }>()
function page(file: string) {
  const mtime = statSync(file).mtimeMs
  const cached = pageCache.get(file)
  if (cached && cached.mtime === mtime) return cached
  const html = readFileSync(file, 'utf8')
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, body]) => `'sha256-${createHash('sha256').update(body ?? '').digest('base64')}'`)
  const csp = [
    "default-src 'self'",
    `script-src 'self'${hashes.length ? ` ${hashes.join(' ')}` : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
  const entry = { mtime, html, csp }
  pageCache.set(file, entry)
  return entry
}

function serveStatic(res: ServerResponse, web: string | null, rawPath: string, head: boolean) {
  if (!web || !existsSync(join(web, 'index.html'))) {
    send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Security-Policy': API_CSP }, 'The web app has not been built. Run pnpm build, then start the server again (or use pnpm serve).\n', head)
    return
  }
  let path: string
  try {
    path = decodeURIComponent(rawPath)
  } catch {
    return send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad path.\n', head)
  }
  const notFound = () => send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Security-Policy': API_CSP }, 'Not found.\n', head)
  if (path.includes('\0')) return notFound()
  const root = resolve(web)
  const target = resolve(root, `.${path.startsWith('/') ? path : `/${path}`}`)
  const rel = relative(root, target)
  if (rel.startsWith('..') || isAbsolute(rel)) return notFound()
  const ext = extname(target).toLowerCase()
  let file: string | null = null
  if (rel !== '' && existsSync(target) && statSync(target).isFile()) file = target
  else if (rel === '' || ext === '' || ext === '.html') file = join(root, 'index.html')
  if (!file) return notFound()
  if (file.endsWith('index.html') && relative(root, file) === 'index.html') {
    const p = page(file)
    return send(res, 200, { 'Content-Type': TYPES['.html']!, 'Cache-Control': 'no-cache', 'Content-Security-Policy': p.csp }, p.html, head)
  }
  const type = TYPES[ext] ?? 'application/octet-stream'
  const immutable = /[\\/]assets[\\/]/.test(file)
  send(res, 200, { 'Content-Type': type, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', 'Content-Security-Policy': API_CSP }, readFileSync(file), head)
}

export function handler(opts: ServeOptions) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const method = (req.method ?? 'GET').toUpperCase()
    const head = method === 'HEAD'
    try {
      const port = opts.port()
      const host = String(req.headers.host ?? '').toLowerCase()
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
        return fail(res, 421, `This server answers only to 127.0.0.1:${port} or localhost:${port}. Open http://127.0.0.1:${port}/ instead.`)
      }
      const url = new URL(req.url ?? '/', `http://${host}`)
      const path = url.pathname
      const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...opts.devOrigins]
      const origin = req.headers.origin
      if (MUTATING.has(method) || method === 'OPTIONS') {
        if (origin !== undefined && !origins.includes(origin)) {
          return fail(res, 403, 'A page from another site may not change this game.')
        }
        if (req.headers['sec-fetch-site'] === 'cross-site') return fail(res, 403, 'A page from another site may not change this game.')
        if (method === 'OPTIONS') return fail(res, 403, 'This server takes no cross-origin requests.')
        if (req.headers['x-diplomat'] !== '1') {
          return fail(res, 403, 'A request that changes anything must carry the header X-Diplomat: 1. The game’s own page adds it.')
        }
      }
      if (!path.startsWith('/api/') && path !== '/api') {
        if (method !== 'GET' && method !== 'HEAD') return fail(res, 405, 'Only GET is served outside /api.')
        return serveStatic(res, opts.web, path, head)
      }
      const found = opts.router.match(method, path)
      if (!found) return fail(res, 404, `There is nothing at ${path}.`)
      if ('allowed' in found) return sendJson(res, 405, { error: `${method} is not allowed here. Use ${found.allowed.join(' or ')}.` }, head, { Allow: found.allowed.join(', ') })
      let body: unknown = undefined
      if (MUTATING.has(method)) {
        const text = await readBody(req, found.route.maxBody)
        if (text.trim() === '') body = {}
        else {
          const type = String(req.headers['content-type'] ?? '')
          if (!/^application\/json\b/i.test(type)) throw new HttpError(415, 'Send the request as JSON, with Content-Type: application/json.')
          try {
            body = JSON.parse(text)
          } catch {
            throw new HttpError(400, 'The request is not valid JSON.')
          }
        }
      }
      const reply = await found.route.handler({ method, path, params: found.params, query: url.searchParams, body, headers: req.headers })
      if ('json' in reply) return sendJson(res, reply.status ?? 200, reply.json, head, reply.headers)
      return send(res, reply.status ?? 200, { 'Content-Type': reply.type, 'Cache-Control': 'no-store', 'Content-Security-Policy': API_CSP, ...reply.headers }, reply.text, head)
    } catch (error) {
      if (res.headersSent) {
        res.destroy()
        return
      }
      if (error instanceof HttpError) return fail(res, error.status, error.message)
      opts.log?.(`error: ${(error as Error).stack ?? String(error)}`)
      return fail(res, 500, `Something went wrong on the server: ${(error as Error).message}`)
    }
  }
}
