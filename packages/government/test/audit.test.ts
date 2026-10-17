import assert from 'node:assert/strict'
import { test } from 'node:test'
import { billStage } from '../src/pipeline.ts'

// Found in review: a sitting could make a bill law with 0 votes for it, and a bill that
// passed properly never became law. Code now reads the stage from the division.

test('a sitting cannot sign a bill or make it law; it can only pass it with a division', () => {
  assert.equal(billStage('law', 'committee', { aye: 0, no: 151 }), 'failed')
  assert.equal(billStage('signed', 'committee', { aye: 100, no: 40 }), 'passed')
  assert.equal(billStage('law', 'committee'), 'committee')
})

test('passed needs a carried division and failed a lost one, or the bill stays where it was', () => {
  assert.equal(billStage('passed', 'committee', { aye: 76, no: 75 }), 'passed')
  assert.equal(billStage('passed', 'committee', { aye: 75, no: 75 }), 'failed')
  assert.equal(billStage('passed', 'committee'), 'committee')
  assert.equal(billStage('failed', 'committee', { aye: 90, no: 10 }), 'committee')
  assert.equal(billStage('failed', 'committee', { aye: 10, no: 90 }), 'failed')
  assert.equal(billStage('returned', 'committee', { aye: 10, no: 90 }), 'committee')
  assert.equal(billStage('introduced', 'introduced'), 'introduced')
})
