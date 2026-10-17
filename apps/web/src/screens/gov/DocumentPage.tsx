import { useMemo } from 'react'
import { SERIES_NAMES } from '../../logic/forms.ts'
import { headings, parseMarkdown } from '../../logic/markdown.ts'
import { docRoute, isDocId } from '../../logic/router.ts'
import { useGame, type Current } from '../../store/game.tsx'
import { Button, Markdown, TextLink } from '../../ui/index.ts'
import { DocList, GovFrame, Loading, nationDate, useLoad } from './shared.tsx'

function Contents({ body }: { body: string }) {
  const list = useMemo(() => headings(parseMarkdown(body)), [body])
  if (list.length < 2) return null
  return (
    <nav className="gov-contents" aria-label="Contents">
      <p className="label">Contents</p>
      <ol>
        {list.map((h) => (
          <li key={h.id} className={`gov-contents__l${Math.min(h.level, 3)}`}>
            <button type="button" className="gov-contents__go" onClick={() => document.getElementById(h.id)?.scrollIntoView?.({ block: 'start' })}>
              {h.text}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

// One document in the Archive: its head, its text, what it cites and what cites it.
export function DocumentPage({ current, docId }: { current: Current; docId: string }) {
  const game = useGame()
  const government = current.government
  const loaded = useLoad(`${current.id}:${docId}`, () => game.document(docId))
  const title = loaded.data?.document.title ?? (loaded.error ? 'A document that cannot be read' : 'A document')
  const dilemma = (ref: string) => game.content.dilemmas.find((d) => d.id === ref)?.title

  return (
    <GovFrame current={current} here="library" title={title} kicker={loaded.data ? SERIES_NAMES[loaded.data.document.series] : undefined}>
      <Loading loaded={loaded} what="The document">
        {({ document: doc, citedBy }) => (
          <article className="gov-doc">
            <table className="gov-particulars">
              <tbody>
                <tr>
                  <th scope="row">Series</th>
                  <td>{SERIES_NAMES[doc.series] ?? doc.series}</td>
                </tr>
                <tr>
                  <th scope="row">Issued by</th>
                  <td>{doc.issuer}</td>
                </tr>
                <tr>
                  <th scope="row">Dated</th>
                  <td>
                    {doc.date || nationDate(government, doc.day)}, day {doc.day}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Kind</th>
                  <td>{doc.kind}</td>
                </tr>
                <tr>
                  <th scope="row">Reference</th>
                  <td className="gov-cite">{doc.id}</td>
                </tr>
              </tbody>
            </table>

            <div className="gov-doc__layout">
              <div className="gov-doc__text">
                {doc.body.trim() ? <Markdown text={doc.body} nation={current.id} /> : <p className="gov-none">The document has no text.</p>}
              </div>
              <aside className="gov-doc__side">
                <Contents body={doc.body} />
                <section aria-labelledby="doc-cites">
                  <h2 id="doc-cites" className="label">
                    It cites
                  </h2>
                  {doc.refs.length === 0 ? (
                    <p className="small soft">Nothing.</p>
                  ) : (
                    <ul className="plain-list small">
                      {doc.refs.map((ref) => (
                        <li key={ref}>
                          {isDocId(ref) ? (
                            <TextLink to={docRoute(current.id, ref)}>{ref}</TextLink>
                          ) : (
                            <span>{dilemma(ref) ? `The issue: ${dilemma(ref)}` : ref}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section aria-labelledby="doc-cited">
                  <h2 id="doc-cited" className="label">
                    Cited by
                  </h2>
                  <DocList nation={current.id} heads={citedBy} government={government} empty="Nothing cites it yet." />
                </section>
                <p className="gov-doc__print">
                  <Button size="small" onClick={() => window.print()}>
                    Print it
                  </Button>
                </p>
              </aside>
            </div>
            <p className="gov-doc__footer small">
              {doc.id}. {government?.institutions.constitution.stateName ?? current.state.identity.name}, the Archive.
            </p>
          </article>
        )}
      </Loading>
    </GovFrame>
  )
}
