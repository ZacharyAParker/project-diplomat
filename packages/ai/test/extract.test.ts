import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AiError, createProvider, extractJson, selfTest } from '../src/index.ts'

test('extractJson takes a bare object', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 })
  assert.deepEqual(extractJson('  \n{"a": {"b": [1, 2]}}\n'), { a: { b: [1, 2] } })
})

test('extractJson takes a fenced block', () => {
  const text = 'Here is the sitting.\n\n```json\n{"ladder": ["1", "dismiss"]}\n```\nThat is all.'
  assert.deepEqual(extractJson(text), { ladder: ['1', 'dismiss'] })
  assert.deepEqual(extractJson('```\n{"x": true}\n```'), { x: true })
})

test('extractJson finds an object inside prose, ignoring braces in strings', () => {
  const text = 'The clerk notes {not json}. Result: {"debate": "The member said {quietly} \\"no\\"", "n": 2} — end.'
  assert.deepEqual(extractJson(text), { debate: 'The member said {quietly} "no"', n: 2 })
})

test('extractJson refuses garbage, arrays and nothing', () => {
  for (const bad of ['', 'no json here', '[1, 2, 3]', '{"unclosed": ', '```json\nnot json\n```']) {
    assert.throws(() => extractJson(bad), (error: unknown) => error instanceof AiError && error.code === 'not-json', bad)
  }
})

test('the none provider is off and refuses every task', async () => {
  const ai = createProvider({ backend: 'none' })
  const status = await ai.status()
  assert.equal(status.backend, 'none')
  assert.equal(status.ok, true)
  assert.equal(status.detail, 'AI is off')
  assert.equal(status.models.strategic, 'claude-opus-5-5')
  assert.equal((await selfTest(ai)).detail, 'AI is off')
  await assert.rejects(ai.run('ministry.advice', {} as never), /AI is off/)
})
