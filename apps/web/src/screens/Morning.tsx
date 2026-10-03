import type { Current } from '../store/game.tsx'
import { useGame } from '../store/game.tsx'
import { ChangeList, Flag, LinkTo, Screen, Sheet } from '../ui/index.ts'

// How many of the founding's changes are shown before the fold.
const SHOWN = 6

// Shown once, straight after the founding: what kind of country the answers made, and
// why each number starts where it does.
export function Morning({ current }: { current: Current }) {
  const { content } = useGame()
  const { state, nationClass } = current
  const { identity } = state
  const founding = state.timeline.find((entry) => entry.kind === 'founding')
  const all = founding?.changes ?? []
  // The largest few first, in full. The rest wait behind a fold, so day one is not a wall.
  const ranked = [...all].sort((a, b) => Math.abs(b.by) - Math.abs(a.by))
  const first = all.filter((change) => ranked.indexOf(change) < SHOWN)
  const rest = all.filter((change) => ranked.indexOf(change) >= SHOWN)

  return (
    <Screen title="The first morning" kicker={`Day 1 in ${identity.capital}`} className="morning">
      <div className="morning__layout">
        <div className="morning__lead stack">
          <Flag flag={identity.flag} width="min(100%, 16rem)" label={`The flag of ${identity.name}`} />
          <Sheet title={nationClass.name}>
            <p className="lede">{nationClass.description}</p>
          </Sheet>
          {founding?.text && <p>{founding.text}</p>}
          <p className="morning__go">
            <LinkTo to={{ name: 'nation', id: current.id, page: 'desk' }} look="accent">
              To work
            </LinkTo>
          </p>
        </div>

        <Sheet title="What your answers left behind" className="morning__changes">
          <ChangeList
            changes={first}
            content={content}
            reason="shown"
            empty="Nothing out of the ordinary. The country starts where every country starts."
          />
          {rest.length > 0 && (
            <details className="paper__rest">
              <summary>The full list ({rest.length} more)</summary>
              <ChangeList changes={rest} content={content} reason="shown" />
            </details>
          )}
        </Sheet>
      </div>
    </Screen>
  )
}
