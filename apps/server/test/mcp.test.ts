import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { TOOLS } from '../src/director-tools.ts'
import { callTool, handle, TOOL_DEFS } from '../src/mcp.ts'
import { harness, IDENTITY, type Harness } from './helpers.ts'

const MCP = resolve(import.meta.dirname, '../src/mcp.ts')
let h: Harness
let id: string

before(async () => {
  h = await harness()
  id = (await h.post('/api/nations', { identity: IDENTITY, answers: {}, form: 'junta', mode: 'govern', founder: { name: 'Aegis', title: 'Founder' } })).json.id
})
after(async () => {
  await h.close()
})

test('the MCP server offers exactly the Director’s tools, each with a schema', () => {
  assert.deepEqual(TOOL_DEFS.map((t) => t.name).sort(), [...TOOLS].sort())
  for (const t of TOOL_DEFS) {
    assert.equal(t.inputSchema['type'], 'object')
    if (t.name.startsWith('cheat_')) assert.ok((t.inputSchema['required'] as string[]).includes('request'), `${t.name} requires request`)
  }
})

test('the MCP server speaks JSON-RPC over stdio and calls the game server', async () => {
  const child = spawn(process.execPath, [MCP, '--port', String(h.running.port), '--data', h.data], { stdio: ['pipe', 'pipe', 'pipe'] })
  const replies = new Map<number, any>()
  let buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk
    let at: number
    while ((at = buffer.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buffer.slice(0, at))
      buffer = buffer.slice(at + 1)
      replies.set(msg.id, msg)
    }
  })
  const send = (msg: object) => child.stdin.write(`${JSON.stringify(msg)}\n`)
  const wait = async (n: number) => {
    for (let i = 0; i < 400 && !replies.has(n); i++) await new Promise((ok) => setTimeout(ok, 10))
    return replies.get(n)
  }
  try {
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } })
    const init = await wait(1)
    assert.equal(init.result.protocolVersion, '2025-06-18')
    assert.equal(init.result.serverInfo.name, 'diplomat')
    assert.ok(init.result.capabilities.tools)
    send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const list = await wait(2)
    assert.equal(list.result.tools.length, TOOLS.length)
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nation_overview', arguments: { nation: id } } })
    const call = await wait(3)
    assert.equal(call.result.isError, false, call.result.content[0].text)
    assert.equal(JSON.parse(call.result.content[0].text).id, id)
    send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'cheat_skip_days', arguments: { nation: id, days: 1 } } })
    const refused = await wait(4)
    assert.equal(refused.result.isError, true)
    assert.match(refused.result.content[0].text, /request/)
    send({ jsonrpc: '2.0', id: 5, method: 'ping' })
    assert.deepEqual((await wait(5)).result, {})
    send({ jsonrpc: '2.0', id: 6, method: 'no/such' })
    assert.equal((await wait(6)).error.code, -32601)
    child.stdin.write('not json\n')
    for (let i = 0; i < 100 && !replies.has(null as never); i++) await new Promise((ok) => setTimeout(ok, 10))
    assert.equal(replies.get(null as never)?.error.code, -32700)
    assert.equal(replies.size, 6 + 1, 'no reply to a notification')
  } finally {
    child.kill()
  }
})

test('the MCP server says plainly when the game server is not running, or has no token', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'diplomat-mcp-'))
  try {
    const noToken = await callTool({ host: '127.0.0.1', port: 9, data: empty }, 'list_nations', {})
    assert.equal(noToken.isError, true)
    assert.match(noToken.text, /token/)
    const down = await callTool({ host: '127.0.0.1', port: 9, data: h.data }, 'list_nations', {})
    assert.equal(down.isError, true)
    assert.match(down.text, /not running/)
    const init = (await handle({ host: '127.0.0.1', port: 9, data: h.data }, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } })) as any
    assert.equal(init.result.protocolVersion, '2025-06-18', 'an unknown version gets the newest')
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})
