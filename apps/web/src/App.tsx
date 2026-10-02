import { useEffect, useState } from 'react'
import { version } from '../package.json'
import type { NationPage } from './logic/router.ts'
import { Desk } from './screens/Desk.tsx'
import { EMPTY_DRAFT, Founding } from './screens/Founding.tsx'
import { Home } from './screens/Home.tsx'
import { Kit } from './screens/Kit.tsx'
import { Morning } from './screens/Morning.tsx'
import { Nation } from './screens/Nation.tsx'
import { Lost, Unreadable } from './screens/Other.tsx'
import { TheRecord } from './screens/Record.tsx'
import { Settings } from './screens/Settings.tsx'
import { useGame, type Current } from './store/game.tsx'
import { useRoute } from './store/route.ts'
import { Button, Notice, Shell } from './ui/index.ts'

export interface AppProps {
  // False when the browser will not store anything, so the home screen can say so.
  persistent?: boolean
}

function Colophon() {
  const { pack } = useGame().content
  return (
    <p>
      Project Diplomat {version}, playing {pack.name} {pack.version}. Not affiliated with NationStates or Max
      Barry.
    </p>
  )
}

function NationPages({ current, page }: { current: Current; page: NationPage }) {
  if (page === 'morning') return <Morning current={current} />
  if (page === 'desk') return <Desk current={current} />
  if (page === 'nation') return <Nation current={current} />
  if (page === 'record') return <TheRecord current={current} />
  return <Settings current={current} />
}

// Opens the nation named in the address, and shows either its page or what is wrong
// with its save. The screens below it can rely on there being a nation.
function NationRoute({ id, page }: { id: string; page: NationPage }) {
  const game = useGame()
  const { open, current, problem } = game

  useEffect(() => {
    open(id)
  }, [open, id])

  if (problem?.id === id) {
    return (
      <Shell colophon={<Colophon />}>
        <Unreadable problem={problem} />
      </Shell>
    )
  }
  if (current?.id !== id) return <Shell colophon={<Colophon />}>{null}</Shell>

  const nation = {
    id,
    identity: current.state.identity,
    day: current.state.day,
    className: current.nationClass.name,
    support: current.support,
    electionIn: current.electionIn,
  }
  return (
    <Shell nation={nation} page={page === 'morning' ? undefined : page} colophon={<Colophon />}>
      {game.saveError && (
        <Notice tone="problem" title="Not saved">
          <p>{game.saveError}</p>
        </Notice>
      )}
      {game.notice && (
        <Notice
          title="Before you carry on"
          actions={
            <Button size="small" onClick={game.dismissNotice}>
              Understood
            </Button>
          }
        >
          <p>{game.notice}</p>
        </Notice>
      )}
      <NationPages key={page} current={current} page={page} />
    </Shell>
  )
}

export function App({ persistent = true }: AppProps) {
  const route = useRoute()
  const [draft, setDraft] = useState(EMPTY_DRAFT)

  if (route.name === 'nation') return <NationRoute key={route.id} id={route.id} page={route.page} />
  return (
    <Shell colophon={<Colophon />}>
      {route.name === 'home' && <Home persistent={persistent} />}
      {route.name === 'found' && <Founding step={route.step} draft={draft} onDraft={setDraft} />}
      {route.name === 'kit' && <Kit />}
      {route.name === 'lost' && <Lost />}
    </Shell>
  )
}
