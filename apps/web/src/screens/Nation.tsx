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
  neighbourRows,
  ordinal,
  policyGroups,
  promiseRows,
  resourceLines,
  traitRows,
  type PolicyGroup,
} from '../logic/nation.ts'
import { pills, summary } from '../logic/summary.ts'
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
  const neighbours = useMemo(() => neighbourRows(state, content), [state, content])
  const resources = useMemo(() => resourceLines(state, content), [state, content])
  const glance = useMemo(() => pills(state), [state])
  const prose = useMemo(() => summary(state, content), [state, content])

  return (
    <Screen title={identity.name} kicker="The nation of" className="nation">
      <div className="nationhead">
        <Flag flag={identity.flag} className="nationhead__flag" label={`The flag of ${identity.name}`} />
        <p className="nationhead__class">{nationClass.name}</p>
        <p className="nationhead__motto">
          <q>{nationClass.description}</q>
        </p>
        <ul className="pills" aria-label="At a glance">
          {glance.map((pill) => (
            <li key={pill.id} className={`pill pill--${pill.tone}`}>
              <span className="pill__label">{pill.label}</span>
              <span className="pill__word">{pill.word}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="nationbody">
        <div className="nationbody__prose">
          {prose.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
        <aside className="infobox" aria-label={`${identity.name} at a glance`}>
          <h2 className="infobox__name">{identity.name}</h2>
          <Flag flag={identity.flag} className="infobox__flag" />
          <dl className="facts">
            <div>
              <dt>Capital</dt>
              <dd>{identity.capital}</dd>
            </div>
            <div>
              <dt>Leader</dt>
              <dd>{identity.leaderTitle}</dd>
            </div>
            <div>
              <dt>People</dt>
              <dd>{identity.demonym}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>{identity.currency}</dd>
            </div>
            <div>
              <dt>In office</dt>
              <dd>The {ordinal(state.government)} government</dd>
            </div>
            <div>
              <dt>Day</dt>
              <dd>{state.day}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <div className="nation__layout">
        <div className="nation__main">
          <Sheet title="How the country stands">
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

          <Sheet title="Support and the factions">
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

          {neighbours.length > 0 && (
            <Sheet title="The neighbours">
              <p className="small soft">
                {resources.short} {resources.spare} Relations run from hostile to close. Open a country to see
                what it wants and what it has.
              </p>
              <ul className="indicators">
                {neighbours.map((row) => (
                  <li key={row.id}>
                    <details className="fold fold--row">
                      <summary>
                        <Bar
                          label={row.name}
                          name={`Relations with ${row.name}`}
                          value={(row.standing + 100) / 2}
                          valueText={row.mood}
                          note={
                            row.treaties.length ? (
                              <span className="small">{row.treaties.join('; ')}</span>
                            ) : (
                              <span className="small soft">No treaty</span>
                            )
                          }
                        />
                      </summary>
                      <div className="fold__body small stack">
                        <p>{row.description}</p>
                        <p>
                          Led by {row.leader}. {row.wants} {row.offers}
                        </p>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </Sheet>
          )}
        </div>

        <div className="nation__side">
          {crisis && (
            <Sheet title={crisis.title} look="paper">
              <Meter label={crisis.gauge} value={crisis.value} />
              <p className="small soft">{crisis.note}</p>
            </Sheet>
          )}

          <Sheet title="The ministers">
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

          <Sheet title="What the country is known for">
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

          <Sheet title="What has been promised">
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

          <Sheet title="Consequences">
            <p className={hasPending(state) ? undefined : 'soft'}>
              {hasPending(state)
                ? 'Some decisions have not finished with the country yet. What they bring, and when, is not known.'
                : 'Nothing is known to be on its way.'}
            </p>
          </Sheet>
        </div>
      </div>

      <Sheet title="Policies" className="nation__policies">
        <div className="nation__groups">
          {policies.map((group) => (
            <Policies key={group.id} group={group} />
          ))}
        </div>
      </Sheet>
    </Screen>
  )
}
