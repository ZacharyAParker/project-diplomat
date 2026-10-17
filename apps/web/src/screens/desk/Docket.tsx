import type { Docket, GovernmentState, Review, Sitting } from '@diplomat/government'
import { useState } from 'react'
import {
  DECIDED_BY,
  SITTING_KINDS,
  bodyName,
  capitalise,
  courseLabel,
  divisionRows,
  executiveTitle,
  resultLine,
  splitWords,
  verdictWord,
  type CourseOption,
} from '../../logic/docket.ts'
import { STATUS_WORDS, isActive } from '../../logic/forms.ts'
import { docRoute } from '../../logic/router.ts'
import { Button, Notice, Tag, TextLink } from '../../ui/index.ts'

interface Shared {
  nation: string
  government: GovernmentState | null
  options: readonly CourseOption[]
}

function DocLink({ nation, doc, children }: { nation: string; doc: string; children: string }) {
  if (!doc) return null
  return (
    <TextLink to={docRoute(nation, doc)} className="small">
      {children}
    </TextLink>
  )
}

const without = (ai: boolean) => (ai ? null : <span className="soft"> (sat without the AI)</span>)

export function DivisionTable({ sitting, government, caption }: { sitting: Sitting; government: GovernmentState | null; caption: string }) {
  const body = government?.institutions.bodies.find((b) => b.id === sitting.body)
  const rows = divisionRows(sitting, body)
  const { aye, no, abstain } = sitting.division
  return (
    <div className="gov-table">
      <table>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Party</th>
            <th scope="col" className="num">
              Aye
            </th>
            <th scope="col" className="num">
              No
            </th>
            <th scope="col" className="num">
              Abstain
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.party}>
              <th scope="row">
                <span className="swatch" style={{ background: row.colour }} aria-hidden="true" />
                {row.name}
              </th>
              <td className="num">{row.aye}</td>
              <td className="num">{row.no}</td>
              <td className="num">{row.abstain}</td>
            </tr>
          ))}
          <tr className="gov-table__total">
            <th scope="row">The whole {body?.shortName.replace(/^the /, '') ?? 'body'}</th>
            <td className="num">{aye}</td>
            <td className="num">{no}</td>
            <td className="num">{abstain}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function SittingView({ sitting, nation, government, options }: Shared & { sitting: Sitting }) {
  const who = bodyName(government, sitting.body)
  return (
    <section className="docket__part">
      <h5 className="docket__part-title">
        {who}: {SITTING_KINDS[sitting.kind].toLowerCase()}
        {without(sitting.ai)}
      </h5>
      <p className="docket__result">
        <Tag tone={sitting.carried ? 'good' : 'plain'}>{sitting.carried ? (sitting.binding ? 'Binding' : 'Carried') : 'Not carried'}</Tag>{' '}
        {courseLabel(sitting.firstPreference, options)} first. {resultLine(sitting, executiveTitle(government))}
      </p>
      <p className="small">
        <span className="soft">In order of preference: </span>
        {sitting.ladder.map((course) => courseLabel(course, options)).join(', then ')}.
      </p>
      <DivisionTable sitting={sitting} government={government} caption={`How ${who} divided, by party`} />
      {sitting.remonstrance && (
        <p className="small">
          <span className="soft">It moved a remonstrance: </span>
          {sitting.remonstrance}
        </p>
      )}
      {sitting.address && (
        <p className="small">
          <span className="soft">It moved an address: </span>
          {sitting.address}
        </p>
      )}
      <DocLink nation={nation} doc={sitting.document}>
        The debate in Hansard
      </DocLink>
    </section>
  )
}

function ReviewView({ review, nation, government, options }: Shared & { review: Review }) {
  const body = government?.institutions.bodies.find((b) => b.id === review.body)
  const who = bodyName(government, review.body)
  const members = body?.members ?? []
  const voters = [...new Set(review.rulings.flatMap((r) => Object.keys(r.votes)))]
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id
  return (
    <section className="docket__part">
      <h5 className="docket__part-title">
        {who}: {review.kind === 'first' ? 'its ruling' : 'its reply'}
        {without(review.ai)}
      </h5>
      {!review.binding && <p className="small soft">This ruling is advice. Nothing it says against a course closes it.</p>}
      <ul className="rulings">
        {review.rulings.map((ruling) => (
          <li key={ruling.course}>
            <span className="rulings__course">{courseLabel(ruling.course, options)}</span>{' '}
            <Tag tone={ruling.verdict === 'permitted' ? 'good' : 'bad'}>{verdictWord(ruling, review)}</Tag>{' '}
            <span className="small">{splitWords(ruling)}</span>
            {ruling.articles.length > 0 && <span className="small soft">. Under {ruling.articles.join(', ')}</span>}
            {ruling.markers.length > 0 && (
              <ul className="small rulings__markers">
                {ruling.markers.map((marker) => (
                  <li key={marker}>Only if {marker.replace(/^only if /i, '')}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {voters.length > 0 && (
        <details className="fold">
          <summary>How each member voted</summary>
          <div className="gov-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  {review.rulings.map((r) => (
                    <th key={r.course} scope="col">
                      {courseLabel(r.course, options)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {voters.map((id) => (
                  <tr key={id}>
                    <th scope="row">{nameOf(id)}</th>
                    {review.rulings.map((r) => (
                      <td key={r.course}>{r.votes[id] === 'bar' ? 'Bar' : r.votes[id] === 'permit' ? 'Permit' : 'Did not sit'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {review.cautions.length > 0 && (
        <ul className="small">
          {review.cautions.map((c) => (
            <li key={c}>Caution: {c}</li>
          ))}
        </ul>
      )}
      {review.directions.length > 0 && (
        <ul className="small">
          {review.directions.map((d) => (
            <li key={d}>Direction: {d}</li>
          ))}
        </ul>
      )}
      <DocLink nation={nation} doc={review.document}>
        The opinion in full
      </DocLink>
    </section>
  )
}

export interface DocketViewProps extends Shared {
  docket: Docket
  // Restarts a docket that could not be heard.
  onConvene?(): Promise<void>
}

// One petition as it moves through the bodies: what is happening now, then everything they
// have said, then what the rules leave the executive free to do.
export function DocketView({ docket, nation, government, options, onConvene }: DocketViewProps) {
  const [convening, setConvening] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const active = isActive(docket.status)
  const shared = { nation, government, options }

  async function convene() {
    if (!onConvene) return
    setConvening(true)
    setProblem(null)
    try {
      await onConvene()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'It could not be convened.')
    } finally {
      setConvening(false)
    }
  }

  return (
    <section className="docket" aria-label={`Petition #${docket.number} before the bodies`}>
      <h4 className="issue__section">Before the bodies</h4>
      <p className="docket__status">
        <span className="label">Petition #{docket.number}</span>{' '}
        <Tag tone={docket.status === 'failed' ? 'bad' : docket.status === 'ready' || docket.status === 'decided' ? 'good' : 'plain'}>
          {STATUS_WORDS[docket.status]}
        </Tag>
      </p>

      {docket.progress.length > 0 && (
        <ol className="docket__progress small" aria-live={active ? 'polite' : undefined}>
          {docket.progress.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      )}

      {docket.status === 'failed' && (
        <Notice
          tone="problem"
          title="The bodies could not be heard"
          actions={
            onConvene && (
              <Button size="small" look="primary" onClick={() => void convene()} disabled={convening} aria-busy={convening}>
                {convening ? 'Convening' : 'Convene again'}
              </Button>
            )
          }
        >
          <p>{docket.error ?? 'Something went wrong while they sat.'} Convening again starts the sitting from the top.</p>
          {problem && <p>{problem}</p>}
        </Notice>
      )}

      {docket.standing && (
        <p className="docket__standing">
          <strong>Where it stands. </strong>
          {docket.standing.explanation}
        </p>
      )}

      {docket.decision && (
        <div className="docket__decision">
          <p>
            <strong>Decided {DECIDED_BY[docket.decision.by]}: </strong>
            {courseLabel(docket.decision.course, options)}.{docket.decision.reasons && ` ${docket.decision.reasons}`}
          </p>
          {docket.decision.veto && (
            <p className="small">
              It set aside {courseLabel(docket.decision.veto.course, options)}, for these reasons: {docket.decision.veto.reasons}
            </p>
          )}
          {docket.decision.word && (
            <blockquote className="small">
              <p>{docket.decision.word}</p>
            </blockquote>
          )}
        </div>
      )}

      {docket.advice.length > 0 && (
        <details className="fold">
          <summary>The ministries’ advice ({docket.advice.length})</summary>
          <ul className="plain-list docket__advice">
            {docket.advice.map((advice) => (
              <li key={advice.body}>
                <p>
                  <strong>{capitalise(bodyName(government, advice.body))}</strong>
                  {without(advice.ai)}
                  {advice.favours && <span className="small soft"> favours {courseLabel(advice.favours, options)}</span>}
                </p>
                <p className="small">{advice.summary}</p>
                {advice.costing && <p className="small soft">Costing: {advice.costing}</p>}
                <DocLink nation={nation} doc={advice.document}>
                  The paper
                </DocLink>
              </li>
            ))}
          </ul>
        </details>
      )}

      {docket.sittings.map((sitting, i) => (
        <details key={`s${i}`} className="fold" open={i === docket.sittings.length - 1 && docket.status !== 'decided'}>
          <summary>
            {capitalise(bodyName(government, sitting.body, true))}: {sitting.carried ? 'carried' : 'did not carry'}{' '}
            {courseLabel(sitting.firstPreference, options)}
          </summary>
          <SittingView sitting={sitting} {...shared} />
        </details>
      ))}

      {docket.reviews.map((review, i) => {
        const barred = review.rulings.filter((r) => r.verdict === 'barred').length
        return (
          <details key={`r${i}`} className="fold" open={barred > 0 && docket.status !== 'decided'}>
            <summary>
              {capitalise(bodyName(government, review.body, true))}:{' '}
              {barred === 0
                ? 'every course permitted'
                : `${barred === 1 ? 'one course' : `${barred} courses`} ${review.binding ? 'barred' : 'advised against'}`}
            </summary>
            <ReviewView review={review} {...shared} />
          </details>
        )
      })}

      {docket.exchanges.length > 0 && (
        <details className="fold">
          <summary>Between the bodies ({docket.exchanges.length})</summary>
          <ul className="plain-list">
            {docket.exchanges.map((exchange, i) => (
              <li key={i}>
                <p className="small">
                  <strong>{capitalise(bodyName(government, exchange.from))}</strong> to {bodyName(government, exchange.to)}, a{' '}
                  {exchange.kind}:
                </p>
                <p className="small">{exchange.text}</p>
                <DocLink nation={nation} doc={exchange.document}>
                  In full
                </DocLink>
              </li>
            ))}
          </ul>
        </details>
      )}

      {docket.assents.map((assent, i) => (
        <p key={`a${i}`} className="small">
          {capitalise(bodyName(government, assent.body))} {assent.given ? 'gave its assent' : 'withheld its assent'}
          {assent.reasons && `: ${assent.reasons}`}
        </p>
      ))}
    </section>
  )
}
