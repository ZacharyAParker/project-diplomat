import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Markdown, linkTarget } from './Markdown.tsx'

afterEach(() => cleanup())

describe('the Markdown renderer', () => {
  it('draws the text as elements, with headings under the page’s own', () => {
    const { container } = render(
      <Markdown text={'# Title\n\nSome **bold** and *slanted* words.\n\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |'} />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Title' })).toBeDefined()
    expect(container.querySelector('strong')!.textContent).toBe('bold')
    expect(container.querySelector('em')!.textContent).toBe('slanted')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('table')).toBeDefined()
  })

  it('prints raw HTML as the characters it was written in', () => {
    const { container } = render(
      <Markdown text={'<img src=x onerror="alert(1)"> and <script>alert(2)</script>\n\n<b>bold?</b>'} />,
    )
    expect(container.querySelector('img, script, b')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">')
    expect(container.textContent).toContain('<script>alert(2)</script>')
    expect(container.textContent).toContain('<b>bold?</b>')
  })

  it('links only to addresses inside the game, and prints any other link as its words', () => {
    const { container } = render(
      <Markdown
        nation="vesland"
        text={
          '[evil](javascript:alert(1)) [data](data:text/html,hi) [away](https://example.com) ' +
          '[shouty](JAVASCRIPT:alert(1)) [the Court](#/n/vesland/gov/body/court) [a sitting](hansard-00012) ' +
          '[nowhere](#/no/such/page)'
        }
      />,
    )
    const links = [...container.querySelectorAll('a')]
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#/n/vesland/gov/body/court', '#/n/vesland/gov/doc/hansard-00012'])
    for (const words of ['evil', 'data', 'away', 'shouty', 'nowhere']) expect(container.textContent).toContain(words)
    expect(container.innerHTML).not.toMatch(/javascript|data:|example\.com/i)
  })

  it('knows where a link may go', () => {
    expect(linkTarget('javascript:alert(1)')).toBeNull()
    expect(linkTarget(' #/kit ')).toEqual({ name: 'kit' })
    expect(linkTarget('hansard-00001')).toBeNull()
    expect(linkTarget('hansard-00001', 'x')).toEqual({ name: 'gov', id: 'x', page: 'doc', doc: 'hansard-00001' })
  })
})
