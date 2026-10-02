import type { Change, Content } from '@diplomat/engine'
import { useMemo } from 'react'
import { describe, percent } from '../logic/changes.ts'
import {
  cabinetRows,
  crisisRow,
  deadline,
  factionRows,
  hasPending,
  indicatorRows,
  ordinal,
  policyGroups,
  promiseRows,
  traitRows,
  type PolicyGroup,
} from '../logic/nation.ts'
import { useGame, type Current } from '../store/game.tsx'
import { Bar, Flag, Meter, Screen, Sheet, Spark, Tag } from '../ui/index.ts'

// The move since yesterday morning, in the same words as any other change.
function Since({ change, content }: { change: Change | null; content: Content }) {
  if (!change) return <span className="since soft">No change since yesterday</span>
  const d = describe(change, content)
  return (
    <span className={`since since--${d.tone}`}>
      {d.movement.charAt(0).toUpperCase() + d.movement.slice(1)} since yesterday
      {d.verdict && `, ${d.verdict}`}
    </span>
  )
}

function Policies({ group }: { group: PolicyGroup }) {
  const list = (
    <ul className="policies">
      {group.policies.map((policy) => (
        <li key={policy.id}>
          <span className="policies__name">
            {policy.name}
            {policy.level !== undefined && <span className="figures">: {policy.level}</span>}
          </span>
          <span className="small soft">{policy.description}</span>
        </li>
      ))}
    </ul>
  )
  if (group.id === 'off') {
    return (
      <details className="fold">
        <summary>
          <span className="label">{group.label}</span>{' '}
          <span className="small soft">({group.policies.length})</span>
        </summary>
        {list}
      </details>
    )
  }
  return (
    <section className="nation__group">
      <h3 className="label">{group.label}</h3>
      <p className="small soft">{group.note}</p>
      {list}
    </section>
  )
}

export function Nation({ current }: { current: Current }) {
  const { content } = useGame()
  const { state, history, nationClass } = current
  const { identity } = state

  const indicators = useMemo(() => indicatorRows(state, history), [state, history])
  const factions = useMemo(() => factionRows(state, content, history), [state, content, history])
  const cabinet = useMemo(() => cabinetRows(state, content), [state, content])
  const policies = useMemo(() => policyGroups(state, content), [state, content])
  const traits = useMemo(() => traitRows(state, content), [state, content])
  const promises = useMemo(() => promiseRows(state, content), [state, content])
  const crisis = useMemo(() => crisisRow(state, content), [state, content])

  return (
    <Screen title="The nation" kicker={`${identity.name}, day ${state.day}`} className="nation">
      <div className="nation__head">
        <Flag flag={identity.flag} width="min(100%, 13rem)" label={`The flag of ${identity.name}`} />
        <div className="nation__class stack">
          <Sheet kicker="What the world makes of it" title={nationClass.name}>
            <p className="lede">{nationClass.description}</p>
          </Sheet>
          <dl className="facts">
            <div>
              <dt className="label soft">Capital</dt>
              <dd>{identity.capital}</dd>
            </div>
            <div>
              <dt className="label soft">People</dt>
              <dd>{identity.demonym}</dd>
            </div>
            <div>
              <dt className="label soft">Currency</dt>
              <dd>{identity.currency}</dd>
            </div>
            <div>
              <dt className="label soft">In office</dt>
              <dd>
                The {ordinal(state.government)} government, under its {identity.leaderTitle}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="nation__layout">
        <div className="nation__main">
          <Sheet kicker="The numbers" title="How the country stands">
            <p className="small soft">
              Each runs from 0 to 100. The red notch is where it stood yesterday morning. Open one to see what
              it measures.
            </p>
            <ul className="indicators">
              {indicators.map((row) => (
                <li key={row.id}>
                  <details className="fold fold--row">
                    <summary>
                      <Bar
                        label={row.name}
                        value={row.value}
                        was={row.was ?? undefined}
                        note={
                          <>
                            <Since change={row.since} content={content} />
                            <Spark values={row.trend} />
                          </>
                        }
                      />
                    </summary>
                    <p className="fold__body small">
                      {row.description}{' '}
                      {row.lowerIsBetter
                        ? 'Lower is better here: a shorter bar is good news.'
                        : 'Higher is better.'}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          </Sheet>

          <Sheet kicker="Who is with you" title="Support and the factions">
            <div className="measure">
              <Meter
                label="Support"
                value={current.support}
                valueText={percent(current.support)}
                hint="Every faction's approval, weighed by how much of the country it speaks for. This is the figure the election is fought on."
              />
            </div>
            <ul className="indicators">
              {factions.map((row) => (
                <li key={row.id}>
                  <details className="fold fold--row">
                    <summary>
                      <Bar
                        label={row.name}
                        value={row.approval}
                        was={row.was ?? undefined}
                        note={
                          <>
                            <Since change={row.since} content={content} />
                            <Spark values={row.trend} />
                          </>
                        }
                      />
                    </summary>
                    <p className="fold__body small">
                      {row.description} It carries {row.share}% of the weight in the support figure.
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          </Sheet>
        </div>

        <div className="nation__side">
          {crisis && (
            <Sheet kicker="A crisis is running" title={crisis.title} look="paper">
              <Meter label={crisis.gauge} value={crisis.value} />
              <p className="small soft">{crisis.note}</p>
            </Sheet>
          )}

          <Sheet kicker="Cabinet" title="The ministers">
            <p className="small soft">
              Standing is how secure each one is. A minister who runs out of it resigns.
            </p>
            <ul className="indicators">
              {cabinet.map((row) => (
                <li key={row.id}>
                  <Bar
                    label={
                      <>
                        <span className="cabinet__name">{row.name}</span>
                        <span className="small soft">{row.title}</span>
                      </>
                    }
                    name={`${row.title} ${row.name}, standing`}
                    value={row.standing}
                    note={row.shaky ? <Tag tone="bad">Close to resigning</Tag> : undefined}
                  />
                </li>
              ))}
            </ul>
          </Sheet>

          <Sheet kicker="Reputation" title="What the country is known for">
            {traits.length === 0 ? (
              <p className="soft">Nothing yet. It takes a while to become known for something.</p>
            ) : (
              <ul className="plain-list">
                {traits.map((trait) => (
                  <li key={trait.id}>
                    <h3>{trait.name}</h3>
                    <p>{trait.description}</p>
                    {trait.opposes && <p className="small soft">{trait.opposes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Sheet>

          <Sheet kicker="Promises" title="What has been promised">
            {promises.length === 0 ? (
              <p className="soft">No promises are outstanding.</p>
            ) : (
              <ul className="plain-list">
                {promises.map((promise) => (
                  <li key={promise.id}>
                    <p>{promise.text}</p>
                    <p className="label soft">{deadline(promise.daysLeft)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Sheet>

          <Sheet kicker="Still to come" title="Consequences">
            <p className={hasPending(state) ? undefined : 'soft'}>
              {hasPending(state)
                ? 'Some decisions have not finished with the country yet. What they bring, and when, is not known.'
                : 'Nothing is known to be on its way.'}
            </p>
          </Sheet>
        </div>
      </div>

      <Sheet kicker="The law as it stands" title="Policies" className="nation__policies">
        <div className="nation__groups">
          {policies.map((group) => (
            <Policies key={group.id} group={group} />
          ))}
        </div>
      </Sheet>
    </Screen>
  )
}
