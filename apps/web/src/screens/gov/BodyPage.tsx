import type { Body, Docket, GovernmentState, Review } from '@diplomat/government'
import { capitalise, courseLabel, executiveTitle, safeHex, splitWords, verdictWord } from '../../logic/docket.ts'
import { docRoute } from '../../logic/router.ts'
import { useGame, type Current } from '../../store/game.tsx'
import { HemicycleChart } from '../../ui/Hemicycle.tsx'
import { LinkTo, TextLink } from '../../ui/index.ts'
import { DivisionTable } from '../desk/Docket.tsx'
import { Band, GovFrame } from './shared.tsx'

function share(seats: number, total: number): string {
  return total ? `${Math.round((seats / total) * 1000) / 10}%` : ''
}

function Legislature({ body, current }: { body: Body; current: Current }) {
  const game = useGame()
  const government = current.government
  const total = body.parties.reduce((sum, p) => sum + p.seats, 0)
  const step = government?.institutions.constitution.rules.steps.find((s) => s.body === body.id && s.role === 'recommend')
  const carry = step?.carryAt !== undefined ? Math.floor(body.size * step.carryAt) + 1 : null
  const bind = step?.bindAt !== undefined ? Math.ceil(body.size * step.bindAt - 1e-9) : null
  const executive = executiveTitle(government).replace(/^The /, 'the ')
  const note = [carry && `${carry} carry a question`, bind && `${bind} bind ${executive}`].filter(Boolean).join(', ')
  const partyName = (id: string) => body.parties.find((p) => p.id === id)?.name ?? id
  const sittings = Object.values(government?.dockets ?? {})
    .flatMap((docket) => docket.sittings.filter((s) => s.body === body.id).map((sitting) => ({ docket, sitting })))
    .sort((a, b) => b.docket.number - a.docket.number)
  const title = (dilemma: string) => game.content.dilemmas.find((d) => d.id === dilemma)?.title ?? dilemma
  const options = (docket: Docket) => game.content.dilemmas.find((d) => d.id === docket.dilemma)?.options ?? []
  const bills = government?.bills.filter((b) => b.body === body.id) ?? []

  return (
    <>
      <Band title="Seats">
        <div className="seats">
          <HemicycleChart name={body.name} parties={body.parties} note={note} />
          <div className="gov-table">
            <table>
              <caption className="visually-hidden">The parties and their seats</caption>
              <thead>
                <tr>
                  <th scope="col">Party</th>
                  <th scope="col" className="num">
                    Seats
                  </th>
                  <th scope="col" className="num">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {body.parties.map((party) => (
                  <tr key={party.id}>
                    <th scope="row">
                      <span className="swatch" style={{ background: safeHex(party.colour) }} aria-hidden="true" />
                      {party.name}
                    </th>
                    <td className="num">{party.seats}</td>
                    <td className="num">{share(party.seats, total)}</td>
                  </tr>
                ))}
                <tr className="gov-table__total">
                  <th scope="row">Every party</th>
                  <td className="num">{total}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        {note && <p className="small soft">Of {body.size} members, {note}.</p>}
      </Band>

      <Band title="The parties">
        {body.parties.length === 0 ? (
          <p className="gov-none">It sits without parties.</p>
        ) : (
          <ul className="parties">
            {body.parties.map((party) => (
              <li key={party.id} className="party">
                <div>
                  <h3>
                    <span className="swatch" style={{ background: safeHex(party.colour) }} aria-hidden="true" />
                    {party.name}
                  </h3>
                  <p className="party__seats">
                    {party.seats} <span className="small soft">{party.seats === 1 ? 'seat' : 'seats'}</span>
                  </p>
                </div>
                <dl>
                  <dt>Leader</dt>
                  <dd>{party.leader}</dd>
                  {party.nickname && (
                    <>
                      <dt>Known as</dt>
                      <dd>{party.nickname}</dd>
                    </>
                  )}
                  <dt>What it wants</dt>
                  <dd>{party.description}</dd>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Band>

      <Band title="Members">
        {body.members.length === 0 ? (
          <p className="gov-none">No member is named in the record.</p>
        ) : (
          <div className="gov-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Party</th>
                  <th scope="col">Office</th>
                </tr>
              </thead>
              <tbody>
                {body.members.map((member) => (
                  <tr key={member.id}>
                    <th scope="row">{member.name}</th>
                    <td>{member.party ? partyName(member.party) : ''}</td>
                    <td>{member.office ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Band>

      <Band title="Divisions">
        {sittings.length === 0 && bills.every((b) => b.divisions.length === 0) ? (
          <p className="gov-none">No division is recorded among the open business.</p>
        ) : (
          <>
            {sittings.map(({ docket, sitting }) => (
              <section key={`${docket.dilemma}:${sitting.document}`} className="gov-division">
                <h3>
                  Petition #{docket.number}, {title(docket.dilemma)}
                </h3>
                <p className="small">
                  {courseLabel(sitting.firstPreference, options(docket))} first: {sitting.carried ? (sitting.binding ? 'carried, and binding' : 'carried') : 'not carried'}.{' '}
                  <TextLink to={docRoute(current.id, sitting.document)}>Hansard</TextLink>
                </p>
                <DivisionTable sitting={sitting} government={government} caption={`Division on Petition #${docket.number}, by party`} />
              </section>
            ))}
            {bills.flatMap((bill) =>
              bill.divisions.map((d, i) => (
                <p key={`${bill.number}:${i}`} className="small">
                  Bill No. {bill.number}, {bill.title}, {d.reading}: {d.aye} to {d.no}, {d.abstain} abstaining.
                </p>
              )),
            )}
          </>
        )}
        <p>
          <LinkTo to={{ name: 'gov', id: current.id, page: 'library', query: { issuer: body.name } }} size="small">
            Everything it has issued
          </LinkTo>
        </p>
      </Band>
    </>
  )
}

function reviewsBy(government: GovernmentState | null, body: string): { docket: Docket; review: Review }[] {
  return Object.values(government?.dockets ?? {})
    .flatMap((docket) => docket.reviews.filter((r) => r.body === body).map((review) => ({ docket, review })))
    .sort((a, b) => b.docket.number - a.docket.number)
}

function Bench({ body, current }: { body: Body; current: Current }) {
  const game = useGame()
  const government = current.government
  const reviews = reviewsBy(government, body.id)
  const title = (dilemma: string) => game.content.dilemmas.find((d) => d.id === dilemma)?.title ?? dilemma
  const options = (docket: Docket) => game.content.dilemmas.find((d) => d.id === docket.dilemma)?.options ?? []
  return (
    <>
      <Band title="The members">
        {body.members.length === 0 ? (
          <p className="gov-none">No member is named in the record.</p>
        ) : (
          <ul className="bench">
            {body.members.map((member) => (
              <li key={member.id} className="justice">
                <h3>{member.name}</h3>
                {member.office && <p className="justice__role small soft">{member.office}</p>}
                <p>{member.character}</p>
                {member.philosophy && (
                  <dl>
                    <dt>Reads the law</dt>
                    <dd>{member.philosophy}</dd>
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}
      </Band>
      <Band title="How they have split">
        {reviews.length === 0 ? (
          <p className="gov-none">No ruling is recorded among the open business.</p>
        ) : (
          reviews.map(({ docket, review }) => (
            <section key={`${docket.dilemma}:${review.document}`} className="gov-division">
              <h3>
                Petition #{docket.number}, {title(docket.dilemma)}
              </h3>
              <div className="gov-table">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Course</th>
                      <th scope="col">Ruling</th>
                      {body.members.map((m) => (
                        <th key={m.id} scope="col" className="gov-vote">
                          {m.name.replace(/^Justice /, '')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {review.rulings.map((ruling) => (
                      <tr key={ruling.course}>
                        <th scope="row">{courseLabel(ruling.course, options(docket))}</th>
                        <td>
                          {verdictWord(ruling, review)}, {splitWords(ruling)}
                        </td>
                        {body.members.map((m) => (
                          <td key={m.id} className="gov-vote">
                            {ruling.votes[m.id] === 'bar' ? 'Bar' : ruling.votes[m.id] === 'permit' ? 'Permit' : '–'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small">
                <TextLink to={docRoute(current.id, review.document)}>The opinion</TextLink>
                {!review.binding && <span className="soft"> Advice only: it binds nobody.</span>}
              </p>
            </section>
          ))
        )}
        <p>
          <LinkTo to={{ name: 'gov', id: current.id, page: 'library', query: { issuer: body.name } }} size="small">
            Everything it has issued
          </LinkTo>
        </p>
      </Band>
    </>
  )
}

// One body of the government: a legislature with its seats, parties and divisions, or a
// court or council with its members and how they have split.
export function BodyPage({ current, bodyId }: { current: Current; bodyId: string }) {
  const body = current.government?.institutions.bodies.find((b) => b.id === bodyId)
  return (
    <GovFrame
      current={current}
      here={`body:${bodyId}`}
      title={body?.name ?? 'No such body'}
      intro={body ? <p>{body.description}</p> : undefined}
    >
      {!body ? (
        <p className="gov-none">This government has no body by that name. It may have been abolished, or never existed.</p>
      ) : body.kind === 'legislature' || body.parties.length > 0 ? (
        <Legislature body={body} current={current} />
      ) : body.kind === 'court' || body.kind === 'council' ? (
        <Bench body={body} current={current} />
      ) : (
        <Band title="Who it is">
          <p>
            {capitalise(body.shortName)} has {body.size === 1 ? 'one member' : `${body.size} members`}.
          </p>
        </Band>
      )}
    </GovFrame>
  )
}
