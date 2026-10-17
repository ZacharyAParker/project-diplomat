import type { Bill } from '@diplomat/government'
import { bodyName } from '../../logic/docket.ts'
import { docRoute } from '../../logic/router.ts'
import { useGame, type Current } from '../../store/game.tsx'
import { Tag, TextLink } from '../../ui/index.ts'
import { Band, DocList, GovFrame, Loading, nationDate, useLoad } from './shared.tsx'

export const BILL_STAGES: Record<Bill['stage'], string> = {
  introduced: 'Introduced',
  committee: 'In committee',
  passed: 'Passed, awaiting signature',
  signed: 'Signed',
  returned: 'Returned unsigned',
  failed: 'Failed',
  law: 'In force as law',
}

// What binds now: the rulings, the directions still owed, the statutes and the bills.
export function InForce({ current }: { current: Current }) {
  const game = useGame()
  const government = current.government
  const key = `${current.id}:${current.state.timeline.length}`
  const rulings = useLoad(`court:${key}`, () => game.archive({ series: 'court', limit: 30 }))
  const law = useLoad(`law:${key}`, () => game.archive({ series: 'law', limit: 50 }))
  const owed = government?.directions.filter((d) => !d.done) ?? []
  const bills = government?.bills ?? []

  return (
    <GovFrame
      current={current}
      here="in-force"
      title="In force"
      intro={<p>The law as it stands: the constitution and statutes, the rulings that bind, what the executive has been told to do, and the bills on their way.</p>}
    >
      <div className="gov-cols">
        <div>
          <Band title="Directions owed">
            {owed.length === 0 ? (
              <p className="gov-none">No direction to the executive is outstanding.</p>
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
          <Band title="Rulings">
            <Loading loaded={rulings} what="The rulings">
              {(page) => (
                <DocList nation={current.id} heads={page.documents} government={government} empty="No court has reported a ruling yet." />
              )}
            </Loading>
          </Band>
        </div>
        <div>
          <Band title="The constitution and the statutes">
            <Loading loaded={law} what="The law">
              {(page) => <DocList nation={current.id} heads={page.documents} government={government} empty="Nothing is on the statute book." />}
            </Loading>
          </Band>
          <Band title="Bills">
            {bills.length === 0 ? (
              <p className="gov-none">No bill has been moved.</p>
            ) : (
              <div className="gov-table">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Bill</th>
                      <th scope="col">Where it is</th>
                      <th scope="col">Last division</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map((bill) => {
                      const last = bill.divisions.at(-1)
                      return (
                        <tr key={bill.number}>
                          <th scope="row">
                            {bill.document ? (
                              <TextLink to={docRoute(current.id, bill.document)}>
                                No. {bill.number}, {bill.title}
                              </TextLink>
                            ) : (
                              `No. ${bill.number}, ${bill.title}`
                            )}
                            <span className="small soft gov-sub">{bill.summary}</span>
                          </th>
                          <td>
                            <Tag tone={bill.stage === 'law' ? 'good' : bill.stage === 'failed' || bill.stage === 'returned' ? 'bad' : 'plain'}>
                              {BILL_STAGES[bill.stage]}
                            </Tag>
                            {bill.amendment && <span className="small soft gov-sub">Amends the constitution</span>}
                          </td>
                          <td className="small">
                            {last ? `${last.reading}: ${last.aye} to ${last.no}, ${last.abstain} abstaining` : 'None yet'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Band>
        </div>
      </div>
    </GovFrame>
  )
}
