import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { AiError } from '@diplomat/ai'
import type { Provider } from '@diplomat/government'
import { harness, IDENTITY, settle, type Harness } from './helpers.ts'

let h: Harness
before(async () => {
  h = await harness()
})
after(async () => {
  h.running.ai.override = null
  await h.close()
})

const models = { bulk: 'b', standard: 's', strategic: 'o' }

test('a refused key is shown on the docket and in the status, and the stand-ins sit', async () => {
  const seen: string[] = []
  const provider: Provider = {
    status: async () => ({ backend: 'anthropic', ok: true, detail: 'Claude API key ending 0000', models }),
    run: async (task) => {
      seen.push(task)
      throw new AiError('auth', 'The API key was refused.')
    },
  }
  h.running.ai.override = provider
  const made = await h.post('/api/nations', { identity: IDENTITY, answers: {}, form: 'commonwealth', mode: 'govern', founder: { name: 'Aegis', title: 'Founder' } })
  assert.equal(made.status, 201, made.json.error)
  const dockets = await settle(h, made.json.id)
  const d = dockets[0]
  assert.equal(d.status, 'ready')
  assert.ok(d.progress.some((l: string) => /refused the credentials/.test(l)), d.progress.join(' | '))
  assert.ok(d.sittings.every((s: any) => s.ai === false))
  assert.ok(seen.length > 0)
  const status = (await h.get('/api/status')).json
  assert.equal(status.ai.ok, false)
  assert.match(status.ai.detail, /refused/)
})

test('an answer that does not validate is retried once with its problems, then the stand-in plays', async () => {
  const inputs: unknown[] = []
  h.running.ai.override = {
    status: async () => ({ backend: 'anthropic', ok: true, detail: 'ok', models }),
    run: async (_task, input) => {
      inputs.push(input)
      return { nonsense: true }
    },
  }
  const made = await h.post('/api/nations', { identity: { ...IDENTITY, name: 'Retryland' }, answers: {}, form: 'absolute-monarchy', mode: 'govern', founder: { name: 'Aegis', title: 'Founder' } })
  const dockets = await settle(h, made.json.id)
  assert.equal(dockets[0].status, 'ready')
  assert.ok(inputs.length >= 2)
  assert.ok(inputs.some((i) => typeof (i as { __retry?: unknown }).__retry === 'string'), 'the retry names the problems')
  assert.ok(dockets[0].progress.some((l: string) => /did not hold up/.test(l)))
  const draft = await h.post(`/api/nations/${made.json.id}/factbooks/draft`, { title: 'Hills', category: 'geography', notes: '' })
  assert.equal(draft.status, 200)
  assert.equal(draft.json.ai, false)
})
