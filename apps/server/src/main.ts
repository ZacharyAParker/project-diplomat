// Starts the local server.
//
//   node apps/server/src/main.ts [--port 8150] [--data <repo>/data] [--dev-origin http://localhost:5173]
//
// It listens on 127.0.0.1 only. The data folder can also be given as DIPLOMAT_DATA.

import { join } from 'node:path'
import { ROOT, start } from './server.ts'

const args = process.argv.slice(2)
const value = (flag: string): string | undefined => {
  const at = args.indexOf(flag)
  return at >= 0 ? args[at + 1] : undefined
}

const port = Number(value('--port') ?? process.env['DIPLOMAT_PORT'] ?? 8150)
if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
  console.error('--port must be a port number.')
  process.exit(1)
}
const data = value('--data') ?? process.env['DIPLOMAT_DATA'] ?? join(ROOT, 'data')
const devOrigins = args.flatMap((a, i) => (a === '--dev-origin' && args[i + 1] ? [args[i + 1]!] : []))

try {
  const running = await start({ port, data, devOrigins, log: (line) => console.error(line) })
  console.log(`Project Diplomat is running at ${running.url}/  (data: ${data})`)
  const stop = () => {
    void running.close().then(() => process.exit(0))
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
} catch (error) {
  const e = error as NodeJS.ErrnoException
  if (e.code === 'EADDRINUSE') console.error(`Port ${port} is already in use. Is the server already running? Pass --port to use another.`)
  else console.error(e.message)
  process.exit(1)
}
