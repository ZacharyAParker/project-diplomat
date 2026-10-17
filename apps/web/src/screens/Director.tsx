import { Fragment, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { DirectorMessage, OocEntry } from '../api.ts'
import { useGame, useStore, type Current } from '../store/game.tsx'
import { useAction } from '../store/useAction.ts'
import { Button, Dialog, LinkTo, Markdown, Notice, Screen, TextLink, useAnnounce } from '../ui/index.ts'
import { Loading, useLoad } from './gov/shared.tsx'

// The Director: the player's out-of-character partner, a Claude Code session run by the
// server. It sits outside the fiction, so it is drawn in the plain working face and never in
// the government's navy and gold. Its replies are Markdown, drawn by the safe renderer.

const time = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function Message({ message, nation }: { message: DirectorMessage; nation: string }) {
  if (message.role === 'activity') {
    return (
      <li className="director__activity small soft">
        {message.text}
      </li>
    )
  }
  const founder = message.role === 'founder'
  return (
    <li className={founder ? 'director__msg director__msg--founder' : 'director__msg director__msg--director'}>
      <p className="director__who label">
        {founder ? 'You' : 'The Director'}
        <span className="soft"> {time(message.at)}</span>
        {message.streaming && <span className="soft"> (still writing)</span>}
      </p>
      {founder ? (
        <p className="director__said">{message.text}</p>
      ) : message.text.trim() ? (
        <Markdown text={message.text} nation={nation} shift={2} className="director__reply" />
      ) : (
        <p className="soft small">Thinking.</p>
      )}
    </li>
  )
}

// While the Director is answering, ask after it every so often; stop when it has finished or
// the conversation is closed.
function useDirectorPolling(busy: boolean) {
  const store = useStore()
  useEffect(() => {
    if (!busy) return
    let stopped = false
    let asking = false
    const timer = window.setInterval(() => {
      if (stopped || asking) return
      asking = true
      store
        .pollDirector()
        .catch(() => undefined)
        .finally(() => {
          asking = false
        })
    }, store.directorPollMs)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [busy, store])
}

export function DirectorChat({ current, compact = false }: { current: Current; compact?: boolean }) {
  const game = useGame()
  const announce = useAnnounce()
  const action = useAction()
  const [text, setText] = useState('')
  const [resetting, setResetting] = useState(false)
  const inputId = useId()
  const end = useRef<HTMLLIElement>(null)
  const director = game.director
  const busy = director?.busy === true
  const { loadDirector } = game

  useEffect(() => {
    void loadDirector().catch(() => undefined)
  }, [loadDirector, current.id])

  useDirectorPolling(busy)

  const count = director?.messages.length ?? 0
  const last = director?.messages.at(-1)?.text.length ?? 0
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' })
  }, [count, last])

  const wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !busy) announce('The Director has answered.')
    wasBusy.current = busy
  }, [busy, announce])

  async function send(event?: FormEvent) {
    event?.preventDefault()
    const said = text.trim()
    if (!said || busy || action.busy) return
    const done = await action.run('send', async () => {
      await game.tellDirector(said)
      return true
    })
    if (done) setText('')
  }

  function keys(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send()
    }
  }

  async function reset() {
    setResetting(false)
    const done = await action.run('reset', async () => {
      await game.resetDirector()
      return true
    })
    if (done) announce('A new session has started. The transcript is kept.')
  }

  if (!director) {
    if (game.directorError) {
      return (
        <Notice tone="problem" title="The Director could not be asked">
          <p>{game.directorError}</p>
        </Notice>
      )
    }
    return <p className="soft small">Asking the server for the Director.</p>
  }

  return (
    <div className={compact ? 'director director--compact' : 'director'}>
      {!director.available && (
        <Notice tone="problem" title="The Director is not available">
          <p>{director.detail}</p>
          <p>
            The Director runs on Claude Code, whatever plays the bodies. It needs the claude command installed and
            signed in on this computer, and the Director switched on in{' '}
            <TextLink to={{ name: 'nation', id: current.id, page: 'settings' }}>Settings, under The AI</TextLink>.
          </p>
        </Notice>
      )}

      {director.messages.length === 0 ? (
        <p className="soft director__empty">
          Nothing said yet. The Director stands outside the fiction: ask it what the bodies are likely to do, have it
          run the government, or have it change the world by hand. Changes by hand go into the OOC log only.
        </p>
      ) : (
        <ol className="director__transcript" aria-label="The conversation with the Director">
          {director.messages.map((message) => (
            <Fragment key={message.id}>
              <Message message={message} nation={current.id} />
              {(game.cheats[message.id] ?? []).map((cheat) => (
                <li key={`cheat-${cheat.n}`} className="director__cheat small soft">
                  Cheat logged: {cheat.action}. {cheat.detail}{' '}
                  <TextLink to={{ name: 'nation', id: current.id, page: 'ooc' }}>In the OOC log, No. {cheat.n}</TextLink>
                </li>
              ))}
            </Fragment>
          ))}
          <li ref={end} className="director__end" aria-hidden="true" />
        </ol>
      )}

      <p className="small soft director__state" role="status">
        {busy ? 'The Director is answering.' : ''}
      </p>

      {(action.error || game.directorError) && (
        <Notice tone="problem" title="Not done">
          <p>{action.error ?? game.directorError}</p>
        </Notice>
      )}

      <form className="director__form stack" onSubmit={(event) => void send(event)}>
        <div className="field">
          <label className="field__label label" htmlFor={inputId}>
            Your message to the Director
          </label>
          <textarea
            id={inputId}
            className="field__input field__area"
            rows={compact ? 2 : 3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={keys}
            aria-describedby={`${inputId}-hint`}
          />
          <p id={`${inputId}-hint`} className="field__hint small soft">
            Enter sends. Shift and Enter starts a new line.
          </p>
        </div>
        <div className="row">
          <Button
            type="submit"
            look="primary"
            disabled={busy || action.busy !== null || !text.trim() || !director.available}
            aria-busy={action.busy === 'send'}
          >
            Send
          </Button>
          {busy && (
            <Button
              look="danger"
              onClick={() => void action.run('stop', () => game.stopDirector())}
              disabled={action.busy === 'stop'}
            >
              Stop
            </Button>
          )}
          <Button look="quiet" onClick={() => setResetting(true)} disabled={busy || action.busy !== null}>
            New session
          </Button>
        </div>
      </form>

      <Dialog
        open={resetting}
        title="Start a new session?"
        onClose={() => setResetting(false)}
        actions={
          <>
            <Button look="secondary" onClick={() => setResetting(false)}>
              Keep this one
            </Button>
            <Button look="primary" onClick={() => void reset()}>
              Start a new session
            </Button>
          </>
        }
      >
        <p>
          The Director starts afresh and forgets this conversation. The transcript so far is kept, here and on the
          server.
        </p>
      </Dialog>
    </div>
  )
}

function shown(value: unknown): string {
  if (value === undefined) return 'nothing'
  if (value === null) return 'none'
  if (typeof value === 'string') return value === '' ? '(empty)' : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

export function OocLog({ current }: { current: Current }) {
  const game = useGame()
  const announce = useAnnounce()
  const action = useAction()
  const [asking, setAsking] = useState<OocEntry | null>(null)
  const [undone, setUndone] = useState(0)
  const key = `${current.id}:${current.state.timeline.length}:${current.state.sandbox === true}:${game.director?.messages.length ?? 0}:${undone}`
  const log = useLoad(key, () => game.oocLog())

  async function undo(entry: OocEntry) {
    setAsking(null)
    const done = await action.run(`undo-${entry.n}`, async () => {
      await game.undoCheat(entry.n)
      return true
    })
    if (!done) return
    setUndone((n) => n + 1)
    announce(`Cheat No. ${entry.n} is undone.`)
  }

  return (
    <>
    {action.error && (
      <Notice tone="problem" title="Not undone">
        <p>{action.error}</p>
      </Notice>
    )}
    <Dialog
      open={asking !== null}
      title={asking ? `Undo cheat No. ${asking.n}?` : 'Undo it?'}
      onClose={() => setAsking(null)}
      actions={
        <>
          <Button look="secondary" onClick={() => setAsking(null)}>
            Leave it
          </Button>
          <Button look="primary" onClick={() => asking && void undo(asking)}>
            Undo it
          </Button>
        </>
      }
    >
      <p>
        The figures it changed go back to what they were before it. The undo is logged too. Anything that has
        happened since, because of it, stays as it happened.
      </p>
    </Dialog>
    <Loading loaded={log} what="The OOC log">
      {(entries: OocEntry[]) =>
        entries.length === 0 ? (
          <p className="soft">Nothing has been changed by hand. The world is as the rules made it.</p>
        ) : (
          <ol className="ooc">
            {entries.map((entry, i) => (
              <li key={`${entry.at}:${i}`} className="ooc__entry">
                <p className="ooc__head">
                  <span className="label">No. {entry.n}, day {entry.day}</span> <strong>{entry.action}</strong>{' '}
                  <span className="small soft">{time(entry.at)}</span>
                  {entry.undone && <span className="ooc__mark"> Undone</span>}
                  {entry.undoes !== undefined && <span className="ooc__mark"> Undoes No. {entry.undoes}</span>}
                </p>
                {entry.detail && <p className="small">{entry.detail}</p>}
                {entry.request && (
                  <blockquote className="ooc__request small">
                    <p>
                      <span className="soft">Asked for: </span>
                      {entry.request}
                    </p>
                  </blockquote>
                )}
                {entry.changes && entry.changes.length > 0 && (
                  <ul className="ooc__changes small">
                    {entry.changes.map((change, k) => (
                      <li key={k}>
                        {change.target}: {shown(change.from)} <span aria-hidden="true">→</span>
                        <span className="visually-hidden"> to</span> {shown(change.to)}
                      </li>
                    ))}
                  </ul>
                )}
                {!entry.undone && entry.undoes === undefined && (
                  <p>
                    <Button
                      size="small"
                      onClick={() => setAsking(entry)}
                      disabled={action.busy !== null}
                      aria-label={`Undo cheat No. ${entry.n}`}
                    >
                      Undo
                    </Button>
                  </p>
                )}
              </li>
            ))}
          </ol>
        )
      }
    </Loading>
    </>
  )
}

export function DirectorScreen({ current, tab }: { current: Current; tab: 'talk' | 'ooc' }) {
  return (
    <Screen
      title={tab === 'talk' ? 'The Director' : 'The OOC log'}
      kicker="Out of character"
      intro={
        tab === 'talk' ? (
          <p>Your partner outside the fiction. It runs the bodies, tells you plainly what it thinks, and cheats when asked.</p>
        ) : (
          <p>Every change made by hand, newest first. No body in the government can read it, and the record never mentions it.</p>
        )
      }
      className="director-screen"
    >
      <nav className="director__tabs row" aria-label="The Director">
        <LinkTo to={{ name: 'nation', id: current.id, page: 'director' }} look={tab === 'talk' ? 'primary' : 'quiet'} size="small" aria-current={tab === 'talk' ? 'page' : undefined}>
          Conversation
        </LinkTo>
        <LinkTo to={{ name: 'nation', id: current.id, page: 'ooc' }} look={tab === 'ooc' ? 'primary' : 'quiet'} size="small" aria-current={tab === 'ooc' ? 'page' : undefined}>
          OOC log
        </LinkTo>
      </nav>
      {tab === 'talk' ? <DirectorChat current={current} /> : <OocLog current={current} />}
    </Screen>
  )
}

// The same conversation in a panel beside the page, or a sheet along the bottom of a phone,
// so the Director can be asked while the desk or a document is in view.
export function DirectorDrawer({ current, onClose }: { current: Current; onClose(): void }) {
  return (
    <aside id="director-drawer" className="director-drawer" aria-labelledby="director-drawer-title">
      <header className="director-drawer__head">
        <h2 id="director-drawer-title" className="director-drawer__title">
          The Director <span className="small soft">out of character</span>
        </h2>
        <div className="row">
          <TextLink to={{ name: 'nation', id: current.id, page: 'director' }} className="small">
            Open in full
          </TextLink>
          <Button size="small" look="quiet" onClick={onClose}>
            Close
          </Button>
        </div>
      </header>
      <div className="director-drawer__body">
        <DirectorChat current={current} compact />
      </div>
    </aside>
  )
}
