import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { harness, raw, type Harness } from './helpers.ts'

let h: Harness
before(async () => {
  h = await harness()
})
after(async () => {
  await h.close()
})

test('a request with another Host is refused, so DNS rebinding gets nothing', async () => {
  const r = await raw(h.running.port, 'GET', '/api/status', { headers: { Host: 'evil.example:80' } })
  assert.equal(r.status, 421)
  assert.match(r.json.error, /127\.0\.0\.1/)
  const ok = await raw(h.running.port, 'GET', '/api/status', { headers: { Host: `localhost:${h.running.port}` } })
  assert.equal(ok.status, 200)
  const wrongPort = await raw(h.running.port, 'GET', '/', { headers: { Host: '127.0.0.1:1' } })
  assert.equal(wrongPort.status, 421)
})

test('a change without X-Diplomat, or from another origin, is refused', async () => {
  const bare = await raw(h.running.port, 'PUT', '/api/settings', { body: '{"backend":"none"}', headers: { 'Content-Type': 'application/json' } })
  assert.equal(bare.status, 403)
  assert.match(bare.json.error, /X-Diplomat/)
  const cross = await h.call('PUT', '/api/settings', { backend: 'none' }, { Origin: 'http://evil.example' })
  assert.equal(cross.status, 403)
  const same = await h.call('PUT', '/api/settings', { backend: 'none' }, { Origin: `http://127.0.0.1:${h.running.port}` })
  assert.equal(same.status, 200)
  const preflight = await raw(h.running.port, 'OPTIONS', '/api/nations', { headers: { Origin: 'http://evil.example' } })
  assert.equal(preflight.status, 403)
  assert.equal(preflight.headers['access-control-allow-origin'], undefined)
  const textPlain = await h.call('POST', '/api/nations', undefined, { 'Content-Type': 'text/plain' })
  assert.notEqual(textPlain.status, 201)
})

test('every reply carries the security headers, and the page its policy', async () => {
  const api = await h.get('/api/status')
  assert.equal(api.status, 200)
  assert.equal(api.headers['x-content-type-options'], 'nosniff')
  assert.equal(api.headers['x-frame-options'], 'DENY')
  assert.match(String(api.headers['content-security-policy']), /default-src 'none'/)
  assert.equal(api.json.version, '0.6.2')
  assert.equal(api.json.pack.id, 'core')
  assert.equal(api.json.ai.backend, 'none')
  const page = await h.get('/')
  assert.equal(page.status, 200)
  assert.match(String(page.headers['content-type']), /text\/html/)
  const csp = String(page.headers['content-security-policy'])
  assert.match(csp, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/)
  assert.match(csp, /frame-ancestors 'none'/)
})

test('the web app is served with its types, falls back to the page, and never leaves its folder', async () => {
  const js = await h.get('/assets/app.js')
  assert.equal(js.status, 200)
  assert.match(String(js.headers['content-type']), /text\/javascript/)
  const css = await h.get('/assets/style.css')
  assert.match(String(css.headers['content-type']), /text\/css/)
  const route = await h.get('/some/route')
  assert.equal(route.status, 200)
  assert.match(route.text, /<div id="root">/)
  assert.equal((await h.get('/assets/missing.js')).status, 404)
  for (const path of ['/../package.json', '/%2e%2e/%2e%2e/package.json', '/..%2f..%2fpackage.json', '/..%5c..%5cpackage.json', '/assets/%2e%2e/%2e%2e/%2e%2e/package.json', '/%00']) {
    const r = await raw(h.running.port, 'GET', path)
    assert.ok(r.status === 404 || r.status === 400 || (r.status === 200 && r.text.includes('<div id="root">')), `${path} gave ${r.status}`)
    assert.ok(!r.text.includes('"workspace:*"') && !r.text.includes('project-diplomat'), `${path} leaked a file`)
  }
  assert.equal((await h.call('POST', '/index.html', {})).status, 405)
})

test('errors are JSON with a message, and bodies are limited', async () => {
  const missing = await h.get('/api/nations/nobody')
  assert.equal(missing.status, 404)
  assert.match(missing.json.error, /no nation/)
  const badId = await h.get('/api/nations/..%2f..')
  assert.equal(badId.status, 400)
  assert.equal((await h.get('/api/nope')).status, 404)
  assert.equal((await h.call('DELETE', '/api/status')).status, 405)
  const badJson = await raw(h.running.port, 'POST', '/api/nations', { body: '{', headers: { 'X-Diplomat': '1', 'Content-Type': 'application/json' } })
  assert.equal(badJson.status, 400)
  const big = await raw(h.running.port, 'POST', '/api/nations', { body: 'x'.repeat(11 * 1024 * 1024), headers: { 'X-Diplomat': '1', 'Content-Type': 'application/json' } }).catch(() => ({ status: 413 }) as const)
  assert.equal(big.status, 413)
})

test('settings keep the API key write-only', async () => {
  const put = await h.put('/api/settings', { apiKey: 'sk-ant-test-1234', models: { bulk: 'claude-haiku-5-5' }, minorsThroughBodies: false })
  assert.equal(put.status, 200)
  assert.equal(put.json.apiKeySet, true)
  assert.equal(put.json.apiKey, undefined)
  const get = await h.get('/api/settings')
  assert.deepEqual(Object.keys(get.json).sort(), ['apiKeySet', 'backend', 'director', 'minorsThroughBodies', 'models', 'worldTier'])
  assert.equal(get.json.worldTier, 'standard')
  assert.equal((await h.put('/api/settings', { worldTier: 'bulk' })).json.worldTier, 'bulk')
  assert.equal((await h.put('/api/settings', { worldTier: 'strategic' })).status, 400)
  await h.put('/api/settings', { worldTier: 'standard' })
  assert.ok(!get.text.includes('sk-ant'))
  assert.equal((await h.put('/api/settings', { command: 'calc.exe' })).status, 400)
  assert.equal((await h.put('/api/settings', { backend: 'openai' })).status, 400)
  const test = await h.post('/api/settings/test')
  assert.equal(test.json.backend, 'none')
  const director = await h.put('/api/settings', { director: { model: 'claude-sonnet-5-5' } })
  assert.deepEqual(director.json.director, { enabled: true, model: 'claude-sonnet-5-5' })
  assert.equal((await h.put('/api/settings', { director: { model: 'no spaces allowed' } })).status, 400)
  assert.equal((await h.put('/api/settings', { director: { enabled: 'yes' } })).status, 400)
  // Two at once: each builds on the other, and neither is lost.
  const [one, two] = await Promise.all([h.put('/api/settings', { minorsThroughBodies: true }), h.put('/api/settings', { models: { standard: 'claude-sonnet-5-5' } })])
  assert.equal(one.status, 200)
  assert.equal(two.json.minorsThroughBodies, true)
  await h.put('/api/settings', { minorsThroughBodies: false })
  const cleared = await h.put('/api/settings', { apiKey: '' })
  assert.equal(cleared.json.apiKeySet, false)
})
