// Shared by the server tests: a server on an ephemeral port with its own data folder and a
// tiny built web app, and a client that can send any header, a bad Host included.

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { start, type Running } from '../src/server.ts'

export interface Reply {
  status: number
  headers: Record<string, string | string[] | undefined>
  text: string
  json: any
}

export interface Harness {
  running: Running
  data: string
  web: string
  call(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Reply>
  get(path: string): Promise<Reply>
  post(path: string, body?: unknown): Promise<Reply>
  put(path: string, body: unknown): Promise<Reply>
  close(): Promise<void>
}

export const IDENTITY = {
  name: 'Vesland',
  capital: 'Ostra',
  currency: 'krona',
  demonym: 'Veslander',
  leaderTitle: 'Chancellor',
  flag: { layout: 'bands', colours: ['#123456', '#c9a227'] },
}

export function raw(port: number, method: string, path: string, opts: { body?: string; headers?: Record<string, string> } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers: { Host: `127.0.0.1:${port}`, ...opts.headers } }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json: unknown = null
        try {
          json = JSON.parse(text)
        } catch {
          json = null
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json })
      })
    })
    req.on('error', reject)
    if (opts.body !== undefined) req.write(opts.body)
    req.end()
  })
}

export async function harness(opts: { data?: string } = {}): Promise<Harness> {
  const root = mkdtempSync(join(tmpdir(), 'diplomat-server-'))
  const data = opts.data ?? join(root, 'data')
  const web = join(root, 'web')
  mkdirSync(join(web, 'assets'), { recursive: true })
  writeFileSync(join(web, 'index.html'), '<!doctype html>\n<html><head><meta charset="utf-8" /><script>document.documentElement.dataset.theme="light"</script></head><body><div id="root"></div><script type="module" src="./assets/app.js"></script></body></html>\n')
  writeFileSync(join(web, 'assets', 'app.js'), 'console.log("app")\n')
  writeFileSync(join(web, 'assets', 'style.css'), 'body{}\n')
  const running = await start({ port: 0, data, web })
  const port = running.port
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    raw(port, method, path, {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { ...(method === 'GET' ? {} : { 'X-Diplomat': '1' }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    })
  return {
    running,
    data,
    web,
    call,
    get: (path) => call('GET', path),
    post: (path, body = {}) => call('POST', path, body),
    put: (path, body) => call('PUT', path, body),
    close: async () => {
      await running.close()
      rmSync(root, { recursive: true, force: true })
    },
  }
}

// A copy of a nation folder in a temporary data folder, so a test never writes to the real one.
export function copyNation(source: string, id: string): string {
  const root = mkdtempSync(join(tmpdir(), 'diplomat-copy-'))
  cpSync(source, join(root, 'nations', id), { recursive: true })
  return root
}

// Polls the dockets until none is sitting.
export async function settle(h: Harness, id: string, tries = 200): Promise<any[]> {
  for (let i = 0; i < tries; i++) {
    const r = await h.get(`/api/nations/${id}/dockets`)
    const dockets = r.json.dockets as any[]
    if (dockets.every((d) => !['waiting', 'sitting', 'reconciling', 'exchanging', 'deciding'].includes(d.status))) return dockets
    await new Promise((ok) => setTimeout(ok, 15))
  }
  throw new Error('the dockets never settled')
}
