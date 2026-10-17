import { STATUS_WORDS } from '../../logic/forms.ts'
import { bodyName, executiveTitle, openDockets, resultLine } from '../../logic/docket.ts'
import { docRoute } from '../../logic/router.ts'
import { useGame, type Current } from '../../store/game.tsx'
import { LinkTo, Tag, TextLink } from '../../ui/index.ts'
import { readAlmanac } from './almanac.ts'
import { BILL_STAGES } from './InForce.tsx'
import { Band, DocList, GovFrame, Loading, nationDate, useLoad } from './shared.tsx'

// The front page of the government website: what is before whom, at this moment.
export function Today({ current }: { current: Current }) {
  const game = useGame()
  const government = current.government
  const key = `${current.id}:${current.state.day}:${current.state.timeline.length}`
  const newest = useLoad(`new:${key}`, () => game.archive({ limit: 8 }))
  const rulings = useLoad(`court:${key}`, () => game.archive({ series: 'court', limit: 5 }))
  const almanac = useLoad(`almanac:${key}`, async () => {
    const page = await game.archive({ series: 'almanac', limit: 1 })
    const head = page.documents[0]
    return head ? (await game.document(head.id)).document : null
  })

  const open = openDockets(government)
  const questions = government?.questions.filter((q) => q.status === 'open').length ?? 0
  const letters = government?.letters.filter((l) => l.status === 'unread').length ?? 0
  const unconfirmed = government?.words.filter((w) => !w.confirmed).length ?? 0
  const bills = government?.bills.filter((b) => b.stage !== 'law' && b.stage !== 'failed') ?? []
  const divisions = Object.values(government?.dockets ?? {})
    .flatMap((docket) => docket.sittings.map((sitting) => ({ docket, sitting })))
    .sort((a, b) => b.docket.number - a.docket.number)
    .slice(0, 5)
  const title = (dilemma: string) => game.content.dilemmas.find((d) => d.id === dilemma)?.title ?? dilemma

  return (
    <GovFrame
      current={current}
      here="today"
      title="Today"
      intro={<p>What is before the Founder, the bodies and {executiveTitle(government).replace(/^The /, 'the ')}, as the Archive has it now.</p>}
    >
      <dl className="gov-figures">
        <div>
          <dt>Documents in the library</dt>
          <dd>{newest.data ? newest.data.total.toLocaleString('en-GB') : '…'}</dd>
        </div>
        <div>
          <dt>Petitions open</dt>
          <dd>{open.length}</dd>
        </div>
        <div>
          <dt>Words of the Founder</dt>
          <dd>{government?.words.length ?? 0}</dd>
        </div>
        <div>
          <dt>Bills pending</dt>
          <dd>{bills.length}</dd>
        </div>
      </dl>

      <div className="gov-cols">
        <div>
          <Band title="The order of business">
            {open.length === 0 ? (
              <p className="gov-none">No petition is open. The bodies are between sittings.</p>
            ) : (
              <ol className="business">
                {open.map((docket) => (
                  <li key={docket.dilemma}>
                    <span className="business__n">#{docket.number}</span>
                    <span className="business__what">{title(docket.dilemma)}</span>
                    <span className="business__st small">
                      <Tag tone={docket.status === 'failed' ? 'bad' : docket.status === 'ready' ? 'good' : 'plain'}>
                        {STATUS_WORDS[docket.status]}
                      </Tag>{' '}
                      {docket.standing?.explanation ?? docket.progress.at(-1) ?? ''}{' '}
                      <TextLink to={docRoute(current.id, docket.document)}>The petition</TextLink>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p>
              <LinkTo to={{ name: 'nation', id: current.id, page: 'desk' }} size="small">
                To the desk
              </LinkTo>
            </p>
          </Band>

          <Band title="Latest divisions">
            {divisions.length === 0 ? (
              <p className="gov-none">No division is recorded among the open business.</p>
            ) : (
              <ul className="doclist">
                {divisions.map(({ docket, sitting }) => (
                  <li key={`${docket.dilemma}:${sitting.document}`} className="doclist__item">
                    <TextLink to={docRoute(current.id, sitting.document)} className="doclist__title">
                      {bodyName(government, sitting.body)} on Petition #{docket.number}
                    </TextLink>
                    <span className="doclist__meta small soft">{resultLine(sitting, executiveTitle(government))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Band>

          <Band title="Latest rulings">
            <Loading loaded={rulings} what="The rulings">
              {(page) => <DocList nation={current.id} heads={page.documents} government={government} empty="No ruling is reported yet." />}
            </Loading>
          </Band>

          <Band title="Bills">
            {bills.length === 0 ? (
              <p className="gov-none">No bill is before any body.</p>
            ) : (
              <ul className="doclist">
                {bills.map((bill) => (
                  <li key={bill.number} className="doclist__item">
                    {bill.document ? (
                      <TextLink to={docRoute(current.id, bill.document)} className="doclist__title">
                        Bill No. {bill.number}, {bill.title}
                      </TextLink>
                    ) : (
                      <span className="doclist__title">
                        Bill No. {bill.number}, {bill.title}
                      </span>
                    )}
                    <span className="doclist__meta small soft">
                      {BILL_STAGES[bill.stage]}. Moved by {bill.moved}.
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Band>
        </div>

        <div>
          <section className="founder-box" aria-labelledby="before-founder">
            <h2 id="before-founder">Before the Founder</h2>
            {questions + letters + unconfirmed === 0 ? (
              <p>Nothing is waiting for you.</p>
            ) : (
              <ul>
                {questions > 0 && <li>{questions === 1 ? 'One question' : `${questions} questions`} to answer</li>}
                {letters > 0 && <li>{letters === 1 ? 'One letter' : `${letters} letters`} unread</li>}
                {unconfirmed > 0 && <li>{unconfirmed === 1 ? 'One Word' : `${unconfirmed} Words`} not yet confirmed</li>}
              </ul>
            )}
            <LinkTo to={{ name: 'gov', id: current.id, page: 'founder' }} look="primary" size="small">
              The Founder’s page
            </LinkTo>
          </section>

          <Band title="The country">
            <Loading loaded={almanac} what="The almanac">
              {(doc) => {
                if (!doc) return <p className="gov-none">The almanac has not written a day yet. It writes one each evening.</p>
                const day = readAlmanac(doc.data)
                return (
                  <>
                    <p className="small soft">
                      From <TextLink to={docRoute(current.id, doc.id)}>{doc.title}</TextLink>, {doc.date || nationDate(government, doc.day)}.
                    </p>
                    {day.opinion && (
                      <blockquote className="gov-quote">
                        <p>{day.opinion}</p>
                      </blockquote>
                    )}
                    {day.press.length > 0 && (
                      <ul className="press">
                        {day.press.map((story, i) => (
                          <li key={i}>
                            <span className="press__paper small soft">{story.outlet}</span>
                            <span className="press__hl">{story.headline}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )
              }}
            </Loading>
          </Band>

          <Band title="Newest in the library">
            <Loading loaded={newest} what="The library">
              {(page) => <DocList nation={current.id} heads={page.documents} government={government} empty="The library is empty." />}
            </Loading>
          </Band>
        </div>
      </div>
    </GovFrame>
  )
}
