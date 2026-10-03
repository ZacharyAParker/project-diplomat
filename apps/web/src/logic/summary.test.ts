import { INDICATORS, type GameState } from '@diplomat/engine'
import { describe, expect, it } from 'vitest'
import { content, founded } from '../test/fixtures.ts'
import { band, pills, summary } from './summary.ts'

const at = (value: number): GameState => {
  const state = founded()
  return { ...state, indicators: Object.fromEntries(INDICATORS.map((id) => [id, value])) as GameState['indicators'] }
}

describe('the nation summary', () => {
  it('puts every figure into one of five bands', () => {
    expect([0, 24.9, 25, 41.9, 42, 57.9, 58, 74.9, 75, 100].map(band)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
  })

  it('names the three pills in words, with a tone for each', () => {
    expect(pills(at(10)).map((p) => [p.label, p.word, p.tone])).toEqual([
      ['Civil Liberties', 'Outlawed', 'low'],
      ['Economy', 'Basket Case', 'low'],
      ['Public Trust', 'Collapsing', 'low'],
    ])
    expect(pills(at(50)).map((p) => p.tone)).toEqual(['middling', 'middling', 'middling'])
    expect(pills(at(90)).map((p) => p.word)).toEqual(['Excessive', 'Booming', 'Adored'])
  })

  it('describes the nation in four paragraphs built from its own figures and names', () => {
    const state = at(90)
    const text = summary(state, content)
    expect(text).toHaveLength(4)
    expect(text[0]).toMatch(/^Vesland is a nation of pristine wilderness/)
    expect(text[0]).toContain('governed by its Prime Minister from Highmarch')
    expect(text[1]).toContain('a roaring economy')
    expect(text.join(' ')).not.toMatch(/undefined|\{|\}/)
    for (const paragraph of text) expect(paragraph).toMatch(/[.]$/)
  })

  it('reads differently for a nation at the bottom of every scale', () => {
    expect(summary(at(5), content).join(' ')).not.toBe(summary(at(95), content).join(' '))
    expect(summary(at(5), content)[2]).toContain('Few people believe the government has any right to govern.')
  })
})
