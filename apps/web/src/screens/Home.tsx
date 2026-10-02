import { TERM_DAYS } from '@diplomat/engine'
import { useState } from 'react'
import { dayLabel, percent } from '../logic/changes.ts'
import type { Summary } from '../logic/saves.ts'
import { useGame } from '../store/game.tsx'
import { FileButton, Flag, LinkTo, Notice, Screen, TextLink } from '../ui/index.ts'

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

export function Home({ persistent }: { persistent: boolean }) {
  const game = useGame()
  const [imported, setImported] = useState<Imported>(null)

  function importText(text: string | Error) {
    if (text instanceof Error) return setImported({ ok: false, text: text.message })
    const result = game.importSave(text)
    if (!result.ok) return setImported({ ok: false, text: result.problem })
    setImported({ ok: true, text: `Imported ${result.name}. ${result.notice ?? ''}`.trim() })
  }

  const storageNote = !persistent && (
    <Notice tone="problem" title="Nothing will be kept">
      <p>
        This browser will not let the game store anything, so a nation founded now is gone when the tab
        closes. Private windows often do this.
      </p>
    </Notice>
  )

  const importNote = imported && (
    <Notice
      tone={imported.ok ? 'note' : 'problem'}
      title={imported.ok ? undefined : 'That file was not imported'}
    >
      <p>{imported.text}</p>
    </Notice>
  )

  if (game.nations.length === 0) {
    return (
      <Screen
        title="Run a country"
        kicker="Vacancy"
        intro={<p>You have been put in charge of a small country. Nobody is quite sure how.</p>}
        className="home home--first"
      >
        <div className="stack measure">
          <p>
            Each morning a few problems arrive on your desk with people attached, all of whom are right. You
            pick one. The numbers move, and every one of them tells you why. Some of it comes back three weeks
            later, when you had forgotten.
          </p>
          <p>There is an election every {TERM_DAYS} days. There is no way to win.</p>
          {storageNote}
          <p>
            <LinkTo to={{ name: 'found', step: 'identity' }} look="primary">
              Found a nation
            </LinkTo>
          </p>
          <p className="small soft">
            Already have one in a file?{' '}
            <FileButton look="quiet" size="small" onText={importText}>
              Import a save
            </FileButton>
          </p>
          {importNote}
        </div>
      </Screen>
    )
  }

  return (
    <Screen title="Your nations" kicker="In this browser" className="home">
      <div className="stack">
        {storageNote}
        <ul className="nations">
          {game.nations.map((nation) => (
            <NationRow key={nation.id} nation={nation} />
          ))}
        </ul>
        <div className="row">
          <LinkTo to={{ name: 'found', step: 'identity' }} look="secondary">
            Found another
          </LinkTo>
          <FileButton look="secondary" onText={importText}>
            Import a save
          </FileButton>
        </div>
        {importNote}
      </div>
    </Screen>
  )
}
