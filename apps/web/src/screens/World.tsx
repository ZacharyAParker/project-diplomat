import { HOME, homeStrength, type WorldAction } from '@diplomat/engine'
import { useMemo, useState } from 'react'
import { assemblyView, councilView, matterViews, nationRows, strengthWord, warViews, worldNews, type MatterView, type NationRow, type PastMotion } from '../logic/world.ts'
import { useGame, type Current } from '../store/game.tsx'
import { Bar, Button, Notice, Screen, Sheet, Tag, useAnnounce } from '../ui/index.ts'
import { WorldMap } from './WorldMap.tsx'
import { ProposalForm } from './WorldProposal.tsx'

// The world beyond the borders: foreign matters to decide, the player's wars, the Assembly
// of Nations, and every other nation, with what the player may do about each.
export function World({ current }: { current: Current }) {
  const game = useGame()
  const announce = useAnnounce()
  const { content } = game
  const { state } = current
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const matters = useMemo(() => matterViews(state, content), [state, content])
  const wars = useMemo(() => warViews(state, content), [state, content])
  const assembly = useMemo(() => assemblyView(state, content), [state, content])
  const council = useMemo(() => councilView(state, content), [state, content])
  const rows = useMemo(() => nationRows(state, content), [state, content])
  const news = useMemo(() => worldNews(state), [state])

  if (!state.world) {
    return (
      <Screen title="The world" kicker={state.identity.name}>
        <Notice>
          <p>This pack has no world beyond the borders.</p>
        </Notice>
      </Screen>
    )
  }
  const world = state.world

  async function run(what: string, act: () => Promise<string | void>) {
    if (busy) return
    setBusy(true)
    try {
      const said = await act()
      setProblem(null)
      announce(said || what)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'the server refused')
    } finally {
      setBusy(false)
    }
  }

  const acting = (action: WorldAction, what: string) =>
    run(what, async () => {
      const vote = await game.worldAct(action)
      if (vote && !vote.carried) return `${vote.body} refused, ${vote.aye} to ${vote.no}.`
      return vote ? `${vote.body} agreed, ${vote.aye} to ${vote.no}. ${what}` : what
    })

  // A nation picked on the map: its row below is opened and brought into view.
  function pick(id: string) {
    const target = id === HOME ? document.querySelector<HTMLElement>('.world__army') : document.getElementById(`nation-${id}`)
    if (!target) return
    const details = target.querySelector('details')
    if (details) details.open = true
    target.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    ;(target.querySelector('summary') ?? target).focus?.()
  }

  const near = rows.filter((r) => r.near)
  const far = rows.filter((r) => !r.near)

  return (
    <Screen
      title="The world"
      kicker={`${state.identity.name}, day ${state.day}`}
      intro="Twenty other nations, each with its own interests. They act once a week, quarrel, ally, go to war, and sit together in the Assembly of Nations."
      className="world"
    >
      {problem && (
        <Notice tone="problem" title="Not done">
          <p>{problem}</p>
        </Notice>
      )}

      <WorldMap state={state} content={content} onPick={pick} />

      <Sheet title="Foreign matters" kicker={matters.length ? `${matters.length} waiting` : 'Nothing waiting'}>
        {matters.length === 0 ? (
          <p className="soft">No foreign government is waiting on an answer.</p>
        ) : (
          <ul className="stack world__matters">
            {matters.map((m) => (
              <li key={m.id}>
                <MatterCardView matter={m} busy={busy} onChoose={(option, label) => run(`${label}: done.`, () => game.decideMatter(m.id, option))} />
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      {wars.ours.length > 0 && (
        <Sheet title="At war" kicker={world.home.mobilised ? 'Mobilised' : 'Not mobilised'}>
          <ul className="stack">
            {wars.ours.map((war) => (
              <li key={war.id} className="stack world__war">
                <p>
                  <strong>{war.title}</strong>, week {war.week}. {war.front}
                </p>
                {war.with && war.with.length > 0 && <p className="small">Beside you: {war.with.join(', ')}.</p>}
                {war.weariness && (
                  <>
                    <Bar label="Your side’s war-weariness" value={war.weariness.ours} valueText={`${Math.round(war.weariness.ours)} of 100`} />
                    <Bar label="Theirs" value={war.weariness.theirs} valueText={`${Math.round(war.weariness.theirs)} of 100`} />
                  </>
                )}
                <p>
                  <Button size="small" disabled={busy} onClick={() => void acting({ peace: war.id }, 'Peace was offered.')}>
                    Sue for peace
                  </Button>
                </p>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      <Sheet title="The army" kicker={strengthWord(homeStrength(state))} className="world__army">
        <p>
          {state.identity.name}’s army is {strengthWord(homeStrength(state)).toLowerCase()}, on the strength of the
          economy, the state behind it and the government’s legitimacy.
          {world.home.lost > 0 && ` ${world.home.lost === 1 ? 'One borderland has' : `${world.home.lost} borderlands have`} been lost to neighbours.`}
        </p>
        <p>
          {world.home.mobilised ? (
            <Button size="small" disabled={busy} onClick={() => void acting({ mobilise: false }, 'The army stands down.')}>
              Stand the army down
            </Button>
          ) : (
            <Button size="small" disabled={busy} onClick={() => void acting({ mobilise: true }, 'The reserves are called up.')}>
              Mobilise
            </Button>
          )}
        </p>
        <p className="small soft">Mobilising makes the army much stronger, costs money every week, and alarms the neighbours.</p>
      </Sheet>

      {assembly && (
        <Sheet title="The Assembly of Nations" kicker={assembly.member ? `Member, sits on day ${assembly.next}` : 'Not a member'}>
          {assembly.motion && (
            <p>
              Before it next: <strong>{assembly.motion}</strong>.
            </p>
          )}
          {assembly.sanctions.length > 0 && <p className="small">Under its sanctions: {assembly.sanctions.join(', ')}.</p>}
          {assembly.past.length > 0 && <Resolutions past={assembly.past} nation={state.identity.name} />}
          {assembly.mine ? (
            <Notice title="Your motion">
              <p>
                {assembly.mine.title.charAt(0).toUpperCase() + assembly.mine.title.slice(1)}, to be taken {assembly.mine.when}.
                {assembly.mine.text && ` “${assembly.mine.text}”`}
              </p>
            </Notice>
          ) : (
            assembly.member && <ProposalForm state={state} content={content} body="assembly" busy={busy} onPropose={(p) => void acting({ propose: p }, 'The motion is put down.')} />
          )}
          <p>
            <Button size="small" look="quiet" disabled={busy} onClick={() => void acting({ assembly: assembly.member ? 'leave' : 'join' }, assembly.member ? 'Left the Assembly.' : 'Rejoined the Assembly.')}>
              {assembly.member ? 'Leave the Assembly' : 'Rejoin the Assembly'}
            </Button>
          </p>
        </Sheet>
      )}

      {council && (
        <Sheet title="The Security Council" kicker={council.member ? (council.permanent ? 'Permanent member, with a veto' : 'Elected member') : `Next election on day ${council.election}`}>
          <p className="small soft">Five permanent members, each with a veto, and four elected by the Assembly for six months. Its resolutions bind: five votes and no veto carry one.</p>
          <ul className="small world__seats">
            {council.seats.map((seat) => (
              <li key={seat.id}>
                <strong>{seat.you ? `${seat.name} (you)` : seat.name}</strong>
                {seat.permanent ? <Tag tone="accent">Permanent</Tag> : <span className="soft"> until day {seat.until}</span>}
              </li>
            ))}
          </ul>
          {council.motion && (
            <p>
              Sits on day {council.next}: <strong>{council.motion}</strong>.
            </p>
          )}
          {council.past.length > 0 && <Resolutions past={council.past} nation={state.identity.name} />}
          {council.member ? (
            council.mine ? (
              <Notice title="Your resolution">
                <p>
                  {council.mine.title.charAt(0).toUpperCase() + council.mine.title.slice(1)}, to be taken {council.mine.when}.
                  {council.mine.text && ` “${council.mine.text}”`}
                </p>
              </Notice>
            ) : (
              <ProposalForm state={state} content={content} body="council" busy={busy} onPropose={(p) => void acting({ propose: p }, 'The resolution is put to the Council.')} />
            )
          ) : council.standing ? (
            <p className="small">{state.identity.name} is standing for a seat. The Assembly votes on day {council.election}.</p>
          ) : (
            assembly?.member && (
              <p>
                <Button size="small" disabled={busy} onClick={() => void acting({ council: 'stand' }, 'Standing for the Security Council.')}>
                  Stand for a seat
                </Button>
              </p>
            )
          )}
        </Sheet>
      )}

      <Sheet title="On the border">
        <NationList rows={near} busy={busy} onAct={acting} />
      </Sheet>
      <Sheet title="Further off">
        <NationList rows={far} busy={busy} onAct={acting} />
      </Sheet>

      {wars.elsewhere.length > 0 && (
        <Sheet title="Wars elsewhere">
          <ul className="small stack">
            {wars.elsewhere.map((war) => (
              <li key={war.id}>
                {war.title}, week {war.week}. {war.front}
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      <Sheet title="Lately, abroad">
        {news.length === 0 ? (
          <p className="soft">A quiet few weeks beyond the borders.</p>
        ) : (
          <ul className="small stack">
            {news.map((item, i) => (
              <li key={`${item.day}-${i}`}>
                <span className="soft">Day {item.day}.</span> {item.text}
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </Screen>
  )
}

function Resolutions({ past, nation }: { past: PastMotion[]; nation: string }) {
  return (
    <ul className="small stack world__resolutions">
      {past.map((m) => (
        <li key={m.id}>
          {m.title}
          {m.mine && <span className="soft"> ({nation}’s)</span>}:{' '}
          <Tag tone={m.passed ? 'good' : m.vetoed.length ? 'bad' : 'plain'}>{m.passed ? 'carried' : m.vetoed.length ? 'vetoed' : 'defeated'}</Tag> {m.ayes} to {m.noes}
          {m.vetoed.length > 0 && `, vetoed by ${m.vetoed.join(' and ')}`}
          {m.ours ? `. ${nation} voted ${m.ours}.` : '.'}
        </li>
      ))}
    </ul>
  )
}

function MatterCardView({ matter, busy, onChoose }: { matter: MatterView; busy: boolean; onChoose(option: string, label: string): void }) {
  return (
    <Sheet look="paper" level={3} title={matter.title} kicker={matter.daysLeft <= 1 ? 'Lapses tonight' : `Lapses in ${matter.daysLeft} days`}>
      <p>{matter.description}</p>
      {matter.note && (
        <blockquote className="world__note">
          <p>{matter.note}</p>
        </blockquote>
      )}
      {matter.advice && (
        <p className="small">
          <span className="label soft">The Foreign Ministry advises</span> {matter.advice.label}. {matter.advice.reason}
        </p>
      )}
      <div className="row world__options">
        {matter.options.map((o) => (
          <Button key={o.id} size="small" look={matter.advice?.option === o.id ? 'primary' : 'secondary'} disabled={busy} onClick={() => onChoose(o.id, o.label)}>
            {o.label}
          </Button>
        ))}
      </div>
      <p className="small soft">If nobody decides, it lapses to: {matter.options.find((o) => o.lapse)?.label ?? 'nothing'}.</p>
    </Sheet>
  )
}

function NationList({ rows, busy, onAct }: { rows: NationRow[]; busy: boolean; onAct(action: WorldAction, what: string): Promise<void> }) {
  return (
    <ul className="indicators">
      {rows.map((row) => (
        <li key={row.id} id={`nation-${row.id}`}>
          <details className="fold fold--row">
            <summary>
              <Bar
                label={row.name}
                name={`Relations with ${row.name}`}
                value={(row.standing + 100) / 2}
                valueText={row.mood}
                note={
                  <span className="small">
                    {row.free ? row.strength : 'Annexed'}
                    {row.status.length ? `. ${row.status.join('. ')}` : ''}
                    {row.important ? ' ' : ''}
                    {row.important && <Tag tone="accent">Watching you</Tag>}
                  </span>
                }
              />
            </summary>
            <div className="fold__body small stack">
              <p>{row.description}</p>
              <p>
                {row.form.charAt(0).toUpperCase() + row.form.slice(1)}, led by {row.leader}. By temperament {row.temperament}.
              </p>
              {row.memory.length > 0 && (
                <ul className="soft">
                  {row.memory.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}
              {row.free && (
                <div className="row">
                  <Button size="small" disabled={busy || !row.pact.allowed} title={row.pact.why} onClick={() => void onAct({ pact: row.id }, `A pact was offered to ${row.name}.`)}>
                    Offer a pact
                  </Button>
                  <Button size="small" look="danger" disabled={busy || !row.war.allowed} title={row.war.why} onClick={() => void onAct({ war: row.id }, `War was declared on ${row.name}.`)}>
                    Declare war
                  </Button>
                </div>
              )}
              {row.free && !row.war.allowed && row.war.why && <p className="soft">{row.war.why}</p>}
            </div>
          </details>
        </li>
      ))}
    </ul>
  )
}
