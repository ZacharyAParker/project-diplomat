import { useId, useState, type FormEvent } from 'react'
import { SERIES_LIST, SERIES_NAMES } from '../../logic/forms.ts'
import type { LibraryQuery } from '../../logic/router.ts'
import { useGame, type Current } from '../../store/game.tsx'
import { go } from '../../store/route.ts'
import { Button, LinkTo, TextField } from '../../ui/index.ts'
import { DocList, GovFrame, Loading, useLoad } from './shared.tsx'

export const PAGE_SIZE = 25

const asDay = (text: string): number | undefined => (/^\d{1,7}$/.test(text.trim()) ? Number(text.trim()) : undefined)

// Every document in the Archive, newest first, searched and filtered by the server.
export function Library({ current, query }: { current: Current; query: LibraryQuery }) {
  const game = useGame()
  const government = current.government
  const page = query.page ?? 1
  const [q, setQ] = useState(query.q ?? '')
  const [series, setSeries] = useState(query.series ?? '')
  const [issuer, setIssuer] = useState(query.issuer ?? '')
  const [from, setFrom] = useState(query.from === undefined ? '' : String(query.from))
  const [to, setTo] = useState(query.to === undefined ? '' : String(query.to))
  const seriesId = useId()

  const key = JSON.stringify([current.id, query, current.state.timeline.length])
  const results = useLoad(key, () =>
    game.archive({
      ...(query.q ? { q: query.q } : {}),
      ...(query.series ? { series: query.series } : {}),
      ...(query.issuer ? { issuer: query.issuer } : {}),
      ...(query.from !== undefined ? { from: query.from } : {}),
      ...(query.to !== undefined ? { to: query.to } : {}),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  )

  const issuers = [
    ...new Set([
      ...(government?.institutions.bodies.map((b) => b.name) ?? []),
      government?.institutions.founder.name ? 'The Founder' : '',
    ]),
  ].filter(Boolean)

  function search(event: FormEvent) {
    event.preventDefault()
    const next: LibraryQuery = {}
    if (q.trim()) next.q = q.trim()
    if (series) next.series = series
    if (issuer.trim()) next.issuer = issuer.trim()
    const f = asDay(from)
    const t = asDay(to)
    if (f !== undefined) next.from = f
    if (t !== undefined) next.to = t
    go({ name: 'gov', id: current.id, page: 'library', query: next })
  }

  const route = (n: number) => ({ name: 'gov', id: current.id, page: 'library', query: { ...query, page: n } }) as const

  return (
    <GovFrame
      current={current}
      here="library"
      title="The library"
      intro={<p>Every document the government and the world have written, newest first. Nothing in it is ever changed.</p>}
    >
      <form className="gov-find" onSubmit={search} role="search" aria-label="Search the library">
        <div className="gov-find__q">
          <TextField label="Words" type="search" value={q} onChange={setQ} />
        </div>
        <div className="field">
          <label className="field__label label" htmlFor={seriesId}>
            Series
          </label>
          <select id={seriesId} className="field__input" value={series} onChange={(event) => setSeries(event.target.value)}>
            <option value="">Every series</option>
            {SERIES_LIST.map((s) => (
              <option key={s} value={s}>
                {SERIES_NAMES[s]}
              </option>
            ))}
          </select>
        </div>
        <TextField label="Issued by" value={issuer} onChange={setIssuer} list="gov-issuers" hint="Leave empty for anyone." />
        <datalist id="gov-issuers">
          {issuers.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <TextField label="From day" inputMode="numeric" value={from} onChange={setFrom} />
        <TextField label="To day" inputMode="numeric" value={to} onChange={setTo} />
        <div className="gov-find__go">
          <Button type="submit" look="primary">
            Search
          </Button>
        </div>
      </form>

      <Loading loaded={results} what="The library">
        {(found) => {
          const pages = Math.max(1, Math.ceil(found.total / PAGE_SIZE))
          return (
            <>
              <p className="gov-count">
                {found.total === 0
                  ? 'Nothing matches.'
                  : `${found.total.toLocaleString('en-GB')} ${found.total === 1 ? 'document' : 'documents'}${
                      pages > 1 ? `, page ${page} of ${pages}` : ''
                    }.`}
              </p>
              <DocList
                nation={current.id}
                heads={found.documents}
                government={government}
                empty="No document matches. Try fewer words, or every series."
              />
              {pages > 1 && (
                <nav className="row gov-pages" aria-label="Pages of results">
                  {page > 1 && (
                    <LinkTo to={route(page - 1)} size="small">
                      Newer
                    </LinkTo>
                  )}
                  {page < pages && (
                    <LinkTo to={route(page + 1)} size="small">
                      Older
                    </LinkTo>
                  )}
                </nav>
              )}
            </>
          )
        }}
      </Loading>
    </GovFrame>
  )
}
