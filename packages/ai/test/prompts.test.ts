import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TASKS, TASK_TIERS } from '@diplomat/government'
import { DEFAULT_MODELS, TASK_SCHEMAS, allPrompts, councilSitsAsCourt, promptFor, schemaFor } from '../src/index.ts'
import { adviceInput, brief, court, courtInput, petition } from './fixtures.ts'

test('every task has a prompt with its stable sections, then Input, then Output', () => {
  const prompts = allPrompts()
  for (const task of TASKS) {
    const text = prompts[task]
    assert.ok(text.length > 1500, `${task} prompt is too short`)
    const input = text.indexOf('\n## Input')
    const output = text.indexOf('\n## Output')
    assert.ok(input > 0, `${task} has no ## Input section`)
    assert.ok(output > input, `${task} has ## Output before ## Input`)
    assert.equal(text.indexOf('\n## Input', input + 1), -1, `${task} has two Input sections`)
    // The rules every body shares.
    assert.match(text, /archivePath/, `${task} does not explain the archive`)
    assert.match(text, /archive\/<series>\/<seq>-<slug>\.md/, `${task} does not give the archive layout`)
    assert.match(text, /Founder/, `${task} does not mention the Founder`)
    assert.match(text, /data/i, `${task} does not say player text is data`)
    assert.match(text, /never\s+winking/, `${task} lost the house tone`)
    assert.match(text, /British\s+spelling/, `${task} does not ask for British spelling`)
    // It must fit on a Windows command line alongside its schema (claude-cli back end).
    assert.ok(text.length + JSON.stringify(TASK_SCHEMAS[task]).length < 28_000, `${task} prompt is too long for Windows`)
  }
})

test('each Output section names every required field of its schema', () => {
  for (const task of TASKS) {
    const output = promptFor(task).slice(promptFor(task).indexOf('\n## Output'))
    const schemas = task === 'council.sitting' ? (TASK_SCHEMAS[task].anyOf as Record<string, unknown>[]) : [TASK_SCHEMAS[task]]
    for (const schema of schemas) {
      for (const field of (schema.required as string[]) ?? []) {
        assert.ok(output.includes(`"${field}"`), `${task} Output does not show "${field}"`)
      }
    }
  }
})

test('the prompts carry the Claudetopia rules', () => {
  assert.match(promptFor('court.opinion'), /Read to save before you bar/)
  assert.match(promptFor('legislature.sitting'), /The house is there to choose a solution/)
  assert.match(promptFor('legislature.sitting'), /exactly once/)
  assert.match(promptFor('legislature.sitting'), /equals its seats exactly/)
  assert.match(promptFor('court.opinion'), /keyed by member id/)
  assert.match(promptFor('world.day'), /Nobody writes their own opposition/)
  for (const task of ['legislature.sitting', 'court.opinion', 'world.day', 'executive.decision'] as const) {
    assert.match(promptFor(task), /Game facts win/, task)
    assert.match(promptFor(task), /Silence/, task)
  }
  for (const task of ['legislature.sitting', 'court.opinion', 'world.day', 'ministry.advice', 'council.sitting'] as const) {
    assert.match(promptFor(task), /never\s+told\s+what\s+the\s+executive/i, task)
  }
})

test('every task has a schema, and each call gets an object schema', () => {
  const inputs = {
    'ministry.advice': adviceInput,
    'court.opinion': courtInput,
  } as const
  for (const task of TASKS) {
    assert.ok(TASK_SCHEMAS[task], `${task} has no schema`)
    assert.ok(TASK_TIERS[task] in DEFAULT_MODELS)
  }
  for (const task of TASKS.filter((t) => t !== 'council.sitting')) {
    const schema = schemaFor(task, (inputs as unknown as Record<string, never>)[task])
    assert.equal(schema.type, 'object', `${task} schema is not an object`)
    assert.equal(schema.additionalProperties, false, task)
  }
})

test('a council sits as a court when it has rights and a bar, otherwise as a house', () => {
  const asCourt = { ...courtInput, body: { ...court, kind: 'council' as const } }
  const asHouse = { brief, body: { ...court, kind: 'council' as const }, petition, kind: 'first' as const, advice: [] }
  assert.equal(councilSitsAsCourt(asCourt), true)
  assert.equal(councilSitsAsCourt(asHouse), false)
  assert.ok((schemaFor('council.sitting', asCourt).required as string[]).includes('rulings'))
  assert.ok((schemaFor('council.sitting', asHouse).required as string[]).includes('ladder'))
})
