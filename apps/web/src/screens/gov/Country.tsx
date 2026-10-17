import { percent } from '../../logic/changes.ts'
import { docRoute } from '../../logic/router.ts'
import { useGame, type Current } from '../../store/game.tsx'
import { Spark, TextLink } from '../../ui/index.ts'
import { Census } from '../NationGovernment.tsx'
import { readAlmanac } from './almanac.ts'
import { Band, GovFrame, Loading, nationDate, useLoad } from './shared.tsx'

const DAYS_SHOWN = 7

// The country outside the government: the census, opinion over time, what each paper said,
// and the matters the world has raised.
export function Country({ current }: { current: Current }) {
  const game = useGame()
  const government = current.government
  const days = useLoad(`almanac:${current.id}:${current.state.day}`, async () => {
    const page = await game.archive({ series: 'almanac', limit: DAYS_SHOWN })
    const docs = await Promise.all(page.documents.map((head) => game.document(head.id)))
    return docs.map(({ document }) => ({ document, day: readAlmanac(document.data) }))
  })
  const history = current.history
  const recent = history.slice(-14)

  return (
    <GovFrame
      current={current}
      here="country"
      title="The country"
      intro={<p>How the country is, by the census office’s figures, and what it thinks, by the almanac and the press.</p>}
    >
      <Census figures={current.census} />

      <Band title="Opinion">
        <p>
          Support for the government stands at {percent(current.support)}.{' '}
          {history.length > 1 && (
            <>
              Over the last {recent.length === 1 ? 'day' : `${recent.length} days`}: <Spark values={recent.map((s) => s.support)} />
            </>
          )}
        </p>
        {history.length > 1 && (
          <details className="fold">
            <summary>Support day by day</summary>
            <div className="gov-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col" className="num">
                      Support
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...recent].reverse().map((s) => (
                    <tr key={s.day}>
                      <th scope="row">{s.day === 0 ? 'At the founding' : nationDate(government, s.day)}</th>
                      <td className="num">{percent(s.support)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
        <Loading loaded={days} what="The almanac">
          {(list) =>
            list.length === 0 ? (
              <p className="gov-none">The almanac has not written a day yet.</p>
            ) : (
              <ul className="doclist">
                {list.map(({ document, day }) => (
                  <li key={document.id} className="doclist__item">
                    <TextLink to={docRoute(current.id, document.id)} className="doclist__title">
                      {document.date || nationDate(government, document.day)}
                    </TextLink>
                    <span className="small">{day.opinion ?? 'No reading of opinion that day.'}</span>
                    {day.poll && (
                      <span className="small soft">
                        {day.poll.question}:{' '}
                        {Object.entries(day.poll.results)
                          .map(([answer, share]) => `${answer} ${share}%`)
                          .join(', ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </Loading>
      </Band>

      <Band title="The press">
        <Loading loaded={days} what="The press">
          {(list) => {
            const outlets = government?.institutions.press ?? []
            const names = [...new Set([...outlets.map((p) => p.name), ...list.flatMap((d) => d.day.press.map((p) => p.outlet))])]
            if (names.length === 0) return <p className="gov-none">The country has no press on record.</p>
            return (
              <div className="press-outlets">
                {names.map((name) => {
                  const outlet = outlets.find((p) => p.name === name)
                  const stories = list.flatMap(({ document, day }) =>
                    day.press.filter((p) => p.outlet === name).map((p) => ({ ...p, document })),
                  )
                  return (
                    <section key={name} className="press-outlet">
                      <h3>{name}</h3>
                      {outlet && (
                        <p className="small soft">
                          {outlet.kind === 'broadcaster' ? 'Broadcaster' : 'Newspaper'}: {outlet.line}
                        </p>
                      )}
                      {stories.length === 0 ? (
                        <p className="small soft">Nothing in the last week of the almanac.</p>
                      ) : (
                        <ul className="press">
                          {stories.map((story, i) => (
                            <li key={i}>
                              <span className="press__paper small soft">{story.document.date || nationDate(government, story.document.day)}</span>
                              <span className="press__hl">{story.headline}</span>
                              {story.text && <span className="small">{story.text}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  )
                })}
              </div>
            )
          }}
        </Loading>
      </Band>

      <Band title="Matters arising">
        <Loading loaded={days} what="The matters arising">
          {(list) => {
            const matters = list.flatMap(({ document, day }) => day.matters.map((m) => ({ ...m, document })))
            if (matters.length === 0) return <p className="gov-none">The world has raised nothing with the government this week.</p>
            return (
              <ul className="doclist">
                {matters.map((m, i) => (
                  <li key={i} className="doclist__item">
                    <span className="doclist__title">{m.text}</span>
                    <span className="doclist__meta small soft">
                      {m.to ? `For ${m.to}. ` : ''}
                      <TextLink to={docRoute(current.id, m.document.id)}>{m.document.date || nationDate(government, m.document.day)}</TextLink>
                    </span>
                  </li>
                ))}
              </ul>
            )
          }}
        </Loading>
      </Band>
    </GovFrame>
  )
}
