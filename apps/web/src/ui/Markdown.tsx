import { Fragment, useMemo, type ReactNode } from 'react'
import { parseMarkdown, type Block, type Inline } from '../logic/markdown.ts'
import { docRoute, isDocId, parseRoute, routeHref, type Route } from '../logic/router.ts'

export interface MarkdownProps {
  text: string
  // The nation whose Archive this is, so a link to a bare document id goes to its page.
  nation?: string
  // Headings in the text are pushed down this many levels, under the page's own h1.
  shift?: number
  className?: string
}

// Where a link in the text may go. Only somewhere inside this game: an address that starts
// with #/ and that the router knows, or a document id. Anything else (another site, a
// javascript: address, a data: one) is printed as its words, with no link at all.
export function linkTarget(href: string, nation?: string): Route | null {
  const target = href.trim()
  if (nation && isDocId(target)) return docRoute(nation, target)
  if (!target.startsWith('#/')) return null
  const route = parseRoute(target)
  return route.name === 'lost' ? null : route
}

function Inlines({ nodes, nation }: { nodes: readonly Inline[]; nation?: string }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.t === 'text') return <Fragment key={i}>{node.v}</Fragment>
        if (node.t === 'br') return <br key={i} />
        if (node.t === 'code') return <code key={i}>{node.v}</code>
        if (node.t === 'strong')
          return (
            <strong key={i}>
              <Inlines nodes={node.c} nation={nation} />
            </strong>
          )
        if (node.t === 'em')
          return (
            <em key={i}>
              <Inlines nodes={node.c} nation={nation} />
            </em>
          )
        const route = linkTarget(node.href, nation)
        if (!route) return <Inlines key={i} nodes={node.c} nation={nation} />
        return (
          <a key={i} className="link" href={routeHref(route)}>
            <Inlines nodes={node.c} nation={nation} />
          </a>
        )
      })}
    </>
  )
}

function Blocks({ blocks, nation, shift }: { blocks: readonly Block[]; nation?: string; shift: number }): ReactNode {
  return blocks.map((block, i) => {
    switch (block.t) {
      case 'heading': {
        const level = Math.min(6, block.level + shift)
        const Tag = `h${level}` as 'h2'
        return (
          <Tag key={i} id={block.id}>
            <Inlines nodes={block.c} nation={nation} />
          </Tag>
        )
      }
      case 'paragraph':
        return (
          <p key={i}>
            <Inlines nodes={block.c} nation={nation} />
          </p>
        )
      case 'list': {
        const items = block.items.map((item, k) => (
          <li key={k}>
            {/* A one-paragraph item is printed without its paragraph, as a tight list. */}
            {item.length === 1 && item[0]!.t === 'paragraph' ? (
              <Inlines nodes={item[0]!.c} nation={nation} />
            ) : (
              <Blocks blocks={item} nation={nation} shift={shift} />
            )}
          </li>
        ))
        return block.ordered ? (
          <ol key={i} start={block.start === 1 ? undefined : block.start}>
            {items}
          </ol>
        ) : (
          <ul key={i}>{items}</ul>
        )
      }
      case 'quote':
        return (
          <blockquote key={i}>
            <Blocks blocks={block.c} nation={nation} shift={shift} />
          </blockquote>
        )
      case 'code':
        return (
          <pre key={i}>
            <code>{block.v}</code>
          </pre>
        )
      case 'rule':
        return <hr key={i} className="rule rule--hair" />
      case 'table':
        return (
          <div key={i} className="md__table">
            <table>
              <thead>
                <tr>
                  {block.head.map((cell, k) => (
                    <th key={k} scope="col" style={block.align[k] ? { textAlign: block.align[k]! } : undefined}>
                      <Inlines nodes={cell} nation={nation} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, k) => (
                      <td key={k} style={block.align[k] ? { textAlign: block.align[k]! } : undefined}>
                        <Inlines nodes={cell} nation={nation} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
    }
  })
}

// Markdown drawn as React elements. No string of HTML is ever made, so whatever is in the
// text, a tag or a script, reaches the page as the characters it was written in.
export function Markdown({ text, nation, shift = 1, className }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return (
    <div className={['md', className].filter(Boolean).join(' ')}>
      <Blocks blocks={blocks} nation={nation} shift={shift} />
    </div>
  )
}
