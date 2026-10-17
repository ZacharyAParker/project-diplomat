import { bodyName } from '../../logic/docket.ts'
import { modeName } from '../../logic/forms.ts'
import { docRoute } from '../../logic/router.ts'
import { useGame, type Current } from '../../store/game.tsx'
import { TextLink } from '../../ui/index.ts'
import { Band, DocList, GovFrame, Loading, nationDate, useLoad } from './shared.tsx'

// The executive: who holds the office, the ministries and their ministers, what the office
// has been told to do, and its own papers.
export function Executive({ current }: { current: Current }) {
  const game = useGame()
  const government = current.government
  const papers = useLoad(`papers:${current.id}:${current.state.timeline.length}`, () => game.archive({ series: 'papers', limit: 15 }))
  const rules = government?.institutions.constitution.rules
  const ministries = government?.institutions.bodies.filter((b) => b.kind === 'ministry') ?? []
  const owed = government?.directions.filter((d) => !d.done) ?? []
  const holder = current.mode === 'govern' ? 'You hold it.' : rules?.executive.holder ? `${rules.executive.holder} holds it.` : ''

  return (
    <GovFrame
      current={current}
      here="executive"
      title={rules?.executive.title ?? 'The executive'}
      intro={
        <p>
          {holder} The mode is {modeName(current.mode).toLowerCase()}:{' '}
          {current.mode === 'govern' ? 'each petition is decided at the desk.' : 'the office decides on its own, and the Founder steps in by Word.'}
        </p>
      }
    >
      <div className="gov-cols">
        <div>
          <Band title="The ministries">
            {ministries.length === 0 ? (
              <p className="gov-none">There are no ministries.</p>
            ) : (
              <div className="gov-table">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Ministry</th>
                      <th scope="col">Minister</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ministries.map((ministry) => (
                      <tr key={ministry.id}>
                        <th scope="row">
                          {ministry.name}
                          <span className="small soft gov-sub">{ministry.description}</span>
                        </th>
                        <td>
                          {ministry.members.map((m) => (
                            <span key={m.id} className="gov-sub">
                              {m.name}
                              {m.office && <span className="small soft">, {m.office}</span>}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Band>
          <Band title="Directions owed">
            {owed.length === 0 ? (
              <p className="gov-none">Nothing is owed.</p>
            ) : (
              <ul className="doclist">
                {owed.map((d, i) => (
                  <li key={i} className="doclist__item">
                    <span className="doclist__title">{d.text}</span>
                    <span className="doclist__meta small soft">
                      From {bodyName(government, d.from)}, {nationDate(government, d.day)}.{' '}
                      {d.document && <TextLink to={docRoute(current.id, d.document)}>Where it was given</TextLink>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Band>
        </div>
        <div>
          <Band title="The executive’s papers">
            <Loading loaded={papers} what="The papers">
              {(page) => <DocList nation={current.id} heads={page.documents} government={government} empty="The office has written nothing yet." />}
            </Loading>
          </Band>
        </div>
      </div>
    </GovFrame>
  )
}
