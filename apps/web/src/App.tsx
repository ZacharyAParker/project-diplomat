import { useEffect, useState } from 'react'
import { DirectorDrawer, DirectorScreen } from './screens/Director.tsx'
import { version } from '../package.json'
import type { GovRoute, NationPage } from './logic/router.ts'
import { Admin } from './screens/Admin.tsx'
import { AiScreen } from './screens/Ai.tsx'
import { Desk } from './screens/Desk.tsx'
import { EMPTY_DRAFT, Founding } from './screens/Founding.tsx'
import { GovSite } from './screens/gov/GovSite.tsx'
import { Home } from './screens/Home.tsx'
import { Kit } from './screens/Kit.tsx'
import { Morning } from './screens/Morning.tsx'
import { Nation } from './screens/Nation.tsx'
import { Lost, Unreadable } from './screens/Other.tsx'
import { TheRecord } from './screens/Record.tsx'
import { Sandbox } from './screens/Sandbox.tsx'
import { Settings } from './screens/Settings.tsx'
import { useGame, type Current } from './store/game.tsx'
import { useRoute } from './store/route.ts'
import { Button, Notice, Shell, type AiLine } from './ui/index.ts'

function Colophon() {
  const { pack } = useGame().content
  return (
    <p>
      Project Diplomat {version}, playing {pack.name} {pack.version}. Not affiliated with NationStates or Max
      Barry.
    </p>
  )
}

// What the menu says about the AI, from the server's status.
function useAiLine(): AiLine | null {
  const { status } = useGame()
  if (!status) return null
  const { ai } = status
  if (ai.backend === 'none') return { state: 'off', detail: ai.detail }
  return { state: ai.ok ? 'on' : 'trouble', detail: ai.detail }
}

function NationPages({ current, page }: { current: Current; page: NationPage }) {
  if (page === 'morning') return <Morning current={current} />
  if (page === 'desk') return <Desk current={current} />
  if (page === 'nation') return <Nation current={current} />
  if (page === 'record') return <TheRecord current={current} />
  if (page === 'sandbox') return <Sandbox current={current} />
  if (page === 'director') return <DirectorScreen current={current} tab="talk" />
  if (page === 'ooc') return <DirectorScreen current={current} tab="ooc" />
  return <Settings current={current} />
}

// Everything before the Founder: open questions, unread letters, Words not yet confirmed.
export function waitingForFounder(current: Current): number {
  const government = current.government
  if (!government) return 0
  return (
    government.questions.filter((q) => q.status === 'open').length +
    government.letters.filter((l) => l.status === 'unread').length +
    government.words.filter((w) => !w.confirmed).length
  )
}

type NationAddress = { id: string; page: NationPage; gov?: undefined } | { id: string; page?: undefined; gov: GovRoute }

// Opens the nation named in the address, and shows either its page or what is wrong
// with it. The screens below it can rely on there being a nation.
function NationRoute({ address }: { address: NationAddress }) {
  const game = useGame()
  const ai = useAiLine()
  const { open, current, problem } = game
  const { id } = address
  // The Director's drawer stays open as the player moves between the nation's pages.
  const [talking, setTalking] = useState(false)

  useEffect(() => {
    void open(id)
  }, [open, id])

  if (problem?.id === id) {
    return (
      <Shell colophon={<Colophon />} ai={ai}>
        <Unreadable problem={problem} />
      </Shell>
    )
  }
  if (current?.id !== id) return <Shell colophon={<Colophon />} ai={ai}>{null}</Shell>

  const bodies = (current.government?.institutions.bodies ?? [])
    .filter((b) => b.kind !== 'ministry')
    .map((b) => ({ id: b.id, name: b.shortName.charAt(0).toUpperCase() + b.shortName.slice(1) }))
  const nation = {
    id,
    identity: current.state.identity,
    day: current.state.day,
    className: current.nationClass.name,
    support: current.support,
    electionIn: current.electionIn,
    sandbox: current.state.sandbox === true,
    latest: current.state.timeline
      .slice(-5)
      .reverse()
      .map((entry) => ({ day: entry.day, headline: entry.headline })),
    government: { bodies, waiting: waitingForFounder(current) },
  }
  const gov = address.gov
  const govKey = gov ? (gov.page === 'body' ? `body:${gov.body}` : gov.page) : undefined
  const page = address.page
  // On the Director's own screen the drawer would only repeat it.
  const ownScreen = page === 'director' || page === 'ooc'
  const tools = ownScreen ? undefined : (
    <Button
      size="small"
      look={talking ? 'primary' : 'secondary'}
      className="director-toggle"
      aria-expanded={talking}
      aria-controls="director-drawer"
      onClick={() => setTalking(!talking)}
    >
      {talking ? 'Close the Director' : 'Talk to the Director'}
    </Button>
  )
  return (
    <Shell
      nation={nation}
      page={page === 'morning' ? undefined : page}
      gov={govKey}
      ai={ai}
      tools={tools}
      drawer={talking && !ownScreen ? <DirectorDrawer current={current} onClose={() => setTalking(false)} /> : undefined}
      colophon={<Colophon />}
    >
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
      {gov ? (
        <GovSite key={govKey} route={gov} current={current} />
      ) : (
        <NationPages key={page} current={current} page={page!} />
      )}
    </Shell>
  )
}

export function App() {
  const route = useRoute()
  const ai = useAiLine()
  const [draft, setDraft] = useState(EMPTY_DRAFT)

  if (route.name === 'nation') return <NationRoute key={route.id} address={{ id: route.id, page: route.page }} />
  if (route.name === 'gov') return <NationRoute key={route.id} address={{ id: route.id, gov: route }} />
  return (
    <Shell colophon={<Colophon />} ai={ai}>
      {route.name === 'home' && <Home />}
      {route.name === 'found' && <Founding step={route.step} draft={draft} onDraft={setDraft} />}
      {route.name === 'ai' && <AiScreen />}
      {route.name === 'kit' && <Kit />}
      {route.name === 'admin' && <Admin />}
      {route.name === 'lost' && <Lost />}
    </Shell>
  )
}
