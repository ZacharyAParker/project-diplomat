import type { Current } from '../store/game.tsx'
import { useGame } from '../store/game.tsx'
import { ChangeList, Flag, LinkTo, Screen, Sheet } from '../ui/index.ts'

// Shown once, straight after the founding: what kind of country the answers made, and
// why each number starts where it does.
export function Morning({ current }: { current: Current }) {
  const { content } = useGame()
  const { state, nationClass } = current
  const { identity } = state
  const founding = state.timeline.find((entry) => entry.kind === 'founding')

  return (
    <Screen title="The first morning" kicker={`Day 1 in ${identity.capital}`} className="morning">
      <div className="morning__layout">
        <div className="morning__lead stack">
          <Flag flag={identity.flag} width="min(100%, 16rem)" label={`The flag of ${identity.name}`} />
          <Sheet kicker="What the world makes of it" title={nationClass.name}>
            <p className="lede">{nationClass.description}</p>
          </Sheet>
          {founding?.text && <p>{founding.text}</p>}
          <p className="morning__go">
            <LinkTo to={{ name: 'nation', id: current.id, page: 'desk' }} look="accent">
              To work
            </LinkTo>
          </p>
        </div>

        <Sheet kicker="How it starts" title="What your answers left behind" className="morning__changes">
          <ChangeList
            changes={founding?.changes ?? []}
            content={content}
            reason="shown"
            empty="Nothing out of the ordinary. The country starts where every country starts."
          />
        </Sheet>
      </div>
    </Screen>
  )
}
