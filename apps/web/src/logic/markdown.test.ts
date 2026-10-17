import { describe, expect, it } from 'vitest'
import { headings, parseInline, parseMarkdown, type Block } from './markdown.ts'

const one = (text: string): Block => parseMarkdown(text)[0]!

describe('blocks', () => {
  it('reads headings, paragraphs and rules', () => {
    expect(parseMarkdown('# The Petition\n\nIt was late.\nVery late.\n\n---\n\n### After')).toEqual([
      { t: 'heading', level: 1, c: [{ t: 'text', v: 'The Petition' }], id: 'the-petition' },
      { t: 'paragraph', c: [{ t: 'text', v: 'It was late. Very late.' }] },
      { t: 'rule' },
      { t: 'heading', level: 3, c: [{ t: 'text', v: 'After' }], id: 'after' },
    ])
  })

  it('gives repeated headings ids of their own', () => {
    expect(headings(parseMarkdown('## Votes\n\n## Votes\n\n> ## Quoted'))).toEqual([
      { level: 2, text: 'Votes', id: 'votes' },
      { level: 2, text: 'Votes', id: 'votes-2' },
      { level: 2, text: 'Quoted', id: 'quoted' },
    ])
  })

  it('reads lists, numbered and nested', () => {
    const list = one('3. First\n4. Second\n   - inner\n   - more\n5. Third')
    expect(list).toMatchObject({ t: 'list', ordered: true, start: 3 })
    if (list.t !== 'list') throw new Error('not a list')
    expect(list.items).toHaveLength(3)
    expect(list.items[1]![1]).toMatchObject({ t: 'list', ordered: false })
    expect(one('- a\n\n- b')).toMatchObject({ t: 'list', items: [[{ t: 'paragraph' }], [{ t: 'paragraph' }]] })
  })

  it('reads pipe tables with alignment', () => {
    const table = one('| Party | Seats |\n|:---|---:|\n| The Hands | 39 |\n| A \\| B | 6 |')
    expect(table).toMatchObject({ t: 'table', align: ['left', 'right'] })
    if (table.t !== 'table') throw new Error('not a table')
    expect(table.rows).toHaveLength(2)
    expect(table.rows[1]![0]).toEqual([{ t: 'text', v: 'A | B' }])
  })

  it('reads block quotes and code, and leaves code alone', () => {
    expect(one('> Said\n> twice')).toEqual({ t: 'quote', c: [{ t: 'paragraph', c: [{ t: 'text', v: 'Said twice' }] }] })
    expect(one('```\n**not bold** <b>\n```')).toEqual({ t: 'code', v: '**not bold** <b>' })
    expect(one('    indented\n    code')).toEqual({ t: 'code', v: 'indented\ncode' })
  })

  it('never recurses without end on text built to make it', () => {
    expect(() => parseMarkdown('>'.repeat(5000) + ' deep')).not.toThrow()
    expect(() => parseInline('*'.repeat(3000) + 'x' + '*'.repeat(3000))).not.toThrow()
  })
})

describe('inline', () => {
  it('reads strong, emphasis, code and links', () => {
    expect(parseInline('**Aye**, *no*, `abstain` and [the Court](#/n/x/gov/body/court)')).toEqual([
      { t: 'strong', c: [{ t: 'text', v: 'Aye' }] },
      { t: 'text', v: ', ' },
      { t: 'em', c: [{ t: 'text', v: 'no' }] },
      { t: 'text', v: ', ' },
      { t: 'code', v: 'abstain' },
      { t: 'text', v: ' and ' },
      { t: 'link', href: '#/n/x/gov/body/court', c: [{ t: 'text', v: 'the Court' }] },
    ])
  })

  it('leaves underscores inside words and stray stars as text', () => {
    expect(parseInline('snake_case_name and 2 * 3 * 4')).toEqual([{ t: 'text', v: 'snake_case_name and 2 * 3 * 4' }])
    expect(parseInline('\\*not em\\*')).toEqual([{ t: 'text', v: '*not em*' }])
  })

  it('keeps raw HTML as text', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([{ t: 'text', v: '<script>alert(1)</script>' }])
  })

  it('keeps a hard line break', () => {
    expect(parseInline('one  \ntwo')).toEqual([{ t: 'text', v: 'one' }, { t: 'br' }, { t: 'text', v: 'two' }])
  })
})
