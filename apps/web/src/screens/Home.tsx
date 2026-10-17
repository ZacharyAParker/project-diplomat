import { TERM_DAYS } from '@diplomat/engine'
import { useState } from 'react'
import { dayLabel, percent } from '../logic/changes.ts'
import type { Summary } from '../logic/saves.ts'
import { useGame } from '../store/game.tsx'
import type { MoveResult } from '../store/gameStore.ts'
import { useAction } from '../store/useAction.ts'
import { Button, FileButton, Flag, LinkTo, Notice, SandboxMark, Screen, TextLink } from '../ui/index.ts'

type Imported = { ok: true; text: string } | { ok: false; text: string } | null

function NationRow({ nation }: { nation: Summary }) {
  const to = { name: 'nation', id: nation.id, page: 'desk' } as const
  if (nation.problem) {
    return (
      <li className="nations__row nations__row--damaged">
        <Flag flag={nation.flag} width="3.75rem" />
        <div className="nations__text">
          <p className="nations__name">{nation.name}</p>
          <p className="small soft">{nation.problem}</p>
        </div>
        <LinkTo to={to} look="secondary" size="small">
          Look at it
        </LinkTo>
      </li>
    )
  }
  return (
    <li className="nations__row">
      <Flag flag={nation.flag} width="3.75rem" />
      <div className="nations__text">
        <p className="nations__name">
          <TextLink to={to}>{nation.name}</TextLink>
          {nation.sandbox && <SandboxMark id={nation.id} />}
        </p>
        <p className="label soft">
          {nation.className}
          <span aria-hidden="true"> / </span>
          <span className="visually-hidden">, </span>
          {dayLabel(nation.day)}
          <span aria-hidden="true"> / </span>
          <span className="visually-hidden">, </span>
          Support {percent(nation.support)}
        </p>
      </div>
      <LinkTo to={to} look="primary" size="small" aria-label={`Open ${nation.name}`}>
        Open
      </LinkTo>
    </li>
  )
}

// Saves from 0.5 are still in this browser. They are offered for moving to the server, and
// taken out of the browser only once the server has them.
function Legacy() {
  const game = useGame()
  const action = useAction()
  const [result, setResult] = useState<MoveResult | null>(null)
  const count = game.legacy.length

  if (count === 0 && !result) return null
  return (
    <Notice
      title={count > 0 ? 'Nations from an earlier version' : 'Moved'}
      actions={
        count > 0 && (
          <Button
            look="primary"
            size="small"
            disabled={action.busy !== null}
            aria-busy={action.busy !== null}
            onClick={() => void action.run('move', async () => setResult(await game.moveLegacy()))}
          >
            {action.busy ? 'Moving them' : count === 1 ? 'Move it to the server' : `Move all ${count} to the server`}
          </Button>
        )
      }
    >
      {count > 0 && (
        <p>
          This browser still holds {count === 1 ? 'a nation' : `${count} nations`} saved by version 0.5 (
          {game.legacy.map((save) => save.name).join(', ')}). The game now keeps nations on its server. Each one
          is removed from the browser only once the server has it.
        </p>
      )}
      {result && result.moved.length > 0 && <p>Moved {result.moved.join(', ')}.</p>}
      {result?.failed.map((failed) => (
        <p key={failed.name}>
          {failed.name} was not moved: {failed.problem} It is still in this browser.
        </p>
      ))}
      {action.error && <p>{action.error}</p>}
    </Notice>
  )
}

export function Home() {
  const game = useGame()
  const [imported, setImported] = useState<Imported>(null)

  async function importText(text: string | Error) {
    if (text instanceof Error) return setImported({ ok: false, text: text.message })
    const result = await game.importSave(text)
    if (!result.ok) return setImported({ ok: false, text: result.problem })
    setImported({ ok: true, text: `Imported ${result.name}. ${result.notice ?? ''}`.trim() })
  }

  const importNote = imported && (
    <Notice
      tone={imported.ok ? 'note' : 'problem'}
      title={imported.ok ? undefined : 'That file was not imported'}
    >
      <p>{imported.text}</p>
    </Notice>
  )

  if (!game.loaded) {
    return (
      <Screen title="Project Diplomat" className="home">
        <p className="soft">Asking the server for the nations.</p>
      </Screen>
    )
  }

  if (game.offline) {
    return (
      <Screen title="The server is not answering" className="home">
        <div className="stack measure">
          <Notice tone="problem" title="Nothing can be opened">
            <p>{game.offline}</p>
          </Notice>
          <p>
            <Button look="primary" onClick={() => void game.start()}>
              Try again
            </Button>
          </p>
        </div>
      </Screen>
    )
  }

  if (game.nations.length === 0) {
    return (
      <Screen
        title="Run a country"
        kicker="Vacancy"
        intro={<p>You have been put in charge of a small country. Nobody is quite sure how.</p>}
        className="home home--first"
      >
        <div className="stack measure">
          <Legacy />
          <p>
            Each morning a few problems arrive on your desk with people attached, all of whom are right. You
            pick one. The numbers move, and every one of them tells you why. Some of it comes back three weeks
            later, when you had forgotten.
          </p>
          <p>
            An Assembly argues, a Court rules, ministries write papers and the press writes about all of it. You
            are above the lot of them, which they will mention.
          </p>
          <p>
            Where the constitution holds elections, there is one every {TERM_DAYS} days unless it says otherwise. There
            is no way to win.
          </p>
          <p>
            <LinkTo to={{ name: 'found', step: 'identity' }} look="primary">
              Found a nation
            </LinkTo>
          </p>
          <p className="small soft">
            Already have one in a file?{' '}
            <FileButton look="quiet" size="small" onText={(text) => void importText(text)}>
              Import a save
            </FileButton>
          </p>
          {importNote}
        </div>
      </Screen>
    )
  }

  return (
    <Screen title="Your nations" kicker="On this server" className="home">
      <div className="stack">
        <Legacy />
        <ul className="nations">
          {game.nations.map((nation) => (
            <NationRow key={nation.id} nation={nation} />
          ))}
        </ul>
        <div className="row">
          <LinkTo to={{ name: 'found', step: 'identity' }} look="secondary">
            Found another
          </LinkTo>
          <FileButton look="secondary" onText={(text) => void importText(text)}>
            Import a save
          </FileButton>
        </div>
        {importNote}
      </div>
    </Screen>
  )
}
